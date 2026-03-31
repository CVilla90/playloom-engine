import type { Scene } from "@playloom/engine-core";
import type { AppServices } from "../context";
import { GAME_MANIFEST } from "../types";

export class BootScene implements Scene {
  constructor(private readonly services: AppServices) {}

  update(_dt: number): void {}

  render(_alpha: number): void {
    const { renderer, input } = this.services;
    renderer.clear("#111318");
    renderer.text(GAME_MANIFEST.name, renderer.width / 2, renderer.height / 2 - 26, {
      align: "center",
      color: "#f5f0de",
      font: "bold 40px Trebuchet MS"
    });
    renderer.text("Playloom starter scene", renderer.width / 2, renderer.height / 2 + 6, {
      align: "center",
      color: "#c7d8f1",
      font: "20px Trebuchet MS"
    });
    renderer.text("Arrow keys state: " + (input.isDown("arrowleft", "arrowright", "arrowup", "arrowdown") ? "active" : "idle"), renderer.width / 2, renderer.height / 2 + 34, {
      align: "center",
      color: "#a0bf9a",
      font: "16px Trebuchet MS"
    });
  }
}
