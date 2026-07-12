import { describe, expect, it } from "vitest";
import {
  laneChangeBlinkerLit,
  laneChangeProgress,
  startLaneChangeIntent,
  stepLaneChange
} from "./laneChangeModel";

describe("wangan zero lane change model", () => {
  it("signals before committing the lane change", () => {
    const intent = startLaneChangeIntent("center", "left");
    const halfStep = stepLaneChange("center", intent, 0.5);

    expect(halfStep.lane).toBe("center");
    expect(halfStep.intent?.targetLane).toBe("left");
    expect(halfStep.committed).toBe(false);
    expect(laneChangeProgress(halfStep.intent)).toBeGreaterThan(0.45);
  });

  it("commits after one second", () => {
    const intent = startLaneChangeIntent("center", "right");
    const committed = stepLaneChange("center", intent, 1);

    expect(committed.lane).toBe("right");
    expect(committed.intent).toBeNull();
    expect(committed.committed).toBe(true);
  });

  it("blinks at the start and half-second pulse", () => {
    const intent = startLaneChangeIntent("center", "right")!;

    expect(laneChangeBlinkerLit(intent)).toBe(true);
    expect(laneChangeBlinkerLit({ ...intent, elapsedSeconds: 0.25 })).toBe(false);
    expect(laneChangeBlinkerLit({ ...intent, elapsedSeconds: 0.5 })).toBe(true);
  });
});
