import "./app.css";
import { FixedLoop, SceneManager } from "@playloom/engine-core";
import { InputManager } from "@playloom/engine-input";
import { Renderer2D } from "@playloom/engine-renderer-canvas";
import type { AppServices } from "./context";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import type { CourierSaveData } from "./save";
import { TouchConsoleControls } from "./touch/TouchConsoleControls";
import { GAME_MANIFEST } from "./types";

class GameApp {
  private readonly renderer: Renderer2D;
  private readonly input = new InputManager(window);
  private readonly sceneManager = new SceneManager();
  private readonly touchControls: TouchConsoleControls;
  private readonly services: AppServices;

  constructor() {
    const root = document.querySelector<HTMLDivElement>("#app");
    if (!root) {
      throw new Error("Missing #app container");
    }

    const shell = document.createElement("div");
    shell.className = "courier-app-shell";
    const portraitNote = document.createElement("div");
    portraitNote.className = "courier-app-note";
    portraitNote.textContent = "Rotate to landscape for the clearest cockpit read. The touch deck below keeps the keyboard-first controls reachable on phones.";
    const stage = document.createElement("div");
    stage.className = "courier-app-stage";
    const canvas = document.createElement("canvas");
    canvas.width = GAME_MANIFEST.width;
    canvas.height = GAME_MANIFEST.height;
    canvas.setAttribute("aria-label", GAME_MANIFEST.name);
    stage.appendChild(canvas);
    shell.append(portraitNote, stage);
    root.appendChild(shell);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context is not available");
    }

    this.renderer = new Renderer2D(ctx, GAME_MANIFEST.width, GAME_MANIFEST.height);
    this.services = {
      renderer: this.renderer,
      input: this.input
    };
    this.touchControls = new TouchConsoleControls(this.input, shell);
    this.touchControls.attach();

    const showTitle = (): void => {
      this.sceneManager.setScene(new BootScene(this.services, startFlight));
    };
    const startFlight = (save: CourierSaveData | null = null): void => {
      this.sceneManager.setScene(new GameScene(this.services, showTitle, save));
    };

    showTitle();
    this.touchControls.syncScene(this.sceneManager.getCurrent());

    const loop = new FixedLoop(
      GAME_MANIFEST.fps,
      (dt) => {
        this.sceneManager.update(dt);
        this.touchControls.syncScene(this.sceneManager.getCurrent());
        this.input.endFrame();
      },
      (alpha) => this.sceneManager.render(alpha)
    );

    loop.start();
  }
}

new GameApp();
