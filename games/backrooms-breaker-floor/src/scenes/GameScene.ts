import { AudioMixer } from "@playloom/engine-audio";
import { ActionMap, type ActionBindings } from "@playloom/engine-input";
import type { Scene } from "@playloom/engine-core";
import type { AppServices } from "../context";
import { formatPublicRoomStatus, type PublicRoomSnapshot, type PublicRoundResults } from "../multiplayer/publicRoomTypes";
import type {
  MatchPickupSnapshot,
  MatchPunchResult,
  MatchPlayerSnapshot,
  MatchSnapshot,
  MatchStalkerSnapshot
} from "../multiplayer/protocol";
import { loadGameAssets, type CharacterAssets, type GameAssets } from "../assets";
import {
  ENERGY_DRINK_DURATION,
  ENERGY_DRINK_SPEED_MULTIPLIER,
  PICKUP_DEFINITIONS,
  type PickupType
} from "../pickups";
import { chooseRandomRoamArea, chooseRandomStalkerSpawn, findAreaPath, pickAreaPoint, waypointBetweenAreas, type Point } from "../stalker";
import { BLACK_STICKMAN_TUNING, PLAYER_TUNING } from "../tuning";
import { TouchControls } from "../touch/TouchControls";
import {
  AREAS,
  EXIT_TERMINAL,
  LOCKED_EXIT_GATE,
  PANELS,
  PLAYER_SPAWN,
  RELAYS,
  TRAINING_DUMMY,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type AreaDef,
  type PanelDef,
  type RelayDef,
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
  health: number;
  maxHealth: number;
  isDead: boolean;
}

interface ActorBody {
  x: number;
  y: number;
  radius: number;
}

type StalkerMode = "roam" | "chase" | "swarm";

interface StalkerState extends ActorBody {
  facingX: number;
  facingY: number;
  mode: StalkerMode;
  currentAreaId: string | null;
  roamAreaId: string | null;
  roamTargetX: number;
  roamTargetY: number;
  lastSeenPlayerX: number;
  lastSeenPlayerY: number;
  chaseMemory: number;
  stepClock: number;
  health: number;
  maxHealth: number;
  isDead: boolean;
  attackTimer: number;
  attackCooldown: number;
  attackArmSide: PunchArmSide;
  attackDidDamage: boolean;
}

interface StalkerVisualState {
  x: number;
  y: number;
  facingX: number;
  facingY: number;
}

interface RemotePlayerVisualState {
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  moveVisual: number;
  joinedAt: number;
  materializeTimer: number;
  punchTimer: number;
  punchFacingX: number;
  punchFacingY: number;
  punchArmSide: PunchArmSide;
  lastAuthoritativePunchTimeRemainingMs: number | null;
  isDead: boolean;
}

interface ScreenPoint {
  x: number;
  y: number;
}

interface FloatingDamageNumber {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  maxTtl: number;
  text: string;
  color: string;
  revealX: number;
  revealY: number;
  revealRadius: number;
}

interface PickupInstance {
  id: string;
  type: PickupType;
  x: number;
  y: number;
  radius: number;
  pulseOffset: number;
  blockStatusCooldown: number;
}

type PunchArmSide = -1 | 1;

const ACTIONS: ActionBindings = {
  move_left: ["a", "arrowleft"],
  move_right: ["d", "arrowright"],
  move_up: ["w", "arrowup"],
  move_down: ["s", "arrowdown"],
  interact: ["e", "enter", " "],
  punch: ["j", "x"],
  toggle_darkness: ["g"],
  toggle_flashlight: ["f"],
  toggle_help: ["h"],
  menu_back: ["escape"],
  restart: ["r"],
  toggle_mute: ["m"]
};

const PLAYER_SUIT_TOP_COLOR = "#f4df6f";
const PLAYER_SUIT_SIDE_COLOR = "#c4a634";
const PLAYER_SUIT_SHADOW_COLOR = "#9a7d23";
const PLAYER_GLOVE_TOP_COLOR = "#55616a";
const PLAYER_GLOVE_SHADOW_COLOR = "#23292d";
const PLAYER_GLOVE_OUTLINE_COLOR = "#1b2023";
const PLAYER_SUIT_OUTLINE_COLOR = "#7f6718";
const HEALTH_BAR_GREEN = "#5dd26d";
const HEALTH_BAR_YELLOW = "#e5d562";
const HEALTH_BAR_RED = "#df5a5a";
const DAMAGE_TEXT_RED = "#ff6a6a";
const PLAYER_HIT_FLASH_RED = "#ff7a7a";
const NAME_OUTLINE_COLOR = "rgba(8, 7, 5, 0.82)";
const REMOTE_PLAYER_VISUAL_SMOOTHING = 12;
const REMOTE_PLAYER_VISUAL_SNAP_DISTANCE = 92;
const STALKER_VISUAL_SMOOTHING = 14;
const STALKER_VISUAL_SNAP_DISTANCE = 84;
const PLAYER_JOIN_EFFECT_DURATION = 0.9;
const FLASHLIGHT_SOURCE_OFFSET = 8;
const FLASHLIGHT_PLAYER_POOL_RADIUS = 8;
const FLASHLIGHT_PLAYER_POOL_STRENGTH = 0.16;
const FLASHLIGHT_ORIGIN_POOL_RADIUS = 16;
const FLASHLIGHT_ORIGIN_POOL_STRENGTH = 1;
const FLASHLIGHT_OUTER_RANGE = 204;
const FLASHLIGHT_OUTER_SPREAD = 82;
const FLASHLIGHT_OUTER_STRENGTH = 0.36;
const FLASHLIGHT_MID_RANGE = 178;
const FLASHLIGHT_MID_SPREAD = 54;
const FLASHLIGHT_MID_STRENGTH = 0.72;
const FLASHLIGHT_CORE_RANGE = 154;
const FLASHLIGHT_CORE_SPREAD = 28;
const FLASHLIGHT_CORE_STRENGTH = 1;

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

function circleIntersectsRect(cx: number, cy: number, radius: number, rect: Rect): boolean {
  const closestX = clamp(cx, rect.x, rect.x + rect.width);
  const closestY = clamp(cy, rect.y, rect.y + rect.height);
  return distance(cx, cy, closestX, closestY) <= radius;
}

function healthRatio(health: number, maxHealth: number): number {
  if (maxHealth <= 0) {
    return 0;
  }

  return clamp(health / maxHealth, 0, 1);
}

function healthFillColor(ratio: number): string {
  if (ratio >= 0.75) {
    return HEALTH_BAR_GREEN;
  }
  if (ratio >= 0.35) {
    return HEALTH_BAR_YELLOW;
  }
  return HEALTH_BAR_RED;
}

export class GameScene implements Scene {
  private readonly actions: ActionMap;
  private readonly touch: TouchControls;
  private readonly player: PlayerState = {
    x: PLAYER_SPAWN.x,
    y: PLAYER_SPAWN.y,
    radius: 12,
    facingX: 1,
    facingY: 0,
    health: PLAYER_TUNING.maxHealth,
    maxHealth: PLAYER_TUNING.maxHealth,
    isDead: false
  };
  private readonly stalker: StalkerState;
  private readonly stalkerVisual: StalkerVisualState;

  private readonly collectedRelays = new Set<string>();
  private readonly activatedPanels = new Set<string>();
  private readonly pickups: PickupInstance[] = [];
  private assets: GameAssets | null = null;
  private loadingError: string | null = null;
  private cameraX = 0;
  private cameraY = 0;
  private elapsed = 0;
  private stepClock = 0;
  private helpVisible = true;
  private readonly debugMaskControlsEnabled =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debugMask") === "1";
  private escaped = false;
  private moveVisual = 0;
  private punchTimer = 0;
  private punchCooldown = 0;
  private punchFacingX = 1;
  private punchFacingY = 0;
  private punchArmSide: PunchArmSide = 1;
  private nextPunchArmSide: PunchArmSide = 1;
  private trainingDummyFlash = 0;
  private trainingDummyWobble = 0;
  private trainingDummyDiscovered = false;
  private playerHitFlash = 0;
  private audioUnlocked = false;
  private ambientCurrentClip: HTMLAudioElement | null = null;
  private ambientPlayPending = false;
  private ambientGapTimer = 0;
  private ambientClipIndex = -1;
  private stalkerVoiceCurrentClip: HTMLAudioElement | null = null;
  private stalkerVoicePending = false;
  private stalkerVoiceIndex = -1;
  private stalkerScreamGain = 0;
  private muted = false;
  private darknessEnabled = true;
  private flashlightOn = true;
  private darknessCanvas: HTMLCanvasElement | null = null;
  private darknessCtx: CanvasRenderingContext2D | null = null;
  private playerSpriteCanvas: HTMLCanvasElement | null = null;
  private playerSpriteCtx: CanvasRenderingContext2D | null = null;
  private readonly floatingDamageNumbers: FloatingDamageNumber[] = [];
  private readonly remotePlayerVisuals = new Map<string, RemotePlayerVisualState>();
  private energyDrinkTimer = 0;
  private localJoinEffectJoinedAt: number | null = null;
  private localJoinEffectTimer = 0;
  private lobbyExitConfirmTimer = 0;
  private matchResolvedOutcome: "winner" | "loser" | null = null;
  private matchResolvedReason: PublicRoundResults["reason"] | null = null;
  private lastAppliedMatchSnapshot: MatchSnapshot | null = null;
  private stalkerSnapshotInitialized = false;
  private readonly mixer = new AudioMixer();
  private status: StatusLine = {
    text: "Follow the strongest fluorescent hum. Recover the relays before touching the breakers.",
    ttl: 7
  };

  private readonly unlockAudio = (): void => {
    this.audioUnlocked = true;
    this.updateAmbientHum(0);
  };

  private readonly handleCanvasPointerDown = (event: PointerEvent): void => {
    if (!this.debugMaskControlsEnabled) {
      return;
    }

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
    this.mixer.setVolume("music", 0.24);
    this.mixer.setVolume("sfx", 0.34);
    this.touch = new TouchControls(
      this.services.renderer.ctx.canvas,
      this.services.renderer.width,
      this.services.renderer.height
    );
    this.applyAuthoritativeLocalPlayer(this.services.room.getLocalPlayerMatchSnapshot());
    const stalkerSpawn = chooseRandomStalkerSpawn(this.player.x, this.player.y);
    const stalkerRoamArea = chooseRandomRoamArea(stalkerSpawn.areaId);
    const stalkerRoamTarget = pickAreaPoint(stalkerRoamArea);
    this.stalker = {
      x: stalkerSpawn.x,
      y: stalkerSpawn.y,
      radius: 7,
      facingX: 0,
      facingY: 1,
      mode: "roam",
      currentAreaId: stalkerSpawn.areaId,
      roamAreaId: stalkerRoamArea.id,
      roamTargetX: stalkerRoamTarget.x,
      roamTargetY: stalkerRoamTarget.y,
      lastSeenPlayerX: this.player.x,
      lastSeenPlayerY: this.player.y,
      chaseMemory: 0,
      stepClock: 0.22,
      health: BLACK_STICKMAN_TUNING.maxHealth,
      maxHealth: BLACK_STICKMAN_TUNING.maxHealth,
      isDead: false,
      attackTimer: 0,
      attackCooldown: 0,
      attackArmSide: 1,
      attackDidDamage: false
    };
    this.syncAuthoritativeMatchState();
    this.stalkerVisual = {
      x: this.stalker.x,
      y: this.stalker.y,
      facingX: this.stalker.facingX,
      facingY: this.stalker.facingY
    };
    void loadGameAssets()
      .then((assets) => {
        this.assets = assets;
        this.updateAmbientHum(0);
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
    if (this.debugMaskControlsEnabled) {
      this.services.renderer.ctx.canvas.addEventListener("pointerdown", this.handleCanvasPointerDown, { passive: true });
    }
  }

  onExit(): void {
    this.touch.detach();
    window.removeEventListener("pointerdown", this.unlockAudio);
    window.removeEventListener("keydown", this.unlockAudio);
    if (this.debugMaskControlsEnabled) {
      this.services.renderer.ctx.canvas.removeEventListener("pointerdown", this.handleCanvasPointerDown);
    }
    if (this.assets) {
      this.stopAmbientHum();
      this.stopStalkerVoice();
    }
  }

  update(dt: number): void {
    const roomSnapshot = this.services.room.getSnapshot();
    if (!roomSnapshot.localPlayerJoined) {
      this.returnToTitle();
      return;
    }
    this.syncAuthoritativeMatchState();
    this.consumeResolvedPunchResults();
    this.syncRoundResolution();

    this.elapsed += dt;
    this.status.ttl = Math.max(0, this.status.ttl - dt);
    this.localJoinEffectTimer = Math.max(0, this.localJoinEffectTimer - dt);
    this.lobbyExitConfirmTimer = Math.max(0, this.lobbyExitConfirmTimer - dt);
    this.touch.setMenuConfirming(this.lobbyExitConfirmTimer > 0);
    this.updateCombatState(dt);
    this.updateStalkerVisual(dt);
    this.updateRemotePlayerVisuals(dt);
    this.updateFloatingDamageNumbers(dt);
    this.updatePickups(dt);
    this.updateAmbientHum(dt);

    if (this.actions.wasPressed("toggle_help")) {
      this.helpVisible = !this.helpVisible;
    }
    if (this.actions.wasPressed("toggle_mute")) {
      this.toggleMute();
    }
    if (this.debugMaskControlsEnabled && this.actions.wasPressed("toggle_darkness")) {
      this.toggleDarknessMask();
    }
    if (this.actions.wasPressed("toggle_flashlight") || this.touch.consumeUtilityPressed()) {
      this.toggleFlashlight();
    }

    if (this.actions.wasPressed("menu_back")) {
      this.returnToTitle();
      return;
    }
    if (this.touch.consumeMenuPressed()) {
      if (this.lobbyExitConfirmTimer > 0) {
        this.returnToTitle();
        return;
      }
      this.lobbyExitConfirmTimer = 2.5;
      this.touch.setMenuConfirming(true);
      this.pushStatus("Tap LOBBY again to leave the public room.");
    }

    const usePressed = this.actions.wasPressed("interact") || this.touch.consumeUsePressed();
    const primaryPressed = this.actions.wasPressed("punch") || this.touch.consumePrimaryPressed();
    if (this.escaped) {
      this.updateStalkerChaseAudio(dt, Number.POSITIVE_INFINITY);
      if (usePressed || this.actions.wasPressed("restart")) {
        this.returnToTitle();
      }
      return;
    }

    if (this.matchResolvedOutcome === "loser") {
      this.updateStalkerChaseAudio(dt, Number.POSITIVE_INFINITY);
      if (usePressed || this.actions.wasPressed("restart")) {
        this.returnToTitle();
      }
      return;
    }

    if (this.player.isDead) {
      if (usePressed || this.actions.wasPressed("restart")) {
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
      const speed = this.currentPlayerMovementSpeed();
      this.movePlayer(moveX * speed * dt, moveY * speed * dt);
    }

    if (moveLength > 0.18) {
      this.stepClock -= dt;
      if (this.stepClock <= 0) {
        this.playSfx(this.assets?.audio.stepUrl ?? null, 0.06);
        this.stepClock = 0.32;
      }
    } else {
      this.stepClock = 0.08;
    }

    this.syncLocalPlayerState(moveX, moveY, usePressed, primaryPressed);

    if (usePressed) {
      this.handleInteraction();
    }

    if (primaryPressed) {
      this.tryPunch();
    }

    if (!this.escaped) {
      this.updateStalker(dt);
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
    this.renderStalker();
    this.renderRemotePlayers();
    this.renderDarkness();
    this.renderPlayer();
    this.renderCombatOverlays();
    this.renderHud();
    if (this.debugMaskControlsEnabled) {
      this.renderDebugButton();
    }
    this.touch.render(this.services.renderer);
    if (this.escaped) {
      this.renderEscapeOverlay();
    } else if (this.matchResolvedOutcome === "loser") {
      this.renderRoundLossOverlay();
    } else if (this.player.isDead) {
      this.renderDeathOverlay();
    }
  }

  private snapCamera(): void {
    this.cameraX = clamp(this.player.x - this.services.renderer.width * 0.5, 0, WORLD_WIDTH - this.services.renderer.width);
    this.cameraY = clamp(this.player.y - this.services.renderer.height * 0.5, 0, WORLD_HEIGHT - this.services.renderer.height);
  }

  private movePlayer(dx: number, dy: number): void {
    this.moveBody(this.player, dx, dy);
  }

  private moveBody(body: ActorBody, dx: number, dy: number): void {
    this.moveBodyAxis(body, dx, 0);
    this.moveBodyAxis(body, 0, dy);
  }

  private moveBodyAxis(body: ActorBody, dx: number, dy: number): void {
    const distanceToCover = Math.abs(dx) + Math.abs(dy);
    const steps = Math.max(1, Math.ceil(distanceToCover / 4));
    for (let i = 0; i < steps; i += 1) {
      const nextX = body.x + dx / steps;
      const nextY = body.y + dy / steps;
      if (!this.canOccupy(nextX, nextY, body.radius)) {
        break;
      }
      body.x = nextX;
      body.y = nextY;
    }
  }

  private canOccupy(x: number, y: number, radius = 0): boolean {
    const insideArea = AREAS.some((area) => rectContainsPoint(area, x, y));
    if (!insideArea) {
      return false;
    }

    if (!this.exitUnlocked() && rectContainsPoint(LOCKED_EXIT_GATE, x, y, radius)) {
      return false;
    }

    return true;
  }

  private currentPlayerMovementSpeed(): number {
    const baseSpeed = this.exitUnlocked() ? PLAYER_TUNING.exitMovementSpeed : PLAYER_TUNING.movement.movementSpeed;
    return this.energyDrinkTimer > 0 ? baseSpeed * ENERGY_DRINK_SPEED_MULTIPLIER : baseSpeed;
  }

  private toggleFlashlight(): void {
    this.flashlightOn = !this.flashlightOn;
    this.pushStatus(this.flashlightOn ? "Flashlight on." : "Flashlight off.");
  }

  private updateCombatState(dt: number): void {
    this.punchTimer = Math.max(0, this.punchTimer - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.stalker.attackTimer = Math.max(0, this.stalker.attackTimer - dt);
    this.stalker.attackCooldown = Math.max(0, this.stalker.attackCooldown - dt);
    this.trainingDummyFlash = Math.max(0, this.trainingDummyFlash - dt);
    this.trainingDummyWobble = Math.max(0, this.trainingDummyWobble - dt);
    this.playerHitFlash = Math.max(0, this.playerHitFlash - dt);
  }

  private updateStalkerVisual(dt: number): void {
    const visual = this.stalkerVisual;
    const target = this.stalker;
    const targetDistance = distance(visual.x, visual.y, target.x, target.y);
    if (target.isDead || targetDistance >= STALKER_VISUAL_SNAP_DISTANCE) {
      visual.x = target.x;
      visual.y = target.y;
    } else {
      const smoothing = Math.min(1, dt * STALKER_VISUAL_SMOOTHING);
      visual.x = lerp(visual.x, target.x, smoothing);
      visual.y = lerp(visual.y, target.y, smoothing);
    }

    const targetFacingLength = Math.hypot(target.facingX, target.facingY);
    if (targetFacingLength <= 0.001) {
      return;
    }

    const smoothing = Math.min(1, dt * STALKER_VISUAL_SMOOTHING);
    visual.facingX = lerp(visual.facingX, target.facingX, smoothing);
    visual.facingY = lerp(visual.facingY, target.facingY, smoothing);
    const visualFacingLength = Math.hypot(visual.facingX, visual.facingY);
    if (visualFacingLength <= 0.001) {
      visual.facingX = target.facingX;
      visual.facingY = target.facingY;
      return;
    }

    visual.facingX /= visualFacingLength;
    visual.facingY /= visualFacingLength;
  }

  private updateRemotePlayerVisuals(dt: number): void {
    const activeIds = new Set<string>();
    const smoothing = Math.min(1, dt * REMOTE_PLAYER_VISUAL_SMOOTHING);

    for (const player of this.remotePlayers()) {
      activeIds.add(player.id);
      let visual = this.remotePlayerVisuals.get(player.id);
      if (!visual) {
        visual = {
          x: player.x,
          y: player.y,
          facingX: player.facing.x,
          facingY: player.facing.y,
          moveVisual: 0,
          joinedAt: player.joinedAt,
          materializeTimer: PLAYER_JOIN_EFFECT_DURATION,
          punchTimer: (player.punchTimeRemainingMs ?? 0) / 1000,
          punchFacingX: player.punchFacing?.x ?? player.facing.x,
          punchFacingY: player.punchFacing?.y ?? player.facing.y,
          punchArmSide: player.punchArmSide ?? 1,
          lastAuthoritativePunchTimeRemainingMs: player.punchTimeRemainingMs ?? null,
          isDead: player.isDead
        };
        this.remotePlayerVisuals.set(player.id, visual);
      }

      visual.punchTimer = Math.max(0, visual.punchTimer - dt);
      visual.materializeTimer = Math.max(0, visual.materializeTimer - dt);

      if (visual.joinedAt !== player.joinedAt) {
        visual.joinedAt = player.joinedAt;
        visual.materializeTimer = PLAYER_JOIN_EFFECT_DURATION;
      }

      const previousX = visual.x;
      const previousY = visual.y;
      const targetDistance = distance(visual.x, visual.y, player.x, player.y);
      const shouldSnap = visual.isDead !== player.isDead || targetDistance >= REMOTE_PLAYER_VISUAL_SNAP_DISTANCE;
      if (shouldSnap) {
        visual.x = player.x;
        visual.y = player.y;
      } else {
        visual.x = lerp(visual.x, player.x, smoothing);
        visual.y = lerp(visual.y, player.y, smoothing);
      }

      const facingLength = Math.hypot(player.facing.x, player.facing.y);
      if (facingLength > 0.001) {
        visual.facingX = lerp(visual.facingX, player.facing.x, smoothing);
        visual.facingY = lerp(visual.facingY, player.facing.y, smoothing);
        const visualFacingLength = Math.hypot(visual.facingX, visual.facingY);
        if (visualFacingLength > 0.001) {
          visual.facingX /= visualFacingLength;
          visual.facingY /= visualFacingLength;
        } else {
          visual.facingX = player.facing.x;
          visual.facingY = player.facing.y;
        }
      }

      const frameMotion = distance(previousX, previousY, visual.x, visual.y);
      const motionTarget = player.isDead ? 0 : clamp(frameMotion / 2.4, 0, 1);
      visual.moveVisual = lerp(visual.moveVisual, motionTarget, Math.min(1, dt * 10));
      if (visual.lastAuthoritativePunchTimeRemainingMs !== (player.punchTimeRemainingMs ?? null)) {
        visual.lastAuthoritativePunchTimeRemainingMs = player.punchTimeRemainingMs ?? null;
        visual.punchTimer = (player.punchTimeRemainingMs ?? 0) / 1000;
        if (player.punchFacing) {
          visual.punchFacingX = player.punchFacing.x;
          visual.punchFacingY = player.punchFacing.y;
        }
        if (player.punchArmSide !== null) {
          visual.punchArmSide = player.punchArmSide;
        }
      }
      visual.isDead = player.isDead;
    }

    for (const playerId of this.remotePlayerVisuals.keys()) {
      if (!activeIds.has(playerId)) {
        this.remotePlayerVisuals.delete(playerId);
      }
    }
  }

  private updateFloatingDamageNumbers(dt: number): void {
    for (const number of this.floatingDamageNumbers) {
      number.x += number.vx * dt;
      number.y += number.vy * dt;
      number.ttl = Math.max(0, number.ttl - dt);
    }

    for (let i = this.floatingDamageNumbers.length - 1; i >= 0; i -= 1) {
      if (this.floatingDamageNumbers[i]?.ttl === 0) {
        this.floatingDamageNumbers.splice(i, 1);
      }
    }
  }

  private updatePickups(_dt: number): void {
    for (const pickup of this.pickups) {
      pickup.blockStatusCooldown = Math.max(0, pickup.blockStatusCooldown - _dt);
    }

    if (this.player.isDead) {
      return;
    }

    for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = this.pickups[i];
      if (!pickup) {
        continue;
      }

      if (pickup.blockStatusCooldown > 0) {
        continue;
      }

      const collectDistance = this.player.radius + pickup.radius;
      if (distance(this.player.x, this.player.y, pickup.x, pickup.y) > collectDistance) {
        continue;
      }

      if (pickup.type === "medkit" && this.player.health >= this.player.maxHealth) {
        if (pickup.blockStatusCooldown <= 0) {
          pickup.blockStatusCooldown = 1.2;
          this.pushStatus("Med kit stays put. Health is already full.");
        }
        continue;
      }

      const previousHealth = this.player.health;
      const result = this.services.room.collectPickup(pickup.id);
      if (!result.ok) {
        if (pickup.blockStatusCooldown <= 0) {
          pickup.blockStatusCooldown = 0.8;
          this.pushStatus(result.reason ?? "Pickup is unavailable.");
        }
        continue;
      }

      pickup.blockStatusCooldown = 0.25;
      if (!result.value) {
        continue;
      }

      this.syncAuthoritativeMatchState();
      this.applyAuthoritativeLocalPlayer(this.services.room.getLocalPlayerMatchSnapshot());
      this.collectPickup(pickup.type, previousHealth);
    }
  }

  private collectPickup(type: PickupType, previousHealth: number): void {
    switch (type) {
      case "energy_drink":
        this.pushStatus(`Energy drink surge. Move speed boosted for ${ENERGY_DRINK_DURATION.toFixed(0)}s.`);
        return;
      case "medkit": {
        const healedAmount = Math.max(0, this.player.health - previousHealth);
        this.pushStatus(`Med kit patched you up for ${healedAmount} HP.`);
        return;
      }
    }
  }

  private tryPunch(): void {
    if (this.punchCooldown > 0 || this.punchTimer > 0) {
      return;
    }

    const facingLength = Math.hypot(this.player.facingX, this.player.facingY);
    if (facingLength <= 0.001) {
      this.punchFacingX = 1;
      this.punchFacingY = 0;
    } else {
      this.punchFacingX = this.player.facingX / facingLength;
      this.punchFacingY = this.player.facingY / facingLength;
    }

    this.punchArmSide = this.nextPunchArmSide;
    this.nextPunchArmSide = this.nextPunchArmSide === 1 ? -1 : 1;
    this.punchTimer = PLAYER_TUNING.punch.animationDuration;
    this.punchCooldown = PLAYER_TUNING.punch.cooldown;
    this.playSfx(this.assets?.audio.punchSwingUrl ?? null, 0.12);
    this.resolvePunchHit();
  }

  private resolvePunchHit(): void {
    const hitX = this.player.x + this.punchFacingX * PLAYER_TUNING.punch.range;
    const hitY = this.player.y + this.punchFacingY * PLAYER_TUNING.punch.range;

    this.services.room.submitPunch({
      x: this.punchFacingX,
      y: this.punchFacingY
    });
    const authoritativeHit = this.consumeResolvedPunchResults();

    const dummyHitDistance = distance(hitX, hitY, TRAINING_DUMMY.x, TRAINING_DUMMY.y);
    if (dummyHitDistance <= PLAYER_TUNING.punch.radius + TRAINING_DUMMY.radius) {
      this.trainingDummyFlash = 0.12;
      this.trainingDummyWobble = 0.22;
      if (!this.trainingDummyDiscovered) {
        this.trainingDummyDiscovered = true;
        this.pushStatus("The evac drill dummy kicks back. Punch range is short and directional.");
      }
      if (!authoritativeHit) {
        this.playSfx(this.assets?.audio.punchImpactUrl ?? null, 0.18);
      }
    }
  }

  private consumeResolvedPunchResults(): boolean {
    let hitSomething = false;
    for (const result of this.services.room.consumeLocalPunchResults()) {
      hitSomething = this.applyAuthoritativePunchResult(result) || hitSomething;
    }

    if (hitSomething) {
      this.playSfx(this.assets?.audio.punchImpactUrl ?? null, 0.18);
    }

    return hitSomething;
  }

  private applyAuthoritativePunchResult(result: MatchPunchResult): boolean {
    if (result.hits.length === 0) {
      return false;
    }

    const previousStalkerHealth = this.stalker.health;
    this.syncAuthoritativeMatchState();
    this.applyAuthoritativeLocalPlayer(this.services.room.getLocalPlayerMatchSnapshot());

    const matchSnapshot = this.services.room.getMatchSnapshot();
    for (const hit of result.hits) {
      if (hit.targetKind === "stalker") {
        const snapshot = matchSnapshot?.stalkers.find((candidate) => candidate.id === hit.targetId);
        if (snapshot) {
          this.applyAuthoritativePrimaryStalker(snapshot);
        }
        continue;
      }

      const snapshot = matchSnapshot?.players.find((candidate) => candidate.id === hit.targetId);
      if (snapshot) {
        this.spawnDamageNumber(snapshot.x, snapshot.y - 40, `-${hit.damage}`, DAMAGE_TEXT_RED, snapshot.x, snapshot.y - 10, 16);
      }
    }

    if (previousStalkerHealth > 0 && this.stalker.health <= 0) {
      this.stalker.chaseMemory = 0;
      this.stalker.stepClock = 0;
      this.stalkerScreamGain = 0;
      this.stopStalkerVoice();
      this.pushStatus("The stalker collapses into a pile of black sticks.");
    }

    return true;
  }

  private handlePlayerDeath(): void {
    if (this.player.isDead) {
      return;
    }

    this.player.isDead = true;
    this.player.health = 0;
    this.moveVisual = 0;
    this.stepClock = 0;
    this.punchTimer = 0;
    this.punchCooldown = 0;
    this.energyDrinkTimer = 0;
    this.playerHitFlash = 0;
    this.flashlightOn = false;
    this.stalker.attackTimer = 0;
    this.stalker.attackDidDamage = true;
    this.stalker.chaseMemory = 0;
    this.stalkerScreamGain = 0;
    this.stopStalkerVoice();
    this.pushStatus("The stalker caves the suit in. You are down.");
  }

  private spawnDamageNumber(
    x: number,
    y: number,
    text: string,
    color: string,
    revealX = x,
    revealY = y,
    revealRadius = 16
  ): void {
    this.floatingDamageNumbers.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 16,
      vy: -30 - Math.random() * 10,
      ttl: 0.72,
      maxTtl: 0.72,
      text,
      color,
      revealX,
      revealY,
      revealRadius
    });
  }

  private updateStalker(dt: number): void {
    if (this.stalker.isDead) {
      this.stalkerScreamGain = 0;
      this.stopStalkerVoice();
      return;
    }

    if (this.stalker.mode === "swarm") {
      this.updateStalkerChaseAudio(dt, 0);
      return;
    }

    const playerDistance = distance(this.player.x, this.player.y, this.stalker.x, this.stalker.y);
    this.updateStalkerStepAudio(dt, playerDistance);
    this.updateStalkerChaseAudio(dt, playerDistance);
  }

  private canStalkerSeePlayer(playerDistance: number): boolean {
    if (playerDistance <= 0.001 || playerDistance > BLACK_STICKMAN_TUNING.detectionRange) {
      return false;
    }

    const facingLength = Math.hypot(this.stalker.facingX, this.stalker.facingY);
    if (facingLength <= 0.001) {
      return false;
    }

    const dirX = this.stalker.facingX / facingLength;
    const dirY = this.stalker.facingY / facingLength;
    const toPlayerX = (this.player.x - this.stalker.x) / playerDistance;
    const toPlayerY = (this.player.y - this.stalker.y) / playerDistance;
    const dot = dirX * toPlayerX + dirY * toPlayerY;
    return dot >= BLACK_STICKMAN_TUNING.visionDotThreshold;
  }

  private canStalkerSenseNearbyPlayer(playerDistance: number, targetAreaId: string | null): boolean {
    if (playerDistance > BLACK_STICKMAN_TUNING.nearbyAlertDistance) {
      return false;
    }

    const currentAreaId = this.stalker.currentAreaId;
    if (!currentAreaId || !targetAreaId) {
      return false;
    }

    if (currentAreaId === targetAreaId) {
      return true;
    }

    const path = findAreaPath(currentAreaId, targetAreaId);
    return path.length === 2;
  }

  private assignStalkerRoamTarget(): void {
    const roamArea = chooseRandomRoamArea(this.stalker.currentAreaId);
    const roamPoint = pickAreaPoint(roamArea);
    this.stalker.roamAreaId = roamArea.id;
    this.stalker.roamTargetX = roamPoint.x;
    this.stalker.roamTargetY = roamPoint.y;
  }

  private resolveStalkerChaseTarget(playerDistance: number): Point {
    const trackingCurrentPlayer = this.stalker.mode === "chase" && this.stalker.chaseMemory > 0;
    const targetX = trackingCurrentPlayer ? this.player.x : this.stalker.lastSeenPlayerX;
    const targetY = trackingCurrentPlayer ? this.player.y : this.stalker.lastSeenPlayerY;
    const playerArea = this.currentAreaAt(targetX, targetY, this.player.radius + 2);
    const targetAreaId = playerArea?.id ?? null;
    const currentAreaId = this.stalker.currentAreaId;

    if (trackingCurrentPlayer && currentAreaId && targetAreaId && currentAreaId === targetAreaId && playerDistance > 0.001) {
      const desiredDistance = BLACK_STICKMAN_TUNING.chasePreferredDistance;
      const tolerance = BLACK_STICKMAN_TUNING.chaseDistanceTolerance;
      const minDistance = desiredDistance - tolerance;
      const maxDistance = desiredDistance + tolerance;

      if (playerDistance >= minDistance && playerDistance <= maxDistance) {
        return { x: this.stalker.x, y: this.stalker.y };
      }

      const toPlayerX = (targetX - this.stalker.x) / playerDistance;
      const toPlayerY = (targetY - this.stalker.y) / playerDistance;

      if (playerDistance > maxDistance) {
        return { x: targetX, y: targetY };
      }

      const retreatX = targetX - toPlayerX * desiredDistance;
      const retreatY = targetY - toPlayerY * desiredDistance;
      if (this.canOccupy(retreatX, retreatY, this.stalker.radius)) {
        return { x: retreatX, y: retreatY };
      }

      return { x: this.stalker.x, y: this.stalker.y };
    }

    return this.resolveStalkerPathTarget(targetAreaId, targetX, targetY);
  }

  private resolveStalkerRoamTarget(): Point {
    if (!this.stalker.roamAreaId) {
      this.assignStalkerRoamTarget();
    }

    if (
      this.stalker.roamAreaId &&
      this.stalker.currentAreaId === this.stalker.roamAreaId &&
      distance(this.stalker.x, this.stalker.y, this.stalker.roamTargetX, this.stalker.roamTargetY) <= 24
    ) {
      this.assignStalkerRoamTarget();
    }

    return this.resolveStalkerPathTarget(this.stalker.roamAreaId, this.stalker.roamTargetX, this.stalker.roamTargetY);
  }

  private resolveStalkerPathTarget(targetAreaId: string | null, fallbackX: number, fallbackY: number): Point {
    const currentAreaId = this.stalker.currentAreaId;
    if (!currentAreaId || !targetAreaId || currentAreaId === targetAreaId) {
      return { x: fallbackX, y: fallbackY };
    }

    const path = findAreaPath(currentAreaId, targetAreaId);
    if (path.length >= 2) {
      const waypoint = waypointBetweenAreas(path[0] ?? currentAreaId, path[1] ?? targetAreaId);
      if (waypoint) {
        return waypoint;
      }
    }

    return { x: fallbackX, y: fallbackY };
  }

  private stalkerHearingFactor(distanceToPlayer: number): number {
    return clamp(1 - distanceToPlayer / BLACK_STICKMAN_TUNING.hearingRange, 0, 1);
  }

  private updateStalkerStepAudio(dt: number, playerDistance: number): void {
    this.stalker.stepClock -= dt;
    if (this.stalker.stepClock > 0) {
      return;
    }

    const interval =
      this.stalker.mode === "chase" ? BLACK_STICKMAN_TUNING.chaseStepInterval : BLACK_STICKMAN_TUNING.roamStepInterval;
    this.stalker.stepClock = interval;

    const hearingFactor = this.stalkerHearingFactor(playerDistance);
    if (hearingFactor <= 0.04) {
      return;
    }

    const baseVolume = this.stalker.mode === "chase" ? 0.08 : 0.045;
    this.playSfx(this.assets?.audio.stalkerStepUrl ?? null, baseVolume * hearingFactor);
  }

  private updateStalkerChaseAudio(dt: number, playerDistance: number): void {
    const clips = this.assets?.audio.stalkerVoiceClips;
    if (!clips || clips.length === 0) {
      return;
    }

    const hearingFactor = this.stalker.mode === "chase" ? this.stalkerHearingFactor(playerDistance) : 0;
    const targetGain = hearingFactor > 0.04 ? 0.032 + hearingFactor * 0.05 : 0;
    this.stalkerScreamGain = lerp(this.stalkerScreamGain, targetGain, Math.min(1, dt * 4.4));

    if (!this.audioUnlocked || this.muted || this.stalkerScreamGain <= 0.002) {
      this.stopStalkerVoice();
      this.stalkerScreamGain = 0;
      return;
    }

    const currentClip = this.stalkerVoiceCurrentClip;
    if (currentClip) {
      if (!currentClip.ended) {
        this.mixer.apply(currentClip, "sfx", this.stalkerScreamGain);
        return;
      }
      currentClip.pause();
      currentClip.currentTime = 0;
      this.stalkerVoiceCurrentClip = null;
    }

    if (this.stalkerVoicePending) {
      return;
    }

    const nextClip = this.pickStalkerVoiceClip();
    if (!nextClip) {
      return;
    }

    nextClip.currentTime = 0;
    this.mixer.apply(nextClip, "sfx", this.stalkerScreamGain);
    this.stalkerVoicePending = true;
    void nextClip
      .play()
      .then(() => {
        this.stalkerVoicePending = false;
        this.stalkerVoiceCurrentClip = nextClip;
      })
      .catch(() => {
        this.stalkerVoicePending = false;
        this.stalkerVoiceCurrentClip = null;
      });
  }

  private stopStalkerVoice(): void {
    if (!this.assets) {
      this.stalkerVoiceCurrentClip = null;
      this.stalkerVoicePending = false;
      return;
    }

    for (const clip of this.assets.audio.stalkerVoiceClips) {
      clip.pause();
      clip.currentTime = 0;
      this.mixer.apply(clip, "sfx", 0);
    }

    this.stalkerVoiceCurrentClip = null;
    this.stalkerVoicePending = false;
  }

  private pickStalkerVoiceClip(): HTMLAudioElement | null {
    const clips = this.assets?.audio.stalkerVoiceClips ?? [];
    if (clips.length === 0) {
      return null;
    }

    let index = Math.floor(Math.random() * clips.length);
    if (clips.length > 1 && index === this.stalkerVoiceIndex) {
      index = (index + 1 + Math.floor(Math.random() * (clips.length - 1))) % clips.length;
    }

    this.stalkerVoiceIndex = index;
    return clips[index] ?? null;
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

      const result = this.services.room.collectRelay(prompt.id);
      if (!result.ok) {
        this.pushStatus(result.reason ?? "Relay recovery failed.");
        return;
      }

      if (!result.value) {
        return;
      }

      this.syncAuthoritativeMatchState();
      this.playSfx(this.assets?.audio.relayPickupUrl ?? null, 0.12);
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

      const result = this.services.room.activatePanel(prompt.id);
      if (!result.ok) {
        this.pushStatus(result.reason ?? "Breaker panel stayed dark.");
        return;
      }

      if (!result.value) {
        return;
      }

      this.syncAuthoritativeMatchState();
      this.playSfx(this.assets?.audio.breakerToggleUrl ?? null, prompt.id === "panel-b" ? 0.14 : 0.11);
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

    const result = this.services.room.startExtraction();
    if (!result.ok) {
      this.pushStatus(result.reason ?? "Extraction terminal stays cold.");
      return;
    }

    if (!result.value) {
      return;
    }

    this.pushStatus(result.value?.statusBanner?.text ?? "Extraction started. Hold the chamber until seal.");
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

    this.renderTrainingDummy(pulse);
    this.renderPickups(pulse);

    for (const relay of RELAYS) {
      if (this.collectedRelays.has(relay.id)) {
        continue;
      }
      this.renderRelayModule(relay, pulse);
    }

    for (const panel of PANELS) {
      this.renderBreakerPanel(panel, this.activatedPanels.has(panel.id), pulse);
    }

    const exitX = EXIT_TERMINAL.x - this.cameraX;
    const exitY = EXIT_TERMINAL.y - this.cameraY;
    renderer.rect(exitX - 22, exitY - 26, 44, 52, this.exitUnlocked() ? "#9a8150" : "#4a432f");
    renderer.strokeRect(exitX - 22, exitY - 26, 44, 52, this.exitUnlocked() ? "#ffe3a3" : "#96845c", 1.5);
    renderer.circle(exitX, exitY - 8, 6, this.exitUnlocked() ? "#ffd772" : "#72654a");
  }

  private renderRelayModule(relay: RelayDef, pulse: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const x = relay.x - this.cameraX;
    const y = relay.y - this.cameraY;

    renderer.circle(x, y + 15, 15, "rgba(0, 0, 0, 0.16)");

    ctx.save();
    ctx.globalAlpha = 0.16 + pulse * 0.18;
    renderer.circle(x, y, 17, "rgba(116, 222, 236, 0.55)");
    ctx.restore();

    renderer.rect(x - 14, y - 10, 28, 20, "#4d5e65");
    renderer.strokeRect(x - 14, y - 10, 28, 20, "#cedde0", 1.4);
    renderer.rect(x - 10, y - 7, 20, 14, "#6cc6d6");
    renderer.strokeRect(x - 10, y - 7, 20, 14, "#e3fbff", 1.2);
    renderer.rect(x - 5, y - 14, 10, 4, "#e8f7f8");
    renderer.rect(x - 16, y - 5, 3, 10, "#243036");
    renderer.rect(x + 13, y - 5, 3, 10, "#243036");
    renderer.line(x - 7, y - 1, x + 7, y - 1, "#1e5058", 1.1);
    renderer.line(x - 7, y + 3, x + 7, y + 3, "#1e5058", 1.1);
    renderer.text("RLY", x, y + 16, {
      align: "center",
      color: "#dff7fb",
      font: "bold 9px Trebuchet MS"
    });
  }

  private renderBreakerPanel(panel: PanelDef, active: boolean, pulse: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const x = panel.x - this.cameraX;
    const y = panel.y - this.cameraY;
    const shellColor = active ? "#47684b" : "#5a5135";
    const trimColor = active ? "#9ae0a8" : "#d7c58e";
    const lampColor = active ? "#95ffaf" : "#f2d890";

    renderer.circle(x, y + 24, 20, "rgba(0, 0, 0, 0.18)");
    renderer.rect(x - 22, y - 30, 44, 54, "#29241d");
    renderer.strokeRect(x - 22, y - 30, 44, 54, "#8b7850", 1.3);
    renderer.rect(x - 18, y - 26, 36, 46, shellColor);
    renderer.strokeRect(x - 18, y - 26, 36, 46, trimColor, 1.5);

    for (let stripe = 0; stripe < 4; stripe += 1) {
      renderer.line(x - 16 + stripe * 10, y - 26, x - 22 + stripe * 10, y - 20, "#d3ab4d", 1.2);
    }

    renderer.rect(x - 14, y - 17, 11, 8, active ? "#6de692" : "#918a78");
    renderer.strokeRect(x - 14, y - 17, 11, 8, "#1c241d", 1);
    renderer.rect(x + 2, y - 17, 11, 8, "#6c7f86");
    renderer.strokeRect(x + 2, y - 17, 11, 8, "#1f2528", 1);

    ctx.save();
    ctx.globalAlpha = active ? 0.22 + pulse * 0.18 : 0.16;
    renderer.circle(x - 7, y - 1, 8, active ? "rgba(109, 230, 146, 0.85)" : "rgba(242, 216, 144, 0.42)");
    ctx.restore();

    renderer.circle(x - 7, y - 1, 5.5, lampColor);
    renderer.strokeRect(x - 16, y + 7, 26, 7, "#2b261d", 1);
    renderer.line(x - 12, y + 10, x + 6, y + 10, "#76684a", 1);
    renderer.line(x - 12, y + 12, x + 6, y + 12, "#76684a", 1);
    renderer.rect(x + 7, y - 1, 6, 14, "#7b858a");
    renderer.line(x + 10, y + 2, x + 14, y - 2, active ? "#d8f5de" : "#e4d7b1", 2);

    renderer.text(panel.id === "panel-a" ? "A" : "B", x - 2, y + 19, {
      align: "center",
      color: active ? "#d4ffe1" : "#221c0b",
      font: "bold 12px Trebuchet MS"
    });
  }

  private renderTrainingDummy(pulse: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const wobbleStrength = this.trainingDummyWobble / 0.22;
    const flashStrength = this.trainingDummyFlash / 0.12;
    const sway = Math.sin(this.elapsed * 28) * 8 * wobbleStrength;
    const x = TRAINING_DUMMY.x - this.cameraX + sway;
    const y = TRAINING_DUMMY.y - this.cameraY;

    renderer.circle(x, y + 28, 22, "rgba(0, 0, 0, 0.16)");
    renderer.rect(x - 2, y + 26, 4, 20, "rgba(70, 53, 35, 0.85)");
    renderer.rect(x - 18, y + 42, 36, 8, "rgba(64, 52, 31, 0.9)");

    const chainColor = `rgba(219, 206, 168, ${0.48 + pulse * 0.16})`;
    renderer.line(x, y - 72, x, y - 48, chainColor, 2);
    renderer.line(x - 10, y - 64, x, y - 48, chainColor, 1.5);
    renderer.line(x + 10, y - 64, x, y - 48, chainColor, 1.5);

    const dummyBody = flashStrength > 0.01 ? "#fff1a8" : "#d0a868";
    const dummyTrim = flashStrength > 0.01 ? "#fff9df" : "#f4dbb2";
    renderer.circle(x, y - 42, 12, flashStrength > 0.01 ? "#fff4be" : "#c89b62");
    renderer.rect(x - 18, y - 30, 36, 54, dummyBody);
    renderer.strokeRect(x - 18, y - 30, 36, 54, dummyTrim, 2);
    renderer.rect(x - 14, y - 8, 28, 12, flashStrength > 0.01 ? "#ffe97b" : "#b67f42");
    renderer.line(x - 18, y - 12, x - 34, y + 8, dummyTrim, 3);
    renderer.line(x + 18, y - 12, x + 34, y + 8, dummyTrim, 3);

    ctx.save();
    ctx.globalAlpha = 0.2 + pulse * 0.16 + flashStrength * 0.34;
    renderer.rect(x - 28, y + 26, 56, 4, "#f3de8d");
    ctx.restore();

    renderer.text("DRILL DUMMY", x, y + 70, {
      align: "center",
      color: flashStrength > 0.01 ? "#fff7d6" : "rgba(245, 232, 186, 0.86)",
      font: "bold 11px Trebuchet MS"
    });
  }

  private renderPickups(pulse: number): void {
    for (const pickup of this.pickups) {
      this.renderPickup(pickup, pulse);
    }
  }

  private renderPickup(pickup: PickupInstance, pulse: number): void {
    const { renderer } = this.services;
    const definition = PICKUP_DEFINITIONS[pickup.type];
    const bob = Math.sin(this.elapsed * 3.8 + pickup.pulseOffset) * 1.8;
    const x = pickup.x - this.cameraX;
    const y = pickup.y - this.cameraY + bob;

    if (x < -40 || x > renderer.width + 40 || y < -40 || y > renderer.height + 40) {
      return;
    }

    renderer.circle(x, y + 10, 10, "rgba(0, 0, 0, 0.14)");

    const { ctx } = renderer;
    ctx.save();
    ctx.globalAlpha = 0.12 + pulse * 0.08;
    renderer.circle(x, y + 1, 13, definition.glowColor);
    ctx.restore();

    if (pickup.type === "energy_drink") {
      renderer.rect(x - 5, y - 10, 10, 18, definition.color);
      renderer.strokeRect(x - 5, y - 10, 10, 18, "#12393d", 1.2);
      renderer.rect(x - 2, y - 13, 4, 4, "#dff6f5");
      renderer.rect(x - 3, y - 2, 6, 5, definition.accentColor);
      renderer.line(x - 2, y - 5, x + 2, y - 5, "#19484c", 1);
      return;
    }

    renderer.rect(x - 9, y - 7, 18, 14, definition.color);
    renderer.strokeRect(x - 9, y - 7, 18, 14, "#8c857b", 1.2);
    renderer.rect(x - 2, y - 5, 4, 10, definition.accentColor);
    renderer.rect(x - 5, y - 2, 10, 4, definition.accentColor);
  }

  private renderStalker(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const x = this.stalkerVisual.x - this.cameraX;
    const groundY = this.stalkerVisual.y - this.cameraY;
    if (x < -80 || x > renderer.width + 80 || groundY < -40 || groundY > renderer.height + 80) {
      return;
    }

    if (this.stalker.isDead) {
      this.renderStalkerCorpse(ctx, x, groundY);
      return;
    }

    const pace = this.stalker.mode === "chase" ? 10.4 : 5.2;
    const scale = 0.9;
    const stride = Math.sin(this.elapsed * pace) * (this.stalker.mode === "chase" ? 5.5 : 3.2) * scale;
    const armSwing = Math.sin(this.elapsed * pace + 0.8) * (this.stalker.mode === "chase" ? 5 : 2.8) * scale;
    const attackStrength = this.currentStalkerAttackVisualStrength();
    const leftArmAttacking = attackStrength > 0.001 && this.stalker.attackArmSide < 0;
    const rightArmAttacking = attackStrength > 0.001 && this.stalker.attackArmSide > 0;
    const sway = Math.sin(this.elapsed * pace * 0.5 + 0.6) * 1.4 * scale;
    const leanX = this.stalkerVisual.facingX * 2.8;
    const bodyTopY = groundY - 54 * scale;
    const shoulderY = groundY - 39 * scale;
    const midTorsoY = groundY - 23 * scale;
    const hipY = groundY - 11 * scale;
    const headCenterY = groundY - 61 * scale;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.beginPath();
    ctx.ellipse(x, groundY + 6, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(5, 6, 8, 0.98)";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(152, 225, 233, 0.08)";

    ctx.beginPath();
    ctx.moveTo(x + leanX * 0.16, bodyTopY + 4);
    ctx.quadraticCurveTo(x + leanX * 0.18, bodyTopY + 8, x + leanX * 0.2, bodyTopY + 12);
    ctx.moveTo(x + leanX * 0.2, bodyTopY + 12);
    ctx.quadraticCurveTo(x + sway, shoulderY - 4, x + leanX * 0.45, shoulderY + 2);
    ctx.quadraticCurveTo(x + sway * 1.1, midTorsoY - 6, x + leanX * 0.55, midTorsoY + 2);
    ctx.quadraticCurveTo(x + sway * 0.8, hipY - 4, x + leanX * 0.35, hipY + 3);

    if (!leftArmAttacking) {
      ctx.moveTo(x + leanX * 0.15, shoulderY + 1);
      ctx.quadraticCurveTo(x - 15 - armSwing, shoulderY - 2, x - 19 - armSwing * 0.65, groundY - 4);
      ctx.lineTo(x - 21 - armSwing * 0.75, groundY + 1);
    }

    if (!rightArmAttacking) {
      ctx.moveTo(x + leanX * 0.25, shoulderY + 2);
      ctx.quadraticCurveTo(x + 15 + armSwing, shoulderY - 1, x + 20 + armSwing * 0.65, groundY - 2);
      ctx.lineTo(x + 22 + armSwing * 0.75, groundY + 3);
    }

    ctx.moveTo(x + leanX * 0.2, hipY + 3);
    ctx.quadraticCurveTo(x - 7 - stride * 0.25, groundY - 18, x - 6 - stride, groundY);

    ctx.moveTo(x + leanX * 0.28, hipY + 2);
    ctx.quadraticCurveTo(x + 6 + stride * 0.25, groundY - 18, x + 7 + stride, groundY);

    ctx.moveTo(x - 5.5, bodyTopY + 14);
    ctx.quadraticCurveTo(x - 15, bodyTopY + 4, x - 10, shoulderY + 1);
    ctx.quadraticCurveTo(x - 2, shoulderY + 4, x + 6, shoulderY + 2);
    ctx.quadraticCurveTo(x + 16, shoulderY - 1, x + 11, bodyTopY + 12);

    ctx.moveTo(x - 2.4, shoulderY + 7);
    ctx.quadraticCurveTo(x + 4.5, midTorsoY - 2, x - 1.4, midTorsoY + 7);
    ctx.quadraticCurveTo(x - 7, hipY + 2, x - 0.6, hipY + 9);
    ctx.stroke();

    ctx.fillStyle = "rgba(3, 4, 5, 0.98)";
    ctx.beginPath();
    ctx.moveTo(x - 10 * scale + leanX * 0.3, headCenterY - 8 * scale);
    ctx.lineTo(x + 8 * scale + leanX * 0.3, headCenterY - 8 * scale);
    ctx.lineTo(x + 10 * scale + leanX * 0.2, headCenterY - 3 * scale);
    ctx.lineTo(x + 9 * scale + leanX * 0.2, headCenterY + 7 * scale);
    ctx.lineTo(x - 8 * scale + leanX * 0.15, headCenterY + 8 * scale);
    ctx.lineTo(x - 11 * scale + leanX * 0.2, headCenterY + 1 * scale);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = this.stalker.mode === "chase" ? "rgba(154, 231, 238, 0.28)" : "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x - 3 + leanX * 0.18, headCenterY);
    ctx.lineTo(x - 1 + leanX * 0.18, headCenterY);
    ctx.moveTo(x + 2 + leanX * 0.18, headCenterY);
    ctx.lineTo(x + 4 + leanX * 0.18, headCenterY);
    ctx.stroke();

    if (attackStrength > 0.001) {
      this.renderStalkerAttackArm(
        ctx,
        x,
        shoulderY,
        leanX,
        attackStrength,
        this.stalkerVisual.facingX,
        this.stalkerVisual.facingY
      );
    }
    ctx.restore();
  }

  private renderPlayer(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const basePlayerX = this.player.x - this.cameraX;
    const basePlayerY = this.player.y - this.cameraY;
    if (this.player.isDead) {
      this.renderPlayerCorpse(ctx, basePlayerX, basePlayerY);
      return;
    }

    const punchStrength = this.currentPunchVisualStrength(this.punchTimer);
    const playerX = basePlayerX + this.punchFacingX * punchStrength * 1.5;
    const playerY = basePlayerY + this.punchFacingY * punchStrength;
    const drawSize = 56;
    const materializeTimer = this.localJoinEffectTimer;
    renderer.circle(playerX, playerY + 18, 24, "rgba(0, 0, 0, 0.18)");
    this.renderJoinMaterialization(playerX, playerY, materializeTimer, 0.4);

    if (this.playerHitFlash > 0.001) {
      ctx.save();
      ctx.globalAlpha = clamp(this.playerHitFlash / 0.26, 0, 1) * 0.28;
      renderer.circle(playerX, playerY - 2, 20, PLAYER_HIT_FLASH_RED);
      ctx.restore();
    }

    if (this.assets) {
      const frameIndex = this.currentFrameIndex(this.assets.character);
      const drawX = playerX - drawSize * 0.5;
      const drawY = playerY - drawSize * 0.62;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha *= this.joinMaterializationBodyAlpha(materializeTimer);
      this.renderPlayerSpriteFrame(ctx, frameIndex, drawX, drawY, drawSize, punchStrength, this.punchArmSide);
      this.renderPunchArm(ctx, playerX, playerY, punchStrength, this.punchFacingX, this.punchFacingY, this.punchArmSide);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha *= this.joinMaterializationBodyAlpha(materializeTimer);
      renderer.circle(playerX, playerY, this.player.radius, "#89d9ef");
      ctx.restore();
    }
  }

  private renderRemotePlayers(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;

    for (const player of this.remotePlayers()) {
      const visual = this.remotePlayerVisuals.get(player.id);
      const visualX = visual?.x ?? player.x;
      const visualY = visual?.y ?? player.y;
      const playerX = visualX - this.cameraX;
      const playerY = visualY - this.cameraY;
      if (player.isDead) {
        this.renderPlayerCorpse(ctx, playerX, playerY);
        continue;
      }

      const punchStrength = this.currentPunchVisualStrength(visual?.punchTimer ?? 0);
      const punchFacingX = visual?.punchFacingX ?? visual?.facingX ?? player.facing.x;
      const punchFacingY = visual?.punchFacingY ?? visual?.facingY ?? player.facing.y;
      const remoteX = playerX + punchFacingX * punchStrength * 1.5;
      const remoteY = playerY + punchFacingY * punchStrength;
      const materializeTimer = visual?.materializeTimer ?? 0;
      renderer.circle(remoteX, remoteY + 18, 24, "rgba(0, 0, 0, 0.16)");
      this.renderJoinMaterialization(remoteX, remoteY, materializeTimer, player.joinedAt * 0.001);
      if (this.assets) {
        const frameIndex = this.currentFrameIndex(this.assets.character, visual?.moveVisual ?? 0);
        const drawSize = 56;
        const drawX = remoteX - drawSize * 0.5;
        const drawY = remoteY - drawSize * 0.62;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha *= this.joinMaterializationBodyAlpha(materializeTimer);
        this.renderPlayerSpriteFrame(ctx, frameIndex, drawX, drawY, drawSize, punchStrength, visual?.punchArmSide ?? 1);
        this.renderPunchArm(ctx, remoteX, remoteY, punchStrength, punchFacingX, punchFacingY, visual?.punchArmSide ?? 1);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha *= this.joinMaterializationBodyAlpha(materializeTimer);
        renderer.circle(remoteX, remoteY, this.player.radius, "#d5e7ef");
        ctx.restore();
      }
    }
  }

  private renderCombatOverlays(): void {
    for (const player of this.remotePlayers()) {
      if (player.isDead) {
        continue;
      }
      const visual = this.remotePlayerVisuals.get(player.id);
      const punchStrength = this.currentPunchVisualStrength(visual?.punchTimer ?? 0);
      const punchFacingX = visual?.punchFacingX ?? visual?.facingX ?? player.facing.x;
      const punchFacingY = visual?.punchFacingY ?? visual?.facingY ?? player.facing.y;
      const worldX = (visual?.x ?? player.x) + punchFacingX * punchStrength * 1.5;
      const worldY = (visual?.y ?? player.y) + punchFacingY * punchStrength;
      if (!this.isActorRevealed(worldX, worldY - 10, 16)) {
        continue;
      }
      const playerX = worldX - this.cameraX;
      const playerY = worldY - this.cameraY;
      this.renderActorName(playerX, playerY - 42, player.name, player.health, player.maxHealth);
      this.renderHealthBar(playerX, playerY - 30, 42, 6, player.health, player.maxHealth);
    }

    if (!this.player.isDead) {
      const punchStrength = this.currentPunchVisualStrength(this.punchTimer);
      const playerX = this.player.x - this.cameraX + this.punchFacingX * punchStrength * 1.5;
      const playerY = this.player.y - this.cameraY + this.punchFacingY * punchStrength;
      this.renderActorName(playerX, playerY - 42, this.playerName(), this.player.health, this.player.maxHealth);
      this.renderHealthBar(playerX, playerY - 30, 42, 6, this.player.health, this.player.maxHealth);
    }

    if (!this.stalker.isDead && this.isActorRevealed(this.stalkerVisual.x, this.stalkerVisual.y - 26, 18)) {
      const stalkerX = this.stalkerVisual.x - this.cameraX;
      const stalkerY = this.stalkerVisual.y - this.cameraY;
      this.renderHealthBar(stalkerX, stalkerY - 74, 44, 6, this.stalker.health, this.stalker.maxHealth);
    }

    this.renderFloatingDamageNumbers();
    this.renderPlayerHitFlashOverlay();
  }

  private renderActorName(x: number, y: number, name: string, health: number, maxHealth: number): void {
    const { ctx, width, height } = this.services.renderer;
    if (x < -80 || x > width + 80 || y < -40 || y > height + 40) {
      return;
    }

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '700 12px "Bahnschrift", "Aptos", sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = NAME_OUTLINE_COLOR;
    ctx.strokeText(name, x, y);
    ctx.fillStyle = healthFillColor(healthRatio(health, maxHealth));
    ctx.fillText(name, x, y);
    ctx.restore();
  }

  private renderHealthBar(
    x: number,
    y: number,
    width: number,
    height: number,
    health: number,
    maxHealth: number
  ): void {
    const { ctx, width: viewportWidth, height: viewportHeight } = this.services.renderer;
    if (x + width * 0.5 < 0 || x - width * 0.5 > viewportWidth || y + height < 0 || y - height > viewportHeight) {
      return;
    }

    const ratio = healthRatio(health, maxHealth);
    const fillWidth = Math.max(0, Math.round((width - 2) * ratio));

    ctx.save();
    ctx.fillStyle = "rgba(8, 8, 6, 0.86)";
    ctx.fillRect(x - width * 0.5, y - height * 0.5, width, height);
    ctx.strokeStyle = "rgba(255, 250, 216, 0.42)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - width * 0.5, y - height * 0.5, width, height);
    if (fillWidth > 0) {
      ctx.fillStyle = healthFillColor(ratio);
      ctx.fillRect(x - width * 0.5 + 1, y - height * 0.5 + 1, fillWidth, Math.max(1, height - 2));
    }
    ctx.restore();
  }

  private renderFloatingDamageNumbers(): void {
    const { ctx, width: viewportWidth, height: viewportHeight } = this.services.renderer;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 18px Trebuchet MS";

    for (const number of this.floatingDamageNumbers) {
      const screenX = number.x - this.cameraX;
      const screenY = number.y - this.cameraY;
      if (screenX < -40 || screenX > viewportWidth + 40 || screenY < -40 || screenY > viewportHeight + 40) {
        continue;
      }
      if (this.darknessEnabled && !this.isActorRevealed(number.revealX, number.revealY, number.revealRadius)) {
        continue;
      }

      const alpha = clamp(number.ttl / number.maxTtl, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(10, 8, 8, 0.78)";
      ctx.strokeText(number.text, screenX, screenY);
      ctx.fillStyle = number.color;
      ctx.fillText(number.text, screenX, screenY);
    }

    ctx.restore();
  }

  private renderStalkerCorpse(ctx: CanvasRenderingContext2D, x: number, groundY: number): void {
    if (this.assets) {
      ctx.save();
      ctx.globalAlpha = 0.96;
      ctx.drawImage(this.assets.stalkerCorpse, x - 34, groundY - 22, 68, 38);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.strokeStyle = "rgba(6, 7, 9, 0.98)";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 18, groundY - 2);
    ctx.lineTo(x - 8, groundY - 8);
    ctx.lineTo(x, groundY - 2);
    ctx.lineTo(x + 10, groundY - 10);
    ctx.lineTo(x + 18, groundY - 4);
    ctx.moveTo(x - 10, groundY - 12);
    ctx.lineTo(x - 2, groundY - 4);
    ctx.lineTo(x + 7, groundY - 15);
    ctx.lineTo(x + 15, groundY - 7);
    ctx.stroke();
    ctx.restore();
  }

  private renderPlayerCorpse(ctx: CanvasRenderingContext2D, x: number, groundY: number): void {
    if (this.assets) {
      ctx.save();
      ctx.globalAlpha = 0.98;
      ctx.drawImage(this.assets.playerCorpse, x - 36, groundY - 24, 72, 42);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.beginPath();
    ctx.ellipse(x, groundY + 9, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PLAYER_SUIT_TOP_COLOR;
    ctx.strokeStyle = PLAYER_SUIT_OUTLINE_COLOR;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x, groundY - 2, 16, 10, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PLAYER_GLOVE_SHADOW_COLOR;
    ctx.beginPath();
    ctx.ellipse(x - 18, groundY + 1, 3, 3.5, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 17, groundY + 2, 3, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private currentFrameIndex(characterAssets: CharacterAssets, moveVisual = this.moveVisual): number {
    const frameCount = Math.max(1, characterAssets.sprite.frameCount);
    if (frameCount <= 1 || moveVisual < 0.08) {
      return 0;
    }

    return 1 + (Math.floor(this.elapsed * characterAssets.sprite.fps) % Math.max(1, frameCount - 1));
  }

  private currentPunchVisualStrength(timer: number): number {
    if (timer <= 0) {
      return 0;
    }

    const progress = 1 - timer / PLAYER_TUNING.punch.animationDuration;
    return Math.sin(clamp(progress, 0, 1) * Math.PI);
  }

  private currentStalkerAttackVisualStrength(): number {
    if (this.stalker.attackTimer <= 0) {
      return 0;
    }

    const progress = 1 - this.stalker.attackTimer / BLACK_STICKMAN_TUNING.attack.animationDuration;
    return Math.sin(clamp(progress, 0, 1) * Math.PI);
  }

  private renderStalkerAttackArm(
    ctx: CanvasRenderingContext2D,
    x: number,
    shoulderY: number,
    leanX: number,
    attackStrength: number,
    facingX: number,
    facingY: number
  ): void {
    const facingLength = Math.hypot(facingX, facingY);
    if (facingLength <= 0.001) {
      return;
    }

    const dirX = facingX / facingLength;
    const dirY = facingY / facingLength;
    const sideX = -dirY;
    const sideY = dirX;
    const shoulderX = x + leanX * 0.2 + sideX * (7.4 * this.stalker.attackArmSide);
    const attackShoulderY = shoulderY + 1.5 + sideY * (3.5 * this.stalker.attackArmSide);
    const elbowX = shoulderX + dirX * (8 + attackStrength * 7) + sideX * (1.6 * this.stalker.attackArmSide);
    const elbowY = attackShoulderY + dirY * (8 + attackStrength * 7) + sideY * (1.6 * this.stalker.attackArmSide);
    const fistX = shoulderX + dirX * (15 + attackStrength * 15);
    const fistY = attackShoulderY + dirY * (15 + attackStrength * 15);
    const fistRadius = 2.4 + attackStrength * 1.8;

    ctx.save();
    ctx.strokeStyle = "rgba(5, 6, 8, 0.98)";
    ctx.lineWidth = 2.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = 9 * attackStrength;
    ctx.shadowColor = "rgba(154, 231, 238, 0.14)";
    ctx.beginPath();
    ctx.moveTo(shoulderX, attackShoulderY);
    ctx.quadraticCurveTo(elbowX, elbowY, fistX, fistY);
    ctx.stroke();

    ctx.fillStyle = "rgba(6, 7, 9, 0.98)";
    ctx.beginPath();
    ctx.arc(fistX, fistY, fistRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = this.stalker.mode === "chase" ? "rgba(154, 231, 238, 0.2)" : "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.restore();
  }

  private renderPunchArm(
    ctx: CanvasRenderingContext2D,
    playerX: number,
    playerY: number,
    punchStrength: number,
    facingX: number,
    facingY: number,
    punchArmSide: PunchArmSide
  ): void {
    if (punchStrength <= 0.001) {
      return;
    }

    const dirX = facingX;
    const dirY = facingY;
    const sideX = -dirY;
    const sideY = dirX;
    const shoulderX = playerX + dirX * 7 + sideX * (6 * punchArmSide);
    const shoulderY = playerY - 6 + dirY * 7 + sideY * (4 * punchArmSide);
    const elbowX = shoulderX + dirX * (4 + punchStrength * 4) + sideX * (1.5 * punchArmSide);
    const elbowY = shoulderY + dirY * (4 + punchStrength * 4) + sideY * (1.5 * punchArmSide);
    const fistX = shoulderX + dirX * (8 + punchStrength * 11);
    const fistY = shoulderY + dirY * (8 + punchStrength * 11);
    const fistRadius = 3.6 + punchStrength * 1.4;
    const armGradient = ctx.createLinearGradient(shoulderX, shoulderY, fistX, fistY);
    armGradient.addColorStop(0, PLAYER_SUIT_TOP_COLOR);
    armGradient.addColorStop(0.7, PLAYER_SUIT_SIDE_COLOR);
    armGradient.addColorStop(0.86, PLAYER_SUIT_SHADOW_COLOR);
    armGradient.addColorStop(0.93, PLAYER_GLOVE_TOP_COLOR);
    armGradient.addColorStop(1, PLAYER_GLOVE_SHADOW_COLOR);

    const gloveGradient = ctx.createLinearGradient(
      fistX - fistRadius * 0.7,
      fistY - fistRadius * 0.7,
      fistX + fistRadius * 0.7,
      fistY + fistRadius * 0.7
    );
    gloveGradient.addColorStop(0, PLAYER_GLOVE_TOP_COLOR);
    gloveGradient.addColorStop(1, PLAYER_GLOVE_SHADOW_COLOR);

    ctx.save();
    ctx.strokeStyle = armGradient;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.quadraticCurveTo(elbowX, elbowY, fistX, fistY);
    ctx.stroke();

    ctx.fillStyle = gloveGradient;
    ctx.beginPath();
    ctx.arc(fistX, fistY, fistRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PLAYER_GLOVE_OUTLINE_COLOR;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private joinMaterializationStrength(timer: number): number {
    return clamp(timer / PLAYER_JOIN_EFFECT_DURATION, 0, 1);
  }

  private joinMaterializationBodyAlpha(timer: number): number {
    const strength = this.joinMaterializationStrength(timer);
    if (strength <= 0.001) {
      return 1;
    }

    return 0.35 + (1 - strength) * 0.65;
  }

  private renderJoinMaterialization(x: number, y: number, timer: number, seed: number): void {
    const strength = this.joinMaterializationStrength(timer);
    if (strength <= 0.001) {
      return;
    }

    const { ctx } = this.services.renderer;
    const phase = this.elapsed * 18 + seed * 13;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const glow = ctx.createRadialGradient(x, y - 6, 6, x, y - 6, 38 + strength * 22);
    glow.addColorStop(0, `rgba(214, 246, 255, ${0.1 + strength * 0.18})`);
    glow.addColorStop(0.52, `rgba(237, 224, 166, ${0.05 + strength * 0.1})`);
    glow.addColorStop(1, "rgba(214, 246, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 56, y - 66, 112, 128);

    for (let index = 0; index < 4; index += 1) {
      const bandWidth = 34 + index * 5;
      const bandHeight = 6 + (index % 2);
      const bandX = x - bandWidth * 0.5 + Math.sin(phase + index * 0.7) * strength * 9;
      const bandY = y - 30 + index * 15 + Math.cos(phase * 0.7 + index) * strength * 7;
      const alpha = strength * (0.16 - index * 0.025);
      ctx.fillStyle = index % 2 === 0
        ? `rgba(197, 242, 255, ${alpha})`
        : `rgba(244, 224, 154, ${alpha})`;
      ctx.fillRect(bandX, bandY, bandWidth, bandHeight);
    }

    ctx.restore();
  }

  private renderPlayerSpriteFrame(
    ctx: CanvasRenderingContext2D,
    frameIndex: number,
    drawX: number,
    drawY: number,
    drawSize: number,
    punchStrength: number,
    punchArmSide: PunchArmSide
  ): void {
    const character = this.assets?.character;
    if (!character) {
      return;
    }

    const meta = character.sprite;
    if (punchStrength <= 0.001) {
      ctx.drawImage(
        character.sheet,
        frameIndex * meta.frameWidth,
        0,
        meta.frameWidth,
        meta.frameHeight,
        drawX,
        drawY,
        drawSize,
        drawSize
      );
      return;
    }

    const spriteCtx = this.ensurePlayerSpriteContext(drawSize);
    spriteCtx.save();
    spriteCtx.setTransform(1, 0, 0, 1, 0, 0);
    spriteCtx.clearRect(0, 0, drawSize, drawSize);
    spriteCtx.imageSmoothingEnabled = false;
    spriteCtx.drawImage(
      character.sheet,
      frameIndex * meta.frameWidth,
      0,
      meta.frameWidth,
      meta.frameHeight,
      0,
      0,
      drawSize,
      drawSize
    );
    spriteCtx.restore();

    this.maskPunchingArmOnSprite(spriteCtx, drawSize, punchArmSide);
    ctx.drawImage(spriteCtx.canvas, drawX, drawY, drawSize, drawSize);
  }

  private maskPunchingArmOnSprite(ctx: CanvasRenderingContext2D, drawSize: number, punchArmSide: PunchArmSide): void {
    const scale = drawSize / 48;
    const armCenterX = (punchArmSide < 0 ? 14.3 : 33.7) * scale;
    const armCenterY = 24.2 * scale;
    const shoulderCenterX = (punchArmSide < 0 ? 16.8 : 31.2) * scale;
    const shoulderCenterY = 21.6 * scale;
    const redrawClipX = (punchArmSide < 0 ? 11.5 : 27.2) * scale;
    const redrawClipY = 12.5 * scale;
    const redrawClipWidth = 9.3 * scale;
    const redrawClipHeight = 21.5 * scale;

    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(armCenterX, armCenterY, 4.3 * scale, 7.9 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(shoulderCenterX, shoulderCenterY, 4.5 * scale, 4.9 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const torsoGradient = ctx.createLinearGradient(0, 10 * scale, 0, 37 * scale);
    torsoGradient.addColorStop(0, PLAYER_SUIT_TOP_COLOR);
    torsoGradient.addColorStop(1, PLAYER_SUIT_SIDE_COLOR);

    ctx.save();
    ctx.beginPath();
    ctx.rect(redrawClipX, redrawClipY, redrawClipWidth, redrawClipHeight);
    ctx.clip();
    ctx.fillStyle = torsoGradient;
    ctx.strokeStyle = PLAYER_SUIT_OUTLINE_COLOR;
    ctx.lineWidth = 1.4 * scale;
    ctx.beginPath();
    ctx.ellipse(24 * scale, 23.3 * scale, 9.9 * scale, 14.1 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    this.mixer.setMuted("master", this.muted);
    if (this.muted) {
      this.stopAmbientHum();
    } else {
      this.ambientGapTimer = Math.min(this.ambientGapTimer, 0.25);
      this.updateAmbientHum(0);
    }
  }

  private playSfx(url: string | null, volume: number): void {
    if (!url || !this.audioUnlocked) {
      return;
    }
    this.mixer.playOneShot(url, volume);
  }

  private stopAmbientHum(): void {
    if (!this.assets) {
      this.ambientCurrentClip = null;
      this.ambientPlayPending = false;
      this.ambientGapTimer = 0;
      return;
    }

    for (const clip of this.assets.audio.ambientClips) {
      clip.pause();
      clip.currentTime = 0;
      this.mixer.apply(clip, "music", 0);
    }

    this.ambientCurrentClip = null;
    this.ambientPlayPending = false;
    this.ambientGapTimer = 0;
  }

  private updateAmbientHum(dt: number): void {
    if (!this.assets || !this.audioUnlocked) {
      return;
    }

    if (this.muted) {
      this.stopAmbientHum();
      return;
    }

    if (this.ambientPlayPending) {
      return;
    }

    const currentClip = this.ambientCurrentClip;
    if (currentClip) {
      if (!currentClip.ended) {
        this.mixer.apply(currentClip, "music", 0.035);
        return;
      }

      currentClip.pause();
      currentClip.currentTime = 0;
      this.ambientCurrentClip = null;
      this.ambientGapTimer = this.randomAmbientGap();
    }

    if (this.ambientGapTimer > 0) {
      this.ambientGapTimer = Math.max(0, this.ambientGapTimer - dt);
      return;
    }

    const clip = this.pickAmbientHumClip();
    if (!clip) {
      return;
    }

    clip.currentTime = 0;
    this.mixer.apply(clip, "music", 0.035);
    this.ambientPlayPending = true;
    void clip
      .play()
      .then(() => {
        this.ambientPlayPending = false;
        this.ambientCurrentClip = clip;
      })
      .catch(() => {
        this.ambientPlayPending = false;
        this.ambientCurrentClip = null;
        this.ambientGapTimer = 0.4;
      });
  }

  private pickAmbientHumClip(): HTMLAudioElement | null {
    const clips = this.assets?.audio.ambientClips ?? [];
    if (clips.length === 0) {
      return null;
    }

    let index = Math.floor(Math.random() * clips.length);
    if (clips.length > 1 && index === this.ambientClipIndex) {
      index = (index + 1 + Math.floor(Math.random() * (clips.length - 1))) % clips.length;
    }

    this.ambientClipIndex = index;
    return clips[index] ?? null;
  }

  private randomAmbientGap(): number {
    const roll = Math.random();
    if (roll < 0.28) {
      return 0;
    }
    if (roll < 0.72) {
      return 0.6 + Math.random() * 2.4;
    }
    return 2 + Math.random() * 8;
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
    this.cutAmbientFixtureLights(darknessCtx);
    if (this.player.isDead) {
      this.cutRadialLight(darknessCtx, playerScreenX, playerScreenY, 28, 0.52);
    } else if (this.flashlightOn) {
      this.cutFlashlightBeam(darknessCtx, playerScreenX, playerScreenY, this.player.facingX, this.player.facingY);
    } else {
      this.cutRadialLight(darknessCtx, playerScreenX, playerScreenY, 6, 0.14);
    }

    for (const player of this.remotePlayers()) {
      if (player.isDead || !player.flashlightOn) {
        continue;
      }

      const visual = this.remotePlayerVisuals.get(player.id);
      this.cutFlashlightBeam(
        darknessCtx,
        (visual?.x ?? player.x) - this.cameraX,
        (visual?.y ?? player.y) - this.cameraY,
        visual?.facingX ?? player.facing.x,
        visual?.facingY ?? player.facing.y
      );
    }
    darknessCtx.restore();

    renderer.ctx.drawImage(darknessCanvas, 0, 0);
  }

  private areaAverageLight(area: AreaDef): number {
    return clamp((area.lighting.start + area.lighting.end) * 0.5, 0, 1);
  }

  private cutAmbientFixtureLights(ctx: CanvasRenderingContext2D): void {
    this.forEachAmbientFixtureLight((worldX, worldY, radius, strength) => {
      this.cutRadialLight(ctx, worldX - this.cameraX, worldY - this.cameraY, radius, strength);
    });
  }

  private forEachAmbientFixtureLight(
    callback: (worldX: number, worldY: number, radius: number, strength: number) => void
  ): void {
    for (const area of AREAS) {
      const averageLight = this.areaAverageLight(area);
      if (averageLight <= 0.02) {
        continue;
      }

      const lightSpacing = area.kind === "hall" ? 92 : 112;
      const lightWidth = area.kind === "hall" ? 34 : 42;
      const radius = 26 + averageLight * (area.kind === "hall" ? 56 : 48);
      const strength = clamp(0.1 + averageLight * 0.55, 0.12, 0.68);
      for (let lightX = 28; lightX < area.width - 24; lightX += lightSpacing) {
        callback(area.x + lightX + lightWidth * 0.5, area.y + 16, radius, strength);
      }
    }
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

  private cutFlashlightBeam(
    ctx: CanvasRenderingContext2D,
    playerX: number,
    playerY: number,
    facingX: number,
    facingY: number
  ): void {
    const facingLength = Math.hypot(facingX, facingY);
    if (facingLength <= 0.001) {
      return;
    }

    const dirX = facingX / facingLength;
    const dirY = facingY / facingLength;
    const originX = playerX + dirX * FLASHLIGHT_SOURCE_OFFSET;
    const originY = playerY + dirY * FLASHLIGHT_SOURCE_OFFSET;

    this.cutRadialLight(ctx, playerX, playerY, FLASHLIGHT_PLAYER_POOL_RADIUS, FLASHLIGHT_PLAYER_POOL_STRENGTH);
    this.cutConeLight(ctx, originX, originY, dirX, dirY, FLASHLIGHT_OUTER_RANGE, FLASHLIGHT_OUTER_SPREAD, FLASHLIGHT_OUTER_STRENGTH, false);
    this.cutConeLight(ctx, originX, originY, dirX, dirY, FLASHLIGHT_MID_RANGE, FLASHLIGHT_MID_SPREAD, FLASHLIGHT_MID_STRENGTH, false);
    this.cutSolidConeLight(ctx, originX, originY, dirX, dirY, FLASHLIGHT_CORE_RANGE, FLASHLIGHT_CORE_SPREAD);
    this.cutConeLight(ctx, originX, originY, dirX, dirY, 152, 32, FLASHLIGHT_CORE_STRENGTH, true);
    this.cutRadialLight(ctx, originX, originY, FLASHLIGHT_ORIGIN_POOL_RADIUS, FLASHLIGHT_ORIGIN_POOL_STRENGTH);
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

  private isActorRevealed(worldX: number, worldY: number, radius: number): boolean {
    if (!this.darknessEnabled) {
      return true;
    }

    return (
      this.isWorldPointRevealed(worldX, worldY) ||
      this.isWorldPointRevealed(worldX - radius, worldY) ||
      this.isWorldPointRevealed(worldX + radius, worldY) ||
      this.isWorldPointRevealed(worldX, worldY - radius) ||
      this.isWorldPointRevealed(worldX, worldY + radius)
    );
  }

  private isWorldPointRevealed(worldX: number, worldY: number): boolean {
    if (!this.darknessEnabled) {
      return true;
    }

    if (this.isPointInsideAmbientFixtureLight(worldX, worldY)) {
      return true;
    }

    if (this.player.isDead) {
      return distance(worldX, worldY, this.player.x, this.player.y) <= 28;
    }

    if (this.flashlightOn) {
      if (this.isPointInsideFlashlightBeam(worldX, worldY, this.player.x, this.player.y, this.player.facingX, this.player.facingY)) {
        return true;
      }
    } else if (distance(worldX, worldY, this.player.x, this.player.y) <= 6) {
      return true;
    }

    for (const player of this.remotePlayers()) {
      if (player.isDead || !player.flashlightOn) {
        continue;
      }

      const visual = this.remotePlayerVisuals.get(player.id);
      if (
        this.isPointInsideFlashlightBeam(
          worldX,
          worldY,
          visual?.x ?? player.x,
          visual?.y ?? player.y,
          visual?.facingX ?? player.facing.x,
          visual?.facingY ?? player.facing.y
        )
      ) {
        return true;
      }
    }

    return false;
  }

  private isPointInsideAmbientFixtureLight(worldX: number, worldY: number): boolean {
    let revealed = false;
    this.forEachAmbientFixtureLight((lightX, lightY, radius) => {
      if (!revealed && distance(worldX, worldY, lightX, lightY) <= radius) {
        revealed = true;
      }
    });
    return revealed;
  }

  private isPointInsideFlashlightBeam(
    worldX: number,
    worldY: number,
    sourceX: number,
    sourceY: number,
    facingX: number,
    facingY: number
  ): boolean {
    const facingLength = Math.hypot(facingX, facingY);
    if (facingLength <= 0.001) {
      return distance(worldX, worldY, sourceX, sourceY) <= FLASHLIGHT_PLAYER_POOL_RADIUS;
    }

    const dirX = facingX / facingLength;
    const dirY = facingY / facingLength;
    if (distance(worldX, worldY, sourceX, sourceY) <= FLASHLIGHT_PLAYER_POOL_RADIUS) {
      return true;
    }

    const originX = sourceX + dirX * FLASHLIGHT_SOURCE_OFFSET;
    const originY = sourceY + dirY * FLASHLIGHT_SOURCE_OFFSET;
    if (distance(worldX, worldY, originX, originY) <= FLASHLIGHT_ORIGIN_POOL_RADIUS) {
      return true;
    }

    return this.isPointInsideCone(worldX, worldY, originX, originY, dirX, dirY, FLASHLIGHT_OUTER_RANGE, FLASHLIGHT_OUTER_SPREAD);
  }

  private isPointInsideCone(
    pointX: number,
    pointY: number,
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    range: number,
    spread: number
  ): boolean {
    const dx = pointX - originX;
    const dy = pointY - originY;
    const forward = dx * dirX + dy * dirY;
    if (forward < 0 || forward > range) {
      return false;
    }

    const perpX = -dirY;
    const perpY = dirX;
    const lateralDistance = Math.abs(dx * perpX + dy * perpY);
    const lateralLimit = 7 + (spread - 7) * (forward / range);
    return lateralDistance <= lateralLimit;
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

  private ensurePlayerSpriteContext(drawSize: number): CanvasRenderingContext2D {
    if (!this.playerSpriteCanvas) {
      this.playerSpriteCanvas = document.createElement("canvas");
      this.playerSpriteCtx = this.playerSpriteCanvas.getContext("2d");
      if (!this.playerSpriteCtx) {
        throw new Error("Failed to create player sprite context.");
      }
    }

    if (this.playerSpriteCanvas.width !== drawSize || this.playerSpriteCanvas.height !== drawSize) {
      this.playerSpriteCanvas.width = drawSize;
      this.playerSpriteCanvas.height = drawSize;
    }

    const spriteCtx = this.playerSpriteCtx;
    if (!spriteCtx) {
      throw new Error("Player sprite context is unavailable.");
    }

    return spriteCtx;
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
    const prompt = this.currentPrompt();
    const roomSnapshot = this.services.room.getSnapshot();
    const topFont = this.touch.shouldRender() ? "bold 12px Trebuchet MS" : "bold 13px Trebuchet MS";
    const topSubFont = "12px Trebuchet MS";

    this.renderTopHudLine(14, this.buildTopSummaryLine(roomSnapshot), "#f6ebbd", topFont);
    if (this.helpVisible) {
      this.renderTopHudLine(42, this.buildControlsSummaryLine(), "#d6dfe2", topSubFont);
    } else {
      renderer.text("H: controls", renderer.width - 18, 24, {
        align: "right",
        color: "#c8bb8b",
        font: "13px Trebuchet MS"
      });
    }

    const banner = roomSnapshot.statusBanner;
    const statusText = this.status.ttl > 0 ? this.status.text : "The fluorescent hum keeps folding into itself.";
    if (banner) {
      const bannerColor = banner.tone === "success"
        ? "#aef0b7"
        : banner.tone === "alarm"
          ? "#ffb2a8"
          : banner.tone === "warning"
            ? "#f4df98"
            : "#d8f4ff";
      renderer.text(banner.text, renderer.width * 0.5, renderer.height - 44, {
        align: "center",
        color: bannerColor,
        font: "bold 14px Trebuchet MS"
      });
    }
    renderer.text(statusText, renderer.width * 0.5, renderer.height - 20, {
      align: "center",
      color: "#f8edbf",
      font: "14px Trebuchet MS"
    });

    if (prompt && !banner) {
      renderer.text(`${prompt.label}: ${prompt.instruction}`, renderer.width * 0.5, renderer.height - 44, {
        align: "center",
        color: "#d8f4ff",
        font: "bold 15px Trebuchet MS"
      });
    }
  }

  private renderTopHudLine(top: number, text: string, color: string, font: string): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const barX = 14;
    const barWidth = renderer.width - 28;
    const barHeight = 24;

    ctx.save();
    ctx.fillStyle = "rgba(10, 10, 8, 0.72)";
    ctx.fillRect(barX, top, barWidth, barHeight);
    ctx.strokeStyle = "rgba(217, 201, 138, 0.44)";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, top, barWidth, barHeight);
    ctx.restore();

    renderer.text(text, renderer.width * 0.5, top + 16, {
      align: "center",
      color,
      font
    });
  }

  private buildTopSummaryLine(roomSnapshot: PublicRoomSnapshot): string {
    const parts = [
      this.currentArea()?.label ?? "Unknown area",
      `Next ${this.topObjectiveShortLabel()}`,
      `Relays ${this.collectedRelays.size}/${RELAYS.length}`,
      `Panels ${this.activatedPanels.size}/${PANELS.length}`,
      this.exitUnlocked() ? "Exit OPEN" : "Exit LOCKED",
      formatPublicRoomStatus(roomSnapshot.phase)
    ];

    if (roomSnapshot.roundStartedAt !== null) {
      parts.push(`Round ${this.formatHudClock(roomSnapshot.roundTimeRemainingMs)}`);
    }

    if (roomSnapshot.phase === "round_joinable") {
      parts.push(`Join ${this.formatHudClock(roomSnapshot.joinTimeRemainingMs)}`);
    }

    if (this.energyDrinkTimer > 0) {
      parts.push(`Boost ${this.energyDrinkTimer.toFixed(1)}s`);
    }

    if (this.loadingError) {
      parts.push("Audio degraded");
    }

    return parts.join("  |  ");
  }

  private buildControlsSummaryLine(): string {
    const parts = this.touch.shouldRender()
      ? [
          "Touch move",
          "USE interact",
          "ACT primary",
          "UTIL flashlight",
          "LOBBY top-right"
        ]
      : [
          "WASD move",
          "E use",
          "J/X act",
          "F flashlight"
        ];

    parts.push("H controls");
    parts.push("M mute");
    if (!this.touch.shouldRender()) {
      parts.push("Esc title");
    }

    if (!this.audioUnlocked) {
      parts.push(this.touch.shouldRender() ? "Tap once for audio" : "Press once for audio");
    } else if (this.muted) {
      parts.push("Muted");
    }

    return parts.join("  |  ");
  }

  private topObjectiveShortLabel(): string {
    if (this.collectedRelays.size < RELAYS.length) {
      return "recover relays";
    }
    if (!this.activatedPanels.has("panel-a")) {
      return "activate Core Breaker A";
    }
    if (!this.activatedPanels.has("panel-b")) {
      return "activate Panel B";
    }
    return "reach the exit terminal";
  }

  private formatHudClock(ms: number | null): string {
    if (ms === null) {
      return "--:--";
    }

    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  private currentMatchSnapshot(): MatchSnapshot | null {
    return this.services.room.getMatchSnapshot();
  }

  private remotePlayers(): readonly MatchPlayerSnapshot[] {
    const roomSnapshot = this.services.room.getSnapshot();
    return this.currentMatchSnapshot()?.players.filter((player) => player.id !== roomSnapshot.localPlayerId) ?? [];
  }

  private syncAuthoritativeMatchState(): void {
    const matchSnapshot = this.currentMatchSnapshot();
    if (!matchSnapshot) {
      this.lastAppliedMatchSnapshot = null;
      this.remotePlayerVisuals.clear();
      return;
    }

    if (this.lastAppliedMatchSnapshot === matchSnapshot) {
      return;
    }

    this.lastAppliedMatchSnapshot = matchSnapshot;
    this.syncObjectiveSet(this.collectedRelays, matchSnapshot.objectives.restoredRelayIds);
    this.syncObjectiveSet(this.activatedPanels, matchSnapshot.objectives.activatedPanelIds);
    this.syncPickupInstances(matchSnapshot.pickups);
    this.applyAuthoritativePrimaryStalker(matchSnapshot.stalkers[0] ?? null);
  }

  private syncObjectiveSet(target: Set<string>, ids: readonly string[]): void {
    target.clear();
    for (const id of ids) {
      target.add(id);
    }
  }

  private syncPickupInstances(pickups: readonly MatchPickupSnapshot[]): void {
    const existingById = new Map(this.pickups.map((pickup) => [pickup.id, pickup]));
    this.pickups.length = 0;

    for (const pickup of pickups) {
      if (pickup.collected) {
        continue;
      }

      const existing = existingById.get(pickup.id);
      this.pickups.push({
        id: pickup.id,
        type: pickup.type,
        x: pickup.x,
        y: pickup.y,
        radius: pickup.radius,
        pulseOffset: existing?.pulseOffset ?? Math.random() * Math.PI * 2,
        blockStatusCooldown: existing?.blockStatusCooldown ?? 0
      });
    }
  }

  private currentPrimaryStalkerSnapshot(): MatchStalkerSnapshot | null {
    return this.currentMatchSnapshot()?.stalkers[0] ?? null;
  }

  private applyAuthoritativePrimaryStalker(snapshot: MatchStalkerSnapshot | null): void {
    if (!snapshot) {
      return;
    }

    const previousHealth = this.stalker.health;
    const previousInitialized = this.stalkerSnapshotInitialized;
    this.stalker.attackTimer = (snapshot.attackTimeRemainingMs ?? 0) / 1000;
    this.stalker.attackCooldown = (snapshot.attackCooldownTimeRemainingMs ?? 0) / 1000;
    if (snapshot.attackArmSide !== null) {
      this.stalker.attackArmSide = snapshot.attackArmSide;
    }
    this.stalker.x = snapshot.x;
    this.stalker.y = snapshot.y;
    this.stalker.facingX = snapshot.facing.x;
    this.stalker.facingY = snapshot.facing.y;
    this.stalker.health = snapshot.health;
    this.stalker.maxHealth = snapshot.maxHealth;
    this.stalker.isDead = snapshot.isDead;
    this.stalker.mode = snapshot.mode;
    this.stalker.currentAreaId = snapshot.areaId;
    this.stalkerSnapshotInitialized = true;
    if (previousInitialized && snapshot.health < previousHealth) {
      const damage = previousHealth - snapshot.health;
      this.spawnDamageNumber(snapshot.x, snapshot.y - 48, `-${damage}`, DAMAGE_TEXT_RED, snapshot.x, snapshot.y - 26, 18);
    }
  }

  private applyAuthoritativeLocalPlayer(snapshot: MatchPlayerSnapshot | null): void {
    if (!snapshot) {
      return;
    }

    if (this.localJoinEffectJoinedAt !== snapshot.joinedAt) {
      this.localJoinEffectJoinedAt = snapshot.joinedAt;
      this.localJoinEffectTimer = PLAYER_JOIN_EFFECT_DURATION;
    }

    const previousHealth = this.player.health;
    const wasDead = this.player.isDead;
    this.player.x = snapshot.x;
    this.player.y = snapshot.y;
    this.player.facingX = snapshot.facing.x;
    this.player.facingY = snapshot.facing.y;
    this.flashlightOn = snapshot.flashlightOn;
    this.player.health = snapshot.health;
    this.player.maxHealth = snapshot.maxHealth;
    this.energyDrinkTimer = (snapshot.speedBoostTimeRemainingMs ?? 0) / 1000;
    if (!wasDead && snapshot.health < previousHealth) {
      const damage = previousHealth - snapshot.health;
      this.playerHitFlash = Math.max(this.playerHitFlash, 0.26);
      this.spawnDamageNumber(this.player.x, this.player.y - 40, `-${damage}`, DAMAGE_TEXT_RED, this.player.x, this.player.y - 10, 16);
      this.playSfx(this.assets?.audio.punchImpactUrl ?? null, 0.14);
      if (previousHealth === this.player.maxHealth && snapshot.health > 0) {
        this.pushStatus("The stalker hits hard. Keep space or find a med kit.");
      }
    }

    if (!wasDead && snapshot.isDead) {
      this.handlePlayerDeath();
      return;
    }

    this.player.isDead = snapshot.isDead;
  }

  private syncLocalPlayerState(moveX: number, moveY: number, wantsInteract: boolean, wantsPunch: boolean): void {
    const snapshot = this.services.room.syncLocalPlayerState({
      x: this.player.x,
      y: this.player.y,
      move: {
        x: moveX,
        y: moveY
      },
      facing: {
        x: this.player.facingX,
        y: this.player.facingY
      },
      flashlightOn: this.flashlightOn,
      wantsInteract,
      wantsPunch
    });
    this.applyAuthoritativeLocalPlayer(snapshot);
  }

  private syncRoundResolution(): void {
    const roomSnapshot = this.services.room.getSnapshot();
    const localResult = roomSnapshot.results?.players.find((player) => player.id === roomSnapshot.localPlayerId) ?? null;
    if (!localResult) {
      return;
    }

    this.matchResolvedOutcome = localResult.outcome;
    this.matchResolvedReason = roomSnapshot.results?.reason ?? null;
    if (localResult.outcome === "winner") {
      if (!this.escaped) {
        this.escaped = true;
        this.pushStatus("Extraction successful. The breaker floor finally lets you go.");
      }
      return;
    }

    if (!this.player.isDead) {
      const message =
        this.matchResolvedReason === "timeout"
          ? "The public-room timer expired before extraction."
          : this.matchResolvedReason === "wipe"
            ? "No one stayed standing long enough to escape."
            : "The chamber sealed before you made it inside.";
      this.pushStatus(message);
    }
  }

  private playerName(): string {
    return this.services.room.getSnapshot().localPlayerName ?? "Operator";
  }

  private renderPlayerHitFlashOverlay(): void {
    if (this.playerHitFlash <= 0.001) {
      return;
    }

    const { ctx, width, height } = this.services.renderer;
    const alpha = clamp(this.playerHitFlash / 0.26, 0, 1) * 0.14;
    ctx.save();
    ctx.fillStyle = `rgba(255, 90, 90, ${alpha})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  private renderDeathOverlay(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;

    ctx.save();
    ctx.fillStyle = "rgba(7, 4, 4, 0.8)";
    ctx.fillRect(0, 0, renderer.width, renderer.height);
    ctx.strokeStyle = "rgba(224, 126, 126, 0.82)";
    ctx.lineWidth = 2;
    ctx.strokeRect(renderer.width * 0.5 - 220, renderer.height * 0.5 - 92, 440, 184);
    ctx.restore();

    renderer.text("Suit Ruptured", renderer.width * 0.5, renderer.height * 0.5 - 28, {
      align: "center",
      color: "#ffd8b6",
      font: "bold 32px Trebuchet MS"
    });
    renderer.text("The stalker brought you down on the breaker floor.", renderer.width * 0.5, renderer.height * 0.5 + 8, {
      align: "center",
      color: "#f1d4d4",
      font: "18px Trebuchet MS"
    });
    renderer.text("Press Enter, tap, or R to return to the title screen.", renderer.width * 0.5, renderer.height * 0.5 + 42, {
      align: "center",
      color: "#f0c0a8",
      font: "15px Trebuchet MS"
    });
  }

  private renderRoundLossOverlay(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const message =
      this.matchResolvedReason === "timeout"
        ? "The public room timed out before extraction."
        : this.matchResolvedReason === "wipe"
          ? "The team wiped before the floor could be cleared."
          : "The chamber sealed without you inside.";

    ctx.save();
    ctx.fillStyle = "rgba(7, 4, 4, 0.8)";
    ctx.fillRect(0, 0, renderer.width, renderer.height);
    ctx.strokeStyle = "rgba(224, 126, 126, 0.82)";
    ctx.lineWidth = 2;
    ctx.strokeRect(renderer.width * 0.5 - 220, renderer.height * 0.5 - 92, 440, 184);
    ctx.restore();

    renderer.text("Round Lost", renderer.width * 0.5, renderer.height * 0.5 - 28, {
      align: "center",
      color: "#ffd8b6",
      font: "bold 32px Trebuchet MS"
    });
    renderer.text(message, renderer.width * 0.5, renderer.height * 0.5 + 8, {
      align: "center",
      color: "#f1d4d4",
      font: "18px Trebuchet MS"
    });
    renderer.text("Press Enter, tap, or R to return to the title screen.", renderer.width * 0.5, renderer.height * 0.5 + 42, {
      align: "center",
      color: "#f0c0a8",
      font: "15px Trebuchet MS"
    });
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
