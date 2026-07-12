import type { TrafficLane } from "./trafficModel";

export type LaneChangeDirection = "left" | "right";

export interface LaneChangeIntent {
  readonly fromLane: TrafficLane;
  readonly targetLane: TrafficLane;
  readonly direction: LaneChangeDirection;
  readonly elapsedSeconds: number;
  readonly durationSeconds: number;
}

export interface LaneChangeStep {
  readonly lane: TrafficLane;
  readonly intent: LaneChangeIntent | null;
  readonly committed: boolean;
}

export const LANE_CHANGE_DURATION_SECONDS = 1;
export const LANE_CHANGE_BLINK_INTERVAL_SECONDS = 0.5;
export const LANE_CHANGE_BLINK_ON_SECONDS = 0.18;
export const ROAD_LANES: readonly TrafficLane[] = ["left", "center", "right"];

export function laneIndex(lane: TrafficLane): number {
  return ROAD_LANES.indexOf(lane);
}

export function laneStepToward(fromLane: TrafficLane, targetLane: TrafficLane): TrafficLane {
  const fromIndex = laneIndex(fromLane);
  const targetIndex = laneIndex(targetLane);
  if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) {
    return fromLane;
  }
  return ROAD_LANES[fromIndex + Math.sign(targetIndex - fromIndex)] ?? fromLane;
}

export function startLaneChangeIntent(
  fromLane: TrafficLane,
  targetLane: TrafficLane
): LaneChangeIntent | null {
  const fromIndex = laneIndex(fromLane);
  const targetIndex = laneIndex(targetLane);
  if (fromIndex === -1 || targetIndex === -1 || Math.abs(targetIndex - fromIndex) !== 1) {
    return null;
  }

  return {
    fromLane,
    targetLane,
    direction: targetIndex < fromIndex ? "left" : "right",
    elapsedSeconds: 0,
    durationSeconds: LANE_CHANGE_DURATION_SECONDS
  };
}

export function stepLaneChange(
  lane: TrafficLane,
  intent: LaneChangeIntent | null | undefined,
  dt: number
): LaneChangeStep {
  if (intent === null || intent === undefined || intent.fromLane !== lane) {
    return { lane, intent: null, committed: false };
  }

  const elapsedSeconds = intent.elapsedSeconds + Math.max(0, dt);
  if (elapsedSeconds >= intent.durationSeconds) {
    return { lane: intent.targetLane, intent: null, committed: true };
  }

  return {
    lane,
    intent: {
      ...intent,
      elapsedSeconds
    },
    committed: false
  };
}

export function laneChangeProgress(intent: LaneChangeIntent | null | undefined): number {
  if (intent === null || intent === undefined) {
    return 0;
  }
  const ratio = Math.max(0, Math.min(1, intent.elapsedSeconds / intent.durationSeconds));
  return ratio * ratio * (3 - 2 * ratio);
}

export function laneChangeBlinkerLit(
  intent: LaneChangeIntent | null | undefined
): boolean {
  if (intent === null || intent === undefined) {
    return false;
  }
  const phase = intent.elapsedSeconds % LANE_CHANGE_BLINK_INTERVAL_SECONDS;
  return phase < LANE_CHANGE_BLINK_ON_SECONDS;
}
