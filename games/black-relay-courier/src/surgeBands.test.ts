import { describe, expect, it } from "vitest";
import {
  createDramaticSurgeState,
  rearmSurgeBandIfBelow,
  shouldTriggerSurge,
  type DramaticSurgeBandState
} from "./surgeBands";

describe("dramatic surge bands", () => {
  it("rolls one trigger per band and only rarity-gates the major ones", () => {
    const chanceCalls: number[] = [];
    const state = createDramaticSurgeState({
      range(min, max) {
        return min + (max - min) * 0.5;
      },
      chance(probability) {
        chanceCalls.push(probability);
        return probability > 0.5;
      }
    });

    for (const band of state) {
      expect(band.trigger).toBeGreaterThanOrEqual(band.min);
      expect(band.trigger).toBeLessThanOrEqual(band.max);
      expect(band.triggered).toBe(false);
    }

    expect(state[0]?.armed).toBe(true);
    expect(state[1]?.armed).toBe(true);
    expect(state[2]?.armed).toBe(true);
    expect(state[3]?.armed).toBe(true);
    expect(state[4]?.armed).toBe(false);
    expect(chanceCalls).toEqual([0.58, 0.42]);
  });

  it("fires only when accelerating across the stored armed trigger", () => {
    const band: DramaticSurgeBandState = {
      id: "warm-spike",
      label: "Warm Spike",
      min: 80,
      max: 120,
      accent: "#7edaff",
      tier: "minor",
      rarity: 1,
      trigger: 96,
      triggered: false,
      armed: true
    };

    expect(shouldTriggerSurge(band, 95, 97, true)).toBe(true);
    expect(shouldTriggerSurge(band, 95, 97, false)).toBe(false);
    expect(shouldTriggerSurge({ ...band, triggered: true }, 95, 97, true)).toBe(false);
    expect(shouldTriggerSurge({ ...band, armed: false }, 95, 97, true)).toBe(false);
    expect(shouldTriggerSurge(band, 96, 97, true)).toBe(false);
  });

  it("rearms only after a band actually drops back below its floor", () => {
    const band: DramaticSurgeBandState = {
      id: "slip-crack",
      label: "Slip Crack",
      min: 380,
      max: 420,
      accent: "#ffb08f",
      tier: "major",
      rarity: 0.58,
      trigger: 408,
      triggered: true,
      armed: true
    };

    const stillAboveFloor = rearmSurgeBandIfBelow(band, 392, 384, {
      range(min) {
        return min + 4;
      },
      chance() {
        return true;
      }
    });
    const crossedBelowFloor = rearmSurgeBandIfBelow(band, 384, 372, {
      range(min) {
        return min + 6;
      },
      chance() {
        return false;
      }
    });
    const untouchedBelowFloor = rearmSurgeBandIfBelow({ ...band, triggered: false, armed: false }, 340, 320, {
      range(min) {
        return min + 8;
      },
      chance() {
        return true;
      }
    });

    expect(stillAboveFloor).toEqual(band);
    expect(crossedBelowFloor.triggered).toBe(false);
    expect(crossedBelowFloor.trigger).toBe(386);
    expect(crossedBelowFloor.armed).toBe(false);
    expect(untouchedBelowFloor).toEqual({ ...band, triggered: false, armed: false });
  });
});
