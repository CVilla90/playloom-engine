import { describe, expect, it } from "vitest";
import {
  ActionMap,
  createCharacterLabActionBindings,
  createPlatformerActionBindings,
  type InputLike
} from "./ActionMap";

class MockInput implements InputLike {
  down = new Set<string>();
  pressed = new Set<string>();

  isDown(...keys: string[]): boolean {
    return keys.some((key) => this.down.has(key));
  }

  wasPressed(...keys: string[]): boolean {
    return keys.some((key) => this.pressed.has(key));
  }
}

describe("ActionMap", () => {
  it("resolves action states from key bindings", () => {
    const input = new MockInput();
    input.down.add("a");
    input.pressed.add("h");
    const actions = new ActionMap(input, createPlatformerActionBindings());

    expect(actions.isDown("move_left")).toBe(true);
    expect(actions.isDown("move_right")).toBe(false);
    expect(actions.wasPressed("toggle_hud")).toBe(true);
  });

  it("computes axis from two actions", () => {
    const input = new MockInput();
    const actions = new ActionMap(input, createPlatformerActionBindings());
    input.down.add("a");
    expect(actions.axis("move_left", "move_right")).toBe(-1);
    input.down.clear();
    input.down.add("d");
    expect(actions.axis("move_left", "move_right")).toBe(1);
  });

  it("supports rebinding actions", () => {
    const input = new MockInput();
    const actions = new ActionMap(input, createPlatformerActionBindings());
    actions.bind("jump", ["j"]);
    input.pressed.add("j");
    expect(actions.wasPressed("jump")).toBe(true);
  });

  it("provides default character-lab bindings", () => {
    const input = new MockInput();
    const actions = new ActionMap(input, createCharacterLabActionBindings());
    input.pressed.add("3");
    input.pressed.add("q");

    expect(actions.wasPressed("character_select_3")).toBe(true);
    expect(actions.wasPressed("tint_head_prev")).toBe(true);
    expect(actions.wasPressed("character_select_2")).toBe(false);
  });
});
