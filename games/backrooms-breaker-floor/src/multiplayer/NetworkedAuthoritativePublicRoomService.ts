import type {
  JoinAttempt,
  LocalPlayerSyncState,
  LocalStalkerSyncState,
  PublicRoomService,
  RoomActionResult
} from "./PublicRoomService";
import type {
  JoinValidation,
  PublicRoomSnapshot,
  PublicRoomTransportState
} from "./publicRoomTypes";
import {
  buildAuthoritativePublicRoomSnapshot,
  sanitizePlayerName,
  validatePlayerName
} from "./roomModel";
import type {
  ClientMessage,
  MatchPunchResult,
  MatchPlayerSnapshot,
  MatchSnapshot,
  MatchStalkerSnapshot,
  ServerMessage
} from "./protocol";
import {
  buildPredictedLocalPlayerSnapshot,
  reconcilePredictedLocalPlayerSnapshot,
  shouldSendInputUpdate
} from "./networkClientPrediction";
import { BACKROOMS_MATCH_SOCKET_PATH } from "./socketConstants";

const LAST_NAME_KEY = "playloom.backrooms-breaker-floor.public-room.last-name.v1";
const RECONNECT_DELAY_MS = 1000;

function createSessionId(): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return `session-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function storage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function readServerMessage(raw: MessageEvent<string>): ServerMessage | null {
  try {
    return JSON.parse(raw.data) as ServerMessage;
  } catch {
    return null;
  }
}

export interface NetworkedAuthoritativePublicRoomServiceOptions {
  readonly socketPath?: string;
}

export class NetworkedAuthoritativePublicRoomService implements PublicRoomService {
  private readonly sessionId = createSessionId();
  private readonly socketPath: string;
  private preferredName = "";
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private destroyed = false;
  private pendingJoinName: string | null = null;
  private joinError: string | null = null;
  private transportState: PublicRoomTransportState = "connecting";
  private transportError: string | null = "Connecting to the public room server.";
  private matchSnapshot: MatchSnapshot | null = null;
  private predictedLocalPlayerSnapshot: MatchPlayerSnapshot | null = null;
  private lastSentInputState: LocalPlayerSyncState | null = null;
  private lastSentInputAt = 0;
  private pendingLocalPunchResults: MatchPunchResult[] = [];
  private snapshot: PublicRoomSnapshot;

  constructor(options: NetworkedAuthoritativePublicRoomServiceOptions = {}) {
    this.socketPath = options.socketPath ?? BACKROOMS_MATCH_SOCKET_PATH;
    this.preferredName = this.loadPreferredName();
    this.snapshot = this.buildSnapshot();
    this.connect();
  }

  destroy(): void {
    this.destroyed = true;
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = null;
  }

  tick(): void {
    if (!this.destroyed && this.socket === null && this.reconnectTimer === null) {
      this.connect();
    }
  }

  getSnapshot(): PublicRoomSnapshot {
    return this.snapshot;
  }

  getMatchSnapshot(): MatchSnapshot | null {
    return this.matchSnapshot;
  }

  getLocalPlayerMatchSnapshot(): MatchPlayerSnapshot | null {
    return this.predictedLocalPlayerSnapshot ?? this.authoritativeLocalPlayerSnapshot();
  }

  consumeLocalPunchResults(): readonly MatchPunchResult[] {
    const results = this.pendingLocalPunchResults;
    this.pendingLocalPunchResults = [];
    return results;
  }

  getPreferredName(): string {
    return this.preferredName;
  }

  setPreferredName(name: string): JoinValidation {
    const validation = validatePlayerName(name);
    this.preferredName = sanitizePlayerName(name);
    this.savePreferredName(this.preferredName);
    this.refreshSnapshot();
    return validation;
  }

  join(name: string): JoinAttempt {
    const validation = this.setPreferredName(name);
    if (!validation.ok) {
      return {
        ok: false,
        reason: validation.reason
      };
    }

    this.pendingJoinName = validation.trimmedName;
    this.joinError = null;
    this.refreshSnapshot();
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send({
        type: "join_request",
        name: validation.trimmedName
      });
    } else {
      this.connect();
    }

    return {
      ok: true,
      reason: null
    };
  }

  leave(): void {
    this.pendingJoinName = null;
    this.joinError = null;
    this.predictedLocalPlayerSnapshot = null;
    this.lastSentInputState = null;
    this.lastSentInputAt = 0;
    this.pendingLocalPunchResults = [];
    if (this.matchSnapshot) {
      this.matchSnapshot = {
        ...this.matchSnapshot,
        players: this.matchSnapshot.players.filter((player) => player.id !== this.sessionId)
      };
    }
    this.send({
      type: "leave_request"
    });
    this.refreshSnapshot();
  }

  syncLocalPlayerState(state: LocalPlayerSyncState, now = Date.now()): MatchPlayerSnapshot | null {
    this.predictedLocalPlayerSnapshot = buildPredictedLocalPlayerSnapshot(this.authoritativeLocalPlayerSnapshot(), state);
    if (
      this.canSendGameplayActions()
      && shouldSendInputUpdate(state, this.lastSentInputState, now, this.lastSentInputAt)
    ) {
      this.send({
        type: "input_update",
        x: state.x,
        y: state.y,
        move: state.move,
        facing: state.facing,
        flashlightOn: state.flashlightOn,
        wantsInteract: state.wantsInteract,
        wantsPunch: state.wantsPunch
      });
      this.lastSentInputState = {
        x: state.x,
        y: state.y,
        move: { ...state.move },
        facing: { ...state.facing },
        flashlightOn: state.flashlightOn,
        wantsInteract: state.wantsInteract,
        wantsPunch: state.wantsPunch
      };
      this.lastSentInputAt = now;
    }
    return this.getLocalPlayerMatchSnapshot();
  }

  syncPrimaryStalkerState(_state: LocalStalkerSyncState, _now = Date.now()): MatchStalkerSnapshot | null {
    return this.matchSnapshot?.stalkers[0] ?? null;
  }

  submitPunch(facing: { x: number; y: number }, _now = Date.now()): RoomActionResult<MatchPunchResult> {
    if (!this.canSendGameplayActions()) {
      return {
        ok: false,
        reason: this.transportError ?? this.joinError ?? "Public room connection is unavailable.",
        value: null
      };
    }

    this.send({
      type: "punch_request",
      facing
    });
    return {
      ok: true,
      reason: null,
      value: null
    };
  }

  collectPickup(pickupId: string, _now = Date.now()): RoomActionResult<MatchSnapshot> {
    return this.sendInteractionRequest("pickup", pickupId);
  }

  collectRelay(relayId: string, _now = Date.now()): RoomActionResult<MatchSnapshot> {
    return this.sendInteractionRequest("relay", relayId);
  }

  activatePanel(panelId: string, _now = Date.now()): RoomActionResult<MatchSnapshot> {
    return this.sendInteractionRequest("panel", panelId);
  }

  startExtraction(_now = Date.now()): RoomActionResult<MatchSnapshot> {
    return this.sendInteractionRequest("exit", "exit-terminal");
  }

  applyLocalPlayerDamage(_amount: number, _now = Date.now()): RoomActionResult<MatchPlayerSnapshot> {
    return {
      ok: false,
      reason: "Damage is resolved by the authoritative room server.",
      value: null
    };
  }

  applyPrimaryStalkerDamage(_amount: number, _now = Date.now()): RoomActionResult<MatchStalkerSnapshot> {
    return {
      ok: false,
      reason: "Damage is resolved by the authoritative room server.",
      value: null
    };
  }

  private connect(): void {
    if (this.destroyed || typeof window === "undefined") {
      return;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.clearReconnectTimer();
    this.transportState = "connecting";
    this.transportError = "Connecting to the public room server.";
    this.refreshSnapshot();

    const socketUrl = new URL(this.socketPath, window.location.href);
    socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
    socketUrl.searchParams.set("session", this.sessionId);

    const socket = new WebSocket(socketUrl);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.transportState = "connected";
      this.transportError = null;
      this.refreshSnapshot();
      if (this.pendingJoinName) {
        this.send({
          type: "join_request",
          name: this.pendingJoinName
        });
      }
    });
    socket.addEventListener("message", (event) => {
      this.handleServerMessage(event);
    });
    socket.addEventListener("close", () => {
      this.handleDisconnect();
    });
    socket.addEventListener("error", () => {
      this.handleDisconnect();
    });
  }

  private handleServerMessage(event: MessageEvent<string>): void {
    const message = readServerMessage(event);
    if (!message) {
      return;
    }

    switch (message.type) {
      case "join_accepted":
        this.pendingJoinName = null;
        this.joinError = null;
        this.matchSnapshot = message.snapshot;
        break;
      case "join_rejected":
        this.pendingJoinName = null;
        this.joinError = message.reason;
        this.predictedLocalPlayerSnapshot = null;
        break;
      case "snapshot":
        this.matchSnapshot = message.snapshot;
        if (this.matchSnapshot.players.some((player) => player.id === this.sessionId)) {
          this.joinError = null;
        }
        break;
      case "phase_changed":
        this.matchSnapshot = message.snapshot;
        break;
      case "status_message":
        if (this.matchSnapshot) {
          this.matchSnapshot = {
            ...this.matchSnapshot,
            statusBanner: message.banner
          };
        }
        break;
      case "round_results":
        if (this.matchSnapshot) {
          this.matchSnapshot = {
            ...this.matchSnapshot,
            results: message.results
          };
        }
        break;
      case "punch_resolved":
        this.pendingLocalPunchResults.push(message.result);
        break;
    }

    this.predictedLocalPlayerSnapshot = reconcilePredictedLocalPlayerSnapshot(
      this.authoritativeLocalPlayerSnapshot(),
      this.predictedLocalPlayerSnapshot
    );
    this.refreshSnapshot();
  }

  private handleDisconnect(): void {
    if (this.destroyed) {
      return;
    }

    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.onopen = null;
    }
    this.socket = null;
    this.matchSnapshot = null;
    this.predictedLocalPlayerSnapshot = null;
    this.lastSentInputState = null;
    this.lastSentInputAt = 0;
    this.pendingLocalPunchResults = [];
    this.transportState = "connecting";
    this.transportError = "Disconnected from the public room server. Retrying...";
    this.refreshSnapshot();
    if (this.reconnectTimer === null) {
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, RECONNECT_DELAY_MS);
    }
  }

  private canSendGameplayActions(): boolean {
    return this.socket?.readyState === WebSocket.OPEN && this.authoritativeLocalPlayerSnapshot() !== null;
  }

  private authoritativeLocalPlayerSnapshot(): MatchPlayerSnapshot | null {
    return this.matchSnapshot?.players.find((player) => player.id === this.sessionId) ?? null;
  }

  private sendInteractionRequest(
    targetKind: "pickup" | "relay" | "panel" | "exit",
    targetId: string
  ): RoomActionResult<MatchSnapshot> {
    if (!this.canSendGameplayActions()) {
      return {
        ok: false,
        reason: this.transportError ?? this.joinError ?? "Public room connection is unavailable.",
        value: null
      };
    }

    this.send({
      type: "interaction_request",
      targetKind,
      targetId
    });
    return {
      ok: true,
      reason: null,
      value: null
    };
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private buildSnapshot(): PublicRoomSnapshot {
    return buildAuthoritativePublicRoomSnapshot({
      matchSnapshot: this.matchSnapshot,
      now: Date.now(),
      localPlayerId: this.sessionId,
      preferredName: this.preferredName,
      transportState: this.transportState,
      transportError: this.transportError,
      joinRequestPending: this.pendingJoinName !== null,
      joinError: this.joinError
    });
  }

  private refreshSnapshot(): void {
    this.snapshot = this.buildSnapshot();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private loadPreferredName(): string {
    return storage()?.getItem(LAST_NAME_KEY) ?? "";
  }

  private savePreferredName(name: string): void {
    storage()?.setItem(LAST_NAME_KEY, name);
  }
}
