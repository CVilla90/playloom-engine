import { FixedLoop, SceneManager } from "@playloom/engine-core";
import { InputManager } from "@playloom/engine-input";
import { Renderer2D } from "@playloom/engine-renderer-canvas";
import type { AppServices } from "./context";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { GAME_MANIFEST } from "./types";

class GameApp {
  private readonly renderer: Renderer2D;
  private readonly input = new InputManager(window);
  private readonly sceneManager = new SceneManager();
  private readonly services: AppServices;

  constructor() {
    const root = document.querySelector<HTMLDivElement>("#app");
    if (!root) {
      throw new Error("Missing #app container");
    }

    const canvas = document.createElement("canvas");
    canvas.width = GAME_MANIFEST.width;
    canvas.height = GAME_MANIFEST.height;
    canvas.setAttribute("aria-label", GAME_MANIFEST.name);
    root.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context is not available");
    }

    this.renderer = new Renderer2D(ctx, GAME_MANIFEST.width, GAME_MANIFEST.height);
    this.services = {
      renderer: this.renderer,
      input: this.input
    };

    const showTitle = (): void => {
      this.sceneManager.setScene(new BootScene(this.services, startGame));
    };
    const startGame = (): void => {
      this.sceneManager.setScene(new GameScene(this.services, showTitle));
    };

    showTitle();

    const loop = new FixedLoop(
      GAME_MANIFEST.fps,
      (dt) => {
        this.sceneManager.update(dt);
        this.input.endFrame();
      },
      (alpha) => this.sceneManager.render(alpha)
    );

    loop.start();
  }
}

new GameApp();
