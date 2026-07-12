import { clamp } from "./drivingModel";

/**
 * Visual distance of a tunnel portal for a given physical distance ahead.
 *
 * The mapping is intentionally the identity (clamped to the drawable road):
 * the mouth must meet the camera plane exactly when the car crosses the sector
 * boundary, so the hard environment cut lands at the same instant the portal
 * frame sweeps past the windshield. Because each aperture is painted as a live
 * window onto the real next environment, the mouth engulfing the view during
 * the final metres is the desired hand-off, not an artifact. Any near-distance
 * floor here re-introduces the old bug where tunnel entry/exit "triggered"
 * while the mouth still looked far ahead.
 */
export function tunnelPortalVisualDistance(
  actualDistanceAhead: number,
  lookaheadMeters: number
): number {
  return clamp(actualDistanceAhead, 0, Math.max(1, lookaheadMeters));
}
