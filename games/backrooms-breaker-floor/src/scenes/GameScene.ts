import { AudioMixer } from "@playloom/engine-audio";
import { ActionMap, type ActionBindings } from "@playloom/engine-input";
import type { Scene } from "@playloom/engine-core";
import type { AppServices } from "../context";
import { loadGameAssets, type CharacterAssets, type GameAssets } from "../assets";
import { GAME_MANIFEST } from "../types";
import { TouchControls } from "../touch/TouchControls";
import {
  AREAS,
  EXIT_TERMINAL,
  LOCKED_EXIT_GATE,
  PANELS,
  PLAYER_SPAWN,
  RELAYS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type AreaDef,
  type Rect
} from "../world";

interface InteractionPrompt {
  kind: "relay" | "panel" | "exit";
  id: string;
  label: string;
  instruction: string;
}

interface StatusLine {
  text: string;
  ttl: number;
}

interface PlayerState {
  x: number;
  y: number;
  radius: number;
  facingX: number;
  facingY: number;
}

interface ScreenPoint {
  x: number;
  y: number;
}

const ACTIONS: ActionBindings = {
  move_left: ["a", "arrowleft"],
  move_right: ["d", "arrowright"],
  move_up: ["w", "arrowup"],
  move_down: ["s", "arrowdown"],
  interact: ["e", "enter", " "],
  toggle_darkness: ["g"],
  toggle_flashlight: ["f"],
  toggle_help: ["h"],
  menu_back: ["escape"],
  restart: ["r"],
  toggle_mute: ["m"]
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(current: number, target: number, factor: number): number {
  return current + (target - current) * factor;
}

function rectContainsPoint(rect: Rect, x: number, y: number, padding = 0): boolean {
  return (
    x >= rect.x + padding &&
    x <= rect.x + rect.width - padding &&
    y >= rect.y + padding &&
    y <= rect.y + rect.height - padding
  );
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

export class GameScene implements Scene {
  private readonly actions: ActionMap;
  private readonly touch: TouchControls;
  private readonly player: PlayerState = {
    x: PLAYER_SPAWN.x,
    y: PLAYER_SPAWN.y,
    radius: 12,
    facingX: 1,
    facingY: 0
  };

  private readonly collectedRelays = new Set<string>();
  private readonly activatedPanels = new Set<string>();
  private assets: GameAssets | null = null;
  private loadingError: string | null = null;
  private cameraX = 0;
  private cameraY = 0;
  private elapsed = 0;
  private stepClock = 0;
  private helpVisible = true;
  private escaped = false;
  private moveVisual = 0;
  private audioUnlocked = false;
  private ambientPlaying = false;
  private muted = false;
  private darknessEnabled = true;
  private flashlightOn = true;
  private darknessCanvas: HTMLCanvasElement | null = null;
  private darknessCtx: CanvasRenderingContext2D | null = null;
  private readonly mixer = new AudioMixer();
  private status: StatusLine = {
    text: "Follow the strongest fluorescent hum. Recover the relays before touching the breakers.",
    ttl: 7
  };

  private readonly unlockAudio = (): void => {
    this.audioUnlocked = true;
    this.tryPlayAmbient();
  };

  private readonly handleCanvasPointerDown = (event: PointerEvent): void => {
    const point = this.toCanvasPoint(event);
    if (!point) {
      return;
    }

    if (rectContainsPoint(this.debugMaskButtonRect(), point.x, point.y)) {
      this.toggleDarknessMask();
    }
  };

  constructor(
    private readonly services: AppServices,
    private readonly returnToTitle: () => void
  ) {
    this.actions = new ActionMap(this.services.input, ACTIONS);
    this.mixer.setVolume("music", 0.62);
    this.mixer.setVolume("sfx", 0.82);
    this.touch = new TouchControls(
      this.services.renderer.ctx.canvas,
      this.services.renderer.width,
      this.services.renderer.height
    );
    void loadGameAssets()
      .then((assets) => {
        this.assets = assets;
        this.mixer.apply(this.assets.audio.ambient, "music", 0.28);
        this.tryPlayAmbient();
      })
      .catch((error: unknown) => {
        this.loadingError = error instanceof Error ? error.message : "Unknown asset loading error";
      });
  }

  onEnter(): void {
    this.touch.attach();
    this.snapCamera();
    window.addEventListener("pointerdown", this.unlockAudio, { passive: true });
    window.addEventListener("keydown", this.unlockAudio);
    this.services.renderer.ctx.canvas.addEventListener("pointerdown", this.handleCanvasPointerDown, { passive: true });
  }

  onExit(): void {
    this.touch.detach();
    window.removeEventListener("pointerdown", this.unlockAudio);
    window.removeEventListener("keydown", this.unlockAudio);
    this.services.renderer.ctx.canvas.removeEventListener("pointerdown", this.handleCanvasPointerDown);
    if (this.assets) {
      this.assets.audio.ambient.pause();
      this.ambientPlaying = false;
    }
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.status.ttl = Math.max(0, this.status.ttl - dt);
    this.tryPlayAmbient();

    if (this.actions.wasPressed("toggle_help")) {
      this.helpVisible = !this.helpVisible;
    }
    if (this.actions.wasPressed("toggle_mute")) {
      this.toggleMute();
    }
    if (this.actions.wasPressed("toggle_darkness")) {
      this.toggleDarknessMask();
    }
    if (this.actions.wasPressed("toggle_flashlight")) {
      this.flashlightOn = !this.flashlightOn;
      this.pushStatus(this.flashlightOn ? "Flashlight on." : "Flashlight off.");
    }

    if (this.actions.wasPressed("menu_back")) {
      this.returnToTitle();
      return;
    }

    const interactPressed = this.actions.wasPressed("interact") || this.touch.consumeInteractPressed();
    if (this.escaped) {
      if (interactPressed || this.actions.wasPressed("restart")) {
        this.returnToTitle();
      }
      return;
    }

    const keyboardX = this.actions.axis("move_left", "move_right");
    const keyboardY = this.actions.axis("move_up", "move_down");
    const touchAxis = this.touch.axis();
    let moveX = keyboardX + touchAxis.x;
    let moveY = keyboardY + touchAxis.y;
    const moveLength = Math.hypot(moveX, moveY);
    this.moveVisual = moveLength;
    if (moveLength > 1) {
      moveX /= moveLength;
      moveY /= moveLength;
    }

    if (moveLength > 0.01) {
      this.player.facingX = moveX;
      this.player.facingY = moveY;
      const speed = this.exitUnlocked() ? 186 : 172;
      this.movePlayer(moveX * speed * dt, moveY * speed * dt);
    }

    if (moveLength > 0.18) {
      this.stepClock -= dt;
      if (this.stepClock <= 0) {
        this.playSfx(this.assets?.audio.stepUrl ?? null, 0.14);
        this.stepClock = 0.32;
      }
    } else {
      this.stepClock = 0.08;
    }

    if (interactPressed) {
      this.handleInteraction();
    }

    const targetCameraX = clamp(this.player.x - this.services.renderer.width * 0.5, 0, WORLD_WIDTH - this.services.renderer.width);
    const targetCameraY = clamp(this.player.y - this.services.renderer.height * 0.5, 0, WORLD_HEIGHT - this.services.renderer.height);
    this.cameraX = lerp(this.cameraX, targetCameraX, Math.min(1, dt * 5.5));
    this.cameraY = lerp(this.cameraY, targetCameraY, Math.min(1, dt * 5.5));
  }

  render(_alpha: number): void {
    this.renderBackground();
    this.renderWorld();
    this.renderEntities();
    this.renderDarkness();
    this.renderPlayer();
    this.renderHud();
    this.renderDebugButton();
    this.touch.render(this.services.renderer);
    if (this.escaped) {
      this.renderEscapeOverlay();
    }
  }

  private snapCamera(): void {
    this.cameraX = clamp(this.player.x - this.services.renderer.width * 0.5, 0, WORLD_WIDTH - this.services.renderer.width);
    this.cameraY = clamp(this.player.y - this.services.renderer.height * 0.5, 0, WORLD_HEIGHT - this.services.renderer.height);
  }

  private movePlayer(dx: number, dy: number): void {
    this.moveAxis(dx, 0);
    this.moveAxis(0, dy);
  }

  private moveAxis(dx: number, dy: number): void {
    const distanceToCover = Math.abs(dx) + Math.abs(dy);
    const steps = Math.max(1, Math.ceil(distanceToCover / 4));
    for (let i = 0; i < steps; i += 1) {
      const nextX = this.player.x + dx / steps;
      const nextY = this.player.y + dy / steps;
      if (!this.canOccupy(nextX, nextY)) {
        break;
      }
      this.player.x = nextX;
      this.player.y = nextY;
    }
  }

  private canOccupy(x: number, y: number): boolean {
    const insideArea = AREAS.some((area) => rectContainsPoint(area, x, y));
    if (!insideArea) {
      return false;
    }

    if (!this.exitUnlocked() && rectContainsPoint(LOCKED_EXIT_GATE, x, y, this.player.radius)) {
      return false;
    }

    return true;
  }

  private handleInteraction(): void {
    const prompt = this.currentPrompt();
    if (!prompt) {
      this.pushStatus("Only the ceiling buzz answers back.");
      return;
    }

    if (prompt.kind === "relay") {
      if (this.collectedRelays.has(prompt.id)) {
        this.pushStatus(`${prompt.label} is already slotted into your carrier case.`);
        return;
      }
      this.collectedRelays.add(prompt.id);
      this.playSfx(this.assets?.audio.relayPickupUrl ?? null, 0.32);
      this.pushStatus(`${prompt.label} recovered. ${this.collectedRelays.size}/3 relays secured.`);
      return;
    }

    if (prompt.kind === "panel") {
      if (this.activatedPanels.has(prompt.id)) {
        this.pushStatus(`${prompt.label} is already live.`);
        return;
      }

      if (prompt.id === "panel-a" && this.collectedRelays.size < RELAYS.length) {
        this.pushStatus("Core Breaker A rejects the sequence. Recover every relay first.");
        return;
      }

      if (prompt.id === "panel-b" && !this.activatedPanels.has("panel-a")) {
        this.pushStatus("Observation Reroute B stays dark. The core breaker must go first.");
        return;
      }

      this.activatedPanels.add(prompt.id);
      this.playSfx(this.assets?.audio.breakerToggleUrl ?? null, prompt.id === "panel-b" ? 0.3 : 0.24);
      if (prompt.id === "panel-b") {
        this.pushStatus("Reroute complete. The exit shutter is finally open.");
      } else {
        this.pushStatus("Core breaker engaged. Observation circuits are ready for reroute.");
      }
      return;
    }

    if (!this.exitUnlocked()) {
      this.pushStatus("The shutter is still locked into the wall.");
      return;
    }

    this.escaped = true;
  }

  private currentPrompt(): InteractionPrompt | null {
    let best: InteractionPrompt | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const relay of RELAYS) {
      if (this.collectedRelays.has(relay.id)) {
        continue;
      }
      const relayDistance = distance(this.player.x, this.player.y, relay.x, relay.y);
      if (relayDistance <= 46 && relayDistance < bestDistance) {
        bestDistance = relayDistance;
        best = {
          kind: "relay",
          id: relay.id,
          label: relay.label,
          instruction: "Recover relay"
        };
      }
    }

    for (const panel of PANELS) {
      const panelDistance = distance(this.player.x, this.player.y, panel.x, panel.y);
      if (panelDistance <= 52 && panelDistance < bestDistance) {
        bestDistance = panelDistance;
        best = {
          kind: "panel",
          id: panel.id,
          label: panel.label,
          instruction: this.activatedPanels.has(panel.id) ? "Panel already active" : "Activate panel"
        };
      }
    }

    const exitDistance = distance(this.player.x, this.player.y, EXIT_TERMINAL.x, EXIT_TERMINAL.y);
    if (exitDistance <= 58 && exitDistance < bestDistance) {
      best = {
        kind: "exit",
        id: "exit-terminal",
        label: "Exit Terminal",
        instruction: this.exitUnlocked() ? "Leave the floor" : "Exit locked"
      };
    }

    return best;
  }

  private currentArea(): AreaDef | null {
    return this.currentAreaAt(this.player.x, this.player.y, this.player.radius + 2);
  }

  private currentAreaAt(x: number, y: number, padding = 0): AreaDef | null {
    const matches = AREAS.filter((area) => rectContainsPoint(area, x, y, padding));
    if (matches.length === 0) {
      return null;
    }

    matches.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "room" ? -1 : 1;
      }

      return left.width * left.height - right.width * right.height;
    });

    return matches[0] ?? null;
  }

  private exitUnlocked(): boolean {
    return this.activatedPanels.has("panel-b");
  }

  private objectiveText(): string {
    if (this.collectedRelays.size < RELAYS.length) {
      return `Recover relay modules: ${this.collectedRelays.size}/${RELAYS.length}`;
    }
    if (!this.activatedPanels.has("panel-a")) {
      return "Activate Core Breaker A in the breaker core";
    }
    if (!this.activatedPanels.has("panel-b")) {
      return "Reroute observation power at panel B";
    }
    return "Reach the exit terminal before the floor settles again";
  }

  private pushStatus(text: string): void {
    this.status = { text, ttl: 5.5 };
  }

  private renderBackground(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const gradient = ctx.createLinearGradient(0, 0, 0, renderer.height);
    gradient.addColorStop(0, "#161308");
    gradient.addColorStop(0.58, "#0d0b07");
    gradient.addColorStop(1, "#050505");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 12; i += 1) {
      const y = (i * 44 + this.elapsed * 7) % (renderer.height + 44) - 22;
      renderer.rect(0, y, renderer.width, 1, "rgba(255, 245, 204, 0.10)");
    }
    ctx.restore();
  }

  private renderWorld(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const flicker = 0.76 + Math.sin(this.elapsed * 5.4) * 0.06;

    for (const area of AREAS) {
      const x = area.x - this.cameraX;
      const y = area.y - this.cameraY;
      const averageLight = this.areaAverageLight(area);

      renderer.rect(x - 8, y - 8, area.width + 16, area.height + 16, "rgba(0, 0, 0, 0.22)");
      renderer.rect(x, y, area.width, area.height, area.floor);
      renderer.strokeRect(x, y, area.width, area.height, area.trim, 2);

      ctx.save();
      ctx.globalAlpha = 0.11 + averageLight * 0.1;
      for (let offset = 18; offset < area.width + area.height; offset += 28) {
        renderer.line(
          x + offset,
          y,
          x + Math.max(0, offset - area.height),
          y + Math.min(area.height, offset),
          "rgba(44, 38, 24, 0.24)",
          1
        );
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = clamp(0.18 + averageLight * 0.9 + (flicker - 0.76) * 0.45, 0.12, 0.92);
      const lightSpacing = area.kind === "hall" ? 92 : 112;
      const lightWidth = area.kind === "hall" ? 34 : 42;
      for (let lightX = 28; lightX < area.width - 24; lightX += lightSpacing) {
        renderer.rect(x + lightX, y + 10, lightWidth, 9, area.glow);
      }
      ctx.restore();

      if (area.kind === "room") {
        renderer.text(area.label, x + area.width * 0.5, y + area.height * 0.5, {
          align: "center",
          color: "rgba(54, 46, 21, 0.55)",
          font: "bold 22px Trebuchet MS"
        });
      }
    }

    this.renderExitGate();
  }

  private renderExitGate(): void {
    const { renderer } = this.services;
    const x = LOCKED_EXIT_GATE.x - this.cameraX;
    const y = LOCKED_EXIT_GATE.y - this.cameraY;

    if (this.exitUnlocked()) {
      renderer.rect(x - 4, y, 8, LOCKED_EXIT_GATE.height, "rgba(255, 214, 132, 0.18)");
      renderer.text("SHUTTER OPEN", x + 18, y - 8, {
        color: "#f8e2a4",
        font: "bold 12px Trebuchet MS"
      });
      return;
    }

    renderer.rect(x, y, LOCKED_EXIT_GATE.width, LOCKED_EXIT_GATE.height, "#40361f");
    renderer.strokeRect(x, y, LOCKED_EXIT_GATE.width, LOCKED_EXIT_GATE.height, "#cdb26b", 1.5);
    for (let line = 8; line < LOCKED_EXIT_GATE.height; line += 11) {
      renderer.line(x + 2, y + line, x + LOCKED_EXIT_GATE.width - 2, y + line, "#65542e", 1);
    }
  }

  private renderEntities(): void {
    const { renderer } = this.services;
    const pulse = 0.62 + 0.38 * Math.sin(this.elapsed * 3.2);

    for (const relay of RELAYS) {
      if (this.collectedRelays.has(relay.id)) {
        continue;
      }
      const x = relay.x - this.cameraX;
      const y = relay.y - this.cameraY;
      renderer.rect(x - 11, y - 9, 22, 18, "#6cc6d6");
      renderer.strokeRect(x - 11, y - 9, 22, 18, "#d7f6ff", 1.5);
      renderer.rect(x - 16, y + 16, 32, 4, `rgba(108, 198, 214, ${0.15 + pulse * 0.2})`);
    }

    for (const panel of PANELS) {
      const active = this.activatedPanels.has(panel.id);
      const x = panel.x - this.cameraX;
      const y = panel.y - this.cameraY;
      renderer.rect(x - 16, y - 20, 32, 40, active ? "#3c7d44" : "#5a5135");
      renderer.strokeRect(x - 16, y - 20, 32, 40, active ? "#8de9a3" : "#d7c58e", 1.5);
      renderer.circle(x, y - 6, 5, active ? "#95ffaf" : "#f2d890");
      renderer.text(panel.id === "panel-a" ? "A" : "B", x, y + 9, {
        align: "center",
        color: active ? "#d4ffe1" : "#221c0b",
        font: "bold 14px Trebuchet MS"
      });
    }

    const exitX = EXIT_TERMINAL.x - this.cameraX;
    const exitY = EXIT_TERMINAL.y - this.cameraY;
    renderer.rect(exitX - 22, exitY - 26, 44, 52, this.exitUnlocked() ? "#9a8150" : "#4a432f");
    renderer.strokeRect(exitX - 22, exitY - 26, 44, 52, this.exitUnlocked() ? "#ffe3a3" : "#96845c", 1.5);
    renderer.circle(exitX, exitY - 8, 6, this.exitUnlocked() ? "#ffd772" : "#72654a");
  }

  private renderPlayer(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const playerX = this.player.x - this.cameraX;
    const playerY = this.player.y - this.cameraY;
    renderer.circle(playerX, playerY + 11, this.player.radius + 3, "rgba(0, 0, 0, 0.18)");

    if (this.assets) {
      const frameIndex = this.currentFrameIndex(this.assets.character);
      const meta = this.assets.character.sprite;
      const drawSize = 32;
      const drawX = playerX - drawSize * 0.5;
      const drawY = playerY - drawSize * 0.56;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        this.assets.character.sheet,
        frameIndex * meta.frameWidth,
        0,
        meta.frameWidth,
        meta.frameHeight,
        drawX,
        drawY,
        drawSize,
        drawSize
      );
      ctx.restore();
    } else {
      renderer.circle(playerX, playerY, this.player.radius, "#89d9ef");
    }
  }

  private currentFrameIndex(characterAssets: CharacterAssets): number {
    const frameCount = Math.max(1, characterAssets.sprite.frameCount);
    if (frameCount <= 1 || this.moveVisual < 0.08) {
      return 0;
    }

    return 1 + (Math.floor(this.elapsed * characterAssets.sprite.fps) % Math.max(1, frameCount - 1));
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    this.mixer.setMuted("master", this.muted);
    if (this.assets) {
      this.mixer.apply(this.assets.audio.ambient, "music", 0.28);
      if (!this.muted) {
        this.tryPlayAmbient();
      }
    }
  }

  private playSfx(url: string | null, volume: number): void {
    if (!url || !this.audioUnlocked) {
      return;
    }
    this.mixer.playOneShot(url, volume);
  }

  private tryPlayAmbient(): void {
    if (!this.assets || !this.audioUnlocked || this.ambientPlaying) {
      return;
    }
    const ambient = this.assets.audio.ambient;
    this.mixer.apply(ambient, "music", 0.28);
    void ambient
      .play()
      .then(() => {
        this.ambientPlaying = true;
      })
      .catch(() => undefined);
  }

  private renderDarkness(): void {
    if (!this.darknessEnabled) {
      return;
    }

    const { renderer } = this.services;
    const playerScreenX = this.player.x - this.cameraX;
    const playerScreenY = this.player.y - this.cameraY;
    const darknessCtx = this.ensureDarknessContext();
    const darknessCanvas = darknessCtx.canvas;

    darknessCtx.save();
    darknessCtx.clearRect(0, 0, renderer.width, renderer.height);
    darknessCtx.globalCompositeOperation = "source-over";
    darknessCtx.fillStyle = "rgba(0, 0, 0, 1)";
    darknessCtx.fillRect(0, 0, renderer.width, renderer.height);
    darknessCtx.globalCompositeOperation = "destination-out";
    if (this.flashlightOn) {
      this.cutFlashlightBeam(darknessCtx, playerScreenX, playerScreenY);
    } else {
      this.cutRadialLight(darknessCtx, playerScreenX, playerScreenY, 6, 0.14);
    }
    darknessCtx.restore();

    renderer.ctx.drawImage(darknessCanvas, 0, 0);
  }

  private areaAverageLight(area: AreaDef): number {
    return clamp((area.lighting.start + area.lighting.end) * 0.5, 0, 1);
  }

  private cutRadialLight(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    strength: number
  ): void {
    const gradient = ctx.createRadialGradient(x, y, 10, x, y, radius);
    gradient.addColorStop(0, this.revealColor(strength));
    gradient.addColorStop(0.42, this.revealColor(strength * 0.82));
    gradient.addColorStop(0.82, this.revealColor(strength * 0.24));
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private cutFlashlightBeam(ctx: CanvasRenderingContext2D, playerX: number, playerY: number): void {
    const facingLength = Math.hypot(this.player.facingX, this.player.facingY);
    if (facingLength <= 0.001) {
      return;
    }

    const dirX = this.player.facingX / facingLength;
    const dirY = this.player.facingY / facingLength;
    const originX = playerX + dirX * 8;
    const originY = playerY + dirY * 8;

    this.cutRadialLight(ctx, playerX, playerY, 8, 0.16);
    this.cutConeLight(ctx, originX, originY, dirX, dirY, 204, 82, 0.36, false);
    this.cutConeLight(ctx, originX, originY, dirX, dirY, 178, 54, 0.72, false);
    this.cutSolidConeLight(ctx, originX, originY, dirX, dirY, 154, 28);
    this.cutConeLight(ctx, originX, originY, dirX, dirY, 152, 32, 1, true);
    this.cutRadialLight(ctx, originX, originY, 16, 1);
  }

  private cutSolidConeLight(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    range: number,
    spread: number
  ): void {
    const perpX = -dirY;
    const perpY = dirX;
    const tipX = originX + dirX * range;
    const tipY = originY + dirY * range;
    const baseHalfWidth = 8;

    ctx.save();
    ctx.fillStyle = this.revealColor(1);
    ctx.beginPath();
    ctx.moveTo(originX - perpX * baseHalfWidth, originY - perpY * baseHalfWidth);
    ctx.lineTo(originX + perpX * baseHalfWidth, originY + perpY * baseHalfWidth);
    ctx.lineTo(tipX + perpX * spread, tipY + perpY * spread);
    ctx.lineTo(tipX - perpX * spread, tipY - perpY * spread);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private cutConeLight(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    range: number,
    spread: number,
    strength: number,
    solidCore: boolean
  ): void {
    const perpX = -dirY;
    const perpY = dirX;
    const tipX = originX + dirX * range;
    const tipY = originY + dirY * range;
    const baseHalfWidth = 7;
    const minX = Math.min(originX, tipX) - spread - 10;
    const minY = Math.min(originY, tipY) - spread - 10;
    const maxX = Math.max(originX, tipX) + spread + 10;
    const maxY = Math.max(originY, tipY) + spread + 10;
    const gradient = ctx.createLinearGradient(originX, originY, tipX, tipY);

    if (solidCore) {
      gradient.addColorStop(0, this.revealColor(strength));
      gradient.addColorStop(0.78, this.revealColor(strength));
      gradient.addColorStop(0.92, this.revealColor(strength * 0.84));
    } else {
      gradient.addColorStop(0, this.revealColor(strength));
      gradient.addColorStop(0.48, this.revealColor(strength * 0.92));
      gradient.addColorStop(0.82, this.revealColor(strength * 0.26));
    }
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(originX - perpX * baseHalfWidth, originY - perpY * baseHalfWidth);
    ctx.lineTo(originX + perpX * baseHalfWidth, originY + perpY * baseHalfWidth);
    ctx.lineTo(tipX + perpX * spread, tipY + perpY * spread);
    ctx.lineTo(tipX - perpX * spread, tipY - perpY * spread);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = gradient;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    ctx.restore();
  }

  private revealColor(alpha: number): string {
    return `rgba(255, 255, 255, ${clamp(alpha, 0, 1).toFixed(3)})`;
  }

  private ensureDarknessContext(): CanvasRenderingContext2D {
    const { renderer } = this.services;
    if (!this.darknessCanvas) {
      this.darknessCanvas = document.createElement("canvas");
      this.darknessCtx = this.darknessCanvas.getContext("2d");
      if (!this.darknessCtx) {
        throw new Error("Failed to create darkness mask context.");
      }
    }

    if (this.darknessCanvas.width !== renderer.width || this.darknessCanvas.height !== renderer.height) {
      this.darknessCanvas.width = renderer.width;
      this.darknessCanvas.height = renderer.height;
    }

    const darknessCtx = this.darknessCtx;
    if (!darknessCtx) {
      throw new Error("Darkness mask context is unavailable.");
    }

    return darknessCtx;
  }

  private toggleDarknessMask(): void {
    this.darknessEnabled = !this.darknessEnabled;
    this.pushStatus(this.darknessEnabled ? "Darkness mask on." : "Darkness mask off.");
  }

  private debugMaskButtonRect(): Rect {
    return {
      x: this.services.renderer.width - 166,
      y: 170,
      width: 152,
      height: 34
    };
  }

  private renderDebugButton(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const button = this.debugMaskButtonRect();

    ctx.save();
    ctx.fillStyle = this.darknessEnabled ? "rgba(22, 18, 10, 0.88)" : "rgba(42, 62, 40, 0.86)";
    ctx.fillRect(button.x, button.y, button.width, button.height);
    ctx.strokeStyle = this.darknessEnabled ? "rgba(233, 206, 138, 0.84)" : "rgba(176, 236, 174, 0.86)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(button.x, button.y, button.width, button.height);
    ctx.restore();

    renderer.text(this.darknessEnabled ? "Mask ON  |  G" : "Mask OFF |  G", button.x + button.width * 0.5, button.y + 22, {
      align: "center",
      color: this.darknessEnabled ? "#f3e1a7" : "#d8ffd8",
      font: "bold 14px Trebuchet MS"
    });
  }

  private toCanvasPoint(event: PointerEvent): ScreenPoint | null {
    const bounds = this.services.renderer.ctx.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return null;
    }

    return {
      x: (event.clientX - bounds.left) * (this.services.renderer.width / bounds.width),
      y: (event.clientY - bounds.top) * (this.services.renderer.height / bounds.height)
    };
  }

  private renderHud(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const area = this.currentArea();
    const prompt = this.currentPrompt();

    ctx.save();
    ctx.fillStyle = "rgba(10, 10, 8, 0.76)";
    ctx.fillRect(14, 14, 372, 126);
    ctx.strokeStyle = "rgba(217, 201, 138, 0.72)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(14, 14, 372, 126);
    ctx.restore();

    renderer.text(GAME_MANIFEST.name, 28, 36, {
      color: "#f6ebbd",
      font: "bold 20px Trebuchet MS"
    });
    renderer.text(`Current room: ${area?.label ?? "Unknown"}`, 28, 58, {
      color: "#cfc69d",
      font: "14px Trebuchet MS"
    });
    renderer.text(`Objective: ${this.objectiveText()}`, 28, 80, {
      color: "#f4df98",
      font: "14px Trebuchet MS"
    });
    renderer.text(`Relays ${this.collectedRelays.size}/3  |  Panels ${this.activatedPanels.size}/2`, 28, 102, {
      color: "#c0d7df",
      font: "14px Trebuchet MS"
    });
    renderer.text(this.exitUnlocked() ? "Exit shutter: OPEN" : "Exit shutter: LOCKED", 28, 124, {
      color: this.exitUnlocked() ? "#aef0b7" : "#d7c88e",
      font: "14px Trebuchet MS"
    });

    if (this.loadingError) {
      renderer.text(`Audio load issue: ${this.loadingError}`, 28, 146, {
        color: "#ffb8a6",
        font: "12px Trebuchet MS"
      });
    }

    const statusText = this.status.ttl > 0 ? this.status.text : "The fluorescent hum keeps folding into itself.";
    renderer.text(statusText, renderer.width * 0.5, renderer.height - 20, {
      align: "center",
      color: "#f8edbf",
      font: "14px Trebuchet MS"
    });

    if (prompt) {
      renderer.text(`${prompt.label}: ${prompt.instruction}`, renderer.width * 0.5, renderer.height - 44, {
        align: "center",
        color: "#d8f4ff",
        font: "bold 15px Trebuchet MS"
      });
    }

    if (!this.helpVisible) {
      renderer.text("Press H for controls", renderer.width - 18, 24, {
        align: "right",
        color: "#c8bb8b",
        font: "13px Trebuchet MS"
      });
      return;
    }

    ctx.save();
    ctx.fillStyle = "rgba(10, 10, 8, 0.74)";
    ctx.fillRect(renderer.width - 298, 14, 284, 146);
    ctx.strokeStyle = "rgba(217, 201, 138, 0.64)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(renderer.width - 298, 14, 284, 146);
    ctx.restore();

    renderer.text("Controls", renderer.width - 282, 36, {
      color: "#f6ebbd",
      font: "bold 18px Trebuchet MS"
    });
    renderer.text("Move: WASD or Arrow Keys", renderer.width - 282, 58, {
      color: "#d7cfa8",
      font: "14px Trebuchet MS"
    });
    renderer.text("Interact: E, Enter, or Space", renderer.width - 282, 78, {
      color: "#d7cfa8",
      font: "14px Trebuchet MS"
    });
    renderer.text("Touch: left pad move, right button interact", renderer.width - 282, 98, {
      color: "#d7cfa8",
      font: "14px Trebuchet MS"
    });
    renderer.text("F: flashlight   G: mask   H: help", renderer.width - 282, 118, {
      color: "#d7cfa8",
      font: "14px Trebuchet MS"
    });
    renderer.text("M: mute   Esc: title. No jump scares; pressure comes from space.", renderer.width - 282, 144, {
      color: "#b8c8cf",
      font: "12px Trebuchet MS"
    });

    if (!this.audioUnlocked) {
      renderer.text("Press any key or tap once to enable audio", renderer.width * 0.5, renderer.height - 66, {
        align: "center",
        color: "#f0dfa4",
        font: "14px Trebuchet MS"
      });
    } else if (this.muted) {
      renderer.text("Audio muted", renderer.width * 0.5, renderer.height - 66, {
        align: "center",
        color: "#d7cfa8",
        font: "14px Trebuchet MS"
      });
    }
  }

  private renderEscapeOverlay(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;

    ctx.save();
    ctx.fillStyle = "rgba(5, 5, 4, 0.76)";
    ctx.fillRect(0, 0, renderer.width, renderer.height);
    ctx.strokeStyle = "rgba(232, 213, 149, 0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(renderer.width * 0.5 - 214, renderer.height * 0.5 - 90, 428, 180);
    ctx.restore();

    renderer.text("Shutter Released", renderer.width * 0.5, renderer.height * 0.5 - 26, {
      align: "center",
      color: "#fbefbc",
      font: "bold 32px Trebuchet MS"
    });
    renderer.text("You escaped the breaker floor.", renderer.width * 0.5, renderer.height * 0.5 + 8, {
      align: "center",
      color: "#d6e8ee",
      font: "18px Trebuchet MS"
    });
    renderer.text("Press Enter, tap, or R to return to the title screen.", renderer.width * 0.5, renderer.height * 0.5 + 40, {
      align: "center",
      color: "#efe2a8",
      font: "15px Trebuchet MS"
    });
  }
}
