import { describe, expect, it } from "vitest";
import {
  createRetroCollapseState,
  rearmRetroCollapseBandIfAbove,
  shouldTriggerRetroCollapse,
  type RetroCollapseBandState
} from "./retroCollapseBands";

describe("retro collapse bands", () => {
  it("rolls three descending bands and only rarity-gates the upper dump", () => {
    const chanceCalls: number[] = [];
    const state = createRetroCollapseState({
      range(min, max) {
        return min + (max - min) * 0.5;
      },
      chance(probability) {
        chanceCalls.push(probability);
        return false;
      }
    });

    expect(state).toHaveLength(3);
    expect(state[0]?.armed).toBe(false);
    expect(state[1]?.armed).toBe(true);
    expect(state[2]?.armed).toBe(true);
    expect(chanceCalls).toEqual([0.52]);
  });

  it("fires only while braking across the stored trigger and above the decel threshold", () => {
    const band: RetroCollapseBandState = {
      id: "wake-collapse",
      label: "Wake Collapse",
      min: 384,
      max: 468,
      accent: "#93ecff",
      tier: "minor",
      rarity: 1,
      minDecel: 140,
      trigger: 420,
      triggered: false,
      armed: true
    };

    expect(shouldTriggerRetroCollapse(band, 428, 416, true, 180)).toBe(true);
    expect(shouldTriggerRetroCollapse(band, 428, 416, false, 180)).toBe(false);
    expect(shouldTriggerRetroCollapse(band, 428, 416, true, 90)).toBe(false);
    expect(shouldTriggerRetroCollapse({ ...band, armed: false }, 428, 416, true, 180)).toBe(false);
    expect(shouldTriggerRetroCollapse({ ...band, triggered: true }, 428, 416, true, 180)).toBe(false);
  });

  it("rearms only after the ship climbs back above the band ceiling", () => {
    const band: RetroCollapseBandState = {
      id: "relay-dump",
      label: "Relay Dump",
      min: 576,
      max: 624,
      accent: "#b9d8ff",
      tier: "major",
      rarity: 0.52,
      minDecel: 180,
      trigger: 600,
      triggered: true,
      armed: true
    };

    const stillBelow = rearmRetroCollapseBandIfAbove(band, 602, 618, {
      range(min) {
        return min + 8;
      },
      chance() {
        return true;
      }
    });
    const rearmed = rearmRetroCollapseBandIfAbove(band, 618, 632, {
      range(min) {
        return min + 6;
      },
      chance() {
        return false;
      }
    });

    expect(stillBelow).toEqual(band);
    expect(rearmed.triggered).toBe(false);
    expect(rearmed.trigger).toBe(582);
    expect(rearmed.armed).toBe(false);
  });
});
