import { ROUTE_LENGTH_METERS, clamp } from "./drivingModel";
import { calculateDraftState } from "./draftModel";
import {
  LANE_CHANGE_DURATION_SECONDS,
  ROAD_LANES,
  laneChangeProgress,
  startLaneChangeIntent,
  stepLaneChange,
  type LaneChangeIntent
} from "./laneChangeModel";

export type TrafficLane = "left" | "center" | "right";
export type TrafficYawFrame = 0 | 8;
export type TrafficVehicleKind = "sedan" | "truck";
export type TrafficLaneFrame = 0 | 4;

export interface TrafficVehicle {
  readonly id: string;
  readonly kind: TrafficVehicleKind;
  readonly lane: TrafficLane;
  readonly laneFraction: number;
  readonly speedKph: number;
  readonly cruiseSpeedKph: number;
  readonly relativeMeters: number;
  readonly laneChangeCooldown: number;
  readonly laneChange?: LaneChangeIntent | null;
  readonly cycle: number;
}

export interface TrafficObstacle {
  readonly id: string;
  readonly lane: TrafficLane;
  readonly speedKph: number;
  readonly relativeMeters: number;
}

export interface TrafficStepContext {
  readonly playerLane?: TrafficLane;
  readonly obstacles?: readonly TrafficObstacle[];
  /** Keep vehicles persistent on the closed route instead of camera-recycling. */
  readonly persistentLoop?: boolean;
}

export const TRAFFIC_SEDAN_MIN_SPEED_KPH = 75.6;
export const TRAFFIC_SEDAN_MAX_SPEED_KPH = 100.8;
export const TRAFFIC_TRUCK_MIN_SPEED_KPH = 58.8;
export const TRAFFIC_TRUCK_MAX_SPEED_KPH = 78.4;
// Cruise speed is behavioral, not mechanical. Rear impacts may launch traffic
// above cruise temporarily, but every civilian still owns an absolute ceiling.
// The freight truck's lower ceiling reinforces its mass instead of turning a
// heavy shunt into an implausible high-speed projectile.
export const TRAFFIC_SEDAN_HARD_SPEED_LIMIT_KPH = 180;
export const TRAFFIC_TRUCK_HARD_SPEED_LIMIT_KPH = 120;
export const TRAFFIC_MIN_SPEED_KPH = TRAFFIC_TRUCK_MIN_SPEED_KPH;
export const TRAFFIC_MAX_SPEED_KPH = TRAFFIC_SEDAN_MAX_SPEED_KPH;
export const TRAFFIC_RENDER_AHEAD_METERS = 450;
export const TRAFFIC_RENDER_BEHIND_METERS = 12;
export const TRAFFIC_REARVIEW_RENDER_BEHIND_METERS = 72;
export const TRAFFIC_CLOSE_VIEW_METERS = 82;
/**
 * Civilian encounter cadence relative to the original two-vehicle spacing.
 * Two consecutive 25% reductions leave 56.25% of the original frequency.
 */
export const TRAFFIC_PRESENCE_RATIO = 0.75 * 0.75;
export const TRAFFIC_SPACING_MULTIPLIER = 1 / TRAFFIC_PRESENCE_RATIO;

export function trafficHardSpeedLimitKph(kind: TrafficVehicleKind): number {
  return kind === "truck"
    ? TRAFFIC_TRUCK_HARD_SPEED_LIMIT_KPH
    : TRAFFIC_SEDAN_HARD_SPEED_LIMIT_KPH;
}

const TRAFFIC_SEDAN_SPEEDS = [79.2, 86.4, 93.6, 100.8, 90, 75.6] as const;
const TRAFFIC_TRUCK_SPEEDS = [61.6, 67.2, 72.8, 78.4, 70, 58.8] as const;
const TRAFFIC_SEDAN_SPAWN_LANES: readonly TrafficLane[] = [
  "center",
  "center",
  "center",
  "left",
  "center",
  "left",
  "right"
];
const TRAFFIC_TRUCK_SPAWN_LANES: readonly TrafficLane[] = [
  "left",
  "left",
  "left",
  "center",
  "left",
  "center",
  "right"
];
const TRAFFIC_REACTION_DISTANCE_METERS = 104;
const TRAFFIC_MIN_TARGET_LANE_AHEAD_GAP_METERS = 32;
const TRAFFIC_MIN_TARGET_LANE_BEHIND_GAP_METERS = 24;
const TRAFFIC_LANE_CHANGE_COOLDOWN_SECONDS = 1.05;
const TRAFFIC_ACCELERATION_KPH_PER_SECOND = 8;
const TRAFFIC_BRAKING_KPH_PER_SECOND = 34;
// Speed donated by a rear bump bleeds back off toward the programmed cruise
// speed at this gentle rate — traffic is a temporary launch pad, not a train
// partner. Hard braking above stays reserved for an actual blocker ahead.
export const TRAFFIC_PUSHED_BLEED_KPH_PER_SECOND = 9;
const TRAFFIC_DRAFT_EXTRA_SPEED_KPH = 10;
const TRAFFIC_RECYCLE_AHEAD_METERS = 850;
const TRAFFIC_RECYCLE_BEHIND_METERS = -160;

function wrapPersistentRelativeMeters(distanceMeters: number): number {
  const half = ROUTE_LENGTH_METERS * 0.5;
  const wrapped = ((distanceMeters + half) % ROUTE_LENGTH_METERS + ROUTE_LENGTH_METERS) % ROUTE_LENGTH_METERS - half;
  return wrapped === -half ? half : wrapped;
}

// Traffic remains intentionally light: this is still the same two-vehicle pool.
// The second sedan was replaced by a container truck rather than adding traffic.
const INITIAL_TRAFFIC: readonly TrafficVehicle[] = [
  {
    id: "civilian-01",
    kind: "sedan",
    lane: "center",
    laneFraction: laneRoadFraction("center"),
    speedKph: 79.2,
    cruiseSpeedKph: 79.2,
    relativeMeters: 132 * TRAFFIC_SPACING_MULTIPLIER,
    laneChangeCooldown: 0,
    laneChange: null,
    cycle: 0
  },
  {
    id: "freight-01",
    kind: "truck",
    lane: "left",
    laneFraction: laneRoadFraction("left"),
    speedKph: 67.2,
    cruiseSpeedKph: 67.2,
    relativeMeters: 244 * TRAFFIC_SPACING_MULTIPLIER,
    laneChangeCooldown: 0,
    laneChange: null,
    cycle: 0
  }
];

export function createInitialTraffic(): TrafficVehicle[] {
  return INITIAL_TRAFFIC.map((vehicle) => ({ ...vehicle }));
}

function nextSpeed(kind: TrafficVehicleKind, index: number, cycle: number): number {
  const speeds = kind === "truck" ? TRAFFIC_TRUCK_SPEEDS : TRAFFIC_SEDAN_SPEEDS;
  return speeds[(index + cycle * 2) % speeds.length] ?? (kind === "truck" ? 67.2 : 86.4);
}

function spawnLane(kind: TrafficVehicleKind, index: number, cycle: number): TrafficLane {
  const lanes = kind === "truck" ? TRAFFIC_TRUCK_SPAWN_LANES : TRAFFIC_SEDAN_SPAWN_LANES;
  return lanes[(index + cycle * 3) % lanes.length] ?? "center";
}

function adjacentLanes(lane: TrafficLane): TrafficLane[] {
  const index = ROAD_LANES.indexOf(lane);
  const lanes: TrafficLane[] = [];
  if (index > 0) {
    lanes.push(ROAD_LANES[index - 1]!);
  }
  if (index < ROAD_LANES.length - 1) {
    lanes.push(ROAD_LANES[index + 1]!);
  }
  return lanes;
}

function speedToward(
  current: number,
  target: number,
  dt: number,
  draftPowerMultiplier: number,
  brakingForBlocker: boolean
): number {
  if (target >= current) {
    return Math.min(
      target,
      current + TRAFFIC_ACCELERATION_KPH_PER_SECOND * draftPowerMultiplier * dt
    );
  }
  const decelerationKphPerSecond = brakingForBlocker
    ? TRAFFIC_BRAKING_KPH_PER_SECOND
    : TRAFFIC_PUSHED_BLEED_KPH_PER_SECOND;
  return Math.max(target, current - decelerationKphPerSecond * dt);
}

function nearestBlocker(
  vehicle: TrafficVehicle,
  lane: TrafficLane,
  obstacles: readonly TrafficObstacle[]
): TrafficObstacle | null {
  let blocker: TrafficObstacle | null = null;
  let blockerDistance = Number.POSITIVE_INFINITY;
  for (const obstacle of obstacles) {
    if (obstacle.id === vehicle.id || obstacle.lane !== lane) {
      continue;
    }
    const delta = obstacle.relativeMeters - vehicle.relativeMeters;
    if (delta >= 0 && delta < blockerDistance) {
      blocker = obstacle;
      blockerDistance = delta;
    }
  }
  return blocker;
}

function laneClearance(
  vehicle: TrafficVehicle,
  lane: TrafficLane,
  obstacles: readonly TrafficObstacle[],
  lookaheadSeconds = 0
): { aheadMeters: number; behindMeters: number } {
  let aheadMeters = Number.POSITIVE_INFINITY;
  let behindMeters = Number.POSITIVE_INFINITY;
  for (const obstacle of obstacles) {
    if (obstacle.id === vehicle.id || obstacle.lane !== lane) {
      continue;
    }
    const relativeSpeedMeters =
      ((obstacle.speedKph - vehicle.speedKph) / 3.6) * lookaheadSeconds;
    const delta = obstacle.relativeMeters - vehicle.relativeMeters + relativeSpeedMeters;
    if (delta >= 0) {
      aheadMeters = Math.min(aheadMeters, delta);
    } else {
      behindMeters = Math.min(behindMeters, -delta);
    }
  }
  return { aheadMeters, behindMeters };
}

function chooseTrafficLane(
  vehicle: TrafficVehicle,
  obstacles: readonly TrafficObstacle[]
): TrafficLane {
  if (vehicle.kind !== "sedan" || vehicle.laneChangeCooldown > 0 || vehicle.laneChange) {
    return vehicle.lane;
  }
  const blocker = nearestBlocker(vehicle, vehicle.lane, obstacles);
  if (
    blocker === null ||
    blocker.relativeMeters - vehicle.relativeMeters >= TRAFFIC_REACTION_DISTANCE_METERS ||
    blocker.speedKph >= vehicle.speedKph - 4
  ) {
    return vehicle.lane;
  }

  let bestLane = vehicle.lane;
  let bestAhead = blocker.relativeMeters - vehicle.relativeMeters;
  for (const lane of adjacentLanes(vehicle.lane)) {
    const clearance = laneClearance(vehicle, lane, obstacles, LANE_CHANGE_DURATION_SECONDS);
    const hasSafeMerge =
      clearance.aheadMeters >= TRAFFIC_MIN_TARGET_LANE_AHEAD_GAP_METERS &&
      clearance.behindMeters >= TRAFFIC_MIN_TARGET_LANE_BEHIND_GAP_METERS;
    if (hasSafeMerge && clearance.aheadMeters > bestAhead + 10) {
      bestLane = lane;
      bestAhead = clearance.aheadMeters;
    }
  }
  return bestLane;
}

function laneFractionDuringIntent(intent: LaneChangeIntent): number {
  return (
    laneRoadFraction(intent.fromLane) +
    (laneRoadFraction(intent.targetLane) - laneRoadFraction(intent.fromLane)) *
      laneChangeProgress(intent)
  );
}

function respawnAhead(vehicle: TrafficVehicle, index: number): TrafficVehicle {
  const cycle = vehicle.cycle + 1;
  const speedKph = nextSpeed(vehicle.kind, index, cycle);
  const lane = spawnLane(vehicle.kind, index, cycle);
  return {
    ...vehicle,
    lane,
    laneFraction: laneRoadFraction(lane),
    speedKph,
    cruiseSpeedKph: speedKph,
    relativeMeters:
      (325 + ((index * 71 + cycle * 47) % 118)) * TRAFFIC_SPACING_MULTIPLIER,
    laneChangeCooldown: 0.45,
    laneChange: null,
    cycle
  };
}

function respawnBehind(vehicle: TrafficVehicle, index: number): TrafficVehicle {
  const cycle = vehicle.cycle + 1;
  const speedKph = nextSpeed(vehicle.kind, index + 1, cycle);
  const lane = spawnLane(vehicle.kind, index + 1, cycle);
  return {
    ...vehicle,
    lane,
    laneFraction: laneRoadFraction(lane),
    speedKph,
    cruiseSpeedKph: speedKph,
    relativeMeters:
      (-48 - ((index * 17 + cycle * 23) % 34)) * TRAFFIC_SPACING_MULTIPLIER,
    laneChangeCooldown: 0.45,
    laneChange: null,
    cycle
  };
}

export function stepTraffic(
  vehicles: readonly TrafficVehicle[],
  playerSpeedKph: number,
  dt: number,
  context: TrafficStepContext = {}
): TrafficVehicle[] {
  const safeDt = clamp(dt, 0, 0.05);
  const safePlayerSpeed = Math.max(0, playerSpeedKph);
  const trafficObstacles: TrafficObstacle[] = [
    ...vehicles,
    ...(context.obstacles ?? []),
    ...(context.playerLane
      ? [{
          id: "player",
          lane: context.playerLane,
          speedKph: safePlayerSpeed,
          relativeMeters: 0
        }]
      : [])
  ];

  return vehicles.map((vehicle, index) => {
    const vehicleObstacles = context.persistentLoop
      ? trafficObstacles.map((obstacle) => ({
          ...obstacle,
          relativeMeters:
            vehicle.relativeMeters +
            wrapPersistentRelativeMeters(obstacle.relativeMeters - vehicle.relativeMeters)
        }))
      : trafficObstacles;
    let laneAfterChoice = vehicle.lane;
    let laneChange = vehicle.laneChange ?? null;
    let committedLaneChange = false;

    if (laneChange !== null) {
      const laneStep = stepLaneChange(vehicle.lane, laneChange, safeDt);
      laneAfterChoice = laneStep.lane;
      laneChange = laneStep.intent;
      committedLaneChange = laneStep.committed;
    } else {
      const nextLane = chooseTrafficLane(vehicle, vehicleObstacles);
      laneChange = startLaneChangeIntent(vehicle.lane, nextLane);
      if (laneChange !== null) {
        const laneStep = stepLaneChange(vehicle.lane, laneChange, safeDt);
        laneAfterChoice = laneStep.lane;
        laneChange = laneStep.intent;
        committedLaneChange = laneStep.committed;
      }
    }

    const blocker = nearestBlocker(
      { ...vehicle, lane: laneAfterChoice },
      laneAfterChoice,
      vehicleObstacles
    );
    const draft = calculateDraftState(
      {
        id: vehicle.id,
        lane: laneAfterChoice,
        speedKph: vehicle.speedKph,
        relativeMeters: vehicle.relativeMeters
      },
      vehicleObstacles
    );
    const draftedCruiseSpeed =
      vehicle.cruiseSpeedKph + draft.boostRatio * TRAFFIC_DRAFT_EXTRA_SPEED_KPH;
    const brakingForBlocker =
      blocker !== null &&
      blocker.relativeMeters - vehicle.relativeMeters < TRAFFIC_REACTION_DISTANCE_METERS &&
      blocker.speedKph < vehicle.speedKph;
    const targetSpeed =
      blocker !== null &&
      blocker.relativeMeters - vehicle.relativeMeters < TRAFFIC_REACTION_DISTANCE_METERS
        ? Math.max(0, blocker.speedKph - 3)
        : draftedCruiseSpeed;
    const speedKph = Math.min(
      trafficHardSpeedLimitKph(vehicle.kind),
      speedToward(
        vehicle.speedKph,
        targetSpeed,
        safeDt,
        draft.powerMultiplier,
        brakingForBlocker
      )
    );
    const advancedRelativeMeters =
      vehicle.relativeMeters + ((speedKph - safePlayerSpeed) / 3.6) * safeDt;
    const relativeMeters = context.persistentLoop
      ? wrapPersistentRelativeMeters(advancedRelativeMeters)
      : advancedRelativeMeters;
    const laneTarget = laneRoadFraction(laneAfterChoice);
    const laneBlend = 1 - Math.exp(-safeDt * 4.2);
    const laneFraction =
      committedLaneChange
        ? laneTarget
        : laneChange !== null
        ? laneFractionDuringIntent(laneChange)
        : vehicle.laneFraction + (laneTarget - vehicle.laneFraction) * laneBlend;
    const moved = {
      ...vehicle,
      lane: laneAfterChoice,
      laneFraction,
      speedKph,
      relativeMeters,
      laneChange,
      laneChangeCooldown:
        laneChange !== null
          ? vehicle.laneChangeCooldown
          : committedLaneChange
            ? TRAFFIC_LANE_CHANGE_COOLDOWN_SECONDS
            : Math.max(0, vehicle.laneChangeCooldown - safeDt)
    };

    if (context.persistentLoop) {
      return moved;
    }

    if (relativeMeters < TRAFFIC_RECYCLE_BEHIND_METERS) {
      return respawnAhead(moved, index);
    }
    if (relativeMeters > TRAFFIC_RECYCLE_AHEAD_METERS) {
      return respawnBehind(moved, index);
    }
    return moved;
  });
}

export function trafficYawFrame(relativeMeters: number): TrafficYawFrame {
  return Math.abs(relativeMeters) <= TRAFFIC_CLOSE_VIEW_METERS ? 8 : 0;
}

export function trafficIsRenderable(relativeMeters: number): boolean {
  return (
    relativeMeters >= -TRAFFIC_RENDER_BEHIND_METERS &&
    relativeMeters <= TRAFFIC_RENDER_AHEAD_METERS
  );
}

export function trafficIsRearViewRenderable(relativeMeters: number): boolean {
  return (
    relativeMeters < 0 &&
    relativeMeters >= -TRAFFIC_REARVIEW_RENDER_BEHIND_METERS
  );
}

export function laneRoadFraction(lane: TrafficLane): number {
  if (lane === "left") {
    return -2 / 3;
  }
  if (lane === "right") {
    return 2 / 3;
  }
  return 0;
}

export interface TrafficSpriteView {
  readonly frame: TrafficLaneFrame;
  readonly mirrored: boolean;
}

/**
 * Selects a rear sprite from the player's lateral position relative to traffic.
 * Same lane is straight-on. A player to the traffic vehicle's right sees the
 * unmirrored 04° frame; a player to its left sees that frame mirrored.
 */
export function trafficSpriteView(
  trafficLane: TrafficLane,
  playerLane: TrafficLane
): TrafficSpriteView {
  const lanes: readonly TrafficLane[] = ["left", "center", "right"];
  const laneDelta = lanes.indexOf(trafficLane) - lanes.indexOf(playerLane);
  return {
    frame: laneDelta === 0 ? 0 : 4,
    mirrored: laneDelta > 0
  };
}

/**
 * Selects a front sprite for the rear-view mirror from the traffic vehicle's
 * lateral position relative to the player. Same lane is straight-on. A vehicle
 * to the player's right uses the regular 04° front frame; a vehicle to the
 * player's left mirrors that 04° front frame.
 */
export function rearViewTrafficSpriteView(
  trafficLane: TrafficLane,
  playerLane: TrafficLane
): TrafficSpriteView {
  const lanes: readonly TrafficLane[] = ["left", "center", "right"];
  const laneDelta = lanes.indexOf(trafficLane) - lanes.indexOf(playerLane);
  return {
    frame: laneDelta === 0 ? 0 : 4,
    mirrored: laneDelta < 0
  };
}
