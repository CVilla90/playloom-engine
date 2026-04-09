import {
  AuthoritativePublicMatch,
  type AuthoritativePublicMatchOptions
} from "./AuthoritativePublicMatch";
import type {
  JoinAttempt,
  LocalPlayerSyncState,
  LocalStalkerSyncState,
  PublicRoomService,
  RoomActionResult
} from "./PublicRoomService";
import { sanitizePlayerName, validatePlayerName } from "./roomModel";
import type {
  JoinValidation,
  PublicRoomSnapshot
} from "./publicRoomTypes";
import type {
  MatchPunchResult,
  MatchPlayerSnapshot,
  MatchSnapshot,
  MatchStalkerSnapshot
} from "./protocol";

const LAST_NAME_KEY = "playloom.backrooms-breaker-floor.public-room.last-name.v1";
const PRIMARY_STALKER_ID = "stalker-primary";

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

export class LocalAuthoritativePublicRoomService implements PublicRoomService {
  private readonly sessionId = createSessionId();
  private readonly match: AuthoritativePublicMatch;
  private preferredName = "";
  private snapshot: PublicRoomSnapshot;
  private matchSnapshot: MatchSnapshot | null = null;
  private pendingLocalPunchResults: MatchPunchResult[] = [];

  constructor(options: AuthoritativePublicMatchOptions = {}) {
    const now = options.now ?? Date.now();
    this.match = new AuthoritativePublicMatch(options);
    this.preferredName = this.loadPreferredName();
    this.snapshot = this.match.getRoomSnapshot(this.sessionId, now);
    this.matchSnapshot = this.match.getSnapshot(now);
  }

  destroy(): void {
    this.leave();
  }

  tick(now = Date.now()): void {
    this.match.tick(now);
    this.refresh(now);
  }

  getSnapshot(): PublicRoomSnapshot {
    return this.snapshot;
  }

  getMatchSnapshot(): MatchSnapshot | null {
    return this.matchSnapshot;
  }

  getLocalPlayerMatchSnapshot(): MatchPlayerSnapshot | null {
    return this.matchSnapshot?.players.find((player) => player.id === this.sessionId) ?? null;
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

    const now = Date.now();
    const result = this.match.joinPlayer({
      id: this.sessionId,
      name: validation.trimmedName
    }, now);
    this.refresh(now);
    return {
      ok: result.ok,
      reason: result.reason
    };
  }

  leave(): void {
    const now = Date.now();
    this.match.removePlayer(this.sessionId, now);
    this.pendingLocalPunchResults = [];
    this.refresh(now);
  }

  syncLocalPlayerState(state: LocalPlayerSyncState, now = Date.now()): MatchPlayerSnapshot | null {
    const result = this.match.syncPlayerState(this.sessionId, state, now);
    this.refresh(now);
    return result.value;
  }

  syncPrimaryStalkerState(state: LocalStalkerSyncState, now = Date.now()): MatchStalkerSnapshot | null {
    const result = this.match.syncStalkerState(PRIMARY_STALKER_ID, state, now);
    this.refresh(now);
    return result.value;
  }

  submitPunch(facing: { x: number; y: number }, now = Date.now()): RoomActionResult<MatchPunchResult> {
    const result = this.match.submitPunch(this.sessionId, facing, now);
    this.refresh(now);
    if (result.value) {
      this.pendingLocalPunchResults.push(result.value);
    }
    return {
      ok: result.ok,
      reason: result.reason,
      value: result.value
    };
  }

  collectPickup(pickupId: string, now = Date.now()): RoomActionResult<MatchSnapshot> {
    const result = this.match.collectPickup(this.sessionId, pickupId, now);
    this.refresh(now);
    return {
      ok: result.ok,
      reason: result.reason,
      value: result.ok ? this.matchSnapshot : null
    };
  }

  collectRelay(relayId: string, now = Date.now()): RoomActionResult<MatchSnapshot> {
    const result = this.match.collectRelay(this.sessionId, relayId, now);
    this.refresh(now);
    return {
      ok: result.ok,
      reason: result.reason,
      value: result.ok ? this.matchSnapshot : null
    };
  }

  activatePanel(panelId: string, now = Date.now()): RoomActionResult<MatchSnapshot> {
    const result = this.match.activatePanel(this.sessionId, panelId, now);
    this.refresh(now);
    return {
      ok: result.ok,
      reason: result.reason,
      value: result.ok ? this.matchSnapshot : null
    };
  }

  startExtraction(now = Date.now()): RoomActionResult<MatchSnapshot> {
    const result = this.match.startExtraction(this.sessionId, now);
    this.refresh(now);
    return {
      ok: result.ok,
      reason: result.reason,
      value: result.ok ? this.matchSnapshot : null
    };
  }

  applyLocalPlayerDamage(amount: number, now = Date.now()): RoomActionResult<MatchPlayerSnapshot> {
    const result = this.match.applyPlayerDamage(this.sessionId, amount, now);
    this.refresh(now);
    return {
      ok: result.ok,
      reason: result.reason,
      value: result.value
    };
  }

  applyPrimaryStalkerDamage(amount: number, now = Date.now()): RoomActionResult<MatchStalkerSnapshot> {
    const result = this.match.applyStalkerDamage(PRIMARY_STALKER_ID, amount, now);
    this.refresh(now);
    return {
      ok: result.ok,
      reason: result.reason,
      value: result.value
    };
  }

  private loadPreferredName(): string {
    return storage()?.getItem(LAST_NAME_KEY) ?? "";
  }

  private savePreferredName(name: string): void {
    storage()?.setItem(LAST_NAME_KEY, name);
  }

  private refresh(now: number): void {
    this.matchSnapshot = this.match.getSnapshot(now);
    this.snapshot = this.match.getRoomSnapshot(this.sessionId, now);
  }
}
