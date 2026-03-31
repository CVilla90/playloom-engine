import type { Scene } from "@playloom/engine-core";
import { SynthAudio } from "@playloom/engine-audio";
import { ActionMap, createMenuActionBindings } from "@playloom/engine-input";
import { drawPanel, drawTextBlock } from "@playloom/engine-renderer-canvas";
import type { AppServices } from "../context";
import { FLIGHT_SLICE_TITLE, GAME_MANIFEST, GAME_TAGLINE } from "../types";

export class BootScene implements Scene {
  private readonly actions: ActionMap;
  private readonly audio = new SynthAudio();
  private elapsed = 0;

  private readonly unlockAudio = (): void => {
    this.audio.unlock();
  };

  constructor(
    private readonly services: AppServices,
    private readonly startGame: () => void
  ) {
    this.actions = new ActionMap(this.services.input, createMenuActionBindings());
  }

  onEnter(): void {
    window.addEventListener("keydown", this.unlockAudio);
    window.addEventListener("pointerdown", this.unlockAudio, { passive: true });
  }

  onExit(): void {
    window.removeEventListener("keydown", this.unlockAudio);
    window.removeEventListener("pointerdown", this.unlockAudio);
  }

  update(dt: number): void {
    this.elapsed += dt;

    if (!this.actions.wasPressed("menu_confirm")) {
      return;
    }

    this.audio.whoosh();
    this.startGame();
  }

  render(_alpha: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const centerX = renderer.width * 0.5;
    const cardX = centerX - 338;
    const cardY = 126;
    const promptAlpha = 0.48 + Math.sin(this.elapsed * 3.1) * 0.24;

    renderer.clear("#04060b");

    const sky = ctx.createLinearGradient(0, 0, 0, renderer.height);
    sky.addColorStop(0, "#020306");
    sky.addColorStop(0.58, "#05070c");
    sky.addColorStop(1, "#040509");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    const bloom = ctx.createRadialGradient(centerX, 204, 0, centerX, 204, 520);
    bloom.addColorStop(0, "rgba(255, 235, 176, 0.1)");
    bloom.addColorStop(0.45, "rgba(139, 150, 178, 0.06)");
    bloom.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    for (let i = 0; i < 84; i += 1) {
      const x = (i * 163.73) % renderer.width;
      const y = ((i * 91.17) % 360) + (i % 4) * 9;
      const pulse = 0.24 + (Math.sin(this.elapsed * (0.9 + (i % 7) * 0.08) + i) + 1) * 0.18;
      renderer.rect(x, y, i % 3 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1, `rgba(255,255,255,${pulse.toFixed(3)})`);
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, renderer.height);
    ctx.lineTo(0, renderer.height - 110);
    ctx.lineTo(renderer.width * 0.18, renderer.height - 164);
    ctx.lineTo(renderer.width * 0.82, renderer.height - 164);
    ctx.lineTo(renderer.width, renderer.height - 110);
    ctx.lineTo(renderer.width, renderer.height);
    ctx.closePath();
    const consoleGradient = ctx.createLinearGradient(0, renderer.height - 164, 0, renderer.height);
    consoleGradient.addColorStop(0, "rgba(15, 19, 26, 0.96)");
    consoleGradient.addColorStop(1, "rgba(4, 5, 8, 1)");
    ctx.fillStyle = consoleGradient;
    ctx.fill();
    ctx.restore();

    drawPanel(renderer, cardX, cardY, 676, 404, FLIGHT_SLICE_TITLE);
    renderer.text(GAME_MANIFEST.name, centerX, cardY + 72, {
      align: "center",
      color: "#f8edd0",
      font: "bold 54px Georgia"
    });
    renderer.text(GAME_TAGLINE, centerX, cardY + 110, {
      align: "center",
      color: "#c8ddf3",
      font: "21px Palatino Linotype"
    });

    drawTextBlock(
      renderer,
      "Slipwake is the first certification run for a Black Relay pilot. Raise and bleed throttle until the Slipwake Shear Index falls inside each courier band. Hold the band cleanly long enough and relay command clears you for live cargo.",
      cardX + 34,
      cardY + 156,
      608,
      28,
      {
        color: "#dbe8f6",
        font: "22px Palatino Linotype"
      }
    );

    drawPanel(renderer, cardX + 30, cardY + 250, 292, 112, "Flight Controls");
    renderer.text("W / Up", cardX + 46, cardY + 288, {
      color: "#f7e6af",
      font: "bold 18px Trebuchet MS"
    });
    renderer.text("Raise throttle", cardX + 144, cardY + 288, {
      color: "#d6e6f7",
      font: "17px Trebuchet MS"
    });
    renderer.text("S / Down", cardX + 46, cardY + 320, {
      color: "#f7e6af",
      font: "bold 18px Trebuchet MS"
    });
    renderer.text("Retro brake and cut throttle", cardX + 144, cardY + 320, {
      color: "#d6e6f7",
      font: "17px Trebuchet MS"
    });

    drawPanel(renderer, cardX + 354, cardY + 250, 292, 112, "Run Controls");
    renderer.text("R", cardX + 370, cardY + 288, {
      color: "#f7e6af",
      font: "bold 18px Trebuchet MS"
    });
    renderer.text("Restart certification", cardX + 408, cardY + 288, {
      color: "#d6e6f7",
      font: "17px Trebuchet MS"
    });
    renderer.text("Esc / H / M", cardX + 370, cardY + 320, {
      color: "#f7e6af",
      font: "bold 18px Trebuchet MS"
    });
    renderer.text("Title, help, audio", cardX + 488, cardY + 320, {
      color: "#d6e6f7",
      font: "17px Trebuchet MS"
    });

    renderer.text("Press Enter to launch the Slipwake test", centerX, cardY + 388, {
      align: "center",
      color: `rgba(255, 240, 194, ${promptAlpha.toFixed(3)})`,
      font: "bold 22px Trebuchet MS"
    });
  }
}
