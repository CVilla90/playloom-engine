import { clamp } from "./drivingModel";
import type { TrafficLane } from "./trafficModel";

export interface DraftVehicle {
  readonly id: string;
  readonly lane: TrafficLane;
  readonly speedKph: number;
  readonly relativeMeters: number;
}

export interface DraftState {
  readonly active: boolean;
  readonly targetId: string | null;
  readonly distanceMeters: number;
  readonly frontSpeedKph: number;
  readonly boostRatio: number;
  readonly powerMultiplier: number;
}

export const DRAFT_MIN_DISTANCE_METERS = 1;
export const DRAFT_CLOSE_RISK_DISTANCE_METERS = 4;
// The wake becomes detectable just inside 400 m, then builds progressively as
// the following car closes. The old 500 m search radius was misleading because
// its sharp 18 m falloff made the actual effect disappear around 50–60 m.
export const DRAFT_MAX_DISTANCE_METERS = 400;
export const DRAFT_MIN_FRONT_SPEED_KPH = 60;
export const DRAFT_FULL_FRONT_SPEED_KPH = 240;
// The slipstream is strong but concentrated: the sigmoid below still reads a
// target out to 500 m, yet most of this multiplier only exists within a few
// car lengths (~79% at the 12 m bumper gap, ~4% at 60 m). Tuned together with
// the Reimei profile so a glued drafter equilibrates around ~336 km/h.
export const DRAFT_MAX_POWER_MULTIPLIER = 1.75;
export const DRAFT_HALF_EFFECT_DISTANCE_METERS = 105;
export const DRAFT_FALLOFF_SHARPNESS = 2.05;
// Below this ratio the slipstream is a rounding error — treat it as inactive
// so the HUD chip does not flicker "+0%" at long range.
export const DRAFT_ACTIVE_MIN_RATIO = 0.02;

// Being pushed helps too: a car sitting right on the leader's bumper fills its
// wake and shoves it on contact, so the leader gets a smaller power bonus of
// its own. This is what makes a two-car bump-draft train faster for BOTH cars.
export const LEAD_PUSH_MAX_POWER_MULTIPLIER = 1.28;
export const LEAD_PUSH_MAX_DISTANCE_METERS = 48;
export const LEAD_PUSH_HALF_EFFECT_DISTANCE_METERS = 14;
// A pusher that cannot keep pace forms no pressure pocket.
export const LEAD_PUSH_MAX_SPEED_DEFICIT_KPH = 15;

export const NO_DRAFT: DraftState = {
  active: false,
  targetId: null,
  distanceMeters: Number.POSITIVE_INFINITY,
  frontSpeedKph: 0,
  boostRatio: 0,
  powerMultiplier: 1
};

export function findDraftTarget(
  vehicle: DraftVehicle,
  vehicles: readonly DraftVehicle[]
): DraftVehicle | null {
  let target: DraftVehicle | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of vehicles) {
    if (candidate.id === vehicle.id || candidate.lane !== vehicle.lane) {
      continue;
    }
    const distance = candidate.relativeMeters - vehicle.relativeMeters;
    if (distance > 0 && distance < nearestDistance) {
      nearestDistance = distance;
      target = candidate;
    }
  }

  return target;
}

function partnerSpeedFactor(partnerSpeedKph: number): number {
  return clamp(
    (partnerSpeedKph - DRAFT_MIN_FRONT_SPEED_KPH) /
      (DRAFT_FULL_FRONT_SPEED_KPH - DRAFT_MIN_FRONT_SPEED_KPH),
    0,
    1
  );
}

// Rational sigmoid: 1 at the minimum distance, half effect at `halfMeters`
// past it, and a fast fade beyond — so the boost lives at the bumper instead
// of being free speed from half a kilometer back.
function proximityFactor(distanceMeters: number, halfMeters: number): number {
  const gap = Math.max(0, distanceMeters - DRAFT_MIN_DISTANCE_METERS);
  return 1 / (1 + Math.pow(gap / halfMeters, DRAFT_FALLOFF_SHARPNESS));
}

export function draftBoostRatio(distanceMeters: number, frontSpeedKph: number): number {
  if (
    distanceMeters <= 0 ||
    distanceMeters >= DRAFT_MAX_DISTANCE_METERS ||
    frontSpeedKph < DRAFT_MIN_FRONT_SPEED_KPH
  ) {
    return 0;
  }

  const distanceFactor = proximityFactor(distanceMeters, DRAFT_HALF_EFFECT_DISTANCE_METERS);
  return clamp(distanceFactor * partnerSpeedFactor(frontSpeedKph), 0, 1);
}

export function calculateDraftState(
  vehicle: DraftVehicle,
  vehicles: readonly DraftVehicle[]
): DraftState {
  const target = findDraftTarget(vehicle, vehicles);
  if (target === null) {
    return NO_DRAFT;
  }

  const distanceMeters = target.relativeMeters - vehicle.relativeMeters;
  const boostRatio = draftBoostRatio(distanceMeters, target.speedKph);
  if (boostRatio < DRAFT_ACTIVE_MIN_RATIO) {
    return {
      active: false,
      targetId: target.id,
      distanceMeters,
      frontSpeedKph: target.speedKph,
      boostRatio: 0,
      powerMultiplier: 1
    };
  }

  return {
    active: true,
    targetId: target.id,
    distanceMeters,
    frontSpeedKph: target.speedKph,
    boostRatio,
    powerMultiplier: 1 + boostRatio * (DRAFT_MAX_POWER_MULTIPLIER - 1)
  };
}

export interface LeadPushState {
  readonly active: boolean;
  readonly pusherId: string | null;
  readonly distanceMeters: number;
  readonly pusherSpeedKph: number;
  readonly pushRatio: number;
  readonly powerMultiplier: number;
}

export const NO_LEAD_PUSH: LeadPushState = {
  active: false,
  pusherId: null,
  distanceMeters: Number.POSITIVE_INFINITY,
  pusherSpeedKph: 0,
  pushRatio: 0,
  powerMultiplier: 1
};

export function findLeadPusher(
  vehicle: DraftVehicle,
  vehicles: readonly DraftVehicle[]
): DraftVehicle | null {
  let pusher: DraftVehicle | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of vehicles) {
    if (candidate.id === vehicle.id || candidate.lane !== vehicle.lane) {
      continue;
    }
    const distance = vehicle.relativeMeters - candidate.relativeMeters;
    if (distance > 0 && distance < nearestDistance) {
      nearestDistance = distance;
      pusher = candidate;
    }
  }

  return pusher;
}

export function leadPushRatio(
  distanceMeters: number,
  pusherSpeedKph: number,
  leaderSpeedKph: number
): number {
  if (
    distanceMeters <= 0 ||
    distanceMeters >= LEAD_PUSH_MAX_DISTANCE_METERS ||
    pusherSpeedKph < DRAFT_MIN_FRONT_SPEED_KPH ||
    pusherSpeedKph < leaderSpeedKph - LEAD_PUSH_MAX_SPEED_DEFICIT_KPH
  ) {
    return 0;
  }

  const distanceFactor = proximityFactor(distanceMeters, LEAD_PUSH_HALF_EFFECT_DISTANCE_METERS);
  return clamp(distanceFactor * partnerSpeedFactor(pusherSpeedKph), 0, 1);
}

/** Leader-side half of the train: the bonus from a car glued to your bumper. */
export function calculateLeadPushState(
  vehicle: DraftVehicle,
  vehicles: readonly DraftVehicle[]
): LeadPushState {
  const pusher = findLeadPusher(vehicle, vehicles);
  if (pusher === null) {
    return NO_LEAD_PUSH;
  }

  const distanceMeters = vehicle.relativeMeters - pusher.relativeMeters;
  const pushRatio = leadPushRatio(distanceMeters, pusher.speedKph, vehicle.speedKph);
  if (pushRatio < DRAFT_ACTIVE_MIN_RATIO) {
    return {
      active: false,
      pusherId: pusher.id,
      distanceMeters,
      pusherSpeedKph: pusher.speedKph,
      pushRatio: 0,
      powerMultiplier: 1
    };
  }

  return {
    active: true,
    pusherId: pusher.id,
    distanceMeters,
    pusherSpeedKph: pusher.speedKph,
    pushRatio,
    powerMultiplier: 1 + pushRatio * (LEAD_PUSH_MAX_POWER_MULTIPLIER - 1)
  };
}
