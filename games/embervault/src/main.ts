import { SynthAudio } from "@playloom/engine-audio";
import { FixedLoop, SceneManager } from "@playloom/engine-core";
import { InputManager } from "@playloom/engine-input";
import { Renderer2D } from "@playloom/engine-renderer-canvas";
import { createAssets } from "./assets";
import type { AppServices } from "./context";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "./data/config";
import { PHASE_CAP } from "./phase";
import { clearSave, loadSave, writeSave, type GameSave } from "./save";
import { CharacterSelectScene } from "./scenes/CharacterSelectScene";
import { PlayScene } from "./scenes/PlayScene";
import type { CharacterId, RunSnapshot } from "./types";

class EmbervaultApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: Renderer2D;
  private readonly input = new InputManager(window);
  private readonly audio = new SynthAudio();
  private readonly assets = createAssets();
  private readonly sceneManager = new SceneManager();
  private readonly services: AppServices;

  constructor(private readonly phaseCap: 1 | 2 | 3 | 4) {
    const root = document.querySelector<HTMLDivElement>("#app");
    if (!root) {
      throw new Error("Missing #app container");
    }

    this.canvas = document.createElement("canvas");
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    this.canvas.setAttribute("aria-label", "Embervault Descent Game");
    root.appendChild(this.canvas);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context is not available");
    }

    this.renderer = new Renderer2D(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);

    this.services = {
      renderer: this.renderer,
      input: this.input,
      audio: this.audio,
      assets: this.assets,
      phaseCap: this.phaseCap,
      startNewRun: (characterId) => this.startNewRun(characterId),
      continueRun: () => this.continueRun(),
      restartFlow: () => this.restartFlow(),
      saveRun: (characterId, snapshot) => this.saveRun(characterId, snapshot)
    };

    const unlockAudio = (): void => {
      this.audio.unlock();
    };

    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);

    if (this.phaseCap >= 3) {
      this.openCharacterSelect();
    } else {
      this.startNewRun("human");
    }

    const loop = new FixedLoop(
      60,
      (dt) => {
        this.sceneManager.update(dt);
        this.input.endFrame();
      },
      (alpha) => {
        this.sceneManager.render(alpha);
      }
    );

    loop.start();
  }

  private openCharacterSelect(): void {
    const save = this.phaseCap >= 3 ? loadSave() : null;
    this.sceneManager.setScene(new CharacterSelectScene(this.services, Boolean(save)));
  }

  private startNewRun(characterId: CharacterId): void {
    if (this.phaseCap >= 3) {
      clearSave();
    }

    this.sceneManager.setScene(
      new PlayScene(this.services, {
        characterId
      })
    );
  }

  private continueRun(): void {
    if (this.phaseCap < 3) {
      this.startNewRun("human");
      return;
    }

    const save = loadSave();
    if (!save) {
      this.openCharacterSelect();
      return;
    }

    this.sceneManager.setScene(
      new PlayScene(this.services, {
        characterId: save.characterId,
        snapshot: save.snapshot
      })
    );
  }

  private restartFlow(): void {
    if (this.phaseCap >= 3) {
      this.openCharacterSelect();
      return;
    }

    this.startNewRun("human");
  }

  private saveRun(characterId: CharacterId, snapshot: RunSnapshot): void {
    if (this.phaseCap < 3) return;
    const save: GameSave = {
      version: 1,
      savedAt: new Date().toISOString(),
      characterId,
      snapshot
    };
    writeSave(save);
  }
}

new EmbervaultApp(PHASE_CAP);
