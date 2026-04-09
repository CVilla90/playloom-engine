import type {
  JoinAttempt,
  LocalPlayerSyncState,
  LocalStalkerSyncState,
  PublicRoomService,
  RoomActionResult
} from "./PublicRoomService";
import {
  buildPublicRoomSnapshot,
  normalizePlayerName,
  sanitizePlayerName,
  validatePlayerName
} from "./roomModel";
import { ROOM_PRESENCE_TTL_MS } from "./publicRoomTypes";
import type {
  JoinValidation,
  PublicRoomMeta,
  PublicRoomSnapshot,
  RoomPresence
} from "./publicRoomTypes";
import type {
  MatchPunchResult,
  MatchPlayerSnapshot,
  MatchSnapshot,
  MatchStalkerSnapshot
} from "./protocol";

const ROOM_META_KEY = "playloom.backrooms-breaker-floor.public-room.meta.v1";
const ROOM_PRESENCE_PREFIX = "playloom.backrooms-breaker-floor.public-room.presence.";
const LAST_NAME_KEY = "playloom.backrooms-breaker-floor.public-room.last-name.v1";
const SNAPSHOT_REFRESH_MS = 250;

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function presenceKey(sessionId: string): string {
  return `${ROOM_PRESENCE_PREFIX}${sessionId}`;
}

function isPresenceKey(key: string): boolean {
  return key.startsWith(ROOM_PRESENCE_PREFIX);
}

export class LocalPublicRoomService implements PublicRoomService {
  private readonly sessionId = createSessionId();
  private preferredName = "";
  private snapshot: PublicRoomSnapshot;
  private joinedName: string | null = null;
  private lastWriteAt = 0;
  private lastRefreshAt = 0;

  private readonly handleStorageEvent = (event: StorageEvent): void => {
    if (!event.key || event.key === ROOM_META_KEY || isPresenceKey(event.key) || event.key === LAST_NAME_KEY) {
      this.rebuildSnapshot(Date.now());
    }
  };

  constructor() {
    this.preferredName = this.loadPreferredName();
    this.snapshot = buildPublicRoomSnapshot({
      players: [],
      meta: null,
      now: Date.now(),
      localPlayerId: this.sessionId
    });
    window.addEventListener("storage", this.handleStorageEvent);
    this.rebuildSnapshot(Date.now());
  }

  destroy(): void {
    this.leave();
    window.removeEventListener("storage", this.handleStorageEvent);
  }

  tick(now = Date.now()): void {
    if (this.joinedName && now - this.lastWriteAt >= SNAPSHOT_REFRESH_MS) {
      this.writeOwnPresence(now);
    }

    if (now - this.lastRefreshAt >= SNAPSHOT_REFRESH_MS) {
      this.rebuildSnapshot(now);
    }
  }

  getSnapshot(): PublicRoomSnapshot {
    return this.snapshot;
  }

  getMatchSnapshot(): MatchSnapshot | null {
    return null;
  }

  getLocalPlayerMatchSnapshot(): MatchPlayerSnapshot | null {
    return null;
  }

  consumeLocalPunchResults(): readonly MatchPunchResult[] {
    return [];
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
    this.rebuildSnapshot(now);
    const currentSnapshot = this.snapshot;
    if (!currentSnapshot.isJoinable) {
      return {
        ok: false,
        reason: currentSnapshot.waitReason ?? "Current room is not joinable right now."
      };
    }

    const duplicateName = currentSnapshot.players.some(
      (player) => player.normalizedName === validation.normalizedName && player.sessionId !== this.sessionId
    );
    if (duplicateName) {
      return {
        ok: false,
        reason: "That name is already in the room. Choose another one."
      };
    }

    this.joinedName = validation.trimmedName;
    this.writeOwnPresence(now);
    this.rebuildSnapshot(now);

    if (!this.snapshot.localPlayerJoined || normalizePlayerName(this.snapshot.localPlayerName ?? "") !== validation.normalizedName) {
      this.removeOwnPresence();
      this.joinedName = null;
      this.rebuildSnapshot(now);
      return {
        ok: false,
        reason: "That name was claimed at the same time. Choose another one."
      };
    }

    return {
      ok: true,
      reason: null
    };
  }

  leave(): void {
    this.removeOwnPresence();
    this.joinedName = null;
    this.rebuildSnapshot(Date.now());
  }

  syncLocalPlayerState(_state: LocalPlayerSyncState, _now = Date.now()): MatchPlayerSnapshot | null {
    return null;
  }

  syncPrimaryStalkerState(_state: LocalStalkerSyncState, _now = Date.now()): MatchStalkerSnapshot | null {
    return null;
  }

  submitPunch(_facing: { x: number; y: number }, _now = Date.now()): RoomActionResult<MatchPunchResult> {
    return {
      ok: false,
      reason: "Authoritative gameplay is unavailable in this room service.",
      value: null
    };
  }

  collectPickup(_pickupId: string, _now = Date.now()): RoomActionResult<MatchSnapshot> {
    return {
      ok: false,
      reason: "Authoritative gameplay is unavailable in this room service.",
      value: null
    };
  }

  collectRelay(_relayId: string, _now = Date.now()): RoomActionResult<MatchSnapshot> {
    return {
      ok: false,
      reason: "Authoritative gameplay is unavailable in this room service.",
      value: null
    };
  }

  activatePanel(_panelId: string, _now = Date.now()): RoomActionResult<MatchSnapshot> {
    return {
      ok: false,
      reason: "Authoritative gameplay is unavailable in this room service.",
      value: null
    };
  }

  startExtraction(_now = Date.now()): RoomActionResult<MatchSnapshot> {
    return {
      ok: false,
      reason: "Authoritative gameplay is unavailable in this room service.",
      value: null
    };
  }

  applyLocalPlayerDamage(_amount: number, _now = Date.now()): RoomActionResult<MatchPlayerSnapshot> {
    return {
      ok: false,
      reason: "Authoritative gameplay is unavailable in this room service.",
      value: null
    };
  }

  applyPrimaryStalkerDamage(_amount: number, _now = Date.now()): RoomActionResult<MatchStalkerSnapshot> {
    return {
      ok: false,
      reason: "Authoritative gameplay is unavailable in this room service.",
      value: null
    };
  }

  private loadPreferredName(): string {
    return window.localStorage.getItem(LAST_NAME_KEY) ?? "";
  }

  private savePreferredName(name: string): void {
    window.localStorage.setItem(LAST_NAME_KEY, name);
  }

  private writeOwnPresence(now: number): void {
    if (!this.joinedName) {
      return;
    }

    const current = this.readOwnPresence();
    const presence: RoomPresence = {
      sessionId: this.sessionId,
      name: this.joinedName,
      normalizedName: normalizePlayerName(this.joinedName),
      joinedAt: current?.joinedAt ?? now,
      lastSeenAt: now
    };

    window.localStorage.setItem(presenceKey(this.sessionId), JSON.stringify(presence));
    this.lastWriteAt = now;
  }

  private removeOwnPresence(): void {
    window.localStorage.removeItem(presenceKey(this.sessionId));
  }

  private readOwnPresence(): RoomPresence | null {
    const raw = window.localStorage.getItem(presenceKey(this.sessionId));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as RoomPresence;
    } catch {
      return null;
    }
  }

  private readAllPresence(): RoomPresence[] {
    const players: RoomPresence[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !isPresenceKey(key)) {
        continue;
      }

      const raw = window.localStorage.getItem(key);
      if (!raw) {
        continue;
      }

      try {
        const player = JSON.parse(raw) as RoomPresence;
        if (player && typeof player.sessionId === "string" && typeof player.name === "string") {
          players.push(player);
        }
      } catch {
        window.localStorage.removeItem(key);
      }
    }

    return players;
  }

  private readMeta(): PublicRoomMeta | null {
    const raw = window.localStorage.getItem(ROOM_META_KEY);
    if (!raw) {
      return null;
    }

    try {
      const meta = JSON.parse(raw) as PublicRoomMeta;
      return meta && ("roundStartedAt" in meta) ? meta : null;
    } catch {
      return null;
    }
  }

  private writeMeta(meta: PublicRoomMeta | null): void {
    if (!meta || meta.roundStartedAt === null) {
      window.localStorage.removeItem(ROOM_META_KEY);
      return;
    }

    window.localStorage.setItem(ROOM_META_KEY, JSON.stringify(meta));
  }

  private rebuildSnapshot(now: number): void {
    const allPlayers = this.readAllPresence();
    const freshPlayers = allPlayers.filter((player) => now - player.lastSeenAt <= ROOM_PRESENCE_TTL_MS);

    for (const player of allPlayers) {
      if (now - player.lastSeenAt > ROOM_PRESENCE_TTL_MS) {
        window.localStorage.removeItem(presenceKey(player.sessionId));
      }
    }

    const previousMeta = this.readMeta();
    const nextSnapshot = buildPublicRoomSnapshot({
      players: freshPlayers,
      meta: previousMeta,
      now,
      localPlayerId: this.sessionId
    });

    this.writeMeta(nextSnapshot.roundStartedAt === null ? null : { roundStartedAt: nextSnapshot.roundStartedAt });
    this.snapshot = nextSnapshot;
    this.lastRefreshAt = now;
  }
}
