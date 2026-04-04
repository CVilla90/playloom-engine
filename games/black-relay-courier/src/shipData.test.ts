import { describe, expect, it } from "vitest";
import { STARTING_CREDITS_MAX, STARTING_CREDITS_MIN, rollStartingCredits } from "./shipData";

describe("black relay courier ship data", () => {
  it("rolls starting credits across the full configured opening range", () => {
    expect(rollStartingCredits(0)).toBe(STARTING_CREDITS_MIN);
    expect(rollStartingCredits(1)).toBe(STARTING_CREDITS_MAX);
    expect(rollStartingCredits(0.5)).toBeGreaterThanOrEqual(STARTING_CREDITS_MIN);
    expect(rollStartingCredits(0.5)).toBeLessThanOrEqual(STARTING_CREDITS_MAX);
  });

  it("clamps out-of-range roll inputs", () => {
    expect(rollStartingCredits(-10)).toBe(STARTING_CREDITS_MIN);
    expect(rollStartingCredits(10)).toBe(STARTING_CREDITS_MAX);
  });
});
