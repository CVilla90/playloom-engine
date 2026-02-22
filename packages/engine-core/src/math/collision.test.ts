import { describe, expect, it } from "vitest";
import { circleVsCircle, clamp, pointInRect } from "./collision";

describe("collision helpers", () => {
  it("detects circle overlap", () => {
    expect(circleVsCircle({ x: 0, y: 0, r: 10 }, { x: 15, y: 0, r: 6 })).toBe(true);
    expect(circleVsCircle({ x: 0, y: 0, r: 10 }, { x: 40, y: 0, r: 6 })).toBe(false);
  });

  it("detects point in rect", () => {
    const rect = { x: 10, y: 20, width: 100, height: 60 };
    expect(pointInRect(30, 30, rect)).toBe(true);
    expect(pointInRect(5, 30, rect)).toBe(false);
  });

  it("clamps values", () => {
    expect(clamp(10, 0, 5)).toBe(5);
    expect(clamp(-2, 0, 5)).toBe(0);
    expect(clamp(3, 0, 5)).toBe(3);
  });
});
