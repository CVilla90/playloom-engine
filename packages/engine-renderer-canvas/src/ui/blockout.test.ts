import { describe, expect, it } from "vitest";
import {
  drawIndustrialCeilingSegment,
  drawIndustrialFloorSegment,
  drawIndustrialStairFlight
} from "./blockout";

class MockRenderer {
  width = 960;
  height = 540;
  ctx = {
    save() {
      return;
    },
    restore() {
      return;
    }
  };

  rectCalls = 0;
  lineCalls = 0;
  circleCalls = 0;
  strokeRectCalls = 0;

  rect(): void {
    this.rectCalls += 1;
  }

  line(): void {
    this.lineCalls += 1;
  }

  circle(): void {
    this.circleCalls += 1;
  }

  strokeRect(): void {
    this.strokeRectCalls += 1;
  }

  text(): void {
    return;
  }
}

describe("blockout helpers", () => {
  it("draws floor primitives", () => {
    const renderer = new MockRenderer();
    drawIndustrialFloorSegment(renderer as never, 10, 20, 160, 22);
    expect(renderer.rectCalls).toBeGreaterThanOrEqual(3);
    expect(renderer.circleCalls).toBeGreaterThan(0);
  });

  it("draws ceiling primitives", () => {
    const renderer = new MockRenderer();
    drawIndustrialCeilingSegment(renderer as never, 10, 20, 160, 14);
    expect(renderer.rectCalls).toBeGreaterThanOrEqual(3);
    expect(renderer.lineCalls).toBeGreaterThan(0);
  });

  it("draws stair primitives", () => {
    const renderer = new MockRenderer();
    drawIndustrialStairFlight(renderer as never, 10, 20, 120, 140, 1);
    expect(renderer.strokeRectCalls).toBeGreaterThan(0);
    expect(renderer.rectCalls).toBeGreaterThan(10);
    expect(renderer.lineCalls).toBeGreaterThanOrEqual(2);
  });
});
