import "./app.css";
import { FixedLoop, SceneManager } from "@playloom/engine-core";
import { InputManager } from "@playloom/engine-input";
import { Renderer2D } from "@playloom/engine-renderer-canvas";
import type { AppServices } from "./context";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { TouchDriveControls } from "./touch/TouchDriveControls";
import { GAME_MANIFEST } from "./types";
import { WanganSessionClient } from "./multiplayer/WanganSessionClient";
import type { PlayerProfile } from "./multiplayer/playerProfile";
import { JoinSessionModal } from "./ui/JoinSessionModal";

class GameApp {
  private readonly renderer: Renderer2D;
  private readonly input = new InputManager(window);
  private readonly sceneManager = new SceneManager();
  private readonly services: AppServices;
  private readonly touchControls: TouchDriveControls;
  private readonly session = new WanganSessionClient();
  private readonly joinModal: JoinSessionModal;
  private selectedProfile: PlayerProfile | null = null;

  constructor() {
    this.selectedProfile = this.session.getSavedProfile();
    const root = document.querySelector<HTMLDivElement>("#app");
    if (!root) {
      throw new Error("Missing #app container");
    }

    const shell = document.createElement("div");
    shell.className = "artery-app-shell";
    const stage = document.createElement("div");
    stage.className = "artery-app-stage";
    const canvas = document.createElement("canvas");
    canvas.width = GAME_MANIFEST.width;
    canvas.height = GAME_MANIFEST.height;
    canvas.setAttribute("aria-label", GAME_MANIFEST.name);
    stage.appendChild(canvas);
    shell.appendChild(stage);
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
    this.touchControls = new TouchDriveControls(this.input, shell);
    this.touchControls.attach();

    const showTitle = (): void => {
      this.session.leave();
      this.sceneManager.setScene(new BootScene(
        this.services,
        () => this.joinModal.open(),
        this.selectedProfile
      ));
    };
    const startRun = (profile: PlayerProfile): void => {
      this.selectedProfile = profile;
      this.sceneManager.setScene(new GameScene(this.services, showTitle, this.session, profile));
    };
    this.joinModal = new JoinSessionModal(shell, this.session, startRun);

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
    window.addEventListener("pagehide", () => {
      this.joinModal.destroy();
      this.session.destroy();
    }, { once: true });
  }
}

new GameApp();
