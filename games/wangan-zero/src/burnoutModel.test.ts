import { describe, expect, it } from "vitest";
import {
  BURNOUT_DURATION_SECONDS,
  burnoutIntensity,
  createBurnoutEffectState,
  stepBurnoutEffect
} from "./burnoutModel";

const readyInput = {
  speedKph: 24,
  gear: 1,
  rpm: 6200,
  clutchDown: true
} as const;

describe("burnout presentation model", () => {
  it("fires when a high-rev clutch launch is released in first below 40 km/h", () => {
    let state = stepBurnoutEffect(createBurnoutEffectState(), readyInput, 1 / 60);
    state = stepBurnoutEffect(state, { ...readyInput, clutchDown: false }, 1 / 60);

    expect(state.sequence).toBe(1);
    expect(state.remainingSeconds).toBe(BURNOUT_DURATION_SECONDS);
    expect(burnoutIntensity(state)).toBeGreaterThan(0);
  });

  it.each([
    ["second gear", { ...readyInput, gear: 2 }],
    ["40 km/h", { ...readyInput, speedKph: 40 }],
    ["low revs", { ...readyInput, rpm: 4999 }]
  ])("does not arm at %s", (_label, input) => {
    let state = stepBurnoutEffect(createBurnoutEffectState(), input, 1 / 60);
    state = stepBurnoutEffect(state, { ...input, clutchDown: false }, 1 / 60);

    expect(state.sequence).toBe(0);
    expect(burnoutIntensity(state)).toBe(0);
  });

  it("expires without changing or retriggering itself", () => {
    let state = stepBurnoutEffect(createBurnoutEffectState(), readyInput, 1 / 60);
    state = stepBurnoutEffect(state, { ...readyInput, clutchDown: false }, 1 / 60);
    for (let index = 0; index < 120; index += 1) {
      state = stepBurnoutEffect(state, { ...readyInput, clutchDown: false }, 1 / 60);
    }

    expect(state.sequence).toBe(1);
    expect(state.remainingSeconds).toBe(0);
    expect(burnoutIntensity(state)).toBe(0);
  });
});
