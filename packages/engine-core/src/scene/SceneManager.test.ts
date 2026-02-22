import { describe, expect, it } from "vitest";
import { SceneManager, type Scene } from "./SceneManager";

describe("SceneManager", () => {
  it("switches scenes and calls enter/exit hooks", () => {
    const events: string[] = [];
    const manager = new SceneManager();

    const sceneA: Scene = {
      onEnter: () => events.push("a:enter"),
      onExit: () => events.push("a:exit"),
      update: () => events.push("a:update"),
      render: () => events.push("a:render")
    };

    const sceneB: Scene = {
      onEnter: () => events.push("b:enter"),
      onExit: () => events.push("b:exit"),
      update: () => events.push("b:update"),
      render: () => events.push("b:render")
    };

    manager.setScene(sceneA);
    manager.update(0.016);
    manager.render(0.5);
    manager.setScene(sceneB);

    expect(events).toEqual(["a:enter", "a:update", "a:render", "a:exit", "b:enter"]);
    expect(manager.getCurrent()).toBe(sceneB);
  });
});
