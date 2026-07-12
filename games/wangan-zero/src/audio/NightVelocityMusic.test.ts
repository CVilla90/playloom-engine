import { describe, expect, it } from "vitest";
import { NIGHT_VELOCITY_STEPS, NIGHT_VELOCITY_TEMPO } from "./NightVelocityMusic";

describe("Night Velocity music arrangement", () => {
  it("uses a fast four-bar driving loop", () => {
    expect(NIGHT_VELOCITY_TEMPO).toBe(148);
    expect(NIGHT_VELOCITY_STEPS).toBe(64);
  });
});
