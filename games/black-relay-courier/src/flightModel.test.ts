import { describe, expect, it } from "vitest";
import {
  CERTIFICATION_BANDS,
  DEFAULT_SINGULARITY_SSI,
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
    expect(getSpeedState(95).label).toBe("Burn");
    expect(getSpeedState(320).label).toBe("Needle");
    expect(getSpeedState(560).label).toBe("Slipwake");
    expect(getSpeedState(760).label).toBe("Black Relay");
    expect(getSpeedState(DEFAULT_SINGULARITY_SSI + 10).label).toBe("Singularity Veil");
    expect(getSpeedState(1130, 1160).label).toBe("Black Relay");
    expect(getSpeedState(1170, 1160).label).toBe("Singularity Veil");
  });

  it("lets starter tuning cap the ship below the universal SSI ceiling", () => {
    let state = { throttle: 0, ssi: 0 };

    for (let i = 0; i < 20 * 60; i += 1) {
      state = stepFlightModel(state, { accelerate: true, brake: false }, 1 / 60, {
        accelerationMultiplier: 0.52,
        maxSsiMultiplier: 0.4
      });
    }

    expect(state.ssi).toBeGreaterThan(390);
    expect(state.ssi).toBeLessThanOrEqual(400);
    expect(state.ssi).toBeLessThan(MAX_SSI);
  });

  it("only lets the top engine breach singularity-veil speeds", () => {
    let starter = { throttle: 0, ssi: 0 };
    let courier = { throttle: 0, ssi: 0 };
    let upgraded = { throttle: 0, ssi: 0 };

    for (let i = 0; i < 20 * 60; i += 1) {
      starter = stepFlightModel(starter, { accelerate: true, brake: false }, 1 / 60, {
        accelerationMultiplier: 0.52,
        maxSsiMultiplier: 0.4
      });
      courier = stepFlightModel(courier, { accelerate: true, brake: false }, 1 / 60, {
        accelerationMultiplier: 1.34,
        maxSsiMultiplier: 0.92
      });
      upgraded = stepFlightModel(upgraded, { accelerate: true, brake: false }, 1 / 60, {
        accelerationMultiplier: 1.52,
        maxSsiMultiplier: 1.25
      });
    }

    expect(courier.ssi).toBeGreaterThan(starter.ssi);
    expect(courier.ssi).toBeLessThan(DEFAULT_SINGULARITY_SSI);
    expect(upgraded.ssi).toBeGreaterThan(starter.ssi);
    expect(upgraded.ssi).toBeGreaterThan(DEFAULT_SINGULARITY_SSI);
    expect(upgraded.ssi).toBeLessThanOrEqual(MAX_SSI * 1.25);
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
    expect(bandCommand(140, CERTIFICATION_BANDS[1]!)).toContain("Hold steady");
  });
});
