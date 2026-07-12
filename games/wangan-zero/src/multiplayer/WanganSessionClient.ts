import { ROUTE_LENGTH_METERS, type DriveState } from "../drivingModel";
import { deadReckonDistanceMeters, reconcileDrive, type DriveReconciliation } from "./clientPrediction";
import type {
  RaceClientMessage,
  RaceInputMessage,
  RacePlayerSnapshot,
  RaceRivalSnapshot,
  RaceTrafficSnapshot,
  RaceServerMessage,
  RaceSessionSnapshot
} from "./protocol";
import { validatePlayerProfile, type PlayerProfile } from "./playerProfile";
import { WANGAN_SESSION_SOCKET_PATH } from "./socketConstants";

const PROFILE_STORAGE_KEY = "playloom.wangan-zero.player-profile.v1";
const RECONNECT_DELAY_MS = 1000;
const INPUT_INTERVAL_MS = 1000 / 30;

export type SessionConnectionState = "connecting" | "connected" | "error";

export interface SessionStatus {
  readonly connection: SessionConnectionState;
  readonly connectionMessage: string;
  readonly joined: boolean;
  readonly playerCount: number;
  readonly capacity: number;
}

export interface LocalRaceInput {
  readonly accelerate: boolean;
  readonly brake: boolean;
  readonly clutch: boolean;
  readonly shiftUp: boolean;
  readonly shiftDown: boolean;
  readonly selectGear: number | null;
  readonly steer: -1 | 0 | 1;
}

function createSessionId(): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `wangan-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function parseServerMessage(event: MessageEvent<string>): RaceServerMessage | null {
  try {
    return JSON.parse(event.data) as RaceServerMessage;
  } catch {
    return null;
  }
}

function wrappedLerp(from: number, to: number, ratio: number): number {
  const half = ROUTE_LENGTH_METERS * 0.5;
  const delta = ((to - from + half) % ROUTE_LENGTH_METERS + ROUTE_LENGTH_METERS) % ROUTE_LENGTH_METERS - half;
  return ((from + delta * ratio) % ROUTE_LENGTH_METERS + ROUTE_LENGTH_METERS) % ROUTE_LENGTH_METERS;
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio;
}

export class WanganSessionClient {
  private readonly sessionId = createSessionId();
  private readonly listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private destroyed = false;
  private connection: SessionConnectionState = "connecting";
  private connectionMessage = "Connecting to the global session…";
  private currentSnapshot: RaceSessionSnapshot | null = null;
  private previousSnapshot: RaceSessionSnapshot | null = null;
  private snapshotReceivedAt = 0;
  private snapshotIntervalMs = 50;
  private playerId: string | null = null;
  private desiredProfile: PlayerProfile | null = null;
  private pendingJoin: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private inputSequence = 0;
  private lastInput: LocalRaceInput | null = null;
  private lastInputSentAt = 0;

  constructor(private readonly socketPath = WANGAN_SESSION_SOCKET_PATH) {
    this.connect();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(): SessionStatus {
    return {
      connection: this.connection,
      connectionMessage: this.connectionMessage,
      joined: this.playerId !== null && this.getLocalPlayer() !== null,
      playerCount: this.currentSnapshot?.players.length ?? 0,
      capacity: this.currentSnapshot?.capacity ?? 12
    };
  }

  getSavedProfile(): PlayerProfile {
    try {
      const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) as Partial<PlayerProfile> : null;
      const validation = validatePlayerProfile(parsed ?? {});
      if (validation.ok && validation.profile) {
        return validation.profile;
      }
    } catch {
      // Storage is optional; privacy modes may deny access.
    }
    return { name: "", mainColor: "blue", accentColor: "yellow" };
  }

  async join(profile: PlayerProfile): Promise<void> {
    const validation = validatePlayerProfile(profile);
    if (!validation.ok || !validation.profile) {
      throw new Error(validation.reason ?? "Invalid player profile.");
    }
    if (this.connection !== "connected" || this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("The global session server is still connecting.");
    }

    this.desiredProfile = validation.profile;
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(validation.profile));
    } catch {
      // Joining does not depend on local storage.
    }
    this.pendingJoin?.reject(new Error("A newer join request replaced this one."));
    const result = new Promise<void>((resolve, reject) => {
      this.pendingJoin = { resolve, reject };
    });
    this.send({ type: "join_request", profile: validation.profile });
    return result;
  }

  leave(): void {
    this.send({ type: "leave_request" });
    this.playerId = null;
    this.desiredProfile = null;
    this.lastInput = null;
    this.pendingJoin?.reject(new Error("Join cancelled."));
    this.pendingJoin = null;
    this.emit();
  }

  getLocalPlayer(): RacePlayerSnapshot | null {
    return this.currentSnapshot?.players.find((player) => player.id === this.playerId) ?? null;
  }

  getRemotePlayers(now = performance.now()): readonly RacePlayerSnapshot[] {
    const current = this.currentSnapshot;
    if (!current) {
      return [];
    }
    const ratio = Math.min(1, Math.max(0, (now - this.snapshotReceivedAt) / Math.max(33, this.snapshotIntervalMs)));
    return current.players
      .filter((player) => player.id !== this.playerId)
      .map((player) => {
        const previous = this.previousSnapshot?.players.find((candidate) => candidate.id === player.id);
        if (!previous) {
          return player;
        }
        return {
          ...player,
          distanceMeters: wrappedLerp(previous.distanceMeters, player.distanceMeters, ratio),
          visualDistanceMeters: lerp(previous.visualDistanceMeters, player.visualDistanceMeters, ratio),
          speedKph: lerp(previous.speedKph, player.speedKph, ratio),
          rpm: lerp(previous.rpm, player.rpm, ratio),
          throttle: lerp(previous.throttle, player.throttle, ratio),
          brakePressure: lerp(previous.brakePressure, player.brakePressure, ratio),
          clutchPressure: lerp(previous.clutchPressure, player.clutchPressure, ratio),
          laneFraction: lerp(previous.laneFraction, player.laneFraction, ratio)
        };
      });
  }

  getRivals(now = performance.now()): readonly RaceRivalSnapshot[] {
    const current = this.currentSnapshot;
    if (!current) {
      return [];
    }
    const ratio = Math.min(1, Math.max(0, (now - this.snapshotReceivedAt) / Math.max(33, this.snapshotIntervalMs)));
    return current.rivals.map((rival) => {
      const previous = this.previousSnapshot?.rivals.find((candidate) => candidate.id === rival.id);
      if (!previous) {
        return rival;
      }
      return {
        ...rival,
        distanceMeters: wrappedLerp(previous.distanceMeters, rival.distanceMeters, ratio),
        speedKph: lerp(previous.speedKph, rival.speedKph, ratio),
        laneFraction: lerp(previous.laneFraction, rival.laneFraction, ratio)
      };
    });
  }

  getTraffic(now = performance.now()): readonly RaceTrafficSnapshot[] {
    const current = this.currentSnapshot;
    if (!current) {
      return [];
    }
    const ratio = Math.min(1, Math.max(0, (now - this.snapshotReceivedAt) / Math.max(33, this.snapshotIntervalMs)));
    return current.traffic.map((vehicle) => {
      const previous = this.previousSnapshot?.traffic.find((candidate) => candidate.id === vehicle.id);
      if (!previous) {
        return vehicle;
      }
      return {
        ...vehicle,
        distanceMeters: wrappedLerp(previous.distanceMeters, vehicle.distanceMeters, ratio),
        speedKph: lerp(previous.speedKph, vehicle.speedKph, ratio),
        laneFraction: lerp(previous.laneFraction, vehicle.laneFraction, ratio)
      };
    });
  }

  /**
   * Latest-snapshot world dead-reckoned to "now" for the local collision pass.
   * Contact geometry must stay inside one snapshot's time frame: the local
   * player's origin is the snapshot's own authoritative car (not the
   * reconciled prediction, which lags behind stale positions), and every body
   * advances by its speed over the snapshot age plus half a snapshot interval.
   * That forward bias lets the local exchange fire before the server's
   * pre-resolved snapshot (bumped cars arrive already clamped outside the
   * contact window) can bury the contact. The interpolated render getters are
   * unsuitable for this — they trail real time by design.
   */
  getContactWorld(now = performance.now()): {
    readonly originDistanceMeters: number;
    readonly players: readonly RacePlayerSnapshot[];
    readonly traffic: readonly RaceTrafficSnapshot[];
    readonly rivals: readonly RaceRivalSnapshot[];
  } | null {
    const current = this.currentSnapshot;
    const local = this.getLocalPlayer();
    if (!current || !local) {
      return null;
    }
    const ageSeconds = (now - this.snapshotReceivedAt + this.snapshotIntervalMs * 0.5) / 1000;
    return {
      originDistanceMeters: deadReckonDistanceMeters(local.distanceMeters, local.speedKph, ageSeconds),
      players: current.players
        .filter((player) => player.id !== this.playerId)
        .map((player) => ({
          ...player,
          distanceMeters: deadReckonDistanceMeters(
            player.distanceMeters,
            player.speedKph,
            ageSeconds
          )
        })),
      traffic: current.traffic.map((vehicle) => ({
        ...vehicle,
        distanceMeters: deadReckonDistanceMeters(vehicle.distanceMeters, vehicle.speedKph, ageSeconds)
      })),
      rivals: current.rivals.map((rival) => ({
        ...rival,
        distanceMeters: deadReckonDistanceMeters(rival.distanceMeters, rival.speedKph, ageSeconds)
      }))
    };
  }

  sendInput(input: LocalRaceInput, now = performance.now()): void {
    if (!this.getLocalPlayer() || this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    const discrete = input.shiftUp || input.shiftDown || input.selectGear !== null || input.steer !== 0;
    const continuousChanged = !this.lastInput ||
      input.accelerate !== this.lastInput.accelerate ||
      input.brake !== this.lastInput.brake ||
      input.clutch !== this.lastInput.clutch;
    if (!discrete && !continuousChanged && now - this.lastInputSentAt < INPUT_INTERVAL_MS) {
      return;
    }
    const message: RaceInputMessage = {
      type: "race_input",
      sequence: ++this.inputSequence,
      ...input
    };
    this.send(message);
    this.lastInput = { ...input, shiftUp: false, shiftDown: false, selectGear: null, steer: 0 };
    this.lastInputSentAt = now;
  }

  reconcileDriveState(predicted: DriveState, dt: number, impactHoldActive = false): DriveReconciliation {
    const authoritative = this.getLocalPlayer();
    if (!authoritative) {
      return { state: predicted, snappedSpeedDeltaKph: 0 };
    }
    return reconcileDrive(predicted, this.driveStateFrom(authoritative), dt, impactHoldActive);
  }

  localDriveState(): DriveState | null {
    const player = this.getLocalPlayer();
    return player ? this.driveStateFrom(player) : null;
  }

  private driveStateFrom(player: RacePlayerSnapshot): DriveState {
    const {
      speedKph, throttle, brakePressure, clutchPressure, distanceMeters,
      visualDistanceMeters, elapsedSeconds, gear, rpm, shiftTimer,
      revLimiterActive, maxSpeedKph, finished
    } = player;
    return {
      speedKph, throttle, brakePressure, clutchPressure, distanceMeters,
      visualDistanceMeters, elapsedSeconds, gear, rpm, shiftTimer,
      revLimiterActive, maxSpeedKph, finished
    };
  }

  private connect(): void {
    if (this.destroyed || this.socket?.readyState === WebSocket.CONNECTING || this.socket?.readyState === WebSocket.OPEN) {
      return;
    }
    this.connection = "connecting";
    this.connectionMessage = "Connecting to the global session…";
    this.emit();
    const url = new URL(this.socketPath, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("session", this.sessionId);
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.connection = "connected";
      this.connectionMessage = "Global session online";
      this.emit();
      if (this.desiredProfile) {
        this.send({ type: "join_request", profile: this.desiredProfile });
      }
    });
    socket.addEventListener("message", (event) => this.handleMessage(event));
    socket.addEventListener("close", () => this.handleDisconnect());
    socket.addEventListener("error", () => this.handleDisconnect());
  }

  private handleMessage(event: MessageEvent<string>): void {
    const message = parseServerMessage(event);
    if (!message) {
      return;
    }
    if (message.type === "join_rejected") {
      this.playerId = null;
      this.pendingJoin?.reject(new Error(message.reason));
      this.pendingJoin = null;
      this.desiredProfile = null;
      this.emit();
      return;
    }
    if (message.type === "join_accepted") {
      this.playerId = message.playerId;
      this.acceptSnapshot(message.snapshot);
      this.pendingJoin?.resolve();
      this.pendingJoin = null;
      return;
    }
    this.acceptSnapshot(message.snapshot);
  }

  private acceptSnapshot(snapshot: RaceSessionSnapshot): void {
    const now = performance.now();
    if (this.currentSnapshot) {
      this.snapshotIntervalMs = Math.max(33, Math.min(150, now - this.snapshotReceivedAt));
    }
    this.previousSnapshot = this.currentSnapshot;
    this.currentSnapshot = snapshot;
    this.snapshotReceivedAt = now;
    this.emit();
  }

  private handleDisconnect(): void {
    if (this.destroyed || this.socket === null) {
      return;
    }
    this.socket = null;
    this.connection = "error";
    this.connectionMessage = "Session connection lost. Reconnecting…";
    this.playerId = null;
    this.currentSnapshot = null;
    this.previousSnapshot = null;
    this.emit();
    if (this.reconnectTimer === null) {
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, RECONNECT_DELAY_MS);
    }
  }

  private send(message: RaceClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
