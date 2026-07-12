import type { DriveState } from "../drivingModel";
import type { LaneChangeIntent } from "../laneChangeModel";
import type { TrafficLane, TrafficVehicle } from "../trafficModel";
import type { RivalState } from "../rivalModel";
import type { CarColorId, PlayerProfile } from "./playerProfile";

export interface RacePlayerSnapshot extends DriveState {
  readonly id: string;
  readonly name: string;
  readonly mainColor: CarColorId;
  readonly accentColor: CarColorId;
  readonly joinedAt: number;
  readonly lane: TrafficLane;
  readonly laneFraction: number;
  readonly laneChange: LaneChangeIntent | null;
  readonly acknowledgedInputSequence: number;
}

export type RaceRivalSnapshot = Omit<RivalState, "relativeMeters"> & {
  readonly distanceMeters: number;
};

export type RaceTrafficSnapshot = Omit<TrafficVehicle, "relativeMeters"> & {
  readonly distanceMeters: number;
};

export interface RaceSessionSnapshot {
  readonly serverTime: number;
  readonly capacity: number;
  readonly players: readonly RacePlayerSnapshot[];
  readonly rivals: readonly RaceRivalSnapshot[];
  readonly traffic: readonly RaceTrafficSnapshot[];
}

export interface JoinRequestMessage {
  readonly type: "join_request";
  readonly profile: PlayerProfile;
}

export interface LeaveRequestMessage {
  readonly type: "leave_request";
}

export interface RaceInputMessage {
  readonly type: "race_input";
  readonly sequence: number;
  readonly accelerate: boolean;
  readonly brake: boolean;
  readonly clutch: boolean;
  readonly shiftUp: boolean;
  readonly shiftDown: boolean;
  readonly selectGear: number | null;
  readonly steer: -1 | 0 | 1;
}

export type RaceClientMessage = JoinRequestMessage | LeaveRequestMessage | RaceInputMessage;

export interface SessionStateMessage {
  readonly type: "session_state";
  readonly snapshot: RaceSessionSnapshot;
}

export interface JoinAcceptedMessage {
  readonly type: "join_accepted";
  readonly playerId: string;
  readonly snapshot: RaceSessionSnapshot;
}

export interface JoinRejectedMessage {
  readonly type: "join_rejected";
  readonly reason: string;
}

export type RaceServerMessage = SessionStateMessage | JoinAcceptedMessage | JoinRejectedMessage;
