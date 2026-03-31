import { describe, expect, it } from "vitest";
import {
  CERTIFICATION_BANDS,
  MAX_SSI,
  bandCommand,
  computeStrain,
  getSpeedState,
  stepFlightModel,
  updateHoldProgress
} from "./flightModel";

describe("black relay courier flight model", () => {
  it("builds throttle and speed while accelerating", () => {
    const next = stepFlightModel({ throttle: 0, ssi: 0 }, { accelerate: true, brake: false }, 1);

    expect(next.throttle).toBeGreaterThan(30);
    expect(next.ssi).toBeGreaterThan(20);
  });

  it("cuts throttle and speed aggressively while braking", () => {
    const next = stepFlightModel({ throttle: 70, ssi: 180 }, { accelerate: false, brake: true }, 1);

    expect(next.throttle).toBeLessThan(10);
    expect(next.ssi).toBeLessThan(120);
  });

  it("classifies speed states from SSI thresholds", () => {
    expect(getSpeedState(0).label).toBe("Drift");
    expect(getSpeedState(95).label).toBe("Streak");
    expect(getSpeedState(310).label).toBe("Slipwake");
    expect(getSpeedState(460).label).toBe("Black Relay");
  });

  it("supports a higher top-end SSI ceiling", () => {
    let state = { throttle: 0, ssi: 0 };

    for (let i = 0; i < 12 * 60; i += 1) {
      state = stepFlightModel(state, { accelerate: true, brake: false }, 1 / 60);
    }

    expect(state.ssi).toBeGreaterThan(500);
    expect(state.ssi).toBeLessThanOrEqual(MAX_SSI);
  });

  it("advances and decays certification hold progress around a target band", () => {
    const band = CERTIFICATION_BANDS[0]!;
    const charging = updateHoldProgress(0, 72, band, 1.5);
    const decaying = updateHoldProgress(charging, 10, band, 1);

    expect(charging).toBeGreaterThan(1);
    expect(decaying).toBeLessThan(charging);
  });

  it("reports strain and guidance from the current flight condition", () => {
    expect(computeStrain(100, 320, false)).toBeGreaterThan(70);
    expect(bandCommand(20, CERTIFICATION_BANDS[1]!)).toContain("Raise SSI");
    expect(bandCommand(170, CERTIFICATION_BANDS[1]!)).toContain("Hold steady");
  });
});
