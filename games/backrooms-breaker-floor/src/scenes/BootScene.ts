import type { Scene } from "@playloom/engine-core";
import type { AppServices } from "../context";
import { GAME_MANIFEST } from "../types";

export class BootScene implements Scene {
  private startRequested = false;
  private readonly onPointerDown = (): void => {
    this.startRequested = true;
  };

  constructor(
    private readonly services: AppServices,
    private readonly startGame: () => void
  ) {}

  onEnter(): void {
    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
  }

  onExit(): void {
    window.removeEventListener("pointerdown", this.onPointerDown);
  }

  update(_dt: number): void {
    if (this.startRequested || this.services.input.wasPressed("enter", " ")) {
      this.startRequested = false;
      this.startGame();
    }
  }

  render(_alpha: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const gradient = ctx.createLinearGradient(0, 0, 0, renderer.height);
    gradient.addColorStop(0, "#2a2412");
    gradient.addColorStop(0.45, "#131109");
    gradient.addColorStop(1, "#080705");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    renderer.rect(100, 106, renderer.width - 200, renderer.height - 212, "rgba(17, 16, 11, 0.62)");
    renderer.strokeRect(100, 106, renderer.width - 200, renderer.height - 212, "rgba(221, 203, 134, 0.62)", 2);

    for (let x = 148; x < renderer.width - 150; x += 126) {
      renderer.rect(x, 136, 52, 10, "rgba(243, 231, 164, 0.14)");
    }

    renderer.text(GAME_MANIFEST.name, renderer.width / 2, 184, {
      align: "center",
      color: "#f6ebbc",
      font: "bold 40px Trebuchet MS"
    });

    renderer.text("Atmospheric co-op Backrooms escape", renderer.width / 2, 222, {
      align: "center",
      color: "#d7d0b0",
      font: "20px Trebuchet MS"
    });

    renderer.text("Prototype focus for this milestone:", 152, 264, {
      color: "#efe0a2",
      font: "bold 18px Trebuchet MS"
    });
    renderer.text("Fixed-room top-down exploration", 168, 296, {
      color: "#d7d0b0",
      font: "16px Trebuchet MS"
    });
    renderer.text("Three relays, two breaker panels, one locked exit", 168, 322, {
      color: "#d7d0b0",
      font: "16px Trebuchet MS"
    });
    renderer.text("Touch joystick and interact button for iPad testing", 168, 348, {
      color: "#d7d0b0",
      font: "16px Trebuchet MS"
    });
    renderer.text("Online room sync is the next layer after this slice", 168, 374, {
      color: "#d7d0b0",
      font: "16px Trebuchet MS"
    });

    renderer.text("Desktop: move with WASD or arrows, interact with E / Enter / Space", renderer.width / 2, 420, {
      align: "center",
      color: "#cad6dd",
      font: "15px Trebuchet MS"
    });
    renderer.text("iPad: left pad moves, right button interacts", renderer.width / 2, 444, {
      align: "center",
      color: "#cad6dd",
      font: "15px Trebuchet MS"
    });
    renderer.text("No jump scares. Tension comes from distance, light, and the hum.", renderer.width / 2, 468, {
      align: "center",
      color: "#f0dfa4",
      font: "15px Trebuchet MS"
    });

    renderer.rect(renderer.width / 2 - 118, 492, 236, 32, "rgba(71, 63, 35, 0.72)");
    renderer.strokeRect(renderer.width / 2 - 118, 492, 236, 32, "rgba(242, 222, 136, 0.82)", 2);
    renderer.text("Press Enter or tap to enter", renderer.width / 2, 513, {
      align: "center",
      color: "#f8efc8",
      font: "bold 16px Trebuchet MS"
    });
  }
}
