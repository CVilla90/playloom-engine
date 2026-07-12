import {
  MAX_GEAR,
  MAX_SPEED_KPH,
  ROUTE_LENGTH_METERS,
  clamp,
  driveAccelerationKphPerSecond,
  speedLimitForGear
} from "./drivingModel";
import {
  TRAFFIC_RENDER_AHEAD_METERS,
  TRAFFIC_REARVIEW_RENDER_BEHIND_METERS,
  laneRoadFraction,
  type TrafficLane
} from "./trafficModel";
import { calculateDraftState, calculateLeadPushState } from "./draftModel";
import {
  LANE_CHANGE_DURATION_SECONDS,
  ROAD_LANES,
  laneChangeProgress,
  laneStepToward,
  startLaneChangeIntent,
  stepLaneChange,
  type LaneChangeIntent
} from "./laneChangeModel";

export type RivalVehicleKind =
  | "shirokage"
  | "shirokageRed"
  | "hibanaRs"
  | "aonamiGt"
  | "kageroVx"
  | "police";

export interface RivalDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly kind: RivalVehicleKind;
  readonly maxSpeedKph: number;
  readonly inactiveSpeedRangeKph: readonly [number, number];
  readonly accelerationMultiplier: number;
  readonly aggression: number;
  readonly brakingKphPerSecond: number;
  readonly reactionDistanceMeters: number;
  readonly laneChangeCooldownSeconds: number;
  /** Pursuit units hunt the nearest session player instead of free-running. */
  readonly pursuit?: boolean;
}

export interface RivalState {
  readonly id: string;
  readonly definitionId: string;
  readonly kind: RivalVehicleKind;
  readonly lane: TrafficLane;
  readonly laneFraction: number;
  readonly speedKph: number;
  readonly inactiveCruiseSpeedKph: number;
  readonly encounterActive: boolean;
  readonly relativeMeters: number;
  readonly laneChangeCooldown: number;
  readonly laneChange?: LaneChangeIntent | null;
  readonly cycle: number;
  /** Per-session performance overrides (the police interceptor rolls these). */
  readonly maxSpeedKphOverride?: number;
  readonly accelerationMultiplierOverride?: number;
}

export interface RivalObstacle {
  readonly id: string;
  readonly lane: TrafficLane;
  readonly speedKph: number;
  readonly relativeMeters: number;
  /** Player/rivals form draft trains; civilian traffic never does. */
  readonly trainPartner?: boolean;
}

/** One human player as rivals see it, in the same frame as rival relativeMeters. */
export interface RivalSessionPlayer {
  readonly relativeMeters: number;
  readonly lane: TrafficLane;
  readonly speedKph: number;
}

export interface RivalStepInput {
  readonly playerSpeedKph: number;
  readonly playerLane: TrafficLane;
  readonly obstacles: readonly RivalObstacle[];
  readonly dt: number;
  /**
   * Every human player in the session: any of them can wake a rival into its
   * encounter/racing mode, and pursuit units hunt the nearest one. Defaults
   * to just the primary player at 0, preserving single-player behavior.
   */
  readonly sessionPlayers?: readonly RivalSessionPlayer[];
}

interface LaneClearance {
  readonly aheadMeters: number;
  readonly behindMeters: number;
  readonly blockerSpeedKph: number | null;
  readonly blockerIsTrainPartner: boolean;
}

export const RIVAL_MAX_SPEED_KPH = 261;
export const SHIROKAGE_MAX_SPEED_KPH = 221;
export const RIVAL_ROUTE_HALF_LENGTH_METERS = ROUTE_LENGTH_METERS * 0.5;
const RIVAL_MIN_TARGET_LANE_AHEAD_GAP_METERS = 36;
const RIVAL_MIN_TARGET_LANE_BEHIND_GAP_METERS = 24;
const RIVAL_LANE_OPPORTUNITY_THRESHOLD_METERS = 18;
// Rivals hold on to speed donated by a rear bump: excess over their target
// bleeds off at drag pace instead of the hard braking rate (which stays
// reserved for a real blocker ahead). This is what makes a rival a willing
// train partner where traffic is not.
export const RIVAL_OVERSPEED_BLEED_KPH_PER_SECOND = 5.5;
// A rival tucked into a slipstream can run past its normal behavioral ceiling,
// but this bonus also defines its absolute mechanical limit.
export const RIVAL_DRAFT_TOP_SPEED_BONUS_KPH = 18;
// Aggressive rivals deliberately bump-draft a fast train partner instead of
// braking to follow or swerving around: they close at a gentle overspeed and
// let the nudge exchange feed the pair forward.
const RIVAL_TRAIN_MIN_PARTNER_SPEED_KPH = 240;
const RIVAL_TRAIN_MIN_AGGRESSION_RATIO = 0.6;
const RIVAL_TRAIN_CLOSE_RATE_KPH = 6;
// The player curve naturally runs out of pull below its hard cap.
// Faster rivals share that curve through normal speeds, then retain the small
// amount of pull available here so their definition-owned caps remain real.
const RIVAL_HIGH_SPEED_CURVE_CEILING_KPH = MAX_SPEED_KPH * 0.93;
// The police interceptor rolls its per-session top speed inside this window,
// so some nights it is prey and some nights it is the fastest thing out.
export const POLICE_MIN_TOP_SPEED_KPH = 221;
export const POLICE_MAX_TOP_SPEED_KPH = 321;
// Pursuit tuning: run the target down with a real overspeed, and when it slips
// past, brake-check into its path instead of politely following.
const POLICE_RAM_OVERSPEED_KPH = 42;
const POLICE_BRAKE_CHECK_UNDERSPEED_KPH = 18;
const POLICE_CONTACT_HOLD_RANGE_METERS = 2.5;

export const RIVAL_DEFINITION_IDS = [
  "shirokage",
  "red_shirokage_test",
  "hibana_rs",
  "aonami_gt",
  "kagero_vx",
  "police_interceptor"
] as const;

export type RivalDefinitionId = (typeof RIVAL_DEFINITION_IDS)[number];

export const RIVAL_DEFINITIONS: Readonly<Record<RivalDefinitionId, RivalDefinition>> = {
  shirokage: {
    id: "shirokage",
    displayName: "Project Shirokage",
    kind: "shirokage",
    maxSpeedKph: SHIROKAGE_MAX_SPEED_KPH,
    inactiveSpeedRangeKph: [132, 188],
    accelerationMultiplier: 0.86,
    aggression: 34,
    brakingKphPerSecond: 47,
    reactionDistanceMeters: 194,
    laneChangeCooldownSeconds: 1.32
  },
  red_shirokage_test: {
    id: "red_shirokage_test",
    displayName: "Red Shirokage",
    kind: "shirokageRed",
    maxSpeedKph: RIVAL_MAX_SPEED_KPH,
    inactiveSpeedRangeKph: [150, 220],
    accelerationMultiplier: 1,
    aggression: 55,
    brakingKphPerSecond: 62,
    reactionDistanceMeters: 156,
    laneChangeCooldownSeconds: 0.75
  },
  hibana_rs: {
    id: "hibana_rs",
    displayName: "Hibana RS",
    kind: "hibanaRs",
    maxSpeedKph: 283,
    inactiveSpeedRangeKph: [185, 245],
    accelerationMultiplier: 1.18,
    aggression: 88,
    brakingKphPerSecond: 70,
    reactionDistanceMeters: 112,
    laneChangeCooldownSeconds: 0.4
  },
  aonami_gt: {
    id: "aonami_gt",
    displayName: "Aonami GT",
    kind: "aonamiGt",
    maxSpeedKph: 309,
    inactiveSpeedRangeKph: [205, 270],
    accelerationMultiplier: 1,
    aggression: 44,
    brakingKphPerSecond: 56,
    reactionDistanceMeters: 210,
    laneChangeCooldownSeconds: 1.15
  },
  kagero_vx: {
    id: "kagero_vx",
    displayName: "Kagero VX",
    kind: "kageroVx",
    maxSpeedKph: 321,
    inactiveSpeedRangeKph: [215, 285],
    accelerationMultiplier: 1.08,
    aggression: 68,
    brakingKphPerSecond: 82,
    reactionDistanceMeters: 170,
    laneChangeCooldownSeconds: 0.72
  },
  police_interceptor: {
    id: "police_interceptor",
    displayName: "Prefectural Interceptor",
    kind: "police",
    // Base values; every session overrides top speed and acceleration with
    // per-instance rolls inside [POLICE_MIN_TOP_SPEED_KPH, POLICE_MAX_TOP_SPEED_KPH].
    maxSpeedKph: POLICE_MAX_TOP_SPEED_KPH,
    inactiveSpeedRangeKph: [140, 195],
    accelerationMultiplier: 1,
    aggression: 100,
    brakingKphPerSecond: 74,
    reactionDistanceMeters: 150,
    laneChangeCooldownSeconds: 0.55,
    pursuit: true
  }
};

/** Absolute collision/draft ceiling for a rival, parallel to Reimei's hard cap. */
export function rivalHardSpeedLimitKph(
  rival: Pick<RivalState, "definitionId" | "maxSpeedKphOverride">
): number {
  const definition =
    RIVAL_DEFINITIONS[rival.definitionId as RivalDefinitionId] ?? RIVAL_DEFINITIONS.shirokage;
  const topSpeedKph = rival.maxSpeedKphOverride ?? definition.maxSpeedKph;
  return Math.min(MAX_SPEED_KPH, topSpeedKph + RIVAL_DRAFT_TOP_SPEED_BONUS_KPH);
}

export function createInitialRivals(random: () => number = Math.random): RivalState[] {
  const cycle = 0;
  const initialRivals: ReadonlyArray<{
    readonly id: string;
    readonly definitionId: RivalDefinitionId;
  }> = [
    { id: "rival-shirokage-01", definitionId: "shirokage" },
    { id: "rival-red-01", definitionId: "red_shirokage_test" },
    { id: "rival-hibana-01", definitionId: "hibana_rs" },
    { id: "rival-aonami-01", definitionId: "aonami_gt" },
    { id: "rival-kagero-01", definitionId: "kagero_vx" }
  ];

  const slotLength = ROUTE_LENGTH_METERS / initialRivals.length;
  const rivals: RivalState[] = initialRivals.map((initial, spawnSlot) => {
    const definition = RIVAL_DEFINITIONS[initial.definitionId];
    const inactiveCruiseSpeedKph = inactiveSpeedForRatio(definition, random());
    // Stratified random positions keep all five identities distributed around
    // the loop without fixing any encounter order. The relative coordinate is
    // only a camera/player view of a persistent route position; it is never a
    // spawn/despawn trigger.
    const routePosition = (spawnSlot + 0.2 + clamp(random(), 0, 0.999999) * 0.6) * slotLength;
    const relativeMeters = wrapRouteRelativeMeters(routePosition);
    const lane = ROAD_LANES[Math.floor(clamp(random(), 0, 0.999999) * ROAD_LANES.length)]!;
    return {
      id: initial.id,
      definitionId: definition.id,
      kind: definition.kind,
      lane,
      laneFraction: laneRoadFraction(lane),
      speedKph: inactiveCruiseSpeedKph,
      inactiveCruiseSpeedKph,
      encounterActive: false,
      relativeMeters,
      laneChangeCooldown: definition.laneChangeCooldownSeconds,
      laneChange: null,
      cycle
    };
  });

  // The police interceptor is a sixth, non-ambient unit: it patrols anywhere
  // on the loop and rolls per-session pursuit performance, so its threat level
  // is different every night.
  const police = RIVAL_DEFINITIONS.police_interceptor;
  const policeCruiseSpeedKph = inactiveSpeedForRatio(police, random());
  const policeRelativeMeters = wrapRouteRelativeMeters(
    clamp(random(), 0, 0.999999) * ROUTE_LENGTH_METERS
  );
  const policeLane = ROAD_LANES[Math.floor(clamp(random(), 0, 0.999999) * ROAD_LANES.length)]!;
  const maxSpeedKphOverride =
    POLICE_MIN_TOP_SPEED_KPH +
    clamp(random(), 0, 1) * (POLICE_MAX_TOP_SPEED_KPH - POLICE_MIN_TOP_SPEED_KPH);
  const accelerationMultiplierOverride = 0.9 + clamp(random(), 0, 1) * 0.3;
  rivals.push({
    id: "rival-police-01",
    definitionId: police.id,
    kind: police.kind,
    lane: policeLane,
    laneFraction: laneRoadFraction(policeLane),
    speedKph: policeCruiseSpeedKph,
    inactiveCruiseSpeedKph: policeCruiseSpeedKph,
    encounterActive: false,
    relativeMeters: policeRelativeMeters,
    laneChangeCooldown: police.laneChangeCooldownSeconds,
    laneChange: null,
    cycle,
    maxSpeedKphOverride,
    accelerationMultiplierOverride
  });
  return rivals;
}

/** Shortest signed distance on the closed 7.2 km expressway loop. */
export function wrapRouteRelativeMeters(distanceMeters: number): number {
  const wrapped =
    ((distanceMeters + RIVAL_ROUTE_HALF_LENGTH_METERS) % ROUTE_LENGTH_METERS +
      ROUTE_LENGTH_METERS) %
      ROUTE_LENGTH_METERS -
    RIVAL_ROUTE_HALF_LENGTH_METERS;
  return wrapped === -RIVAL_ROUTE_HALF_LENGTH_METERS
    ? RIVAL_ROUTE_HALF_LENGTH_METERS
    : wrapped;
}

export function rivalIsRenderable(relativeMeters: number): boolean {
  return (
    relativeMeters >= -12 &&
    relativeMeters <= TRAFFIC_RENDER_AHEAD_METERS
  );
}

export function rivalIsRearViewRenderable(relativeMeters: number): boolean {
  return (
    relativeMeters < 0 &&
    relativeMeters >= -TRAFFIC_REARVIEW_RENDER_BEHIND_METERS
  );
}

function definitionFor(rival: RivalState): RivalDefinition {
  const base =
    RIVAL_DEFINITIONS[rival.definitionId as RivalDefinitionId] ?? RIVAL_DEFINITIONS.shirokage;
  if (
    rival.maxSpeedKphOverride === undefined &&
    rival.accelerationMultiplierOverride === undefined
  ) {
    return base;
  }
  return {
    ...base,
    maxSpeedKph: rival.maxSpeedKphOverride ?? base.maxSpeedKph,
    accelerationMultiplier: rival.accelerationMultiplierOverride ?? base.accelerationMultiplier
  };
}

function aggressionRatio(definition: RivalDefinition): number {
  return clamp(definition.aggression / 100, 0, 1);
}

function safeGapForAggression(baseGapMeters: number, definition: RivalDefinition): number {
  return baseGapMeters * (1.2 - aggressionRatio(definition) * 0.5);
}

function laneOpportunityThreshold(definition: RivalDefinition): number {
  return RIVAL_LANE_OPPORTUNITY_THRESHOLD_METERS - aggressionRatio(definition) * 12;
}

function laneClearance(
  rival: RivalState,
  lane: TrafficLane,
  obstacles: readonly RivalObstacle[],
  lookaheadSeconds = 0
): LaneClearance {
  let aheadMeters = Number.POSITIVE_INFINITY;
  let behindMeters = Number.POSITIVE_INFINITY;
  let blockerSpeedKph: number | null = null;
  let blockerIsTrainPartner = false;

  for (const obstacle of obstacles) {
    if (obstacle.lane !== lane || obstacle.id === rival.id) {
      continue;
    }
    const relativeSpeedMeters =
      ((obstacle.speedKph - rival.speedKph) / 3.6) * lookaheadSeconds;
    const delta = obstacle.relativeMeters - rival.relativeMeters + relativeSpeedMeters;
    if (delta >= 0 && delta < aheadMeters) {
      aheadMeters = delta;
      blockerSpeedKph = obstacle.speedKph;
      blockerIsTrainPartner = obstacle.trainPartner === true;
    } else if (delta < 0) {
      behindMeters = Math.min(behindMeters, -delta);
    }
  }

  return { aheadMeters, behindMeters, blockerSpeedKph, blockerIsTrainPartner };
}

// True when the blocker ahead is a fast train partner this rival would rather
// bump-draft than brake behind or swerve around.
function wantsTrainBehind(definition: RivalDefinition, clearance: LaneClearance): boolean {
  return (
    clearance.blockerSpeedKph !== null &&
    clearance.blockerIsTrainPartner &&
    aggressionRatio(definition) >= RIVAL_TRAIN_MIN_AGGRESSION_RATIO &&
    clearance.blockerSpeedKph >= RIVAL_TRAIN_MIN_PARTNER_SPEED_KPH &&
    definition.maxSpeedKph + RIVAL_DRAFT_TOP_SPEED_BONUS_KPH >
      clearance.blockerSpeedKph + RIVAL_TRAIN_CLOSE_RATE_KPH
  );
}

function chooseLane(
  rival: RivalState,
  definition: RivalDefinition,
  obstacles: readonly RivalObstacle[]
): TrafficLane {
  if (rival.laneChangeCooldown > 0 || rival.laneChange) {
    return rival.lane;
  }

  const current = laneClearance(rival, rival.lane, obstacles);
  const hasSlowBlocker =
    current.aheadMeters < definition.reactionDistanceMeters &&
    current.blockerSpeedKph !== null &&
    current.blockerSpeedKph < Math.min(rival.speedKph + 8, definition.maxSpeedKph - 12);
  if (!hasSlowBlocker || wantsTrainBehind(definition, current)) {
    return rival.lane;
  }

  const currentIndex = ROAD_LANES.indexOf(rival.lane);
  let bestTargetLane = rival.lane;
  let bestScore = current.aheadMeters;

  for (const candidateLane of ROAD_LANES) {
    if (candidateLane === rival.lane) {
      continue;
    }
    const candidateIndex = ROAD_LANES.indexOf(candidateLane);
    const laneSteps = Math.abs(candidateIndex - currentIndex);
    const immediateLane = laneStepToward(rival.lane, candidateLane);
    const immediateClearance = laneClearance(
      rival,
      immediateLane,
      obstacles,
      LANE_CHANGE_DURATION_SECONDS
    );
    const candidateClearance = laneClearance(
      rival,
      candidateLane,
      obstacles,
      LANE_CHANGE_DURATION_SECONDS * laneSteps
    );
    const hasSafeImmediateMerge =
      immediateClearance.aheadMeters >=
        safeGapForAggression(RIVAL_MIN_TARGET_LANE_AHEAD_GAP_METERS, definition) &&
      immediateClearance.behindMeters >=
        safeGapForAggression(RIVAL_MIN_TARGET_LANE_BEHIND_GAP_METERS, definition);
    const hasSafeCandidate =
      candidateClearance.aheadMeters >=
        safeGapForAggression(RIVAL_MIN_TARGET_LANE_AHEAD_GAP_METERS, definition) &&
      candidateClearance.behindMeters >=
        safeGapForAggression(RIVAL_MIN_TARGET_LANE_BEHIND_GAP_METERS, definition);
    const score = candidateClearance.aheadMeters - (laneSteps - 1) * 8;
    if (
      hasSafeImmediateMerge &&
      hasSafeCandidate &&
      score > bestScore + laneOpportunityThreshold(definition)
    ) {
      bestTargetLane = candidateLane;
      bestScore = score;
    }
  }

  return laneStepToward(rival.lane, bestTargetLane);
}

function laneFractionDuringIntent(intent: LaneChangeIntent): number {
  return (
    laneRoadFraction(intent.fromLane) +
    (laneRoadFraction(intent.targetLane) - laneRoadFraction(intent.fromLane)) *
      laneChangeProgress(intent)
  );
}

function inactiveSpeedForRatio(definition: RivalDefinition, ratio: number): number {
  const [minSpeed, maxSpeed] = definition.inactiveSpeedRangeKph;
  return minSpeed + (maxSpeed - minSpeed) * clamp(ratio, 0, 1);
}

function automaticGearForSpeed(speedKph: number): number {
  for (let gear = 1; gear <= MAX_GEAR; gear += 1) {
    if (speedKph < speedLimitForGear(gear) * 0.97) {
      return gear;
    }
  }
  return MAX_GEAR;
}

function playerLikeAcceleration(
  current: number,
  draftPowerMultiplier: number,
  definition: RivalDefinition
): number {
  const curveSpeedKph = Math.min(current, RIVAL_HIGH_SPEED_CURVE_CEILING_KPH);
  return Math.max(
    0,
    driveAccelerationKphPerSecond({
      speedKph: curveSpeedKph,
      gear: automaticGearForSpeed(curveSpeedKph),
      throttle: 1,
      brakePressure: 0,
      powerMultiplier: draftPowerMultiplier
    })
  ) * definition.accelerationMultiplier;
}

function speedToward(
  current: number,
  target: number,
  definition: RivalDefinition,
  dt: number,
  draftPowerMultiplier: number,
  brakingForBlocker: boolean
): number {
  if (Math.abs(target - current) < 0.001) {
    return target;
  }
  if (target >= current) {
    return Math.min(
      target,
      current + playerLikeAcceleration(current, draftPowerMultiplier, definition) * dt
    );
  }
  const decelerationKphPerSecond = brakingForBlocker
    ? definition.brakingKphPerSecond
    : RIVAL_OVERSPEED_BLEED_KPH_PER_SECOND;
  return Math.max(target, current - decelerationKphPerSecond * dt);
}

function freeRunTargetSpeed(
  rival: RivalState,
  draftedCapKph: number,
  encountered: boolean
): number {
  return rival.encounterActive || encountered
    ? draftedCapKph
    : rival.inactiveCruiseSpeedKph;
}

/** True when any session player is close enough to wake this rival. */
function anyPlayerInEncounterRange(
  rivalRelativeMeters: number,
  sessionPlayers: readonly RivalSessionPlayer[]
): boolean {
  return sessionPlayers.some((player) => {
    const relativeToPlayer = wrapRouteRelativeMeters(
      rivalRelativeMeters - player.relativeMeters
    );
    return (
      rivalIsRenderable(relativeToPlayer) ||
      rivalIsRearViewRenderable(relativeToPlayer)
    );
  });
}

/** The pursuit unit's quarry: whichever session player is physically closest. */
function nearestSessionPlayer(
  rivalRelativeMeters: number,
  sessionPlayers: readonly RivalSessionPlayer[]
): RivalSessionPlayer | null {
  let nearest: RivalSessionPlayer | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const player of sessionPlayers) {
    const distance = Math.abs(
      wrapRouteRelativeMeters(player.relativeMeters - rivalRelativeMeters)
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = player;
    }
  }
  return nearest;
}

export function stepRivals(
  rivals: readonly RivalState[],
  input: RivalStepInput
): RivalState[] {
  const safeDt = clamp(input.dt, 0, 0.05);
  const safePlayerSpeed = Math.max(0, input.playerSpeedKph);
  const sessionPlayers: readonly RivalSessionPlayer[] = input.sessionPlayers ?? [
    { relativeMeters: 0, lane: input.playerLane, speedKph: safePlayerSpeed }
  ];

  return rivals.map((rival) => {
    const definition = definitionFor(rival);
    const obstacles: RivalObstacle[] = [
      ...input.obstacles.map((obstacle) => ({
        ...obstacle,
        relativeMeters:
          rival.relativeMeters +
          wrapRouteRelativeMeters(obstacle.relativeMeters - rival.relativeMeters)
      })),
      ...rivals
        .filter((other) => other.id !== rival.id)
        .map((other) => ({
          id: other.id,
          lane: other.lane,
          speedKph: other.speedKph,
          relativeMeters:
            rival.relativeMeters +
            wrapRouteRelativeMeters(other.relativeMeters - rival.relativeMeters),
          trainPartner: true
        })),
      {
        id: "player",
        lane: input.playerLane,
        speedKph: safePlayerSpeed,
        relativeMeters:
          rival.relativeMeters + wrapRouteRelativeMeters(-rival.relativeMeters),
        trainPartner: true
      }
    ];
    const encountered = anyPlayerInEncounterRange(rival.relativeMeters, sessionPlayers);
    // A pursuit unit that has ever seen a player hunts the nearest one from
    // then on: it steers into the quarry's lane and aims for contact instead
    // of respecting the ambient safe-merge rules.
    const pursuitTarget =
      definition.pursuit === true && (rival.encounterActive || encountered)
        ? nearestSessionPlayer(rival.relativeMeters, sessionPlayers)
        : null;
    let laneAfterChoice = rival.lane;
    let laneChange = rival.laneChange ?? null;
    let committedLaneChange = false;

    if (laneChange !== null) {
      const laneStep = stepLaneChange(rival.lane, laneChange, safeDt);
      laneAfterChoice = laneStep.lane;
      laneChange = laneStep.intent;
      committedLaneChange = laneStep.committed;
    } else {
      const nextLane =
        pursuitTarget !== null
          ? rival.laneChangeCooldown <= 0
            ? laneStepToward(rival.lane, pursuitTarget.lane)
            : rival.lane
          : chooseLane(rival, definition, obstacles);
      laneChange = startLaneChangeIntent(rival.lane, nextLane);
      if (laneChange !== null) {
        const laneStep = stepLaneChange(rival.lane, laneChange, safeDt);
        laneAfterChoice = laneStep.lane;
        laneChange = laneStep.intent;
        committedLaneChange = laneStep.committed;
      }
    }

    const clearance = laneClearance(
      { ...rival, lane: laneAfterChoice },
      laneAfterChoice,
      obstacles
    );
    const draft = calculateDraftState(
      {
        id: rival.id,
        lane: laneAfterChoice,
        speedKph: rival.speedKph,
        relativeMeters: rival.relativeMeters
      },
      obstacles
    );
    const push = calculateLeadPushState(
      {
        id: rival.id,
        lane: laneAfterChoice,
        speedKph: rival.speedKph,
        relativeMeters: rival.relativeMeters
      },
      obstacles
    );
    const draftedCapKph =
      definition.maxSpeedKph + draft.boostRatio * RIVAL_DRAFT_TOP_SPEED_BONUS_KPH;
    const isEscapingBlocker = laneChange !== null;
    const isBlocked =
      !isEscapingBlocker &&
      clearance.aheadMeters < definition.reactionDistanceMeters &&
      clearance.blockerSpeedKph !== null;
    const isTraining = isBlocked && wantsTrainBehind(definition, clearance);
    // Pursuit speed policy: behind the quarry, run it down at a real
    // overspeed; ahead of it, brake-check into its path; on contact, keep a
    // gentle overspeed so the grind never stops.
    const pursuitGapMeters =
      pursuitTarget !== null
        ? wrapRouteRelativeMeters(pursuitTarget.relativeMeters - rival.relativeMeters)
        : 0;
    const desiredSpeed =
      pursuitTarget !== null
        ? pursuitGapMeters > POLICE_CONTACT_HOLD_RANGE_METERS
          ? pursuitTarget.speedKph + POLICE_RAM_OVERSPEED_KPH
          : pursuitGapMeters < -POLICE_CONTACT_HOLD_RANGE_METERS
            ? Math.max(40, pursuitTarget.speedKph - POLICE_BRAKE_CHECK_UNDERSPEED_KPH)
            : pursuitTarget.speedKph + 10
        : isBlocked
          ? isTraining
            ? clearance.blockerSpeedKph! + RIVAL_TRAIN_CLOSE_RATE_KPH
            : Math.max(0, clearance.blockerSpeedKph! - 4)
          : freeRunTargetSpeed(rival, draftedCapKph, encountered);
    const targetSpeed = Math.min(draftedCapKph, desiredSpeed);
    const brakingHard =
      pursuitTarget !== null
        ? targetSpeed < rival.speedKph
        : isBlocked && !isTraining;
    const speedKph = Math.min(
      rivalHardSpeedLimitKph(rival),
      speedToward(
        rival.speedKph,
        targetSpeed,
        definition,
        safeDt,
        draft.powerMultiplier * push.powerMultiplier,
        brakingHard
      )
    );
    const relativeMeters = wrapRouteRelativeMeters(
      rival.relativeMeters + ((speedKph - safePlayerSpeed) / 3.6) * safeDt
    );
    const laneTarget = laneRoadFraction(laneAfterChoice);
    const laneBlend = 1 - Math.exp(-safeDt * 5.8);
    const laneFraction =
      committedLaneChange
        ? laneTarget
        : laneChange !== null
          ? laneFractionDuringIntent(laneChange)
          : rival.laneFraction + (laneTarget - rival.laneFraction) * laneBlend;

    return {
      ...rival,
      lane: laneAfterChoice,
      laneFraction,
      speedKph,
      laneChange,
      encounterActive:
        rival.encounterActive ||
        encountered ||
        anyPlayerInEncounterRange(relativeMeters, sessionPlayers),
      relativeMeters,
      laneChangeCooldown:
        laneChange !== null
          ? rival.laneChangeCooldown
          : committedLaneChange
            ? definition.laneChangeCooldownSeconds
            : Math.max(0, rival.laneChangeCooldown - safeDt)
    };
  });
}
