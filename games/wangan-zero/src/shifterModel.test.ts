import { describe, expect, it } from "vitest";
import {
  clampShifterPoint,
  gearAtShifterPoint,
  shifterGatePoint,
  type HShifterLayout
} from "./shifterModel";

const layout: HShifterLayout = {
  columns: [480, 525, 570],
  topY: 615,
  neutralY: 648,
  bottomY: 682,
  neutralBandHalfHeight: 10,
  hitPadding: 24
};

describe("wangan zero H-pattern shifter", () => {
  it("maps all six gear positions to three clear columns", () => {
    expect(shifterGatePoint(1, layout)).toEqual({ x: 480, y: 615 });
    expect(shifterGatePoint(2, layout)).toEqual({ x: 480, y: 682 });
    expect(shifterGatePoint(3, layout)).toEqual({ x: 525, y: 615 });
    expect(shifterGatePoint(4, layout)).toEqual({ x: 525, y: 682 });
    expect(shifterGatePoint(5, layout)).toEqual({ x: 570, y: 615 });
    expect(shifterGatePoint(6, layout)).toEqual({ x: 570, y: 682 });
  });

  it("resolves pointer releases to the nearest numbered gate", () => {
    expect(gearAtShifterPoint({ x: 472, y: 610 }, layout)).toBe(1);
    expect(gearAtShifterPoint({ x: 487, y: 688 }, layout)).toBe(2);
    expect(gearAtShifterPoint({ x: 520, y: 608 }, layout)).toBe(3);
    expect(gearAtShifterPoint({ x: 533, y: 690 }, layout)).toBe(4);
    expect(gearAtShifterPoint({ x: 578, y: 611 }, layout)).toBe(5);
    expect(gearAtShifterPoint({ x: 562, y: 686 }, layout)).toBe(6);
  });

  it("treats the crossbar as neutral and rejects releases outside the plate", () => {
    expect(gearAtShifterPoint({ x: 525, y: 648 }, layout)).toBeNull();
    expect(gearAtShifterPoint({ x: 620, y: 648 }, layout)).toBeNull();
  });

  it("keeps the dragged knob inside the visible gate", () => {
    expect(clampShifterPoint({ x: 900, y: 300 }, layout)).toEqual({ x: 570, y: 615 });
  });
});
