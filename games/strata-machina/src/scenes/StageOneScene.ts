import { AudioMixer } from "@playloom/engine-audio";
import {
  PlatformerController,
  ZoneMap,
  clamp,
  createPlatformerState,
  type PlatformerBody,
  type PlatformerState,
  type RectZone,
  type Scene
} from "@playloom/engine-core";
import {
  ActionMap,
  createCharacterLabActionBindings,
  createPlatformerActionBindings
} from "@playloom/engine-input";
import {
  composeTintedSpriteFrame,
  drawIndustrialCeilingSegment,
  drawIndustrialFloorSegment,
  drawIndustrialStairFlight,
  drawZoneOverlay,
  type CeilingStyle,
  type FloorStyle,
  type SpriteTintLayer,
  type StairStyle,
  type ZoneDebugRect
} from "@playloom/engine-renderer-canvas";
import { loadGameAssets, type CharacterId, type GameAssets } from "../assets";
import type { AppServices } from "../context";
import { GAME_MANIFEST } from "../types";

interface StoryGeometry {
  tier: number;
  column: number;
  xStart: number;
  xEnd: number;
  yTop: number;
  floorY: number;
  stairX: number | null;
  stairOnRight: boolean;
  openingLeft: number | null;
  openingRight: number | null;
  hasFloor: boolean;
  hasCeiling: boolean;
  hasWallPanels: boolean;
  rareTint: string | null;
}

const WORLD_WIDTH = 1320;
const STORY_HEIGHT = 220;
const FLOOR_THICKNESS = 22;
const CEILING_THICKNESS = 14;
const STAIR_WIDTH = 150;
const STAIR_HEIGHT = 164;
const STAIR_TRANSFER_HEIGHT = 56;
const OPENING_PADDING = 14;
const CLIMB_ZONE_INSET = 4;
const STAIR_LADDER_WIDTH = 52;
const STAIR_LADDER_INTERACT_PADDING = 4;
const STAIR_LADDER_OPENING_PADDING = 6;
const STAIR_LADDER_EXTRA_HEIGHT = 10;
const LADDER_BLOCK_COLUMNS = 4;
const RARE_REGION_COLUMNS = 4;
const RARE_REGION_FREQUENCY = 0.05;
const DEAD_END_BLOCK_FREQUENCY = 0.025;
const EXTRA_LADDER_FREQUENCY = 0.07;
const CEILING_GAP_FREQUENCY = 0.1;
const WORLD_SEED = 0x51f15eed;

const PLAYER_WIDTH = 52;
const PLAYER_HEIGHT = 64;
const PLAYER_SPRITE_DRAW_WIDTH = 64;
const PLAYER_SPRITE_DRAW_HEIGHT = 72;
const PLAYER_SPRITE_OFFSET_X = (PLAYER_SPRITE_DRAW_WIDTH - PLAYER_WIDTH) * 0.5;
const PLAYER_SPRITE_FOOT_PADDING = 2;

const IDLE_FRAME_START = 0;
const IDLE_FRAME_COUNT = 2;
const RUN_FRAME_START = 2;
const RUN_FRAME_COUNT = 2;
const JUMP_ASCEND_FRAME = 4;
const JUMP_DESCEND_FRAME = 5;
const LAND_FRAME = 1;
const CLIMB_FRAME_START = 2;
const CLIMB_FRAME_COUNT = 2;

const CHARACTER_LABELS: Record<CharacterId, string> = {
  "chrome-bot": "Chrome Bot",
  "neon-runner": "Neon Runner",
  "alley-jackal": "Alley Jackal",
  "synth-raider": "Synth Raider"
};

interface TintOption {
  name: string;
  color: string | null;
}

const TINT_OPTIONS: readonly TintOption[] = [
  { name: "Default", color: null },
  { name: "Cyber Pink", color: "#ff4dd7" },
  { name: "Neon Cyan", color: "#59dbff" },
  { name: "Volt Lime", color: "#d8ff8d" },
  { name: "Steel Blue", color: "#4e8ef0" },
  { name: "Graphite", color: "#41556b" },
  { name: "Amber", color: "#ffb86b" },
  { name: "Copper", color: "#f0a17d" }
];

type VisualTheme =
  | "legacy"
  | "darkindustrial-v2"
  | "darkindustrial-v3"
  | "darkindustrial-v4"
  | "darkindustrial-v5";

const VISUAL_THEME: VisualTheme = "darkindustrial-v5";

const FLOOR_STYLE_V2: Partial<FloorStyle> = {
  base: "#1e2a3a",
  topEdge: "#6b7786",
  bottomEdge: "#101723",
  bolt: "#f4a340"
};

const CEILING_STYLE_V2: Partial<CeilingStyle> = {
  base: "#111724",
  topEdge: "#293142",
  bottomEdge: "#0a0f18",
  rib: "#39455a"
};

const STAIR_STYLE_V2: Partial<StairStyle> = {
  frame: "#1a212d",
  frameStroke: "#56687f",
  rail: "#5ad6ff",
  railShadow: "#1b4a63",
  tread: "#f4a340",
  treadShadow: "#6f4b21"
};

export class StageOneScene implements Scene {
  private assets: GameAssets | null = null;
  private loadingError: string | null = null;

  private body: PlatformerBody = {
    x: WORLD_WIDTH * 0.5 - PLAYER_WIDTH * 0.5,
    y: STORY_HEIGHT - FLOOR_THICKNESS - PLAYER_HEIGHT,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    vx: 0,
    vy: 0
  };

  private motionState: PlatformerState = createPlatformerState("grounded");
  private readonly motion = new PlatformerController();
  private readonly actions: ActionMap;
  private climbZones = new ZoneMap();

  private cameraX = 0;
  private cameraY = 0;
  private animationClock = 0;
  private stepClock = 0;
  private landingPoseTimer = 0;
  private currentTier = 0;
  private hudVisible = true;
  private muted = false;
  private showZoneDebug = false;
  private activeCharacter: CharacterId = "chrome-bot";
  private headTintIndex = 0;
  private chestTintIndex = 0;
  private legsTintIndex = 0;

  private audioUnlocked = false;
  private ambientPlaying = false;
  private cachePruneClock = 0;
  private readonly storyCache = new Map<string, StoryGeometry>();
  private readonly mixer = new AudioMixer();
  private readonly spriteCompositeCanvas: HTMLCanvasElement;
  private readonly spriteCompositeCtx: CanvasRenderingContext2D;

  private readonly unlockAudio = (): void => {
    this.audioUnlocked = true;
    this.tryPlayAmbient();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.unlockAudio();
    if (!this.hudVisible) return;
    const rect = this.getMuteButtonRect();
    if (!rect) return;
    const { renderer } = this.services;
    const canvas = renderer.ctx.canvas;
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) * renderer.width) / bounds.width;
    const y = ((event.clientY - bounds.top) * renderer.height) / bounds.height;
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
      this.toggleMute();
    }
  };

  constructor(private readonly services: AppServices) {
    this.actions = new ActionMap(this.services.input, {
      ...createPlatformerActionBindings(),
      ...createCharacterLabActionBindings()
    });
    this.mixer.setVolume("music", 0.72);
    this.mixer.setVolume("sfx", 1);
    this.spriteCompositeCanvas = document.createElement("canvas");
    const spriteCompositeCtx = this.spriteCompositeCanvas.getContext("2d");
    if (!spriteCompositeCtx) {
      throw new Error("Canvas 2D context is not available for sprite compositing");
    }
    this.spriteCompositeCtx = spriteCompositeCtx;

    void loadGameAssets()
      .then((assets) => {
        this.assets = assets;
        this.mixer.apply(this.assets.audio.ambient, "music", 0.36);
        this.tryPlayAmbient();
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : "Unknown asset loading error";
        this.loadingError = reason;
      });
  }

  onEnter(): void {
    this.cameraY = this.body.y - this.services.renderer.height * 0.5;
    this.cameraX = this.body.x + PLAYER_WIDTH * 0.5 - this.services.renderer.width * 0.5;

    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    window.addEventListener("keydown", this.unlockAudio);
  }

  onExit(): void {
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("keydown", this.unlockAudio);
    if (this.assets) {
      this.assets.audio.ambient.pause();
      this.ambientPlaying = false;
    }
  }

  update(dt: number): void {
    if (this.loadingError || !this.assets) {
      return;
    }

    this.tryPlayAmbient();

    if (this.actions.wasPressed("toggle_hud")) {
      this.hudVisible = !this.hudVisible;
    }
    if (this.actions.wasPressed("toggle_debug")) {
      this.showZoneDebug = !this.showZoneDebug;
    }
    this.handleCharacterLabInput();

    const moveX = this.actions.axis("move_left", "move_right");
    const moveY = this.actions.axis("move_up", "move_down");
    const jumpPressed = this.actions.wasPressed("jump");
    const wasGrounded = this.motionState.mode === "grounded";

    this.rebuildClimbZones();

    const step = this.motion.step({
      dt,
      input: {
        moveX,
        moveY,
        jumpPressed
      },
      body: this.body,
      state: this.motionState,
      isInClimbZone: (body) => this.isInClimbZone(body),
      resolveGroundY: (previousBottom, body) => this.resolveGroundY(previousBottom, body),
      confirmGroundY: (body) => this.confirmGroundY(body),
      clampBody: (body) => this.clampBody(body)
    });
    this.body = step.body;
    this.motionState = step.state;

    if (step.events.jumped) {
      this.playSfx(this.assets.audio.jumpUrl, 0.24);
    }
    if (step.events.landed) {
      this.playSfx(this.assets.audio.landUrl, 0.18);
      this.landingPoseTimer = 0.08;
    }

    const movingOnGround = this.motionState.mode === "grounded" && Math.abs(this.body.vx) > 0.1;
    if (movingOnGround) {
      this.stepClock -= dt;
      if (this.stepClock <= 0) {
        this.playSfx(this.assets.audio.stepUrl, 0.11);
        this.stepClock = 0.28;
      }
    } else {
      this.stepClock = 0.1;
    }

    if (!wasGrounded && this.motionState.mode === "grounded") {
      this.playSfx(this.assets.audio.landUrl, 0.14);
      this.landingPoseTimer = 0.08;
    }

    this.animationClock += dt;
    this.landingPoseTimer = Math.max(0, this.landingPoseTimer - dt);

    const targetCameraX = this.body.x + PLAYER_WIDTH * 0.5 - this.services.renderer.width * 0.5;
    const targetCameraY = this.body.y + PLAYER_HEIGHT * 0.4 - this.services.renderer.height * 0.5;
    this.cameraX += (targetCameraX - this.cameraX) * Math.min(1, dt * 7);
    this.cameraY += (targetCameraY - this.cameraY) * Math.min(1, dt * 5.2);
    this.currentTier = Math.floor((this.body.y + PLAYER_HEIGHT) / STORY_HEIGHT);

    this.cachePruneClock -= dt;
    if (this.cachePruneClock <= 0) {
      this.cachePruneClock = 2;
      this.pruneStoryCache();
    }
  }

  render(_alpha: number): void {
    const { renderer } = this.services;
    if (this.loadingError) {
      renderer.clear("#07080f");
      renderer.text(GAME_MANIFEST.name, renderer.width * 0.5, renderer.height * 0.5 - 20, {
        align: "center",
        color: "#f0f3ff",
        font: "bold 34px Trebuchet MS"
      });
      renderer.text("Failed to load assets", renderer.width * 0.5, renderer.height * 0.5 + 18, {
        align: "center",
        color: "#ff9f9f",
        font: "18px Trebuchet MS"
      });
      renderer.text(this.loadingError, renderer.width * 0.5, renderer.height * 0.5 + 46, {
        align: "center",
        color: "#deb9b9",
        font: "14px Trebuchet MS"
      });
      return;
    }

    if (!this.assets) {
      renderer.clear("#07080f");
      renderer.text(GAME_MANIFEST.name, renderer.width * 0.5, renderer.height * 0.5 - 12, {
        align: "center",
        color: "#f0f3ff",
        font: "bold 34px Trebuchet MS"
      });
      renderer.text("Booting stage one prototype...", renderer.width * 0.5, renderer.height * 0.5 + 26, {
        align: "center",
        color: "#9daabf",
        font: "18px Trebuchet MS"
      });
      return;
    }

    this.renderBackground();
    this.renderStories();
    this.renderPlayer();
    this.renderHud();
  }

  private handleCharacterLabInput(): void {
    if (!this.hudVisible) return;

    if (this.actions.wasPressed("character_select_1")) this.activeCharacter = "chrome-bot";
    if (this.actions.wasPressed("character_select_2")) this.activeCharacter = "neon-runner";
    if (this.actions.wasPressed("character_select_3")) this.activeCharacter = "alley-jackal";
    if (this.actions.wasPressed("character_select_4")) this.activeCharacter = "synth-raider";

    if (this.actions.wasPressed("tint_head_prev")) this.headTintIndex = this.cycleTintIndex(this.headTintIndex, -1);
    if (this.actions.wasPressed("tint_head_next")) this.headTintIndex = this.cycleTintIndex(this.headTintIndex, 1);
    if (this.actions.wasPressed("tint_chest_prev")) this.chestTintIndex = this.cycleTintIndex(this.chestTintIndex, -1);
    if (this.actions.wasPressed("tint_chest_next")) this.chestTintIndex = this.cycleTintIndex(this.chestTintIndex, 1);
    if (this.actions.wasPressed("tint_legs_prev")) this.legsTintIndex = this.cycleTintIndex(this.legsTintIndex, -1);
    if (this.actions.wasPressed("tint_legs_next")) this.legsTintIndex = this.cycleTintIndex(this.legsTintIndex, 1);
  }

  private cycleTintIndex(current: number, step: number): number {
    const length = TINT_OPTIONS.length;
    if (length <= 0) return 0;
    return (current + step + length) % length;
  }

  private tintName(index: number): string {
    return TINT_OPTIONS[index]?.name ?? "Default";
  }

  private rebuildClimbZones(): void {
    const pivotTier = Math.floor((this.body.y + this.body.height * 0.5) / STORY_HEIGHT);
    const pivotColumn = this.worldColumnAt(this.body.x + this.body.width * 0.5);
    const columnRadius = Math.max(4, Math.ceil(this.services.renderer.width / WORLD_WIDTH) + 3);
    const zones: RectZone[] = [];
    for (let tier = pivotTier - 8; tier <= pivotTier + 8; tier += 1) {
      for (let column = pivotColumn - columnRadius; column <= pivotColumn + columnRadius; column += 1) {
        const story = this.getStory(tier, column);
        if (story.stairX === null) continue;
        const climbBounds = this.getStairClimbBounds(story.stairX);
        const top = story.floorY - STAIR_HEIGHT - STAIR_TRANSFER_HEIGHT;
        const bottom = story.floorY + FLOOR_THICKNESS;
        zones.push({
          id: `climb-${tier}-${column}`,
          type: "climb",
          x: climbBounds.x,
          y: top,
          width: climbBounds.width,
          height: bottom - top
        });
      }
    }
    this.climbZones = new ZoneMap(zones);
  }

  private isInClimbZone(body: PlatformerBody): boolean {
    const zone = this.climbZones.firstRect(
      {
        x: body.x + 8,
        y: body.y + 8,
        width: Math.max(2, body.width - 16),
        height: Math.max(2, body.height - 12)
      },
      ["climb"]
    );
    return zone !== null;
  }

  private resolveGroundY(previousBottom: number, body: PlatformerBody): number | null {
    const nextBottom = body.y + body.height;
    const low = Math.min(previousBottom, nextBottom) - STORY_HEIGHT;
    const high = Math.max(previousBottom, nextBottom) + STORY_HEIGHT;
    const startTier = Math.floor(low / STORY_HEIGHT);
    const endTier = Math.floor(high / STORY_HEIGHT);

    for (let tier = startTier; tier <= endTier; tier += 1) {
      const floorY = tier * STORY_HEIGHT + STORY_HEIGHT - FLOOR_THICKNESS;
      if (previousBottom <= floorY && nextBottom >= floorY && this.overSolidFloor(body, tier)) {
        return floorY;
      }
    }
    return null;
  }

  private confirmGroundY(body: PlatformerBody): number | null {
    const probeBottom = body.y + body.height + 1;
    const tier = Math.floor(probeBottom / STORY_HEIGHT);
    for (let i = tier - 1; i <= tier + 1; i += 1) {
      const floorY = i * STORY_HEIGHT + STORY_HEIGHT - FLOOR_THICKNESS;
      if (Math.abs(floorY - (body.y + body.height)) <= 2 && this.overSolidFloor(body, i)) {
        return floorY;
      }
    }
    return null;
  }

  private overSolidFloor(body: PlatformerBody, tier: number): boolean {
    const leftFoot = body.x + 6;
    const rightFoot = body.x + body.width - 6;
    const startColumn = this.worldColumnAt(leftFoot);
    const endColumn = this.worldColumnAt(rightFoot);

    for (let column = startColumn; column <= endColumn; column += 1) {
      const story = this.getStory(tier, column);
      if (!story.hasFloor) continue;

      const spanLeft = Math.max(leftFoot, story.xStart);
      const spanRight = Math.min(rightFoot, story.xEnd);
      if (spanRight <= spanLeft) continue;

      if (story.openingLeft === null || story.openingRight === null) {
        return true;
      }

      const overlapsSolidLeft = spanLeft < story.openingLeft;
      const overlapsSolidRight = spanRight > story.openingRight;
      if (overlapsSolidLeft || overlapsSolidRight) {
        return true;
      }
    }
    return false;
  }

  private clampBody(_body: PlatformerBody): void {}

  private getLadderShaftX(stairX: number): number {
    return stairX + Math.round((STAIR_WIDTH - STAIR_LADDER_WIDTH) * 0.5);
  }

  private getStairClimbBounds(stairX: number): { x: number; width: number } {
    if (VISUAL_THEME === "darkindustrial-v5") {
      const shaftX = this.getLadderShaftX(stairX);
      return {
        x: shaftX - STAIR_LADDER_INTERACT_PADDING,
        width: STAIR_LADDER_WIDTH + STAIR_LADDER_INTERACT_PADDING * 2
      };
    }

    return {
      x: stairX + CLIMB_ZONE_INSET,
      width: STAIR_WIDTH - CLIMB_ZONE_INSET * 2
    };
  }

  private getStairOpeningHalfWidth(): number {
    return VISUAL_THEME === "darkindustrial-v5"
      ? STAIR_LADDER_WIDTH * 0.5 + STAIR_LADDER_OPENING_PADDING
      : STAIR_WIDTH * 0.5 + OPENING_PADDING;
  }

  private getStory(tier: number, column: number): StoryGeometry {
    const key = `${tier}:${column}`;
    const cached = this.storyCache.get(key);
    if (cached) {
      return cached;
    }

    const xStart = column * WORLD_WIDTH;
    const xEnd = xStart + WORLD_WIDTH;
    const yTop = tier * STORY_HEIGHT;
    const floorY = yTop + STORY_HEIGHT - FLOOR_THICKNESS;
    const inSafeZone = Math.abs(column) <= 1 && Math.abs(tier) <= 2;

    const region = Math.floor(column / RARE_REGION_COLUMNS);
    const hasRareTint =
      !inSafeZone &&
      Math.abs(region) > 1 &&
      this.random01(region, 0, 11) < RARE_REGION_FREQUENCY;
    let rareTint: string | null = null;
    if (hasRareTint) {
      const tintRoll = this.random01(region, 0, 13);
      rareTint =
        tintRoll < 0.34
          ? "rgba(255, 132, 84, 0.08)"
          : tintRoll < 0.68
            ? "rgba(96, 201, 255, 0.08)"
            : "rgba(198, 255, 132, 0.08)";
    }

    const hasFloor = true;
    const hasCeiling = inSafeZone || this.random01(column, tier, 17) >= CEILING_GAP_FREQUENCY;
    const hasWallPanels = inSafeZone || this.random01(column, tier, 41) < 0.58;

    const blockIndex = Math.floor(column / LADDER_BLOCK_COLUMNS);
    const localInBlock = this.positiveMod(column, LADDER_BLOCK_COLUMNS);
    const preferredOffset = Math.floor(this.random01(blockIndex, tier, 19) * LADDER_BLOCK_COLUMNS);
    const deadEndBlock = !inSafeZone && this.random01(blockIndex, tier, 23) < DEAD_END_BLOCK_FREQUENCY;

    let hasStair = !deadEndBlock && localInBlock === preferredOffset;
    if (!hasStair && !inSafeZone && this.random01(column, tier, 29) < EXTRA_LADDER_FREQUENCY) {
      hasStair = true;
    }
    if (column === 0 && Math.abs(tier) <= 3) {
      hasStair = true;
    }

    const stairOnRight = this.random01(column, tier, 31) < 0.5;
    let stairX: number | null = null;
    let openingLeft: number | null = null;
    let openingRight: number | null = null;
    if (hasStair) {
      const minStairX = xStart + 84;
      const maxStairX = xEnd - STAIR_WIDTH - 84;
      const stairRange = Math.max(0, maxStairX - minStairX);
      stairX = minStairX + Math.round(stairRange * this.random01(column, tier, 37));
      if (column === 0 && Math.abs(tier) <= 3) {
        stairX = xStart + WORLD_WIDTH - STAIR_WIDTH - 180;
      }
      const openingHalfWidth = this.getStairOpeningHalfWidth();
      const stairCenterX = stairX + STAIR_WIDTH * 0.5;
      openingLeft = stairCenterX - openingHalfWidth;
      openingRight = stairCenterX + openingHalfWidth;
    }

    const created: StoryGeometry = {
      tier,
      column,
      xStart,
      xEnd,
      yTop,
      floorY,
      stairX,
      stairOnRight,
      openingLeft,
      openingRight,
      hasFloor,
      hasCeiling,
      hasWallPanels,
      rareTint
    };
    this.storyCache.set(key, created);
    return created;
  }

  private renderBackground(): void {
    const { renderer } = this.services;
    if (!this.assets || VISUAL_THEME === "legacy") {
      renderer.clear("#04070f");
      return;
    }

    const { ctx } = renderer;
    const gradient = ctx.createLinearGradient(0, 0, 0, renderer.height);
    gradient.addColorStop(0, "#070b12");
    gradient.addColorStop(0.55, "#0d1320");
    gradient.addColorStop(1, "#060910");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    const farShaftWidth = 20;
    for (let x = -48; x <= renderer.width + 64; x += 88) {
      const driftX = x - ((this.cameraX * 0.12) % 88);
      ctx.fillStyle = "rgba(18, 26, 39, 0.7)";
      ctx.fillRect(driftX, 0, farShaftWidth, renderer.height);
      ctx.fillStyle = "rgba(90, 214, 255, 0.08)";
      ctx.fillRect(driftX + farShaftWidth - 2, 0, 2, renderer.height);
    }

    this.drawTiledOverlay(
      this.assets.images.backgroundCoreV2,
      0,
      0,
      renderer.width,
      renderer.height,
      this.cameraX * 0.08,
      this.cameraY * 0.12,
      0.1
    );
  }

  private renderStories(): void {
    const { renderer } = this.services;
    const minTier = Math.floor((this.cameraY - STORY_HEIGHT) / STORY_HEIGHT);
    const maxTier = Math.floor((this.cameraY + renderer.height + STORY_HEIGHT) / STORY_HEIGHT);
    const minColumn = this.worldColumnAt(this.cameraX - WORLD_WIDTH);
    const maxColumn = this.worldColumnAt(this.cameraX + renderer.width + WORLD_WIDTH);

    for (let tier = minTier; tier <= maxTier; tier += 1) {
      const tierLabelY = tier * STORY_HEIGHT - this.cameraY + 22;
      renderer.text(`Tier ${tier >= 0 ? "+" : ""}${tier}`, 14, tierLabelY, {
        color: "#8897b0",
        font: "12px Trebuchet MS"
      });

      for (let column = minColumn; column <= maxColumn; column += 1) {
        const story = this.getStory(tier, column);
        const yTop = story.yTop - this.cameraY;
        const floorY = story.floorY - this.cameraY;
        const xStart = story.xStart - this.cameraX;

        if (VISUAL_THEME !== "legacy" && this.assets && story.hasWallPanels) {
          const panelWidth = 18;
          const panelTopY = yTop + CEILING_THICKNESS;
          const panelHeight = Math.max(0, STORY_HEIGHT - CEILING_THICKNESS - FLOOR_THICKNESS);
          renderer.rect(xStart + 8, panelTopY, panelWidth, panelHeight, "#0f1724");
          renderer.rect(xStart + WORLD_WIDTH - panelWidth - 8, panelTopY, panelWidth, panelHeight, "#0f1724");
          renderer.strokeRect(xStart + 8, panelTopY, panelWidth, panelHeight, "#36435a", 1);
          renderer.strokeRect(
            xStart + WORLD_WIDTH - panelWidth - 8,
            panelTopY,
            panelWidth,
            panelHeight,
            "#36435a",
            1
          );
          this.drawTiledOverlay(
            this.assets.images.wallPanelV2,
            xStart + 8,
            panelTopY,
            panelWidth,
            panelHeight,
            this.cameraX * 0.2,
            this.cameraY * 0.3,
            0.32
          );
          this.drawTiledOverlay(
            this.assets.images.wallPanelV2,
            xStart + WORLD_WIDTH - panelWidth - 8,
            panelTopY,
            panelWidth,
            panelHeight,
            this.cameraX * 0.2,
            this.cameraY * 0.3,
            0.32
          );
        }

        if (story.hasCeiling) {
          if (story.openingLeft !== null && story.openingRight !== null) {
            const ceilingLeftWidth = Math.max(0, story.openingLeft - story.xStart);
            const ceilingRightX = story.openingRight;
            const ceilingRightWidth = Math.max(0, story.xEnd - ceilingRightX);
            if (ceilingLeftWidth > 0) {
              drawIndustrialCeilingSegment(
                renderer,
                story.xStart - this.cameraX,
                yTop,
                ceilingLeftWidth,
                CEILING_THICKNESS,
                VISUAL_THEME === "legacy" ? undefined : CEILING_STYLE_V2
              );
              if (VISUAL_THEME !== "legacy" && this.assets) {
                this.drawTiledOverlay(
                  this.assets.images.ceilingGridV2,
                  story.xStart - this.cameraX,
                  yTop,
                  ceilingLeftWidth,
                  CEILING_THICKNESS,
                  this.cameraX * 0.2,
                  this.cameraY * 0.35,
                  0.48
                );
              }
            }
            if (ceilingRightWidth > 0) {
              drawIndustrialCeilingSegment(
                renderer,
                ceilingRightX - this.cameraX,
                yTop,
                ceilingRightWidth,
                CEILING_THICKNESS,
                VISUAL_THEME === "legacy" ? undefined : CEILING_STYLE_V2
              );
              if (VISUAL_THEME !== "legacy" && this.assets) {
                this.drawTiledOverlay(
                  this.assets.images.ceilingGridV2,
                  ceilingRightX - this.cameraX,
                  yTop,
                  ceilingRightWidth,
                  CEILING_THICKNESS,
                  this.cameraX * 0.2,
                  this.cameraY * 0.35,
                  0.48
                );
              }
            }
          } else {
            drawIndustrialCeilingSegment(
              renderer,
              story.xStart - this.cameraX,
              yTop,
              WORLD_WIDTH,
              CEILING_THICKNESS,
              VISUAL_THEME === "legacy" ? undefined : CEILING_STYLE_V2
            );
            if (VISUAL_THEME !== "legacy" && this.assets) {
              this.drawTiledOverlay(
                this.assets.images.ceilingGridV2,
                story.xStart - this.cameraX,
                yTop,
                WORLD_WIDTH,
                CEILING_THICKNESS,
                this.cameraX * 0.2,
                this.cameraY * 0.35,
                0.48
              );
            }
          }
        }

        if (story.hasFloor) {
          if (story.openingLeft !== null && story.openingRight !== null) {
            const leftWidth = Math.max(0, story.openingLeft - story.xStart);
            const rightX = story.openingRight;
            const rightWidth = Math.max(0, story.xEnd - rightX);
            if (leftWidth > 0) {
              drawIndustrialFloorSegment(
                renderer,
                story.xStart - this.cameraX,
                floorY,
                leftWidth,
                FLOOR_THICKNESS,
                VISUAL_THEME === "legacy" ? undefined : FLOOR_STYLE_V2
              );
              if (VISUAL_THEME !== "legacy" && this.assets) {
                this.drawTiledOverlay(
                  this.assets.images.floorPlateV2,
                  story.xStart - this.cameraX,
                  floorY,
                  leftWidth,
                  FLOOR_THICKNESS,
                  this.cameraX * 0.24,
                  this.cameraY * 0.2,
                  0.42
                );
              }
            }
            if (rightWidth > 0) {
              drawIndustrialFloorSegment(
                renderer,
                rightX - this.cameraX,
                floorY,
                rightWidth,
                FLOOR_THICKNESS,
                VISUAL_THEME === "legacy" ? undefined : FLOOR_STYLE_V2
              );
              if (VISUAL_THEME !== "legacy" && this.assets) {
                this.drawTiledOverlay(
                  this.assets.images.floorPlateV2,
                  rightX - this.cameraX,
                  floorY,
                  rightWidth,
                  FLOOR_THICKNESS,
                  this.cameraX * 0.24,
                  this.cameraY * 0.2,
                  0.42
                );
              }
            }
          } else {
            drawIndustrialFloorSegment(
              renderer,
              story.xStart - this.cameraX,
              floorY,
              WORLD_WIDTH,
              FLOOR_THICKNESS,
              VISUAL_THEME === "legacy" ? undefined : FLOOR_STYLE_V2
            );
            if (VISUAL_THEME !== "legacy" && this.assets) {
              this.drawTiledOverlay(
                this.assets.images.floorPlateV2,
                story.xStart - this.cameraX,
                floorY,
                WORLD_WIDTH,
                FLOOR_THICKNESS,
                this.cameraX * 0.24,
                this.cameraY * 0.2,
                0.42
              );
            }
          }
        }

        if (story.stairX !== null) {
          const stairX = story.stairX - this.cameraX;
          const stairY = story.floorY - STAIR_HEIGHT - this.cameraY;
          if (VISUAL_THEME === "darkindustrial-v5") {
            this.renderMinimalLadderStair(stairX, stairY);
          } else if (VISUAL_THEME === "darkindustrial-v4") {
            this.renderSwitchbackGantryStair(stairX, stairY, story.stairOnRight ? -1 : 1);
          } else if (VISUAL_THEME === "darkindustrial-v3") {
            this.renderCagedServiceStair(stairX, stairY, story.stairOnRight ? -1 : 1);
          } else {
            drawIndustrialStairFlight(
              renderer,
              stairX,
              stairY,
              STAIR_WIDTH,
              STAIR_HEIGHT,
              -1,
              VISUAL_THEME === "darkindustrial-v2" ? STAIR_STYLE_V2 : undefined
            );
            if (VISUAL_THEME === "darkindustrial-v2" && this.assets) {
              this.drawTiledOverlay(
                this.assets.images.stairFrameV2,
                stairX,
                stairY,
                STAIR_WIDTH,
                STAIR_HEIGHT,
                this.cameraX * 0.28,
                this.cameraY * 0.18,
                0.35
              );
            }
          }
          this.renderStairConnector(story, stairX, yTop, stairY);
        }

        if (story.rareTint) {
          renderer.rect(xStart, yTop, WORLD_WIDTH, STORY_HEIGHT, story.rareTint);
        }
      }
    }

    if (this.showZoneDebug && this.hudVisible) {
      this.renderZoneDebug();
    }
  }

  private renderZoneDebug(): void {
    const zones: ZoneDebugRect[] = [];
    for (const zone of this.climbZones.all()) {
      zones.push({
        x: zone.x - this.cameraX,
        y: zone.y - this.cameraY,
        width: zone.width,
        height: zone.height,
        label: zone.id,
        color: "rgba(76, 143, 214, 0.17)"
      });
    }
    drawZoneOverlay(this.services.renderer, zones);
  }

  private renderMinimalLadderStair(x: number, y: number): void {
    if (!this.assets) return;

    const { renderer } = this.services;
    const { ctx } = renderer;
    const shaftWidth = STAIR_LADDER_WIDTH;
    const shaftX = this.getLadderShaftX(x);
    const shaftTopY = y + 2 - STAIR_LADDER_EXTRA_HEIGHT;
    const shaftHeight = STAIR_HEIGHT - 4 + STAIR_LADDER_EXTRA_HEIGHT;
    const ladderTopY = y + 4 - STAIR_LADDER_EXTRA_HEIGHT;
    const ladderHeight = STAIR_HEIGHT - 8 + STAIR_LADDER_EXTRA_HEIGHT;

    renderer.rect(shaftX - 6, shaftTopY, shaftWidth + 12, shaftHeight, "rgba(9, 13, 20, 0.82)");
    renderer.strokeRect(shaftX - 6, shaftTopY, shaftWidth + 12, shaftHeight, "#2e3d53", 1);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.assets.images.stairLadderV5, shaftX, ladderTopY, shaftWidth, ladderHeight);
    ctx.restore();
  }

  private renderSwitchbackGantryStair(
    x: number,
    y: number,
    direction: -1 | 1
  ): void {
    if (!this.assets) return;

    const { renderer } = this.services;
    const { ctx } = renderer;
    const beaconAlpha = 0.32 + 0.14 * Math.max(0, Math.sin(this.animationClock * 3.2));

    ctx.save();
    if (direction < 0) {
      const pivotX = x + STAIR_WIDTH * 0.5;
      ctx.translate(pivotX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-pivotX, 0);
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.assets.images.stairSwitchbackV4, x, y, STAIR_WIDTH, STAIR_HEIGHT);

    renderer.rect(x + 10, y + 12, 4, STAIR_HEIGHT - 26, "rgba(90, 214, 255, 0.26)");
    renderer.rect(x + STAIR_WIDTH - 14, y + 12, 4, STAIR_HEIGHT - 26, "rgba(90, 214, 255, 0.26)");
    renderer.rect(x + 30, y + 74, STAIR_WIDTH - 60, 3, "rgba(10, 15, 23, 0.5)");
    renderer.rect(x + 22, y + 118, STAIR_WIDTH - 44, 3, "rgba(10, 15, 23, 0.5)");
    renderer.rect(x + STAIR_WIDTH * 0.5 - 3, y + 8, 6, 6, `rgba(255, 90, 90, ${beaconAlpha})`);

    ctx.restore();
  }

  private renderCagedServiceStair(
    x: number,
    y: number,
    direction: -1 | 1
  ): void {
    if (!this.assets) return;

    const { renderer } = this.services;
    const { ctx } = renderer;

    ctx.save();
    if (direction < 0) {
      const pivotX = x + STAIR_WIDTH * 0.5;
      ctx.translate(pivotX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-pivotX, 0);
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.assets.images.stairFrameV3, x, y, STAIR_WIDTH, STAIR_HEIGHT);

    renderer.rect(x + 8, y + STAIR_HEIGHT - 6, STAIR_WIDTH - 16, 6, "rgba(7, 10, 15, 0.62)");
    renderer.rect(x + 12, y + 10, 4, STAIR_HEIGHT - 20, "rgba(90, 214, 255, 0.32)");
    renderer.rect(x + STAIR_WIDTH - 16, y + 10, 4, STAIR_HEIGHT - 20, "rgba(90, 214, 255, 0.32)");

    ctx.restore();
  }

  private renderStairConnector(
    story: StoryGeometry,
    stairScreenX: number,
    tierTopScreenY: number,
    stairScreenY: number
  ): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const connectorTop = tierTopScreenY - FLOOR_THICKNESS;
    const connectorBottom = stairScreenY + 8 - (VISUAL_THEME === "darkindustrial-v5" ? STAIR_LADDER_EXTRA_HEIGHT : 0);
    if (connectorBottom <= connectorTop + 6) return;

    const midX = stairScreenX + STAIR_WIDTH * 0.5;
    const railOffset = 20;
    const leftRailX = midX - railOffset;
    const rightRailX = midX + railOffset;

    if (VISUAL_THEME === "darkindustrial-v5" && this.assets) {
      const connectorWidth = STAIR_LADDER_WIDTH;
      const connectorX = midX - connectorWidth * 0.5;
      const connectorHeight = Math.max(0, connectorBottom - connectorTop);
      renderer.rect(connectorX - 6, connectorTop, connectorWidth + 12, connectorHeight, "rgba(8, 12, 18, 0.88)");
      this.drawTiledOverlay(
        this.assets.images.stairConnectorV5,
        connectorX,
        connectorTop,
        connectorWidth,
        connectorHeight,
        0,
        this.cameraY * 0.1,
        0.9
      );
      renderer.strokeRect(connectorX - 6, connectorTop, connectorWidth + 12, connectorHeight, "#2e3d53", 1);

      const landingWidth = connectorWidth + 24;
      const landingX = midX - landingWidth * 0.5;
      const topLandingY = connectorTop + 3;
      const bottomLandingY = Math.max(topLandingY + 10, connectorBottom - 7);
      drawIndustrialFloorSegment(renderer, landingX, topLandingY, landingWidth, 6, FLOOR_STYLE_V2);
      drawIndustrialFloorSegment(renderer, landingX, bottomLandingY, landingWidth, 6, FLOOR_STYLE_V2);
      return;
    }

    if (VISUAL_THEME === "darkindustrial-v4" && this.assets) {
      const connectorWidth = 56;
      const connectorX = midX - connectorWidth * 0.5;
      const connectorHeight = Math.max(0, connectorBottom - connectorTop);
      renderer.rect(connectorX - 4, connectorTop, connectorWidth + 8, connectorHeight, "rgba(8, 13, 21, 0.58)");
      this.drawTiledOverlay(
        this.assets.images.stairConnectorV4,
        connectorX,
        connectorTop,
        connectorWidth,
        connectorHeight,
        this.cameraX * 0.1,
        this.cameraY * 0.15,
        0.9
      );
      renderer.strokeRect(connectorX, connectorTop, connectorWidth, connectorHeight, "#4b5f79", 1.2);
      renderer.rect(connectorX + 8, connectorTop + 6, connectorWidth - 16, 2, "rgba(244, 163, 64, 0.35)");
      renderer.rect(connectorX + 8, connectorTop + Math.max(8, connectorHeight - 8), connectorWidth - 16, 2, "rgba(244, 163, 64, 0.35)");
      return;
    }

    if (VISUAL_THEME === "darkindustrial-v3" && this.assets) {
      const connectorWidth = 48;
      const connectorX = midX - connectorWidth * 0.5;
      const connectorHeight = Math.max(0, connectorBottom - connectorTop);
      renderer.rect(connectorX - 3, connectorTop, connectorWidth + 6, connectorHeight, "rgba(10, 16, 26, 0.45)");
      this.drawTiledOverlay(
        this.assets.images.stairConnectorV3,
        connectorX,
        connectorTop,
        connectorWidth,
        connectorHeight,
        this.cameraX * 0.14,
        this.cameraY * 0.2,
        0.82
      );
      renderer.strokeRect(connectorX, connectorTop, connectorWidth, connectorHeight, "#415570", 1);
      return;
    }

    if (VISUAL_THEME === "legacy") {
      renderer.rect(leftRailX - 3, connectorTop, 6, connectorBottom - connectorTop, "#5b7fa9");
      renderer.rect(rightRailX - 3, connectorTop, 6, connectorBottom - connectorTop, "#5b7fa9");
    } else {
      renderer.rect(leftRailX - 4, connectorTop, 8, connectorBottom - connectorTop, "#273242");
      renderer.rect(rightRailX - 4, connectorTop, 8, connectorBottom - connectorTop, "#273242");
      renderer.rect(leftRailX - 1, connectorTop, 2, connectorBottom - connectorTop, "#5ad6ff");
      renderer.rect(rightRailX - 1, connectorTop, 2, connectorBottom - connectorTop, "#5ad6ff");
    }

    ctx.save();
    ctx.strokeStyle = VISUAL_THEME === "legacy" ? "#9ec0e8" : "#4b5665";
    ctx.lineWidth = 2;
    for (let y = connectorBottom - 6; y > connectorTop + 4; y -= VISUAL_THEME === "legacy" ? 14 : 12) {
      ctx.beginPath();
      ctx.moveTo(leftRailX + 2, y);
      ctx.lineTo(rightRailX - 2, y);
      ctx.stroke();
      if (VISUAL_THEME === "darkindustrial-v2") {
        renderer.rect(leftRailX + 2, y - 1, Math.max(0, rightRailX - leftRailX - 4), 2, "rgba(244, 163, 64, 0.2)");
      }
    }
    ctx.restore();

    const direction = story.stairOnRight ? -1 : 1;
    renderer.rect(
      midX - 11 + direction * 8,
      connectorTop + 4,
      22,
      6,
      VISUAL_THEME === "legacy" ? "#2b4365" : "#1d2634"
    );
  }

  private drawTiledOverlay(
    image: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
    alpha: number
  ): void {
    const { ctx } = this.services.renderer;
    if (width <= 0 || height <= 0 || image.width <= 0 || image.height <= 0) {
      return;
    }

    const tileWidth = image.width;
    const tileHeight = image.height;
    const wrappedOffsetX = ((offsetX % tileWidth) + tileWidth) % tileWidth;
    const wrappedOffsetY = ((offsetY % tileHeight) + tileHeight) % tileHeight;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();

    const startX = x - wrappedOffsetX;
    const startY = y - wrappedOffsetY;
    for (let drawY = startY; drawY < y + height + tileHeight; drawY += tileHeight) {
      for (let drawX = startX; drawX < x + width + tileWidth; drawX += tileWidth) {
        ctx.drawImage(image, drawX, drawY, tileWidth, tileHeight);
      }
    }
    ctx.restore();
  }

  private worldColumnAt(x: number): number {
    return Math.floor(x / WORLD_WIDTH);
  }

  private positiveMod(value: number, mod: number): number {
    return ((value % mod) + mod) % mod;
  }

  private random01(a: number, b: number, salt: number): number {
    return this.hash32(a, b, salt) / 4294967296;
  }

  private hash32(a: number, b: number, salt: number): number {
    let hash = WORLD_SEED >>> 0;
    hash ^= Math.imul(a | 0, 0x7feb352d);
    hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b) >>> 0;
    hash ^= Math.imul(b | 0, 0x9e3779b1);
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
    hash ^= Math.imul(salt | 0, 0xc2b2ae35);
    hash = (hash ^ (hash >>> 16)) >>> 0;
    return hash;
  }

  private pruneStoryCache(): void {
    if (this.storyCache.size < 5000) {
      return;
    }

    const centerTier = Math.floor((this.body.y + this.body.height * 0.5) / STORY_HEIGHT);
    const centerColumn = this.worldColumnAt(this.body.x + this.body.width * 0.5);
    const tierRadius = 40;
    const columnRadius = 40;
    for (const key of this.storyCache.keys()) {
      const [tierText, columnText] = key.split(":");
      const tier = Number(tierText);
      const column = Number(columnText);
      if (!Number.isFinite(tier) || !Number.isFinite(column)) {
        this.storyCache.delete(key);
        continue;
      }
      if (Math.abs(tier - centerTier) > tierRadius || Math.abs(column - centerColumn) > columnRadius) {
        this.storyCache.delete(key);
      }
    }
  }

  private renderPlayer(): void {
    if (!this.assets) return;

    const { renderer } = this.services;
    const { ctx } = renderer;
    const screenX = this.body.x - this.cameraX;
    const screenY = this.body.y - this.cameraY;
    const drawX = screenX - PLAYER_SPRITE_OFFSET_X;
    const drawY = screenY + PLAYER_HEIGHT - PLAYER_SPRITE_DRAW_HEIGHT + PLAYER_SPRITE_FOOT_PADDING;

    const character = this.assets.characters[this.activeCharacter];
    const spriteMeta = character.sprite;
    const frameCount = Math.max(1, spriteMeta.frameCount);
    const frameIndex = clamp(this.selectSpriteFrame(frameCount), 0, frameCount - 1);
    const sourceX = frameIndex * spriteMeta.frameWidth;
    const sourceY = 0;
    const composedFrame = this.buildTintedPlayerFrame(character.sheet, spriteMeta, sourceX, sourceY);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (this.motionState.facing < 0) {
      const pivotX = drawX + PLAYER_SPRITE_DRAW_WIDTH * 0.5;
      ctx.translate(pivotX, 0);
      ctx.scale(-1, 1);
      ctx.translate(-pivotX, 0);
    }

    ctx.drawImage(
      composedFrame,
      drawX,
      drawY,
      PLAYER_SPRITE_DRAW_WIDTH,
      PLAYER_SPRITE_DRAW_HEIGHT
    );
    ctx.restore();
  }

  private buildTintedPlayerFrame(
    sheet: HTMLImageElement,
    spriteMeta: { frameWidth: number; frameHeight: number },
    sourceX: number,
    sourceY: number
  ): HTMLCanvasElement {
    composeTintedSpriteFrame(this.spriteCompositeCtx, {
      sourceImage: sheet,
      sourceX,
      sourceY,
      sourceWidth: spriteMeta.frameWidth,
      sourceHeight: spriteMeta.frameHeight,
      outputWidth: PLAYER_SPRITE_DRAW_WIDTH,
      outputHeight: PLAYER_SPRITE_DRAW_HEIGHT,
      tintLayers: this.buildTintLayers()
    });
    return this.spriteCompositeCanvas;
  }

  private buildTintLayers(): SpriteTintLayer[] {
    const tintWidth = Math.round(PLAYER_SPRITE_DRAW_WIDTH * 0.36);
    const tintX = Math.round((PLAYER_SPRITE_DRAW_WIDTH - tintWidth) * 0.5);
    return [
      {
        x: tintX,
        y: Math.round(PLAYER_SPRITE_DRAW_HEIGHT * 0.09),
        width: tintWidth,
        height: Math.round(PLAYER_SPRITE_DRAW_HEIGHT * 0.2),
        color: TINT_OPTIONS[this.headTintIndex]?.color ?? null,
        alpha: 0.62
      },
      {
        x: tintX - 2,
        y: Math.round(PLAYER_SPRITE_DRAW_HEIGHT * 0.3),
        width: tintWidth + 4,
        height: Math.round(PLAYER_SPRITE_DRAW_HEIGHT * 0.25),
        color: TINT_OPTIONS[this.chestTintIndex]?.color ?? null,
        alpha: 0.55
      },
      {
        x: tintX - 1,
        y: Math.round(PLAYER_SPRITE_DRAW_HEIGHT * 0.56),
        width: tintWidth + 2,
        height: Math.round(PLAYER_SPRITE_DRAW_HEIGHT * 0.28),
        color: TINT_OPTIONS[this.legsTintIndex]?.color ?? null,
        alpha: 0.5
      }
    ];
  }

  private selectSpriteFrame(frameCount: number): number {
    if (this.landingPoseTimer > 0) {
      return Math.min(LAND_FRAME, frameCount - 1);
    }

    if (this.motionState.mode === "climbing") {
      return this.loopFrameRange(CLIMB_FRAME_START, CLIMB_FRAME_COUNT, 6, frameCount);
    }

    if (this.motionState.mode === "airborne") {
      const airborneFrame = this.body.vy < 0 ? JUMP_ASCEND_FRAME : JUMP_DESCEND_FRAME;
      return Math.min(airborneFrame, frameCount - 1);
    }

    const speed = Math.abs(this.body.vx);
    if (speed > 6) {
      const runRate = 8 + Math.min(3, speed * 0.02);
      return this.loopFrameRange(RUN_FRAME_START, RUN_FRAME_COUNT, runRate, frameCount);
    }

    return this.loopFrameRange(IDLE_FRAME_START, IDLE_FRAME_COUNT, 2.4, frameCount);
  }

  private loopFrameRange(start: number, count: number, fps: number, frameCount: number): number {
    if (count <= 0 || frameCount <= 0) {
      return 0;
    }
    const localFrame = Math.floor(this.animationClock * fps) % count;
    const frame = start + localFrame;
    return clamp(frame, 0, frameCount - 1);
  }

  private renderHud(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    if (!this.hudVisible) {
      renderer.text("Press H for help", 18, 26, {
        color: "#cdd8ea",
        font: "14px Trebuchet MS"
      });
      return;
    }

    const panelX = 14;
    const panelY = 14;
    const panelW = 560;
    const panelH = 250;

    ctx.save();
    ctx.fillStyle = "rgba(5, 8, 16, 0.78)";
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = "rgba(130, 162, 192, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    ctx.restore();

    renderer.text("Strata Machina - Stage 1", 28, 38, {
      color: "#f0f2ff",
      font: "bold 19px Trebuchet MS"
    });
    renderer.text(`Character: ${CHARACTER_LABELS[this.activeCharacter]}`, 28, 60, {
      color: "#9eb0c6",
      font: "13px Trebuchet MS"
    });
    renderer.text(`Tier: ${this.currentTier >= 0 ? "+" : ""}${this.currentTier}`, 28, 82, {
      color: "#b8d8ff",
      font: "15px Trebuchet MS"
    });
    renderer.text(`Pos: x ${Math.round(this.body.x)}  y ${Math.round(this.body.y)}`, 28, 102, {
      color: "#7f9ab6",
      font: "13px Trebuchet MS"
    });
    renderer.text(`Mode: ${this.motionState.mode}`, 28, 122, {
      color: "#9eb0c6",
      font: "13px Trebuchet MS"
    });

    renderer.text("Character Lab", 28, 146, {
      color: "#e2ecff",
      font: "bold 14px Trebuchet MS"
    });
    renderer.text("1 Chrome Bot  2 Neon Runner  3 Alley Jackal  4 Synth Raider", 28, 166, {
      color: "#9eb0c6",
      font: "13px Trebuchet MS"
    });
    renderer.text("Q/E Head tint  R/T Chest tint  Y/U Legs tint", 28, 186, {
      color: "#9eb0c6",
      font: "13px Trebuchet MS"
    });
    renderer.text(
      `Head: ${this.tintName(this.headTintIndex)}  |  Chest: ${this.tintName(this.chestTintIndex)}  |  Legs: ${this.tintName(this.legsTintIndex)}`,
      28,
      206,
      {
        color: "#c3d5ee",
        font: "13px Trebuchet MS"
      }
    );
    renderer.text("H toggle HUD  F1 toggle zone debug", 28, 226, {
      color: "#9eb0c6",
      font: "13px Trebuchet MS"
    });

    const muteRect = this.getMuteButtonRect();
    if (muteRect) {
      renderer.rect(muteRect.x, muteRect.y, muteRect.width, muteRect.height, "#203754");
      renderer.strokeRect(muteRect.x, muteRect.y, muteRect.width, muteRect.height, "#78a5d6", 1.2);
      renderer.text(this.muted ? "Unmute Ambient" : "Silence Ambient", muteRect.x + muteRect.width * 0.5, muteRect.y + 21, {
        align: "center",
        color: "#e4f0ff",
        font: "bold 14px Trebuchet MS"
      });
    }

    renderer.text("A/D move  W/S vertical in stair zones  Space/X jump", renderer.width * 0.5, renderer.height - 20, {
      align: "center",
      color: "#dce5f7",
      font: "16px Trebuchet MS"
    });
    if (!this.audioUnlocked) {
      renderer.text("Press any key or click once to enable ambient audio", renderer.width * 0.5, renderer.height - 42, {
        align: "center",
        color: "#f1cfa7",
        font: "14px Trebuchet MS"
      });
    }
  }

  private getMuteButtonRect(): { x: number; y: number; width: number; height: number } | null {
    if (!this.hudVisible) return null;
    return {
      x: 28,
      y: 232,
      width: 152,
      height: 30
    };
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    this.mixer.setMuted("master", this.muted);
    if (this.assets) {
      this.mixer.apply(this.assets.audio.ambient, "music", 0.36);
      if (!this.muted) {
        this.tryPlayAmbient();
      }
    }
  }

  private playSfx(url: string, volume: number): void {
    if (!this.audioUnlocked) return;
    this.mixer.playOneShot(url, volume);
  }

  private tryPlayAmbient(): void {
    if (!this.assets || !this.audioUnlocked || this.ambientPlaying) {
      return;
    }
    const ambient = this.assets.audio.ambient;
    this.mixer.apply(ambient, "music", 0.36);
    void ambient
      .play()
      .then(() => {
        this.ambientPlaying = true;
      })
      .catch(() => undefined);
  }
}
