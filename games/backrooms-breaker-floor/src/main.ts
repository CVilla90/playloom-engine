import { FixedLoop, SceneManager } from "@playloom/engine-core";
import { InputManager } from "@playloom/engine-input";
import { Renderer2D } from "@playloom/engine-renderer-canvas";
import type { AppServices } from "./context";
import type { PublicRoomService } from "./multiplayer/PublicRoomService";
import { LocalAuthoritativePublicRoomService } from "./multiplayer/LocalAuthoritativePublicRoomService";
import { NetworkedAuthoritativePublicRoomService } from "./multiplayer/NetworkedAuthoritativePublicRoomService";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { GAME_MANIFEST } from "./types";

function createRoomService(): PublicRoomService {
  const params = new URLSearchParams(window.location.search);
  if (params.get("room") === "local") {
    return new LocalAuthoritativePublicRoomService();
  }

  return new NetworkedAuthoritativePublicRoomService();
}

class GameApp {
  private readonly renderer: Renderer2D;
  private readonly input = new InputManager(window);
  private readonly sceneManager = new SceneManager();
  private readonly room: PublicRoomService = createRoomService();
  private readonly services: AppServices;

  constructor() {
    const root = document.querySelector<HTMLDivElement>("#app");
    if (!root) {
      throw new Error("Missing #app container");
    }

    const stage = document.createElement("div");
    stage.style.position = "relative";
    stage.style.width = "min(100%, 1100px)";
    stage.style.maxWidth = "1100px";
    stage.style.touchAction = "none";
    stage.style.userSelect = "none";
    root.appendChild(stage);

    const canvas = document.createElement("canvas");
    canvas.width = GAME_MANIFEST.width;
    canvas.height = GAME_MANIFEST.height;
    canvas.setAttribute("aria-label", GAME_MANIFEST.name);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    canvas.style.userSelect = "none";
    canvas.style.webkitUserSelect = "none";
    canvas.style.setProperty("-webkit-touch-callout", "none");
    stage.appendChild(canvas);

    const uiRoot = document.createElement("div");
    uiRoot.style.position = "absolute";
    uiRoot.style.inset = "0";
    uiRoot.style.pointerEvents = "none";
    uiRoot.style.touchAction = "none";
    stage.appendChild(uiRoot);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context is not available");
    }

    this.renderer = new Renderer2D(ctx, GAME_MANIFEST.width, GAME_MANIFEST.height);
    this.services = {
      renderer: this.renderer,
      input: this.input,
      uiRoot,
      room: this.room
    };

    const showTitle = (): void => {
      this.sceneManager.setScene(new BootScene(this.services, startGame));
    };
    const returnToTitle = (): void => {
      this.room.leave();
      showTitle();
    };
    const startGame = (): void => {
      this.sceneManager.setScene(new GameScene(this.services, returnToTitle));
    };

    showTitle();

    window.addEventListener("beforeunload", () => {
      this.room.destroy();
    });

    const loop = new FixedLoop(
      GAME_MANIFEST.fps,
      (dt) => {
        this.room.tick();
        this.sceneManager.update(dt);
        this.input.endFrame();
      },
      (alpha) => this.sceneManager.render(alpha)
    );

    loop.start();
  }
}

new GameApp();
