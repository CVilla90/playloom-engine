import { describe, expect, it } from "vitest";
import { InputManager } from "./InputManager";

describe("InputManager", () => {
  it("tracks tapped and held virtual keys alongside frame clearing", () => {
    const input = new InputManager(new EventTarget());

    input.tapVirtualKey("Enter");
    expect(input.wasPressed("enter")).toBe(true);
    expect(input.isDown("enter")).toBe(true);

    input.endFrame();
    expect(input.wasPressed("enter")).toBe(false);
    expect(input.isDown("enter")).toBe(false);

    input.setVirtualKeyDown("w", true);
    expect(input.wasPressed("w")).toBe(true);
    expect(input.isDown("w")).toBe(true);

    input.endFrame();
    expect(input.wasPressed("w")).toBe(false);
    expect(input.isDown("w")).toBe(true);

    input.setVirtualKeyDown("w", false);
    expect(input.isDown("w")).toBe(false);
  });

  it("clears virtual keys on blur-like events", () => {
    const target = new EventTarget();
    const input = new InputManager(target);

    input.setVirtualKeyDown("m", true);
    expect(input.isDown("m")).toBe(true);

    target.dispatchEvent(new Event("blur"));
    expect(input.isDown("m")).toBe(false);
    expect(input.wasPressed("m")).toBe(false);
  });
});
