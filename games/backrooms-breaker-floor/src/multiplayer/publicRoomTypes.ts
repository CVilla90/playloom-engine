export const PUBLIC_ROOM_CAPACITY = 6;
export const ROUND_DURATION_MS = 6 * 60 * 1000;
export const JOIN_LOCK_BUFFER_MS = 90 * 1000;
export const JOIN_GRACE_MS = ROUND_DURATION_MS - JOIN_LOCK_BUFFER_MS;
export const EXTRACTION_COUNTDOWN_MS = 10 * 1000;
export const LOCKDOWN_SWARM_MS = 10 * 1000;
export const RESULTS_HOLD_MS = 10 * 1000;
export const ROOM_PRESENCE_TTL_MS = 5000;
export const PLAYER_NAME_MAX_LENGTH = 18;

export type PublicRoomPhase =
  | "waiting"
  | "round_joinable"
  | "round_locked"
  | "extraction_countdown"
  | "lockdown_swarm"
  | "results"
  | "resetting";

export type PublicRoomStatusTone = "neutral" | "warning" | "alarm" | "success";
export type PublicRoomTransportState = "connecting" | "connected" | "error";

export interface RoomPresence {
  readonly sessionId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly joinedAt: number;
  readonly lastSeenAt: number;
}

export interface PublicRoomMeta {
  readonly roundStartedAt: number | null;
}

export interface JoinValidation {
  readonly ok: boolean;
  readonly normalizedName: string;
  readonly trimmedName: string;
  readonly reason: string | null;
}

export interface PublicRoomMissionProgress {
  readonly relaysRestored: number;
  readonly relayTotal: number;
  readonly panelsActivated: number;
  readonly panelTotal: number;
  readonly exitUnlocked: boolean;
}

export interface PublicRoomStatusBanner {
  readonly text: string;
  readonly tone: PublicRoomStatusTone;
}

export interface PublicRoundPlayerResult {
  readonly id: string;
  readonly name: string;
  readonly outcome: "winner" | "loser";
  readonly insideExitSafe: boolean;
  readonly wasDead: boolean;
}

export interface PublicRoundResults {
  readonly reason: "extraction" | "timeout" | "wipe";
  readonly players: readonly PublicRoundPlayerResult[];
}

export interface PublicRoomSnapshot {
  readonly phase: PublicRoomPhase;
  readonly players: readonly RoomPresence[];
  readonly capacity: number;
  readonly roundStartedAt: number | null;
  readonly joinDeadlineAt: number | null;
  readonly roundDeadlineAt: number | null;
  readonly extractionDeadlineAt: number | null;
  readonly phaseEndsAt: number | null;
  readonly joinTimeRemainingMs: number | null;
  readonly roundTimeRemainingMs: number | null;
  readonly extractionTimeRemainingMs: number | null;
  readonly phaseTimeRemainingMs: number | null;
  readonly isJoinable: boolean;
  readonly waitReason: string | null;
  readonly missionProgress: PublicRoomMissionProgress | null;
  readonly statusBanner: PublicRoomStatusBanner | null;
  readonly results: PublicRoundResults | null;
  readonly localPlayerId: string;
  readonly localPlayerName: string | null;
  readonly localPlayerJoined: boolean;
  readonly transportState: PublicRoomTransportState;
  readonly transportError: string | null;
  readonly joinRequestPending: boolean;
  readonly joinError: string | null;
}

export function formatPublicRoomStatus(phase: PublicRoomPhase): string {
  switch (phase) {
    case "waiting":
      return "Open";
    case "round_joinable":
      return "Joinable";
    case "round_locked":
      return "Locked";
    case "extraction_countdown":
    case "lockdown_swarm":
      return "Extraction";
    case "results":
    case "resetting":
      return "Results";
  }

  return "Results";
}
