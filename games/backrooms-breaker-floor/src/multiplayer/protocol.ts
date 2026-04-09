import type { PickupType } from "../pickups";
import type {
  PublicRoundResults,
  PublicRoomMissionProgress,
  PublicRoomPhase,
  PublicRoomStatusBanner
} from "./publicRoomTypes";

export interface MatchVector {
  readonly x: number;
  readonly y: number;
}

export interface MatchPlayerSnapshot {
  readonly id: string;
  readonly name: string;
  readonly joinedAt: number;
  readonly x: number;
  readonly y: number;
  readonly facing: MatchVector;
  readonly flashlightOn: boolean;
  readonly health: number;
  readonly maxHealth: number;
  readonly isDead: boolean;
  readonly insideExitSafe: boolean;
  readonly spawnProtectionTimeRemainingMs: number | null;
  readonly speedBoostTimeRemainingMs: number | null;
  readonly punchTimeRemainingMs: number | null;
  readonly punchFacing: MatchVector | null;
  readonly punchArmSide: -1 | 1 | null;
}

export interface MatchObjectiveSnapshot {
  readonly restoredRelayIds: readonly string[];
  readonly activatedPanelIds: readonly string[];
  readonly exitUnlocked: boolean;
}

export interface MatchPickupSnapshot {
  readonly id: string;
  readonly type: PickupType;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly collected: boolean;
}

export type MatchStalkerMode = "roam" | "chase" | "swarm";

export interface MatchStalkerSnapshot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly facing: MatchVector;
  readonly health: number;
  readonly maxHealth: number;
  readonly isDead: boolean;
  readonly mode: MatchStalkerMode;
  readonly areaId: string | null;
  readonly attackTimeRemainingMs: number | null;
  readonly attackCooldownTimeRemainingMs: number | null;
  readonly attackArmSide: -1 | 1 | null;
}

export interface MatchPunchHit {
  readonly targetKind: "player" | "stalker";
  readonly targetId: string;
  readonly damage: number;
  readonly defeated: boolean;
}

export interface MatchPunchResult {
  readonly attackerId: string;
  readonly hits: readonly MatchPunchHit[];
}

export interface MatchSnapshot {
  readonly phase: PublicRoomPhase;
  readonly roundStartedAt: number | null;
  readonly joinDeadlineAt: number | null;
  readonly roundDeadlineAt: number | null;
  readonly extractionDeadlineAt: number | null;
  readonly phaseEndsAt: number | null;
  readonly joinTimeRemainingMs: number | null;
  readonly roundTimeRemainingMs: number | null;
  readonly extractionTimeRemainingMs: number | null;
  readonly phaseTimeRemainingMs: number | null;
  readonly missionProgress: PublicRoomMissionProgress;
  readonly objectives: MatchObjectiveSnapshot;
  readonly players: readonly MatchPlayerSnapshot[];
  readonly pickups: readonly MatchPickupSnapshot[];
  readonly stalkers: readonly MatchStalkerSnapshot[];
  readonly statusBanner: PublicRoomStatusBanner | null;
  readonly results: PublicRoundResults | null;
}

export interface JoinRequestMessage {
  readonly type: "join_request";
  readonly name: string;
}

export interface InputUpdateMessage {
  readonly type: "input_update";
  readonly x: number;
  readonly y: number;
  readonly move: MatchVector;
  readonly facing: MatchVector;
  readonly flashlightOn: boolean;
  readonly wantsInteract: boolean;
  readonly wantsPunch: boolean;
}

export interface LeaveRequestMessage {
  readonly type: "leave_request";
}

export interface InteractionRequestMessage {
  readonly type: "interaction_request";
  readonly targetId: string;
  readonly targetKind: "pickup" | "relay" | "panel" | "exit";
}

export interface PunchRequestMessage {
  readonly type: "punch_request";
  readonly facing: MatchVector;
}

export type ClientMessage =
  | JoinRequestMessage
  | LeaveRequestMessage
  | InputUpdateMessage
  | InteractionRequestMessage
  | PunchRequestMessage;

export interface JoinAcceptedMessage {
  readonly type: "join_accepted";
  readonly playerId: string;
  readonly snapshot: MatchSnapshot;
}

export interface JoinRejectedMessage {
  readonly type: "join_rejected";
  readonly reason: string;
}

export interface SnapshotMessage {
  readonly type: "snapshot";
  readonly snapshot: MatchSnapshot;
}

export interface StatusMessage {
  readonly type: "status_message";
  readonly banner: PublicRoomStatusBanner;
}

export interface PhaseChangedMessage {
  readonly type: "phase_changed";
  readonly phase: PublicRoomPhase;
  readonly snapshot: MatchSnapshot;
}

export interface RoundResultsMessage {
  readonly type: "round_results";
  readonly results: PublicRoundResults;
}

export interface PunchResolvedMessage {
  readonly type: "punch_resolved";
  readonly result: MatchPunchResult;
}

export type ServerMessage =
  | JoinAcceptedMessage
  | JoinRejectedMessage
  | SnapshotMessage
  | StatusMessage
  | PhaseChangedMessage
  | RoundResultsMessage
  | PunchResolvedMessage;
