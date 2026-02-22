import { describe, expect, it } from "vitest";
import { composeTintedSpriteFrame, type SpriteComposeContext } from "./tinting";

class MockComposeContext implements SpriteComposeContext {
  canvas = {
    width: 0,
    height: 0
  };

  imageSmoothingEnabled = true;
  globalCompositeOperation: GlobalCompositeOperation = "source-over";
  globalAlpha = 1;
  fillStyle = "#000000";

  clearCalls = 0;
  drawCalls = 0;
  fillCalls = 0;
  saveCalls = 0;
  restoreCalls = 0;

  clearRect(): void {
    this.clearCalls += 1;
  }

  drawImage(): void {
    this.drawCalls += 1;
  }

  fillRect(): void {
    this.fillCalls += 1;
  }

  save(): void {
    this.saveCalls += 1;
  }

  restore(): void {
    this.restoreCalls += 1;
  }
}

describe("composeTintedSpriteFrame", () => {
  it("resizes output and draws one frame", () => {
    const context = new MockComposeContext();
    composeTintedSpriteFrame(context, {
      sourceImage: {} as CanvasImageSource,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 48,
      sourceHeight: 48,
      outputWidth: 64,
      outputHeight: 72
    });

    expect(context.canvas.width).toBe(64);
    expect(context.canvas.height).toBe(72);
    expect(context.clearCalls).toBe(1);
    expect(context.drawCalls).toBe(1);
    expect(context.imageSmoothingEnabled).toBe(false);
  });

  it("applies only non-null tint layers", () => {
    const context = new MockComposeContext();
    composeTintedSpriteFrame(context, {
      sourceImage: {} as CanvasImageSource,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: 48,
      sourceHeight: 48,
      outputWidth: 64,
      outputHeight: 72,
      tintLayers: [
        { x: 0, y: 0, width: 10, height: 10, color: "#ff00ff", alpha: 0.6 },
        { x: 0, y: 12, width: 10, height: 10, color: null },
        { x: 0, y: 24, width: 10, height: 10, color: "#00ffff" }
      ]
    });

    expect(context.fillCalls).toBe(2);
    expect(context.saveCalls).toBe(2);
    expect(context.restoreCalls).toBe(2);
  });
});
