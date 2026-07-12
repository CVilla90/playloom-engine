import type { Scene } from "@playloom/engine-core";
import { ActionMap, createMenuActionBindings } from "@playloom/engine-input";
import type { Renderer2D } from "@playloom/engine-renderer-canvas";
import type { AppServices } from "../context";
import { MidnightActionTitleMusic } from "../audio/MidnightActionTitleMusic";
import { type AudioMode, audioModeLabel, audioModeScale, nextAudioMode } from "../audioMode";
import { GAME_MANIFEST, GAME_TAGLINE, GAME_TITLE_JP } from "../types";
import { imageReady, tintedReimeiFrame } from "../trafficAssets";
import type { PlayerProfile } from "../multiplayer/playerProfile";
import heroCarUrl from "../../assets/reimei-xr-car-frames/reimei-xr-yaw-052.png?url";

// "Bayside PA, 02:13" — the player's Reimei XR parked at a Kurohama bayside
// parking area under one sodium lamp, the Bayshore Span alive across the water.
// Cockpit gameplay never shows the player car, so this scene is the one place
// the driver actually sees it.

const SODIUM = "#f2a93b";
const TAIL_RED = "#ff4a3d";

// Horizontal bands of the composition (canvas is 1280x720).
const WATERLINE_Y = 356;
const RAIL_TOP_Y = 448;
const WALL_TOP_Y = 470;
const ASPHALT_TOP_Y = 508;

// Bridge geometry.
const DECK_Y = 318;
const DECK_START_X = 430;
const TOWER_XS = [690, 1120] as const;
const TOWER_TOP_Y = 152;

// Hero car placement. The source frame is 1024x640; the rear tire/arch shadow
// touches ground at sprite row 535 (alpha-scanned), which sets the on-screen
// contact line the reflection flips around.
const HERO_SCALE = 0.56;
const HERO_X = 590;
const HERO_Y = 348;
const HERO_W = 1024 * HERO_SCALE;
const HERO_H = 640 * HERO_SCALE;
const HERO_CONTACT_Y = HERO_Y + 535 * HERO_SCALE;

// Lamp geometry: pole on the right edge of the lot, arm reaching over the car.
const LAMP_POLE_X = 1224;
const LAMP_HEAD_X = 1024;
const LAMP_HEAD_Y = 232;

// Canvas-native primary action, placed in the quiet space below the title
// lockup and clear of both the hero car and the bottom control legend.
const JOIN_BUTTON = { x: 148, y: 468, width: 326, height: 58 } as const;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic(value: number): number {
  const v = clamp01(value);
  return 1 - (1 - v) ** 3;
}

function quadPoint(t: number, p0: readonly [number, number], c: readonly [number, number], p1: readonly [number, number]): [number, number] {
  const inv = 1 - t;
  return [
    inv * inv * p0[0] + 2 * inv * t * c[0] + t * t * p1[0],
    inv * inv * p0[1] + 2 * inv * t * c[1] + t * t * p1[1]
  ];
}

export class BootScene implements Scene {
  private readonly actions: ActionMap;
  private readonly music = new MidnightActionTitleMusic();
  private readonly heroCar: HTMLImageElement;
  private elapsed = 0;
  private audioMode: AudioMode = "normal";

  private readonly unlockTitleAudio = (): void => {
    this.music.unlock();
  };

  private readonly handleCanvasPointerDown = (event: PointerEvent): void => {
    const canvas = this.services.renderer.ctx.canvas;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }
    const x = (event.clientX - bounds.left) * (canvas.width / bounds.width);
    const y = (event.clientY - bounds.top) * (canvas.height / bounds.height);
    if (
      x >= JOIN_BUTTON.x &&
      x <= JOIN_BUTTON.x + JOIN_BUTTON.width &&
      y >= JOIN_BUTTON.y &&
      y <= JOIN_BUTTON.y + JOIN_BUTTON.height
    ) {
      event.preventDefault();
      this.startGame();
    }
  };

  constructor(
    private readonly services: AppServices,
    private readonly startGame: () => void,
    private readonly playerProfile: PlayerProfile | null = null
  ) {
    this.actions = new ActionMap(this.services.input, {
      ...createMenuActionBindings(),
      start: ["enter", " ", "w", "arrowup"],
      toggle_audio: ["m"]
    });
    this.heroCar = new Image();
    this.heroCar.decoding = "async";
    this.heroCar.src = heroCarUrl;
  }

  onEnter(): void {
    window.addEventListener("keydown", this.unlockTitleAudio);
    window.addEventListener("pointerdown", this.unlockTitleAudio, { passive: true });
    this.services.renderer.ctx.canvas.addEventListener("pointerdown", this.handleCanvasPointerDown);
    this.music.setActive(true);
  }

  onExit(): void {
    window.removeEventListener("keydown", this.unlockTitleAudio);
    window.removeEventListener("pointerdown", this.unlockTitleAudio);
    this.services.renderer.ctx.canvas.removeEventListener("pointerdown", this.handleCanvasPointerDown);
    this.music.setActive(false);
    this.music.shutdown();
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.music.update(dt);
    if (this.actions.wasPressed("toggle_audio")) {
      this.audioMode = nextAudioMode(this.audioMode);
      this.music.setVolume(audioModeScale(this.audioMode));
    }
    if (this.actions.wasPressed("start")) {
      this.startGame();
    }
  }

  render(_alpha: number): void {
    const { renderer } = this.services;
    renderer.clear("#0b0e14");
    this.renderSky(renderer);
    this.renderSkyline(renderer);
    this.renderBridge(renderer);
    this.renderWater(renderer);
    this.renderForeshore(renderer);
    this.renderLot(renderer);
    this.renderHeroReflection(renderer);
    this.renderLamp(renderer);
    this.renderHeroCar(renderer);
    this.renderVignette(renderer);
    this.renderTitleBlock(renderer);
    this.renderPrompts(renderer);
  }

  private renderSky(renderer: Renderer2D): void {
    const { ctx } = renderer;
    const sky = ctx.createLinearGradient(0, 0, 0, WATERLINE_Y);
    sky.addColorStop(0, "#030510");
    sky.addColorStop(0.55, "#081020");
    sky.addColorStop(1, "#16233c");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, renderer.width, WATERLINE_Y);

    const bayGlow = ctx.createRadialGradient(880, WATERLINE_Y, 0, 880, WATERLINE_Y, 460);
    bayGlow.addColorStop(0, "rgba(242, 169, 59, 0.06)");
    bayGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bayGlow;
    ctx.fillRect(420, 60, renderer.width - 420, WATERLINE_Y - 60);

    const cityGlow = ctx.createRadialGradient(220, WATERLINE_Y, 0, 220, WATERLINE_Y, 420);
    cityGlow.addColorStop(0, "rgba(140, 172, 220, 0.09)");
    cityGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = cityGlow;
    ctx.fillRect(0, 60, 640, WATERLINE_Y - 60);

    for (let index = 0; index < 64; index += 1) {
      const x = (index * 163.7) % renderer.width;
      const y = 8 + ((index * 97.3) % 268);
      let alpha = 0.12 + ((index * 29) % 30) / 150;
      if (index % 4 === 0) {
        alpha *= 0.6 + 0.4 * Math.sin(this.elapsed * 1.3 + index);
      }
      const size = index % 7 === 0 ? 2 : 1;
      renderer.rect(x, y, size, size, `rgba(214, 228, 246, ${Math.max(0, alpha).toFixed(3)})`);
    }
  }

  private renderSkyline(renderer: Renderer2D): void {
    for (let index = 0; index < 27; index += 1) {
      const width = 30 + ((index * 19) % 44);
      const x = index * 48 - 20;
      const height = 36 + ((index * 37) % 120);
      const y = WATERLINE_Y - height;
      renderer.rect(x, y, width, height, index % 3 === 0 ? "#0c1524" : "#0e1728");
      const windowCount = Math.floor(height / 24);
      for (let k = 0; k < windowCount; k += 1) {
        if ((k + index) % 3 === 0) {
          continue;
        }
        const windowX = x + 4 + ((k * 11 + index * 7) % Math.max(8, width - 8));
        const windowY = y + 8 + ((k * 17 + index * 3) % Math.max(8, height - 16));
        const lit = (k + index) % 4 === 0;
        renderer.rect(windowX, windowY, 2, 3, lit ? "rgba(242, 169, 59, 0.4)" : "rgba(217, 230, 244, 0.3)");
      }
    }
    this.renderCrane(renderer, 58);
    this.renderCrane(renderer, 176);
  }

  private renderCrane(renderer: Renderer2D, baseX: number): void {
    const top = WATERLINE_Y - 74;
    renderer.rect(baseX, top, 5, 74, "#0a1220");
    renderer.rect(baseX + 26, top + 30, 5, 44, "#0a1220");
    renderer.rect(baseX - 26, top - 4, 96, 4, "#0a1220");
    renderer.line(baseX + 2, top - 2, baseX + 62, top + 26, "#0a1220", 2);
    renderer.circle(baseX + 68, top - 3, 1.5, "rgba(255, 74, 61, 0.5)");
  }

  private renderBridge(renderer: Renderer2D): void {
    const { ctx } = renderer;
    const [towerA, towerB] = TOWER_XS;

    for (const towerX of TOWER_XS) {
      renderer.rect(towerX - 4, TOWER_TOP_Y - 6, 8, WATERLINE_Y - TOWER_TOP_Y + 6, "#101c30");
      renderer.rect(towerX - 7, 208, 14, 5, "#101c30");
      renderer.rect(towerX - 7, 296, 14, 5, "#101c30");
    }

    ctx.strokeStyle = "#22334e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(DECK_START_X + 30, DECK_Y);
    ctx.quadraticCurveTo(570, 240, towerA, TOWER_TOP_Y);
    ctx.quadraticCurveTo(905, 330, towerB, TOWER_TOP_Y);
    ctx.quadraticCurveTo(1210, 240, renderer.width, 300);
    ctx.stroke();

    for (let index = 1; index < 13; index += 1) {
      const [hx, hy] = quadPoint(index / 13, [towerA, TOWER_TOP_Y], [905, 330], [towerB, TOWER_TOP_Y]);
      renderer.line(hx, hy, hx, DECK_Y, "rgba(29, 44, 68, 0.7)", 1);
    }

    renderer.rect(DECK_START_X, DECK_Y - 2, renderer.width - DECK_START_X, 6, "#0d1727");
    renderer.line(DECK_START_X, DECK_Y - 3, renderer.width, DECK_Y - 3, "#2a3d5c", 1);

    for (let x = DECK_START_X + 10; x < renderer.width; x += 42) {
      renderer.circle(x, DECK_Y - 5, 2.6, "rgba(242, 169, 59, 0.12)");
      renderer.circle(x, DECK_Y - 5, 1.2, "rgba(242, 169, 59, 0.9)");
    }

    for (let index = 0; index < 5; index += 1) {
      const t = (this.elapsed * 0.042 + index * 0.23) % 1;
      const x = DECK_START_X + 10 + t * (renderer.width - DECK_START_X - 10);
      renderer.line(x - 6, DECK_Y - 6.5, x, DECK_Y - 6.5, "rgba(238, 243, 255, 0.35)", 2);
      renderer.circle(x, DECK_Y - 6.5, 1.6, "rgba(238, 243, 255, 0.8)");
    }
    for (let index = 0; index < 4; index += 1) {
      const t = (this.elapsed * 0.036 + index * 0.26) % 1;
      const x = renderer.width - t * (renderer.width - DECK_START_X - 10);
      renderer.line(x, DECK_Y + 2.5, x + 6, DECK_Y + 2.5, "rgba(255, 74, 61, 0.3)", 2);
      renderer.circle(x, DECK_Y + 2.5, 1.4, "rgba(255, 74, 61, 0.8)");
    }

    for (const [index, towerX] of TOWER_XS.entries()) {
      const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 1.7 + index * 2.4);
      const alpha = 0.2 + 0.6 * pulse * pulse;
      renderer.circle(towerX, TOWER_TOP_Y - 9, 6, `rgba(255, 74, 61, ${(alpha * 0.3).toFixed(3)})`);
      renderer.circle(towerX, TOWER_TOP_Y - 9, 2.5, `rgba(255, 74, 61, ${alpha.toFixed(3)})`);
    }
  }

  private renderWater(renderer: Renderer2D): void {
    const { ctx } = renderer;
    const water = ctx.createLinearGradient(0, WATERLINE_Y, 0, WALL_TOP_Y);
    water.addColorStop(0, "#0a1522");
    water.addColorStop(1, "#0c1a29");
    ctx.fillStyle = water;
    ctx.fillRect(0, WATERLINE_Y, renderer.width, WALL_TOP_Y - WATERLINE_Y);

    for (let index = 0; index < 9; index += 1) {
      const x = 500 + index * 80;
      const length = 30 + ((index * 29) % 40);
      const alpha = Math.max(0, 0.05 + 0.04 * Math.sin(this.elapsed * 1.1 + index * 1.9));
      const streak = ctx.createLinearGradient(0, WATERLINE_Y + 2, 0, WATERLINE_Y + 2 + length);
      streak.addColorStop(0, `rgba(242, 169, 59, ${alpha.toFixed(3)})`);
      streak.addColorStop(1, "rgba(242, 169, 59, 0)");
      ctx.fillStyle = streak;
      ctx.fillRect(x - 1, WATERLINE_Y + 2, 2, length);
    }

    for (let index = 0; index < 16; index += 1) {
      const y = WATERLINE_Y + 8 + index * 6.6;
      const x = (index * 211) % (renderer.width - 100);
      const width = 30 + ((index * 53) % 90);
      const alpha = Math.max(0, 0.03 + 0.05 * Math.sin(this.elapsed * 0.9 + index * 1.7));
      renderer.line(x, y, x + width, y, `rgba(157, 184, 212, ${alpha.toFixed(3)})`, 1);
    }
  }

  private renderForeshore(renderer: Renderer2D): void {
    renderer.rect(0, WALL_TOP_Y, renderer.width, ASPHALT_TOP_Y - WALL_TOP_Y, "#161d2b");
    renderer.line(0, WALL_TOP_Y, renderer.width, WALL_TOP_Y, "#26314a", 2);

    renderer.line(0, RAIL_TOP_Y, renderer.width, RAIL_TOP_Y, "#33445f", 2);
    renderer.line(0, RAIL_TOP_Y + 11, renderer.width, RAIL_TOP_Y + 11, "rgba(51, 68, 95, 0.7)", 1);
    for (let x = 8; x < renderer.width; x += 44) {
      renderer.line(x, RAIL_TOP_Y, x, WALL_TOP_Y, "#2a3850", 2);
    }

    renderer.text("黒浜 P.A.", 1150, 498, {
      color: "rgba(230, 240, 250, 0.28)",
      font: "700 15px 'Yu Gothic', 'Meiryo', sans-serif"
    });
  }

  private renderLot(renderer: Renderer2D): void {
    const { ctx } = renderer;
    const asphalt = ctx.createLinearGradient(0, ASPHALT_TOP_Y, 0, renderer.height);
    asphalt.addColorStop(0, "#10141c");
    asphalt.addColorStop(1, "#0b0e14");
    ctx.fillStyle = asphalt;
    ctx.fillRect(0, ASPHALT_TOP_Y, renderer.width, renderer.height - ASPHALT_TOP_Y);

    for (let index = 0; index < 5; index += 1) {
      const topX = 40 + index * 105;
      const bottomX = -30 + index * 140;
      renderer.line(topX, ASPHALT_TOP_Y + 4, bottomX, 700, "rgba(226, 234, 244, 0.055)", 3);
    }
  }

  private renderHeroReflection(renderer: Renderer2D): void {
    if (!imageReady(this.heroCar)) {
      return;
    }
    const { ctx } = renderer;
    const heroFrame = this.playerProfile
      ? tintedReimeiFrame(this.heroCar, this.playerProfile.mainColor, this.playerProfile.accentColor)
      : this.heroCar;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.translate(0, HERO_CONTACT_Y * 2);
    ctx.scale(1, -1);
    ctx.drawImage(heroFrame, HERO_X, HERO_Y, HERO_W, HERO_H);
    ctx.restore();

    const fade = ctx.createLinearGradient(0, HERO_CONTACT_Y, 0, HERO_CONTACT_Y + 66);
    fade.addColorStop(0, "rgba(11, 14, 20, 0)");
    fade.addColorStop(1, "rgba(11, 14, 20, 1)");
    ctx.fillStyle = fade;
    ctx.fillRect(HERO_X - 30, HERO_CONTACT_Y, HERO_W + 60, renderer.height - HERO_CONTACT_Y);
  }

  private renderLamp(renderer: Renderer2D): void {
    const { ctx } = renderer;
    const flicker = 1 - 0.06 * (0.5 + 0.5 * Math.sin(this.elapsed * 31.7)) * (0.5 + 0.5 * Math.sin(this.elapsed * 7.3));

    renderer.rect(LAMP_POLE_X - 3, LAMP_HEAD_Y - 24, 6, 680 - LAMP_HEAD_Y, "#232c3d");
    ctx.strokeStyle = "#232c3d";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(LAMP_POLE_X, LAMP_HEAD_Y - 18);
    ctx.quadraticCurveTo((LAMP_POLE_X + LAMP_HEAD_X) / 2, LAMP_HEAD_Y - 26, LAMP_HEAD_X + 14, LAMP_HEAD_Y - 6);
    ctx.stroke();
    renderer.rect(LAMP_HEAD_X - 22, LAMP_HEAD_Y - 9, 44, 11, "#38404f");
    renderer.rect(LAMP_HEAD_X - 15, LAMP_HEAD_Y + 1, 30, 3, `rgba(255, 214, 140, ${(0.9 * flicker).toFixed(3)})`);

    const halo = ctx.createRadialGradient(LAMP_HEAD_X, LAMP_HEAD_Y, 0, LAMP_HEAD_X, LAMP_HEAD_Y, 70);
    halo.addColorStop(0, `rgba(242, 169, 59, ${(0.22 * flicker).toFixed(3)})`);
    halo.addColorStop(1, "rgba(242, 169, 59, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(LAMP_HEAD_X - 70, LAMP_HEAD_Y - 70, 140, 140);

    const outerCone = ctx.createLinearGradient(0, LAMP_HEAD_Y, 0, 660);
    outerCone.addColorStop(0, `rgba(242, 169, 59, ${(0.045 * flicker).toFixed(3)})`);
    outerCone.addColorStop(1, "rgba(242, 169, 59, 0.008)");
    ctx.fillStyle = outerCone;
    ctx.beginPath();
    ctx.moveTo(LAMP_HEAD_X - 26, LAMP_HEAD_Y + 4);
    ctx.lineTo(LAMP_HEAD_X + 30, LAMP_HEAD_Y + 4);
    ctx.lineTo(1252, 660);
    ctx.lineTo(596, 660);
    ctx.closePath();
    ctx.fill();

    const cone = ctx.createLinearGradient(0, LAMP_HEAD_Y, 0, 660);
    cone.addColorStop(0, `rgba(242, 169, 59, ${(0.075 * flicker).toFixed(3)})`);
    cone.addColorStop(1, "rgba(242, 169, 59, 0.01)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(LAMP_HEAD_X - 16, LAMP_HEAD_Y + 4);
    ctx.lineTo(LAMP_HEAD_X + 20, LAMP_HEAD_Y + 4);
    ctx.lineTo(1196, 660);
    ctx.lineTo(656, 660);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.translate(920, 652);
    ctx.scale(1, 0.13);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, 330);
    pool.addColorStop(0, `rgba(242, 169, 59, ${(0.15 * flicker).toFixed(3)})`);
    pool.addColorStop(1, "rgba(242, 169, 59, 0)");
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, 330, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private renderHeroCar(renderer: Renderer2D): void {
    if (!imageReady(this.heroCar)) {
      return;
    }
    const { ctx } = renderer;
    const heroFrame = this.playerProfile
      ? tintedReimeiFrame(this.heroCar, this.playerProfile.mainColor, this.playerProfile.accentColor)
      : this.heroCar;
    ctx.drawImage(heroFrame, HERO_X, HERO_Y, HERO_W, HERO_H);

    const idle = 0.1 + 0.04 * Math.sin(this.elapsed * 2.3);
    const glow = ctx.createRadialGradient(688, 568, 0, 688, 568, 90);
    glow.addColorStop(0, `rgba(255, 74, 61, ${idle.toFixed(3)})`);
    glow.addColorStop(1, "rgba(255, 74, 61, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(598, 478, 180, 180);
  }

  private renderVignette(renderer: Renderer2D): void {
    const { ctx } = renderer;
    const vignette = ctx.createRadialGradient(640, 340, 380, 640, 340, 800);
    vignette.addColorStop(0, "rgba(2, 4, 10, 0)");
    vignette.addColorStop(1, "rgba(2, 4, 10, 0.42)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, renderer.width, renderer.height);
  }

  private renderTitleBlock(renderer: Renderer2D): void {
    const { ctx } = renderer;
    const jpAlpha = easeOutCubic((this.elapsed - 0.1) / 0.7);
    const wanganAlpha = easeOutCubic((this.elapsed - 0.35) / 0.7);
    const zeroAlpha = easeOutCubic((this.elapsed - 0.55) / 0.7);
    const restAlpha = easeOutCubic((this.elapsed - 0.9) / 0.7);

    ctx.save();
    ctx.globalAlpha = jpAlpha;
    ctx.fillStyle = SODIUM;
    ctx.font = "700 34px 'Yu Gothic', 'Meiryo', sans-serif";
    ctx.textAlign = "center";
    const jpChars = Array.from(GAME_TITLE_JP);
    for (const [index, char] of jpChars.entries()) {
      ctx.fillText(char, 104, 226 + index * 46 - (1 - jpAlpha) * 10);
    }
    ctx.restore();

    const [firstWord = "WANGAN", secondWord = "ZERO"] = GAME_MANIFEST.name.toUpperCase().split(" ");
    this.renderTitleWord(renderer, firstWord, 262, wanganAlpha, ["#f4f7fb", "#a9bcd4"]);
    this.renderTitleWord(renderer, secondWord, 372, zeroAlpha, ["#ff6a55", "#e0301f"]);

    ctx.save();
    ctx.globalAlpha = restAlpha;
    renderer.text(GAME_TAGLINE, 148, 410, {
      color: "#93a9c4",
      font: "italic 18px Georgia, 'Times New Roman', serif"
    });
    renderer.text("KUROHAMA BAY // 02:13", 148, 440, {
      color: "rgba(242, 169, 59, 0.85)",
      font: "bold 13px Consolas"
    });
    ctx.restore();
  }

  private renderTitleWord(renderer: Renderer2D, word: string, baselineY: number, alpha: number, gradientStops: readonly [string, string]): void {
    const { ctx } = renderer;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(146, baselineY - (1 - alpha) * 12);
    ctx.transform(1, 0, -0.13, 1, 0, 0);
    const fill = ctx.createLinearGradient(0, -70, 0, 0);
    fill.addColorStop(0, gradientStops[0]);
    fill.addColorStop(1, gradientStops[1]);
    ctx.fillStyle = fill;
    ctx.font = "900 94px 'Arial Black', Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(word, 0, 0);
    ctx.restore();
  }

  private renderPrompts(renderer: Renderer2D): void {
    const restAlpha = easeOutCubic((this.elapsed - 0.9) / 0.7);
    const pulse = (0.74 + Math.sin(this.elapsed * 2.4) * 0.22) * restAlpha;
    const { ctx } = renderer;
    ctx.save();
    ctx.globalAlpha = restAlpha;
    const buttonFill = ctx.createLinearGradient(0, JOIN_BUTTON.y, 0, JOIN_BUTTON.y + JOIN_BUTTON.height);
    buttonFill.addColorStop(0, "rgba(190, 105, 43, 0.96)");
    buttonFill.addColorStop(1, "rgba(112, 43, 25, 0.98)");
    ctx.shadowColor = `rgba(242, 169, 59, ${(0.18 + pulse * 0.16).toFixed(3)})`;
    ctx.shadowBlur = 18;
    ctx.fillStyle = buttonFill;
    ctx.fillRect(JOIN_BUTTON.x, JOIN_BUTTON.y, JOIN_BUTTON.width, JOIN_BUTTON.height);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255, 211, 139, ${Math.max(0.52, pulse).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(JOIN_BUTTON.x + 0.75, JOIN_BUTTON.y + 0.75, JOIN_BUTTON.width - 1.5, JOIN_BUTTON.height - 1.5);
    renderer.text("JOIN SESSION", JOIN_BUTTON.x + 24, JOIN_BUTTON.y + 27, {
      color: "#fff4d8",
      font: "900 20px 'Trebuchet MS', sans-serif"
    });
    renderer.text("ONE GLOBAL LOBBY  ›", JOIN_BUTTON.x + JOIN_BUTTON.width - 22, JOIN_BUTTON.y + 43, {
      align: "right",
      color: "rgba(255,226,179,0.74)",
      font: "bold 10px Consolas"
    });
    ctx.restore();

    renderer.text(audioModeLabel(this.audioMode), renderer.width - 24, 34, {
      align: "right",
      color: "#64788f",
      font: "bold 12px Consolas"
    });

    renderer.text("CLICK / TAP THE SCREEN ONCE TO WAKE THE ORIGINAL TITLE THEME", renderer.width * 0.5, renderer.height - 34, {
      align: "center",
      color: "#4f6076",
      font: "11px Consolas"
    });
    renderer.text("W / UP throttle   S / DOWN brake   Q / E shift   A / D lane   R restart   M audio", renderer.width * 0.5, renderer.height - 14, {
      align: "center",
      color: "#66788f",
      font: "12px Consolas"
    });
  }
}
