import type { Scene } from "@playloom/engine-core";
import { SynthAudio } from "@playloom/engine-audio";
import { ActionMap, createMenuActionBindings } from "@playloom/engine-input";
import { drawPanel, drawTextBlock, wrapTextLines } from "@playloom/engine-renderer-canvas";
import type { AppServices } from "../context";
import { VoidCreditsMusic } from "../audio/VoidCreditsMusic";
import {
  cycleAudioMixMode,
  getAudioMixMode,
  getAudioMixProfile,
  type AudioMixMode
} from "../audioMix";
import {
  getSaveArchiveSummary,
  loadResumeSave,
  loadSaveSlot,
  rememberResumeSlot,
  type CourierSaveData
} from "../save";
import { GAME_MANIFEST, GAME_TAGLINE } from "../types";

export class BootScene implements Scene {
  private readonly actions: ActionMap;
  private readonly audio = new SynthAudio();
  private readonly titleMusic = new VoidCreditsMusic();
  private readonly archiveSummary = getSaveArchiveSummary();
  private audioMixMode: AudioMixMode = getAudioMixMode();
  private elapsed = 0;

  private readonly unlockAudio = (): void => {
    this.audio.unlock();
    this.titleMusic.unlock();
  };

  constructor(
    private readonly services: AppServices,
    private readonly startGame: (save: CourierSaveData | null) => void
  ) {
    this.actions = new ActionMap(this.services.input, {
      ...createMenuActionBindings(),
      new_flight: ["n"],
      continue_flight: ["c"],
      load_slot_1: ["1"],
      load_slot_2: ["2"],
      load_slot_3: ["3"],
      toggle_audio: ["v"]
    });
  }

  private applyAudioMix(): void {
    const profile = getAudioMixProfile(this.audioMixMode);
    this.audio.setVolume(profile.synth);
    this.audio.setEnabled(profile.audible);
    this.titleMusic.setVolume(profile.soundtrack);
    this.titleMusic.setEnabled(profile.audible);
    if (profile.audible) {
      this.audio.unlock();
      this.titleMusic.unlock();
    }
  }

  onEnter(): void {
    window.addEventListener("keydown", this.unlockAudio);
    window.addEventListener("pointerdown", this.unlockAudio, { passive: true });
    this.titleMusic.setActive(true);
    this.applyAudioMix();
  }

  onExit(): void {
    window.removeEventListener("keydown", this.unlockAudio);
    window.removeEventListener("pointerdown", this.unlockAudio);
    this.titleMusic.setActive(false);
    this.titleMusic.shutdown();
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.titleMusic.update(dt);

    if (this.actions.wasPressed("toggle_audio")) {
      this.audioMixMode = cycleAudioMixMode();
      this.applyAudioMix();
      if (getAudioMixProfile(this.audioMixMode).audible) {
        this.audio.beep(this.audioMixMode === "max" ? 880 : 620, 0.06, "sine");
      }
    }

    if (this.actions.wasPressed("continue_flight")) {
      const save = loadResumeSave();
      if (!save) {
        this.audio.beep(240, 0.06, "triangle");
        return;
      }
      rememberResumeSlot(save.slot);
      this.audio.whoosh();
      this.startGame(save);
      return;
    }

    if (this.actions.wasPressed("load_slot_1")) {
      const save = loadSaveSlot("slot1");
      if (!save) {
        this.audio.beep(240, 0.06, "triangle");
        return;
      }
      rememberResumeSlot("slot1");
      this.audio.whoosh();
      this.startGame(save);
      return;
    }

    if (this.actions.wasPressed("load_slot_2")) {
      const save = loadSaveSlot("slot2");
      if (!save) {
        this.audio.beep(240, 0.06, "triangle");
        return;
      }
      rememberResumeSlot("slot2");
      this.audio.whoosh();
      this.startGame(save);
      return;
    }

    if (this.actions.wasPressed("load_slot_3")) {
      const save = loadSaveSlot("slot3");
      if (!save) {
        this.audio.beep(240, 0.06, "triangle");
        return;
      }
      rememberResumeSlot("slot3");
      this.audio.whoosh();
      this.startGame(save);
      return;
    }

    if (!this.actions.wasPressed("menu_confirm") && !this.actions.wasPressed("new_flight")) {
      return;
    }

    this.audio.whoosh();
    this.startGame(null);
  }

  render(_alpha: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const centerX = renderer.width * 0.5;
    const heroRadius = Math.min(148, renderer.width * 0.12, renderer.height * 0.16);
    const heroY = Math.min(184, renderer.height * 0.24);
    const titleY = heroY + heroRadius + 44;
    const introText = "A courier cockpit for black wells, frontier lanes, and the readable dark.";
    const deckWidth = Math.min(820, renderer.width - 72);
    const deckX = centerX - deckWidth * 0.5;
    const deckY = titleY + 92;
    const deckGap = 16;
    const deckColumnWidth = Math.floor((deckWidth - deckGap) * 0.5);
    const leftDeckX = deckX;
    const rightDeckX = deckX + deckColumnWidth + deckGap;
    const deckHeight = 86;
    const archiveY = deckY + deckHeight + 16;
    const archiveHeight = this.archiveSummary.resumeSummary ? 62 : 0;
    const audioLabel = getAudioMixProfile(this.audioMixMode).shortLabel;
    const promptText = this.archiveSummary.hasAnySave
      ? "Enter / N new flight | C continue latest sync | 1 / 2 / 3 load archive"
      : "Press Enter or N to light the carrier and drift";
    const promptLineHeight = 18;
    const promptLines = this.wrapLines(promptText, deckWidth - 72, "bold 18px Trebuchet MS");
    const promptY = archiveY + archiveHeight + 20;
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

    this.renderSignalCrest(centerX, heroY, heroRadius);

    renderer.text(GAME_MANIFEST.name, centerX, titleY, {
      align: "center",
      color: "#f8edd0",
      font: deckWidth < 720 ? "bold 50px Georgia" : "bold 60px Georgia"
    });
    renderer.text(GAME_TAGLINE, centerX, titleY + 36, {
      align: "center",
      color: "#c8ddf3",
      font: "20px Palatino Linotype"
    });
    drawTextBlock(renderer, introText, centerX, titleY + 70, Math.min(620, deckWidth - 80), 20, {
      align: "center",
      color: "#dbe8f6",
      font: "18px Palatino Linotype"
    });

    this.renderCommandStrip(
      leftDeckX,
      deckY,
      deckColumnWidth,
      deckHeight,
      "Flight Deck",
      "W / Up raise throttle\nS / Down retro brake\nR restart band sequence"
    );
    this.renderCommandStrip(
      rightDeckX,
      deckY,
      deckColumnWidth,
      deckHeight,
      "Signal Stack",
      `H notes  L log  M map\nP messages  T cheats\nV audio ${audioLabel}`
    );

    if (this.archiveSummary.resumeSummary) {
      renderer.rect(deckX, archiveY, deckWidth, archiveHeight, "rgba(10, 14, 21, 0.64)");
      renderer.strokeRect(deckX, archiveY, deckWidth, archiveHeight, "rgba(143, 227, 255, 0.22)", 1.1);
      renderer.text("FLIGHT ARCHIVE", deckX + 16, archiveY + 16, {
        color: "#8edfff",
        font: "bold 11px Trebuchet MS"
      });
      renderer.text(this.fitTextToWidth("C continue | 1/2/3 archive", 178, "bold 11px Trebuchet MS"), deckX + deckWidth - 16, archiveY + 16, {
        align: "right",
        color: "#f2dfab",
        font: "bold 11px Trebuchet MS"
      });
      drawTextBlock(
        renderer,
        `${this.archiveSummary.resumeSummary.label} // ${this.archiveSummary.resumeSummary.questLine}`,
        deckX + 16,
        archiveY + 31,
        deckWidth - 32,
        12,
        {
          color: "#f7efd8",
          font: "12px Trebuchet MS"
        }
      );
      drawTextBlock(
        renderer,
        `${this.archiveSummary.resumeSummary.savedAtLabel} // ${this.archiveSummary.resumeSummary.detailLine}`,
        deckX + 16,
        archiveY + 44,
        deckWidth - 32,
        12,
        {
          color: "#a9bdd3",
          font: "11px Trebuchet MS"
        }
      );
    }

    drawTextBlock(renderer, promptText, centerX, promptY, deckWidth - 72, promptLineHeight, {
      align: "center",
      color: `rgba(255, 240, 194, ${promptAlpha.toFixed(3)})`,
      font: "bold 18px Trebuchet MS"
    });
  }

  private renderSignalCrest(centerX: number, centerY: number, radius: number): void {
    const { ctx } = this.services.renderer;
    const phase = this.elapsed;
    const pulse = 0.1 + (Math.sin(phase * 1.4) + 1) * 0.03;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.globalCompositeOperation = "screen";

    const halo = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 1.95);
    halo.addColorStop(0, "rgba(255, 236, 188, 0.26)");
    halo.addColorStop(0.38, "rgba(110, 201, 255, 0.12)");
    halo.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-radius * 2.1, -radius * 1.8, radius * 4.2, radius * 3.6);

    ctx.strokeStyle = `rgba(246, 229, 182, ${(0.18 + pulse).toFixed(3)})`;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * (0.42 + i * 0.2), Math.PI * (1.02 + i * 0.02), Math.PI * (1.98 - i * 0.02));
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(-radius * 0.42, radius * 0.12, radius * 0.46, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(7, 10, 18, 0.94)";
    ctx.fill();
    ctx.strokeStyle = "rgba(134, 150, 176, 0.24)";
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-radius * 0.48, radius * 0.08, radius * 0.47, -Math.PI * 0.44, Math.PI * 0.44);
    ctx.strokeStyle = "rgba(255, 222, 148, 0.42)";
    ctx.lineWidth = 2.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-radius * 1.02, radius * 0.06);
    ctx.lineTo(radius * 0.86, -radius * 0.14);
    ctx.strokeStyle = `rgba(143, 227, 255, ${(0.16 + pulse * 0.7).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(radius * 0.08, -radius * 0.18);
    ctx.lineTo(radius * 0.74, -radius * 0.02);
    ctx.lineTo(radius * 0.08, radius * 0.14);
    ctx.closePath();
    ctx.fillStyle = "rgba(248, 237, 208, 0.38)";
    ctx.fill();
    ctx.strokeStyle = "rgba(248, 237, 208, 0.72)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(radius * 0.02, -radius * 0.1);
    ctx.lineTo(-radius * 0.22, -radius * 0.04);
    ctx.lineTo(-radius * 0.18, radius * 0.08);
    ctx.lineTo(radius * 0.04, radius * 0.03);
    ctx.closePath();
    ctx.fillStyle = "rgba(160, 208, 255, 0.24)";
    ctx.fill();
    ctx.strokeStyle = "rgba(160, 208, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let i = 0; i < 7; i += 1) {
      const angle = -Math.PI * 0.4 + i * 0.28;
      const distance = radius * (0.74 + (i % 2) * 0.12);
      const markerX = Math.cos(angle) * distance;
      const markerY = Math.sin(angle) * distance;
      ctx.beginPath();
      ctx.arc(markerX, markerY, i % 3 === 0 ? 2.2 : 1.3, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? "rgba(255, 233, 186, 0.56)" : "rgba(126, 224, 255, 0.44)";
      ctx.fill();
    }

    ctx.restore();
  }

  private renderCommandStrip(x: number, y: number, width: number, height: number, title: string, body: string): void {
    const { renderer } = this.services;
    drawPanel(renderer, x, y, width, height, title);
    renderer.line(x + 14, y + 30, x + width - 14, y + 30, "rgba(143, 227, 255, 0.18)", 1);
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      renderer.text(lines[i] ?? "", x + 16, y + 48 + i * 15, {
        color: "#d8e4f4",
        font: "13px Trebuchet MS"
      });
    }
  }

  private wrapLines(text: string, maxWidth: number, font: string): string[] {
    const { ctx } = this.services.renderer;
    ctx.save();
    ctx.font = font;
    const lines = wrapTextLines(text, maxWidth, (value) => ctx.measureText(value).width);
    ctx.restore();
    return lines;
  }

  private fitTextToWidth(text: string, maxWidth: number, font: string): string {
    const { ctx } = this.services.renderer;
    ctx.save();
    ctx.font = font;

    if (ctx.measureText(text).width <= maxWidth) {
      ctx.restore();
      return text;
    }

    let trimmed = text;
    while (trimmed.length > 1 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }

    ctx.restore();
    return `${trimmed}...`;
  }

}
