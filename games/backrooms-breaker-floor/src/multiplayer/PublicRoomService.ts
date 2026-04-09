import type { JoinValidation, PublicRoomSnapshot } from "./publicRoomTypes";
import type {
  MatchPunchResult,
  MatchPlayerSnapshot,
  MatchSnapshot,
  MatchStalkerMode,
  MatchStalkerSnapshot,
  MatchVector
} from "./protocol";

export interface JoinAttempt {
  readonly ok: boolean;
  readonly reason: string | null;
}

export interface RoomActionResult<T> {
  readonly ok: boolean;
  readonly reason: string | null;
  readonly value: T | null;
}

export interface LocalPlayerSyncState {
  readonly x: number;
  readonly y: number;
  readonly move: MatchVector;
  readonly facing: MatchVector;
  readonly flashlightOn: boolean;
  readonly wantsInteract: boolean;
  readonly wantsPunch: boolean;
}

export interface LocalStalkerSyncState {
  readonly x: number;
  readonly y: number;
  readonly facing: MatchVector;
  readonly health: number;
  readonly maxHealth: number;
  readonly isDead: boolean;
  readonly mode: MatchStalkerMode;
  readonly areaId: string | null;
}

export interface PublicRoomService {
  tick: (now?: number) => void;
  destroy: () => void;
  getSnapshot: () => PublicRoomSnapshot;
  getMatchSnapshot: () => MatchSnapshot | null;
  getLocalPlayerMatchSnapshot: () => MatchPlayerSnapshot | null;
  consumeLocalPunchResults: () => readonly MatchPunchResult[];
  getPreferredName: () => string;
  setPreferredName: (name: string) => JoinValidation;
  join: (name: string) => JoinAttempt;
  leave: () => void;
  syncLocalPlayerState: (state: LocalPlayerSyncState, now?: number) => MatchPlayerSnapshot | null;
  syncPrimaryStalkerState: (state: LocalStalkerSyncState, now?: number) => MatchStalkerSnapshot | null;
  submitPunch: (facing: MatchVector, now?: number) => RoomActionResult<MatchPunchResult>;
  collectPickup: (pickupId: string, now?: number) => RoomActionResult<MatchSnapshot>;
  collectRelay: (relayId: string, now?: number) => RoomActionResult<MatchSnapshot>;
  activatePanel: (panelId: string, now?: number) => RoomActionResult<MatchSnapshot>;
  startExtraction: (now?: number) => RoomActionResult<MatchSnapshot>;
  applyLocalPlayerDamage: (amount: number, now?: number) => RoomActionResult<MatchPlayerSnapshot>;
  applyPrimaryStalkerDamage: (amount: number, now?: number) => RoomActionResult<MatchStalkerSnapshot>;
}
