import { ROUTE_LENGTH_METERS, type DriveState } from "../drivingModel";

// --- Client-side prediction helpers (pure) -----------------------------------
// The server owns every speed and route position; the client predicts the same
// pure models one snapshot ahead so contact feels instant. These helpers keep
// that prediction honest:
// - contact tests need dead-reckoned present-time NPC geometry, because
//   snapshots arrive pre-resolved (a bumped car is already clamped outside the
//   player's contact window) and colliding against them can never fire the
//   local speed exchange or its flash/audio cue;
// - reconciliation needs to adopt authoritative state without erasing a
//   just-predicted bump exchange that stale snapshots have not confirmed yet.

/** Never dead-reckon past this; a stalled snapshot stream should freeze NPCs, not launch them. */
export const DEAD_RECKON_MAX_SECONDS = 0.15;
/** Predicted-vs-authoritative route divergence that always forces a hard snap (teleport-class error). */
export const HARD_SNAP_DISTANCE_METERS = 90;
/** Predicted-vs-authoritative speed divergence that forces a hard snap outside an impact hold. */
export const HARD_SNAP_SPEED_KPH = 45;
/** Exponential blend rate for smooth reconciliation. */
export const RECONCILE_BLEND_RATE = 7.5;
/** How long a locally predicted hard bump shields its exchanged speed from stale snapshots. */
export const IMPACT_RECONCILE_HOLD_SECONDS = 0.7;

export interface DriveReconciliation {
  readonly state: DriveState;
  /** Signed kph a hard snap moved the local car by (authoritative − predicted); 0 for smooth blends. */
  readonly snappedSpeedDeltaKph: number;
}

function wrapRouteDistance(distanceMeters: number): number {
  return ((distanceMeters % ROUTE_LENGTH_METERS) + ROUTE_LENGTH_METERS) % ROUTE_LENGTH_METERS;
}

function wrappedRouteDelta(fromMeters: number, toMeters: number): number {
  const half = ROUTE_LENGTH_METERS * 0.5;
  return ((toMeters - fromMeters + half) % ROUTE_LENGTH_METERS + ROUTE_LENGTH_METERS) % ROUTE_LENGTH_METERS - half;
}

function wrappedLerp(fromMeters: number, toMeters: number, ratio: number): number {
  return wrapRouteDistance(fromMeters + wrappedRouteDelta(fromMeters, toMeters) * ratio);
}

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio;
}

/** Advance a snapshot vehicle along the route to "now" for contact prediction. */
export function deadReckonDistanceMeters(
  distanceMeters: number,
  speedKph: number,
  ageSeconds: number
): number {
  const age = Math.min(DEAD_RECKON_MAX_SECONDS, Math.max(0, ageSeconds));
  return wrapRouteDistance(distanceMeters + (speedKph / 3.6) * age);
}

/**
 * Reconcile the locally predicted drive state against the authoritative
 * snapshot. Small divergence blends smoothly; teleport-class divergence snaps
 * hard and reports the applied speed correction so the caller can cue a crash
 * the local prediction never saw. While `impactHoldActive`, a large speed
 * disagreement is presumed to be a just-predicted bump exchange racing a stale
 * snapshot, and the prediction is held until the authoritative exchange lands.
 */
export function reconcileDrive(
  predicted: DriveState,
  authoritative: DriveState,
  dt: number,
  impactHoldActive = false
): DriveReconciliation {
  const distanceError = wrappedRouteDelta(predicted.distanceMeters, authoritative.distanceMeters);
  const speedErrorKph = authoritative.speedKph - predicted.speedKph;
  if (Math.abs(distanceError) > HARD_SNAP_DISTANCE_METERS) {
    return { state: { ...authoritative }, snappedSpeedDeltaKph: speedErrorKph };
  }
  if (Math.abs(speedErrorKph) > HARD_SNAP_SPEED_KPH) {
    if (impactHoldActive) {
      return { state: predicted, snappedSpeedDeltaKph: 0 };
    }
    return { state: { ...authoritative }, snappedSpeedDeltaKph: speedErrorKph };
  }
  const blend = 1 - Math.exp(-dt * RECONCILE_BLEND_RATE);
  return {
    state: {
      ...predicted,
      distanceMeters: wrappedLerp(predicted.distanceMeters, authoritative.distanceMeters, blend),
      speedKph: lerp(predicted.speedKph, authoritative.speedKph, blend),
      rpm: lerp(predicted.rpm, authoritative.rpm, blend),
      throttle: lerp(predicted.throttle, authoritative.throttle, blend),
      brakePressure: lerp(predicted.brakePressure, authoritative.brakePressure, blend),
      clutchPressure: lerp(predicted.clutchPressure, authoritative.clutchPressure, blend),
      gear: authoritative.gear,
      revLimiterActive: authoritative.revLimiterActive,
      maxSpeedKph: Math.max(predicted.maxSpeedKph, authoritative.maxSpeedKph)
    },
    snappedSpeedDeltaKph: 0
  };
}
