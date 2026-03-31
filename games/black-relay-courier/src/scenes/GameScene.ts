import { SeededRng, type Scene } from "@playloom/engine-core";
import { SynthAudio } from "@playloom/engine-audio";
import { ActionMap, type ActionBindings } from "@playloom/engine-input";
import { drawBar, drawPanel, drawTextBlock } from "@playloom/engine-renderer-canvas";
import { CockpitAudio } from "../audio/CockpitAudio";
import type { AppServices } from "../context";
import {
  CERTIFICATION_BANDS,
  MAX_SSI,
  SSI_EFFECT_CEILING,
  bandCommand,
  clamp,
  computeStrain,
  getSpeedState,
  isWithinBand,
  stepFlightModel,
  updateHoldProgress,
  type CertificationBand
} from "../flightModel";
import {
  createDramaticSurgeState,
  rearmSurgeBandIfBelow,
  shouldTriggerSurge,
  type DramaticSurgeBandState
} from "../surgeBands";
import {
  createRetroCollapseState,
  rearmRetroCollapseBandIfAbove,
  shouldTriggerRetroCollapse,
  type RetroCollapseBandState
} from "../retroCollapseBands";
import { FLIGHT_SLICE_TITLE, SPACE_VIEW_RATIO } from "../types";

type StarKind = "dot" | "square" | "cross";

interface Star {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  depth: number;
  size: number;
  twinkle: number;
  kind: StarKind;
  active: boolean;
  dormantTimer: number;
}

interface DensitySection {
  label: string;
  minDensity: number;
  maxDensity: number;
  minDuration: number;
  maxDuration: number;
}

const DENSITY_SECTIONS: readonly DensitySection[] = [
  {
    label: "Quiet Gap",
    minDensity: 0.18,
    maxDensity: 0.34,
    minDuration: 4.8,
    maxDuration: 8.4
  },
  {
    label: "Open Drift",
    minDensity: 0.42,
    maxDensity: 0.58,
    minDuration: 5.5,
    maxDuration: 9.2
  },
  {
    label: "Cluster Veil",
    minDensity: 0.62,
    maxDensity: 0.8,
    minDuration: 4.5,
    maxDuration: 8
  },
  {
    label: "Relay Dust",
    minDensity: 0.82,
    maxDensity: 0.96,
    minDuration: 3.8,
    maxDuration: 6.6
  }
];

const ACTIONS: ActionBindings = {
  accelerate: ["w", "arrowup"],
  brake: ["s", "arrowdown"],
  restart: ["r"],
  toggle_help: ["h"],
  toggle_audio: ["m"],
  menu_back: ["escape", "backspace"]
};

export class GameScene implements Scene {
  private readonly actions: ActionMap;
  private readonly audio = new SynthAudio();
  private readonly cockpitAudio = new CockpitAudio();
  private readonly rng = new SeededRng(0xb14c4e12);
  private readonly stars: Star[] = [];

  private throttle = 0;
  private ssi = 0;
  private holdProgress = 0;
  private stageIndex = 0;
  private clock = 0;
  private stageFlash = 0;
  private helpVisible = true;
  private audioEnabled = true;
  private certificationPassed = false;
  private statusText = "";
  private statusTimer = 0;
  private densityCurrent = 0.56;
  private densityTarget = 0.56;
  private densityTimer = 6;
  private densityLabel = "Open Drift";
  private surgeBands: DramaticSurgeBandState[] = [];
  private retroCollapseBands: RetroCollapseBandState[] = [];
  private shakeTimer = 0;
  private shakeStrength = 0;
  private shakeBiasY = 0;
  private surgeFlash = 0;
  private canopyBloom = 0;
  private canopyBloomStrength = 0;
  private surgeLabel = "";
  private surgeAccent = "#f7efd8";
  private surgeMajor = false;
  private effectDirection: "surge" | "collapse" = "surge";

  private readonly unlockAudio = (): void => {
    if (this.audioEnabled) {
      this.audio.unlock();
      this.cockpitAudio.unlock();
    }
  };

  constructor(
    private readonly services: AppServices,
    private readonly returnToTitle: () => void
  ) {
    this.actions = new ActionMap(this.services.input, ACTIONS);
    this.seedStars();
    this.resetFlight();
  }

  onEnter(): void {
    window.addEventListener("keydown", this.unlockAudio);
    window.addEventListener("pointerdown", this.unlockAudio, { passive: true });
  }

  onExit(): void {
    window.removeEventListener("keydown", this.unlockAudio);
    window.removeEventListener("pointerdown", this.unlockAudio);
    this.cockpitAudio.shutdown();
  }

  update(dt: number): void {
    this.clock += dt;
    this.stageFlash = Math.max(0, this.stageFlash - dt);
    this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    this.surgeFlash = Math.max(0, this.surgeFlash - dt);
    this.canopyBloom = Math.max(0, this.canopyBloom - dt);
    if (this.statusTimer > 0) {
      this.statusTimer = Math.max(0, this.statusTimer - dt);
    }

    if (this.actions.wasPressed("toggle_help")) {
      this.helpVisible = !this.helpVisible;
    }
    if (this.actions.wasPressed("toggle_audio")) {
      this.audioEnabled = !this.audioEnabled;
      this.audio.setEnabled(this.audioEnabled);
      this.cockpitAudio.setEnabled(this.audioEnabled);
      if (this.audioEnabled) {
        this.audio.unlock();
        this.cockpitAudio.unlock();
      }
      this.setStatus(this.audioEnabled ? "Cockpit audio restored." : "Cockpit audio muted.", 1.8);
    }
    if (this.actions.wasPressed("menu_back")) {
      this.returnToTitle();
      return;
    }
    if (this.actions.wasPressed("restart")) {
      this.audio.beep(540, 0.08, "triangle");
      this.resetFlight();
      return;
    }

    const accelerating = this.actions.isDown("accelerate");
    const braking = this.actions.isDown("brake");
    const previousSsi = this.ssi;
    const previousState = getSpeedState(this.ssi).label;

    if (this.audioEnabled && this.actions.wasPressed("accelerate")) {
      this.audio.whoosh();
    }
    if (this.audioEnabled && this.actions.wasPressed("brake")) {
      this.audio.impact();
    }

    const next = stepFlightModel({ throttle: this.throttle, ssi: this.ssi }, { accelerate: accelerating, brake: braking }, dt);
    this.throttle = next.throttle;
    this.ssi = next.ssi;
    const decelRate = Math.max(0, (previousSsi - this.ssi) / Math.max(dt, 1 / 240));
    const strain = computeStrain(this.throttle, this.ssi, braking);

    this.cockpitAudio.update({
      throttle: this.throttle,
      ssi: this.ssi,
      strain,
      accelerating,
      braking
    });

    this.updateSurges(previousSsi, this.ssi, accelerating);
    this.updateRetroCollapses(previousSsi, this.ssi, braking, decelRate);
    this.updateStars(dt);
    this.updateCertification(dt);

    const currentState = getSpeedState(this.ssi).label;
    if (
      currentState !== previousState &&
      (currentState === "Needle" || currentState === "Slipwake" || currentState === "Black Relay")
    ) {
      this.audio.beep(currentState === "Black Relay" ? 860 : currentState === "Slipwake" ? 760 : 680, 0.05, "sine");
    }
  }

  render(_alpha: number): void {
    const { ctx } = this.services.renderer;
    const shake = this.shakeOffset();

    this.renderBackdrop();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    this.renderStarfield();
    this.renderCanopyBloom();
    this.renderReticle();
    this.renderStageStrip();
    this.renderCockpit();
    if (this.helpVisible) {
      this.renderHelpOverlay();
    }
    if (this.statusTimer > 0) {
      this.renderStatus();
    }
    ctx.restore();
  }

  private get viewHeight(): number {
    return Math.round(this.services.renderer.height * SPACE_VIEW_RATIO);
  }

  private get vanishX(): number {
    return this.services.renderer.width * 0.5;
  }

  private get vanishY(): number {
    return this.viewHeight * 0.54;
  }

  private currentBand(): CertificationBand | null {
    return this.certificationPassed ? null : (CERTIFICATION_BANDS[this.stageIndex] ?? null);
  }

  private resetFlight(): void {
    this.throttle = 0;
    this.ssi = 0;
    this.holdProgress = 0;
    this.stageIndex = 0;
    this.clock = 0;
    this.stageFlash = 0;
    this.certificationPassed = false;
    this.surgeBands = createDramaticSurgeState(this.rng);
    this.retroCollapseBands = createRetroCollapseState(this.rng);
    this.shakeTimer = 0;
    this.shakeStrength = 0;
    this.shakeBiasY = 0;
    this.surgeFlash = 0;
    this.canopyBloom = 0;
    this.canopyBloomStrength = 0;
    this.surgeLabel = "";
    this.surgeAccent = "#f7efd8";
    this.surgeMajor = false;
    this.effectDirection = "surge";
    this.resetDensitySection(true);
    for (const star of this.stars) {
      this.respawnStar(star, false);
    }
    this.setStatus("Slipwake rig cold. Raise throttle to enter the first lattice.", 3.4);
  }

  private updateSurges(previousSsi: number, currentSsi: number, accelerating: boolean): void {
    const nextBands: DramaticSurgeBandState[] = [];

    for (let i = 0; i < this.surgeBands.length; i += 1) {
      let band = rearmSurgeBandIfBelow(this.surgeBands[i]!, previousSsi, currentSsi, this.rng);

      if (shouldTriggerSurge(band, previousSsi, currentSsi, accelerating)) {
        band = { ...band, triggered: true };
        this.fireSurge(band);
      }

      nextBands.push(band);
    }

    this.surgeBands = nextBands;
  }

  private updateRetroCollapses(
    previousSsi: number,
    currentSsi: number,
    braking: boolean,
    decelRate: number
  ): void {
    const nextBands: RetroCollapseBandState[] = [];

    for (let i = 0; i < this.retroCollapseBands.length; i += 1) {
      let band = rearmRetroCollapseBandIfAbove(this.retroCollapseBands[i]!, previousSsi, currentSsi, this.rng);

      if (shouldTriggerRetroCollapse(band, previousSsi, currentSsi, braking, decelRate)) {
        band = { ...band, triggered: true };
        this.fireRetroCollapse(band, decelRate);
      }

      nextBands.push(band);
    }

    this.retroCollapseBands = nextBands;
  }

  private fireSurge(band: DramaticSurgeBandState): void {
    const intensity = clamp((band.min - 80) / (MAX_SSI - 80), 0, 1);
    const majorBonus = band.tier === "major" ? 1 : 0;
    const tone = 420 + intensity * 360;

    this.effectDirection = "surge";
    this.shakeTimer = 0.18 + intensity * 0.16 + majorBonus * 0.12;
    this.shakeStrength = 2.4 + intensity * 4.6 + majorBonus * 3.2;
    this.shakeBiasY = 0;
    this.surgeFlash = 0.52 + intensity * 0.16 + majorBonus * 0.18;
    this.canopyBloom = 0.4 + intensity * 0.16 + majorBonus * 0.22;
    this.canopyBloomStrength = 0.34 + intensity * 0.34 + majorBonus * 0.46;
    this.surgeLabel = band.tier === "major" ? `${band.label} Major` : band.label;
    this.surgeAccent = band.accent;
    this.surgeMajor = band.tier === "major";

    this.audio.beep(tone, 0.06, "triangle");
    this.audio.beep(tone * 1.18, 0.05, "sine");
    if (band.min >= 280) {
      this.audio.whoosh();
    }
    if (band.tier === "major") {
      this.audio.impact();
      this.audio.beep(tone * 1.32, 0.08, "sine");
    }

    this.vibrateImpulse(intensity, this.surgeMajor, false);
  }

  private fireRetroCollapse(band: RetroCollapseBandState, decelRate: number): void {
    const intensity = clamp((band.min - 170) / (MAX_SSI - 170), 0, 1);
    const decelBonus = clamp((decelRate - band.minDecel) / 220, 0, 1);
    const majorBonus = band.tier === "major" ? 1 : 0;
    const tone = 260 - intensity * 72 - decelBonus * 34;

    this.effectDirection = "collapse";
    this.shakeTimer = 0.16 + intensity * 0.12 + decelBonus * 0.08 + majorBonus * 0.12;
    this.shakeStrength = 1.8 + intensity * 3.2 + decelBonus * 2.8 + majorBonus * 3;
    this.shakeBiasY = 2.6 + intensity * 4.2 + decelBonus * 1.8 + majorBonus * 2.2;
    this.surgeFlash = 0.46 + intensity * 0.18 + majorBonus * 0.2;
    this.canopyBloom = 0.34 + intensity * 0.14 + decelBonus * 0.1 + majorBonus * 0.22;
    this.canopyBloomStrength = 0.28 + intensity * 0.24 + decelBonus * 0.18 + majorBonus * 0.34;
    this.surgeLabel = band.tier === "major" ? `${band.label} Major` : band.label;
    this.surgeAccent = band.accent;
    this.surgeMajor = band.tier === "major";

    this.audio.impact();
    this.audio.whoosh();
    this.audio.beep(Math.max(86, tone), 0.05, "triangle");
    this.audio.beep(Math.max(72, tone * 0.72), 0.08, "sine");
    if (band.tier === "major") {
      this.audio.impact();
      this.audio.beep(Math.max(64, tone * 0.56), 0.1, "triangle");
    }

    this.vibrateImpulse(intensity + decelBonus * 0.5, this.surgeMajor, true);
  }

  private vibrateImpulse(intensity: number, major: boolean, collapse: boolean): void {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
      return;
    }

    const pulse = 12 + Math.round(intensity * 18) + (major ? 8 : 0);
    if (collapse) {
      navigator.vibrate(major ? [pulse + 4, 24, pulse + 12, 30, pulse + 6] : [pulse + 2, 20, pulse + 8]);
      return;
    }

    navigator.vibrate(major ? [pulse, 22, pulse + 10, 28, pulse + 4] : [pulse, 18, pulse + 6]);
  }

  private shakeOffset(): { x: number; y: number } {
    if (this.shakeTimer <= 0 || this.shakeStrength <= 0) {
      return { x: 0, y: 0 };
    }

    const life = clamp(this.shakeTimer / 0.46, 0, 1);
    const amplitude = this.shakeStrength * life;
    return {
      x: Math.sin(this.clock * 88) * amplitude,
      y: Math.cos(this.clock * 116) * amplitude * 0.72 + this.shakeBiasY * life
    };
  }

  private setStatus(text: string, duration = 2.4): void {
    this.statusText = text;
    this.statusTimer = duration;
  }

  private seedStars(): void {
    for (let i = 0; i < 240; i += 1) {
      const star: Star = {
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        depth: 0.5,
        size: 1,
        twinkle: 0,
        kind: "dot",
        active: true,
        dormantTimer: 0
      };
      this.respawnStar(star, false);
      this.stars.push(star);
    }
  }

  private resetDensitySection(initial = false): void {
    const roll = this.rng.next();
    let section: DensitySection;

    if (initial) {
      section = roll < 0.68 ? DENSITY_SECTIONS[1]! : DENSITY_SECTIONS[2]!;
    } else if (roll < 0.18) {
      section = DENSITY_SECTIONS[0]!;
    } else if (roll < 0.58) {
      section = DENSITY_SECTIONS[1]!;
    } else if (roll < 0.86) {
      section = DENSITY_SECTIONS[2]!;
    } else {
      section = DENSITY_SECTIONS[3]!;
    }

    this.densityLabel = section.label;
    this.densityTarget = this.rng.range(section.minDensity, section.maxDensity);
    this.densityTimer = this.rng.range(section.minDuration, section.maxDuration);
    if (initial) {
      this.densityCurrent = this.densityTarget;
    }
  }

  private spawnChance(): number {
    const speedBonus = clamp(this.ssi / SSI_EFFECT_CEILING, 0, 1) * 0.08;
    return clamp(this.densityCurrent + speedBonus, 0.14, 0.98);
  }

  private queueDormantStar(star: Star): void {
    star.active = false;
    star.dormantTimer = this.rng.range(0.12, 0.5 + (1 - this.densityCurrent) * 1.8);
    star.x = -120;
    star.y = -120;
    star.prevX = star.x;
    star.prevY = star.y;
  }

  private respawnStar(star: Star, nearCore: boolean): void {
    if (!this.rng.chance(this.spawnChance())) {
      this.queueDormantStar(star);
      return;
    }

    const maxRadius = Math.hypot(this.services.renderer.width * 0.75, this.viewHeight * 0.9);
    const angle = this.rng.range(0, Math.PI * 2);
    const speedRatio = clamp(this.ssi / SSI_EFFECT_CEILING, 0, 1);
    let radius: number;

    if (!nearCore) {
      radius = this.rng.range(20, maxRadius);
    } else {
      const spawnMidLane = speedRatio > 0.16 && this.rng.chance(0.24 + speedRatio * 0.42);
      if (spawnMidLane) {
        const minRadius = maxRadius * 0.16;
        const maxMidRadius = maxRadius * (0.28 + speedRatio * 0.26);
        radius = this.rng.range(minRadius, Math.min(maxRadius * 0.58, maxMidRadius));
      } else {
        radius = this.rng.range(8, 52 + speedRatio * 54);
      }
    }

    star.x = this.vanishX + Math.cos(angle) * radius;
    star.y = this.vanishY + Math.sin(angle) * radius;
    star.prevX = star.x;
    star.prevY = star.y;
    star.depth = this.rng.range(0.24, 1);
    star.size = this.rng.range(0.7, 2.5);
    star.twinkle = this.rng.range(0, Math.PI * 2);
    star.kind = this.rng.pick<StarKind>(["dot", "square", "cross"]);
    star.active = true;
    star.dormantTimer = 0;
  }

  private updateStars(dt: number): void {
    this.densityTimer = Math.max(0, this.densityTimer - dt);
    if (this.densityTimer <= 0) {
      this.resetDensitySection();
    }
    this.densityCurrent += (this.densityTarget - this.densityCurrent) * Math.min(1, dt * 0.45);

    const speedRatio = clamp(this.ssi / SSI_EFFECT_CEILING, 0, 1);
    const fieldStrength = 1.6 + speedRatio * speedRatio * 980;
    const width = this.services.renderer.width;
    const height = this.viewHeight;

    for (const star of this.stars) {
      if (!star.active) {
        star.dormantTimer = Math.max(0, star.dormantTimer - dt);
        if (star.dormantTimer <= 0) {
          this.respawnStar(star, true);
        }
        continue;
      }

      star.prevX = star.x;
      star.prevY = star.y;

      const dx = star.x - this.vanishX;
      const dy = star.y - this.vanishY;
      const distance = Math.max(18, Math.hypot(dx, dy));
      const unitX = dx / distance;
      const unitY = dy / distance;
      const swirl = Math.sin(this.clock * (0.6 + star.depth * 1.9) + star.twinkle) * (1 - speedRatio) * 7 * dt;
      const motion = (0.7 + fieldStrength * (0.28 + star.depth * 0.86)) * dt;

      star.x += unitX * motion - unitY * swirl;
      star.y += unitY * motion + unitX * swirl * 0.8;

      if (star.x < -90 || star.x > width + 90 || star.y < -90 || star.y > height + 90) {
        this.respawnStar(star, true);
      }
    }
  }

  private updateCertification(dt: number): void {
    if (this.certificationPassed) {
      return;
    }

    const band = this.currentBand();
    if (!band) {
      return;
    }

    const previous = this.holdProgress;
    this.holdProgress = updateHoldProgress(this.holdProgress, this.ssi, band, dt);
    if (previous < band.holdSeconds && this.holdProgress >= band.holdSeconds) {
      this.audio.repair();
      this.stageFlash = 1.4;
      this.stageIndex += 1;
      this.holdProgress = 0;

      if (this.stageIndex >= CERTIFICATION_BANDS.length) {
        this.certificationPassed = true;
        this.setStatus("Relay clearance granted. Free-flight authorization unlocked.", 4.2);
        this.audio.beep(840, 0.1, "sine");
        return;
      }

      const nextBand = CERTIFICATION_BANDS[this.stageIndex]!;
      this.setStatus(`${band.label} locked. Next window: ${nextBand.label}.`, 2.8);
    }
  }

  private renderBackdrop(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const viewHeight = this.viewHeight;
    const speedRatio = clamp(this.ssi / SSI_EFFECT_CEILING, 0, 1);

    renderer.clear("#03050a");

    const sky = ctx.createLinearGradient(0, 0, 0, viewHeight);
    sky.addColorStop(0, "#010204");
    sky.addColorStop(0.46, "#04060a");
    sky.addColorStop(1, "#090c12");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, renderer.width, viewHeight);

    const horizonGlow = ctx.createRadialGradient(this.vanishX, this.vanishY, 0, this.vanishX, this.vanishY, renderer.width * 0.45);
    horizonGlow.addColorStop(0, `rgba(255, 238, 190, ${(0.04 + speedRatio * 0.08).toFixed(3)})`);
    horizonGlow.addColorStop(0.38, `rgba(117, 131, 161, ${(0.03 + speedRatio * 0.04).toFixed(3)})`);
    horizonGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, 0, renderer.width, viewHeight);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, renderer.width, viewHeight);
    ctx.clip();

    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.lineWidth = 1.4 + i * 0.5;
      ctx.strokeStyle = `rgba(178, 188, 214, ${(0.05 + speedRatio * 0.04 - i * 0.008).toFixed(3)})`;
      ctx.arc(this.vanishX, this.vanishY, 58 + i * 64 + speedRatio * 32, Math.PI * 1.04, Math.PI * 1.96);
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderStarfield(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const viewHeight = this.viewHeight;
    const speedRatio = clamp(this.ssi / SSI_EFFECT_CEILING, 0, 1);
    const collapseRatio = this.effectDirection === "collapse" ? clamp(this.surgeFlash / 0.92, 0, 1) : 0;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, renderer.width, viewHeight);
    ctx.clip();

    for (const star of this.stars) {
      if (!star.active) {
        continue;
      }

      const motionX = star.x - star.prevX;
      const motionY = star.y - star.prevY;
      const motionLength = Math.max(0.0001, Math.hypot(motionX, motionY));
      const unitX = motionX / motionLength;
      const unitY = motionY / motionLength;
      const alpha =
        0.24 +
        star.depth * 0.54 +
        (Math.sin(this.clock * (1.6 + star.depth * 2.1) + star.twinkle) + 1) * 0.06;
      const color = `rgba(250, 252, 255, ${Math.min(0.95, alpha).toFixed(3)})`;

      if (speedRatio > 0.07) {
        const trailBase = motionLength * (1.4 + speedRatio * 6.2) + star.depth * speedRatio * 26;
        const trail = collapseRatio > 0 ? trailBase * (1 - collapseRatio * 0.58) : trailBase;
        renderer.line(star.x - unitX * trail, star.y - unitY * trail, star.x, star.y, color, 0.8 + star.depth * 1.3);
        if (collapseRatio > 0.08) {
          const snap = (4 + collapseRatio * 14 + star.depth * 5) * (this.surgeMajor ? 1.12 : 1);
          const collapseColor = `rgba(214, 233, 255, ${(0.22 + collapseRatio * 0.34 + star.depth * 0.16).toFixed(3)})`;
          renderer.line(star.x - unitX * snap, star.y - unitY * snap, star.x, star.y, collapseColor, 0.6 + star.depth);
        }
        continue;
      }

      if (star.kind === "square") {
        renderer.rect(star.x - star.size * 0.5, star.y - star.size * 0.5, star.size, star.size, color);
        continue;
      }

      if (star.kind === "cross") {
        renderer.line(star.x - star.size, star.y, star.x + star.size, star.y, color, 1);
        renderer.line(star.x, star.y - star.size, star.x, star.y + star.size, color, 1);
        continue;
      }

      renderer.circle(star.x, star.y, star.size * 0.5, color);
    }

    ctx.restore();
  }

  private renderCanopyBloom(): void {
    const bloomRatio = clamp(this.canopyBloom / 0.92, 0, 1);
    if (bloomRatio <= 0) {
      return;
    }

    const { renderer } = this.services;
    const { ctx } = renderer;
    const viewHeight = this.viewHeight;
    const collapse = this.effectDirection === "collapse";
    const bloomRadius = renderer.width * (collapse ? 0.22 + bloomRatio * 0.12 : 0.28 + (1 - bloomRatio) * 0.18);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, renderer.width, viewHeight + 14);
    ctx.clip();

    const flash = ctx.createRadialGradient(this.vanishX, this.vanishY, 0, this.vanishX, this.vanishY, bloomRadius);
    if (collapse) {
      flash.addColorStop(0, `rgba(238, 247, 255, ${((0.08 + this.canopyBloomStrength * 0.22) * bloomRatio).toFixed(3)})`);
      flash.addColorStop(0.24, `rgba(186, 215, 255, ${((0.06 + this.canopyBloomStrength * 0.18) * bloomRatio).toFixed(3)})`);
      flash.addColorStop(0.68, `rgba(99, 151, 222, ${((0.02 + this.canopyBloomStrength * 0.08) * bloomRatio).toFixed(3)})`);
    } else {
      flash.addColorStop(0, `rgba(255, 248, 229, ${((0.08 + this.canopyBloomStrength * 0.22) * bloomRatio).toFixed(3)})`);
      flash.addColorStop(0.28, `rgba(255, 236, 188, ${((0.06 + this.canopyBloomStrength * 0.16) * bloomRatio).toFixed(3)})`);
      flash.addColorStop(0.72, `rgba(171, 195, 255, ${((0.02 + this.canopyBloomStrength * 0.08) * bloomRatio).toFixed(3)})`);
    }
    flash.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = flash;
    ctx.fillRect(0, 0, renderer.width, viewHeight);

    const canopySweep = ctx.createLinearGradient(0, 0, 0, viewHeight);
    if (collapse) {
      canopySweep.addColorStop(0, `rgba(239, 247, 255, ${((0.02 + this.canopyBloomStrength * 0.1) * bloomRatio).toFixed(3)})`);
      canopySweep.addColorStop(0.24, `rgba(185, 215, 255, ${((0.03 + this.canopyBloomStrength * 0.1) * bloomRatio).toFixed(3)})`);
    } else {
      canopySweep.addColorStop(0, `rgba(255, 251, 241, ${((0.02 + this.canopyBloomStrength * 0.12) * bloomRatio).toFixed(3)})`);
      canopySweep.addColorStop(0.24, `rgba(255, 231, 177, ${((0.03 + this.canopyBloomStrength * 0.12) * bloomRatio).toFixed(3)})`);
    }
    canopySweep.addColorStop(0.72, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = canopySweep;
    ctx.fillRect(0, 0, renderer.width, viewHeight);

    ctx.globalAlpha = 0.18 + bloomRatio * 0.36;
    ctx.strokeStyle = this.surgeAccent;
    ctx.lineWidth = 2 + this.canopyBloomStrength * 1.8;
    for (let i = 0; i < 2; i += 1) {
      const radius = collapse
        ? 82 + bloomRatio * 54 + i * 42
        : 92 + i * 54 + (1 - bloomRatio) * 28;
      ctx.beginPath();
      ctx.arc(
        this.vanishX,
        this.vanishY,
        radius,
        Math.PI * 1.02,
        Math.PI * 1.98
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderReticle(): void {
    const { renderer } = this.services;
    const speedState = getSpeedState(this.ssi);
    const speedRatio = clamp(this.ssi / SSI_EFFECT_CEILING, 0, 1);
    const ringRadius = 22 + speedRatio * 18;
    const surgeRatio = clamp(this.surgeFlash / 0.92, 0, 1);
    const collapse = this.effectDirection === "collapse";

    renderer.circle(this.vanishX, this.vanishY, 2.2, "rgba(255, 245, 211, 0.95)");
    renderer.line(this.vanishX - 54, this.vanishY, this.vanishX - 18, this.vanishY, "rgba(151, 214, 255, 0.7)", 1.5);
    renderer.line(this.vanishX + 18, this.vanishY, this.vanishX + 54, this.vanishY, "rgba(151, 214, 255, 0.7)", 1.5);
    renderer.line(this.vanishX, this.vanishY - 42, this.vanishX, this.vanishY - 14, "rgba(151, 214, 255, 0.7)", 1.5);

    const { ctx } = renderer;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 229, 154, ${(0.46 + speedRatio * 0.24).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(this.vanishX, this.vanishY, ringRadius, Math.PI * 0.12, Math.PI * 0.88);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.vanishX, this.vanishY, ringRadius, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    if (surgeRatio > 0) {
      ctx.globalAlpha = 0.24 + surgeRatio * 0.52;
      ctx.strokeStyle = this.surgeAccent;
      ctx.lineWidth = 2.2;
      if (collapse) {
        const collapseRadius = Math.max(10, ringRadius - 8 - (1 - surgeRatio) * 16);
        ctx.beginPath();
        ctx.arc(this.vanishX, this.vanishY, collapseRadius, Math.PI * 0.18, Math.PI * 0.82);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(this.vanishX, this.vanishY, collapseRadius, Math.PI * 1.18, Math.PI * 1.82);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(this.vanishX, this.vanishY, ringRadius + 18 + (1 - surgeRatio) * 16, Math.PI * 0.04, Math.PI * 0.96);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(this.vanishX, this.vanishY, ringRadius + 18 + (1 - surgeRatio) * 16, Math.PI * 1.04, Math.PI * 1.96);
        ctx.stroke();
      }
    }
    ctx.restore();

    if (surgeRatio > 0 && this.surgeLabel) {
      renderer.text(this.surgeLabel.toUpperCase(), this.vanishX, this.vanishY - 52 - (1 - surgeRatio) * 10, {
        align: "center",
        color: this.surgeAccent,
        font: "bold 16px Trebuchet MS"
      });
      if (this.surgeMajor) {
        renderer.text(collapse ? "RETRO MAJOR" : "HIGH-SHEAR MAJOR", this.vanishX, this.vanishY - 70 - (1 - surgeRatio) * 8, {
          align: "center",
          color: "#f7efd8",
          font: "bold 12px Trebuchet MS"
        });
      } else if (collapse) {
        renderer.text("RETRO COLLAPSE", this.vanishX, this.vanishY - 70 - (1 - surgeRatio) * 8, {
          align: "center",
          color: "#f7efd8",
          font: "bold 12px Trebuchet MS"
        });
      }
    }

    renderer.text(speedState.label.toUpperCase(), this.vanishX, this.vanishY + 58, {
      align: "center",
      color: speedState.accent,
      font: "bold 20px Trebuchet MS"
    });
  }

  private renderStageStrip(): void {
    const { renderer } = this.services;
    const totalWidth = 520;
    const startX = renderer.width * 0.5 - totalWidth * 0.5;
    const y = 26;
    const itemWidth = 118;

    for (let i = 0; i < CERTIFICATION_BANDS.length; i += 1) {
      const band = CERTIFICATION_BANDS[i]!;
      const x = startX + i * (itemWidth + 12);
      const completed = i < this.stageIndex;
      const current = !this.certificationPassed && i === this.stageIndex;
      const fill = completed
        ? "rgba(99, 217, 255, 0.34)"
        : current
          ? `rgba(255, 229, 154, ${(0.28 + this.stageFlash * 0.16).toFixed(3)})`
          : "rgba(12, 18, 27, 0.56)";
      const stroke = completed ? "#7edaff" : current ? "#ffe8a3" : "rgba(255,255,255,0.16)";
      renderer.rect(x, y, itemWidth, 34, fill);
      renderer.strokeRect(x, y, itemWidth, 34, stroke, current ? 2 : 1.2);
      renderer.text(`${i + 1}. ${band.label}`, x + itemWidth * 0.5, y + 22, {
        align: "center",
        color: completed || current ? "#f6f0de" : "#b9c7da",
        font: current ? "bold 14px Trebuchet MS" : "13px Trebuchet MS"
      });
    }
  }

  private renderCockpit(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const consoleY = this.viewHeight;
    const centerPanelWidth = 364;
    const centerPanelX = renderer.width * 0.5 - centerPanelWidth * 0.5;
    const leftPanelX = 34;
    const rightPanelWidth = 296;
    const rightPanelX = renderer.width - rightPanelWidth - 34;
    const strain = computeStrain(this.throttle, this.ssi, this.actions.isDown("brake"));
    const speedState = getSpeedState(this.ssi);
    const currentBand = this.currentBand();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, renderer.height);
    ctx.lineTo(0, consoleY + 32);
    ctx.lineTo(renderer.width * 0.14, consoleY - 10);
    ctx.lineTo(renderer.width * 0.86, consoleY - 10);
    ctx.lineTo(renderer.width, consoleY + 32);
    ctx.lineTo(renderer.width, renderer.height);
    ctx.closePath();
    const shell = ctx.createLinearGradient(0, consoleY - 10, 0, renderer.height);
    shell.addColorStop(0, "rgba(15, 18, 24, 0.96)");
    shell.addColorStop(1, "rgba(5, 6, 9, 1)");
    ctx.fillStyle = shell;
    ctx.fill();
    ctx.restore();

    renderer.line(0, consoleY + 18, renderer.width, consoleY + 18, "rgba(122, 213, 255, 0.22)", 2);

    drawPanel(renderer, leftPanelX, consoleY + 24, 286, 140, "Drive");
    renderer.text("Throttle", leftPanelX + 18, consoleY + 62, {
      color: "#f0e0b4",
      font: "16px Trebuchet MS"
    });
    renderer.text(`${Math.round(this.throttle)}%`, leftPanelX + 268, consoleY + 62, {
      align: "right",
      color: "#f6f1df",
      font: "bold 18px Trebuchet MS"
    });
    drawBar(renderer, leftPanelX + 18, consoleY + 76, 250, 16, this.throttle, 100, "#79d8ff");
    renderer.text(this.actions.isDown("brake") ? "Retro brake engaged" : this.throttle < 1 ? "Drive idle" : "Throttle holding", leftPanelX + 18, consoleY + 118, {
      color: this.actions.isDown("brake") ? "#ffbca5" : "#cbd8ea",
      font: "15px Trebuchet MS"
    });
    renderer.text("Strain", leftPanelX + 18, consoleY + 142, {
      color: "#f0e0b4",
      font: "15px Trebuchet MS"
    });
    drawBar(renderer, leftPanelX + 82, consoleY + 130, 186, 12, strain, 100, strain > 70 ? "#ff9a84" : "#9aedc5");

    drawPanel(renderer, centerPanelX, consoleY + 18, centerPanelWidth, 150, FLIGHT_SLICE_TITLE);
    renderer.text("Slipwake Shear Index", renderer.width * 0.5, consoleY + 58, {
      align: "center",
      color: "#cadbed",
      font: "18px Palatino Linotype"
    });
    renderer.text(Math.round(this.ssi).toString().padStart(3, "0"), renderer.width * 0.5, consoleY + 114, {
      align: "center",
      color: "#f7efd8",
      font: "bold 68px Georgia"
    });
    renderer.text(speedState.label.toUpperCase(), renderer.width * 0.5, consoleY + 144, {
      align: "center",
      color: speedState.accent,
      font: "bold 18px Trebuchet MS"
    });
    renderer.text(
      this.surgeFlash > 0 && this.surgeLabel ? this.surgeLabel.toUpperCase() : `Ceiling ${MAX_SSI} SSI`,
      renderer.width * 0.5,
      consoleY + 160,
      {
        align: "center",
        color: this.surgeFlash > 0 ? this.surgeAccent : "#92a6bd",
        font: this.surgeFlash > 0 ? "bold 13px Trebuchet MS" : "13px Trebuchet MS"
      }
    );

    drawPanel(renderer, rightPanelX, consoleY + 24, rightPanelWidth, 140, this.certificationPassed ? "Clearance" : "Certification");
    if (this.certificationPassed || !currentBand) {
      renderer.text("Relay clearance granted", rightPanelX + 18, consoleY + 62, {
        color: "#f7e6af",
        font: "bold 22px Georgia"
      });
      drawTextBlock(
        renderer,
        "Slipwake thresholds are open. Free-flight the rig or restart the test to run the certification again.",
        rightPanelX + 18,
        consoleY + 94,
        rightPanelWidth - 36,
        22,
        {
          color: "#d7e4f5",
          font: "16px Trebuchet MS"
        }
      );
    } else {
      renderer.text(currentBand.label, rightPanelX + 18, consoleY + 60, {
        color: currentBand.accent,
        font: "bold 22px Georgia"
      });
      renderer.text(`${currentBand.min}-${currentBand.max} SSI`, rightPanelX + 18, consoleY + 86, {
        color: "#d8e4f4",
        font: "16px Trebuchet MS"
      });
      drawBar(renderer, rightPanelX + 18, consoleY + 100, rightPanelWidth - 36, 14, this.holdProgress, currentBand.holdSeconds, currentBand.accent);
      renderer.text(`${this.holdProgress.toFixed(1)} / ${currentBand.holdSeconds.toFixed(1)}s`, rightPanelX + rightPanelWidth - 18, consoleY + 94, {
        align: "right",
        color: "#f4ecda",
        font: "15px Trebuchet MS"
      });
      renderer.text(bandCommand(this.ssi, currentBand), rightPanelX + 18, consoleY + 134, {
        color: isWithinBand(this.ssi, currentBand) ? "#b6f2c7" : "#f5d79b",
        font: "15px Trebuchet MS"
      });
    }

    const footerY = renderer.height - 22;
    renderer.text("Black Relay cockpit sim | W/Up raise throttle | S/Down retro brake | R restart | Esc title", renderer.width * 0.5, footerY, {
      align: "center",
      color: "#8ea2b8",
      font: "14px Trebuchet MS"
    });
  }

  private renderHelpOverlay(): void {
    const { renderer } = this.services;
    const x = renderer.width - 356;
    const y = 84;

    drawPanel(renderer, x, y, 324, 206, "Slipwake Notes");
    drawTextBlock(
      renderer,
      "Stars stay as dots while drifting. At speed they still shear outward from one center wake, but some streaks spawn partway along that same center-to-edge path. The field shifts between sparse gaps and dusty pockets. Acceleration surges bloom warm and re-arm below their floor; braking collapses fire in three descending bands, crush the canopy cold, and only re-arm after you climb back above that band's ceiling.",
      x + 18,
      y + 38,
      288,
      21,
      {
        color: "#d8e4f4",
        font: "15px Trebuchet MS"
      }
    );
    renderer.text(`Audio ${this.audioEnabled ? "on" : "off"} | Field ${this.densityLabel} | Ceiling ${MAX_SSI}`, x + 18, y + 182, {
      color: "#f2dfab",
      font: "14px Trebuchet MS"
    });
  }

  private renderStatus(): void {
    const { renderer } = this.services;
    const width = Math.max(360, this.statusText.length * 8.3);
    const x = renderer.width * 0.5 - width * 0.5;
    const alpha = Math.min(1, this.statusTimer / 0.4);
    renderer.rect(x, 70, width, 34, `rgba(8, 11, 17, ${(0.72 * alpha).toFixed(3)})`);
    renderer.strokeRect(x, 70, width, 34, `rgba(245, 228, 166, ${(0.92 * alpha).toFixed(3)})`, 1.5);
    renderer.text(this.statusText, renderer.width * 0.5, 92, {
      align: "center",
      color: "#f7efd8",
      font: "15px Trebuchet MS"
    });
  }
}
