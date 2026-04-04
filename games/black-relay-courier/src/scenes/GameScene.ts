import { SeededRng, type Scene } from "@playloom/engine-core";
import { SynthAudio } from "@playloom/engine-audio";
import { ActionMap, type ActionBindings } from "@playloom/engine-input";
import { drawBar, drawPanel, drawTextBlock, wrapTextLines } from "@playloom/engine-renderer-canvas";
import { CockpitAudio } from "../audio/CockpitAudio";
import { VoidCreditsMusic } from "../audio/VoidCreditsMusic";
import {
  cycleAudioMixMode,
  getAudioMixMode,
  getAudioMixProfile,
  type AudioMixMode
} from "../audioMix";
import type { AppServices } from "../context";
import {
  CERTIFICATION_BANDS,
  DEFAULT_SINGULARITY_SSI,
  MAX_SSI,
  SSI_EFFECT_CEILING,
  clamp,
  computeStrain,
  getSpeedState,
  normalizeSingularityThreshold,
  isWithinBand,
  rollSingularityThreshold,
  stepFlightModel,
  updateHoldProgress,
  type CertificationBand
} from "../flightModel";
import {
  cargoCapacityFromParts,
  cargoEntriesFromManifest,
  cargoFreeCapacity,
  cargoManifestFromEntries,
  cargoQuantity,
  cargoUsedCapacity,
  marketProfileFor,
  marketQuotesFor,
  workshopProfileFor,
  workshopPartsFor,
  type MarketQuote
} from "../economyData";
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
import {
  FIRST_QUEST,
  FIRST_QUEST_COMPLETE,
  FIRST_QUEST_INTRO,
  type RadioTransmission
} from "../questData";
import {
  NAV_CONTACTS,
  type NavContact,
  type OrbitCaptureBand,
  type TravelDestination,
  type TravelDestinationService
} from "../navData";
import {
  routeWonderById,
  travelRouteFor,
  type RouteWonderDefinition,
  type RouteWonderId,
  type TravelRouteProfile
} from "../routeData";
import {
  type CourierSavePayload,
  getSaveArchiveSummary,
  writeSaveSlot,
  type CourierSaveData,
  type ManualSaveSlotId,
  type SaveArchiveSummary,
  type SaveSlotSummary
} from "../save";
import {
  STARTER_PART_IDS,
  STARTING_CREDITS,
  STARTING_HULL_INTEGRITY,
  currentCargoPart,
  currentEnginePart,
  rollStartingCredits,
  replaceInstalledPart,
  type ShipPartCategory
} from "../shipData";
import { SPACE_VIEW_RATIO } from "../types";

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

interface TravelRouteState {
  readonly originId: string;
  readonly destinationId: string;
  readonly totalDistance: number;
  readonly approachDistance: number;
  readonly overshootDistance: number;
  readonly remainingDistance: number;
  readonly captureBandIndex: number;
  readonly routeWonderId: RouteWonderId | null;
}

interface OvershootRecoveryState {
  readonly destinationId: string;
  readonly startRemainingDistance: number;
  readonly targetRemainingDistance: number;
  readonly startCaptureBandIndex: number;
  readonly targetCaptureBandIndex: number;
  readonly elapsed: number;
  readonly duration: number;
  readonly turnDirection: -1 | 1;
}

interface RouteEngageAnimationState {
  readonly destinationId: string;
  readonly elapsed: number;
  readonly duration: number;
  readonly directionX: number;
  readonly directionY: number;
}

interface OrbitMenuOption {
  readonly id: string;
  readonly label: string;
  readonly tag: string;
  readonly description: string;
  readonly kind: "service" | "undock";
  readonly service?: TravelDestinationService;
}

type OrbitScreenMode = "menu" | "market" | "workshop";
type MarketAction = "buy" | "sell";

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
  toggle_quest_log: ["l"],
  toggle_map: ["m"],
  previous_message: ["p"],
  save_slot_1: ["1"],
  save_slot_2: ["2"],
  save_slot_3: ["3"],
  menu_up: ["w", "arrowup"],
  menu_down: ["s", "arrowdown"],
  menu_left: ["a", "arrowleft"],
  menu_right: ["d", "arrowright"],
  menu_confirm: ["enter", " "],
  toggle_help: ["h"],
  toggle_cheats: ["t"],
  toggle_audio: ["v"],
  menu_back: ["escape", "backspace"]
};

const SPEED_STATE_CALLOUT_DURATION = 1;
const TRANSMISSION_BUBBLE_DURATION = 10;
const TRANSMISSION_HISTORY_DURATION = 5.8;
const QUEST_LOG_ANIMATION_SPEED = 5.5;
const MAP_OVERLAY_ANIMATION_SPEED = 5.5;
const TRANSMISSION_HISTORY_LIMIT = 18;
const FREE_WAKE_LOCATION_ID = "free-wake";
const DEFAULT_LOCATION_ID = FREE_WAKE_LOCATION_ID;
const DEFAULT_DISCOVERED_CONTACT_IDS = NAV_CONTACTS.map((contact) => contact.id);
const DEFAULT_TRACKED_DESTINATION_ID = "registry-beacon";
const ORBIT_STOP_SSI = 12;
const TRANSIT_RATE_AT_MAX = 1.5;
const TRANSIT_RATE_FLOOR = 0.03;
const OVERSHOOT_RECOVERY_DURATION = 1.35;
const ROUTE_ENGAGE_DURATION = 1.4;
const VOID_SECRET_DRIFT_MIN_DISTANCE = 20;
const VOID_SECRET_DRIFT_MAX_DISTANCE = 40;
const SECRET_CREDITS_FADE_SPEED = 0.8;

export class GameScene implements Scene {
  private readonly actions: ActionMap;
  private readonly audio = new SynthAudio();
  private readonly cockpitAudio = new CockpitAudio();
  private readonly voidCreditsMusic = new VoidCreditsMusic();
  private readonly rng = new SeededRng(0xb14c4e12);
  private readonly stars: Star[] = [];

  private throttle = 0;
  private ssi = 0;
  private holdProgress = 0;
  private stageIndex = 0;
  private clock = 0;
  private helpVisible = true;
  private audioMixMode: AudioMixMode = getAudioMixMode();
  private audioEnabled = getAudioMixProfile(this.audioMixMode).audible;
  private certificationPassed = false;
  private explorerCharterFiled = false;
  private syncUnlocked = false;
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
  private speedStateCallout = "";
  private speedStateCalloutTimer = 0;
  private singularityVeilProgress = 0;
  private activeTransmission: RadioTransmission | null = null;
  private transmissionTimer = 0;
  private transmissionDuration = TRANSMISSION_BUBBLE_DURATION;
  private transmissionHistory: RadioTransmission[] = [];
  private transmissionHistoryCursor: number | null = null;
  private credits = STARTING_CREDITS;
  private shipUpgradeIds: string[] = [...STARTER_PART_IDS];
  private cargoManifest: Record<string, number> = {};
  private hullIntegrity = STARTING_HULL_INTEGRITY;
  private marketPulse = 0;
  private discoveredContactIds = [...DEFAULT_DISCOVERED_CONTACT_IDS];
  private currentLocationId = DEFAULT_LOCATION_ID;
  private trackedDestinationId: string | null = DEFAULT_TRACKED_DESTINATION_ID;
  private wakeOriginId: string | null = null;
  private muteReachVoidFade = 0;
  private voidSecretDriftActive = false;
  private voidSecretDriftDistance = 0;
  private voidSecretDriftTargetDistance = 0;
  private secretCreditsActive = false;
  private secretCreditsOverlayProgress = 0;
  private cheatOverlayOpen = false;
  private cheatInput = "";
  private cheatFeedback = "";
  private cheatFeedbackAccent = "#8edfff";
  private cheatConsumedConfirm = false;
  private cheatConsumedBackspace = false;
  private singularityThresholdSsi = DEFAULT_SINGULARITY_SSI;
  private activeRoute: TravelRouteState | null = null;
  private overshootRecovery: OvershootRecoveryState | null = null;
  private routeEngageAnimation: RouteEngageAnimationState | null = null;
  private orbitMenuIndex = 0;
  private orbitScreenMode: OrbitScreenMode = "menu";
  private marketSelectionIndex = 0;
  private marketAction: MarketAction = "buy";
  private workshopCategory: ShipPartCategory = "engine";
  private workshopSelectionIndex = 0;
  private saveArchiveSummary: SaveArchiveSummary = getSaveArchiveSummary();
  private questLogExpanded = false;
  private questLogOverlayProgress = 0;
  private mapExpanded = false;
  private mapOverlayProgress = 0;
  private selectedNavIndex = 0;
  private questFocusColumn: "contract" | "sync" = "contract";
  private questSelectionIndex = 0;
  private syncSelectionIndex = 1;

  private readonly unlockAudio = (): void => {
    if (this.audioEnabled) {
      this.audio.unlock();
      this.cockpitAudio.unlock();
      this.voidCreditsMusic.unlock();
    }
  };

  private readonly handleCheatTyping = (event: KeyboardEvent): void => {
    if (!this.cheatOverlayOpen || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      this.cheatConsumedBackspace = true;
      this.cheatInput = this.cheatInput.slice(0, -1);
      return;
    }

    if (event.key.length !== 1 || this.cheatInput.length >= 28) {
      return;
    }

    if (!/^[a-zA-Z0-9 ]$/.test(event.key)) {
      return;
    }

    event.preventDefault();
    if (event.key === " ") {
      this.cheatConsumedConfirm = true;
    }
    if (this.cheatFeedback !== "Enter a code and press Enter.") {
      this.cheatFeedback = "Enter a code and press Enter.";
      this.cheatFeedbackAccent = "#8edfff";
    }
    this.cheatInput += event.key;
  };

  constructor(
    private readonly services: AppServices,
    private readonly returnToTitle: () => void,
    private readonly initialSave: CourierSaveData | null = null
  ) {
    this.actions = new ActionMap(this.services.input, ACTIONS);
    this.seedStars();
    if (this.initialSave) {
      this.restoreFromSave(this.initialSave);
    } else {
      this.startFreshCampaign();
    }
    this.applyAudioMix();
  }

  private applyAudioMix(announce = false): void {
    const profile = getAudioMixProfile(this.audioMixMode);
    this.audioEnabled = profile.audible;
    this.audio.setVolume(profile.synth);
    this.audio.setEnabled(profile.audible);
    this.cockpitAudio.setVolume(profile.cockpit);
    this.cockpitAudio.setEnabled(profile.audible && !this.secretCreditsActive);
    this.voidCreditsMusic.setVolume(profile.soundtrack);
    this.voidCreditsMusic.setEnabled(profile.audible);

    if (profile.audible) {
      this.audio.unlock();
      this.cockpitAudio.unlock();
      this.voidCreditsMusic.unlock();
    }

    if (announce) {
      this.setStatus(profile.statusText, 1.8);
    }
  }

  onEnter(): void {
    window.addEventListener("keydown", this.unlockAudio);
    window.addEventListener("keydown", this.handleCheatTyping);
    window.addEventListener("pointerdown", this.unlockAudio, { passive: true });
  }

  onExit(): void {
    window.removeEventListener("keydown", this.unlockAudio);
    window.removeEventListener("keydown", this.handleCheatTyping);
    window.removeEventListener("pointerdown", this.unlockAudio);
    this.cockpitAudio.shutdown();
    this.voidCreditsMusic.shutdown();
  }

  update(dt: number): void {
    this.clock += dt;
    this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    this.surgeFlash = Math.max(0, this.surgeFlash - dt);
    this.canopyBloom = Math.max(0, this.canopyBloom - dt);
    this.speedStateCalloutTimer = Math.max(0, this.speedStateCalloutTimer - dt);
    const singularityTarget = this.ssi >= this.singularityThresholdSsi ? 1 : 0;
    const singularityRate = singularityTarget > this.singularityVeilProgress ? 1.7 : 1.05;
    this.singularityVeilProgress += Math.sign(singularityTarget - this.singularityVeilProgress) * dt * singularityRate;
    this.singularityVeilProgress = clamp(this.singularityVeilProgress, 0, 1);
    const muteReachVoidTarget = this.computeMuteReachVoidFadeTarget();
    if (this.activeRoute?.destinationId === "mute-reach" || this.currentLocationId === "mute-reach") {
      this.muteReachVoidFade = Math.max(this.muteReachVoidFade, muteReachVoidTarget);
    } else {
      this.muteReachVoidFade += (muteReachVoidTarget - this.muteReachVoidFade) * Math.min(1, dt * 1.8);
    }
    this.muteReachVoidFade = clamp(this.muteReachVoidFade, 0, 1);
    if (this.transmissionTimer > 0) {
      this.transmissionTimer = Math.max(0, this.transmissionTimer - dt);
      if (this.transmissionTimer <= 0) {
        this.activeTransmission = null;
        this.transmissionHistoryCursor = null;
      }
    }
    const questLogTarget = this.questLogExpanded ? 1 : 0;
    this.questLogOverlayProgress += Math.sign(questLogTarget - this.questLogOverlayProgress) * dt * QUEST_LOG_ANIMATION_SPEED;
    this.questLogOverlayProgress = clamp(this.questLogOverlayProgress, 0, 1);
    const mapTarget = this.mapExpanded ? 1 : 0;
    this.mapOverlayProgress += Math.sign(mapTarget - this.mapOverlayProgress) * dt * MAP_OVERLAY_ANIMATION_SPEED;
    this.mapOverlayProgress = clamp(this.mapOverlayProgress, 0, 1);
    this.updateRouteEngageAnimation(dt);
    if (this.statusTimer > 0) {
      this.statusTimer = Math.max(0, this.statusTimer - dt);
    }

    if (this.secretCreditsActive) {
      this.secretCreditsOverlayProgress = clamp(this.secretCreditsOverlayProgress + dt * SECRET_CREDITS_FADE_SPEED, 0, 1);
      this.voidCreditsMusic.update(dt);
      if (this.actions.wasPressed("menu_confirm") || this.actions.wasPressed("menu_back")) {
        this.voidCreditsMusic.setActive(false);
        this.returnToTitle();
      }
      return;
    }
    if (this.cheatOverlayOpen) {
      const consumedConfirm = this.cheatConsumedConfirm;
      const consumedBackspace = this.cheatConsumedBackspace;
      this.cheatConsumedConfirm = false;
      this.cheatConsumedBackspace = false;
      if (!consumedConfirm && this.actions.wasPressed("menu_confirm")) {
        this.submitCheatCode();
      }
      if (!consumedBackspace && this.actions.wasPressed("menu_back")) {
        this.closeCheatOverlay();
      }
      return;
    }

    if (this.actions.wasPressed("toggle_audio")) {
      this.audioMixMode = cycleAudioMixMode();
      this.applyAudioMix(true);
      if (this.audioEnabled) {
        this.audio.beep(this.audioMixMode === "max" ? 880 : 620, 0.06, "sine");
      }
    }
    if (this.actions.wasPressed("toggle_cheats")) {
      this.openCheatOverlay();
      return;
    }

    const travelLockedView = this.activeRoute !== null || this.orbitInteractionOpen();

    if (!travelLockedView && this.actions.wasPressed("toggle_quest_log")) {
      const nextState = !this.questLogExpanded;
      this.questLogExpanded = nextState;
      if (nextState) {
        this.mapExpanded = false;
        this.questFocusColumn = "contract";
      }
    }
    if (!travelLockedView && this.actions.wasPressed("toggle_map")) {
      const nextState = !this.mapExpanded;
      this.mapExpanded = nextState;
      if (nextState) {
        this.questLogExpanded = false;
        this.selectedNavIndex = this.navIndexForId(this.trackedDestinationId);
      }
    }
    if (this.actions.wasPressed("previous_message")) {
      this.recallPreviousTransmission();
    }
    if (this.questLogExpanded && this.actions.wasPressed("save_slot_1")) {
      this.writeManualSync("slot1");
    }
    if (this.questLogExpanded && this.actions.wasPressed("save_slot_2")) {
      this.writeManualSync("slot2");
    }
    if (this.questLogExpanded && this.actions.wasPressed("save_slot_3")) {
      this.writeManualSync("slot3");
    }
    if (this.actions.wasPressed("toggle_help")) {
      this.helpVisible = !this.helpVisible;
    }
    if (this.questLogExpanded || this.mapExpanded) {
      if (this.actions.wasPressed("menu_back")) {
        this.questLogExpanded = false;
        this.mapExpanded = false;
        return;
      }
      this.handleOverlayNavigation();
      return;
    }
    if (this.orbitInteractionOpen()) {
      if (this.actions.wasPressed("menu_back")) {
        if (this.orbitScreenMode !== "menu") {
          this.orbitScreenMode = "menu";
          return;
        }
        this.returnToTitle();
        return;
      }
      this.handleOrbitMenu();
      return;
    }
    if (this.actions.wasPressed("menu_back")) {
      this.returnToTitle();
      return;
    }
    if (this.actions.wasPressed("restart")) {
      this.audio.beep(540, 0.08, "triangle");
      this.restartTrial();
      return;
    }

    const accelerating = this.actions.isDown("accelerate");
    const braking = this.actions.isDown("brake");
    const previousSsi = this.ssi;
    const previousState = this.currentSpeedState().label;

    if (this.audioEnabled && this.actions.wasPressed("accelerate")) {
      this.audio.whoosh();
    }
    if (this.audioEnabled && this.actions.wasPressed("brake")) {
      this.audio.impact();
    }

    const next = stepFlightModel(
      { throttle: this.throttle, ssi: this.ssi },
      { accelerate: accelerating, brake: braking },
      dt,
      this.currentFlightTuning()
    );
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
    this.updateRouteTravel(dt);
    this.updateVoidSecretDrift(dt);

    const currentState = this.currentSpeedState().label;
    if (currentState !== previousState) {
      this.speedStateCallout = currentState;
      this.speedStateCalloutTimer = SPEED_STATE_CALLOUT_DURATION;
    }
    if (
      currentState !== previousState &&
      (currentState === "Needle" || currentState === "Slipwake" || currentState === "Black Relay" || currentState === "Singularity Veil")
    ) {
      this.audio.beep(
        currentState === "Singularity Veil"
          ? 940
          : currentState === "Black Relay"
            ? 860
            : currentState === "Slipwake"
              ? 760
              : 680,
        currentState === "Singularity Veil" ? 0.07 : 0.05,
        "sine"
      );
      if (currentState === "Singularity Veil") {
        this.audio.whoosh();
      }
    }
  }

  render(_alpha: number): void {
    const { ctx } = this.services.renderer;
    const shake = this.shakeOffset();

    this.renderBackdrop();
    ctx.save();
    if (this.secretCreditsActive) {
      this.renderSecretCreditsOverlay();
      ctx.restore();
      return;
    }
    ctx.translate(shake.x, shake.y);
    this.renderStarfield();
    this.renderRouteWonder();
    this.renderDestinationApproach();
    this.renderCanopyBloom();
    this.renderReticle();
    this.renderCockpit();
    if (this.orbitInteractionOpen()) {
      this.renderOrbitOverlay();
    }
    if (this.helpVisible && !this.orbitInteractionOpen() && this.questLogOverlayProgress < 0.08 && this.mapOverlayProgress < 0.08) {
      this.renderHelpOverlay();
    }
    if (this.questLogOverlayProgress > 0) {
      this.renderQuestOverlay();
    }
    if (this.mapOverlayProgress > 0) {
      this.renderMapOverlay();
    }
    if (this.cheatOverlayOpen) {
      this.renderCheatOverlay();
    }
    if (this.statusTimer > 0) {
      this.renderStatus();
    }
    ctx.restore();
  }

  private get viewHeight(): number {
    return Math.round(this.services.renderer.height * SPACE_VIEW_RATIO);
  }

  private get baseVanishX(): number {
    return this.services.renderer.width * 0.5;
  }

  private get baseVanishY(): number {
    return this.viewHeight * 0.54;
  }

  private get vanishX(): number {
    return this.baseVanishX + (this.currentRouteEngageAnimation()?.cameraOffsetX ?? 0);
  }

  private get vanishY(): number {
    return this.baseVanishY + (this.currentRouteEngageAnimation()?.cameraOffsetY ?? 0);
  }

  private currentBand(): CertificationBand | null {
    return this.questComplete() || this.certificationPassed ? null : (CERTIFICATION_BANDS[this.stageIndex] ?? null);
  }

  private questComplete(): boolean {
    return this.explorerCharterFiled;
  }

  private currentLocationName(): string {
    if (this.currentLocationId === FREE_WAKE_LOCATION_ID) {
      return "Open Wake";
    }
    return this.navContactById(this.currentLocationId)?.name ?? "Unknown Drift";
  }

  private trackedNavContact(): NavContact {
    return this.navContactById(this.trackedDestinationId) ?? this.nearestNavContact();
  }

  private travelDestinationFor(contactId: string | null): TravelDestination | null {
    return this.navContactById(contactId)?.destination ?? null;
  }

  private activeRouteContact(): NavContact | null {
    return this.navContactById(this.activeRoute?.destinationId ?? null);
  }

  private activeRouteDestination(): TravelDestination | null {
    return this.travelDestinationFor(this.activeRoute?.destinationId ?? null);
  }

  private orbitInteractionOpen(): boolean {
    return this.activeRoute === null && this.travelDestinationFor(this.currentLocationId) !== null;
  }

  private currentOrbitContact(): NavContact | null {
    return this.orbitInteractionOpen() ? this.navContactById(this.currentLocationId) : null;
  }

  private currentOrbitDestination(): TravelDestination | null {
    return this.orbitInteractionOpen() ? this.travelDestinationFor(this.currentLocationId) : null;
  }

  private currentRouteOriginId(destinationId: string | null = null): string {
    if (this.activeRoute) {
      return this.activeRoute.originId;
    }
    if (this.currentLocationId !== FREE_WAKE_LOCATION_ID) {
      return this.currentLocationId;
    }
    if (
      this.wakeOriginId &&
      this.wakeOriginId !== destinationId &&
      this.navContactById(this.wakeOriginId)
    ) {
      return this.wakeOriginId;
    }
    return FREE_WAKE_LOCATION_ID;
  }

  private routePreviewForDestination(destinationId: string | null) {
    const localReturn = this.localReturnRouteFor(destinationId);
    if (localReturn) {
      return localReturn;
    }
    const preferredOrigin = this.currentRouteOriginId(destinationId);
    return travelRouteFor(preferredOrigin, destinationId) ?? travelRouteFor(FREE_WAKE_LOCATION_ID, destinationId);
  }

  private localReturnRouteFor(destinationId: string | null): TravelRouteProfile | null {
    if (!destinationId || this.currentLocationId !== FREE_WAKE_LOCATION_ID || this.wakeOriginId !== destinationId) {
      return null;
    }

    const destination = this.travelDestinationFor(destinationId);
    if (!destination) {
      return null;
    }

    return {
      originId: destinationId,
      destinationId,
      totalDistance: Math.round(Math.max(0.9, destination.approachDistance * 1.12) * 10) / 10,
      wonderId: null
    };
  }

  private currentFlightTuning(): { accelerationMultiplier: number; maxSsiMultiplier: number } {
    const engine = currentEnginePart(this.shipUpgradeIds);
    return {
      accelerationMultiplier: engine.accelerationMultiplier,
      maxSsiMultiplier: engine.maxSsiMultiplier
    };
  }

  private currentTransitRate(): number {
    const speedRatio = clamp(this.ssi / MAX_SSI, 0, 1.16);
    const singularityBonus = Math.max(0, speedRatio - 1) * 0.9;
    return (
      TRANSIT_RATE_FLOOR +
      Math.pow(Math.min(speedRatio, 1), 1.35) * (TRANSIT_RATE_AT_MAX - TRANSIT_RATE_FLOOR) +
      singularityBonus
    );
  }

  private currentSpeedState(ssi = this.ssi) {
    return getSpeedState(ssi, this.singularityThresholdSsi);
  }

  private currentMaxSsi(): number {
    return MAX_SSI * this.currentFlightTuning().maxSsiMultiplier;
  }

  private cargoCapacity(): number {
    return cargoCapacityFromParts(this.shipUpgradeIds);
  }

  private cargoUsed(): number {
    return cargoUsedCapacity(this.cargoManifest);
  }

  private cargoFree(): number {
    return cargoFreeCapacity(this.cargoManifest, this.shipUpgradeIds);
  }

  private currentMarketQuotes(): MarketQuote[] {
    return marketQuotesFor(this.currentLocationId, this.marketPulse);
  }

  private currentWorkshopParts(category: ShipPartCategory) {
    return workshopPartsFor(this.currentLocationId, category);
  }

  private orbitMenuOptions(): OrbitMenuOption[] {
    const destination = this.currentOrbitDestination();
    const options = destination?.services.map<OrbitMenuOption>((service) => ({
      id: service.id,
      label: service.label,
      tag: service.tag,
      description: service.description,
      kind: "service",
      service
    })) ?? [];
    options.push({
      id: "undock",
      label: "Undock",
      tag: "launch",
      description: "Release the orbit hold, drop back into open wake, and keep the route pinned for a return pass.",
      kind: "undock"
    });
    return options;
  }

  private normalizeLocationId(locationId: string): string {
    if (locationId === "open-drift") {
      return FREE_WAKE_LOCATION_ID;
    }
    return locationId;
  }

  private normalizeTrackedDestinationId(destinationId: string | null): string | null {
    if (!destinationId || destinationId === "open-drift") {
      return DEFAULT_TRACKED_DESTINATION_ID;
    }
    return this.navContactById(destinationId) ? destinationId : DEFAULT_TRACKED_DESTINATION_ID;
  }

  private navIndexForId(id: string | null): number {
    if (!id) {
      return 0;
    }
    const index = NAV_CONTACTS.findIndex((contact) => contact.id === id);
    return index >= 0 ? index : 0;
  }

  private navContactById(id: string | null): NavContact | null {
    if (!id) {
      return null;
    }
    return NAV_CONTACTS.find((contact) => contact.id === id) ?? null;
  }

  private currentOvershootRecovery(): OvershootRecoveryState | null {
    if (!this.activeRoute || !this.overshootRecovery) {
      return null;
    }
    if (this.overshootRecovery.destinationId !== this.activeRoute.destinationId) {
      return null;
    }
    return this.overshootRecovery;
  }

  private currentRouteEngageAnimation():
    | {
      ratio: number;
      cameraOffsetX: number;
      cameraOffsetY: number;
      destinationOffsetX: number;
      destinationOffsetY: number;
      signalAlpha: number;
    }
    | null {
    if (!this.activeRoute || !this.routeEngageAnimation) {
      return null;
    }
    if (this.routeEngageAnimation.destinationId !== this.activeRoute.destinationId) {
      return null;
    }

    const ratio = clamp(this.routeEngageAnimation.elapsed / this.routeEngageAnimation.duration, 0, 1);
    const settle = 1 - Math.pow(ratio, 0.82);
    const bank = Math.sin(ratio * Math.PI) * 0.38;
    const cameraOffsetX = -this.routeEngageAnimation.directionX * (84 + Math.abs(this.routeEngageAnimation.directionY) * 20) * settle;
    const cameraOffsetY = -this.routeEngageAnimation.directionY * 36 * settle - bank * 12;
    const destinationOffsetX = this.routeEngageAnimation.directionX * 124 * settle;
    const destinationOffsetY = this.routeEngageAnimation.directionY * 54 * settle + bank * 16;

    return {
      ratio,
      cameraOffsetX,
      cameraOffsetY,
      destinationOffsetX,
      destinationOffsetY,
      signalAlpha: clamp(1 - ratio * 0.72, 0, 1)
    };
  }

  private routeDisplayState(): { remainingDistance: number; captureBandIndex: number; overshootRatio: number } | null {
    if (!this.activeRoute) {
      return null;
    }

    const recovery = this.currentOvershootRecovery();
    if (!recovery) {
      return {
        remainingDistance: this.activeRoute.remainingDistance,
        captureBandIndex: this.activeRoute.captureBandIndex,
        overshootRatio: 0
      };
    }

    const ratio = clamp(recovery.elapsed / recovery.duration, 0, 1);
    const eased = ratio < 0.5
      ? 4 * ratio * ratio * ratio
      : 1 - Math.pow(-2 * ratio + 2, 3) / 2;

    return {
      remainingDistance:
        recovery.startRemainingDistance +
        (recovery.targetRemainingDistance - recovery.startRemainingDistance) * eased,
      captureBandIndex: ratio < 0.58 ? recovery.startCaptureBandIndex : recovery.targetCaptureBandIndex,
      overshootRatio: ratio
    };
  }

  private currentRouteWonderState():
    | {
      wonder: RouteWonderDefinition;
      routeProgress: number;
      wonderProgress: number;
      intensity: number;
    }
    | null {
    if (!this.activeRoute) {
      return null;
    }

    const wonder = routeWonderById(this.activeRoute.routeWonderId);
    if (!wonder) {
      return null;
    }

    const display = this.routeDisplayState();
    const remainingDistance = Math.max(0, display?.remainingDistance ?? this.activeRoute.remainingDistance);
    const routeProgress = 1 - clamp(remainingDistance / Math.max(this.activeRoute.totalDistance, 0.001), 0, 1);
    if (routeProgress < wonder.start || routeProgress > wonder.end) {
      return null;
    }

    const span = Math.max(0.001, wonder.end - wonder.start);
    const normalized = clamp((routeProgress - wonder.start) / span, 0, 1);
    const fadeIn = clamp(normalized / 0.22, 0, 1);
    const fadeOut = clamp((1 - normalized) / 0.24, 0, 1);
    return {
      wonder,
      routeProgress,
      wonderProgress: normalized,
      intensity: Math.min(fadeIn, fadeOut)
    };
  }

  private computeMuteReachVoidFadeTarget(): number {
    if (this.secretCreditsActive) {
      return 1;
    }
    if (this.voidSecretDriftActive && this.wakeOriginId === "mute-reach") {
      return 1;
    }
    if (!this.activeRoute) {
      return this.currentLocationId === "mute-reach" ? 1 : 0;
    }
    if (this.activeRoute.destinationId !== "mute-reach") {
      return 0;
    }

    const routeDisplay = this.routeDisplayState();
    const remainingDistance = Math.max(0, routeDisplay?.remainingDistance ?? this.activeRoute.remainingDistance);
    const startFadeDistance = Math.max(this.activeRoute.totalDistance * 0.56, this.activeRoute.approachDistance * 3.4);
    const endFadeDistance = this.activeRoute.approachDistance * 0.72;
    return clamp((startFadeDistance - remainingDistance) / Math.max(startFadeDistance - endFadeDistance, 0.001), 0, 1);
  }

  private updateRouteEngageAnimation(dt: number): void {
    if (!this.routeEngageAnimation) {
      return;
    }
    const nextElapsed = this.routeEngageAnimation.elapsed + dt;
    if (nextElapsed >= this.routeEngageAnimation.duration || !this.activeRoute) {
      this.routeEngageAnimation = null;
      return;
    }
    this.routeEngageAnimation = {
      ...this.routeEngageAnimation,
      elapsed: nextElapsed
    };
  }

  private startRouteEngageAnimation(routeProfile: TravelRouteProfile, contact: NavContact, destination: TravelDestination): void {
    const originContact = this.navContactById(routeProfile.originId);
    let directionX = contact.x - (originContact?.x ?? 0);
    let directionY = contact.y - (originContact?.y ?? 0);
    if (Math.hypot(directionX, directionY) < 0.001) {
      directionX = destination.visual.approachOffsetX;
      directionY = destination.visual.approachOffsetY;
    }
    const length = Math.max(0.001, Math.hypot(directionX, directionY));
    this.routeEngageAnimation = {
      destinationId: contact.id,
      elapsed: 0,
      duration: ROUTE_ENGAGE_DURATION,
      directionX: directionX / length,
      directionY: directionY / length
    };
  }

  private armVoidSecretDrift(): void {
    this.voidSecretDriftActive = true;
    this.voidSecretDriftDistance = 0;
    this.voidSecretDriftTargetDistance = this.rng.range(VOID_SECRET_DRIFT_MIN_DISTANCE, VOID_SECRET_DRIFT_MAX_DISTANCE);
  }

  private cancelVoidSecretDrift(): void {
    this.voidSecretDriftActive = false;
    this.voidSecretDriftDistance = 0;
    this.voidSecretDriftTargetDistance = 0;
  }

  private openCheatOverlay(): void {
    this.cheatOverlayOpen = true;
    this.cheatInput = "";
    this.cheatFeedback = "Enter a code and press Enter.";
    this.cheatFeedbackAccent = "#8edfff";
    this.cheatConsumedConfirm = false;
    this.cheatConsumedBackspace = false;
    this.questLogExpanded = false;
    this.questLogOverlayProgress = 0;
    this.mapExpanded = false;
    this.mapOverlayProgress = 0;
    this.helpVisible = false;
  }

  private closeCheatOverlay(): void {
    this.cheatOverlayOpen = false;
    this.cheatInput = "";
    this.cheatFeedback = "";
    this.cheatConsumedConfirm = false;
    this.cheatConsumedBackspace = false;
  }

  private submitCheatCode(): void {
    const normalized = this.cheatInput.trim().replace(/\s+/g, " ").toLowerCase();
    if (normalized === "show me the money") {
      this.credits += 10000;
      this.cheatFeedback = "Funds injected // +10000 CR";
      this.cheatFeedbackAccent = "#9deab2";
      this.audio.repair();
      this.setStatus("Cheat accepted. Treasury swollen by 10000 credits.", 2.8);
      this.cheatInput = "";
      return;
    }
    if (normalized === "skip tutorial") {
      if (this.questComplete()) {
        this.cheatFeedback = "Charter already filed.";
        this.cheatFeedbackAccent = "#8edfff";
        this.audio.beep(420, 0.05, "triangle");
        return;
      }
      this.completeExplorerCharter("Tutorial skipped. Explorer lane filed and registry sync unlocked.");
      this.cheatFeedback = "Tutorial bypassed // charter filed";
      this.cheatFeedbackAccent = "#9deab2";
      this.cheatInput = "";
      return;
    }

    this.cheatFeedback = normalized.length === 0 ? "No code entered." : "Code rejected.";
    this.cheatFeedbackAccent = "#ffb691";
    this.audio.beep(240, 0.06, "triangle");
  }

  private completeExplorerCharter(statusText: string): void {
    this.certificationPassed = true;
    this.explorerCharterFiled = true;
    this.syncUnlocked = true;
    this.stageIndex = CERTIFICATION_BANDS.length;
    this.holdProgress = 0;
    this.currentLocationId = FREE_WAKE_LOCATION_ID;
    this.trackedDestinationId = DEFAULT_TRACKED_DESTINATION_ID;
    this.wakeOriginId = null;
    this.routeEngageAnimation = null;
    this.setStatus(statusText, 4.2);
    this.showTransmission(FIRST_QUEST_COMPLETE);
    this.writeAutosave();
    this.audio.beep(840, 0.1, "sine");
  }

  private updateVoidSecretDrift(dt: number): void {
    if (
      !this.voidSecretDriftActive ||
      this.secretCreditsActive ||
      this.activeRoute ||
      this.currentLocationId !== FREE_WAKE_LOCATION_ID ||
      this.wakeOriginId !== "mute-reach"
    ) {
      return;
    }

    const driftGain = 0.1 + clamp(this.ssi / Math.max(1, this.currentMaxSsi()), 0, 1) * 0.9;
    this.voidSecretDriftDistance += this.currentTransitRate() * driftGain * dt;
    if (this.voidSecretDriftDistance >= this.voidSecretDriftTargetDistance) {
      this.triggerVoidSecretCredits();
    }
  }

  private triggerVoidSecretCredits(): void {
    this.secretCreditsActive = true;
    this.secretCreditsOverlayProgress = 0;
    this.cancelVoidSecretDrift();
    this.questLogExpanded = false;
    this.questLogOverlayProgress = 0;
    this.mapExpanded = false;
    this.mapOverlayProgress = 0;
    this.helpVisible = false;
    this.activeRoute = null;
    this.overshootRecovery = null;
    this.routeEngageAnimation = null;
    this.activeTransmission = null;
    this.transmissionTimer = 0;
    this.statusTimer = 0;
    this.throttle = 0;
    this.ssi = 0;
    this.muteReachVoidFade = 1;
    this.cockpitAudio.setEnabled(false);
    this.voidCreditsMusic.setEnabled(this.audioEnabled);
    this.voidCreditsMusic.setActive(true);
    if (this.audioEnabled) {
      this.voidCreditsMusic.unlock();
    }
    this.audio.whoosh();
    this.audio.gameOver();
  }

  private startFreshCampaign(): void {
    this.explorerCharterFiled = false;
    this.syncUnlocked = false;
    this.credits = rollStartingCredits();
    this.shipUpgradeIds = [...STARTER_PART_IDS];
    this.cargoManifest = {};
    this.hullIntegrity = STARTING_HULL_INTEGRITY;
    this.marketPulse = 0;
    this.discoveredContactIds = [...DEFAULT_DISCOVERED_CONTACT_IDS];
    this.currentLocationId = DEFAULT_LOCATION_ID;
    this.trackedDestinationId = DEFAULT_TRACKED_DESTINATION_ID;
    this.wakeOriginId = null;
    this.muteReachVoidFade = 0;
    this.cancelVoidSecretDrift();
    this.secretCreditsActive = false;
    this.secretCreditsOverlayProgress = 0;
    this.voidCreditsMusic.setActive(false);
    this.closeCheatOverlay();
    this.singularityThresholdSsi = rollSingularityThreshold();
    this.activeRoute = null;
    this.overshootRecovery = null;
    this.routeEngageAnimation = null;
    this.orbitMenuIndex = 0;
    this.transmissionHistory = [];
    this.refreshSaveArchiveSummary();
    this.resetFlightRun();
    this.setStatus("Relay stack cold. Raise throttle to wake the first window.", 3.4);
    this.showTransmission(FIRST_QUEST_INTRO);
  }

  private restoreFromSave(save: CourierSaveData): void {
    this.explorerCharterFiled = save.progression.completedQuestIds.includes(FIRST_QUEST.id) || save.progression.activeQuestComplete;
    this.syncUnlocked = save.progression.syncUnlocked || this.explorerCharterFiled;
    this.credits = save.pilot.credits;
    this.shipUpgradeIds = save.pilot.upgradeIds.length > 0 ? [...save.pilot.upgradeIds] : [...STARTER_PART_IDS];
    this.cargoManifest = cargoManifestFromEntries(save.pilot.cargoManifest);
    this.hullIntegrity = save.pilot.hullIntegrity ?? STARTING_HULL_INTEGRITY;
    this.marketPulse = save.world.marketPulse ?? 0;
    this.discoveredContactIds = save.world.discoveredContactIds.filter((id) => this.navContactById(id) !== null);
    if (this.discoveredContactIds.length === 0) {
      this.discoveredContactIds = [...DEFAULT_DISCOVERED_CONTACT_IDS];
    }
    this.currentLocationId = this.normalizeLocationId(save.world.locationId);
    if (this.currentLocationId !== FREE_WAKE_LOCATION_ID && this.navContactById(this.currentLocationId) === null) {
      this.currentLocationId = FREE_WAKE_LOCATION_ID;
    }
    this.trackedDestinationId = this.normalizeTrackedDestinationId(save.world.trackedDestinationId);
    this.wakeOriginId =
      save.world.wakeOriginId && this.navContactById(save.world.wakeOriginId)
        ? save.world.wakeOriginId
        : null;
    this.muteReachVoidFade = this.currentLocationId === "mute-reach" ? 1 : 0;
    this.cancelVoidSecretDrift();
    this.secretCreditsActive = false;
    this.secretCreditsOverlayProgress = 0;
    this.voidCreditsMusic.setActive(false);
    this.closeCheatOverlay();
    this.singularityThresholdSsi = normalizeSingularityThreshold(save.world.singularityThresholdSsi);
    this.activeRoute = null;
    this.overshootRecovery = null;
    this.routeEngageAnimation = null;
    this.orbitMenuIndex = 0;
    this.transmissionHistory = [...save.comms.transmissions];
    this.refreshSaveArchiveSummary();
    this.resetFlightRun();

    if (save.progression.activeQuestComplete) {
      this.stageIndex = CERTIFICATION_BANDS.length;
      this.certificationPassed = true;
    } else {
      this.stageIndex = clamp(Math.floor(save.progression.completedStepCount), 0, Math.max(0, CERTIFICATION_BANDS.length - 1));
      this.holdProgress = Math.max(0, save.progression.stepHoldProgress);
    }

    this.setStatus(`Registry sync restored from ${this.slotDisplayLabel(save.slot)}.`, 3.2);
  }

  private resetFlightRun(): void {
    this.throttle = 0;
    this.ssi = 0;
    this.holdProgress = 0;
    this.stageIndex = 0;
    this.clock = 0;
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
    this.speedStateCallout = "";
    this.speedStateCalloutTimer = 0;
    this.singularityVeilProgress = 0;
    this.activeTransmission = null;
    this.transmissionTimer = 0;
    this.transmissionDuration = TRANSMISSION_BUBBLE_DURATION;
    this.transmissionHistoryCursor = null;
    this.questLogExpanded = false;
    this.questLogOverlayProgress = 0;
    this.mapExpanded = false;
    this.mapOverlayProgress = 0;
    this.selectedNavIndex = this.navIndexForId(this.trackedDestinationId);
    this.questFocusColumn = "contract";
    this.questSelectionIndex = 0;
    this.syncSelectionIndex = 1;
    this.activeRoute = null;
    this.overshootRecovery = null;
    this.routeEngageAnimation = null;
    this.orbitMenuIndex = 0;
    this.orbitScreenMode = "menu";
    this.marketSelectionIndex = 0;
    this.marketAction = "buy";
    this.workshopCategory = "engine";
    this.workshopSelectionIndex = 0;
    this.cancelVoidSecretDrift();
    this.secretCreditsActive = false;
    this.secretCreditsOverlayProgress = 0;
    this.voidCreditsMusic.setActive(false);
    this.closeCheatOverlay();
    this.resetDensitySection(true);
    for (const star of this.stars) {
      this.respawnStar(star, false);
    }
  }

  private restartTrial(): void {
    this.resetFlightRun();
    if (this.questComplete()) {
      this.setStatus("Trial window reset. Charter remains on file.", 2.8);
      return;
    }
    this.setStatus("Relay stack cold. Raise throttle to wake the first window.", 3.4);
    this.showTransmission(FIRST_QUEST_INTRO);
  }

  private handleOrbitMenu(): void {
    const contact = this.currentOrbitContact();
    const destination = this.currentOrbitDestination();
    const options = this.orbitMenuOptions();
    if (!contact || !destination || options.length === 0) {
      return;
    }

    if (this.orbitScreenMode === "market") {
      this.handleOrbitMarket();
      return;
    }
    if (this.orbitScreenMode === "workshop") {
      this.handleOrbitWorkshop();
      return;
    }

    if (this.actions.wasPressed("menu_up")) {
      this.orbitMenuIndex = (this.orbitMenuIndex + options.length - 1) % options.length;
    }
    if (this.actions.wasPressed("menu_down")) {
      this.orbitMenuIndex = (this.orbitMenuIndex + 1) % options.length;
    }
    if (!this.actions.wasPressed("menu_confirm")) {
      return;
    }

    const selected = options[this.orbitMenuIndex] ?? options[0]!;
    if (selected.kind === "service" && selected.service) {
      if (selected.service.mode === "market" && marketProfileFor(contact.id)) {
        this.orbitScreenMode = "market";
        this.marketSelectionIndex = 0;
        this.marketAction = "buy";
        this.setStatus(`${selected.label} open. Quotes are live.`, 2.2);
        return;
      }

      if (selected.service.mode === "workshop" && this.currentWorkshopParts("engine").length + this.currentWorkshopParts("cargo").length > 0) {
        this.orbitScreenMode = "workshop";
        this.workshopCategory = this.currentWorkshopParts("engine").length > 0 ? "engine" : "cargo";
        this.workshopSelectionIndex = 0;
        this.setStatus(`${selected.label} open. Fit options are live.`, 2.2);
        return;
      }

      this.showTransmission({
        sender: selected.service.sender,
        channel: contact.name,
        subject: selected.service.subject,
        body: selected.service.body,
        accent: contact.accent
      });
      this.setStatus(selected.service.statusText, 2.6);
      return;
    }

    this.currentLocationId = FREE_WAKE_LOCATION_ID;
    this.wakeOriginId = contact.id;
    this.trackedDestinationId = contact.id;
    this.resetFlightRun();
    if (contact.id === "mute-reach") {
      this.armVoidSecretDrift();
    } else {
      this.cancelVoidSecretDrift();
    }
    this.setStatus("Orbit released. Burn clear into the open wake.", 2.8);
    this.showTransmission({
      sender: destination.comms.departure.sender,
      channel: contact.name,
      subject: destination.comms.departure.subject,
      body: destination.comms.departure.body,
      accent: contact.accent
    });
  }

  private handleOrbitMarket(): void {
    const quotes = this.currentMarketQuotes();
    if (quotes.length === 0) {
      this.orbitScreenMode = "menu";
      return;
    }

    if (this.actions.wasPressed("menu_up")) {
      this.marketSelectionIndex = (this.marketSelectionIndex + quotes.length - 1) % quotes.length;
    }
    if (this.actions.wasPressed("menu_down")) {
      this.marketSelectionIndex = (this.marketSelectionIndex + 1) % quotes.length;
    }
    if (this.actions.wasPressed("menu_left")) {
      this.marketAction = "sell";
    }
    if (this.actions.wasPressed("menu_right")) {
      this.marketAction = "buy";
    }
    if (!this.actions.wasPressed("menu_confirm")) {
      return;
    }

    const quote = quotes[this.marketSelectionIndex] ?? quotes[0]!;
    if (this.marketAction === "buy") {
      if (this.credits < quote.buyPrice) {
        this.audio.beep(240, 0.06, "triangle");
        this.setStatus("Insufficient credits for that lot.", 2.2);
        return;
      }
      if (this.cargoFree() < 1) {
        this.audio.beep(240, 0.06, "triangle");
        this.setStatus("Cargo hold is full. Fit a larger bay or sell stock.", 2.4);
        return;
      }
      this.credits -= quote.buyPrice;
      this.cargoManifest[quote.commodity.id] = cargoQuantity(this.cargoManifest, quote.commodity.id) + 1;
      this.audio.beep(640, 0.05, "sine");
      this.setStatus(`Bought 1 ${quote.commodity.name} for ${quote.buyPrice} CR.`, 2.2);
      return;
    }

    const owned = cargoQuantity(this.cargoManifest, quote.commodity.id);
    if (owned <= 0) {
      this.audio.beep(240, 0.06, "triangle");
      this.setStatus(`No ${quote.commodity.name} in the hold to sell.`, 2.2);
      return;
    }
    this.credits += quote.sellPrice;
    if (owned <= 1) {
      delete this.cargoManifest[quote.commodity.id];
    } else {
      this.cargoManifest[quote.commodity.id] = owned - 1;
    }
    this.audio.beep(720, 0.05, "sine");
    this.setStatus(`Sold 1 ${quote.commodity.name} for ${quote.sellPrice} CR.`, 2.2);
  }

  private handleOrbitWorkshop(): void {
    const engineParts = this.currentWorkshopParts("engine");
    const cargoParts = this.currentWorkshopParts("cargo");
    const hasEngines = engineParts.length > 0;
    const hasCargo = cargoParts.length > 0;

    if (!hasEngines && !hasCargo) {
      this.orbitScreenMode = "menu";
      return;
    }

    if (this.actions.wasPressed("menu_left")) {
      this.workshopCategory = hasEngines ? "engine" : "cargo";
      this.workshopSelectionIndex = 0;
    }
    if (this.actions.wasPressed("menu_right")) {
      this.workshopCategory = hasCargo ? "cargo" : "engine";
      this.workshopSelectionIndex = 0;
    }

    const parts = this.currentWorkshopParts(this.workshopCategory);
    if (parts.length === 0) {
      if (this.actions.wasPressed("menu_confirm")) {
        this.audio.beep(240, 0.06, "triangle");
        this.setStatus(`No ${this.workshopCategory} fits are staged here.`, 2.2);
      }
      return;
    }

    if (this.actions.wasPressed("menu_up")) {
      this.workshopSelectionIndex = (this.workshopSelectionIndex + parts.length - 1) % parts.length;
    }
    if (this.actions.wasPressed("menu_down")) {
      this.workshopSelectionIndex = (this.workshopSelectionIndex + 1) % parts.length;
    }
    if (!this.actions.wasPressed("menu_confirm")) {
      return;
    }

    const selectedPart = parts[this.workshopSelectionIndex] ?? parts[0]!;
    const installed = this.workshopCategory === "engine"
      ? currentEnginePart(this.shipUpgradeIds)
      : currentCargoPart(this.shipUpgradeIds);

    if (selectedPart.id === installed.id) {
      this.audio.beep(320, 0.05, "triangle");
      this.setStatus(`${selectedPart.shortName} is already installed.`, 2);
      return;
    }

    if (selectedPart.tier < installed.tier) {
      this.audio.beep(320, 0.05, "triangle");
      this.setStatus("Current hardware already outruns that fit.", 2.2);
      return;
    }

    if (this.credits < selectedPart.price) {
      this.audio.beep(240, 0.06, "triangle");
      this.setStatus("Insufficient credits for that retrofit.", 2.4);
      return;
    }

    this.credits -= selectedPart.price;
    this.shipUpgradeIds = replaceInstalledPart(this.shipUpgradeIds, selectedPart.id);
    this.audio.repair();
    this.setStatus(`${selectedPart.shortName} installed for ${selectedPart.price} CR.`, 2.6);
  }

  private updateRouteTravel(dt: number): void {
    if (!this.activeRoute) {
      this.overshootRecovery = null;
      return;
    }

    const destination = this.activeRouteDestination();
    const contact = this.activeRouteContact();
    if (!destination || !contact) {
      this.activeRoute = null;
      this.overshootRecovery = null;
      return;
    }

    const overshootRecovery = this.currentOvershootRecovery();
    if (overshootRecovery) {
      const nextElapsed = overshootRecovery.elapsed + dt;
      if (nextElapsed >= overshootRecovery.duration) {
        this.activeRoute = {
          ...this.activeRoute,
          remainingDistance: overshootRecovery.targetRemainingDistance,
          captureBandIndex: overshootRecovery.targetCaptureBandIndex
        };
        this.overshootRecovery = null;
      } else {
        this.overshootRecovery = {
          ...overshootRecovery,
          elapsed: nextElapsed
        };
      }
      return;
    }

    const transitRate = this.currentTransitRate();
    const approachRatio = 1 - clamp(this.activeRoute.remainingDistance / this.activeRoute.approachDistance, 0, 1);
    const approachDrag = 1 - approachRatio * 0.58;
    const nextRemaining = this.activeRoute.remainingDistance - transitRate * approachDrag * dt;
    let nextCaptureBand = this.activeRoute.captureBandIndex;

    while (nextCaptureBand < destination.approachBands.length) {
      const band = destination.approachBands[nextCaptureBand]!;
      if (nextRemaining > this.captureCheckpointDistance(destination, nextCaptureBand)) {
        break;
      }
      if (this.ssi > band.maxSsi) {
        break;
      }
      nextCaptureBand += 1;
      this.audio.beep(740 + nextCaptureBand * 48, 0.05, "sine");
      this.setStatus(`${band.label} captured. ${band.description}`, 2.6);
    }

    if (
      nextCaptureBand >= destination.approachBands.length &&
      nextRemaining <= 0 &&
      this.ssi <= ORBIT_STOP_SSI &&
      this.throttle <= 8
    ) {
      this.activeRoute = null;
      this.overshootRecovery = null;
      this.routeEngageAnimation = null;
      this.currentLocationId = contact.id;
      this.wakeOriginId = contact.id;
      this.trackedDestinationId = contact.id;
      this.throttle = 0;
      this.ssi = 0;
      this.orbitMenuIndex = 0;
      this.orbitScreenMode = "menu";
      this.marketSelectionIndex = 0;
      this.marketAction = "buy";
      this.marketPulse += 1;
      this.writeAutosave();
      this.showTransmission({
        sender: destination.comms.arrival.sender,
        channel: contact.name,
        subject: destination.comms.arrival.subject,
        body: destination.comms.arrival.body,
        accent: contact.accent
      });
      this.setStatus(`${contact.name} orbit captured. Services are live.`, 3);
      this.audio.repair();
      return;
    }

    if (nextRemaining < -destination.overshootDistance) {
      const fallbackBandIndex = Math.max(0, nextCaptureBand - 1);
      const fallbackDistance = destination.approachDistance * (0.72 - fallbackBandIndex * 0.18);
      const targetRemainingDistance = Math.max(destination.approachDistance * 0.34, fallbackDistance);
      this.activeRoute = {
        ...this.activeRoute,
        remainingDistance: nextRemaining,
        captureBandIndex: nextCaptureBand
      };
      this.overshootRecovery = {
        destinationId: contact.id,
        startRemainingDistance: nextRemaining,
        targetRemainingDistance,
        startCaptureBandIndex: nextCaptureBand,
        targetCaptureBandIndex: fallbackBandIndex,
        elapsed: 0,
        duration: OVERSHOOT_RECOVERY_DURATION,
        turnDirection: destination.visual.approachOffsetX >= 0 ? 1 : -1
      };
      this.setStatus("Approach overshot. Traffic is turning you wide for another pass.", 3.2);
      this.showTransmission({
        sender: destination.comms.overshoot.sender,
        channel: contact.name,
        subject: destination.comms.overshoot.subject,
        body: destination.comms.overshoot.body,
        accent: contact.accent
      }, 6.8);
      this.audio.impact();
      return;
    }

    this.activeRoute = {
      ...this.activeRoute,
      remainingDistance: nextRemaining,
      captureBandIndex: nextCaptureBand
    };
  }

  private captureCheckpointDistance(destination: TravelDestination, bandIndex: number): number {
    const ratios = [0.74, 0.42, 0.12];
    const ratio = ratios[bandIndex] ?? 0.12;
    return destination.approachDistance * ratio;
  }

  private handleOverlayNavigation(): void {
    if (this.mapExpanded) {
      if (this.actions.wasPressed("menu_up")) {
        this.selectedNavIndex = (this.selectedNavIndex + NAV_CONTACTS.length - 1) % NAV_CONTACTS.length;
      }
      if (this.actions.wasPressed("menu_down")) {
        this.selectedNavIndex = (this.selectedNavIndex + 1) % NAV_CONTACTS.length;
      }
      if (this.actions.wasPressed("menu_confirm")) {
        this.confirmMapSelection();
      }
      return;
    }

    if (!this.questLogExpanded) {
      return;
    }

    if (this.actions.wasPressed("menu_left")) {
      this.questFocusColumn = "contract";
    }
    if (this.actions.wasPressed("menu_right")) {
      this.questFocusColumn = "sync";
    }

    if (this.questFocusColumn === "contract") {
      if (this.actions.wasPressed("menu_up")) {
        this.questSelectionIndex = (this.questSelectionIndex + FIRST_QUEST.steps.length - 1) % FIRST_QUEST.steps.length;
      }
      if (this.actions.wasPressed("menu_down")) {
        this.questSelectionIndex = (this.questSelectionIndex + 1) % FIRST_QUEST.steps.length;
      }
      if (this.actions.wasPressed("menu_confirm")) {
        const step = FIRST_QUEST.steps[this.questSelectionIndex]!;
        this.setStatus(`Quest focus pinned to ${step.label}.`, 2.2);
      }
      return;
    }

    if (this.actions.wasPressed("menu_up")) {
      this.syncSelectionIndex = (this.syncSelectionIndex + 3) % 4;
    }
    if (this.actions.wasPressed("menu_down")) {
      this.syncSelectionIndex = (this.syncSelectionIndex + 1) % 4;
    }
    if (this.actions.wasPressed("menu_confirm")) {
      if (this.syncSelectionIndex === 0) {
        this.setStatus("Autosave writes on quest clears and other safe milestones.", 2.6);
        return;
      }
      this.writeManualSync(`slot${this.syncSelectionIndex}` as ManualSaveSlotId);
    }
  }

  private confirmMapSelection(): void {
    const contact = NAV_CONTACTS[this.selectedNavIndex] ?? NAV_CONTACTS[0];
    if (!contact) {
      return;
    }

    if (contact.id === this.currentLocationId) {
      this.trackedDestinationId = contact.id;
      this.setStatus(`Already holding orbit at ${contact.name}.`, 2.2);
      this.audio.beep(420, 0.05, "triangle");
      return;
    }

    if (!this.syncUnlocked) {
      this.trackedDestinationId = contact.id;
      this.setStatus(`Route pinned to ${contact.name}. Clear the charter before you burn for it.`, 2.8);
      this.audio.beep(280, 0.05, "triangle");
      return;
    }

    if (!contact.destination) {
      this.trackedDestinationId = contact.id;
      this.setStatus(`Route archived to ${contact.name}. Live travel is not wired there yet.`, 2.8);
      this.audio.beep(360, 0.05, "triangle");
      return;
    }

    this.startRouteTravel(contact);
  }

  private startRouteTravel(contact: NavContact): void {
    const destination = contact.destination;
    if (!destination) {
      return;
    }

    const routeProfile = this.routePreviewForDestination(contact.id);
    if (!routeProfile) {
      this.audio.beep(280, 0.05, "triangle");
      this.setStatus(`No stable wake profile resolved for ${contact.name}.`, 2.8);
      return;
    }

    this.trackedDestinationId = contact.id;
    this.currentLocationId = FREE_WAKE_LOCATION_ID;
    this.wakeOriginId = routeProfile.originId !== FREE_WAKE_LOCATION_ID ? routeProfile.originId : this.wakeOriginId;
    this.cancelVoidSecretDrift();
    this.activeRoute = {
      originId: routeProfile.originId,
      destinationId: contact.id,
      totalDistance: routeProfile.totalDistance,
      approachDistance: destination.approachDistance,
      overshootDistance: destination.overshootDistance,
      remainingDistance: routeProfile.totalDistance,
      captureBandIndex: 0,
      routeWonderId: routeProfile.wonderId
    };
    this.overshootRecovery = null;
    this.startRouteEngageAnimation(routeProfile, contact, destination);
    this.mapExpanded = false;
    this.audio.beep(680, 0.06, "sine");
    this.audio.whoosh();
    this.setStatus(`Burn engaged to ${contact.name}. Push SSI high, then brake cleanly into orbit.`, 3.4);
    this.showTransmission({
      sender: destination.comms.routeOpen.sender,
      channel: contact.name,
      subject: destination.comms.routeOpen.subject,
      body: destination.comms.routeOpen.body,
      accent: contact.accent
    });
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
    if (this.certificationPassed || this.questComplete()) {
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
      this.stageIndex += 1;
      this.holdProgress = 0;

      if (this.stageIndex >= CERTIFICATION_BANDS.length) {
        this.completeExplorerCharter("Band sequence complete. Explorer lane filed and registry sync unlocked.");
        return;
      }

      const nextBand = CERTIFICATION_BANDS[this.stageIndex]!;
      this.setStatus(`${band.label} synced. Next window: ${nextBand.label}.`, 2.8);
    }
  }

  private renderBackdrop(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const viewHeight = this.viewHeight;
    const speedRatio = clamp(this.ssi / SSI_EFFECT_CEILING, 0, 1);
    const veilFade = clamp(this.singularityVeilProgress, 0, 1);
    const veilEase = Math.pow(veilFade, 0.9);
    const veilIntensity = veilEase * (0.86 + Math.sin(this.clock * 1.8) * 0.08);
    const voidFade = this.muteReachVoidFade;

    renderer.clear(voidFade > 0.08 ? "#010102" : "#03050a");

    const sky = ctx.createLinearGradient(0, 0, 0, viewHeight);
    sky.addColorStop(0, veilFade > 0.02 ? "#02030a" : "#010204");
    sky.addColorStop(0.46, veilFade > 0.02 ? "#060918" : "#04060a");
    sky.addColorStop(1, veilFade > 0.02 ? "#080b17" : "#090c12");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, renderer.width, viewHeight);

    const horizonGlow = ctx.createRadialGradient(this.vanishX, this.vanishY, 0, this.vanishX, this.vanishY, renderer.width * 0.45);
    const horizonFade = (1 - veilEase * 0.96) * (1 - voidFade);
    horizonGlow.addColorStop(0, `rgba(255, 238, 190, ${((0.04 + speedRatio * 0.08) * horizonFade).toFixed(3)})`);
    horizonGlow.addColorStop(0.38, `rgba(117, 131, 161, ${((0.03 + speedRatio * 0.04) * horizonFade).toFixed(3)})`);
    horizonGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, 0, renderer.width, viewHeight);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, renderer.width, viewHeight);
    ctx.clip();

    if (veilFade > 0) {
      ctx.fillStyle = `rgba(3, 6, 18, ${(veilEase * 0.64).toFixed(3)})`;
      ctx.fillRect(0, 0, renderer.width, viewHeight);

      const tunnelGlow = ctx.createRadialGradient(this.vanishX, this.vanishY, 0, this.vanishX, this.vanishY, renderer.width * (0.18 + veilIntensity * 0.46));
      tunnelGlow.addColorStop(0, `rgba(246, 240, 255, ${(0.06 + veilIntensity * 0.18).toFixed(3)})`);
      tunnelGlow.addColorStop(0.12, `rgba(195, 175, 255, ${(0.08 + veilIntensity * 0.2).toFixed(3)})`);
      tunnelGlow.addColorStop(0.28, `rgba(95, 227, 255, ${(0.08 + veilIntensity * 0.18).toFixed(3)})`);
      tunnelGlow.addColorStop(0.54, `rgba(18, 28, 62, ${(0.22 + veilIntensity * 0.28).toFixed(3)})`);
      tunnelGlow.addColorStop(0.86, `rgba(5, 8, 17, ${(0.2 + veilIntensity * 0.26).toFixed(3)})`);
      tunnelGlow.addColorStop(1, `rgba(0, 0, 0, ${(0.06 + veilIntensity * 0.14).toFixed(3)})`);
      ctx.fillStyle = tunnelGlow;
      ctx.fillRect(0, 0, renderer.width, viewHeight);

      const throatRadius = 18 + veilIntensity * 18 + Math.sin(this.clock * 3.4) * 2.4;
      const throat = ctx.createRadialGradient(this.vanishX, this.vanishY, 0, this.vanishX, this.vanishY, throatRadius * 1.9);
      throat.addColorStop(0, `rgba(2, 2, 7, ${(0.96 * veilEase).toFixed(3)})`);
      throat.addColorStop(0.42, `rgba(13, 8, 28, ${(0.8 * veilEase).toFixed(3)})`);
      throat.addColorStop(0.78, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = throat;
      ctx.fillRect(this.vanishX - throatRadius * 2.2, this.vanishY - throatRadius * 2.2, throatRadius * 4.4, throatRadius * 4.4);

      const tunnelBands = 14;
      for (let i = 0; i < tunnelBands; i += 1) {
        const phase = (((this.clock * 0.86) + i / tunnelBands) % 1 + 1) % 1;
        const depth = Math.pow(phase, 1.5);
        const radius = 16 + depth * renderer.width * (0.34 + veilIntensity * 0.72);
        const pinch = 7 + depth * viewHeight * (0.1 + veilIntensity * 0.42);
        ctx.beginPath();
        ctx.lineWidth = 0.8 + (1 - phase) * (1.6 + veilIntensity * 3.2);
        ctx.strokeStyle = i % 2 === 0
          ? `rgba(151, 236, 255, ${(0.03 + veilEase * 0.12 + (1 - phase) * 0.18).toFixed(3)})`
          : `rgba(222, 180, 255, ${(0.03 + veilEase * 0.11 + (1 - phase) * 0.17).toFixed(3)})`;
        ctx.ellipse(
          this.vanishX,
          this.vanishY,
          radius,
          pinch,
          Math.sin(this.clock * 0.34 + i * 0.7) * 0.22,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }

      const railCount = 22;
      for (let i = 0; i < railCount; i += 1) {
        const angle = (Math.PI * 2 * i) / railCount + this.clock * 0.11;
        const startX = this.vanishX + Math.cos(angle) * (10 + veilIntensity * 8);
        const startY = this.vanishY + Math.sin(angle) * (4 + veilIntensity * 4);
        const midRadius = renderer.width * (0.16 + veilIntensity * 0.14);
        const endRadius = renderer.width * (0.44 + veilIntensity * 0.52);
        const curve = Math.sin(this.clock * 0.48 + i * 0.41) * (22 + veilIntensity * 34);
        const midX = this.vanishX + Math.cos(angle) * midRadius - Math.sin(angle) * curve;
        const midY = this.vanishY + Math.sin(angle) * midRadius * 0.34 + Math.cos(angle) * curve * 0.12;
        const endX = this.vanishX + Math.cos(angle) * endRadius - Math.sin(angle) * curve * 1.2;
        const endY = this.vanishY + Math.sin(angle) * endRadius * 0.46 + Math.cos(angle) * curve * 0.16;
        ctx.beginPath();
        ctx.lineWidth = 0.7 + veilIntensity * 1.8;
        ctx.strokeStyle = i % 2 === 0
          ? `rgba(203, 242, 255, ${(0.03 + veilEase * 0.16).toFixed(3)})`
          : `rgba(211, 187, 255, ${(0.03 + veilEase * 0.14).toFixed(3)})`;
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(midX, midY, endX, endY);
        ctx.stroke();
      }

      for (let i = 0; i < 8; i += 1) {
        const arcRadius = 54 + i * 76 + ((this.clock * (120 + i * 12) + i * 48) % 180);
        ctx.beginPath();
        ctx.lineWidth = 0.9 + veilIntensity * 1.6;
        ctx.strokeStyle = i % 2 === 0
          ? `rgba(121, 241, 255, ${(0.02 + veilEase * 0.08 - i * 0.005).toFixed(3)})`
          : `rgba(222, 176, 255, ${(0.02 + veilEase * 0.074 - i * 0.005).toFixed(3)})`;
        ctx.ellipse(
          this.vanishX,
          this.vanishY,
          arcRadius * 1.42,
          arcRadius * 0.28,
          Math.cos(this.clock * 0.18 + i) * 0.14,
          Math.PI * 0.07,
          Math.PI * 0.93
        );
        ctx.stroke();
      }

      const edgeVignette = ctx.createRadialGradient(this.vanishX, this.vanishY, renderer.width * 0.12, this.vanishX, this.vanishY, renderer.width * 0.92);
      edgeVignette.addColorStop(0, "rgba(0, 0, 0, 0)");
      edgeVignette.addColorStop(0.58, `rgba(7, 12, 26, ${(veilEase * 0.08).toFixed(3)})`);
      edgeVignette.addColorStop(1, `rgba(2, 4, 10, ${(veilEase * 0.52).toFixed(3)})`);
      ctx.fillStyle = edgeVignette;
      ctx.fillRect(0, 0, renderer.width, viewHeight);
    }

    if (voidFade > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${(0.18 + voidFade * 0.64).toFixed(3)})`;
      ctx.fillRect(0, 0, renderer.width, viewHeight);

      const absence = ctx.createRadialGradient(this.vanishX, this.vanishY, renderer.width * 0.08, this.vanishX, this.vanishY, renderer.width * 0.82);
      absence.addColorStop(0, `rgba(0, 0, 0, ${(0.14 + voidFade * 0.44).toFixed(3)})`);
      absence.addColorStop(0.52, `rgba(0, 0, 0, ${(0.1 + voidFade * 0.28).toFixed(3)})`);
      absence.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = absence;
      ctx.fillRect(0, 0, renderer.width, viewHeight);
    }

    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.lineWidth = 1.4 + i * 0.5;
      ctx.strokeStyle = `rgba(178, 188, 214, ${((0.05 + speedRatio * 0.04 - i * 0.008) * (1 - veilFade) * (1 - voidFade)).toFixed(3)})`;
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
    const veilFade = this.singularityVeilProgress;
    const wonderState = this.currentRouteWonderState();
    const voidFade = this.muteReachVoidFade;
    const starlessFade =
      wonderState?.wonder.id === "starless-run"
        ? 1 - wonderState.intensity * (0.72 + wonderState.wonderProgress * 0.24)
        : 1;

    if (veilFade > 0.9) {
      return;
    }

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
      const starFade = Math.pow(1 - veilFade, 2.2) * starlessFade * (1 - voidFade);
      const color = `rgba(250, 252, 255, ${(Math.min(0.95, alpha) * starFade).toFixed(3)})`;

      if (speedRatio > 0.07 || veilFade > 0) {
        const trailBase = motionLength * (1.4 + speedRatio * 6.2) + star.depth * speedRatio * 26;
        const trail = collapseRatio > 0 ? trailBase * (1 - collapseRatio * 0.58) : trailBase;
        renderer.line(
          star.x - unitX * trail,
          star.y - unitY * trail,
          star.x,
          star.y,
          `rgba(221, 236, 255, ${(Math.min(0.98, alpha) * starFade).toFixed(3)})`,
          (0.8 + star.depth * 1.3) * starFade
        );
        if (collapseRatio > 0.08) {
          const snap = (4 + collapseRatio * 14 + star.depth * 5) * (this.surgeMajor ? 1.12 : 1);
          const collapseColor = `rgba(214, 233, 255, ${((0.22 + collapseRatio * 0.34 + star.depth * 0.16) * starFade).toFixed(3)})`;
          renderer.line(star.x - unitX * snap, star.y - unitY * snap, star.x, star.y, collapseColor, (0.6 + star.depth) * starFade);
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

  private renderRouteWonder(): void {
    const wonderState = this.currentRouteWonderState();
    if (!wonderState) {
      return;
    }

    const { renderer } = this.services;
    const { ctx } = renderer;
    const width = renderer.width;
    const height = this.viewHeight;
    const { wonder, intensity, wonderProgress } = wonderState;
    const alpha = intensity * clamp(1 - this.singularityVeilProgress * 1.28, 0, 1);
    const labelTagAlpha =
      alpha *
      clamp(wonderProgress / 0.12, 0, 1) *
      clamp((0.68 - wonderProgress) / 0.68, 0, 1);
    if (alpha <= 0.02) {
      return;
    }

    const accentRgb =
      wonder.id === "prism-shear" ? "203, 189, 255" :
      wonder.id === "crown-arcs" ? "143, 209, 255" :
      wonder.id === "petal-veil" ? "255, 158, 203" :
      wonder.id === "choir-span" ? "255, 215, 164" :
      wonder.id === "ashwake-reef" ? "255, 177, 141" :
      wonder.id === "red-wake-cataract" ? "255, 143, 127" :
      wonder.id === "graveglass-drift" ? "216, 239, 255" :
      wonder.id === "starless-run" ? "158, 179, 199" :
      "142, 223, 255";
    const labelLayout =
      wonder.id === "prism-shear" ? { textX: width * 0.72, textY: height * 0.18, targetX: width * 0.6, targetY: height * 0.34 } :
      wonder.id === "crown-arcs" ? { textX: width * 0.3, textY: height * 0.16, targetX: width * 0.4, targetY: height * 0.28 } :
      wonder.id === "petal-veil" ? { textX: width * 0.74, textY: height * 0.22, targetX: width * 0.62, targetY: height * 0.34 } :
      wonder.id === "choir-span" ? { textX: width * 0.76, textY: height * 0.16, targetX: width * 0.62, targetY: height * 0.3 } :
      wonder.id === "ashwake-reef" ? { textX: width * 0.72, textY: height * 0.54, targetX: width * 0.56, targetY: height * 0.46 } :
      wonder.id === "red-wake-cataract" ? { textX: width * 0.78, textY: height * 0.18, targetX: width * 0.54, targetY: height * 0.4 } :
      wonder.id === "graveglass-drift" ? { textX: width * 0.72, textY: height * 0.22, targetX: width * 0.58, targetY: height * 0.4 } :
      wonder.id === "starless-run" ? { textX: width * 0.76, textY: height * 0.18, targetX: width * 0.66, targetY: height * 0.34 } :
      { textX: width * 0.34, textY: height * 0.18, targetX: width * 0.38, targetY: height * 0.34 };

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();

    switch (wonder.id) {
      case "prism-shear": {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < 5; i += 1) {
          const bandX = width * (0.18 + i * 0.16 + Math.sin(this.clock * 0.11 + i) * 0.02);
          const gradient = ctx.createLinearGradient(bandX - 42, 0, bandX + 42, 0);
          gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
          gradient.addColorStop(0.5, `rgba(${accentRgb}, ${(0.06 + alpha * 0.22 - i * 0.01).toFixed(3)})`);
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = gradient;
          ctx.fillRect(bandX - 44, 0, 88, height);
          ctx.strokeStyle = `rgba(232, 239, 255, ${(0.08 + alpha * 0.3).toFixed(3)})`;
          ctx.lineWidth = 1 + i * 0.14;
          ctx.beginPath();
          ctx.moveTo(bandX - 36, -20);
          ctx.lineTo(bandX + 24, height + 20);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }

      case "crown-arcs": {
        for (let i = 0; i < 4; i += 1) {
          const startX = width * (0.12 + i * 0.18);
          const endX = startX + width * 0.28;
          const arcY = height * (0.16 + i * 0.13);
          ctx.strokeStyle = `rgba(${accentRgb}, ${(0.08 + alpha * 0.28 - i * 0.012).toFixed(3)})`;
          ctx.lineWidth = 1.6 + i * 0.3;
          ctx.beginPath();
          ctx.moveTo(startX, arcY);
          ctx.bezierCurveTo(
            startX + 40,
            arcY - 46 - i * 8,
            endX - 54,
            arcY + 52 + Math.sin(this.clock * 0.8 + i) * 10,
            endX,
            arcY + 6
          );
          ctx.stroke();
        }
        break;
      }

      case "petal-veil": {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < 5; i += 1) {
          const petalX = width * (0.22 + i * 0.14);
          const petalY = height * (0.2 + (i % 2) * 0.14);
          const petal = ctx.createRadialGradient(petalX, petalY, 0, petalX, petalY, 120 + i * 18);
          petal.addColorStop(0, `rgba(${accentRgb}, ${(0.05 + alpha * 0.16).toFixed(3)})`);
          petal.addColorStop(0.58, `rgba(255, 196, 221, ${(0.04 + alpha * 0.12).toFixed(3)})`);
          petal.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = petal;
          ctx.beginPath();
          ctx.ellipse(petalX, petalY, 110 + i * 12, 48 + i * 6, -0.34 + i * 0.08, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        break;
      }

      case "choir-span": {
        const leftGlow = ctx.createRadialGradient(width * 0.18, height * 0.34, 0, width * 0.18, height * 0.34, 140);
        leftGlow.addColorStop(0, `rgba(255, 244, 218, ${(0.04 + alpha * 0.18).toFixed(3)})`);
        leftGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = leftGlow;
        ctx.fillRect(0, 0, width, height);
        const rightGlow = ctx.createRadialGradient(width * 0.82, height * 0.26, 0, width * 0.82, height * 0.26, 150);
        rightGlow.addColorStop(0, `rgba(${accentRgb}, ${(0.04 + alpha * 0.22).toFixed(3)})`);
        rightGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = rightGlow;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = `rgba(${accentRgb}, ${(0.08 + alpha * 0.24).toFixed(3)})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(width * 0.12, height * 0.38);
        ctx.bezierCurveTo(width * 0.32, height * 0.31, width * 0.58, height * 0.23, width * 0.88, height * 0.28);
        ctx.stroke();
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(width * 0.1, height * 0.42);
        ctx.bezierCurveTo(width * 0.32, height * 0.36, width * 0.56, height * 0.28, width * 0.9, height * 0.32);
        ctx.stroke();
        break;
      }

      case "ashwake-reef": {
        for (let i = 0; i < 16; i += 1) {
          const shardX = width * (0.12 + (i % 8) * 0.1) + Math.sin(this.clock * 0.2 + i) * 12;
          const shardY = height * (0.18 + Math.floor(i / 8) * 0.22) + i * 4;
          const w = 18 + (i % 3) * 8;
          const h = 4 + (i % 2) * 2;
          ctx.save();
          ctx.translate(shardX, shardY);
          ctx.rotate(-0.42 + (i % 5) * 0.18);
          ctx.fillStyle = `rgba(${accentRgb}, ${(0.07 + alpha * 0.22 - (i % 4) * 0.01).toFixed(3)})`;
          ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
          ctx.restore();
        }
        break;
      }

      case "red-wake-cataract": {
        for (let i = 0; i < 8; i += 1) {
          ctx.strokeStyle = `rgba(${accentRgb}, ${(0.08 + alpha * 0.26 - i * 0.015).toFixed(3)})`;
          ctx.lineWidth = 1.1 + i * 0.18;
          ctx.beginPath();
          ctx.moveTo(width * (0.06 + i * 0.08), -24);
          ctx.bezierCurveTo(
            width * (0.14 + i * 0.08),
            height * 0.2,
            width * (0.18 + i * 0.08),
            height * 0.58,
            width * (0.24 + i * 0.08),
            height + 20
          );
          ctx.stroke();
        }
        break;
      }

      case "graveglass-drift": {
        for (let i = 0; i < 14; i += 1) {
          const shardX = width * (0.14 + (i % 7) * 0.12);
          const shardY = height * (0.18 + Math.floor(i / 7) * 0.34) + Math.sin(this.clock * 0.7 + i) * 10;
          ctx.save();
          ctx.translate(shardX, shardY);
          ctx.rotate(i * 0.34);
          ctx.strokeStyle = `rgba(${accentRgb}, ${(0.08 + alpha * 0.3 - i * 0.01).toFixed(3)})`;
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(-8, 0);
          ctx.lineTo(0, -12);
          ctx.lineTo(8, 0);
          ctx.lineTo(0, 12);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        }
        break;
      }

      case "starless-run": {
        const fade = ctx.createLinearGradient(0, 0, width, 0);
        fade.addColorStop(0, `rgba(2, 4, 8, ${(0.08 + alpha * 0.26).toFixed(3)})`);
        fade.addColorStop(0.56, `rgba(2, 4, 8, ${(0.18 + alpha * 0.42 + wonderProgress * 0.14).toFixed(3)})`);
        fade.addColorStop(1, `rgba(2, 4, 8, ${(0.3 + alpha * 0.48 + wonderProgress * 0.2).toFixed(3)})`);
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, width, height);
        for (let i = 0; i < 5; i += 1) {
          const x = width * (0.18 + i * 0.17);
          const y = height * (0.2 + (i % 2) * 0.22);
          renderer.circle(x, y, 1.4 + (i % 3) * 0.6, `rgba(214, 226, 240, ${(0.12 + alpha * 0.3).toFixed(3)})`);
        }
        break;
      }

      case "dead-relay-chain": {
        const startX = width * 0.18;
        const startY = height * 0.26;
        for (let i = 0; i < 6; i += 1) {
          const markerX = startX + i * width * 0.1;
          const markerY = startY + i * height * 0.08;
          renderer.line(markerX - 10, markerY, markerX + 10, markerY, `rgba(${accentRgb}, ${(0.08 + alpha * 0.22).toFixed(3)})`, 1.2);
          renderer.line(markerX, markerY - 10, markerX, markerY + 10, `rgba(${accentRgb}, ${(0.08 + alpha * 0.22).toFixed(3)})`, 1.2);
          renderer.circle(markerX, markerY, 2.4, `rgba(247, 239, 216, ${(0.14 + alpha * 0.34).toFixed(3)})`);
          if (i > 0) {
            renderer.line(
              markerX - width * 0.1,
              markerY - height * 0.08,
              markerX,
              markerY,
              `rgba(149, 176, 201, ${(0.06 + alpha * 0.18).toFixed(3)})`,
              1
            );
          }
        }
        break;
      }
    }

    if (labelTagAlpha > 0.02) {
      renderer.line(
        labelLayout.textX - 6,
        labelLayout.textY + 8,
        labelLayout.targetX,
        labelLayout.targetY,
        `rgba(188, 206, 226, ${(0.14 + labelTagAlpha * 0.54).toFixed(3)})`,
        1
      );
      renderer.circle(
        labelLayout.targetX,
        labelLayout.targetY,
        2.4,
        `rgba(247, 239, 216, ${(0.16 + labelTagAlpha * 0.6).toFixed(3)})`
      );
      renderer.text("ROUTE SIGNATURE", labelLayout.textX, labelLayout.textY, {
        color: `rgba(188, 206, 226, ${(0.14 + labelTagAlpha * 0.5).toFixed(3)})`,
        font: "10px Trebuchet MS"
      });
      renderer.text(wonder.label.toUpperCase(), labelLayout.textX, labelLayout.textY + 16, {
        color: `rgba(247, 239, 216, ${(0.2 + labelTagAlpha * 0.68).toFixed(3)})`,
        font: "bold 12px Trebuchet MS"
      });
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

  private renderOvershootTurnIndicator(
    bodyX: number,
    bodyY: number,
    bodyRadius: number,
    accent: string,
    turnDirection: -1 | 1,
    ratio: number
  ): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const pulse = Math.sin(ratio * Math.PI);
    const alpha = 0.16 + pulse * 0.34;
    const arcRadiusX = bodyRadius * 1.12 + 34;
    const arcRadiusY = bodyRadius * 0.78 + 20;
    const arcCenterX = bodyX + turnDirection * (bodyRadius * 0.8 + 22);
    const arcCenterY = bodyY - bodyRadius * 0.08;
    const startAngle = turnDirection > 0 ? Math.PI * 0.92 : Math.PI * 0.08;
    const endAngle = turnDirection > 0 ? Math.PI * 0.12 : Math.PI * 0.88;
    const tipAngle = turnDirection > 0 ? Math.PI * 0.12 : Math.PI * 0.88;
    const tipX = arcCenterX + Math.cos(tipAngle) * arcRadiusX;
    const tipY = arcCenterY + Math.sin(tipAngle) * arcRadiusY;

    ctx.save();
    ctx.strokeStyle = `rgba(255, 239, 208, ${alpha.toFixed(3)})`;
    ctx.lineWidth = 1.3 + pulse * 1.4;
    ctx.setLineDash([11, 8]);
    ctx.beginPath();
    ctx.ellipse(
      arcCenterX,
      arcCenterY,
      arcRadiusX,
      arcRadiusY,
      turnDirection * 0.16,
      startAngle,
      endAngle,
      turnDirection < 0
    );
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255, 243, 218, ${(alpha + 0.08).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - turnDirection * 11, tipY - 7);
    ctx.lineTo(tipX - turnDirection * 8, tipY + 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    renderer.text("TURN WIDE", bodyX + turnDirection * 114, bodyY - bodyRadius - 28, {
      align: "center",
      color: `rgba(247, 239, 216, ${(0.34 + pulse * 0.58).toFixed(3)})`,
      font: "bold 11px Trebuchet MS"
    });
    renderer.text("TRAFFIC LOOP", bodyX + turnDirection * 114, bodyY - bodyRadius - 14, {
      align: "center",
      color: `rgba(180, 205, 232, ${(0.24 + pulse * 0.44).toFixed(3)})`,
      font: "10px Trebuchet MS"
    });
    renderer.circle(bodyX, bodyY, Math.max(4, bodyRadius * 0.05 + pulse * 5), accent);
  }

  private renderDestinationApproach(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const contact = this.activeRoute ? this.activeRouteContact() : this.navContactById(this.currentLocationId);
    const destination = this.activeRoute ? this.activeRouteDestination() : this.travelDestinationFor(this.currentLocationId);
    if (!contact || !destination) {
      return;
    }

    const inTransit = this.activeRoute !== null;
    const routeDisplay = this.routeDisplayState();
    const overshootRecovery = this.currentOvershootRecovery();
    const routeEngage = this.currentRouteEngageAnimation();
    const totalDistance = this.activeRoute?.totalDistance ?? destination.totalDistance;
    const remainingDistance = routeDisplay?.remainingDistance ?? 0;
    const captureBandIndex = routeDisplay?.captureBandIndex ?? 0;
    const overshootRatio = routeDisplay?.overshootRatio ?? 0;
    const progress = inTransit ? 1 - clamp(Math.max(0, remainingDistance) / totalDistance, 0, 1) : 1;
    const approachRatio = inTransit
      ? 1 - clamp(remainingDistance / destination.approachDistance, 0, 1)
      : 1;
    const settleRatio = inTransit ? clamp(1 - this.ssi / Math.max(ORBIT_STOP_SSI * 3, 1), 0, 1) : 1;
    const signalAlpha = clamp(0.22 + progress * 0.54, 0, 0.92);
    const veilFade = inTransit ? this.singularityVeilProgress : 0;
    if (veilFade > 0.55) {
      return;
    }
    const bodyRadius = 6 + Math.pow(progress, 1.55) * 112;
    const turnPulse = overshootRecovery ? Math.sin(overshootRatio * Math.PI) : 0;
    const bodyX =
      this.baseVanishX +
      destination.visual.approachOffsetX +
      (routeEngage?.destinationOffsetX ?? 0) +
      (overshootRecovery ? overshootRecovery.turnDirection * turnPulse * (84 + bodyRadius * 0.34) : 0);
    const bodyY =
      this.baseVanishY +
      destination.visual.approachOffsetY +
      (routeEngage?.destinationOffsetY ?? 0) +
      (1 - progress) * 18 -
      turnPulse * (20 + bodyRadius * 0.06);
    const stationOrbitRadius = bodyRadius + 26 + approachRatio * 16;
    const stationAngle =
      this.clock * 0.34 +
      0.82 +
      (overshootRecovery ? overshootRecovery.turnDirection * overshootRatio * 0.42 : 0);
    const stationX = bodyX + Math.cos(stationAngle) * stationOrbitRadius;
    const stationY = bodyY + Math.sin(stationAngle) * stationOrbitRadius * 0.42;

    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - veilFade * 1.4) * (0.84 + (routeEngage?.signalAlpha ?? 0) * 0.16);
    ctx.beginPath();
    ctx.rect(0, 0, renderer.width, this.viewHeight);
    ctx.clip();

    const glare = ctx.createRadialGradient(bodyX, bodyY, 0, bodyX, bodyY, bodyRadius * 2.8);
    glare.addColorStop(0, `${destination.visual.glowColor}${Math.round(signalAlpha * 96).toString(16).padStart(2, "0")}`);
    glare.addColorStop(0.42, `${destination.visual.accentColor}${Math.round(signalAlpha * 42).toString(16).padStart(2, "0")}`);
    glare.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glare;
    ctx.fillRect(bodyX - bodyRadius * 3.2, bodyY - bodyRadius * 3.2, bodyRadius * 6.4, bodyRadius * 6.4);

    if (progress < 0.16) {
      renderer.circle(bodyX, bodyY, 2 + progress * 20, destination.visual.glowColor);
    }

    switch (destination.visual.bodyType) {
      case "ringed_giant": {
        ctx.save();
        ctx.strokeStyle = `rgba(189, 229, 255, ${(0.12 + approachRatio * 0.28).toFixed(3)})`;
        ctx.lineWidth = 1.1;
        for (let i = 0; i < 2; i += 1) {
          ctx.beginPath();
          ctx.ellipse(bodyX, bodyY, bodyRadius * (1.24 + i * 0.12), bodyRadius * (0.28 + i * 0.03), -0.28, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        const bodyFill = ctx.createRadialGradient(bodyX - bodyRadius * 0.34, bodyY - bodyRadius * 0.42, bodyRadius * 0.18, bodyX, bodyY, bodyRadius);
        bodyFill.addColorStop(0, destination.visual.glowColor);
        bodyFill.addColorStop(0.58, destination.visual.bodyColor);
        bodyFill.addColorStop(1, destination.visual.shadowColor);
        ctx.fillStyle = bodyFill;
        ctx.beginPath();
        ctx.arc(bodyX, bodyY, bodyRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.globalAlpha = 0.24 + progress * 0.26;
        ctx.strokeStyle = destination.visual.detailColor;
        ctx.lineWidth = Math.max(1, bodyRadius * 0.03);
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.ellipse(
            bodyX - bodyRadius * 0.05 * i,
            bodyY - bodyRadius * 0.28 + i * bodyRadius * 0.22,
            bodyRadius * (0.42 + i * 0.06),
            bodyRadius * (0.1 + i * 0.02),
            -0.2,
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = destination.visual.accentColor;
        ctx.lineWidth = Math.max(1.4, bodyRadius * 0.05);
        ctx.beginPath();
        ctx.ellipse(bodyX, bodyY, bodyRadius * 1.78, bodyRadius * 0.52, -0.26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 244, 218, ${(0.14 + approachRatio * 0.22).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.8, bodyRadius * 0.015);
        ctx.beginPath();
        ctx.ellipse(bodyX, bodyY, bodyRadius * 1.48, bodyRadius * 0.44, -0.26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        if (progress > 0.2) {
          renderer.circle(stationX, stationY, 4.4 + approachRatio * 4, destination.visual.stationAccent);
          renderer.rect(stationX - 12, stationY - 2, 24, 4, destination.visual.stationColor);
          renderer.rect(stationX - 4, stationY - 10, 8, 20, destination.visual.stationColor);
          renderer.strokeRect(stationX - 17, stationY - 7, 34, 14, "rgba(195, 229, 255, 0.34)", 1);
          renderer.line(bodyX, bodyY, stationX, stationY, `rgba(174, 220, 255, ${(0.08 + progress * 0.14).toFixed(3)})`, 1);
        }
        break;
      }

      case "white_dwarf": {
        const coreFill = ctx.createRadialGradient(bodyX, bodyY, bodyRadius * 0.06, bodyX, bodyY, bodyRadius);
        coreFill.addColorStop(0, destination.visual.glowColor);
        coreFill.addColorStop(0.36, destination.visual.bodyColor);
        coreFill.addColorStop(1, destination.visual.shadowColor);
        ctx.fillStyle = coreFill;
        ctx.beginPath();
        ctx.arc(bodyX, bodyY, bodyRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.globalAlpha = 0.28 + progress * 0.28;
        ctx.strokeStyle = destination.visual.detailColor;
        ctx.lineWidth = Math.max(1.2, bodyRadius * 0.04);
        for (let i = 0; i < 4; i += 1) {
          ctx.beginPath();
          ctx.arc(bodyX, bodyY, bodyRadius * (1.14 + i * 0.16), -0.7 + i * 0.4, 1.18 + i * 0.34);
          ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = destination.visual.accentColor;
        ctx.lineWidth = Math.max(1, bodyRadius * 0.018);
        renderer.line(bodyX - bodyRadius * 1.35, bodyY, bodyX + bodyRadius * 1.35, bodyY, destination.visual.accentColor, ctx.lineWidth);
        renderer.line(bodyX, bodyY - bodyRadius * 1.25, bodyX, bodyY + bodyRadius * 1.25, destination.visual.accentColor, ctx.lineWidth);
        ctx.restore();

        if (progress > 0.18) {
          renderer.circle(stationX, stationY, 6.2 + approachRatio * 3, destination.visual.stationAccent);
          renderer.rect(stationX - 24, stationY - 3, 48, 6, destination.visual.stationColor);
          renderer.rect(stationX - 3, stationY - 26, 6, 52, destination.visual.stationColor);
          renderer.rect(stationX - 18, stationY - 18, 36, 36, "rgba(14, 18, 25, 0.44)");
          renderer.strokeRect(stationX - 24, stationY - 24, 48, 48, "rgba(207, 240, 255, 0.36)", 1.1);
          renderer.line(bodyX, bodyY, stationX, stationY, `rgba(188, 236, 255, ${(0.1 + progress * 0.16).toFixed(3)})`, 1);
        }
        break;
      }

      case "scarred_moon": {
        const bodyFill = ctx.createRadialGradient(bodyX - bodyRadius * 0.28, bodyY - bodyRadius * 0.34, bodyRadius * 0.15, bodyX, bodyY, bodyRadius);
        bodyFill.addColorStop(0, destination.visual.glowColor);
        bodyFill.addColorStop(0.62, destination.visual.bodyColor);
        bodyFill.addColorStop(1, destination.visual.shadowColor);
        ctx.fillStyle = bodyFill;
        ctx.beginPath();
        ctx.arc(bodyX, bodyY, bodyRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.arc(bodyX, bodyY, bodyRadius, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalAlpha = 0.24 + progress * 0.24;
        ctx.fillStyle = destination.visual.detailColor;
        for (let i = 0; i < 5; i += 1) {
          const craterX = bodyX - bodyRadius * 0.44 + i * bodyRadius * 0.22;
          const craterY = bodyY - bodyRadius * 0.22 + (i % 2 === 0 ? bodyRadius * 0.12 : bodyRadius * 0.3);
          ctx.beginPath();
          ctx.arc(craterX, craterY, bodyRadius * (0.08 + (i % 3) * 0.03), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = destination.visual.accentColor;
        ctx.lineWidth = Math.max(1, bodyRadius * 0.022);
        ctx.beginPath();
        ctx.moveTo(bodyX - bodyRadius * 0.76, bodyY + bodyRadius * 0.18);
        ctx.lineTo(bodyX - bodyRadius * 0.14, bodyY + bodyRadius * 0.06);
        ctx.lineTo(bodyX + bodyRadius * 0.42, bodyY + bodyRadius * 0.22);
        ctx.stroke();
        ctx.restore();

        if (progress > 0.18) {
          renderer.circle(stationX, stationY, 4.6 + approachRatio * 2.8, destination.visual.stationAccent);
          renderer.rect(stationX - 18, stationY - 3, 36, 6, destination.visual.stationColor);
          renderer.rect(stationX - 6, stationY - 16, 12, 32, destination.visual.stationColor);
          renderer.line(stationX - 28, stationY - 14, stationX - 10, stationY - 4, destination.visual.stationColor, 2);
          renderer.line(stationX + 28, stationY - 14, stationX + 10, stationY - 4, destination.visual.stationColor, 2);
          renderer.line(stationX - 26, stationY + 14, stationX - 10, stationY + 4, destination.visual.stationColor, 2);
          renderer.line(stationX + 26, stationY + 14, stationX + 10, stationY + 4, destination.visual.stationColor, 2);
          renderer.line(bodyX, bodyY, stationX, stationY, `rgba(240, 206, 175, ${(0.1 + progress * 0.18).toFixed(3)})`, 1);
        }
        break;
      }

      case "anomaly": {
        const halo = ctx.createRadialGradient(bodyX, bodyY, bodyRadius * 0.18, bodyX, bodyY, bodyRadius * 1.65);
        halo.addColorStop(0, "rgba(0, 0, 0, 0)");
        halo.addColorStop(0.4, `${destination.visual.detailColor}7a`);
        halo.addColorStop(0.78, `${destination.visual.glowColor}33`);
        halo.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = halo;
        ctx.fillRect(bodyX - bodyRadius * 1.8, bodyY - bodyRadius * 1.8, bodyRadius * 3.6, bodyRadius * 3.6);

        ctx.fillStyle = destination.visual.bodyColor;
        ctx.beginPath();
        ctx.arc(bodyX, bodyY, bodyRadius * 0.94, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.strokeStyle = destination.visual.accentColor;
        ctx.lineWidth = Math.max(1, bodyRadius * 0.018);
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.ellipse(bodyX, bodyY, bodyRadius * (1.12 + i * 0.18), bodyRadius * (0.54 + i * 0.08), Math.sin(this.clock * 0.18 + i) * 0.24, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        if (progress > 0.2) {
          renderer.circle(stationX, stationY, 6 + approachRatio * 3, destination.visual.stationAccent);
          renderer.strokeRect(stationX - 18, stationY - 18, 36, 36, destination.visual.stationColor, 1.2);
          renderer.rect(stationX - 3, stationY - 22, 6, 44, destination.visual.stationColor);
          renderer.rect(stationX - 22, stationY - 3, 44, 6, destination.visual.stationColor);
          renderer.line(bodyX, bodyY, stationX, stationY, `rgba(186, 255, 214, ${(0.1 + progress * 0.18).toFixed(3)})`, 1);
        }
        break;
      }

      case "magnetar": {
        const beamAlpha = 0.08 + approachRatio * 0.22;
        renderer.line(
          bodyX - bodyRadius * 1.8,
          bodyY,
          bodyX + bodyRadius * 1.8,
          bodyY,
          `rgba(214, 237, 255, ${beamAlpha.toFixed(3)})`,
          Math.max(2, bodyRadius * 0.08)
        );
        renderer.line(
          bodyX,
          bodyY - bodyRadius * 1.9,
          bodyX,
          bodyY + bodyRadius * 1.9,
          `rgba(213, 242, 255, ${(beamAlpha * 0.9).toFixed(3)})`,
          Math.max(1.4, bodyRadius * 0.05)
        );
        const core = ctx.createRadialGradient(bodyX, bodyY, bodyRadius * 0.06, bodyX, bodyY, bodyRadius);
        core.addColorStop(0, destination.visual.glowColor);
        core.addColorStop(0.34, destination.visual.bodyColor);
        core.addColorStop(1, destination.visual.shadowColor);
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(bodyX, bodyY, bodyRadius * 0.72, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = destination.visual.detailColor;
        ctx.lineWidth = Math.max(1, bodyRadius * 0.02);
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.ellipse(bodyX, bodyY, bodyRadius * (1.08 + i * 0.16), bodyRadius * (0.26 + i * 0.04), 0.2 + i * 0.08, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (progress > 0.18) {
          renderer.rect(stationX - 22, stationY - 3, 44, 6, destination.visual.stationColor);
          renderer.rect(stationX - 3, stationY - 18, 6, 36, destination.visual.stationColor);
          renderer.circle(stationX, stationY, 5.2 + approachRatio * 3.2, destination.visual.stationAccent);
          renderer.line(bodyX, bodyY, stationX, stationY, `rgba(187, 227, 255, ${(0.12 + progress * 0.18).toFixed(3)})`, 1);
        }
        break;
      }

      case "black_hole": {
        ctx.save();
        ctx.strokeStyle = `rgba(230, 221, 255, ${(0.14 + progress * 0.24).toFixed(3)})`;
        ctx.lineWidth = Math.max(2.2, bodyRadius * 0.12);
        ctx.beginPath();
        ctx.ellipse(bodyX, bodyY, bodyRadius * 1.24, bodyRadius * 0.72, -0.24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = Math.max(1.1, bodyRadius * 0.04);
        ctx.strokeStyle = `rgba(151, 215, 255, ${(0.12 + progress * 0.22).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(bodyX, bodyY, bodyRadius * 1.52, bodyRadius * 0.88, -0.24, Math.PI * 0.14, Math.PI * 1.86);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = destination.visual.bodyColor;
        ctx.beginPath();
        ctx.arc(bodyX, bodyY, bodyRadius * 0.86, 0, Math.PI * 2);
        ctx.fill();
        if (progress > 0.16) {
          renderer.circle(stationX, stationY, 5 + approachRatio * 3.2, destination.visual.stationAccent);
          renderer.strokeRect(stationX - 18, stationY - 18, 36, 36, destination.visual.stationColor, 1.1);
          renderer.rect(stationX - 24, stationY - 2, 48, 4, destination.visual.stationColor);
          renderer.line(bodyX, bodyY, stationX, stationY, `rgba(203, 191, 255, ${(0.1 + progress * 0.16).toFixed(3)})`, 1);
        }
        break;
      }

      case "nebula_shell": {
        for (let i = 0; i < 4; i += 1) {
          const shell = ctx.createRadialGradient(bodyX, bodyY, bodyRadius * (0.3 + i * 0.08), bodyX, bodyY, bodyRadius * (1.18 + i * 0.2));
          shell.addColorStop(0, "rgba(0, 0, 0, 0)");
          shell.addColorStop(0.5, `${destination.visual.detailColor}${Math.round((0.12 + progress * 0.18) * 255).toString(16).padStart(2, "0")}`);
          shell.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = shell;
          ctx.beginPath();
          ctx.ellipse(bodyX, bodyY, bodyRadius * (1.22 + i * 0.16), bodyRadius * (0.8 + i * 0.08), -0.18 + i * 0.12, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = destination.visual.shadowColor;
        ctx.beginPath();
        ctx.arc(bodyX, bodyY, bodyRadius * 0.28, 0, Math.PI * 2);
        ctx.fill();
        if (progress > 0.16) {
          renderer.circle(stationX, stationY, 5.4 + approachRatio * 3.2, destination.visual.stationAccent);
          renderer.rect(stationX - 20, stationY - 3, 40, 6, destination.visual.stationColor);
          renderer.line(stationX - 18, stationY - 14, stationX - 4, stationY - 2, destination.visual.stationColor, 2);
          renderer.line(stationX + 18, stationY + 14, stationX + 4, stationY + 2, destination.visual.stationColor, 2);
          renderer.line(bodyX, bodyY, stationX, stationY, `rgba(255, 198, 224, ${(0.1 + progress * 0.18).toFixed(3)})`, 1);
        }
        break;
      }

      case "galaxy_bridge": {
        const leftCoreX = bodyX - bodyRadius * 0.9;
        const rightCoreX = bodyX + bodyRadius * 0.88;
        renderer.circle(leftCoreX, bodyY - bodyRadius * 0.18, bodyRadius * 0.48, destination.visual.glowColor);
        renderer.circle(rightCoreX, bodyY + bodyRadius * 0.12, bodyRadius * 0.42, destination.visual.detailColor);
        ctx.strokeStyle = `rgba(255, 225, 181, ${(0.12 + progress * 0.2).toFixed(3)})`;
        ctx.lineWidth = Math.max(1.6, bodyRadius * 0.05);
        ctx.beginPath();
        ctx.moveTo(leftCoreX, bodyY - bodyRadius * 0.18);
        ctx.bezierCurveTo(bodyX - bodyRadius * 0.34, bodyY - bodyRadius * 0.34, bodyX + bodyRadius * 0.16, bodyY + bodyRadius * 0.16, rightCoreX, bodyY + bodyRadius * 0.12);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(leftCoreX, bodyY - bodyRadius * 0.04);
        ctx.bezierCurveTo(bodyX - bodyRadius * 0.28, bodyY + bodyRadius * 0.04, bodyX + bodyRadius * 0.18, bodyY + bodyRadius * 0.28, rightCoreX, bodyY + bodyRadius * 0.24);
        ctx.stroke();
        if (progress > 0.18) {
          renderer.rect(stationX - 4, stationY - 22, 8, 44, destination.visual.stationColor);
          renderer.rect(stationX - 18, stationY + 12, 36, 5, destination.visual.stationColor);
          renderer.circle(stationX, stationY, 4.6 + approachRatio * 2.8, destination.visual.stationAccent);
          renderer.line(bodyX, bodyY, stationX, stationY, `rgba(255, 223, 174, ${(0.1 + progress * 0.16).toFixed(3)})`, 1);
        }
        break;
      }

      case "star_cluster": {
        for (let i = 0; i < 28; i += 1) {
          const angle = i * 0.42;
          const radius = bodyRadius * (0.2 + (i % 7) * 0.1);
          const starX = bodyX + Math.cos(angle) * radius;
          const starY = bodyY + Math.sin(angle) * radius * 0.74;
          renderer.circle(starX, starY, 1.4 + (i % 3) * 0.5, i % 4 === 0 ? destination.visual.stationAccent : destination.visual.glowColor);
        }
        if (progress > 0.18) {
          renderer.circle(stationX, stationY, 5.2 + approachRatio * 2.8, destination.visual.stationAccent);
          renderer.strokeRect(stationX - 20, stationY - 8, 40, 16, destination.visual.stationColor, 1.1);
          renderer.rect(stationX - 3, stationY - 20, 6, 40, destination.visual.stationColor);
          renderer.line(bodyX, bodyY, stationX, stationY, `rgba(255, 236, 172, ${(0.1 + progress * 0.18).toFixed(3)})`, 1);
        }
        break;
      }

      case "void_anchor": {
        const voidGlow = ctx.createRadialGradient(bodyX, bodyY, bodyRadius * 0.1, bodyX, bodyY, bodyRadius * 1.6);
        voidGlow.addColorStop(0, `rgba(158, 179, 199, ${(0.02 + progress * 0.08).toFixed(3)})`);
        voidGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = voidGlow;
        ctx.fillRect(bodyX - bodyRadius * 1.8, bodyY - bodyRadius * 1.8, bodyRadius * 3.6, bodyRadius * 3.6);
        renderer.circle(bodyX, bodyY, Math.max(2.4, bodyRadius * 0.12), "rgba(221, 231, 242, 0.5)");
        if (progress > 0.12) {
          renderer.line(stationX, stationY - 18, stationX, stationY + 18, destination.visual.stationColor, 1.8);
          renderer.line(stationX - 14, stationY, stationX + 14, stationY, destination.visual.stationColor, 1.8);
          renderer.line(stationX - 10, stationY - 12, stationX + 10, stationY + 12, destination.visual.detailColor, 1.2);
          renderer.line(stationX - 10, stationY + 12, stationX + 10, stationY - 12, destination.visual.detailColor, 1.2);
          renderer.line(bodyX, bodyY, stationX, stationY, `rgba(176, 195, 214, ${(0.08 + progress * 0.14).toFixed(3)})`, 1);
        }
        break;
      }
    }

    renderer.line(bodyX - 62, bodyY, bodyX - 24, bodyY, "rgba(142, 223, 255, 0.42)", 1.2);
    renderer.line(bodyX + 24, bodyY, bodyX + 62, bodyY, "rgba(142, 223, 255, 0.42)", 1.2);
    renderer.line(bodyX, bodyY - 54, bodyX, bodyY - 22, "rgba(142, 223, 255, 0.42)", 1.2);

    if (overshootRecovery) {
      this.renderOvershootTurnIndicator(
        bodyX,
        bodyY,
        bodyRadius,
        destination.visual.stationAccent,
        overshootRecovery.turnDirection,
        overshootRatio
      );
    }

    const labelAlpha = clamp(0.2 + progress * 1.1, 0, 1);
    renderer.text(contact.name.toUpperCase(), bodyX, bodyY - bodyRadius - 18, {
      align: "center",
      color: `rgba(247, 239, 216, ${labelAlpha.toFixed(3)})`,
      font: "bold 13px Trebuchet MS"
    });
    renderer.text(destination.visual.bodyName.toUpperCase(), bodyX, bodyY + bodyRadius + 24, {
      align: "center",
      color: `rgba(164, 194, 224, ${(0.22 + progress * 0.62).toFixed(3)})`,
      font: "11px Trebuchet MS"
    });

    if (inTransit) {
      const distanceLine = Math.max(0, remainingDistance).toFixed(1).padStart(4, "0");
      const band = destination.approachBands[Math.min(captureBandIndex, destination.approachBands.length - 1)]!;
      if (overshootRecovery) {
        renderer.text(`ROUTE LOOP ${distanceLine} AU`, 56, 54, {
          color: "#ffd8a6",
          font: "bold 13px Trebuchet MS"
        });
        renderer.text(`RESET VECTOR // ${band.label.toUpperCase()}`, 56, 72, {
          color: band.accent,
          font: "12px Trebuchet MS"
        });
        drawTextBlock(renderer, "Overshot the approach. Traffic is looping you wide for another pass.", 56, 90, 228, 14, {
          color: "#f0dcc0",
          font: "12px Trebuchet MS"
        });
      } else {
        renderer.text(`ROUTE ${distanceLine} AU`, 56, 54, {
          color: "#8edfff",
          font: "bold 13px Trebuchet MS"
        });
        renderer.text(`CAPTURE ${captureBandIndex}/${destination.approachBands.length}`, 56, 72, {
          color: "#d9e7f5",
          font: "12px Trebuchet MS"
        });
        renderer.text(band.label.toUpperCase(), 56, 90, {
          color: band.accent,
          font: "bold 12px Trebuchet MS"
        });
        drawTextBlock(renderer, band.description, 56, 102, 228, 14, {
          color: "#cfdae9",
          font: "12px Trebuchet MS"
        });
      }
    } else {
      renderer.text("ORBIT HOLD", 56, 54, {
        color: "#9deab2",
        font: "bold 13px Trebuchet MS"
      });
      renderer.text(destination.ui.orbitStatusLine, 56, 72, {
        color: "#d9e7f5",
        font: "12px Trebuchet MS"
      });
    }

    if (!inTransit && settleRatio > 0.8) {
      renderer.text("CAPTURE GREEN", bodyX + 4, bodyY - bodyRadius - 40, {
        align: "center",
        color: "#b5f1d1",
        font: "bold 12px Trebuchet MS"
      });
    }

    ctx.restore();
  }

  private renderReticle(): void {
    const { renderer } = this.services;
    const speedState = this.currentSpeedState();
    const speedRatio = clamp(this.ssi / SSI_EFFECT_CEILING, 0, 1);
    const ringRadius = 22 + speedRatio * 18;
    const surgeRatio = clamp(this.surgeFlash / 0.92, 0, 1);
    const collapse = this.effectDirection === "collapse";
    const routeEngage = this.currentRouteEngageAnimation();
    const engageContact = routeEngage ? this.activeRouteContact() : null;

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
    if (routeEngage) {
      ctx.globalAlpha = routeEngage.signalAlpha;
      ctx.strokeStyle = "rgba(142, 223, 255, 0.52)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(this.vanishX, this.vanishY, ringRadius + 30 + (1 - routeEngage.ratio) * 24, Math.PI * 0.14, Math.PI * 0.86);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(this.vanishX, this.vanishY, ringRadius + 30 + (1 - routeEngage.ratio) * 24, Math.PI * 1.14, Math.PI * 1.86);
      ctx.stroke();
      ctx.setLineDash([]);
    }
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

    if (routeEngage && engageContact) {
      const alpha = routeEngage.signalAlpha;
      renderer.text(`LOCKING ${this.clipRadioText(engageContact.name, 20)}`, this.vanishX, this.vanishY - 84 - (1 - routeEngage.ratio) * 14, {
        align: "center",
        color: `rgba(247, 239, 216, ${(0.32 + alpha * 0.66).toFixed(3)})`,
        font: "bold 12px Trebuchet MS"
      });
      renderer.text("ROUTE ENGAGE", this.vanishX, this.vanishY - 68 - (1 - routeEngage.ratio) * 10, {
        align: "center",
        color: `rgba(142, 223, 255, ${(0.24 + alpha * 0.56).toFixed(3)})`,
        font: "11px Trebuchet MS"
      });
    }

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

    if (this.speedStateCalloutTimer > 0 && this.speedStateCallout) {
      ctx.save();
      ctx.globalAlpha = clamp(this.speedStateCalloutTimer / SPEED_STATE_CALLOUT_DURATION, 0, 1);
      renderer.text(this.speedStateCallout.toUpperCase(), this.vanishX, this.vanishY + 58, {
        align: "center",
        color: speedState.accent,
        font: "bold 20px Trebuchet MS"
      });
      ctx.restore();
    }
  }

  private renderCockpit(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const consoleY = this.viewHeight;
    const mainPanelWidth = 648;
    const mainPanelX = 174;
    const radarPanelX = 34;
    const radarPanelWidth = mainPanelX - radarPanelX - 14;
    const questPanelX = mainPanelX + mainPanelWidth + 6;
    const questPanelWidth = renderer.width - 34 - 296 - questPanelX - 8;
    const rightPanelWidth = 296;
    const rightPanelX = renderer.width - rightPanelWidth - 34;
    const strain = computeStrain(this.throttle, this.ssi, this.actions.isDown("brake"));
    const speedState = this.currentSpeedState();
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

    this.renderRadarPanel(radarPanelX, consoleY + 24, radarPanelWidth, 140);
    this.renderFlightPanel(mainPanelX, consoleY + 18, mainPanelWidth, 150, strain, speedState);

    this.renderQuestPanel(questPanelX, consoleY + 18, questPanelWidth, 150, currentBand);
    this.renderRadioHud(rightPanelX, consoleY + 18, rightPanelWidth, 150, currentBand, speedState);
    this.renderTransmissionBubble(rightPanelX, consoleY + 18, rightPanelWidth);

  }

  private renderFlightPanel(
    x: number,
    y: number,
    width: number,
    height: number,
    strain: number,
    speedState: ReturnType<typeof getSpeedState>
  ): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const centerX = x + width * 0.5;
    const centerY = y + 76;
    const gaugeRadius = 56;
    const gaugeRatio = clamp(this.ssi / this.currentMaxSsi(), 0, 1);
    const throttleRatio = clamp(this.throttle / 100, 0, 1);
    const strainRatio = clamp(strain / 100, 0, 1);
    const throttleColor = this.actions.isDown("brake") ? "#ffb691" : "#7fdcff";
    const strainColor = strain > 70 ? "#ff9a84" : "#9aedc5";
    const statusLabel = this.actions.isDown("brake") ? "RETRO" : this.throttle < 1 ? "IDLE" : "FLOW";
    const statusColor = this.actions.isDown("brake") ? "#ffb691" : this.throttle < 1 ? "#94a8bf" : speedState.accent;

    drawPanel(renderer, x, y, width, height);

    const shell = ctx.createLinearGradient(x, y, x, y + height);
    shell.addColorStop(0, "rgba(20, 26, 36, 0.8)");
    shell.addColorStop(1, "rgba(8, 10, 15, 0.84)");
    ctx.fillStyle = shell;
    ctx.fillRect(x + 8, y + 8, width - 16, height - 16);

    const centerGlow = ctx.createRadialGradient(centerX, centerY - 4, 0, centerX, centerY - 4, 170);
    centerGlow.addColorStop(0, "rgba(141, 208, 255, 0.14)");
    centerGlow.addColorStop(0.45, "rgba(255, 232, 172, 0.06)");
    centerGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = centerGlow;
    ctx.fillRect(x, y, width, height);

    ctx.save();
    ctx.strokeStyle = "rgba(118, 132, 154, 0.24)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(centerX, centerY, gaugeRadius, Math.PI * 0.9, Math.PI * 2.1);
    ctx.stroke();

    ctx.strokeStyle = speedState.accent;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(centerX, centerY, gaugeRadius, Math.PI * 0.9, Math.PI * (0.9 + 1.2 * gaugeRatio));
    ctx.stroke();

    ctx.strokeStyle = "rgba(247, 239, 216, 0.08)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 12; i += 1) {
      const angle = Math.PI * (0.9 + (1.2 / 12) * i);
      const inner = gaugeRadius + 10;
      const outer = gaugeRadius + 18;
      renderer.line(
        centerX + Math.cos(angle) * inner,
        centerY + Math.sin(angle) * inner,
        centerX + Math.cos(angle) * outer,
        centerY + Math.sin(angle) * outer,
        "rgba(247, 239, 216, 0.16)",
        i % 3 === 0 ? 1.4 : 1
      );
    }
    ctx.restore();

    renderer.text(Math.round(this.ssi).toString().padStart(3, "0"), centerX, y + 86, {
      align: "center",
      color: "#f7efd8",
      font: "bold 64px Georgia"
    });
    renderer.text("SSI", centerX, y + 108, {
      align: "center",
      color: "#8ea4bc",
      font: "11px Trebuchet MS"
    });

    renderer.rect(centerX - 38, y + 114, 76, 14, "rgba(10, 14, 20, 0.72)");
    renderer.strokeRect(centerX - 38, y + 114, 76, 14, `rgba(255,255,255,${this.actions.isDown("brake") ? "0.26" : "0.18"})`, 1);
    renderer.text(statusLabel, centerX, y + 125, {
      align: "center",
      color: statusColor,
      font: "bold 11px Trebuchet MS"
    });

    this.renderSideMeter(x + 26, y + 26, 94, 108, "THR", `${Math.round(this.throttle)}%`, throttleRatio, throttleColor, true);
    this.renderSideMeter(x + width - 120, y + 26, 94, 108, "STR", `${Math.round(strain)}%`, strainRatio, strainColor, false);
    this.renderFrameDeck(x + 130, y + 130, width - 260, 12);
  }

  private renderFrameDeck(x: number, y: number, width: number, height: number): void {
    const { renderer } = this.services;
    const engine = currentEnginePart(this.shipUpgradeIds);
    const cargo = currentCargoPart(this.shipUpgradeIds);
    const segments = [
      { label: "FRAME", value: `${Math.round(this.hullIntegrity)}%`, accent: "#9deab2" },
      { label: "DRIVE", value: engine.shortName, accent: "#8edfff" },
      { label: "HOLD", value: `${this.cargoUsed()}/${cargo.capacity} ${cargo.shortName}`, accent: "#f2dfab" }
    ];
    const segmentWidth = (width - 8) / segments.length;

    renderer.text("FRAME DECK", x, y - 4, {
      color: "#8ea4bc",
      font: "bold 10px Trebuchet MS"
    });
    renderer.text(`${this.credits} CR`, x + width, y - 4, {
      align: "right",
      color: "#f2dfab",
      font: "bold 10px Trebuchet MS"
    });

    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i]!;
      const segmentX = x + i * (segmentWidth + 4);
      renderer.rect(segmentX, y, segmentWidth, height, "rgba(9, 13, 19, 0.76)");
      renderer.strokeRect(segmentX, y, segmentWidth, height, "rgba(124, 138, 158, 0.18)", 1);
      renderer.text(segment.label, segmentX + 8, y + 10, {
        color: segment.accent,
        font: "bold 9px Trebuchet MS"
      });
      renderer.text(this.fitTextToWidth(segment.value, segmentWidth - 56, "10px Trebuchet MS"), segmentX + segmentWidth - 8, y + 10, {
        align: "right",
        color: "#f7efd8",
        font: "10px Trebuchet MS"
      });
    }
  }

  private renderSideMeter(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    valueText: string,
    ratio: number,
    accent: string,
    leftAligned: boolean
  ): void {
    const { renderer } = this.services;
    const barX = leftAligned ? x + 12 : x + width - 26;
    const barY = y + 18;
    const barWidth = 14;
    const barHeight = 62;
    const textAlign = leftAligned ? "left" : "right";
    const textX = leftAligned ? x + 34 : x + width - 34;

    renderer.text(label, textX, y + 12, {
      align: textAlign as CanvasTextAlign,
      color: "#8ea4bc",
      font: "bold 11px Trebuchet MS"
    });
    renderer.text(valueText, textX, y + 34, {
      align: textAlign as CanvasTextAlign,
      color: "#f7efd8",
      font: "bold 18px Trebuchet MS"
    });

    renderer.rect(barX, barY, barWidth, barHeight, "rgba(255,255,255,0.08)");
    renderer.strokeRect(barX, barY, barWidth, barHeight, "rgba(255,255,255,0.14)", 1);

    const segments = 8;
    const filled = Math.round(ratio * segments);
    for (let i = 0; i < segments; i += 1) {
      const segmentY = barY + barHeight - (i + 1) * 7.25;
      const color = i < filled ? accent : "rgba(84, 94, 110, 0.28)";
      renderer.rect(barX + 2, segmentY + 1, barWidth - 4, 5, color);
    }

    renderer.text(leftAligned ? "PWR" : "LOAD", textX, y + 94, {
      align: textAlign as CanvasTextAlign,
      color: accent,
      font: "10px Trebuchet MS"
    });
  }

  private renderQuestPanel(
    x: number,
    y: number,
    width: number,
    height: number,
    currentBand: CertificationBand | null
  ): void {
    const { renderer } = this.services;
    const completedCount = this.questComplete() ? FIRST_QUEST.steps.length : this.stageIndex;
    const progressValue = this.questComplete()
      ? FIRST_QUEST.steps.length
      : completedCount + (currentBand ? this.holdProgress / currentBand.holdSeconds : 0);

    drawPanel(renderer, x, y, width, height, "Quest");

    renderer.text(FIRST_QUEST.code, x + 10, y + 38, {
      color: "#8edfff",
      font: "bold 10px Trebuchet MS"
    });
    renderer.text(`${completedCount}/${FIRST_QUEST.steps.length}`, x + width - 10, y + 38, {
      align: "right",
      color: "#f5ebcf",
      font: "bold 10px Trebuchet MS"
    });
    drawTextBlock(renderer, FIRST_QUEST.title, x + 10, y + 52, width - 20, 12, {
      color: "#f7efd8",
      font: "bold 12px Trebuchet MS"
    });
    renderer.text(FIRST_QUEST.issuerShort, x + 10, y + 76, {
      color: "#92a6bd",
      font: "10px Trebuchet MS"
    });
    renderer.text(this.syncUnlocked ? "SYNC READY" : "SYNC LOCKED", x + width - 10, y + 76, {
      align: "right",
      color: this.syncUnlocked ? "#9deab2" : "#97aac0",
      font: "bold 10px Trebuchet MS"
    });

    for (let i = 0; i < FIRST_QUEST.steps.length; i += 1) {
      const step = FIRST_QUEST.steps[i]!;
      const rowY = y + 82 + i * 12;
      const completed = this.questComplete() || i < this.stageIndex;
      const active = !this.questComplete() && i === this.stageIndex;
      const fill = completed
        ? "rgba(116, 232, 186, 0.16)"
        : active
          ? `rgba(255, 229, 154, ${(0.16 + Math.max(this.surgeFlash * 0.08, 0.12)).toFixed(3)})`
          : "rgba(18, 23, 31, 0.42)";
      const stroke = completed ? step.accent : active ? "#ffe6a1" : "rgba(132, 145, 166, 0.18)";

      renderer.rect(x + 8, rowY - 10, width - 16, 12, fill);
      renderer.strokeRect(x + 8, rowY - 10, width - 16, 12, stroke, active ? 1.1 : 0.9);
      renderer.circle(x + 15, rowY - 4, 2.5, completed ? step.accent : active ? "#ffe6a1" : "rgba(124, 139, 158, 0.38)");
      renderer.text(step.shortLabel, x + 22, rowY - 1, {
        color: completed || active ? "#f3f0e5" : "#8899af",
        font: active ? "bold 10px Trebuchet MS" : "10px Trebuchet MS"
      });
    }

    drawBar(renderer, x + 10, y + height - 28, width - 20, 4, progressValue, FIRST_QUEST.steps.length, "#8fe3ff", "rgba(255,255,255,0.08)");
    this.renderMiniButton(x + 10, y + height - 18, 42, 12, "L LOG", this.questLogExpanded);
    this.renderMiniButton(x + width - 52, y + height - 18, 42, 12, "P MSG", this.transmissionHistory.length > 0);
  }

  private renderQuestOverlay(): void {
    const progress = clamp(this.questLogOverlayProgress, 0, 1);
    if (progress <= 0) {
      return;
    }

    const { renderer } = this.services;
    const { ctx } = renderer;
    const width = 728;
    const height = 382;
    const x = renderer.width * 0.5 - width * 0.5;
    const y = 72 + (1 - progress) * 26;
    const questWidth = 404;
    const archiveX = x + questWidth + 22;
    const archiveWidth = width - questWidth - 40;
    const currentBand = this.currentBand();
    const completedCount = this.questComplete() ? FIRST_QUEST.steps.length : this.stageIndex;
    const progressValue = this.questComplete()
      ? FIRST_QUEST.steps.length
      : completedCount + (currentBand ? this.holdProgress / currentBand.holdSeconds : 0);
    const primaryStatus = this.questComplete()
      ? "Explorer charter filed. Registry sync is online."
      : currentBand
        ? `Current window: ${currentBand.label}`
        : "Awaiting next contract";

    ctx.save();
    ctx.globalAlpha = progress * 0.48;
    renderer.rect(0, 0, renderer.width, renderer.height, "#04060b");
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = progress;
    drawPanel(renderer, x, y, width, height, "Quest Ledger");
    renderer.line(x + questWidth + 10, y + 24, x + questWidth + 10, y + height - 24, "rgba(135, 149, 169, 0.22)", 1);

    renderer.text(FIRST_QUEST.code, x + 18, y + 38, {
      color: "#8edfff",
      font: "bold 11px Trebuchet MS"
    });
    renderer.text(FIRST_QUEST.title, x + 18, y + 62, {
      color: "#f7efd8",
      font: "bold 22px Georgia"
    });
    renderer.text(FIRST_QUEST.issuer, x + width - 18, y + 38, {
      align: "right",
      color: "#dce7f5",
      font: "13px Trebuchet MS"
    });
    drawTextBlock(renderer, FIRST_QUEST.summary, x + 18, y + 86, questWidth - 36, 18, {
      color: "#cfdceb",
      font: "14px Trebuchet MS"
    });

    renderer.text("STATUS", x + 18, y + 132, {
      color: "#f2dfab",
      font: "bold 11px Trebuchet MS"
    });
    renderer.text(primaryStatus, x + 80, y + 132, {
      color: this.questComplete() ? "#aaf8c3" : currentBand ? currentBand.accent : "#dbe5f2",
      font: "13px Trebuchet MS"
    });
    renderer.text("REWARD", x + 18, y + 152, {
      color: "#f2dfab",
      font: "bold 11px Trebuchet MS"
    });
    renderer.text(FIRST_QUEST.reward, x + 80, y + 152, {
      color: "#dce7f5",
      font: "13px Trebuchet MS"
    });
    drawBar(renderer, x + 18, y + 166, questWidth - 36, 6, progressValue, FIRST_QUEST.steps.length, "#8fe3ff", "rgba(255,255,255,0.08)");

    const listY = y + 188;
    const selectedStep = FIRST_QUEST.steps[this.questSelectionIndex]!;
    for (let i = 0; i < FIRST_QUEST.steps.length; i += 1) {
      const step = FIRST_QUEST.steps[i]!;
      const rowY = listY + i * 28;
      const completed = this.questComplete() || i < this.stageIndex;
      const active = !this.questComplete() && i === this.stageIndex;
      const focused = this.questFocusColumn === "contract" && i === this.questSelectionIndex;
      const fill = completed
        ? "rgba(116, 232, 186, 0.12)"
        : active
          ? "rgba(255, 229, 154, 0.12)"
          : "rgba(18, 23, 31, 0.32)";

      renderer.rect(x + 18, rowY, questWidth - 36, 22, fill);
      renderer.strokeRect(
        x + 18,
        rowY,
        questWidth - 36,
        22,
        focused ? "#f7efd8" : completed ? step.accent : active ? "#ffe6a1" : "rgba(131, 145, 166, 0.2)",
        focused ? 1.3 : active ? 1.2 : 1
      );
      renderer.circle(x + 30, rowY + 11, 4, completed ? step.accent : active ? "#ffe6a1" : "rgba(124, 139, 158, 0.4)");
      renderer.text(`${i + 1}. ${step.label}`, x + 42, rowY + 14, {
        color: focused ? "#f7efd8" : completed || active ? "#f6f1e5" : "#92a3ba",
        font: focused || active ? "bold 12px Trebuchet MS" : "12px Trebuchet MS"
      });
      renderer.text(this.fitTextToWidth(step.detail, 120, "11px Trebuchet MS"), x + questWidth - 18, rowY + 14, {
        align: "right",
        color: focused ? "#f7efd8" : completed || active ? "#cdd9e8" : "#7f92a9",
        font: "11px Trebuchet MS"
      });
    }

    renderer.rect(x + 18, y + 304, questWidth - 36, 40, this.questFocusColumn === "contract" ? "rgba(255, 229, 154, 0.07)" : "rgba(10, 14, 20, 0.58)");
    renderer.strokeRect(x + 18, y + 304, questWidth - 36, 40, this.questFocusColumn === "contract" ? "rgba(255, 229, 154, 0.32)" : "rgba(124, 138, 158, 0.18)", 1);
    renderer.text(`STEP ${this.questSelectionIndex + 1}`, x + 30, y + 320, {
      color: this.questFocusColumn === "contract" ? "#f2dfab" : "#8ea3ba",
      font: "bold 11px Trebuchet MS"
    });
    renderer.text(this.fitTextToWidth(selectedStep.label, 188, "bold 11px Trebuchet MS"), x + questWidth - 18, y + 320, {
      align: "right",
      color: "#f7efd8",
      font: "bold 11px Trebuchet MS"
    });
    drawTextBlock(renderer, selectedStep.detail, x + 30, y + 330, questWidth - 60, 11, {
      color: "#cfdceb",
      font: "11px Trebuchet MS"
    });

    renderer.text("REGISTRY SYNC", archiveX, y + 38, {
      color: this.questFocusColumn === "sync" ? "#f2dfab" : "#8edfff",
      font: "bold 12px Trebuchet MS"
    });
    renderer.text(this.syncUnlocked ? "READY" : "LOCKED", x + width - 18, y + 38, {
      align: "right",
      color: this.syncUnlocked ? "#aaf8c3" : "#97aac0",
      font: "bold 12px Trebuchet MS"
    });
    drawTextBlock(
      renderer,
      this.syncUnlocked
        ? "Manual sync is live. Press 1, 2, or 3 while this ledger is open to stamp a save slot."
        : "Manual sync stays locked until the Explorer Charter is filed. Quest completion still writes autosave.",
      archiveX,
      y + 56,
      archiveWidth,
      15,
      {
        color: "#cfdceb",
        font: "12px Trebuchet MS"
      }
    );

    this.renderSaveSlotRow(archiveX, y + 104, archiveWidth, this.saveArchiveSummary.autosave, "AUTO", true, this.questFocusColumn === "sync" && this.syncSelectionIndex === 0);
    this.renderSaveSlotRow(archiveX, y + 162, archiveWidth, this.saveArchiveSummary.manualSlots[0]!, "1", this.syncUnlocked, this.questFocusColumn === "sync" && this.syncSelectionIndex === 1);
    this.renderSaveSlotRow(archiveX, y + 220, archiveWidth, this.saveArchiveSummary.manualSlots[1]!, "2", this.syncUnlocked, this.questFocusColumn === "sync" && this.syncSelectionIndex === 2);
    this.renderSaveSlotRow(archiveX, y + 278, archiveWidth, this.saveArchiveSummary.manualSlots[2]!, "3", this.syncUnlocked, this.questFocusColumn === "sync" && this.syncSelectionIndex === 3);

    renderer.text("L close | Left/Right switch panes | Up/Down move | Enter confirm", x + 18, y + height - 18, {
      color: "#8f9fb4",
      font: "12px Trebuchet MS"
    });
    ctx.restore();
  }

  private renderSaveSlotRow(
    x: number,
    y: number,
    width: number,
    summary: SaveSlotSummary,
    hotkeyLabel: string,
    interactable: boolean,
    selected: boolean
  ): void {
    const { renderer } = this.services;
    const accent = selected ? "#f7efd8" : summary.slot === "autosave" ? "#8edfff" : interactable ? "#f2dfab" : "#72849a";
    const fill = summary.hasSave
      ? selected ? "rgba(33, 32, 18, 0.78)" : "rgba(17, 24, 33, 0.68)"
      : selected ? "rgba(33, 32, 18, 0.5)" : "rgba(11, 15, 21, 0.42)";
    const stroke = selected
      ? "rgba(247, 239, 216, 0.52)"
      : summary.hasSave
        ? `rgba(${summary.slot === "autosave" ? "142, 223, 255" : interactable ? "242, 223, 171" : "114, 132, 154"}, 0.34)`
        : "rgba(114, 132, 154, 0.2)";

    renderer.rect(x, y, width, 48, fill);
    renderer.strokeRect(x, y, width, 48, stroke, 1.1);
    renderer.rect(x + 10, y + 10, 28, 14, "rgba(8, 12, 18, 0.84)");
    renderer.strokeRect(x + 10, y + 10, 28, 14, accent, 1);
    renderer.text(hotkeyLabel, x + 24, y + 21, {
      align: "center",
      color: accent,
      font: "bold 10px Trebuchet MS"
    });
    renderer.text(summary.label, x + 48, y + 20, {
      color: "#f7efd8",
      font: "bold 11px Trebuchet MS"
    });
    renderer.text(summary.savedAtLabel, x + width - 10, y + 20, {
      align: "right",
      color: accent,
      font: "10px Trebuchet MS"
    });
    renderer.text(this.fitTextToWidth(summary.questLine, width - 64, "11px Trebuchet MS"), x + 48, y + 37, {
      color: summary.hasSave ? "#d7e3f1" : "#93a6bc",
      font: "11px Trebuchet MS"
    });
    renderer.text(this.fitTextToWidth(summary.detailLine, width - 64, "10px Trebuchet MS"), x + 48, y + 46, {
      color: "#8ea3ba",
      font: "10px Trebuchet MS"
    });
  }

  private renderRadarPanel(x: number, y: number, width: number, height: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const centerX = x + width * 0.5;
    const centerY = y + 56;
    const radius = Math.max(24, Math.min(width - 24, 72) * 0.5);
    const tracked = this.trackedNavContact();
    const trackedPreview = this.routePreviewForDestination(tracked.id);
    const sweepAngle = this.clock * 0.85;

    drawPanel(renderer, x, y, width, height, "Nav");

    ctx.save();
    const fill = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius + 10);
    fill.addColorStop(0, "rgba(17, 34, 32, 0.88)");
    fill.addColorStop(1, "rgba(8, 14, 17, 0.24)");
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(122, 213, 255, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.65, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    renderer.line(centerX - radius, centerY, centerX + radius, centerY, "rgba(122, 213, 255, 0.16)", 1);
    renderer.line(centerX, centerY - radius, centerX, centerY + radius, "rgba(122, 213, 255, 0.16)", 1);
    renderer.line(
      centerX,
      centerY,
      centerX + Math.cos(sweepAngle) * radius,
      centerY + Math.sin(sweepAngle) * radius,
      "rgba(143, 255, 214, 0.3)",
      1.2
    );

    for (const contact of NAV_CONTACTS) {
      const contactX = centerX + contact.x * radius * 0.82;
      const contactY = centerY + contact.y * radius * 0.82;
      const active = contact.id === tracked.id;
      if (active) {
        renderer.circle(contactX, contactY, 4.8, "rgba(255, 236, 169, 0.12)");
        renderer.strokeRect(contactX - 5, contactY - 5, 10, 10, "rgba(142, 223, 255, 0.42)", 1);
      }
      renderer.circle(contactX, contactY, active ? 3 : 2.2, contact.accent);
    }

    renderer.circle(centerX, centerY, 2.4, "#f7efd8");
    renderer.text(`TRACK ${this.fitTextToWidth(tracked.name.toUpperCase(), width - 54, "bold 10px Trebuchet MS")}`, x + 10, y + 102, {
      color: tracked.accent,
      font: "bold 10px Trebuchet MS"
    });
    renderer.text(
      this.fitTextToWidth(
        this.activeRoute
          ? `${Math.max(0, this.routeDisplayState()?.remainingDistance ?? this.activeRoute.remainingDistance).toFixed(1)} AU // ${tracked.note}`
          : trackedPreview
            ? `${trackedPreview.totalDistance.toFixed(1)} AU // ${tracked.note}`
            : tracked.note,
        width - 20,
        "10px Trebuchet MS"
      ),
      x + 10,
      y + 116,
      {
      color: "#97aac0",
      font: "10px Trebuchet MS"
      }
    );
    this.renderMiniButton(x + 10, y + height - 18, 42, 12, "M MAP", this.mapExpanded);
  }

  private renderMapOverlay(): void {
    const progress = clamp(this.mapOverlayProgress, 0, 1);
    if (progress <= 0) {
      return;
    }

    const { renderer } = this.services;
    const { ctx } = renderer;
    const width = 700;
    const height = 392;
    const x = renderer.width * 0.5 - width * 0.5;
    const y = 56 + (1 - progress) * 26;
    const mapBoxX = x + 22;
    const mapBoxY = y + 54;
    const mapBoxWidth = 412;
    const mapBoxHeight = 282;
    const mapCenterX = mapBoxX + mapBoxWidth * 0.5;
    const mapCenterY = mapBoxY + mapBoxHeight * 0.5;
    const mapRadius = Math.min(mapBoxWidth, mapBoxHeight) * 0.38;
    const selected = NAV_CONTACTS[this.selectedNavIndex] ?? NAV_CONTACTS[0]!;
    const selectedPreview = this.routePreviewForDestination(selected.id);
    const tracked = this.trackedNavContact();
    const visibleRows = 5;
    const rowHeight = 46;
    const maxStart = Math.max(0, NAV_CONTACTS.length - visibleRows);
    const startIndex = clamp(this.selectedNavIndex - Math.floor(visibleRows / 2), 0, maxStart);
    const endIndex = Math.min(NAV_CONTACTS.length, startIndex + visibleRows);

    ctx.save();
    ctx.globalAlpha = progress * 0.52;
    renderer.rect(0, 0, renderer.width, renderer.height, "#02050a");
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = progress;
    drawPanel(renderer, x, y, width, height, "Sector Map");
    renderer.text("Slipwake local navigation", x + 18, y + 38, {
      color: "#8edfff",
      font: "bold 12px Trebuchet MS"
    });
    renderer.text("Up/Down select | Enter track | Esc or M close", x + width - 18, y + 38, {
      align: "right",
      color: "#d4deeb",
      font: "12px Trebuchet MS"
    });

    renderer.rect(mapBoxX, mapBoxY, mapBoxWidth, mapBoxHeight, "rgba(10, 16, 21, 0.72)");
    renderer.strokeRect(mapBoxX, mapBoxY, mapBoxWidth, mapBoxHeight, "rgba(127, 224, 255, 0.18)", 1.2);
    ctx.beginPath();
    ctx.arc(mapCenterX, mapCenterY, mapRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(127, 224, 255, 0.16)";
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mapCenterX, mapCenterY, mapRadius * 0.68, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(127, 224, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mapCenterX, mapCenterY, mapRadius * 0.34, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(127, 224, 255, 0.08)";
    ctx.stroke();
    renderer.line(mapCenterX - mapRadius, mapCenterY, mapCenterX + mapRadius, mapCenterY, "rgba(127, 224, 255, 0.12)", 1);
    renderer.line(mapCenterX, mapCenterY - mapRadius, mapCenterX, mapCenterY + mapRadius, "rgba(127, 224, 255, 0.12)", 1);

    for (const contact of NAV_CONTACTS) {
      const contactX = mapCenterX + contact.x * mapRadius * 0.92;
      const contactY = mapCenterY + contact.y * mapRadius * 0.92;
      const isTracked = contact.id === tracked.id;
      const isSelected = contact.id === selected.id;
      if (isTracked) {
        renderer.circle(contactX, contactY, 10, "rgba(142, 223, 255, 0.08)");
        renderer.strokeRect(contactX - 7, contactY - 7, 14, 14, "rgba(142, 223, 255, 0.42)", 1.1);
      }
      if (isSelected) {
        renderer.circle(contactX, contactY, 8, "rgba(255, 236, 169, 0.08)");
      }
      renderer.circle(contactX, contactY, isSelected ? 4.8 : 3, contact.accent);
      if (isSelected || isTracked) {
        renderer.text(contact.name, contactX + 10, contactY + 4, {
          color: isSelected ? "#f7efd8" : "#d9f4ff",
          font: isSelected ? "bold 12px Trebuchet MS" : "11px Trebuchet MS"
        });
      }
    }

    renderer.circle(mapCenterX, mapCenterY, 3.4, "#f7efd8");
    renderer.text("YOU", mapCenterX + 8, mapCenterY - 8, {
      color: "#f7efd8",
      font: "bold 11px Trebuchet MS"
    });

    const listX = x + 456;
    renderer.text("CONTACTS", listX, y + 66, {
      color: "#f2dfab",
      font: "bold 12px Trebuchet MS"
    });

    for (let i = startIndex; i < endIndex; i += 1) {
      const contact = NAV_CONTACTS[i]!;
      const rowY = y + 80 + (i - startIndex) * rowHeight;
      const isTracked = contact.id === tracked.id;
      const isSelected = i === this.selectedNavIndex;
      renderer.rect(
        listX,
        rowY,
        224,
        42,
        isSelected ? "rgba(255, 229, 154, 0.08)" : isTracked ? "rgba(142, 223, 255, 0.08)" : "rgba(18, 23, 31, 0.3)"
      );
      renderer.strokeRect(
        listX,
        rowY,
        224,
        42,
        isSelected ? "rgba(255, 229, 154, 0.42)" : isTracked ? "rgba(142, 223, 255, 0.34)" : "rgba(124, 138, 158, 0.18)",
        isSelected ? 1.2 : 1
      );
      renderer.circle(listX + 14, rowY + 16, 4, contact.accent);
      renderer.text(contact.name, listX + 26, rowY + 20, {
        color: isSelected ? "#f7efd8" : isTracked ? "#d9f4ff" : "#d6e2f0",
        font: isSelected ? "bold 12px Trebuchet MS" : "12px Trebuchet MS"
      });
      renderer.text(contact.type.toUpperCase(), listX + 224 - 10, rowY + 20, {
        align: "right",
        color: contact.destination ? "#9deab2" : isTracked ? "#8edfff" : contact.accent,
        font: "11px Trebuchet MS"
      });
      drawTextBlock(renderer, contact.note, listX + 10, rowY + 28, 204, 12, {
        color: "#92a6bd",
        font: "10px Trebuchet MS"
      });
    }

    if (startIndex > 0) {
      renderer.text("MORE ABOVE", listX + 224, y + 74, {
        align: "right",
        color: "#8f9fb4",
        font: "10px Trebuchet MS"
      });
    }
    if (endIndex < NAV_CONTACTS.length) {
      renderer.text("MORE BELOW", listX + 224, y + 80 + visibleRows * rowHeight - 4, {
        align: "right",
        color: "#8f9fb4",
        font: "10px Trebuchet MS"
      });
    }

    renderer.rect(listX, y + 320, 224, 40, "rgba(10, 14, 20, 0.64)");
    renderer.strokeRect(listX, y + 320, 224, 40, "rgba(124, 138, 158, 0.18)", 1);
    renderer.text(`TRACK ${tracked.name.toUpperCase()}`, listX + 10, y + 336, {
      color: "#8edfff",
      font: "bold 11px Trebuchet MS"
    });
    renderer.text(
      !selected.destination
        ? "Preview only"
        : !this.syncUnlocked
          ? "Charter locked"
        : selected.id === this.currentLocationId
          ? "Already in orbit"
          : "Enter to burn",
      listX + 214,
      y + 336,
      {
      align: "right",
      color: !selected.destination ? "#97aac0" : !this.syncUnlocked ? "#97aac0" : selected.id === this.currentLocationId ? "#9deab2" : "#f2dfab",
      font: "10px Trebuchet MS"
      }
    );
    drawTextBlock(
      renderer,
      selected.destination
        ? selectedPreview
          ? `${selected.name} // ${selected.note} // ${selectedPreview.totalDistance.toFixed(1)} AU${selectedPreview.wonderId ? ` // ${routeWonderById(selectedPreview.wonderId)?.label ?? "Route wonder"}` : ""}`
          : `${selected.name} // ${selected.note} // local orbit`
        : `${selected.name} // ${selected.note} // route preview only`,
      listX + 10,
      y + 346,
      204,
      11,
      {
      color: "#cfdceb",
      font: "10px Trebuchet MS"
      }
    );

    renderer.text("M close | Tracked route feeds the compact nav panel and future comms.", x + 22, y + height - 18, {
      color: "#8f9fb4",
      font: "12px Trebuchet MS"
    });
    ctx.restore();
  }

  private renderOrbitOverlay(): void {
    const contact = this.currentOrbitContact();
    const destination = this.currentOrbitDestination();
    const options = this.orbitMenuOptions();
    if (!contact || !destination || options.length === 0) {
      return;
    }

    if (this.orbitScreenMode === "market") {
      this.renderOrbitMarketOverlay(contact);
      return;
    }

    if (this.orbitScreenMode === "workshop") {
      this.renderOrbitWorkshopOverlay(contact);
      return;
    }

    const { renderer } = this.services;
    const { ctx } = renderer;
    const x = 36;
    const y = 56;
    const width = 344;
    const selectedOption = options[Math.min(this.orbitMenuIndex, options.length - 1)] ?? options[0]!;
    const bodyWidth = width - 36;
    const summaryFont = "12px Trebuchet MS";
    const summaryLineHeight = 15;
    const descriptionFont = "11px Trebuchet MS";
    const descriptionLineHeight = 13;
    const rowHeight = 24;

    ctx.save();
    ctx.font = summaryFont;
    const summaryLines = wrapTextLines(destination.ui.orbitSummary, bodyWidth, (value) => ctx.measureText(value).width);
    ctx.font = descriptionFont;
    const descriptionLines = wrapTextLines(selectedOption.description, bodyWidth, (value) => ctx.measureText(value).width);
    ctx.restore();

    const summaryY = y + 54;
    const summaryBlockHeight = Math.max(summaryLineHeight, summaryLines.length * summaryLineHeight);
    const optionsY = summaryY + summaryBlockHeight + 14;
    const descriptionY = optionsY + options.length * rowHeight + 12;
    const descriptionBlockHeight = Math.max(descriptionLineHeight, descriptionLines.length * descriptionLineHeight);
    const minHeight = 244;
    const height = Math.max(minHeight, descriptionY - y + descriptionBlockHeight + 34);

    drawPanel(renderer, x, y, width, height, `${contact.name} Orbit`);
    renderer.text(destination.ui.orbitTitle, x + 18, y + 38, {
      color: contact.accent,
      font: "bold 12px Trebuchet MS"
    });
    drawTextBlock(
      renderer,
      destination.ui.orbitSummary,
      x + 18,
      summaryY,
      bodyWidth,
      summaryLineHeight,
      {
        color: "#d6e2f0",
        font: summaryFont
      }
    );

    for (let i = 0; i < options.length; i += 1) {
      const rowY = optionsY + i * rowHeight;
      const selected = i === this.orbitMenuIndex;
      renderer.rect(x + 18, rowY, width - 36, 18, selected ? "rgba(255, 229, 154, 0.12)" : "rgba(14, 18, 25, 0.34)");
      renderer.strokeRect(x + 18, rowY, width - 36, 18, selected ? "rgba(255, 229, 154, 0.42)" : "rgba(124, 138, 158, 0.18)", selected ? 1.2 : 1);
      renderer.text(options[i]!.label, x + 30, rowY + 13, {
        color: selected ? "#f7efd8" : "#c8d6e8",
        font: selected ? "bold 12px Trebuchet MS" : "12px Trebuchet MS"
      });
      renderer.text(options[i]!.tag, x + width - 30, rowY + 13, {
        align: "right",
        color: selected ? "#f2dfab" : "#8ea3ba",
        font: "11px Trebuchet MS"
      });
    }

    drawTextBlock(renderer, selectedOption.description, x + 18, descriptionY, bodyWidth, descriptionLineHeight, {
      color: "#bfcddd",
      font: descriptionFont
    });
    renderer.text("Up/Down move | Enter confirm | Esc title", x + 18, y + height - 16, {
      color: "#8f9fb4",
      font: "12px Trebuchet MS"
    });
  }

  private renderOrbitMarketOverlay(contact: NavContact): void {
    const { renderer } = this.services;
    const profile = marketProfileFor(contact.id);
    const quotes = this.currentMarketQuotes();
    if (!profile || quotes.length === 0) {
      return;
    }

    const x = 34;
    const y = 54;
    const width = 430;
    const height = 272;
    const selectedQuote = quotes[Math.min(this.marketSelectionIndex, quotes.length - 1)] ?? quotes[0]!;

    drawPanel(renderer, x, y, width, height, `${contact.name} Market`);
    renderer.text(profile.title.toUpperCase(), x + 18, y + 38, {
      color: contact.accent,
      font: "bold 12px Trebuchet MS"
    });
    renderer.text(`${this.credits} CR`, x + width - 18, y + 38, {
      align: "right",
      color: "#f2dfab",
      font: "bold 12px Trebuchet MS"
    });
    drawTextBlock(renderer, profile.summary, x + 18, y + 54, width - 36, 14, {
      color: "#d6e2f0",
      font: "12px Trebuchet MS"
    });

    renderer.text(`HOLD ${this.cargoUsed()}/${this.cargoCapacity()}`, x + 18, y + 100, {
      color: "#9deab2",
      font: "bold 11px Trebuchet MS"
    });
    renderer.text(this.marketAction === "buy" ? "ACTION BUY" : "ACTION SELL", x + width - 18, y + 100, {
      align: "right",
      color: this.marketAction === "buy" ? "#8edfff" : "#ffbf9f",
      font: "bold 11px Trebuchet MS"
    });

    for (let i = 0; i < quotes.length; i += 1) {
      const quote = quotes[i]!;
      const rowY = y + 112 + i * 24;
      const selected = i === this.marketSelectionIndex;
      const owned = cargoQuantity(this.cargoManifest, quote.commodity.id);
      renderer.rect(x + 18, rowY, 226, 18, selected ? "rgba(255, 229, 154, 0.08)" : "rgba(14, 18, 25, 0.28)");
      renderer.strokeRect(x + 18, rowY, 226, 18, selected ? "rgba(255, 229, 154, 0.42)" : "rgba(124, 138, 158, 0.18)", selected ? 1.2 : 1);
      renderer.text(quote.commodity.name, x + 28, rowY + 13, {
        color: selected ? "#f7efd8" : "#d7e4f2",
        font: selected ? "bold 12px Trebuchet MS" : "12px Trebuchet MS"
      });
      renderer.text(`${quote.buyPrice} / ${quote.sellPrice}`, x + 196, rowY + 13, {
        align: "right",
        color: "#f2dfab",
        font: "11px Trebuchet MS"
      });
      renderer.text(`${owned}`, x + 234, rowY + 13, {
        align: "right",
        color: owned > 0 ? "#9deab2" : "#7f92a9",
        font: "11px Trebuchet MS"
      });
    }

    renderer.rect(x + 256, y + 112, width - 274, 120, "rgba(10, 14, 20, 0.64)");
    renderer.strokeRect(x + 256, y + 112, width - 274, 120, "rgba(124, 138, 158, 0.18)", 1);
    renderer.text(selectedQuote.commodity.name.toUpperCase(), x + 270, y + 128, {
      color: selectedQuote.commodity.accent,
      font: "bold 12px Trebuchet MS"
    });
    renderer.text(`${selectedQuote.relativeDelta >= 0 ? "+" : ""}${Math.round(selectedQuote.relativeDelta * 100)}%`, x + width - 18, y + 128, {
      align: "right",
      color: selectedQuote.relativeDelta >= 0 ? "#ffbf9f" : "#9deab2",
      font: "bold 11px Trebuchet MS"
    });
    drawTextBlock(renderer, selectedQuote.commodity.description, x + 270, y + 144, width - 292, 14, {
      color: "#d6e2f0",
      font: "12px Trebuchet MS"
    });
    renderer.text(`BUY ${selectedQuote.buyPrice} CR`, x + 270, y + 198, {
      color: this.marketAction === "buy" ? "#8edfff" : "#92a6bd",
      font: this.marketAction === "buy" ? "bold 12px Trebuchet MS" : "12px Trebuchet MS"
    });
    renderer.text(`SELL ${selectedQuote.sellPrice} CR`, x + width - 18, y + 198, {
      align: "right",
      color: this.marketAction === "sell" ? "#ffbf9f" : "#92a6bd",
      font: this.marketAction === "sell" ? "bold 12px Trebuchet MS" : "12px Trebuchet MS"
    });
    renderer.text("OWNED", x + 270, y + 220, {
      color: "#92a6bd",
      font: "10px Trebuchet MS"
    });
    renderer.text(`${cargoQuantity(this.cargoManifest, selectedQuote.commodity.id)} lots`, x + width - 18, y + 220, {
      align: "right",
      color: "#f7efd8",
      font: "11px Trebuchet MS"
    });

    renderer.text("Up/Down select | Left sell | Right buy | Enter trade | Esc back", x + 18, y + height - 16, {
      color: "#8f9fb4",
      font: "12px Trebuchet MS"
    });
  }

  private renderOrbitWorkshopOverlay(contact: NavContact): void {
    const { renderer } = this.services;
    const profile = workshopProfileFor(contact.id);
    const parts = this.currentWorkshopParts(this.workshopCategory);
    if (!profile) {
      return;
    }

    const x = 34;
    const y = 54;
    const width = 430;
    const height = 272;
    const selectedPart = parts[Math.min(this.workshopSelectionIndex, Math.max(0, parts.length - 1))] ?? null;
    const currentEngine = currentEnginePart(this.shipUpgradeIds);
    const currentCargo = currentCargoPart(this.shipUpgradeIds);
    const hasEngineOffers = this.currentWorkshopParts("engine").length > 0;
    const hasCargoOffers = this.currentWorkshopParts("cargo").length > 0;

    drawPanel(renderer, x, y, width, height, `${contact.name} Workshop`);
    renderer.text(profile.title.toUpperCase(), x + 18, y + 38, {
      color: contact.accent,
      font: "bold 12px Trebuchet MS"
    });
    renderer.text(`${this.credits} CR`, x + width - 18, y + 38, {
      align: "right",
      color: "#f2dfab",
      font: "bold 12px Trebuchet MS"
    });
    drawTextBlock(renderer, profile.summary, x + 18, y + 54, width - 36, 14, {
      color: "#d6e2f0",
      font: "12px Trebuchet MS"
    });

    this.renderMiniButton(x + 18, y + 96, 74, 14, "A ENG", this.workshopCategory === "engine" || !hasCargoOffers);
    this.renderMiniButton(x + 100, y + 96, 74, 14, "D CARGO", this.workshopCategory === "cargo" || !hasEngineOffers);

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]!;
      const rowY = y + 118 + i * 28;
      const selected = i === this.workshopSelectionIndex;
      const installed = (part.category === "engine" ? currentEngine.id : currentCargo.id) === part.id;
      renderer.rect(x + 18, rowY, 236, 22, selected ? "rgba(255, 229, 154, 0.08)" : "rgba(14, 18, 25, 0.28)");
      renderer.strokeRect(x + 18, rowY, 236, 22, selected ? "rgba(255, 229, 154, 0.42)" : installed ? "rgba(157, 234, 178, 0.3)" : "rgba(124, 138, 158, 0.18)", selected ? 1.2 : 1);
      renderer.text(part.name, x + 28, rowY + 14, {
        color: selected ? "#f7efd8" : installed ? "#c8f7db" : "#d7e4f2",
        font: selected || installed ? "bold 12px Trebuchet MS" : "12px Trebuchet MS"
      });
      renderer.text(installed ? "INST" : `${part.price} CR`, x + 244, rowY + 14, {
        align: "right",
        color: installed ? "#9deab2" : "#f2dfab",
        font: "11px Trebuchet MS"
      });
    }

    renderer.rect(x + 266, y + 118, width - 284, 120, "rgba(10, 14, 20, 0.64)");
    renderer.strokeRect(x + 266, y + 118, width - 284, 120, "rgba(124, 138, 158, 0.18)", 1);
    if (selectedPart) {
      renderer.text(selectedPart.shortName.toUpperCase(), x + 280, y + 134, {
        color: "#f7efd8",
        font: "bold 12px Trebuchet MS"
      });
      renderer.text(`TIER ${selectedPart.tier}`, x + width - 18, y + 134, {
        align: "right",
        color: "#8edfff",
        font: "bold 11px Trebuchet MS"
      });
      drawTextBlock(renderer, selectedPart.description, x + 280, y + 150, width - 302, 14, {
        color: "#d6e2f0",
        font: "12px Trebuchet MS"
      });
      const statLine = selectedPart.category === "engine"
        ? `Accel ${(selectedPart.accelerationMultiplier * 100).toFixed(0)} // Top ${Math.round(MAX_SSI * selectedPart.maxSsiMultiplier)} SSI`
        : `Capacity ${selectedPart.capacity} lots`;
      renderer.text(statLine, x + 280, y + 204, {
        color: "#f2dfab",
        font: "12px Trebuchet MS"
      });
      renderer.text(`Current ${selectedPart.category === "engine" ? currentEngine.shortName : currentCargo.shortName}`, x + 280, y + 224, {
        color: "#9deab2",
        font: "11px Trebuchet MS"
      });
    } else {
      renderer.text("No staged fits in this category.", x + 280, y + 148, {
        color: "#92a6bd",
        font: "12px Trebuchet MS"
      });
    }

    renderer.text("Up/Down select | Left/Right category | Enter install | Esc back", x + 18, y + height - 16, {
      color: "#8f9fb4",
      font: "12px Trebuchet MS"
    });
  }

  private renderRadioHud(
    x: number,
    y: number,
    width: number,
    height: number,
    currentBand: CertificationBand | null,
    speedState: ReturnType<typeof getSpeedState>
  ): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const speakerX = x + 18;
    const speakerY = y + 34;
    const speakerWidth = 110;
    const speakerHeight = 44;
    const controlX = x + 146;
    const controlY = y + 34;
    const controlWidth = width - 164;
    const controlHeight = 44;
    const screenX = x + 18;
    const screenY = y + 86;
    const screenWidth = width - 36;
    const screenHeight = height - 98;
    const bandProgress = currentBand ? this.holdProgress / currentBand.holdSeconds : 1;
    const speakerPulse = clamp(
      (this.audioEnabled ? 0.38 : 0.08) +
        (Math.sin(this.clock * 7.4) * 0.12 + 0.12) +
        clamp(this.surgeFlash / 0.92, 0, 1) * 0.48,
      0,
      1
    );
    const tuneAngle = -Math.PI * 0.76 + clamp(this.ssi / MAX_SSI, 0, 1) * Math.PI * 1.52;
    const gainAngle = -Math.PI * 0.76 + clamp(this.throttle / 100, 0, 1) * Math.PI * 1.52;
    const lines = this.radioTextLines(currentBand, speedState);
    const sweepRatio = (this.clock * 0.8) % 1;

    drawPanel(renderer, x, y, width, height, "Relay Radio");

    const chassis = ctx.createLinearGradient(x, y + 28, x, y + height - 10);
    chassis.addColorStop(0, "rgba(42, 49, 57, 0.28)");
    chassis.addColorStop(1, "rgba(9, 12, 17, 0)");
    ctx.fillStyle = chassis;
    ctx.fillRect(x + 10, y + 26, width - 20, height - 36);

    const speakerFill = ctx.createLinearGradient(speakerX, speakerY, speakerX, speakerY + speakerHeight);
    speakerFill.addColorStop(0, "#131820");
    speakerFill.addColorStop(1, "#090c12");
    ctx.fillStyle = speakerFill;
    ctx.fillRect(speakerX, speakerY, speakerWidth, speakerHeight);
    renderer.strokeRect(speakerX, speakerY, speakerWidth, speakerHeight, "rgba(180, 194, 214, 0.18)", 1.2);

    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const holeX = speakerX + 14 + col * 11.6;
        const holeY = speakerY + 12 + row * 10.4;
        const holeGlow = 0.18 + speakerPulse * 0.22 - row * 0.015;
        renderer.circle(holeX, holeY, 2.1, `rgba(177, 196, 220, ${holeGlow.toFixed(3)})`);
      }
    }

    ctx.save();
    ctx.globalAlpha = 0.32 + speakerPulse * 0.24;
    ctx.strokeStyle = "rgba(126, 224, 255, 0.46)";
    ctx.lineWidth = 1.2 + speakerPulse * 1.4;
    for (let i = 0; i < 3; i += 1) {
      const radius = 10 + i * 9 + speakerPulse * (4 + i * 2);
      ctx.beginPath();
      ctx.arc(speakerX + speakerWidth * 0.5, speakerY + speakerHeight * 0.5, radius, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.restore();

    renderer.text("SPKR", speakerX + 10, speakerY - 5, {
      color: "#8da0b9",
      font: "11px Trebuchet MS"
    });

    const meterFill = ctx.createLinearGradient(controlX, controlY, controlX + controlWidth, controlY);
    meterFill.addColorStop(0, "#111720");
    meterFill.addColorStop(1, "#0a0d12");
    ctx.fillStyle = meterFill;
    ctx.fillRect(controlX, controlY, controlWidth, controlHeight);
    renderer.strokeRect(controlX, controlY, controlWidth, controlHeight, "rgba(180, 194, 214, 0.16)", 1.2);

    const ledY = controlY + 12;
    this.renderIndicatorLamp(controlX + 10, ledY, this.audioEnabled, "#67f1d6", "RX");
    this.renderIndicatorLamp(controlX + 42, ledY, this.statusTimer > 0 || this.surgeFlash > 0, "#ffde85", "TXT");
    this.renderIndicatorLamp(controlX + 74, ledY, currentBand ? isWithinBand(this.ssi, currentBand) : this.certificationPassed, "#9ef7ab", "LIVE");

    renderer.text("TUNE", controlX + 10, controlY + 39, {
      color: "#95a7bf",
      font: "11px Trebuchet MS"
    });
    renderer.text("GAIN", controlX + 66, controlY + 39, {
      color: "#95a7bf",
      font: "11px Trebuchet MS"
    });
    this.renderDial(controlX + 24, controlY + 26, 9, tuneAngle);
    this.renderDial(controlX + 80, controlY + 26, 9, gainAngle);

    const meterX = controlX + 102;
    const meterBaseY = controlY + controlHeight - 6;
    for (let i = 0; i < 5; i += 1) {
      const barHeight = 6 + i * 5;
      const activity =
        i / 5 < speakerPulse
          ? `rgba(117, 232, 255, ${(0.32 + i * 0.1 + speakerPulse * 0.18).toFixed(3)})`
          : "rgba(91, 104, 122, 0.24)";
      renderer.rect(meterX + i * 6, meterBaseY - barHeight, 4, barHeight, activity);
    }

    const screenFill = ctx.createLinearGradient(screenX, screenY, screenX, screenY + screenHeight);
    screenFill.addColorStop(0, "#13261d");
    screenFill.addColorStop(0.55, "#0c1b15");
    screenFill.addColorStop(1, "#07110d");
    ctx.fillStyle = screenFill;
    ctx.fillRect(screenX, screenY, screenWidth, screenHeight);
    renderer.strokeRect(screenX, screenY, screenWidth, screenHeight, "rgba(143, 255, 191, 0.22)", 1.2);

    for (let lineY = screenY + 2; lineY < screenY + screenHeight; lineY += 4) {
      renderer.rect(screenX + 2, lineY, screenWidth - 4, 1, "rgba(220, 255, 234, 0.04)");
    }

    ctx.fillStyle = `rgba(163, 255, 197, ${(0.05 + speakerPulse * 0.08).toFixed(3)})`;
    ctx.fillRect(screenX + 2, screenY + sweepRatio * (screenHeight - 8), screenWidth - 4, 7);

    for (let i = 0; i < lines.length; i += 1) {
      renderer.text(lines[i]!, screenX + 10, screenY + 14 + i * 13, {
        color: i === 0 ? "#dfffe7" : "#9deab2",
        font: "11px Consolas"
      });
    }

    const progressColor = currentBand ? currentBand.accent : "#88ffb3";
    renderer.rect(screenX + 9, screenY + screenHeight - 7, screenWidth - 18, 3, "rgba(214, 255, 226, 0.12)");
    renderer.rect(screenX + 9, screenY + screenHeight - 7, (screenWidth - 18) * clamp(bandProgress, 0, 1), 3, progressColor);
  }

  private renderTransmissionBubble(panelX: number, panelY: number, panelWidth: number): void {
    if (!this.activeTransmission || this.transmissionTimer <= 0) {
      return;
    }

    const { renderer } = this.services;
    const { ctx } = renderer;
    const bubbleWidth = Math.min(panelWidth + 4, 284);
    const contentWidth = bubbleWidth - 24;
    const channelFont = "bold 10px Trebuchet MS";
    const senderFont = "11px Trebuchet MS";
    const subjectFont = "bold 13px Trebuchet MS";
    const bodyFont = "11px Trebuchet MS";
    const senderWidth = Math.max(76, contentWidth * 0.42);
    const channelWidth = contentWidth - senderWidth - 8;
    const channelText = this.fitTextToWidth(this.activeTransmission.channel.toUpperCase(), channelWidth, channelFont);
    const senderText = this.fitTextToWidth(this.activeTransmission.sender, senderWidth, senderFont);
    ctx.save();
    ctx.font = subjectFont;
    const subjectLines = wrapTextLines(this.activeTransmission.subject, contentWidth, (value) => ctx.measureText(value).width);
    ctx.font = bodyFont;
    const bodyLines = wrapTextLines(this.activeTransmission.body, contentWidth, (value) => ctx.measureText(value).width);
    ctx.restore();
    const subjectLineHeight = 15;
    const bodyLineHeight = 13;
    const subjectBlockHeight = subjectLines.length * subjectLineHeight;
    const bodyBlockHeight = bodyLines.length * bodyLineHeight;
    const bubbleHeight = 22 + subjectBlockHeight + 8 + bodyBlockHeight + 14;
    const bubbleX = panelX + 6;
    const bubbleY = Math.max(12, panelY - bubbleHeight - 16);
    const tailBaseX = bubbleX + 62;
    const tailTipX = panelX + 72;
    const tailTipY = panelY + 18;
    const fadeIn = clamp((this.transmissionDuration - this.transmissionTimer) / 0.24, 0, 1);
    const fadeOut = clamp(this.transmissionTimer / 0.42, 0, 1);
    const alpha = Math.min(fadeIn, fadeOut);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(bubbleX + 12, bubbleY);
    ctx.lineTo(bubbleX + bubbleWidth - 12, bubbleY);
    ctx.lineTo(bubbleX + bubbleWidth, bubbleY + 12);
    ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - 12);
    ctx.lineTo(tailBaseX + 18, bubbleY + bubbleHeight - 12);
    ctx.lineTo(tailTipX, tailTipY);
    ctx.lineTo(tailBaseX, bubbleY + bubbleHeight - 12);
    ctx.lineTo(bubbleX + 12, bubbleY + bubbleHeight - 12);
    ctx.lineTo(bubbleX, bubbleY + bubbleHeight - 24);
    ctx.lineTo(bubbleX, bubbleY + 12);
    ctx.closePath();

    const fill = ctx.createLinearGradient(bubbleX, bubbleY, bubbleX, bubbleY + bubbleHeight);
    fill.addColorStop(0, "rgba(18, 24, 34, 0.96)");
    fill.addColorStop(1, "rgba(9, 12, 18, 0.96)");
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = this.activeTransmission.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    renderer.text(channelText, bubbleX + 12, bubbleY + 18, {
      color: this.activeTransmission.accent,
      font: channelFont
    });
    renderer.text(senderText, bubbleX + bubbleWidth - 12, bubbleY + 18, {
      align: "right",
      color: "#f5ecd4",
      font: senderFont
    });
    drawTextBlock(renderer, this.activeTransmission.subject, bubbleX + 12, bubbleY + 36, contentWidth, subjectLineHeight, {
      color: "#f7efd8",
      font: subjectFont
    });
    drawTextBlock(renderer, this.activeTransmission.body, bubbleX + 12, bubbleY + 44 + subjectBlockHeight, contentWidth, bodyLineHeight, {
      color: "#d3e2f3",
      font: bodyFont
    });
    ctx.restore();
  }

  private renderDial(x: number, y: number, radius: number, angle: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;

    renderer.circle(x, y, radius, "#1a212a");
    renderer.circle(x, y, radius - 3, "#2d3744");
    renderer.line(
      x,
      y,
      x + Math.cos(angle) * (radius - 2),
      y + Math.sin(angle) * (radius - 2),
      "#f0e2ad",
      1.8
    );

    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = "#b6c6d9";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, -Math.PI * 0.78, Math.PI * 0.78);
    ctx.stroke();
    ctx.restore();
  }

  private renderIndicatorLamp(x: number, y: number, active: boolean, color: string, label: string): void {
    const { renderer } = this.services;
    const alpha = active ? 0.95 : 0.18;

    renderer.circle(x, y, 4, `rgba(10, 12, 18, ${(0.7 + alpha * 0.2).toFixed(3)})`);
    renderer.circle(x, y, 2.4, active ? color : "rgba(80, 92, 108, 0.32)");
    renderer.text(label, x + 8, y + 4, {
      color: `rgba(223, 231, 243, ${(0.42 + alpha * 0.5).toFixed(3)})`,
      font: "10px Trebuchet MS"
    });
  }

  private renderMiniButton(x: number, y: number, width: number, height: number, label: string, active: boolean): void {
    const { renderer } = this.services;

    renderer.rect(x, y, width, height, active ? "rgba(98, 221, 255, 0.14)" : "rgba(62, 72, 86, 0.16)");
    renderer.strokeRect(x, y, width, height, active ? "rgba(127, 224, 255, 0.46)" : "rgba(124, 138, 158, 0.24)", 1);
    renderer.text(label, x + width * 0.5, y + 9, {
      align: "center",
      color: active ? "#d9f4ff" : "#8b9eb5",
      font: "10px Trebuchet MS"
    });
  }

  private slotDisplayLabel(slot: "autosave" | ManualSaveSlotId): string {
    switch (slot) {
      case "autosave":
        return "Autosave";
      case "slot1":
        return "Save 1";
      case "slot2":
        return "Save 2";
      case "slot3":
        return "Save 3";
    }
  }

  private refreshSaveArchiveSummary(): void {
    this.saveArchiveSummary = getSaveArchiveSummary();
  }

  private currentQuestStatusLabel(): string {
    if (this.questComplete()) {
      return "CHARTER FILED";
    }
    return `WINDOW ${Math.min(this.stageIndex + 1, FIRST_QUEST.steps.length)}/${FIRST_QUEST.steps.length}`;
  }

  private buildSavePayload(): CourierSavePayload {
    return {
      progression: {
        syncUnlocked: this.syncUnlocked,
        completedQuestIds: this.questComplete() ? [FIRST_QUEST.id] : [],
        activeQuestId: FIRST_QUEST.id,
        activeQuestTitle: FIRST_QUEST.title,
        completedStepCount: this.questComplete() ? FIRST_QUEST.steps.length : this.stageIndex,
        stepHoldProgress: this.questComplete() ? 0 : this.holdProgress,
        activeQuestComplete: this.questComplete(),
        statusLabel: this.currentQuestStatusLabel()
      },
      world: {
        locationId: this.currentLocationId,
        locationName: this.currentLocationName(),
        trackedDestinationId: this.trackedDestinationId,
        wakeOriginId: this.wakeOriginId,
        discoveredContactIds: [...this.discoveredContactIds],
        marketPulse: this.marketPulse,
        singularityThresholdSsi: this.singularityThresholdSsi
      },
      pilot: {
        credits: this.credits,
        upgradeIds: [...this.shipUpgradeIds],
        cargoManifest: cargoEntriesFromManifest(this.cargoManifest),
        hullIntegrity: this.hullIntegrity
      },
      comms: {
        transmissions: this.transmissionHistory.slice(-TRANSMISSION_HISTORY_LIMIT)
      }
    };
  }

  private writeAutosave(): void {
    writeSaveSlot("autosave", this.buildSavePayload());
    this.refreshSaveArchiveSummary();
  }

  private writeManualSync(slot: ManualSaveSlotId): void {
    if (!this.syncUnlocked) {
      this.audio.beep(240, 0.06, "triangle");
      this.setStatus("Registry sync locked until the Explorer Charter is filed.", 2.8);
      return;
    }

    writeSaveSlot(slot, this.buildSavePayload());
    this.refreshSaveArchiveSummary();
    this.audio.beep(720, 0.07, "sine");
    this.setStatus(`Registry sync written to ${this.slotDisplayLabel(slot)}.`, 2.6);
  }

  private showTransmission(transmission: RadioTransmission, duration = TRANSMISSION_BUBBLE_DURATION): void {
    this.activeTransmission = transmission;
    this.transmissionDuration = duration;
    this.transmissionTimer = duration;
    this.transmissionHistory.push(transmission);
    if (this.transmissionHistory.length > TRANSMISSION_HISTORY_LIMIT) {
      this.transmissionHistory = this.transmissionHistory.slice(-TRANSMISSION_HISTORY_LIMIT);
    }
    this.transmissionHistoryCursor = null;
  }

  private recallPreviousTransmission(): void {
    if (this.transmissionHistory.length === 0) {
      return;
    }

    if (this.transmissionHistoryCursor === null) {
      this.transmissionHistoryCursor = this.transmissionHistory.length - 1;
    } else {
      this.transmissionHistoryCursor = Math.max(0, this.transmissionHistoryCursor - 1);
    }

    this.activeTransmission = this.transmissionHistory[this.transmissionHistoryCursor] ?? null;
    if (!this.activeTransmission) {
      this.transmissionHistoryCursor = null;
      return;
    }

    this.transmissionDuration = TRANSMISSION_HISTORY_DURATION;
    this.transmissionTimer = TRANSMISSION_HISTORY_DURATION;
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

  private nearestNavContact(): NavContact {
    let nearest = NAV_CONTACTS[0]!;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const contact of NAV_CONTACTS) {
      const distance = Math.hypot(contact.x, contact.y);
      if (distance < nearestDistance) {
        nearest = contact;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  private radioTextLines(currentBand: CertificationBand | null, speedState: ReturnType<typeof getSpeedState>): string[] {
    if (this.activeTransmission && this.transmissionTimer > 0) {
      return [
        this.clipRadioText(`${this.activeTransmission.channel} // ${this.activeTransmission.sender}`, 34),
        this.clipRadioText(this.activeTransmission.subject, 34),
        this.clipRadioText(this.activeTransmission.body, 34)
      ];
    }

    if (this.activeRoute) {
      const destination = this.activeRouteDestination();
      const contact = this.activeRouteContact();
      if (destination && contact) {
        const routeDisplay = this.routeDisplayState();
        const remainingDistance = Math.max(0, routeDisplay?.remainingDistance ?? this.activeRoute.remainingDistance);
        const captureBandIndex = routeDisplay?.captureBandIndex ?? this.activeRoute.captureBandIndex;
        const band = destination.approachBands[Math.min(captureBandIndex, destination.approachBands.length - 1)]!;
        const routeWonder = routeWonderById(this.activeRoute.routeWonderId);
        if (this.currentOvershootRecovery()) {
          return [
            this.clipRadioText(`Route ${contact.name} // loop wide`, 34),
            this.clipRadioText(`Overshot approach // reset to ${band.label}`, 34),
            this.clipRadioText("Traffic is swinging you around for another pass", 34)
          ];
        }
        if (routeWonder && remainingDistance > destination.approachDistance * 1.18) {
          return [
            this.clipRadioText(`Route ${contact.name} // ${remainingDistance.toFixed(1)} AU`, 34),
            this.clipRadioText(`Signature ${routeWonder.label}`, 34),
            this.clipRadioText(routeWonder.summary, 34)
          ];
        }
        return [
          this.clipRadioText(`Route ${contact.name} // ${remainingDistance.toFixed(1)} AU`, 34),
          this.clipRadioText(`Capture ${captureBandIndex + 1}/${destination.approachBands.length} // ${band.label}`, 34),
          this.clipRadioText(this.ssi > band.maxSsi ? `Bleed below ${band.maxSsi} SSI for capture` : "Good band // keep bleeding into orbit", 34)
        ];
      }
    }

    if (this.orbitInteractionOpen()) {
      const contact = this.currentOrbitContact();
      const destination = this.currentOrbitDestination();
      if (contact && destination) {
        if (this.orbitScreenMode === "market") {
          return [
            this.clipRadioText(`${contact.name} // Market Feed`, 34),
            this.clipRadioText(`${this.credits} CR // Hold ${this.cargoUsed()}/${this.cargoCapacity()}`, 34),
            this.clipRadioText("Up/Down select // Left sell // Right buy", 34)
          ];
        }
        if (this.orbitScreenMode === "workshop") {
          const engine = currentEnginePart(this.shipUpgradeIds);
          const cargo = currentCargoPart(this.shipUpgradeIds);
          return [
            this.clipRadioText(`${contact.name} // Workshop Feed`, 34),
            this.clipRadioText(`Drive ${engine.shortName} // Hold ${cargo.shortName}`, 34),
            this.clipRadioText("Left/Right category // Enter install", 34)
          ];
        }
        return [
          this.clipRadioText(`${contact.name} // Orbit Hold`, 34),
          this.clipRadioText(destination.ui.orbitStatusLine, 34),
          this.clipRadioText(destination.ui.orbitPromptLine, 34)
        ];
      }
    }

    if (this.orbitInteractionOpen()) {
      return [
        this.clipRadioText("Orbit hold // no channel", 34),
        this.clipRadioText("Services staged // standby", 34),
        this.clipRadioText("Use orbit panel or undock", 34)
      ];
    }

    if (this.voidSecretDriftActive && this.wakeOriginId === "mute-reach") {
      return [
        this.clipRadioText("Last Marker gone // no return chatter", 34),
        this.clipRadioText(`Void drift // ${speedState.label} // ${Math.round(this.ssi).toString().padStart(3, "0")} SSI`, 34),
        this.clipRadioText("No traffic // keep burning into the dark", 34)
      ];
    }

    const topLine = this.statusTimer > 0
      ? this.statusText
      : this.surgeFlash > 0 && this.surgeLabel
        ? `${this.effectDirection === "collapse" ? "Retro" : "Wake"} event: ${this.surgeLabel}`
        : this.audioEnabled
          ? "Carrier open // scan live"
          : "Audio muted // text-only feed";
    const middleLine = this.certificationPassed || !currentBand
      ? `Free drift // ${speedState.label} // ${Math.round(this.ssi).toString().padStart(3, "0")} SSI`
      : `Window ${this.stageIndex + 1}/${CERTIFICATION_BANDS.length} ${currentBand.label} ${currentBand.min}-${currentBand.max}`;
    const bottomLine = this.certificationPassed || !currentBand
      ? "No traffic // hold course or tap R to loop again"
      : this.radioBandCommand(currentBand);

    return [
      this.clipRadioText(topLine),
      this.clipRadioText(middleLine),
      this.clipRadioText(bottomLine)
    ];
  }

  private radioBandCommand(currentBand: CertificationBand): string {
    if (this.ssi < currentBand.min) {
      return `Push +${Math.ceil(currentBand.min - this.ssi)} SSI // target not reached`;
    }
    if (this.ssi > currentBand.max) {
      return `Bleed -${Math.ceil(this.ssi - currentBand.max)} SSI // too hot`;
    }
    return `Hold ${this.holdProgress.toFixed(1)} / ${currentBand.holdSeconds.toFixed(1)} s inside wake`;
  }

  private clipRadioText(text: string, maxLength = 38): string {
    if (text.length <= maxLength) {
      return text.toUpperCase();
    }
    return `${text.slice(0, Math.max(0, maxLength - 3)).toUpperCase()}...`;
  }

  private renderSecretCreditsOverlay(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const progress = clamp(this.secretCreditsOverlayProgress, 0, 1);
    const centerX = renderer.width * 0.5;
    const topY = 84;
    const bodyWidth = 540;
    const bodyX = centerX - bodyWidth * 0.5;
    const pulse = 0.5 + Math.sin(this.clock * 0.9) * 0.5;

    renderer.rect(0, 0, renderer.width, renderer.height, `rgba(0, 0, 0, ${(0.78 + progress * 0.18).toFixed(3)})`);

    ctx.save();
    ctx.globalAlpha = progress;
    const halo = ctx.createRadialGradient(centerX, topY + 110, 0, centerX, topY + 110, 280);
    halo.addColorStop(0, `rgba(198, 208, 224, ${(0.04 + pulse * 0.04).toFixed(3)})`);
    halo.addColorStop(0.36, `rgba(96, 109, 134, ${(0.03 + pulse * 0.03).toFixed(3)})`);
    halo.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, renderer.width, renderer.height);
    ctx.restore();

    renderer.text("THE VOID KEPT GOING", centerX, topY, {
      align: "center",
      color: `rgba(245, 239, 220, ${(0.44 + progress * 0.56).toFixed(3)})`,
      font: "bold 28px Trebuchet MS"
    });
    renderer.text("SECRET DRIFT ENDING", centerX, topY + 28, {
      align: "center",
      color: `rgba(155, 171, 193, ${(0.32 + progress * 0.48).toFixed(3)})`,
      font: "12px Trebuchet MS"
    });

    renderer.line(bodyX, topY + 58, bodyX + bodyWidth, topY + 58, `rgba(120, 136, 158, ${(0.18 + progress * 0.32).toFixed(3)})`, 1);
    renderer.line(bodyX, topY + 274, bodyX + bodyWidth, topY + 274, `rgba(120, 136, 158, ${(0.18 + progress * 0.24).toFixed(3)})`, 1);

    const sections = [
      { label: "Created By", value: "Carlos Villa" },
      { label: "Development Companion", value: "Codex 5.4" },
      { label: "Engine", value: "Playloom Engine" },
      { label: "Stack", value: "TypeScript // Vite // Vitest // Canvas renderer // Web Audio synth" }
    ] as const;

    let rowY = topY + 92;
    for (const section of sections) {
      renderer.text(section.label.toUpperCase(), bodyX + 12, rowY, {
        color: `rgba(242, 223, 171, ${(0.24 + progress * 0.5).toFixed(3)})`,
        font: "bold 11px Trebuchet MS"
      });
      drawTextBlock(renderer, section.value, bodyX + 180, rowY - 2, bodyWidth - 192, 16, {
        color: `rgba(214, 225, 239, ${(0.34 + progress * 0.6).toFixed(3)})`,
        font: "14px Trebuchet MS"
      });
      rowY += section.label === "Stack" ? 46 : 34;
    }

    ctx.save();
    ctx.font = "14px Trebuchet MS";
    const closing = wrapTextLines(
      "Last Marker vanished behind you. The stars did not return. There was only the engine, the dark, and the names that carried you this far.",
      bodyWidth - 24,
      (value) => ctx.measureText(value).width
    );
    ctx.restore();
    for (let i = 0; i < closing.length; i += 1) {
      renderer.text(closing[i]!, centerX, topY + 304 + i * 18, {
        align: "center",
        color: `rgba(176, 189, 206, ${(0.28 + progress * 0.52).toFixed(3)})`,
        font: "14px Trebuchet MS"
      });
    }

    renderer.text("ENTER OR ESC // RETURN TO TITLE", centerX, renderer.height - 54, {
      align: "center",
      color: `rgba(245, 239, 220, ${(0.26 + progress * 0.56).toFixed(3)})`,
      font: "bold 12px Trebuchet MS"
    });
    renderer.text("You crossed the last marker and kept burning.", centerX, renderer.height - 32, {
      align: "center",
      color: `rgba(135, 149, 170, ${(0.24 + progress * 0.44).toFixed(3)})`,
      font: "11px Trebuchet MS"
    });
  }

  private renderCheatOverlay(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const width = 438;
    const height = 186;
    const x = renderer.width * 0.5 - width * 0.5;
    const y = 96;
    const caretVisible = Math.floor(this.clock * 2.8) % 2 === 0;
    const displayInput = this.cheatInput.length > 0 ? this.cheatInput : "";

    ctx.save();
    ctx.globalAlpha = 0.6;
    renderer.rect(0, 0, renderer.width, renderer.height, "#02050a");
    ctx.restore();

    drawPanel(renderer, x, y, width, height, "Cheat Console");
    renderer.text("Esc close // Enter submit // Backspace delete", x + width - 18, y + 22, {
      align: "right",
      color: "#97aac0",
      font: "11px Trebuchet MS"
    });
    drawTextBlock(renderer, "Manual override is off-book. Type a code exactly as intended and press Enter.", x + 18, y + 42, width - 36, 14, {
      color: "#d8e4f4",
      font: "13px Trebuchet MS"
    });

    renderer.text("INPUT", x + 18, y + 92, {
      color: "#f2dfab",
      font: "bold 12px Trebuchet MS"
    });
    renderer.rect(x + 18, y + 100, width - 36, 34, "rgba(8, 12, 18, 0.84)");
    renderer.strokeRect(x + 18, y + 100, width - 36, 34, "rgba(142, 223, 255, 0.3)", 1.1);
    renderer.text(
      this.fitTextToWidth(`${displayInput}${caretVisible ? "_" : ""}`, width - 56, "16px Trebuchet MS"),
      x + 30,
      y + 122,
      {
        color: "#f7efd8",
        font: "16px Trebuchet MS"
      }
    );

    renderer.text("Known test codes", x + 18, y + 152, {
      color: "#97aac0",
      font: "11px Trebuchet MS"
    });
    renderer.text("show me the money // skip tutorial", x + width - 18, y + 152, {
      align: "right",
      color: "#8edfff",
      font: "italic 12px Trebuchet MS"
    });
    renderer.text(this.cheatFeedback, x + 18, y + 170, {
      color: this.cheatFeedbackAccent,
      font: "12px Trebuchet MS"
    });
  }

  private renderHelpOverlay(): void {
    const { renderer } = this.services;
    const x = renderer.width - 352;
    const y = 84;
    const width = 320;
    const height = 176;
    const labelX = x + 18;
    const bodyX = x + 80;
    const bodyWidth = width - 98;

    drawPanel(renderer, x, y, width, height, "Slipwake Notes");

    renderer.text("FIELD", labelX, y + 42, {
      color: "#f2dfab",
      font: "bold 12px Trebuchet MS"
    });
    drawTextBlock(renderer, "Stars stay on one wake line. Density shifts over time.", bodyX, y + 42, bodyWidth, 15, {
      color: "#d8e4f4",
      font: "13px Trebuchet MS"
    });

    renderer.text("SURGE", labelX, y + 78, {
      color: "#f2dfab",
      font: "bold 12px Trebuchet MS"
    });
    drawTextBlock(renderer, "Climbing bands bloom warm and re-arm below their floor.", bodyX, y + 78, bodyWidth, 15, {
      color: "#d8e4f4",
      font: "13px Trebuchet MS"
    });

    renderer.text("RETRO", labelX, y + 114, {
      color: "#f2dfab",
      font: "bold 12px Trebuchet MS"
    });
    drawTextBlock(renderer, "Brake hard to trigger cold collapse hits on the way down.", bodyX, y + 114, bodyWidth, 15, {
      color: "#d8e4f4",
      font: "13px Trebuchet MS"
    });

    renderer.text(`H hide | T cheats | L/M use arrows+enter | V ${getAudioMixProfile(this.audioMixMode).shortLabel}`, x + 18, y + 156, {
      color: "#97aac0",
      font: "12px Trebuchet MS"
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
