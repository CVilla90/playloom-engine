import type { Scene } from "@playloom/engine-core";
import { ActionMap } from "@playloom/engine-input";
import type { AppServices } from "../context";
import { RoadCarAudio } from "../audio/RoadCarAudio";
import { NightVelocityMusic } from "../audio/NightVelocityMusic";
import { type AudioMode, audioModeLabel, audioModeScale, nextAudioMode } from "../audioMode";
import { createTrafficAssets, imageReady, tintedReimeiFrame } from "../trafficAssets";
import {
  laneRoadFraction,
  rearViewTrafficSpriteView,
  TRAFFIC_REARVIEW_RENDER_BEHIND_METERS,
  trafficIsRearViewRenderable,
  trafficIsRenderable,
  trafficSpriteView,
  trafficHardSpeedLimitKph,
  // trafficYawFrame, // disabled: far/close yaw swap is off, we render a single 04° frame
  type TrafficLane,
  type TrafficVehicle
} from "../trafficModel";
import {
  rivalIsRearViewRenderable,
  rivalIsRenderable,
  rivalHardSpeedLimitKph,
  type RivalState
} from "../rivalModel";
import {
  ROUTE_LENGTH_METERS,
  ROUTE_SECTORS,
  MAX_GEAR,
  MAX_SPEED_KPH,
  NATURAL_TOP_SPEED_KPH,
  clamp,
  createInitialDriveState,
  getRouteSector,
  rpmForSpeed,
  stepDriveModel,
  type DriveState,
  type RouteSector
} from "../drivingModel";
import {
  NO_DRAFT,
  NO_LEAD_PUSH,
  calculateDraftState,
  calculateLeadPushState,
  type DraftState,
  type DraftVehicle,
  type LeadPushState
} from "../draftModel";
import {
  PLAYER_FOLLOW_GAP_METERS,
  TRUCK_VEHICLE_MASS_FACTOR,
  resolveRoadVehicleCollisions,
  type RoadCollisionVehicle
} from "../collision";
import {
  laneChangeBlinkerLit,
  laneChangeProgress,
  startLaneChangeIntent,
  stepLaneChange,
  type LaneChangeDirection,
  type LaneChangeIntent
} from "../laneChangeModel";
import { ROUTE_MAP_SECTOR_PATHS, routeMapPositionAt } from "../routeMap";
import { tunnelPortalVisualDistance } from "../tunnelTransition";
import {
  clampShifterPoint,
  gearAtShifterPoint,
  shifterGatePoint,
  type HShifterLayout,
  type ShifterPoint
} from "../shifterModel";
import {
  burnoutIntensity,
  createBurnoutEffectState,
  stepBurnoutEffect,
  type BurnoutEffectState
} from "../burnoutModel";
import { drawBurnoutSmokeSprite } from "../burnoutVisual";
import { routeRelativeMeters } from "../multiplayer/AuthoritativeRaceSession";
import { HARD_SNAP_SPEED_KPH, IMPACT_RECONCILE_HOLD_SECONDS } from "../multiplayer/clientPrediction";
import type { WanganSessionClient } from "../multiplayer/WanganSessionClient";
import { carColorHex, type PlayerProfile } from "../multiplayer/playerProfile";
import type { RacePlayerSnapshot } from "../multiplayer/protocol";

interface RoadProjection {
  readonly centerX: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly depth: number;
}

interface EnvironmentBlend {
  readonly from: RouteSector;
  readonly to: RouteSector;
  readonly mix: number;
}

type RGB = readonly [number, number, number];
type BackdropKind = "city" | "bridge" | "harbor" | "mountains" | "tunnel";

// Each sector owns a distinct horizon backdrop plus its sky/glow/lamp palette.
// Sectors cross-fade into one another as the player drives across boundaries.
interface SectorTheme {
  readonly backdrop: BackdropKind;
  readonly cityVariant: number;
  readonly skyTop: RGB;
  readonly skyHorizon: RGB;
  readonly glow: RGB;
  readonly glowAlpha: number;
  readonly lampBulb: string;
  readonly lampGlow: string;
  readonly lampSpacing: number;
}

const SECTOR_THEMES: Readonly<Record<RouteSector["id"], SectorTheme>> = {
  downtown: {
    backdrop: "city", cityVariant: 0,
    skyTop: [2, 4, 13], skyHorizon: [51, 35, 62],
    glow: [104, 156, 242], glowAlpha: 0.14,
    lampBulb: "#f4d990", lampGlow: "rgba(255,225,160,0.18)", lampSpacing: 34
  },
  bridge: {
    backdrop: "bridge", cityVariant: 0,
    skyTop: [2, 5, 18], skyHorizon: [71, 34, 60],
    glow: [238, 111, 174], glowAlpha: 0.18,
    lampBulb: "#ef9ac9", lampGlow: "rgba(255,171,215,0.18)", lampSpacing: 42
  },
  harbor: {
    backdrop: "harbor", cityVariant: 0,
    skyTop: [3, 8, 16], skyHorizon: [24, 46, 58],
    glow: [90, 190, 210], glowAlpha: 0.15,
    lampBulb: "#f4d990", lampGlow: "rgba(255,214,150,0.18)", lampSpacing: 42
  },
  mountains: {
    backdrop: "mountains", cityVariant: 0,
    skyTop: [4, 6, 20], skyHorizon: [26, 30, 54],
    glow: [150, 170, 220], glowAlpha: 0.12,
    lampBulb: "#cfe0ff", lampGlow: "rgba(190,205,255,0.16)", lampSpacing: 46
  },
  tunnel: {
    backdrop: "tunnel", cityVariant: 0,
    skyTop: [3, 4, 7], skyHorizon: [15, 17, 19],
    glow: [255, 184, 92], glowAlpha: 0.08,
    lampBulb: "#ffd18a", lampGlow: "rgba(255,194,102,0.22)", lampSpacing: 32
  },
  skyline: {
    backdrop: "city", cityVariant: 1,
    skyTop: [6, 4, 18], skyHorizon: [61, 36, 72],
    glow: [201, 162, 255], glowAlpha: 0.16,
    lampBulb: "#e6a6ff", lampGlow: "rgba(220,180,255,0.18)", lampSpacing: 34
  }
};

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function rgbCss(c: RGB): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}

function rgbaCss(c: RGB, alpha: number): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha.toFixed(3)})`;
}

function quadPoint(p0: number, p1: number, p2: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
}

const ACTIONS = {
  accelerate: ["w", "arrowup"],
  brake: ["s", "arrowdown"],
  clutch: ["c"],
  shift_down: ["q"],
  shift_up: ["e"],
  steer_left: ["a", "arrowleft"],
  steer_right: ["d", "arrowright"],
  restart: ["r"],
  audio: ["m"],
  back: ["escape"]
} as const;

const HORIZON_Y = 192;
const ROAD_BOTTOM_Y = 688;
const ROAD_DRAW_DISTANCE = 460;
const ENVIRONMENT_MORPH_HALF_DISTANCE = 180;
const LOOP_MORPH_DISTANCE = ENVIRONMENT_MORPH_HALF_DISTANCE * 2;

// Road perspective. Width shares the vertical's curve exponent so the base
// projection stays stable; visual-only route profiles then offset center per
// projected strip to fake shallow curves without changing gameplay physics.
const ROAD_PERSPECTIVE_EXP = 2.12;
const ROAD_FAR_HALF_WIDTH = 90;
const ROAD_NEAR_HALF_WIDTH = 686;
const ROAD_SEGMENT_LENGTH = 18;
// Markings get extra screen travel without altering physics, traffic positions,
// backdrop parallax, or route distance. This is the dedicated speed-drama knob.
const ROAD_LINE_SCROLL_MULTIPLIER = 1.35;
const TRAFFIC_FRAME_WIDTH = 1024;
const TRAFFIC_FRAME_HEIGHT = 640;
const TRAFFIC_FRAME_BASELINE_Y = 526;
const REAR_VIEW_MIRROR_WIDTH = 410;
const REAR_VIEW_MIRROR_HEIGHT = 86;
const REAR_VIEW_MIRROR_INSET = 7;
const EXIT_BUTTON_WIDTH = 70;
const EXIT_BUTTON_HEIGHT = 28;
const EXIT_BUTTON_MARGIN = 24;
const MAX_STEER_ANGLE = 0.62;
const STEERING_WHEEL_CENTER_X = 770;
// Raise/lower the cockpit wheel by changing this canvas Y coordinate.
const STEERING_WHEEL_CENTER_Y = 625;
const STEERING_WHEEL_RADIUS = 148;
const STEERING_DRAG_THRESHOLD = 48;

// The three lanes the player and traffic share, left to right. The player's
// index into this list is its current lane; A/D step through it.
const LANE_ORDER: readonly TrafficLane[] = ["left", "center", "right"];

// The H-gate grew into the space freed by the slimmed left console: wider
// column spacing and a taller top/bottom throw make mobile touch-drag gear
// selection far more forgiving.
const H_SHIFTER_LAYOUT: HShifterLayout = {
  columns: [336, 438, 540],
  topY: 580,
  neutralY: 634,
  bottomY: 690,
  neutralBandHalfHeight: 12,
  hitPadding: 30
};

interface RectBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const SHIFTER_PLATE_BOUNDS: RectBounds = {
  x: 276,
  y: 538,
  width: 324,
  height: 178
};

const SHIFTER_PLATE_CENTER_X = SHIFTER_PLATE_BOUNDS.x + SHIFTER_PLATE_BOUNDS.width * 0.5;
// Touch radius for grabbing the stick knob.
const SHIFTER_KNOB_GRAB_RADIUS = 46;

// The old DOM touch deck is gone; its still-useful buttons live directly on
// the right cockpit pillar so the canvas can own the whole screen. START and
// RESTART were dropped deliberately: the title screen has its own canvas Join
// button, and R cannot reset an authoritative online session.
const COCKPIT_TOUCH_BUTTONS: ReadonlyArray<{
  readonly label: string;
  readonly key: "q" | "e" | "m";
  readonly bounds: RectBounds;
}> = [
  { label: "AUDIO", key: "m", bounds: { x: 1198, y: 352, width: 70, height: 48 } },
  { label: "GEAR −", key: "q", bounds: { x: 1198, y: 410, width: 70, height: 48 } },
  { label: "GEAR +", key: "e", bounds: { x: 1198, y: 468, width: 70, height: 48 } }
];

const PEDAL_CONTROLS: ReadonlyArray<{
  readonly label: "CLUTCH" | "BRAKE" | "GAS";
  readonly key: "c" | "s" | "w";
  readonly bounds: RectBounds;
}> = [
  { label: "CLUTCH", key: "c", bounds: { x: 986, y: 619, width: 74, height: 88 } },
  { label: "BRAKE", key: "s", bounds: { x: 1068, y: 619, width: 74, height: 88 } },
  { label: "GAS", key: "w", bounds: { x: 1150, y: 603, width: 66, height: 104 } }
];

interface Point2D {
  readonly x: number;
  readonly y: number;
}

type RoadVehicleSource = "traffic" | "rival" | "player";

interface SceneCollisionVehicle extends RoadCollisionVehicle {
  readonly source: RoadVehicleSource;
  readonly sourceId: string;
}

type VisibleRoadVehicle =
  | { readonly source: "traffic"; readonly vehicle: TrafficVehicle }
  | { readonly source: "rival"; readonly vehicle: RivalState }
  | { readonly source: "player"; readonly vehicle: RacePlayerSnapshot & { readonly relativeMeters: number } };

interface RoadVisualProfile {
  readonly curveBias: number;
  readonly curveAmplitude: number;
  readonly curveFrequency: number;
  readonly curvePhase: number;
}

const FLAT_ROAD_PROFILE: RoadVisualProfile = {
  curveBias: 0,
  curveAmplitude: 0,
  curveFrequency: 1,
  curvePhase: 0
};

// Visual-only route shape. These values bend the drawn road and roadside
// objects, but do not affect lane indices, collision positions, or player speed.
// Keep curves long and shallow; tight/frequent bends fight the simplified art.
const ROAD_VISUAL_PROFILES: Readonly<Record<RouteSector["id"], RoadVisualProfile>> = {
  downtown: FLAT_ROAD_PROFILE,
  bridge: {
    curveBias: 54,
    curveAmplitude: 18,
    curveFrequency: 0.9,
    curvePhase: 0.4
  },
  harbor: {
    curveBias: -34,
    curveAmplitude: 22,
    curveFrequency: 0.8,
    curvePhase: 1.7
  },
  mountains: {
    curveBias: -10,
    curveAmplitude: 24,
    curveFrequency: 0.5,
    curvePhase: -0.4
  },
  tunnel: {
    curveBias: -2,
    curveAmplitude: 8,
    curveFrequency: 0.42,
    curvePhase: 0.8
  },
  skyline: {
    curveBias: 24,
    curveAmplitude: 18,
    curveFrequency: 0.55,
    curvePhase: 2.2
  }
};

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function routeSectorIndexAt(distanceMeters: number): number {
  let sectorIndex = 0;
  for (let index = 0; index < ROUTE_SECTORS.length; index += 1) {
    if (distanceMeters >= ROUTE_SECTORS[index]!.startMeters) {
      sectorIndex = index;
    }
  }
  return sectorIndex;
}

function routeLoopMix(distanceMeters: number): number | null {
  const loopStart = ROUTE_LENGTH_METERS - LOOP_MORPH_DISTANCE;
  if (distanceMeters < loopStart) {
    return null;
  }
  return smoothstep((distanceMeters - loopStart) / LOOP_MORPH_DISTANCE);
}

function routeProgressAt(distanceMeters: number): number {
  return clamp(distanceMeters / ROUTE_LENGTH_METERS, 0, 1);
}

function mixProfile(a: RoadVisualProfile, b: RoadVisualProfile, t: number): RoadVisualProfile {
  return {
    curveBias: a.curveBias + (b.curveBias - a.curveBias) * t,
    curveAmplitude: a.curveAmplitude + (b.curveAmplitude - a.curveAmplitude) * t,
    curveFrequency: a.curveFrequency + (b.curveFrequency - a.curveFrequency) * t,
    curvePhase: a.curvePhase + (b.curvePhase - a.curvePhase) * t
  };
}

function roadVisualProfileAt(distanceMeters: number): RoadVisualProfile {
  const safeDistance = clamp(distanceMeters, 0, ROUTE_LENGTH_METERS);
  const loopMix = routeLoopMix(safeDistance);
  if (loopMix !== null) {
    const from = ROUTE_SECTORS[ROUTE_SECTORS.length - 1]!;
    const to = ROUTE_SECTORS[0]!;
    return mixProfile(ROAD_VISUAL_PROFILES[from.id], ROAD_VISUAL_PROFILES[to.id], loopMix);
  }

  for (let index = 1; index < ROUTE_SECTORS.length; index += 1) {
    const from = ROUTE_SECTORS[index - 1]!;
    const to = ROUTE_SECTORS[index]!;
    const start = to.startMeters - ENVIRONMENT_MORPH_HALF_DISTANCE;
    const end = to.startMeters + ENVIRONMENT_MORPH_HALF_DISTANCE;
    if (safeDistance >= start && safeDistance <= end) {
      if (from.id === "tunnel" || to.id === "tunnel") {
        const current = ROUTE_SECTORS[routeSectorIndexAt(safeDistance)]!;
        return ROAD_VISUAL_PROFILES[current.id];
      }
      return mixProfile(
        ROAD_VISUAL_PROFILES[from.id],
        ROAD_VISUAL_PROFILES[to.id],
        smoothstep((safeDistance - start) / (end - start))
      );
    }
  }

  const sector = ROUTE_SECTORS[routeSectorIndexAt(safeDistance)]!;
  return ROAD_VISUAL_PROFILES[sector.id];
}

export class GameScene implements Scene {
  private readonly actions: ActionMap;
  private readonly audio = new RoadCarAudio();
  private readonly music = new NightVelocityMusic();
  private state: DriveState = createInitialDriveState();
  private elapsed = 0;
  private shiftFlash = 0;
  private clutchWarning = 0;
  private shiftKick = 0;
  private sectorFlash = 1.5;
  private previousSectorId = "downtown";
  private audioMode: AudioMode = "normal";
  private showStartHint = true;
  private steeringAngle = 0;
  private playerLaneIndex = 1; // starts in the center lane
  private playerLaneOffset = 0; // eased lateral offset (road-half-width fraction)
  private playerLaneChange: LaneChangeIntent | null = null;
  private collisionFlash = 0;
  private collisionContacts: ReadonlyMap<string, number> = new Map();
  // While > 0, a locally predicted bump exchange outranks stale snapshots in
  // reconciliation (the server resolves the same contact within a snapshot or two).
  private impactHoldSeconds = 0;
  private readonly shifter = { ...shifterGatePoint(1, H_SHIFTER_LAYOUT) };
  private readonly trafficAssets = createTrafficAssets();
  private traffic: TrafficVehicle[] = [];
  private rivals: RivalState[] = [];
  private playerDraft: DraftState = NO_DRAFT;
  private playerPush: LeadPushState = NO_LEAD_PUSH;
  private burnout: BurnoutEffectState = createBurnoutEffectState();
  private readonly pedalPointers = new Map<number, "c" | "s" | "w">();
  private steeringPointerId: number | null = null;
  private steeringDragStartX = 0;
  private steeringDragTriggered = false;
  private shifterPointerId: number | null = null;
  private shifterDragPoint: ShifterPoint | null = null;
  private shifterCandidateGear: number | null = null;
  private pendingSelectedGear: number | null = null;
  // Brief pressed-state feedback for the in-canvas cockpit buttons.
  private readonly cockpitButtonFlash = new Map<string, number>();

  private readonly unlockAudio = (): void => {
    this.audio.unlock();
    this.music.unlock();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const point = this.canvasPoint(event);
    if (point === null) {
      return;
    }
    const { x, y } = point;
    const exit = this.exitButtonBounds();
    if (
      x >= exit.x &&
      x <= exit.x + exit.width &&
      y >= exit.y &&
      y <= exit.y + exit.height
    ) {
      event.preventDefault();
      this.returnToTitle();
      return;
    }

    const pedal = PEDAL_CONTROLS.find(({ bounds }) => this.pointInBounds(x, y, bounds));
    if (pedal) {
      event.preventDefault();
      this.services.renderer.ctx.canvas.setPointerCapture(event.pointerId);
      this.pedalPointers.set(event.pointerId, pedal.key);
      this.services.input.setVirtualKeyDown(pedal.key, true);
      this.showStartHint = false;
      return;
    }

    const cockpitButton = COCKPIT_TOUCH_BUTTONS.find(({ bounds }) =>
      this.pointInBounds(x, y, bounds)
    );
    if (cockpitButton) {
      event.preventDefault();
      this.services.input.tapVirtualKey(cockpitButton.key);
      this.cockpitButtonFlash.set(cockpitButton.key, 0.26);
      this.showStartHint = false;
      return;
    }

    const knobDx = x - this.shifter.x;
    const knobDy = y - this.shifter.y;
    if (
      this.shifterPointerId === null &&
      this.pointInBounds(x, y, SHIFTER_PLATE_BOUNDS) &&
      knobDx * knobDx + knobDy * knobDy <= SHIFTER_KNOB_GRAB_RADIUS * SHIFTER_KNOB_GRAB_RADIUS
    ) {
      event.preventDefault();
      if (!this.services.input.isDown("c")) {
        this.clutchWarning = 0.9;
        return;
      }
      this.services.renderer.ctx.canvas.setPointerCapture(event.pointerId);
      this.shifterPointerId = event.pointerId;
      this.shifterDragPoint = clampShifterPoint(point, H_SHIFTER_LAYOUT);
      this.shifterCandidateGear = gearAtShifterPoint(
        this.shifterDragPoint,
        H_SHIFTER_LAYOUT
      );
      this.shifter.x = this.shifterDragPoint.x;
      this.shifter.y = this.shifterDragPoint.y;
      this.showStartHint = false;
      return;
    }

    const wheelDx = x - STEERING_WHEEL_CENTER_X;
    const wheelDy = y - STEERING_WHEEL_CENTER_Y;
    if (
      this.steeringPointerId === null &&
      wheelDx * wheelDx + wheelDy * wheelDy <=
        (STEERING_WHEEL_RADIUS + 28) * (STEERING_WHEEL_RADIUS + 28)
    ) {
      event.preventDefault();
      this.services.renderer.ctx.canvas.setPointerCapture(event.pointerId);
      this.steeringPointerId = event.pointerId;
      this.steeringDragStartX = x;
      this.steeringDragTriggered = false;
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId === this.shifterPointerId) {
      const point = this.canvasPoint(event);
      if (point === null) return;
      event.preventDefault();
      if (!this.services.input.isDown("c")) {
        this.clutchWarning = 0.9;
        this.shifterCandidateGear = null;
        return;
      }
      this.shifterDragPoint = clampShifterPoint(point, H_SHIFTER_LAYOUT);
      this.shifterCandidateGear = gearAtShifterPoint(
        this.shifterDragPoint,
        H_SHIFTER_LAYOUT
      );
      this.shifter.x = this.shifterDragPoint.x;
      this.shifter.y = this.shifterDragPoint.y;
      return;
    }
    if (event.pointerId !== this.steeringPointerId || this.steeringDragTriggered) {
      return;
    }
    const point = this.canvasPoint(event);
    if (point === null) return;
    const dragX = point.x - this.steeringDragStartX;
    if (Math.abs(dragX) < STEERING_DRAG_THRESHOLD) return;
    event.preventDefault();
    this.services.input.tapVirtualKey(dragX < 0 ? "a" : "d");
    this.steeringDragTriggered = true;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const pedalKey = this.pedalPointers.get(event.pointerId);
    if (pedalKey) {
      this.services.input.setVirtualKeyDown(pedalKey, false);
      this.pedalPointers.delete(event.pointerId);
    }
    if (event.pointerId === this.steeringPointerId) {
      this.steeringPointerId = null;
      this.steeringDragTriggered = false;
    }
    if (event.pointerId === this.shifterPointerId) {
      const canSelect =
        event.type !== "pointercancel" &&
        this.services.input.isDown("c") &&
        this.shifterCandidateGear !== null;
      if (canSelect) {
        this.pendingSelectedGear = this.shifterCandidateGear;
      } else if (event.type !== "pointercancel") {
        this.clutchWarning = 0.9;
      }
      this.shifterPointerId = null;
      this.shifterDragPoint = null;
      this.shifterCandidateGear = null;
    }
  };

  constructor(
    private readonly services: AppServices,
    private readonly returnToTitle: () => void,
    private readonly session: WanganSessionClient,
    private readonly playerProfile: PlayerProfile
  ) {
    this.actions = new ActionMap(this.services.input, ACTIONS);
    const authoritative = this.session.getLocalPlayer();
    this.state = this.session.localDriveState() ?? createInitialDriveState();
    if (authoritative) {
      this.playerLaneIndex = LANE_ORDER.indexOf(authoritative.lane);
      this.playerLaneOffset = authoritative.laneFraction;
      this.playerLaneChange = authoritative.laneChange;
      this.previousSectorId = getRouteSector(authoritative.distanceMeters).id;
    }
  }

  onEnter(): void {
    window.addEventListener("keydown", this.unlockAudio);
    window.addEventListener("pointerdown", this.unlockAudio, { passive: true });
    const canvas = this.services.renderer.ctx.canvas;
    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointercancel", this.handlePointerUp);
    this.music.setActive(true);
  }

  onExit(): void {
    window.removeEventListener("keydown", this.unlockAudio);
    window.removeEventListener("pointerdown", this.unlockAudio);
    const canvas = this.services.renderer.ctx.canvas;
    canvas.removeEventListener("pointerdown", this.handlePointerDown);
    canvas.removeEventListener("pointermove", this.handlePointerMove);
    canvas.removeEventListener("pointerup", this.handlePointerUp);
    canvas.removeEventListener("pointercancel", this.handlePointerUp);
    for (const key of this.pedalPointers.values()) {
      this.services.input.setVirtualKeyDown(key, false);
    }
    this.pedalPointers.clear();
    this.shifterPointerId = null;
    this.shifterDragPoint = null;
    this.shifterCandidateGear = null;
    this.pendingSelectedGear = null;
    this.audio.shutdown();
    this.music.shutdown();
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.shiftFlash = Math.max(0, this.shiftFlash - dt);
    this.clutchWarning = Math.max(0, this.clutchWarning - dt);
    this.shiftKick = Math.max(0, this.shiftKick - dt * 4.4);
    this.sectorFlash = Math.max(0, this.sectorFlash - dt);
    for (const [key, remaining] of this.cockpitButtonFlash) {
      if (remaining - dt <= 0) {
        this.cockpitButtonFlash.delete(key);
      } else {
        this.cockpitButtonFlash.set(key, remaining - dt);
      }
    }

    if (this.actions.wasPressed("back")) {
      this.returnToTitle();
      return;
    }
    // R cannot reset position in an authoritative online session.
    this.actions.wasPressed("restart");
    if (this.actions.wasPressed("audio")) {
      this.audioMode = nextAudioMode(this.audioMode);
      this.audio.setVolume(audioModeScale(this.audioMode));
      this.music.setVolume(audioModeScale(this.audioMode));
    }

    const accelerate = this.actions.isDown("accelerate");
    const brake = this.actions.isDown("brake");
    const clutch = this.actions.isDown("clutch");
    const shiftUp = this.actions.wasPressed("shift_up");
    const shiftDown = this.actions.wasPressed("shift_down");
    const selectGear = this.pendingSelectedGear;
    this.pendingSelectedGear = null;
    // A pointer gear is queued only after the release handler confirms that
    // the clutch was down. Latch that authorization through this fixed update
    // so near-simultaneous finger/key release cannot invalidate a valid shift.
    const modelClutch = clutch || selectGear !== null;
    if ((shiftUp || shiftDown) && !clutch) {
      this.clutchWarning = 0.9;
    }
    if (accelerate || brake || modelClutch) {
      this.showStartHint = false;
    }

    const steerLeft = this.actions.wasPressed("steer_left");
    const steerRight = this.actions.wasPressed("steer_right");
    const steerRequest: -1 | 0 | 1 = steerLeft ? -1 : steerRight ? 1 : 0;

    const authoritativePlayer = this.session.getLocalPlayer();
    if (authoritativePlayer && this.playerLaneChange === null) {
      if (authoritativePlayer.laneChange) {
        this.playerLaneChange = authoritativePlayer.laneChange;
      } else if (authoritativePlayer.lane !== LANE_ORDER[this.playerLaneIndex]) {
        this.playerLaneIndex = LANE_ORDER.indexOf(authoritativePlayer.lane);
        this.playerLaneOffset = authoritativePlayer.laneFraction;
      }
    }
    this.rivals = this.authoritativeRivals();
    this.traffic = this.authoritativeTraffic();

    // Lane changes are predicted immediately, then reconciled by server snapshots.
    let playerLane = LANE_ORDER[this.playerLaneIndex]!;
    if (this.playerLaneChange === null) {
      const laneRequest =
        steerLeft
          ? LANE_ORDER[Math.max(0, this.playerLaneIndex - 1)]!
          : steerRight
            ? LANE_ORDER[Math.min(LANE_ORDER.length - 1, this.playerLaneIndex + 1)]!
            : playerLane;
      this.playerLaneChange = startLaneChangeIntent(playerLane, laneRequest);
    }
    const playerLaneStep = stepLaneChange(playerLane, this.playerLaneChange, dt);
    playerLane = playerLaneStep.lane;
    this.playerLaneChange = playerLaneStep.intent;
    const playerCommittedLaneChange = playerLaneStep.committed;
    if (playerCommittedLaneChange) {
      this.playerLaneIndex = LANE_ORDER.indexOf(playerLane);
    }

    const previousState = this.state;
    const draftVehicles: DraftVehicle[] = [
      ...this.remoteRaceVehicles().map((player) => ({
        id: player.id,
        lane: player.lane,
        speedKph: player.speedKph,
        relativeMeters: player.relativeMeters
      })),
      ...this.rivals.map((rival) => ({
        id: rival.id,
        lane: rival.lane,
        speedKph: rival.speedKph,
        relativeMeters: rival.relativeMeters
      })),
      ...this.traffic.map((vehicle) => ({
        id: vehicle.id,
        lane: vehicle.lane,
        speedKph: vehicle.speedKph,
        relativeMeters: vehicle.relativeMeters
      }))
    ];
    const playerDraftVehicle: DraftVehicle = {
      id: "player",
      lane: playerLane,
      speedKph: this.state.speedKph,
      relativeMeters: 0
    };
    this.playerDraft = calculateDraftState(playerDraftVehicle, draftVehicles);
    this.playerPush = calculateLeadPushState(playerDraftVehicle, draftVehicles);
    this.session.sendInput({
      accelerate,
      brake,
      clutch,
      shiftUp,
      shiftDown,
      selectGear,
      steer: steerRequest
    });
    this.state = stepDriveModel(
      this.state,
      {
        accelerate,
        brake,
        clutch: modelClutch,
        shiftUp,
        shiftDown,
        selectGear: selectGear ?? undefined,
        // Trailing slipstream and being bump-drafted from behind stack, so the
        // middle car of a three-car train gets both.
        draftPowerMultiplier:
          this.playerDraft.powerMultiplier * this.playerPush.powerMultiplier
      },
      dt
    );
    this.impactHoldSeconds = Math.max(0, this.impactHoldSeconds - dt);
    const reconciliation = this.session.reconcileDriveState(this.state, dt, this.impactHoldSeconds > 0);
    this.state = reconciliation.state;
    // Observe the physical clutch edge against the pre-step drivetrain state.
    // This presentation state is downstream of physics and cannot alter it.
    this.burnout = stepBurnoutEffect(
      this.burnout,
      {
        speedKph: previousState.speedKph,
        gear: previousState.gear,
        rpm: previousState.rpm,
        clutchDown: clutch
      },
      dt
    );
    const didRouteWrap = this.state.distanceMeters < previousState.distanceMeters;
    // Rebase absolute server snapshots against the newly predicted local route
    // position before resolving this frame's contact boxes.
    this.rivals = this.authoritativeRivals();
    this.traffic = this.authoritativeTraffic();
    // Collisions: keep traffic/rivals from passing through each other, and run
    // the rear-contact speed exchange for every fresh bump (player included,
    // in both directions). Contact tests run in the snapshot's own time frame,
    // dead-reckoned to now — the interpolated render lists lag real time and
    // arrive with server-resolved contacts already clamped outside the player
    // window, so colliding against them could never fire the local exchange
    // or its flash/audio cue.
    const contactWorld = this.session.getContactWorld();
    const collisionVehicles: SceneCollisionVehicle[] = contactWorld
      ? [
          ...contactWorld.players.map((player) => ({
            id: `player:${player.id}`,
            source: "player" as const,
            sourceId: player.id,
            lane: player.lane,
            speedKph: player.speedKph,
            relativeMeters: routeRelativeMeters(
              contactWorld.originDistanceMeters,
              player.distanceMeters
            ),
            contactGapMeters: PLAYER_FOLLOW_GAP_METERS,
            maxSpeedKph: MAX_SPEED_KPH,
            trainPartner: true
          })),
          ...contactWorld.traffic.map((vehicle) => ({
            id: `traffic:${vehicle.id}`,
            source: "traffic" as const,
            sourceId: vehicle.id,
            lane: vehicle.lane,
            speedKph: vehicle.speedKph,
            relativeMeters: routeRelativeMeters(contactWorld.originDistanceMeters, vehicle.distanceMeters),
            massFactor: vehicle.kind === "truck" ? TRUCK_VEHICLE_MASS_FACTOR : 1,
            maxSpeedKph: trafficHardSpeedLimitKph(vehicle.kind)
          })),
          ...contactWorld.rivals.map((rival) => ({
            id: `rival:${rival.id}`,
            source: "rival" as const,
            sourceId: rival.id,
            lane: rival.lane,
            speedKph: rival.speedKph,
            relativeMeters: routeRelativeMeters(contactWorld.originDistanceMeters, rival.distanceMeters),
            maxSpeedKph: rivalHardSpeedLimitKph(rival),
            trainPartner: true
          }))
        ]
      : [
          // Not joined: no authoritative car to anchor the contact frame, so
          // collide against the render lists exactly like the pre-session game.
          ...this.traffic.map((vehicle) => ({
            id: `traffic:${vehicle.id}`,
            source: "traffic" as const,
            sourceId: vehicle.id,
            lane: vehicle.lane,
            speedKph: vehicle.speedKph,
            relativeMeters: vehicle.relativeMeters,
            massFactor: vehicle.kind === "truck" ? TRUCK_VEHICLE_MASS_FACTOR : 1,
            maxSpeedKph: trafficHardSpeedLimitKph(vehicle.kind)
          })),
          ...this.rivals.map((rival) => ({
            id: `rival:${rival.id}`,
            source: "rival" as const,
            sourceId: rival.id,
            lane: rival.lane,
            speedKph: rival.speedKph,
            relativeMeters: rival.relativeMeters,
            maxSpeedKph: rivalHardSpeedLimitKph(rival),
            trainPartner: true
          }))
        ];
    const collisionInputById = new Map(collisionVehicles.map((vehicle) => [vehicle.id, vehicle]));
    const collision = resolveRoadVehicleCollisions(
      collisionVehicles,
      this.state.speedKph,
      playerLane,
      { dt, contacts: this.collisionContacts, playerMaxSpeedKph: MAX_SPEED_KPH }
    );
    this.collisionContacts = collision.contacts;
    const collisionById = new Map(collision.vehicles.map((vehicle) => [vehicle.id, vehicle]));
    // Feed exchanges back into the render lists only where the resolver acted,
    // so untouched cars keep their smooth interpolated motion. Contact-frame
    // positions are rebased into the render frame (relative to the predicted
    // car) before being applied.
    const contactFrameOffset = contactWorld
      ? routeRelativeMeters(this.state.distanceMeters, contactWorld.originDistanceMeters)
      : 0;
    const applyResolved = <T extends TrafficVehicle | RivalState>(vehicle: T, key: string): T => {
      const resolved = collisionById.get(key);
      const input = collisionInputById.get(key);
      if (!resolved || !input) {
        return vehicle;
      }
      if (resolved.speedKph === input.speedKph && resolved.relativeMeters === input.relativeMeters) {
        return vehicle;
      }
      return {
        ...vehicle,
        speedKph: resolved.speedKph,
        relativeMeters:
          resolved.relativeMeters !== input.relativeMeters
            ? resolved.relativeMeters + contactFrameOffset
            : vehicle.relativeMeters
      };
    };
    this.traffic = this.traffic.map((vehicle) => applyResolved(vehicle, `traffic:${vehicle.id}`));
    this.rivals = this.rivals.map((rival) => applyResolved(rival, `rival:${rival.id}`));
    // Predict the same authoritative NPC impact immediately so contact feels
    // responsive; the next server snapshot confirms/corrects the exchange.
    if (collision.playerSpeedKph !== this.state.speedKph) {
      const speedKph = clamp(collision.playerSpeedKph, 0, MAX_SPEED_KPH);
      this.state = {
        ...this.state,
        speedKph,
        rpm: rpmForSpeed(speedKph, this.state.gear),
        revLimiterActive: false,
        maxSpeedKph: Math.max(this.state.maxSpeedKph, speedKph)
      };
    }
    if (collision.playerImpact) {
      this.impactHoldSeconds = IMPACT_RECONCILE_HOLD_SECONDS;
    }
    // Hard bumps are one-shot per contact (pair cooldown), so cue directly;
    // flash intensity scales with the closing speed of the hit. A hard
    // reconciliation snap is the same crash resolved by the server before the
    // local prediction saw it — never let that speed change land silently.
    const reconcileCrashKph =
      Math.abs(reconciliation.snappedSpeedDeltaKph) > HARD_SNAP_SPEED_KPH
        ? Math.abs(reconciliation.snappedSpeedDeltaKph)
        : 0;
    if (collision.playerImpact || reconcileCrashKph > 0) {
      const cueDeltaKph = Math.max(collision.playerImpactDeltaKph, reconcileCrashKph);
      this.collisionFlash = clamp(0.55 + cueDeltaKph / 150, 0, 1.2);
      this.audio.playImpact();
    }
    this.collisionFlash = Math.max(0, this.collisionFlash - dt * 2.4);

    if (this.state.gear !== previousState.gear) {
      this.shiftFlash = 0.62;
      this.shiftKick = this.state.gear > previousState.gear ? 1 : 0.55;
    }

    const sector = getRouteSector(this.state.distanceMeters);
    if (sector.id !== this.previousSectorId) {
      this.previousSectorId = sector.id;
      if (!didRouteWrap) {
        this.sectorFlash = 2;
      }
    }

    // The camera stays centered on the cockpit; the world slides so the player's
    // lane sits under the wheel. During signal timing, visual movement previews
    // the pending lane while collisions/draft keep using the committed lane.
    const targetLaneOffset = laneRoadFraction(playerLane);
    if (this.playerLaneChange !== null) {
      this.playerLaneOffset = this.laneChangeVisualFraction(this.playerLaneChange);
    } else if (playerCommittedLaneChange) {
      this.playerLaneOffset = targetLaneOffset;
    } else {
      this.playerLaneOffset += (targetLaneOffset - this.playerLaneOffset) * (1 - Math.exp(-dt * 7));
    }
    // Wheel turns toward the lane change and straightens as the car settles.
    const steerLaneOffset =
      this.playerLaneChange !== null
        ? laneRoadFraction(this.playerLaneChange.targetLane)
        : targetLaneOffset;
    const steerTarget = clamp((steerLaneOffset - this.playerLaneOffset) * 3.4, -MAX_STEER_ANGLE, MAX_STEER_ANGLE);
    this.steeringAngle += (steerTarget - this.steeringAngle) * (1 - Math.exp(-dt * 11));

    if (this.shifterPointerId === null) {
      const gate = shifterGatePoint(this.state.gear, H_SHIFTER_LAYOUT);
      const shifterBlend = 1 - Math.exp(-dt * 16);
      this.shifter.x += (gate.x - this.shifter.x) * shifterBlend;
      this.shifter.y += (gate.y - this.shifter.y) * shifterBlend;
    }

    this.audio.update({
      rpm: this.state.rpm,
      speedKph: this.state.speedKph,
      throttle: this.state.throttle,
      brakePressure: this.state.brakePressure,
      shifting: this.state.shiftTimer > 0,
      revLimiterActive: this.state.revLimiterActive,
      elapsedSeconds: this.state.elapsedSeconds,
      tunnelMix: sector.id === "tunnel" ? 1 : 0,
      burnoutIntensity: burnoutIntensity(this.burnout)
    });
    this.music.update(dt);
  }

  render(_alpha: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const sector = getRouteSector(this.state.distanceMeters);
    const speedRatio = clamp(this.state.speedKph / MAX_SPEED_KPH, 0, 1);
    const vibration = Math.max(0, speedRatio - 0.28);
    const shakeX = Math.sin(this.elapsed * 38) * vibration * 1.4 + Math.sin(this.elapsed * 71) * vibration * 0.5;
    const shakeY = Math.cos(this.elapsed * 43) * vibration * 1.1 + this.shiftKick * 4.5;

    renderer.clear("#03050a");
    ctx.save();
    ctx.translate(shakeX, shakeY);
    this.renderBackdrop();
    this.renderRoad();
    this.renderRoadside(sector);
    this.renderTunnelForeground(sector);
    this.renderTraffic();
    this.renderCockpit();
    ctx.restore();

    this.renderVignette();
    this.renderHud(sector);

    // Collision cue: a brief red flash over everything when the player hits a car.
    if (this.collisionFlash > 0) {
      ctx.fillStyle = `rgba(255,74,58,${(this.collisionFlash * 0.26).toFixed(3)})`;
      ctx.fillRect(0, 0, renderer.width, renderer.height);
    }
  }

  private renderBackdrop(): void {
    const environment = this.currentEnvironmentBlend();
    const fromTheme = SECTOR_THEMES[environment.from.id];
    const toTheme = SECTOR_THEMES[environment.to.id];
    const mix = environment.from.id === environment.to.id ? 0 : environment.mix;

    this.drawOutdoorSky(
      mixRgb(fromTheme.skyTop, toTheme.skyTop, mix),
      mixRgb(fromTheme.skyHorizon, toTheme.skyHorizon, mix),
      mixRgb(fromTheme.glow, toTheme.glow, mix),
      fromTheme.glowAlpha + (toTheme.glowAlpha - fromTheme.glowAlpha) * mix
    );

    const parallax = this.state.visualDistanceMeters;
    if (mix <= 0) {
      this.renderBackdropScene(fromTheme, 1, parallax);
    } else {
      this.renderBackdropScene(fromTheme, 1 - mix, parallax);
      this.renderBackdropScene(toTheme, mix, parallax);
    }

    // Unlike scenery changes, the tunnel is a physical threshold. The approach
    // keeps the mountain environment active all the way to the mouth, while
    // the aperture itself is a live window onto the amber interior, so the
    // exact boundary cut lands the moment the frame sweeps past the camera.
    const tunnelStart = ROUTE_SECTORS.find((sector) => sector.id === "tunnel")!.startMeters;
    const entranceDistance = tunnelStart - this.state.distanceMeters;
    if (entranceDistance > 0 && entranceDistance <= ROAD_DRAW_DISTANCE) {
      this.drawTunnelPortal(entranceDistance, false);
    }
  }

  /** Night sky, stars, and horizon glow shared by outdoor scenes and portal views. */
  private drawOutdoorSky(skyTop: RGB, skyHorizon: RGB, glow: RGB, glowAlpha: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 90);
    sky.addColorStop(0, rgbCss(skyTop));
    sky.addColorStop(0.62, rgbCss(mixRgb(skyTop, skyHorizon, 0.55)));
    sky.addColorStop(1, rgbCss(skyHorizon));
    ctx.fillStyle = sky;
    ctx.fillRect(-10, -10, renderer.width + 20, HORIZON_Y + 100);

    this.renderStars();

    const horizonGlow = ctx.createRadialGradient(renderer.width * 0.5, HORIZON_Y, 0, renderer.width * 0.5, HORIZON_Y, 560);
    horizonGlow.addColorStop(0, rgbaCss(glow, glowAlpha));
    horizonGlow.addColorStop(1, rgbaCss(glow, 0));
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, 70, renderer.width, 300);
  }

  private renderStars(): void {
    const { renderer } = this.services;
    for (let index = 0; index < 56; index += 1) {
      const x = (index * 149.31) % renderer.width;
      const y = 18 + ((index * 73.73) % 180);
      const twinkle = 0.24 + (Math.sin(this.elapsed * (0.7 + (index % 5) * 0.11) + index) + 1) * 0.15;
      renderer.rect(x, y, index % 9 === 0 ? 2 : 1, index % 9 === 0 ? 2 : 1, `rgba(220,232,255,${twinkle.toFixed(3)})`);
    }
  }

  private currentEnvironmentBlend(): EnvironmentBlend {
    const distance = this.state.distanceMeters;
    const loopMix = routeLoopMix(distance);
    if (loopMix !== null) {
      return {
        from: ROUTE_SECTORS[ROUTE_SECTORS.length - 1]!,
        to: ROUTE_SECTORS[0]!,
        mix: loopMix
      };
    }

    for (let index = 1; index < ROUTE_SECTORS.length; index += 1) {
      const to = ROUTE_SECTORS[index]!;
      const from = ROUTE_SECTORS[index - 1]!;
      const start = to.startMeters - ENVIRONMENT_MORPH_HALF_DISTANCE;
      const end = to.startMeters + ENVIRONMENT_MORPH_HALF_DISTANCE;
      if (distance >= start && distance <= end) {
        // The tunnel does not dissolve into its neighbors. Hold the current
        // environment until the exact portal boundary is crossed.
        if (from.id === "tunnel" || to.id === "tunnel") {
          const current = getRouteSector(distance);
          return { from: current, to: current, mix: 1 };
        }
        const rawMix = clamp((distance - start) / (end - start), 0, 1);
        const mix = rawMix * rawMix * (3 - 2 * rawMix);
        return { from, to, mix };
      }
    }

    const current = getRouteSector(distance);
    return { from: current, to: current, mix: 1 };
  }

  private renderBackdropScene(theme: SectorTheme, alpha: number, parallax: number): void {
    if (alpha <= 0.01) {
      return;
    }
    const { ctx } = this.services.renderer;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    switch (theme.backdrop) {
      case "city":
        this.drawCitySkyline(parallax, theme.cityVariant);
        break;
      case "bridge":
        this.drawBridgeBackdrop(parallax);
        break;
      case "harbor":
        this.drawHarborBackdrop(parallax);
        break;
      case "mountains":
        this.drawMountainBackdrop(parallax);
        break;
      case "tunnel":
        this.drawTunnelBackdrop(parallax);
        break;
    }
    ctx.restore();
  }

  private drawCitySkyline(parallax: number, variant: number): void {
    const { renderer } = this.services;
    const baseY = HORIZON_Y + 6;
    const phase = parallax * 0.055;
    const heightScale = variant === 1 ? 1.4 : 1;
    const density = variant === 1 ? 1 : 0.86;

    for (let index = 0; index < 36; index += 1) {
      const visibility = ((index * 37) % 100) / 100;
      if (visibility > density) {
        continue;
      }
      const baseWidth = 26 + ((index * 29) % 54);
      const baseX = index * 42 - 52;
      const side = baseX + baseWidth * 0.5 < renderer.width * 0.5 ? -1 : 1;
      const drift = side * ((phase + index * 9) % 32);
      const x = baseX + drift * 0.4;
      const height = (44 + ((index * 61) % 150)) * heightScale;
      const y = baseY - height;
      const shade = index % 4 === 0 ? "#0b1020" : index % 3 === 0 ? "#0c0e1a" : "#080b14";
      renderer.rect(x, y, baseWidth, height, shade);

      if (index % 6 === 0) {
        renderer.rect(x + baseWidth * 0.44, y - 20, 2, 20, "#25334b");
        renderer.circle(x + baseWidth * 0.44 + 1, y - 22, 2, "#ef6ea9");
      }

      for (let row = 0; row < Math.floor(height / 19); row += 1) {
        if ((row + index) % 3 === 0) {
          continue;
        }
        const windowX = x + 6 + ((row * 11 + index * 5) % Math.max(8, baseWidth - 13));
        renderer.rect(
          windowX,
          y + 9 + row * 18,
          2.5,
          4,
          (row + index) % 5 === 0 ? "rgba(125,189,224,0.85)" : "rgba(221,183,104,0.85)"
        );
      }
    }
  }

  private drawBridgeBackdrop(parallax: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const w = renderer.width;
    const deckY = HORIZON_Y - 2;
    const towerTopY = 118;
    const towerX = [w * 0.34, w * 0.66] as const;
    const struct = "#0b1524";
    const cable = "rgba(150,170,205,0.75)";

    renderer.rect(0, deckY, w, 5, "#0a1120");
    renderer.rect(0, deckY + 5, w, 3, "#070c16");

    for (const tx of towerX) {
      renderer.rect(tx - 5, towerTopY, 10, deckY - towerTopY, struct);
      renderer.rect(tx - 15, towerTopY + 30, 30, 5, struct);
      renderer.rect(tx - 13, towerTopY + 74, 26, 5, struct);
      renderer.circle(tx, towerTopY - 3, 2.5, "rgba(239,110,150,0.9)");
    }

    const spans: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
      [0, w * 0.17, towerX[0], deckY - 8, deckY - 22, towerTopY + 4],
      [towerX[0], w * 0.5, towerX[1], towerTopY + 4, deckY - 6, towerTopY + 4],
      [towerX[1], w * 0.83, w, towerTopY + 4, deckY - 22, deckY - 8]
    ];
    ctx.strokeStyle = cable;
    ctx.lineWidth = 2;
    for (const [x0, cx, x1, y0, cy, y1] of spans) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();
      for (let t = 0.12; t < 0.9; t += 0.12) {
        const sx = quadPoint(x0, cx, x1, t);
        const sy = quadPoint(y0, cy, y1, t);
        if (sy < deckY - 2) {
          renderer.line(sx, sy, sx, deckY, "rgba(150,170,205,0.4)", 1);
        }
      }
    }

    for (let i = 0; i < 42; i += 1) {
      const x = (i * 61 + parallax * 0.6) % w;
      renderer.rect(x, deckY + 12 + (i % 3) * 6, 2, 1, "rgba(150,180,220,0.14)");
    }
  }

  private drawHarborBackdrop(parallax: number): void {
    const { renderer } = this.services;
    const w = renderer.width;
    const waterY = HORIZON_Y - 2;
    const struct = "#0c1420";
    const cable = "rgba(150,170,205,0.45)";
    const containers = ["#7a3b32", "#2f5a6b", "#6b5a2f", "#3a4a6b", "#5a3a5a"];

    for (let i = 0; i < 11; i += 1) {
      renderer.rect(i * 150 - 40, waterY - 34, 118, 34, "#0a0f1a");
    }

    for (let i = 0; i < 30; i += 1) {
      const x = ((i * 52 + parallax * 0.3) % (w + 60)) - 30;
      const stack = 1 + (i % 3);
      for (let s = 0; s < stack; s += 1) {
        renderer.rect(x, waterY - 10 - s * 8, 22, 7, containers[(i + s) % containers.length]!);
      }
    }

    for (const cx of [w * 0.22, w * 0.5, w * 0.78] as const) {
      const topY = 148;
      renderer.rect(cx - 22, topY + 8, 5, waterY - (topY + 8), struct);
      renderer.rect(cx + 17, topY + 8, 5, waterY - (topY + 8), struct);
      renderer.rect(cx - 30, topY + 6, 60, 5, struct);
      renderer.rect(cx - 4, topY - 16, 8, 24, struct);
      renderer.line(cx + 30, topY + 8, cx - 74, topY + 2, struct, 4);
      renderer.line(cx - 30, topY + 8, cx + 54, topY + 12, struct, 3);
      renderer.line(cx, topY - 16, cx - 70, topY + 3, cable, 1);
      renderer.line(cx, topY - 16, cx + 52, topY + 11, cable, 1);
      renderer.circle(cx - 44, topY + 5, 2, "#f4d990");
    }

    const sx = w * 0.62;
    renderer.rect(sx - 84, waterY - 14, 168, 14, "#0b111c");
    renderer.rect(sx + 24, waterY - 32, 34, 18, "#0d1420");
    for (let i = 0; i < 11; i += 1) {
      renderer.rect(sx - 76 + i * 13, waterY - 24, 11, 10, containers[i % 4]!);
    }
    renderer.rect(sx + 38, waterY - 28, 2, 2, "#f4d990");

    for (let i = 0; i < 44; i += 1) {
      const x = (i * 57 + parallax * 0.6) % w;
      renderer.rect(x, waterY + 10 + (i % 3) * 6, 2, 1, "rgba(150,180,220,0.14)");
    }
  }

  private drawMountainBackdrop(parallax: number): void {
    const { renderer } = this.services;
    const w = renderer.width;

    renderer.circle(w * 0.76, 120, 20, "rgba(232,236,248,0.92)");
    renderer.circle(w * 0.76, 120, 27, "rgba(210,220,245,0.10)");

    this.drawRidge(HORIZON_Y - 2, 64, 1.7, 2.3, "#161d31");
    this.drawRidge(HORIZON_Y + 6, 116, 1.1, 4.1, "#0a0e18");

    for (let i = 0; i < 10; i += 1) {
      const x = (i * 151 + 40 + parallax * 0.04) % w;
      renderer.circle(x, HORIZON_Y - 8 - (i % 3) * 4, 1.4, "rgba(244,217,144,0.7)");
    }
  }

  /**
   * The base tunnel enclosure is painted before the road. A matching outside-
   * road foreground mask is applied later to hide projection scaffolding while
   * leaving pavement and subsequently drawn vehicles untouched.
   */
  private drawTunnelBackdrop(parallax: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const ceiling = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 80);
    ceiling.addColorStop(0, "#030508");
    ceiling.addColorStop(0.58, "#090b0f");
    ceiling.addColorStop(1, "#17150f");
    ctx.fillStyle = ceiling;
    ctx.fillRect(-12, -12, renderer.width + 24, renderer.height + 24);

    for (const side of [-1, 1] as const) {
      ctx.save();
      this.traceTunnelWallPath(side);
      ctx.clip();

      const wall = ctx.createLinearGradient(0, 0, 0, renderer.height);
      wall.addColorStop(0, "#17130e");
      wall.addColorStop(0.34, "#59401f");
      wall.addColorStop(0.72, "#8f6330");
      wall.addColorStop(1, "#292016");
      ctx.fillStyle = wall;
      ctx.fillRect(-10, -10, renderer.width + 20, renderer.height + 20);

      this.drawTunnelPanelRibs(side, parallax);
      this.drawTunnelWallDetails(side, parallax);
      ctx.restore();
    }

    this.drawTunnelCeilingRibs(parallax);

    // Pale lower wall/utility strip: sampled from the same road edge, but pushed
    // outward so it cannot occupy pavement even before the road overdraws it.
    for (let farDistance = ROAD_DRAW_DISTANCE; farDistance > 0; farDistance -= ROAD_SEGMENT_LENGTH) {
      const nearDistance = Math.max(0, farDistance - ROAD_SEGMENT_LENGTH);
      const far = this.projectRoad(farDistance);
      const near = this.projectRoad(nearDistance);
      for (const side of [-1, 1] as const) {
        const farEdge = far.centerX + this.laneShift(far.halfWidth) + side * (far.halfWidth + 3);
        const nearEdge = near.centerX + this.laneShift(near.halfWidth) + side * (near.halfWidth + 3);
        const farWidth = 5 + far.depth * 22;
        const nearWidth = 5 + near.depth * 22;
        this.fillQuad(
          farEdge,
          far.y,
          farEdge + side * farWidth,
          far.y - far.depth * 4,
          nearEdge + side * nearWidth,
          near.y - near.depth * 4,
          nearEdge,
          near.y,
          side < 0 ? "#9c8b69" : "#b49a66"
        );
      }
    }

    // The exit aperture is painted before the interior fixtures: recessed
    // lights and signs that are physically inside the bore keep occluding the
    // opening naturally, while fixtures beyond the mouth are culled instead of
    // ghosting over the skyline visible outside.
    const exitMeters = ROUTE_SECTORS.find((sector) => sector.id === "skyline")!.startMeters;
    const exitDistance = exitMeters - this.state.distanceMeters;
    const exitVisible = exitDistance > 0 && exitDistance <= ROAD_DRAW_DISTANCE;
    if (exitVisible) {
      this.drawTunnelPortal(exitDistance, true);
    }
    const fixtureCullDistance = exitVisible ? exitDistance : Number.POSITIVE_INFINITY;

    // Two recessed light rows converge cleanly above the road like the reference.
    const lightSpacing = 24;
    const lightOffset = parallax % lightSpacing;
    const lightDrawLimit = Math.min(ROAD_DRAW_DISTANCE, fixtureCullDistance);
    for (let distance = lightSpacing - lightOffset; distance < lightDrawLimit; distance += lightSpacing) {
      const point = this.projectRoad(distance);
      if (point.depth < 0.025) continue;
      const centerX = point.centerX + this.laneShift(point.halfWidth);
      const lightY = HORIZON_Y - 7 - point.depth * 150;
      const lateral = 24 + point.depth * 260;
      const lightWidth = 3 + point.depth * 31;
      const lightHeight = 1.5 + point.depth * 7;
      for (const side of [-1, 1] as const) {
        const x = centerX + side * lateral;
        ctx.save();
        ctx.shadowColor = "rgba(255,180,65,0.75)";
        ctx.shadowBlur = 3 + point.depth * 15;
        ctx.fillStyle = `rgba(255,215,133,${(0.58 + point.depth * 0.38).toFixed(3)})`;
        ctx.fillRect(x - lightWidth * 0.5, lightY - lightHeight * 0.5, lightWidth, lightHeight);
        ctx.restore();
      }
    }

    // Sparse overhead wayfinding gives scale without becoming a HUD-like layer.
    const signSpacing = 320;
    const signDistance = signSpacing - (parallax % signSpacing);
    if (signDistance < lightDrawLimit && signDistance > 48) {
      const point = this.projectRoad(signDistance);
      const centerX = point.centerX + this.laneShift(point.halfWidth);
      const signWidth = 18 + point.depth * 150;
      const signHeight = 5 + point.depth * 31;
      const signY = HORIZON_Y - 19 - point.depth * 118;
      renderer.rect(centerX - signWidth * 0.5, signY, signWidth, signHeight, "#155849");
      renderer.strokeRect(centerX - signWidth * 0.5, signY, signWidth, signHeight, "rgba(164,224,200,0.7)", 1 + point.depth * 2);
      for (let mark = 0; mark < 3; mark += 1) {
        renderer.rect(
          centerX - signWidth * 0.36 + mark * signWidth * 0.28,
          signY + signHeight * 0.35,
          signWidth * 0.16,
          Math.max(1, signHeight * 0.12),
          "rgba(218,244,231,0.78)"
        );
      }
    }

  }

  /**
   * Opaque tunnel walls are repeated after the road scaffolding/guardrails but
   * before vehicles. The clip begins just outside the road edge, so no asphalt,
   * lane marking, car, or mirror-visible subject can be covered by this pass.
   */
  private renderTunnelForeground(sector: RouteSector): void {
    if (sector.id !== "tunnel") {
      return;
    }
    const { renderer } = this.services;
    const { ctx } = renderer;
    const exitMeters = ROUTE_SECTORS.find((entry) => entry.id === "skyline")!.startMeters;
    const exitDistance = exitMeters - this.state.distanceMeters;

    ctx.save();
    if (exitDistance > 0 && exitDistance <= ROAD_DRAW_DISTANCE) {
      // Remove the exit aperture from the foreground mask. Without this inverse
      // clip, near wall panels are correctly visible around the car but the same
      // procedural wall continues through the opening and appears beyond it.
      this.traceOutsideTunnelPortal(exitDistance);
      ctx.clip("evenodd");
    }
    for (const side of [-1, 1] as const) {
      ctx.save();
      this.traceTunnelWallPath(side);
      ctx.clip();
      const wall = ctx.createLinearGradient(0, HORIZON_Y - 20, 0, renderer.height);
      wall.addColorStop(0, "#20170e");
      wall.addColorStop(0.34, "#60451f");
      wall.addColorStop(0.72, "#916631");
      wall.addColorStop(1, "#2c2116");
      ctx.fillStyle = wall;
      ctx.fillRect(-12, HORIZON_Y - 30, renderer.width + 24, renderer.height + 50);

      this.drawTunnelPanelRibs(side, this.state.visualDistanceMeters);
      this.drawTunnelWallDetails(side, this.state.visualDistanceMeters);
      ctx.restore();
    }

    // Clean pale utility strip at the wall/road boundary. It replaces the
    // exposed guardrail geometry without intruding into the asphalt.
    for (let farDistance = ROAD_DRAW_DISTANCE; farDistance > 0; farDistance -= ROAD_SEGMENT_LENGTH) {
      const nearDistance = Math.max(0, farDistance - ROAD_SEGMENT_LENGTH);
      const far = this.projectRoad(farDistance);
      const near = this.projectRoad(nearDistance);
      for (const side of [-1, 1] as const) {
        const farEdge = far.centerX + this.laneShift(far.halfWidth) + side * (far.halfWidth + 3);
        const nearEdge = near.centerX + this.laneShift(near.halfWidth) + side * (near.halfWidth + 3);
        const farWidth = 5 + far.depth * 22;
        const nearWidth = 5 + near.depth * 22;
        this.fillQuad(
          farEdge, far.y,
          farEdge + side * farWidth, far.y - far.depth * 4,
          nearEdge + side * nearWidth, near.y - near.depth * 4,
          nearEdge, near.y,
          side < 0 ? "#9c8b69" : "#b49a66"
        );
      }
    }
    ctx.restore();

    if (exitDistance > 0 && exitDistance <= ROAD_DRAW_DISTANCE) {
      this.drawTunnelPortal(exitDistance, true, true);
    }
  }

  /**
   * Wall dressing shared by the base tunnel pass and the foreground repaint:
   * alternating panel weathering, a service conduit riding above the utility
   * strip, and periodic green-lit refuge doors. Callers clip to the wall
   * region first, so nothing here can reach the asphalt, and doors cull at
   * the exit plane so none can ghost onto the skyline seen through the mouth.
   */
  private drawTunnelWallDetails(side: -1 | 1, parallax: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;

    // Service conduit: a dark cable run with a lit top edge that hugs the
    // wall above the utility strip and converges into the portal mouths.
    for (let farDistance = ROAD_DRAW_DISTANCE; farDistance > 0; farDistance -= ROAD_SEGMENT_LENGTH) {
      const nearDistance = Math.max(0, farDistance - ROAD_SEGMENT_LENGTH);
      const far = this.projectRoad(farDistance);
      const near = this.projectRoad(nearDistance);
      const farX = far.centerX + this.laneShift(far.halfWidth) + side * (far.halfWidth + 11 + far.depth * 34);
      const nearX = near.centerX + this.laneShift(near.halfWidth) + side * (near.halfWidth + 11 + near.depth * 34);
      const farY = far.y - 5 - far.depth * 26;
      const nearY = near.y - 5 - near.depth * 26;
      const farThickness = 1.2 + far.depth * 5;
      const nearThickness = 1.2 + near.depth * 5;
      this.fillQuad(farX, farY, farX, farY + farThickness, nearX, nearY + nearThickness, nearX, nearY, "#2b1a09");
      this.fillQuad(
        farX,
        farY - farThickness * 0.45,
        farX,
        farY,
        nearX,
        nearY,
        nearX,
        nearY - nearThickness * 0.45,
        "rgba(255,199,116,0.38)"
      );
    }

    // Refuge doors roughly every 88 physical metres (the pattern scrolls in
    // visual space, ~2x). Their green lamps are the one cool accent in the
    // amber bore, mirroring real expressway tunnel emergency exits.
    const doorSpacing = 176;
    const exitMeters = ROUTE_SECTORS.find((sector) => sector.id === "skyline")!.startMeters;
    const exitDistance = exitMeters - this.state.distanceMeters;
    const doorDrawLimit = exitDistance > 0 ? Math.min(ROAD_DRAW_DISTANCE, exitDistance) : ROAD_DRAW_DISTANCE;
    for (
      let distance = doorSpacing - (parallax % doorSpacing);
      distance < doorDrawLimit;
      distance += doorSpacing
    ) {
      const point = this.projectRoad(distance);
      if (point.depth < 0.05) continue;
      const edgeX = point.centerX + this.laneShift(point.halfWidth) + side * (point.halfWidth + 4);
      const doorWidth = 2.5 + point.depth * 18;
      const doorHeight = 4 + point.depth * 42;
      const baseY = point.y - 1 - point.depth * 4;
      const innerX = edgeX + side * (2 + point.depth * 9);
      const doorX = side < 0 ? innerX - doorWidth : innerX;
      renderer.rect(doorX - 1, baseY - doorHeight - 1, doorWidth + 2, doorHeight + 1, "#150c04");
      renderer.rect(doorX, baseY - doorHeight, doorWidth, doorHeight, "#38290f");
      const signWidth = doorWidth * 0.85;
      const signHeight = Math.max(1, 1 + point.depth * 4.5);
      const signY = baseY - doorHeight - signHeight - (1.5 + point.depth * 4);
      ctx.save();
      ctx.shadowColor = "rgba(82,255,170,0.8)";
      ctx.shadowBlur = 2 + point.depth * 11;
      ctx.fillStyle = `rgba(74,224,148,${(0.55 + point.depth * 0.4).toFixed(3)})`;
      ctx.fillRect(doorX + (doorWidth - signWidth) * 0.5, signY, signWidth, signHeight);
      ctx.restore();
    }
  }

  /** Upright structural bays replace the former horizontal speed-line walls. */
  private drawTunnelPanelRibs(side: -1 | 1, parallax: number): void {
    const { renderer } = this.services;
    const panelSpacing = 44;
    const panelOffset = parallax % panelSpacing;
    for (
      let distance = panelSpacing - panelOffset;
      distance < ROAD_DRAW_DISTANCE;
      distance += panelSpacing
    ) {
      const point = this.projectRoad(distance);
      if (point.depth < 0.018) continue;
      const centerX = point.centerX + this.laneShift(point.halfWidth);
      const baseX = centerX + side * (point.halfWidth + 3);
      const baseY = point.y - 2 - point.depth * 5;
      const topX = baseX + side * (9 + point.depth * 92);
      const topY = HORIZON_Y - 8 - point.depth * 205;
      const ribWidth = 1.2 + point.depth * 8;
      renderer.line(baseX, baseY, topX, topY, "rgba(22,15,8,0.82)", ribWidth + 3);
      renderer.line(
        baseX - side * ribWidth * 0.45,
        baseY,
        topX - side * ribWidth * 0.45,
        topY,
        `rgba(240,188,105,${(0.2 + point.depth * 0.3).toFixed(3)})`,
        Math.max(1, ribWidth * 0.28)
      );
      const reflectorWidth = 2 + point.depth * 9;
      const reflectorHeight = 1.5 + point.depth * 5;
      renderer.rect(
        baseX + side * (5 + point.depth * 11) - (side < 0 ? reflectorWidth : 0),
        baseY - 13 - point.depth * 16,
        reflectorWidth,
        reflectorHeight,
        "rgba(255,205,116,0.82)"
      );
    }
  }

  /** Repeating roof cross-members lock both walls into one concrete bore. */
  private drawTunnelCeilingRibs(parallax: number): void {
    const { renderer } = this.services;
    const spacing = 88;
    for (
      let distance = spacing - (parallax % spacing);
      distance < ROAD_DRAW_DISTANCE;
      distance += spacing
    ) {
      const point = this.projectRoad(distance);
      if (point.depth < 0.025) continue;
      const centerX = point.centerX + this.laneShift(point.halfWidth);
      const lateral = point.halfWidth + 12 + point.depth * 92;
      const y = HORIZON_Y - 8 - point.depth * 205;
      const width = 2 + point.depth * 8;
      renderer.line(centerX - lateral, y, centerX + lateral, y, "rgba(18,14,10,0.88)", width + 3);
      renderer.line(
        centerX - lateral,
        y + width * 0.5,
        centerX + lateral,
        y + width * 0.5,
        "rgba(225,174,96,0.2)",
        Math.max(1, width * 0.22)
      );
    }
  }

  /** Trace the whole canvas minus the projected portal aperture. */
  private traceOutsideTunnelPortal(distanceAhead: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const portal = this.tunnelPortalBounds(distanceAhead);
    ctx.beginPath();
    ctx.rect(-24, -24, renderer.width + 48, renderer.height + 48);
    ctx.rect(
      portal.leftX,
      portal.lintelY,
      portal.rightX - portal.leftX,
      Math.max(1, portal.roadY - portal.lintelY)
    );
  }

  private traceTunnelWallPath(side: -1 | 1): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    ctx.beginPath();
    ctx.moveTo(side < 0 ? -20 : renderer.width + 20, -20);
    const far = this.projectRoad(ROAD_DRAW_DISTANCE);
    ctx.lineTo(
      far.centerX + this.laneShift(far.halfWidth) + side * (far.halfWidth + 2),
      far.y
    );
    for (let distance = ROAD_DRAW_DISTANCE - ROAD_SEGMENT_LENGTH; distance >= 0; distance -= ROAD_SEGMENT_LENGTH) {
      const point = this.projectRoad(distance);
      ctx.lineTo(
        point.centerX + this.laneShift(point.halfWidth) + side * (point.halfWidth + 2),
        point.y
      );
    }
    ctx.lineTo(side < 0 ? -20 : renderer.width + 20, renderer.height + 20);
    ctx.closePath();
  }

  private drawTunnelPortal(
    distanceAhead: number,
    openingToSkyline: boolean,
    frameOnly = false
  ): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const { leftX, rightX, lintelY, roadY, depth } =
      this.tunnelPortalBounds(distanceAhead);

    if (!frameOnly) {
      // Each aperture is a live window onto the real next environment — the
      // amber bore when approaching, the skyline night when leaving — so the
      // player sees into/out of the tunnel, and the mouth engulfing the view
      // hands off seamlessly to the exact boundary cut. The road itself is
      // drawn later and continues through the opening.
      ctx.save();
      ctx.beginPath();
      ctx.rect(leftX, lintelY, rightX - leftX, Math.max(1, roadY - lintelY));
      ctx.clip();
      if (openingToSkyline) {
        this.drawPortalOutdoorView(SECTOR_THEMES.skyline);
      } else {
        this.drawTunnelBackdrop(this.state.visualDistanceMeters);
      }
      ctx.restore();
    }

    const frameWidth = 9 + depth * 18;
    renderer.rect(leftX - frameWidth, lintelY, frameWidth, roadY - lintelY + 12, "rgba(38,35,29,0.98)");
    renderer.rect(rightX, lintelY, frameWidth, roadY - lintelY + 12, "rgba(38,35,29,0.98)");
    renderer.rect(leftX - frameWidth, lintelY - frameWidth, rightX - leftX + frameWidth * 2, frameWidth, "rgba(38,35,29,0.98)");
    const accent = openingToSkyline ? "rgba(201,162,255,0.92)" : "rgba(255,197,110,0.92)";
    renderer.line(leftX, lintelY, rightX, lintelY, accent, 2 + depth * 4);
    renderer.line(leftX, lintelY, leftX, roadY, accent, 1.5 + depth * 3);
    renderer.line(rightX, lintelY, rightX, roadY, accent, 1.5 + depth * 3);
  }

  /**
   * The full outdoor environment as seen through a portal aperture. Callers
   * clip to the aperture first. It reproduces exactly what renderBackdrop
   * paints for that sector — ground clear color, sky, stars, glow, skyline —
   * so the hard cut at the boundary lands on an identical picture.
   */
  private drawPortalOutdoorView(theme: SectorTheme): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    ctx.fillStyle = "#03050a";
    ctx.fillRect(-12, -12, renderer.width + 24, renderer.height + 24);
    this.drawOutdoorSky(theme.skyTop, theme.skyHorizon, theme.glow, theme.glowAlpha);
    this.renderBackdropScene(theme, 1, this.state.visualDistanceMeters);
  }

  private tunnelPortalBounds(distanceAhead: number): {
    readonly centerX: number;
    readonly leftX: number;
    readonly rightX: number;
    readonly lintelY: number;
    readonly roadY: number;
    readonly depth: number;
  } {
    const visualDistance = tunnelPortalVisualDistance(
      distanceAhead,
      ROAD_DRAW_DISTANCE
    );
    const point = this.projectRoad(visualDistance);
    const centerX = point.centerX + this.laneShift(point.halfWidth);
    // The linear term matches the historic mid/far silhouette; the high-power
    // term only wakes up in the last ~100 m so the lintel accelerates upward
    // and sweeps off-screen right before the car passes under the mouth.
    const lintelLift = Math.pow(point.depth, ROAD_PERSPECTIVE_EXP * 4) * 300;
    return {
      centerX,
      leftX: centerX - point.halfWidth - 16,
      rightX: centerX + point.halfWidth + 16,
      lintelY: HORIZON_Y - 18 - point.depth * 156 - lintelLift,
      roadY: point.y,
      depth: point.depth
    };
  }

  private drawRidge(ridgeBaseY: number, amplitude: number, freq: number, phase: number, color: string): void {
    const { ctx } = this.services.renderer;
    const w = this.services.renderer.width;
    const steps = 18;
    ctx.beginPath();
    ctx.moveTo(-10, ridgeBaseY + 70);
    for (let i = 0; i <= steps; i += 1) {
      const x = -10 + ((w + 20) * i) / steps;
      const n = Math.abs(Math.sin(i * freq + phase)) * 0.7 + Math.abs(Math.sin(i * freq * 0.5 + phase * 1.7)) * 0.3;
      ctx.lineTo(x, ridgeBaseY - amplitude * n);
    }
    ctx.lineTo(w + 10, ridgeBaseY + 70);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  private renderRoad(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const roadGradient = ctx.createLinearGradient(0, HORIZON_Y, 0, ROAD_BOTTOM_Y);
    roadGradient.addColorStop(0, "#26272c");
    roadGradient.addColorStop(0.55, "#1c1e22");
    roadGradient.addColorStop(1, "#111319");

    for (
      let farDistance = ROAD_DRAW_DISTANCE;
      farDistance > 0;
      farDistance -= ROAD_SEGMENT_LENGTH
    ) {
      const nearDistance = Math.max(0, farDistance - ROAD_SEGMENT_LENGTH);
      const far = this.projectRoad(farDistance);
      const near = this.projectRoad(nearDistance);
      const farShift = this.laneShift(far.halfWidth);
      const nearShift = this.laneShift(near.halfWidth);
      const farShoulderWidth = 13 + far.depth * 71;
      const nearShoulderWidth = 13 + near.depth * 71;

      this.fillQuad(
        far.centerX - far.halfWidth - farShoulderWidth + farShift,
        far.y,
        far.centerX + far.halfWidth + farShoulderWidth + farShift,
        far.y,
        near.centerX + near.halfWidth + nearShoulderWidth + nearShift,
        near.y,
        near.centerX - near.halfWidth - nearShoulderWidth + nearShift,
        near.y,
        "#17181d"
      );
      this.fillQuad(
        far.centerX - far.halfWidth + farShift,
        far.y,
        far.centerX + far.halfWidth + farShift,
        far.y,
        near.centerX + near.halfWidth + nearShift,
        near.y,
        near.centerX - near.halfWidth + nearShift,
        near.y,
        roadGradient
      );
    }

    const seamSpacing = 18;
    const lineDistance = this.roadLineDistanceMeters();
    const seamOffset = lineDistance % seamSpacing;
    for (let distance = seamSpacing - seamOffset; distance < ROAD_DRAW_DISTANCE; distance += seamSpacing) {
      const point = this.projectRoad(distance);
      const shift = this.laneShift(point.halfWidth);
      renderer.line(
        point.centerX - point.halfWidth + shift,
        point.y,
        point.centerX + point.halfWidth + shift,
        point.y,
        `rgba(5,7,10,${(0.03 + point.depth * 0.11).toFixed(3)})`,
        1 + point.depth * 2
      );
    }

    this.renderLaneMarkers(-1 / 3);
    this.renderLaneMarkers(1 / 3);
    this.renderRoadEdge(-1);
    this.renderRoadEdge(1);
  }

  private renderLaneMarkers(laneFraction: number): void {
    const spacing = 30;
    const dashLength = 12;
    const offset = this.roadLineDistanceMeters() % spacing;

    for (let distance = spacing - offset; distance < ROAD_DRAW_DISTANCE; distance += spacing) {
      const near = this.projectRoad(Math.max(0, distance - dashLength));
      const far = this.projectRoad(distance);
      const nearX = near.centerX + near.halfWidth * laneFraction + this.laneShift(near.halfWidth);
      const farX = far.centerX + far.halfWidth * laneFraction + this.laneShift(far.halfWidth);
      const nearWidth = Math.max(1, near.halfWidth * 0.012);
      const farWidth = Math.max(0.7, far.halfWidth * 0.012);
      this.fillQuad(
        farX - farWidth,
        far.y,
        farX + farWidth,
        far.y,
        nearX + nearWidth,
        near.y,
        nearX - nearWidth,
        near.y,
        `rgba(242,239,216,${(0.32 + near.depth * 0.65).toFixed(3)})`
      );
    }
  }

  private renderRoadEdge(side: -1 | 1): void {
    const stripeSpacing = 12;
    const lineDistance = this.roadLineDistanceMeters();
    const offset = lineDistance % stripeSpacing;
    for (let distance = stripeSpacing - offset; distance < ROAD_DRAW_DISTANCE; distance += stripeSpacing) {
      const near = this.projectRoad(Math.max(0, distance - stripeSpacing * 0.82));
      const far = this.projectRoad(distance);
      const nearX = near.centerX + near.halfWidth * side + this.laneShift(near.halfWidth);
      const farX = far.centerX + far.halfWidth * side + this.laneShift(far.halfWidth);
      const width = Math.max(1, near.halfWidth * 0.018);
      const stripeIndex = Math.floor((distance + lineDistance) / stripeSpacing);
      this.fillQuad(
        farX - width,
        far.y,
        farX + width,
        far.y,
        nearX + width,
        near.y,
        nearX - width,
        near.y,
        stripeIndex % 2 === 0 ? "#e3e0d0" : "#8b253f"
      );
    }
  }

  private renderRoadside(sector: RouteSector): void {
    const { renderer } = this.services;
    const insideTunnel = sector.id === "tunnel";
    const tunnelStart = ROUTE_SECTORS.find((entry) => entry.id === "tunnel")!.startMeters;
    const tunnelEnd = ROUTE_SECTORS.find((entry) => entry.id === "skyline")!.startMeters;
    // Roadside furniture exists only outdoors. Approaching Yomikage, poles and
    // rails stop at the entrance mouth instead of continuing into the bore;
    // inside, only the skyline road visible through the exit aperture carries
    // them again.
    const entranceDistance = tunnelStart - this.state.distanceMeters;
    const cullBeyond =
      !insideTunnel && entranceDistance > 0 ? entranceDistance : Number.POSITIVE_INFINITY;
    const cullBefore = insideTunnel ? tunnelEnd - this.state.distanceMeters : 0;

    const theme = insideTunnel ? SECTOR_THEMES.skyline : SECTOR_THEMES[sector.id];
    const spacing = theme.lampSpacing;
    const offset = this.state.visualDistanceMeters % spacing;
    for (let distance = spacing - offset; distance < ROAD_DRAW_DISTANCE; distance += spacing) {
      if (distance >= cullBeyond || distance < cullBefore) {
        continue;
      }
      const point = this.projectRoad(distance);
      if (point.depth < 0.04) {
        continue;
      }
      const poleHeight = 10 + point.depth * 126;
      const bloomRadius = 1 + point.depth * 8;
      const laneShift = this.laneShift(point.halfWidth);
      for (const side of [-1, 1] as const) {
        const x = point.centerX + side * (point.halfWidth + 18 + point.depth * 22) + laneShift;
        const topY = point.y - poleHeight;
        renderer.line(x, point.y, x, topY, `rgba(94,103,116,${0.45 + point.depth * 0.45})`, 1 + point.depth * 3.5);
        renderer.line(x, topY, x - side * (8 + point.depth * 18), topY, "rgba(102,110,121,0.8)", 1 + point.depth * 2);
        renderer.circle(x - side * (8 + point.depth * 18), topY + 1, bloomRadius, theme.lampGlow);
        renderer.circle(x - side * (8 + point.depth * 18), topY + 1, Math.max(1, bloomRadius * 0.3), theme.lampBulb);
      }
    }

    for (
      let farDistance = ROAD_DRAW_DISTANCE;
      farDistance > 0;
      farDistance -= ROAD_SEGMENT_LENGTH
    ) {
      const nearDistance = Math.max(0, farDistance - ROAD_SEGMENT_LENGTH);
      if (nearDistance >= cullBeyond || farDistance <= cullBefore) {
        continue;
      }
      // Segments straddling a mouth are trimmed to the portal plane.
      const far = this.projectRoad(Math.min(farDistance, cullBeyond));
      const near = this.projectRoad(Math.max(nearDistance, cullBefore));
      for (const side of [-1, 1] as const) {
        const topFar = this.guardrailPoint(far, side, "top");
        const topNear = this.guardrailPoint(near, side, "top");
        const lowerFar = this.guardrailPoint(far, side, "lower");
        const lowerNear = this.guardrailPoint(near, side, "lower");
        renderer.line(topFar.x, topFar.y, topNear.x, topNear.y, "#747984", 2.5);
        renderer.line(lowerFar.x, lowerFar.y, lowerNear.x, lowerNear.y, "#3e424b", 4);
      }
    }
  }

  private renderTraffic(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const visibleVehicles: VisibleRoadVehicle[] = [
      ...this.traffic
        .filter((vehicle) => trafficIsRenderable(vehicle.relativeMeters))
        .map((vehicle) => ({ source: "traffic" as const, vehicle })),
      ...this.rivals
        .filter((vehicle) => rivalIsRenderable(vehicle.relativeMeters))
        .map((vehicle) => ({ source: "rival" as const, vehicle })),
      ...this.remoteRaceVehicles()
        .filter((vehicle) => trafficIsRenderable(vehicle.relativeMeters))
        .map((vehicle) => ({ source: "player" as const, vehicle }))
    ].sort((a, b) => b.vehicle.relativeMeters - a.vehicle.relativeMeters);

    for (const entry of visibleVehicles) {
      const { vehicle } = entry;
      const roadDistance = Math.max(0, vehicle.relativeMeters);
      const point = this.projectRoad(roadDistance);
      const playerLane = LANE_ORDER[this.playerLaneIndex]!;
      const spriteView = trafficSpriteView(vehicle.lane, playerLane);
      const vehicleFrames = entry.source === "player"
        ? this.trafficAssets.reimeiXr
        : this.trafficAssets[entry.vehicle.kind];
      const baseImage =
        spriteView.frame === 0
          ? vehicleFrames.straight
          : vehicleFrames.quarter;
      if (!imageReady(baseImage)) {
        continue;
      }
      const image = entry.source === "player"
        ? tintedReimeiFrame(baseImage, entry.vehicle.mainColor, entry.vehicle.accentColor)
        : baseImage;

      const screenDepth = Math.pow(point.depth, ROAD_PERSPECTIVE_EXP);
      const spriteScale = 0.055 + screenDepth * 0.76;
      const drawWidth = TRAFFIC_FRAME_WIDTH * spriteScale;
      const drawHeight = TRAFFIC_FRAME_HEIGHT * spriteScale;
      const vehicleLaneFraction = entry.vehicle.laneFraction;
      const laneX =
        point.centerX +
        point.halfWidth * vehicleLaneFraction +
        this.laneShift(point.halfWidth);
      const behindOffsetY =
        vehicle.relativeMeters < 0 ? -vehicle.relativeMeters * 4 : 0;
      const drawY =
        point.y -
        TRAFFIC_FRAME_BASELINE_Y * spriteScale +
        behindOffsetY;
      const farFade = clamp((point.depth - 0.01) / 0.12, 0.28, 1);

      ctx.save();
      ctx.globalAlpha = farFade;
      ctx.translate(laneX, 0);
      if (spriteView.mirrored) {
        ctx.scale(-1, 1);
      }
      ctx.drawImage(
        image,
        -drawWidth * 0.5,
        drawY,
        drawWidth,
        drawHeight
      );
      this.renderVehicleBlinker(
        vehicle.laneChange,
        drawWidth,
        drawHeight,
        drawY,
        spriteView.mirrored,
        false
      );
      if (entry.source === "rival" && entry.vehicle.kind === "police" && entry.vehicle.encounterActive) {
        this.renderPoliceSirenGlow(drawWidth, drawHeight, drawY);
      }
      ctx.restore();
      if (entry.source === "player") {
        this.renderPlayerNameplate(
          entry.vehicle.name,
          laneX,
          drawY + drawHeight * 0.35 - 8,
          drawWidth,
          farFade,
          carColorHex(entry.vehicle.accentColor)
        );
      }
    }
  }

  // Alternating red/blue strobe over the interceptor's roof light bar. Called
  // inside the sprite's translated (and possibly mirrored) context; the bar
  // sits at a fixed fraction of the 1024x640 frame in both rear and front
  // views, so one overlay serves the windshield and the mirror.
  private renderPoliceSirenGlow(drawWidth: number, drawHeight: number, drawY: number): void {
    const { ctx } = this.services.renderer;
    const lampY = drawY + drawHeight * 0.314;
    const lampOffsetX = drawWidth * 0.039;
    const redLit = Math.floor(this.elapsed * 5) % 2 === 0;
    const litX = redLit ? -lampOffsetX : lampOffsetX;
    const color = redLit ? "rgba(255,64,48," : "rgba(72,128,255,";
    const lampRadius = Math.max(2.5, drawWidth * 0.028);
    ctx.save();
    const glow = ctx.createRadialGradient(litX, lampY, 0, litX, lampY, lampRadius * 4);
    glow.addColorStop(0, `${color}0.9)`);
    glow.addColorStop(0.45, `${color}0.32)`);
    glow.addColorStop(1, `${color}0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(litX - lampRadius * 4, lampY - lampRadius * 4, lampRadius * 8, lampRadius * 8);
    ctx.restore();
  }

  private remoteRaceVehicles(): Array<RacePlayerSnapshot & { readonly relativeMeters: number }> {
    return this.session.getRemotePlayers().map((player) => ({
      ...player,
      relativeMeters: routeRelativeMeters(this.state.distanceMeters, player.distanceMeters)
    }));
  }

  private authoritativeRivals(): RivalState[] {
    return this.session.getRivals().map(({ distanceMeters, ...rival }) => ({
      ...rival,
      relativeMeters: routeRelativeMeters(this.state.distanceMeters, distanceMeters)
    }));
  }

  private authoritativeTraffic(): TrafficVehicle[] {
    return this.session.getTraffic().map(({ distanceMeters, ...vehicle }) => ({
      ...vehicle,
      relativeMeters: routeRelativeMeters(this.state.distanceMeters, distanceMeters)
    }));
  }

  private renderPlayerNameplate(
    name: string,
    centerX: number,
    baselineY: number,
    carWidth: number,
    alpha: number,
    accent: string,
    compact = false
  ): void {
    const { ctx } = this.services.renderer;
    const fontSize = compact ? Math.max(7, Math.min(10, carWidth * 0.09)) : Math.max(10, Math.min(15, carWidth * 0.07));
    if (fontSize < 7.5 || alpha < 0.34) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `800 ${fontSize}px 'Trebuchet MS', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = Math.min(carWidth * 0.9, ctx.measureText(name).width + (compact ? 8 : 14));
    const height = fontSize + (compact ? 4 : 7);
    ctx.fillStyle = "rgba(2,5,10,0.82)";
    ctx.fillRect(centerX - width * 0.5, baselineY - height * 0.5, width, height);
    ctx.fillStyle = accent;
    ctx.fillRect(centerX - width * 0.5, baselineY + height * 0.5 - 2, width, 2);
    ctx.fillStyle = "#f5f8fb";
    ctx.fillText(name, centerX, baselineY - 1);
    ctx.restore();
  }

  private renderVehicleBlinker(
    intent: LaneChangeIntent | null | undefined,
    drawWidth: number,
    drawHeight: number,
    drawY: number,
    mirrored: boolean,
    frontView: boolean
  ): void {
    if (intent === null || intent === undefined) {
      return;
    }

    const { ctx } = this.services.renderer;
    const lit = laneChangeBlinkerLit(intent);
    const directionSign = intent.direction === "left" ? -1 : 1;
    const localSign = mirrored ? -directionSign : directionSign;
    const baseX = drawWidth * 0.31 * localSign;
    const y = drawY + drawHeight * (frontView ? 0.66 : 0.71);
    const length = Math.max(8, drawWidth * 0.105);
    const halfHeight = Math.max(3, drawHeight * 0.026);
    const startX = baseX;
    const endX = baseX + localSign * length;
    const alpha = lit ? 0.8 : 0.12;

    ctx.save();
    ctx.shadowColor = lit ? "rgba(255,188,70,0.58)" : "rgba(255,161,48,0.12)";
    ctx.shadowBlur = lit ? halfHeight * 2.8 : halfHeight * 0.7;
    ctx.fillStyle = `rgba(255,197,78,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(startX, y - halfHeight);
    ctx.lineTo(startX, y + halfHeight);
    ctx.lineTo(endX, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private renderCockpit(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const dashY = 520;

    ctx.beginPath();
    ctx.moveTo(-20, renderer.height);
    ctx.lineTo(-20, 120);
    ctx.lineTo(80, 250);
    ctx.lineTo(164, dashY + 10);
    ctx.lineTo(260, renderer.height);
    ctx.closePath();
    ctx.fillStyle = "#080a0e";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(renderer.width + 20, renderer.height);
    ctx.lineTo(renderer.width + 20, 120);
    ctx.lineTo(renderer.width - 80, 250);
    ctx.lineTo(renderer.width - 164, dashY + 10);
    ctx.lineTo(renderer.width - 260, renderer.height);
    ctx.closePath();
    ctx.fillStyle = "#080a0e";
    ctx.fill();

    const dashGradient = ctx.createLinearGradient(0, dashY, 0, renderer.height);
    dashGradient.addColorStop(0, "#22252b");
    dashGradient.addColorStop(0.14, "#111318");
    dashGradient.addColorStop(1, "#05070a");
    ctx.beginPath();
    ctx.moveTo(126, renderer.height);
    ctx.lineTo(182, dashY + 24);
    ctx.quadraticCurveTo(renderer.width * 0.5, dashY - 46, renderer.width - 182, dashY + 24);
    ctx.lineTo(renderer.width - 126, renderer.height);
    ctx.closePath();
    ctx.fillStyle = dashGradient;
    ctx.fill();
    ctx.strokeStyle = "rgba(173,185,198,0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const reflection = ctx.createLinearGradient(0, dashY - 30, 0, dashY + 90);
    reflection.addColorStop(0, "rgba(111,165,218,0.11)");
    reflection.addColorStop(0.55, "rgba(239,130,189,0.035)");
    reflection.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = reflection;
    ctx.fillRect(220, dashY - 20, renderer.width - 440, 125);

    // Instrument cluster first, then the wheel on top (semi-transparent) so the
    // two dials nest inside the wheel's gap (between hub and rim) and stay
    // readable through the rim/spokes. No digital gear/speed boxes any more —
    // the gear reads off the shifter knob, the speed off the dial. Gauges are
    // smaller now but keep the same number sizes (fixed fonts in renderGauge).
    this.renderGauge(
      696,
      568,
      64,
      "RPM x1000",
      this.state.rpm / 8000,
      (this.state.rpm / 1000).toFixed(1),
      this.state.revLimiterActive ? "#ff5147" : "#ef8a57",
      ["0", "2", "4", "6", "8"]
    );
    this.renderGauge(
      844,
      568,
      64,
      "KM/H",
      this.state.speedKph / MAX_SPEED_KPH,
      Math.round(this.state.speedKph).toString(),
      "#73cce5",
      ["0", "50", "100", "150", "200", "250", "300", "350"]
    );

    this.renderPedalBank();
    this.renderCockpitButtons();
    this.renderSteeringWheel();

    this.renderCenterConsole();
    this.renderRearViewMirror();
  }

  // The former DOM touch deck, now living on the right cockpit pillar. Taps
  // route through the same virtual keys as the keyboard, so clutch gating and
  // the audio cycle behave identically.
  private renderCockpitButtons(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    for (const button of COCKPIT_TOUCH_BUTTONS) {
      const { x, y, width, height } = button.bounds;
      const pressed = (this.cockpitButtonFlash.get(button.key) ?? 0) > 0;
      const accent =
        button.key === "m"
          ? this.audioMode === "muted"
            ? "#a66e75"
            : this.audioMode === "boosted"
              ? "#d8b46a"
              : "#709c90"
          : button.key === "e"
            ? "#efad58"
            : "#aeb4bb";
      this.roundedRectPath(x, y, width, height, 9);
      ctx.fillStyle = pressed ? "rgba(52,56,61,0.95)" : "rgba(16,19,25,0.92)";
      ctx.fill();
      ctx.strokeStyle = pressed ? accent : "rgba(126,134,144,0.48)";
      ctx.lineWidth = 2;
      ctx.stroke();
      renderer.text(button.label, x + width * 0.5, y + height * 0.5 + 4, {
        align: "center",
        color: pressed ? "#f5f8fb" : accent,
        font: "bold 11px Consolas"
      });
    }
  }

  private renderRearViewMirror(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const mirrorX = renderer.width * 0.5 - REAR_VIEW_MIRROR_WIDTH * 0.5;
    const mirrorY = 38;
    const inner: RectBounds = {
      x: mirrorX + REAR_VIEW_MIRROR_INSET,
      y: mirrorY + REAR_VIEW_MIRROR_INSET,
      width: REAR_VIEW_MIRROR_WIDTH - REAR_VIEW_MIRROR_INSET * 2,
      height: REAR_VIEW_MIRROR_HEIGHT - REAR_VIEW_MIRROR_INSET * 2
    };

    ctx.save();

    // Mount and stem.
    ctx.beginPath();
    ctx.moveTo(renderer.width * 0.5 - 20, 10);
    ctx.lineTo(renderer.width * 0.5 + 20, 10);
    ctx.lineTo(renderer.width * 0.5 + 10, mirrorY + 5);
    ctx.lineTo(renderer.width * 0.5 - 10, mirrorY + 5);
    ctx.closePath();
    ctx.fillStyle = "#06080c";
    ctx.fill();
    ctx.strokeStyle = "#2e333b";
    ctx.lineWidth = 2;
    ctx.stroke();

    this.roundedRectPath(mirrorX - 7, mirrorY - 6, REAR_VIEW_MIRROR_WIDTH + 14, REAR_VIEW_MIRROR_HEIGHT + 12, 24);
    ctx.fillStyle = "#05070b";
    ctx.fill();
    ctx.strokeStyle = "#373c45";
    ctx.lineWidth = 3;
    ctx.stroke();

    this.roundedRectPath(mirrorX, mirrorY, REAR_VIEW_MIRROR_WIDTH, REAR_VIEW_MIRROR_HEIGHT, 19);
    ctx.fillStyle = "#10131a";
    ctx.fill();

    ctx.save();
    this.roundedRectPath(inner.x, inner.y, inner.width, inner.height, 14);
    ctx.clip();
    this.renderRearViewMirrorScene(inner);
    ctx.restore();

    const glass = ctx.createLinearGradient(inner.x, inner.y, inner.x, inner.y + inner.height);
    glass.addColorStop(0, "rgba(191,222,255,0.20)");
    glass.addColorStop(0.36, "rgba(95,139,181,0.05)");
    glass.addColorStop(1, "rgba(0,0,0,0.18)");
    this.roundedRectPath(inner.x, inner.y, inner.width, inner.height, 14);
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = "rgba(196,216,236,0.26)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  private renderRearViewMirrorScene(bounds: RectBounds): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const centerX = bounds.x + bounds.width * 0.5;
    const horizonY = bounds.y + bounds.height * 0.38;
    const bottomY = bounds.y + bounds.height + 8;
    const farHalfWidth = 36;
    const nearHalfWidth = bounds.width * 0.58;
    const playerLane = LANE_ORDER[this.playerLaneIndex]!;
    const playerLaneFraction = laneRoadFraction(playerLane);

    const sky = ctx.createLinearGradient(0, bounds.y, 0, bounds.y + bounds.height);
    sky.addColorStop(0, "#09111f");
    sky.addColorStop(0.42, "#121a29");
    sky.addColorStop(1, "#07090e");
    ctx.fillStyle = sky;
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

    // Distant city/light band reflected in the mirror.
    ctx.fillStyle = "rgba(93,134,184,0.16)";
    ctx.fillRect(bounds.x, horizonY - 8, bounds.width, 11);
    for (let index = 0; index < 28; index += 1) {
      const x = bounds.x + ((index * 47 + Math.floor(this.state.visualDistanceMeters * 0.2)) % Math.floor(bounds.width + 36)) - 18;
      const y = horizonY - 10 + (index % 3) * 3;
      renderer.rect(x, y, 2, 2, index % 5 === 0 ? "rgba(239,160,104,0.7)" : "rgba(137,183,224,0.55)");
    }

    this.fillQuad(
      centerX - farHalfWidth,
      horizonY,
      centerX + farHalfWidth,
      horizonY,
      centerX + nearHalfWidth,
      bottomY,
      centerX - nearHalfWidth,
      bottomY,
      "#151920"
    );

    for (const boundaryFraction of [-1, -1 / 3, 1 / 3, 1] as const) {
      const relativeFraction = boundaryFraction - playerLaneFraction;
      const alpha = Math.abs(boundaryFraction) === 1 ? 0.34 : 0.55;
      renderer.line(
        centerX + farHalfWidth * relativeFraction,
        horizonY,
        centerX + nearHalfWidth * relativeFraction,
        bottomY,
        `rgba(220,224,214,${alpha})`,
        Math.abs(boundaryFraction) === 1 ? 1.5 : 1
      );
    }

    const visibleVehicles: VisibleRoadVehicle[] = [
      ...this.traffic
        .filter((vehicle) => trafficIsRearViewRenderable(vehicle.relativeMeters))
        .map((vehicle) => ({ source: "traffic" as const, vehicle })),
      ...this.rivals
        .filter((vehicle) => rivalIsRearViewRenderable(vehicle.relativeMeters))
        .map((vehicle) => ({ source: "rival" as const, vehicle })),
      ...this.remoteRaceVehicles()
        .filter((vehicle) => trafficIsRearViewRenderable(vehicle.relativeMeters))
        .map((vehicle) => ({ source: "player" as const, vehicle }))
    ].sort((a, b) => a.vehicle.relativeMeters - b.vehicle.relativeMeters);

    for (const entry of visibleVehicles) {
      const { vehicle } = entry;
      const distanceBehind = -vehicle.relativeMeters;
      const depth = 1 - clamp(distanceBehind / TRAFFIC_REARVIEW_RENDER_BEHIND_METERS, 0, 1);
      const screenDepth = Math.pow(depth, 1.45);
      const groundY = horizonY + 8 + screenDepth * (bounds.height - 18);
      const halfWidth = farHalfWidth + screenDepth * (nearHalfWidth - farHalfWidth);
      const vehicleLaneFraction = entry.vehicle.laneFraction;
      const laneDelta = vehicleLaneFraction - playerLaneFraction;
      const laneX = centerX + halfWidth * laneDelta;
      const spriteView = rearViewTrafficSpriteView(vehicle.lane, playerLane);
      const vehicleFrames = entry.source === "player"
        ? this.trafficAssets.reimeiXr
        : this.trafficAssets[entry.vehicle.kind];
      const baseImage =
        spriteView.frame === 0
          ? vehicleFrames.frontStraight
          : vehicleFrames.frontQuarter;
      if (!imageReady(baseImage)) {
        continue;
      }
      const image = entry.source === "player"
        ? tintedReimeiFrame(baseImage, entry.vehicle.mainColor, entry.vehicle.accentColor)
        : baseImage;

      const spriteScale = 0.018 + screenDepth * 0.084;
      const drawWidth = TRAFFIC_FRAME_WIDTH * spriteScale;
      const drawHeight = TRAFFIC_FRAME_HEIGHT * spriteScale;
      const drawY = groundY - TRAFFIC_FRAME_BASELINE_Y * spriteScale;
      const alpha = clamp(0.34 + screenDepth * 0.72, 0.34, 1);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(laneX, 0);
      if (spriteView.mirrored) {
        ctx.scale(-1, 1);
      }
      ctx.drawImage(
        image,
        -drawWidth * 0.5,
        drawY,
        drawWidth,
        drawHeight
      );
      this.renderVehicleBlinker(
        vehicle.laneChange,
        drawWidth,
        drawHeight,
        drawY,
        spriteView.mirrored,
        true
      );
      if (entry.source === "rival" && entry.vehicle.kind === "police" && entry.vehicle.encounterActive) {
        this.renderPoliceSirenGlow(drawWidth, drawHeight, drawY);
      }
      ctx.restore();
      if (entry.source === "player") {
        this.renderPlayerNameplate(
          entry.vehicle.name,
          laneX,
          drawY + drawHeight * 0.32 - 2,
          drawWidth,
          alpha,
          carColorHex(entry.vehicle.accentColor),
          true
        );
      }
    }

    // The local car is out of frame in cockpit view, so its two rear-wheel
    // smoke streams appear where the driver can actually see them: reflected
    // along the mirror's near edge, over any following vehicle.
    this.renderBurnoutMirrorSmoke(bounds, centerX, bottomY);
  }

  private renderBurnoutMirrorSmoke(
    bounds: RectBounds,
    centerX: number,
    bottomY: number
  ): void {
    const intensity = burnoutIntensity(this.burnout);
    if (intensity <= 0) {
      return;
    }

    drawBurnoutSmokeSprite(
      this.services.renderer.ctx,
      {
        intensity,
        elapsedSeconds: this.burnout.elapsedSeconds,
        sequence: this.burnout.sequence
      },
      {
        leftWheelX: centerX - bounds.width * 0.105,
        rightWheelX: centerX + bounds.width * 0.105,
        groundY: bottomY
      }
    );
  }

  // The full wheel: a complete rim + three spokes so it reads correctly at any
  // steer angle, with the two side arms opened to ~170° (nearly horizontal) to
  // free up the view through the top. The hub carries an original fictional
  // marque emblem (Kurohama Motors — a bayshore chevron), not a real badge.
  // Drawn on top of the gauges at half opacity so the dials stay visible through
  // the rim/spokes while the wheel still reads as being in front.
  private renderSteeringWheel(): void {
    const { ctx } = this.services.renderer;
    const wobble = Math.sin(this.elapsed * 21) * clamp(this.state.speedKph / MAX_SPEED_KPH, 0, 1) * 0.004;

    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.translate(STEERING_WHEEL_CENTER_X, STEERING_WHEEL_CENTER_Y);
    ctx.rotate(this.steeringAngle + wobble);

    const rimRadius = STEERING_WHEEL_RADIUS;
    ctx.beginPath();
    ctx.arc(0, 0, rimRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "#08090c";
    ctx.lineWidth = 30;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, rimRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "#34373d";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, rimRadius - 13, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120,128,140,0.18)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Two side arms drooped ~0.08 rad below horizontal (≈170° apart) + a bottom arm.
    const spokeReach = rimRadius - 8;
    const droop = 0.08;
    const arms: ReadonlyArray<readonly [number, number]> = [
      [Math.cos(Math.PI - droop) * spokeReach, Math.sin(Math.PI - droop) * spokeReach],
      [Math.cos(droop) * spokeReach, Math.sin(droop) * spokeReach],
      [0, spokeReach]
    ];
    ctx.lineCap = "round";
    for (const [ax, ay] of arms) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(ax, ay);
      ctx.strokeStyle = "#111318";
      ctx.lineWidth = 26;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(ax, ay);
      ctx.strokeStyle = "#2b2e35";
      ctx.lineWidth = 9;
      ctx.stroke();
    }

    // Hub + emblem.
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, Math.PI * 2);
    ctx.fillStyle = "#0e1015";
    ctx.fill();
    ctx.strokeStyle = "#4a4e56";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.strokeStyle = "#c7ccd2";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 27, 0, Math.PI * 2);
    ctx.fillStyle = "#0b1420";
    ctx.fill();
    // Bayshore chevron (speed) over a bar (the wangan) — original marque mark.
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-14, 3);
    ctx.lineTo(0, -12);
    ctx.lineTo(14, 3);
    ctx.strokeStyle = "#e8a24a";
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-13, 13);
    ctx.lineTo(13, 13);
    ctx.strokeStyle = "rgba(199,204,210,0.75)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }

  private renderPedalBank(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const pressureByKey: Readonly<Record<"c" | "s" | "w", number>> = {
      c: this.state.clutchPressure,
      s: this.state.brakePressure,
      w: this.state.throttle
    };

    // A recessed footwell on the passenger-side edge of the right-hand-drive
    // cockpit gives the three large controls their own touch-safe territory.
    this.roundedRectPath(968, 580, 264, 140, 18);
    const footwell = ctx.createLinearGradient(0, 580, 0, 720);
    footwell.addColorStop(0, "rgba(18,21,26,0.96)");
    footwell.addColorStop(1, "rgba(2,3,5,0.99)");
    ctx.fillStyle = footwell;
    ctx.fill();
    ctx.strokeStyle = "rgba(104,112,122,0.32)";
    ctx.lineWidth = 2;
    ctx.stroke();
    renderer.text("DRIVER PEDALS", 1100, 595, {
      align: "center",
      color: "rgba(160,171,184,0.66)",
      font: "bold 9px Consolas"
    });

    for (const pedal of PEDAL_CONTROLS) {
      const pressure = clamp(pressureByKey[pedal.key], 0, 1);
      const { x, y, width, height } = pedal.bounds;
      const travel = pressure * 10;
      const accent =
        pedal.key === "c" ? "#d7d9dc" : pedal.key === "s" ? "#77cfe8" : "#efad58";
      renderer.line(x + width * 0.5, y - 17, x + width * 0.5, y + 8, "#30343a", 9);
      ctx.save();
      ctx.shadowColor = pressure > 0.08 ? accent : "transparent";
      ctx.shadowBlur = pressure * 13;
      this.roundedRectPath(x, y + travel, width, height - travel, 8);
      ctx.fillStyle = pressure > 0.08 ? "#34383d" : "#24272c";
      ctx.fill();
      ctx.strokeStyle = pressure > 0.08 ? accent : "#747a82";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      for (let groove = 0; groove < 4; groove += 1) {
        renderer.line(
          x + 12,
          y + 20 + travel + groove * 13,
          x + width - 12,
          y + 20 + travel + groove * 13,
          pressure > 0.08 ? "rgba(235,240,244,0.52)" : "rgba(138,145,153,0.42)",
          2
        );
      }
      renderer.text(pedal.label, x + width * 0.5, y + height - 8 + travel * 0.2, {
        align: "center",
        color: pressure > 0.08 ? accent : "#aeb4bb",
        font: "bold 9px Consolas"
      });
    }
  }

  private renderDashboardBlinker(direction: LaneChangeDirection, x: number, y: number): void {
    const { ctx } = this.services.renderer;
    const active = this.playerLaneChange?.direction === direction;
    const lit = active && laneChangeBlinkerLit(this.playerLaneChange);
    const sign = direction === "left" ? -1 : 1;

    ctx.save();
    ctx.shadowColor = lit ? "rgba(255,190,72,0.95)" : "transparent";
    ctx.shadowBlur = lit ? 10 : 0;
    ctx.fillStyle = lit
      ? "rgba(255,196,76,0.98)"
      : active
        ? "rgba(125,82,34,0.7)"
        : "rgba(32,36,42,0.96)";
    ctx.strokeStyle = active ? "rgba(255,190,72,0.6)" : "rgba(96,103,112,0.36)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + sign * 12, y);
    ctx.lineTo(x - sign * 4, y - 9);
    ctx.lineTo(x - sign * 4, y + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private renderCenterConsole(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;

    // Navigation/signal stack hugs the left canvas border in a bezel barely
    // wider than the GPS itself; the space it gave up belongs to the enlarged
    // shifter pedestal. Only the blinkers and a slim status-light row remain.
    ctx.beginPath();
    ctx.moveTo(10, 552);
    ctx.lineTo(240, 558);
    ctx.lineTo(254, 720);
    ctx.lineTo(4, 720);
    ctx.closePath();
    ctx.fillStyle = "#0b0d11";
    ctx.fill();
    ctx.strokeStyle = "#30343b";
    ctx.lineWidth = 2;
    ctx.stroke();

    this.renderRouteGps(18, 568, 210, 72);
    for (let index = 0; index < 4; index += 1) {
      renderer.circle(93 + index * 20, 656, 5, index === 0 ? "#8f432f" : "#20242a");
      renderer.circle(93 + index * 20, 656, 2, index === 0 ? "#ef845a" : "#6d747d");
    }
    this.renderDashboardBlinker("left", 40, 656);
    this.renderDashboardBlinker("right", 206, 656);

    // Large isolated six-speed plate. The engraved numbers remain readable
    // around the knob and the neutral crossbar is deliberately unmistakable.
    this.roundedRectPath(
      SHIFTER_PLATE_BOUNDS.x,
      SHIFTER_PLATE_BOUNDS.y,
      SHIFTER_PLATE_BOUNDS.width,
      SHIFTER_PLATE_BOUNDS.height,
      18
    );
    const plate = ctx.createLinearGradient(0, SHIFTER_PLATE_BOUNDS.y, 0, 720);
    plate.addColorStop(0, "#1d2025");
    plate.addColorStop(1, "#090b0e");
    ctx.fillStyle = plate;
    ctx.fill();
    ctx.strokeStyle = "rgba(131,139,149,0.58)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    renderer.text("6MT  //  CLUTCH", SHIFTER_PLATE_CENTER_X, SHIFTER_PLATE_BOUNDS.y + 18, {
      align: "center",
      color: this.services.input.isDown("c") ? "#f0b968" : "#89929c",
      font: "bold 10px Consolas"
    });

    const gateShadow = "rgba(0,0,0,0.78)";
    const gateMetal = "rgba(151,159,169,0.68)";
    for (const columnX of H_SHIFTER_LAYOUT.columns) {
      renderer.line(columnX, H_SHIFTER_LAYOUT.topY, columnX, H_SHIFTER_LAYOUT.bottomY, gateShadow, 9);
      renderer.line(columnX, H_SHIFTER_LAYOUT.topY, columnX, H_SHIFTER_LAYOUT.bottomY, gateMetal, 3);
    }
    renderer.line(
      H_SHIFTER_LAYOUT.columns[0],
      H_SHIFTER_LAYOUT.neutralY,
      H_SHIFTER_LAYOUT.columns[2],
      H_SHIFTER_LAYOUT.neutralY,
      gateShadow,
      9
    );
    renderer.line(
      H_SHIFTER_LAYOUT.columns[0],
      H_SHIFTER_LAYOUT.neutralY,
      H_SHIFTER_LAYOUT.columns[2],
      H_SHIFTER_LAYOUT.neutralY,
      gateMetal,
      3
    );

    for (let gear = 1; gear <= MAX_GEAR; gear += 1) {
      const gate = shifterGatePoint(gear, H_SHIFTER_LAYOUT);
      const isCandidate = this.shifterCandidateGear === gear;
      if (isCandidate) {
        renderer.circle(gate.x, gate.y, 17, "rgba(239,173,88,0.22)");
      }
    }

    ctx.beginPath();
    ctx.ellipse(SHIFTER_PLATE_CENTER_X, 712, 62, 22, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#111318";
    ctx.fill();
    ctx.strokeStyle = "#454951";
    ctx.lineWidth = 3;
    ctx.stroke();
    renderer.line(SHIFTER_PLATE_CENTER_X, 704, this.shifter.x, this.shifter.y + 5, "#747a82", 12);
    ctx.beginPath();
    ctx.ellipse(this.shifter.x, this.shifter.y, 30, 23, -0.18, 0, Math.PI * 2);
    ctx.fillStyle = this.shifterPointerId !== null ? "#30271e" : "#1b1d21";
    ctx.fill();
    ctx.strokeStyle = this.shifterPointerId !== null ? "#efad58" : "#737880";
    ctx.lineWidth = 3;
    ctx.stroke();
    renderer.text(
      this.shifterPointerId !== null && this.shifterCandidateGear === null
        ? "N"
        : (this.shifterCandidateGear ?? this.state.gear).toString(),
      this.shifter.x,
      this.shifter.y + 5,
      {
      align: "center",
      color: "#e1e5e9",
      font: "bold 16px Consolas"
      }
    );

    // Engraving is the final layer so the stick shaft/boot never erases the
    // map. The occupied gate reads from the larger number on the knob itself.
    const knobGear =
      this.shifterPointerId === null ? this.state.gear : this.shifterCandidateGear;
    for (let gear = 1; gear <= MAX_GEAR; gear += 1) {
      if (gear === knobGear) continue;
      const gate = shifterGatePoint(gear, H_SHIFTER_LAYOUT);
      renderer.text(
        gear.toString(),
        gate.x,
        gear % 2 === 1 ? H_SHIFTER_LAYOUT.topY - 12 : H_SHIFTER_LAYOUT.bottomY + 20,
        {
          align: "center",
          color: this.shifterCandidateGear === gear ? "#ffc373" : "#e0e4e8",
          font: "bold 16px Consolas"
        }
      );
    }
    renderer.text("N", SHIFTER_PLATE_CENTER_X, H_SHIFTER_LAYOUT.neutralY + 4, {
      align: "center",
      color: "rgba(222,227,232,0.72)",
      font: "bold 10px Consolas"
    });
  }

  private renderRouteGps(x: number, y: number, width: number, height: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const position = routeMapPositionAt(this.state.distanceMeters);
    const mapX = x + 8;
    const mapY = y + 15;
    const mapWidth = width - 16;
    const mapHeight = height - 20;

    renderer.rect(x, y, width, height, "#050b0d");
    renderer.strokeRect(x, y, width, height, "#3e5960", 1.5);
    renderer.text(`REIMEI XR // ${position.sector.label.toUpperCase()}`, x + width * 0.5, y + 10, {
      align: "center",
      color: position.sector.accent,
      font: "bold 8px Consolas"
    });

    for (let grid = 1; grid < 4; grid += 1) {
      const gridX = mapX + (mapWidth * grid) / 4;
      const gridY = mapY + (mapHeight * grid) / 4;
      renderer.line(gridX, mapY, gridX, mapY + mapHeight, "rgba(73,120,124,0.11)", 1);
      renderer.line(mapX, gridY, mapX + mapWidth, gridY, "rgba(73,120,124,0.11)", 1);
    }

    for (const sector of ROUTE_SECTORS) {
      const path = ROUTE_MAP_SECTOR_PATHS[sector.id];
      ctx.beginPath();
      path.forEach((point, index) => {
        const px = mapX + point.x * mapWidth;
        const py = mapY + point.y * mapHeight;
        if (index === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      ctx.strokeStyle = sector.id === position.sector.id ? sector.accent : "rgba(91,126,132,0.48)";
      ctx.lineWidth = sector.id === position.sector.id ? 2.6 : 1.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    const playerX = mapX + position.x * mapWidth;
    const playerY = mapY + position.y * mapHeight;
    renderer.circle(playerX, playerY, 5.5, "rgba(255,255,255,0.16)");
    renderer.circle(playerX, playerY, 2.7, "#f5fbff");
    renderer.circle(playerX, playerY, 1.1, position.sector.accent);
  }

  private renderGauge(
    x: number,
    y: number,
    radius: number,
    label: string,
    normalizedValue: number,
    displayValue: string,
    accent: string,
    numericLabels: readonly string[]
  ): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const value = clamp(normalizedValue, 0, 1);
    const startAngle = Math.PI * 0.76;
    const endAngle = Math.PI * 2.24;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#07090c";
    ctx.fill();
    ctx.strokeStyle = "#454a53";
    ctx.lineWidth = 4;
    ctx.stroke();

    for (let index = 0; index <= 10; index += 1) {
      const angle = startAngle + (endAngle - startAngle) * (index / 10);
      const inner = radius - (index % 5 === 0 ? 16 : 10);
      renderer.line(
        x + Math.cos(angle) * inner,
        y + Math.sin(angle) * inner,
        x + Math.cos(angle) * (radius - 5),
        y + Math.sin(angle) * (radius - 5),
        index >= 8 ? "#d45b5b" : "#9aa1a8",
        index % 5 === 0 ? 2 : 1
      );
    }

    for (let index = 0; index < numericLabels.length; index += 1) {
      const ratio = numericLabels.length <= 1 ? 0 : index / (numericLabels.length - 1);
      const angle = startAngle + (endAngle - startAngle) * ratio;
      const labelRadius = radius - 30;
      renderer.text(
        numericLabels[index] ?? "",
        x + Math.cos(angle) * labelRadius,
        y + Math.sin(angle) * labelRadius + 4,
        {
          align: "center",
          color: "#a5adb4",
          font: numericLabels.length > 5 ? "bold 12px Consolas" : "bold 14px Consolas"
        }
      );
    }

    const needleAngle = startAngle + (endAngle - startAngle) * value;
    renderer.line(x, y, x + Math.cos(needleAngle) * (radius - 20), y + Math.sin(needleAngle) * (radius - 20), accent, 3.5);
    renderer.circle(x, y, 8, "#b9bfc5");
    renderer.circle(x, y, 3, "#25282d");
    renderer.text(displayValue, x, y + 36, {
      align: "center",
      color: "#f0f1eb",
      font: "bold 30px Consolas"
    });
    renderer.text(label, x, y + 57, {
      align: "center",
      color: "#8b949d",
      font: "bold 12px Consolas"
    });
  }

  private renderHud(sector: RouteSector): void {
    const { renderer } = this.services;
    const exit = this.exitButtonBounds();

    renderer.rect(exit.x, exit.y, exit.width, exit.height, "rgba(12,16,23,0.82)");
    renderer.strokeRect(exit.x, exit.y, exit.width, exit.height, "rgba(196,216,236,0.42)", 1);
    renderer.text("EXIT", exit.x + exit.width * 0.5, exit.y + 18, {
      align: "center",
      color: "#b9c7d7",
      font: "bold 12px Consolas"
    });

    renderer.text(
      `${this.playerProfile.name.toUpperCase()} // REIMEI XR · NATURAL ${NATURAL_TOP_SPEED_KPH} · BOOST ${MAX_SPEED_KPH}`,
      30,
      82,
      {
        color: "#7e90a5",
        font: "11px Consolas"
      }
    );
    renderer.text(audioModeLabel(this.audioMode), renderer.width - 30, 82, {
      align: "right",
      color: this.audioMode === "muted" ? "#a66e75" : this.audioMode === "boosted" ? "#d8b46a" : "#709c90",
      font: "11px Consolas"
    });
    const sessionStatus = this.session.getStatus();
    renderer.text(
      sessionStatus.connection === "connected"
        ? `GLOBAL SESSION ${sessionStatus.playerCount}/${sessionStatus.capacity}`
        : "GLOBAL SESSION // RECONNECTING",
      renderer.width - 30,
      100,
      {
        align: "right",
        color: sessionStatus.connection === "connected" ? "#72d5b6" : "#e5b66c",
        font: "bold 10px Consolas"
      }
    );
    if (this.playerDraft.active) {
      const boostPercent = Math.round((this.playerDraft.powerMultiplier - 1) * 100);
      const chipX = renderer.width - 170;
      const chipY = 146;
      const chipWidth = 140;
      const color = "#73e5c2";
      renderer.rect(chipX, chipY, chipWidth, 30, "rgba(11,58,51,0.72)");
      renderer.strokeRect(chipX, chipY, chipWidth, 30, "rgba(115,229,194,0.72)", 1);
      renderer.rect(chipX + 9, chipY + 22, (chipWidth - 18) * this.playerDraft.boostRatio, 3, color);
      renderer.text(`DRAFT +${boostPercent}%`, chipX + chipWidth * 0.5, chipY + 17, {
        align: "center",
        color,
        font: "bold 11px Consolas"
      });
    }
    if (this.playerPush.active) {
      const pushPercent = Math.round((this.playerPush.powerMultiplier - 1) * 100);
      const chipX = renderer.width - 170;
      const chipY = this.playerDraft.active ? 182 : 146;
      const chipWidth = 140;
      const color = "#e5c873";
      renderer.rect(chipX, chipY, chipWidth, 30, "rgba(58,44,11,0.72)");
      renderer.strokeRect(chipX, chipY, chipWidth, 30, "rgba(229,200,115,0.72)", 1);
      renderer.rect(chipX + 9, chipY + 22, (chipWidth - 18) * this.playerPush.pushRatio, 3, color);
      renderer.text(`PUSH +${pushPercent}%`, chipX + chipWidth * 0.5, chipY + 17, {
        align: "center",
        color,
        font: "bold 11px Consolas"
      });
    }

    if (this.sectorFlash > 0) {
      const alpha = clamp(this.sectorFlash / 1.2, 0, 1);
      renderer.text(sector.label.toUpperCase(), renderer.width * 0.5, 176, {
        align: "center",
        color: `rgba(240,238,218,${alpha.toFixed(3)})`,
        font: "bold 28px Trebuchet MS"
      });
    }

    if (this.shiftFlash > 0) {
      const alpha = clamp(this.shiftFlash / 0.35, 0, 1);
      const suffix = this.state.gear === 1 ? "ST" : this.state.gear === 2 ? "ND" : this.state.gear === 3 ? "RD" : "TH";
      renderer.text(`${this.state.gear}${suffix}`, renderer.width * 0.5, 224, {
        align: "center",
        color: `rgba(255,205,125,${alpha.toFixed(3)})`,
        font: "bold 21px Consolas"
      });
    }

    if (this.state.revLimiterActive) {
      const pulse = 0.55 + Math.sin(this.elapsed * 52) * 0.35;
      renderer.text(this.state.gear < MAX_GEAR ? "REV LIMITER // CLUTCH [C] + SHIFT [E]" : "REV LIMITER // TOP GEAR", renderer.width * 0.5, 254, {
        align: "center",
        color: `rgba(255,92,78,${pulse.toFixed(3)})`,
        font: "bold 16px Consolas"
      });
    }

    if (this.clutchWarning > 0) {
      const alpha = clamp(this.clutchWarning / 0.5, 0, 1);
      renderer.text("SHIFT BLOCKED // PRESS CLUTCH [C]", renderer.width * 0.5, 282, {
        align: "center",
        color: `rgba(255,183,84,${alpha.toFixed(3)})`,
        font: "bold 14px Consolas"
      });
    }

    if (this.showStartHint) {
      const alpha = 0.55 + Math.sin(this.elapsed * 4) * 0.24;
      renderer.text("W GAS   //   S BRAKE   //   C CLUTCH", renderer.width * 0.5, 468, {
        align: "center",
        color: `rgba(255,232,184,${alpha.toFixed(3)})`,
        font: "bold 16px Trebuchet MS"
      });
      renderer.text("C + Q / E OR C + DRAG STICK TO SHIFT   //   A / D OR DRAG WHEEL", renderer.width * 0.5, 490, {
        align: "center",
        color: "#9bb2c8",
        font: "12px Consolas"
      });
    }
  }

  private exitButtonBounds(): RectBounds {
    const { renderer } = this.services;
    return {
      x: renderer.width - EXIT_BUTTON_MARGIN - EXIT_BUTTON_WIDTH,
      y: 112,
      width: EXIT_BUTTON_WIDTH,
      height: EXIT_BUTTON_HEIGHT
    };
  }

  private canvasPoint(event: PointerEvent): Point2D | null {
    const { renderer } = this.services;
    const bounds = renderer.ctx.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: (event.clientX - bounds.left) * (renderer.width / bounds.width),
      y: (event.clientY - bounds.top) * (renderer.height / bounds.height)
    };
  }

  private pointInBounds(x: number, y: number, bounds: RectBounds): boolean {
    return (
      x >= bounds.x &&
      x <= bounds.x + bounds.width &&
      y >= bounds.y &&
      y <= bounds.y + bounds.height
    );
  }

  private guardrailPoint(
    point: RoadProjection,
    side: -1 | 1,
    rail: "top" | "lower"
  ): Point2D {
    const shift = this.laneShift(point.halfWidth);
    const lateralOffset =
      rail === "top"
        ? point.halfWidth + 9 + point.depth * 31
        : point.halfWidth + 12 + point.depth * 36;
    const yOffset =
      rail === "top"
        ? -2 - point.depth * 36
        : 2 - point.depth * 10;
    return {
      x: point.centerX + side * lateralOffset + shift,
      y: point.y + yOffset
    };
  }

  private renderVignette(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const vignette = ctx.createRadialGradient(
      renderer.width * 0.5,
      renderer.height * 0.45,
      renderer.height * 0.24,
      renderer.width * 0.5,
      renderer.height * 0.45,
      renderer.width * 0.7
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.72, "rgba(0,0,0,0.08)");
    vignette.addColorStop(1, "rgba(0,0,0,0.68)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    for (let y = 0; y < renderer.height; y += 4) {
      renderer.rect(0, y, renderer.width, 1, "rgba(0,0,0,0.035)");
    }
  }

  // Lateral screen shift (px) that keeps the cockpit centered while the world
  // slides so the player's current lane sits under the wheel. Perspective-correct:
  // the offset scales with the road half-width at that depth, exactly like any
  // other road-space lateral position, so the road pans without bowing.
  private laneShift(halfWidth: number): number {
    return -halfWidth * this.playerLaneOffset;
  }

  private roadLineDistanceMeters(): number {
    return this.state.visualDistanceMeters * ROAD_LINE_SCROLL_MULTIPLIER;
  }

  private laneChangeVisualFraction(intent: LaneChangeIntent): number {
    return (
      laneRoadFraction(intent.fromLane) +
      (laneRoadFraction(intent.targetLane) - laneRoadFraction(intent.fromLane)) *
        laneChangeProgress(intent)
    );
  }

  private projectRoad(distanceAhead: number): RoadProjection {
    const distance = clamp(distanceAhead, 0, ROAD_DRAW_DISTANCE);
    const depth = 1 - distance / ROAD_DRAW_DISTANCE;
    const distanceRatio = distance / ROAD_DRAW_DISTANCE;
    const speedFov = 1 + clamp((this.state.speedKph - 80) / 182, 0, 1) * 0.07;
    const screenDepth = Math.pow(depth, ROAD_PERSPECTIVE_EXP);
    const worldDistance = (this.state.distanceMeters + distance) % ROUTE_LENGTH_METERS;
    const routeProgress = routeProgressAt(worldDistance);
    const profile = roadVisualProfileAt(worldDistance);
    const curveWeight = smoothstep(distanceRatio);
    const curveWave =
      Math.sin(routeProgress * Math.PI * 2 * profile.curveFrequency + profile.curvePhase) *
      profile.curveAmplitude;
    const curveOffset = (profile.curveBias + curveWave) * curveWeight;
    return {
      centerX: this.services.renderer.width * 0.5 + curveOffset,
      y: HORIZON_Y + screenDepth * (ROAD_BOTTOM_Y - HORIZON_Y),
      halfWidth: (ROAD_FAR_HALF_WIDTH + screenDepth * (ROAD_NEAR_HALF_WIDTH - ROAD_FAR_HALF_WIDTH)) * speedFov,
      depth
    };
  }

  private roundedRectPath(x: number, y: number, width: number, height: number, radius: number): void {
    const { ctx } = this.services.renderer;
    const r = Math.min(radius, width * 0.5, height * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private fillQuad(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    x4: number,
    y4: number,
    color: string | CanvasGradient
  ): void {
    const { ctx } = this.services.renderer;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
}
