import { describe, expect, it } from "vitest";
import { tunnelPortalVisualDistance } from "./tunnelTransition";

describe("Yomikage portal visual depth", () => {
  it("meets the camera plane exactly at the physical threshold", () => {
    // A zero visual distance at the boundary is what makes the hard
    // environment cut land in the same frame the mouth passes the windshield.
    expect(tunnelPortalVisualDistance(0, 460)).toBe(0);
  });

  it("tracks the physical distance one-to-one inside the road envelope", () => {
    for (const distance of [1, 60, 180, 320, 460]) {
      expect(tunnelPortalVisualDistance(distance, 460)).toBe(distance);
    }
  });

  it("clamps distances outside the visible road envelope", () => {
    expect(tunnelPortalVisualDistance(-20, 460)).toBe(0);
    expect(tunnelPortalVisualDistance(900, 460)).toBe(460);
  });
});
