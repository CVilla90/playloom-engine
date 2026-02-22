import type { Scene } from "@playloom/engine-core";
import { drawPanel } from "@playloom/engine-renderer-canvas";
import { CHARACTERS, GAME_NAME, TAGLINE } from "../data/config";
import type { CharacterId } from "../types";
import type { AppServices } from "../context";

const CHARACTER_ORDER: CharacterId[] = ["human", "robot", "animal"];

export class CharacterSelectScene implements Scene {
  private index = 0;

  constructor(private readonly services: AppServices, private readonly hasSave: boolean) {}

  update(): void {
    const { input, audio } = this.services;

    if (input.wasPressed("arrowleft", "a")) {
      this.index = (this.index + CHARACTER_ORDER.length - 1) % CHARACTER_ORDER.length;
      audio.beep(470, 0.06);
    }
    if (input.wasPressed("arrowright", "d")) {
      this.index = (this.index + 1) % CHARACTER_ORDER.length;
      audio.beep(520, 0.06);
    }

    if (input.wasPressed("1")) this.index = 0;
    if (input.wasPressed("2")) this.index = 1;
    if (input.wasPressed("3")) this.index = 2;

    if (input.wasPressed("enter")) {
      const selected = CHARACTER_ORDER[this.index] as CharacterId;
      audio.beep(760, 0.08, "triangle");
      this.services.startNewRun(selected);
      return;
    }

    if (this.hasSave && input.wasPressed("c")) {
      audio.beep(630, 0.08, "sine");
      this.services.continueRun();
    }
  }

  render(): void {
    const { renderer, assets } = this.services;

    renderer.clear("#11121a");
    renderer.rect(0, 0, renderer.width, 160, "#20161d");
    renderer.text(GAME_NAME, renderer.width / 2, 46, {
      align: "center",
      color: "#fde4a8",
      font: "bold 46px Trebuchet MS"
    });
    renderer.text(TAGLINE, renderer.width / 2, 83, {
      align: "center",
      color: "#f3c98f",
      font: "italic 20px Trebuchet MS"
    });

    if (assets.panel.complete) {
      renderer.drawImage(assets.panel, 120, 130, 720, 320);
    }
    drawPanel(renderer, 120, 130, 720, 320, "Choose Survivor");

    CHARACTER_ORDER.forEach((id, i) => {
      const profile = CHARACTERS[id];
      const x = 170 + i * 240;
      const y = 190;
      const selected = i === this.index;
      renderer.rect(x - 20, y - 20, 200, 210, selected ? "rgba(246, 215, 153, 0.28)" : "rgba(255,255,255,0.06)");
      renderer.strokeRect(x - 20, y - 20, 200, 210, selected ? "#f9d58f" : "rgba(255,255,255,0.2)", selected ? 3 : 1);
      const icon = assets.characterIcons[id];
      if (icon.complete) {
        renderer.drawImage(icon, x + 45, y + 6, 90, 90);
      } else {
        renderer.circle(x + 90, y + 55, 38, "#4a5468");
      }

      renderer.text(profile.label, x + 80, y + 128, {
        align: "center",
        color: "#f6edda",
        font: "bold 24px Trebuchet MS"
      });
      renderer.text(`Gather x${profile.gatherMultiplier.toFixed(2)}`, x + 16, y + 154, {
        color: "#d7f0d3",
        font: "14px Trebuchet MS"
      });
      renderer.text(`Repair x${profile.repairMultiplier.toFixed(2)}`, x + 16, y + 173, {
        color: "#d3e7f0",
        font: "14px Trebuchet MS"
      });
      renderer.text(`Speed x${profile.speedMultiplier.toFixed(2)}`, x + 16, y + 192, {
        color: "#f0decf",
        font: "14px Trebuchet MS"
      });
    });

    renderer.text("Left/Right to choose - Enter to begin", renderer.width / 2, 480, {
      align: "center",
      color: "#f4e6c6",
      font: "18px Trebuchet MS"
    });

    if (this.hasSave) {
      renderer.text("Press C to continue saved run", renderer.width / 2, 508, {
        align: "center",
        color: "#bee7ff",
        font: "16px Trebuchet MS"
      });
    }
  }
}
