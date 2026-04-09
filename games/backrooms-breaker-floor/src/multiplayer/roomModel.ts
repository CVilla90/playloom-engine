import {
  JOIN_GRACE_MS,
  PLAYER_NAME_MAX_LENGTH,
  PUBLIC_ROOM_CAPACITY,
  ROOM_PRESENCE_TTL_MS,
  ROUND_DURATION_MS,
  type JoinValidation,
  type PublicRoomMeta,
  type PublicRoomPhase,
  type PublicRoomSnapshot,
  type PublicRoomTransportState,
  type RoomPresence
} from "./publicRoomTypes";
import type { MatchSnapshot } from "./protocol";

export function normalizePlayerName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function sanitizePlayerName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function validatePlayerName(name: string): JoinValidation {
  const trimmedName = sanitizePlayerName(name);
  const normalizedName = normalizePlayerName(name);

  if (trimmedName.length === 0) {
    return {
      ok: false,
      normalizedName,
      trimmedName,
      reason: "Enter a name to join the room."
    };
  }

  if (trimmedName.length > PLAYER_NAME_MAX_LENGTH) {
    return {
      ok: false,
      normalizedName,
      trimmedName,
      reason: `Name must be ${PLAYER_NAME_MAX_LENGTH} characters or less.`
    };
  }

  return {
    ok: true,
    normalizedName,
    trimmedName,
    reason: null
  };
}

export function dedupeActivePlayers(players: readonly RoomPresence[]): RoomPresence[] {
  const byName = new Map<string, RoomPresence>();

  for (const player of players) {
    const current = byName.get(player.normalizedName);
    if (!current) {
      byName.set(player.normalizedName, player);
      continue;
    }

    const currentWins =
      current.joinedAt < player.joinedAt || (current.joinedAt === player.joinedAt && current.sessionId < player.sessionId);
    if (!currentWins) {
      byName.set(player.normalizedName, player);
    }
  }

  return [...byName.values()].sort((left, right) => left.joinedAt - right.joinedAt || left.sessionId.localeCompare(right.sessionId));
}

export function filterFreshPlayers(players: readonly RoomPresence[], now: number): RoomPresence[] {
  return dedupeActivePlayers(players.filter((player) => now - player.lastSeenAt <= ROOM_PRESENCE_TTL_MS));
}

export function derivePublicRoomPhase(roundStartedAt: number | null, playerCount: number, now: number): PublicRoomPhase {
  if (playerCount === 0 || roundStartedAt === null) {
    return "waiting";
  }

  if (now - roundStartedAt < JOIN_GRACE_MS) {
    return "round_joinable";
  }

  return "round_locked";
}

export function deriveRoundStartedAt(meta: PublicRoomMeta | null, players: readonly RoomPresence[]): number | null {
  if (players.length === 0) {
    return null;
  }

  const earliestJoin = players.reduce((earliest, player) => Math.min(earliest, player.joinedAt), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(earliestJoin)) {
    return null;
  }

  return meta?.roundStartedAt ?? earliestJoin;
}

export function buildPublicRoomSnapshot(args: {
  players: readonly RoomPresence[];
  meta: PublicRoomMeta | null;
  now: number;
  localPlayerId: string;
}): PublicRoomSnapshot {
  const players = filterFreshPlayers(args.players, args.now);
  const roundStartedAt = deriveRoundStartedAt(args.meta, players);
  const phase = derivePublicRoomPhase(roundStartedAt, players.length, args.now);
  const joinDeadlineAt = roundStartedAt === null ? null : roundStartedAt + JOIN_GRACE_MS;
  const roundDeadlineAt = roundStartedAt === null ? null : roundStartedAt + ROUND_DURATION_MS;
  const phaseEndsAt =
    phase === "round_joinable"
      ? joinDeadlineAt
      : phase === "round_locked"
        ? roundDeadlineAt
        : null;
  const joinTimeRemainingMs = joinDeadlineAt === null ? null : Math.max(0, joinDeadlineAt - args.now);
  const roundTimeRemainingMs = roundDeadlineAt === null ? null : Math.max(0, roundDeadlineAt - args.now);
  const phaseTimeRemainingMs = phaseEndsAt === null ? null : Math.max(0, phaseEndsAt - args.now);
  const localPlayer = players.find((player) => player.sessionId === args.localPlayerId) ?? null;

  let waitReason: string | null = null;
  if (players.length >= PUBLIC_ROOM_CAPACITY) {
    waitReason = "Room is full.";
  } else if (phase === "round_locked") {
    waitReason = "Current round is already locked.";
  } else if (phase === "extraction_countdown") {
    waitReason = "Extraction is already in progress.";
  } else if (phase === "lockdown_swarm") {
    waitReason = "The room is already in lockdown.";
  } else if (phase === "results" || phase === "resetting") {
    waitReason = "Wait for the next round.";
  }

  return {
    phase,
    players,
    capacity: PUBLIC_ROOM_CAPACITY,
    roundStartedAt,
    joinDeadlineAt,
    roundDeadlineAt,
    extractionDeadlineAt: null,
    phaseEndsAt,
    joinTimeRemainingMs,
    roundTimeRemainingMs,
    extractionTimeRemainingMs: null,
    phaseTimeRemainingMs,
    isJoinable: (phase === "waiting" || phase === "round_joinable") && players.length < PUBLIC_ROOM_CAPACITY,
    waitReason,
    missionProgress: null,
    statusBanner: null,
    results: null,
    localPlayerId: args.localPlayerId,
    localPlayerName: localPlayer?.name ?? null,
    localPlayerJoined: localPlayer !== null,
    transportState: "connected",
    transportError: null,
    joinRequestPending: false,
    joinError: null
  };
}

export function buildAuthoritativePublicRoomSnapshot(args: {
  matchSnapshot: MatchSnapshot | null;
  now: number;
  localPlayerId: string;
  preferredName: string;
  transportState: PublicRoomTransportState;
  transportError: string | null;
  joinRequestPending: boolean;
  joinError: string | null;
}): PublicRoomSnapshot {
  const players = args.matchSnapshot?.players.map((player) => ({
    sessionId: player.id,
    name: player.name,
    normalizedName: normalizePlayerName(player.name),
    joinedAt: player.joinedAt,
    lastSeenAt: args.now
  })) ?? [];
  const localPlayer = players.find((player) => player.sessionId === args.localPlayerId) ?? null;
  const isJoinable =
    args.matchSnapshot === null
      ? false
      : (args.matchSnapshot.phase === "waiting" || args.matchSnapshot.phase === "round_joinable")
        && players.length < PUBLIC_ROOM_CAPACITY;
  const waitReason =
    args.transportState !== "connected"
      ? args.transportError ?? "Connecting to the public room server."
      : isJoinable
        ? null
        : args.matchSnapshot?.phase === "round_locked"
          ? "Current round is already locked."
          : args.matchSnapshot?.phase === "extraction_countdown"
            ? "Extraction is already in progress."
            : args.matchSnapshot?.phase === "lockdown_swarm"
              ? "The room is already in lockdown."
              : args.matchSnapshot?.phase === "results" || args.matchSnapshot?.phase === "resetting"
                ? "Wait for the next round."
                : players.length >= PUBLIC_ROOM_CAPACITY
                  ? "Room is full."
                  : null;

  return {
    phase: args.matchSnapshot?.phase ?? "waiting",
    players,
    capacity: PUBLIC_ROOM_CAPACITY,
    roundStartedAt: args.matchSnapshot?.roundStartedAt ?? null,
    joinDeadlineAt: args.matchSnapshot?.joinDeadlineAt ?? null,
    roundDeadlineAt: args.matchSnapshot?.roundDeadlineAt ?? null,
    extractionDeadlineAt: args.matchSnapshot?.extractionDeadlineAt ?? null,
    phaseEndsAt: args.matchSnapshot?.phaseEndsAt ?? null,
    joinTimeRemainingMs: args.matchSnapshot?.joinTimeRemainingMs ?? null,
    roundTimeRemainingMs: args.matchSnapshot?.roundTimeRemainingMs ?? null,
    extractionTimeRemainingMs: args.matchSnapshot?.extractionTimeRemainingMs ?? null,
    phaseTimeRemainingMs: args.matchSnapshot?.phaseTimeRemainingMs ?? null,
    isJoinable,
    waitReason,
    missionProgress: args.matchSnapshot?.missionProgress ?? null,
    statusBanner: args.matchSnapshot?.statusBanner ?? null,
    results: args.matchSnapshot?.results ?? null,
    localPlayerId: args.localPlayerId,
    localPlayerName: localPlayer?.name ?? (args.preferredName || null),
    localPlayerJoined: localPlayer !== null,
    transportState: args.transportState,
    transportError: args.transportError,
    joinRequestPending: args.joinRequestPending,
    joinError: args.joinError
  };
}
