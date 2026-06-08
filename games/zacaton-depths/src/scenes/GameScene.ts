import { clamp, createLocalJsonStore, type Scene } from "@playloom/engine-core";
import { SynthAudio } from "@playloom/engine-audio";
import { ActionMap, createPlatformerActionBindings, type ActionBindings } from "@playloom/engine-input";
import { drawBar, drawTextBlock, type Renderer2D } from "@playloom/engine-renderer-canvas";
import { loadDiveAssets, type DiveAssets } from "../assets";
import type { AppServices } from "../context";
import {
  assessGasPlan,
  CAVE_MAX_DEPTH_METERS,
  CONTRACTS,
  DEFAULT_DIVE_SITE_ID,
  DIVE_SITES,
  decompressionLoadRate,
  decompressionReliefRate,
  LANDMARKS,
  MAPPING_BAND_METERS,
  MISSIONS,
  PIXELS_PER_METER,
  SURFACE_EXIT_DEPTH_METERS,
  UPGRADE_CATEGORIES,
  buildDiveStats,
  contractById,
  createDefaultProgress,
  diveSiteById,
  diveSiteUnlockReason,
  flashlightBatteryCapacity,
  flashlightBatteryDrainPerSecond,
  flashlightRechargeCost,
  installUpgrade,
  isProgressState,
  isUpgradePurchased,
  lifelineLengthCapacity,
  mappingCellId,
  nextMissionIndex,
  recommendedDecoStopDepth,
  siteLandmarks,
  tankDefinition,
  tankWeight,
  upgradeRequirementReason,
  upgradesForCategory,
  type DiveStats,
  type DiveSiteDefinition,
  type ContractDefinition,
  type MissionDefinition,
  type ProgressState,
  type SettingsState,
  type TankKind,
  type TankState,
  type UpgradeDefinition,
  type UpgradeId
} from "../gameData";
import { GAME_MANIFEST } from "../types";

type ScreenState = "menu" | "shop" | "contracts" | "sites" | "dive" | "mission-complete" | "game-over";

interface LifelinePoint {
  x: number;
  y: number;
}

interface CachedTank {
  readonly id: string;
  readonly tank: TankState;
  readonly x: number;
  readonly y: number;
  readonly linePointIndex: number;
}

interface DivePlayer {
  x: number;
  y: number;
  tanks: TankState[];
  tankGas: number;
  maxTankGas: number;
  lungOxygen: number;
  maxLungOxygen: number;
  swimSpeed: number;
  lightRadius: number;
  backupGas: number;
  backupUsed: boolean;
  reachedTarget: boolean;
  maxDepth: number;
  depthRateMetersPerMinute: number;
  decoLoad: number;
  decoStress: number;
  decoPulse: number;
  decoWarned: boolean;
  narcosis: number;
  narcosisPulse: number;
  narcosisWarned: boolean;
  narcosisIncidentClock: number;
  gasWarned: boolean;
  toxicityClock: number;
  expeditionFunding: number;
  explorationFunding: number;
  mappingFunding: number;
  landmarkFunding: number;
  activeExplorationSeconds: number;
  newMappedDepthBands: Set<number>;
  newMappedSiteCells: Set<string>;
  newDiscoveredLandmarkIds: Set<string>;
  completedContractId: string | null;
  darkContractFound: boolean;
  sedimentCloud: number;
  sedimentWarned: boolean;
  facing: -1 | 1;
  swimIntentX: number;
  swimIntentY: number;
  motionIntensity: number;
  kickPhase: number;
  visualPitch: number;
  elapsed: number;
  surfacePromptVisible: boolean;
  surfacePromptArmed: boolean;
  lungFlashClock: number;
  lungFlashCount: number;
  lungFlashPulse: number;
  flashlightOn: boolean;
  flashlightBattery: number;
  maxFlashlightBattery: number;
  flashlightLowWarned: boolean;
  tankLowWarned: boolean;
  lifelineDeployed: boolean;
  lifelinePoints: LifelinePoint[];
  lifelineLengthUsed: number;
  lifelineFollowActive: boolean;
  lifelineLimitWarned: boolean;
  cachedTanks: CachedTank[];
  nextCacheId: number;
}

interface DiveOutcome {
  readonly title: string;
  readonly details: string;
  readonly reward: number;
  readonly discoverySummary?: string;
}

interface BankedExpedition {
  readonly surveyReward: number;
  readonly contractReward: number;
  readonly explorationReward: number;
  readonly mappingReward: number;
  readonly landmarkReward: number;
  readonly totalReward: number;
}

const SAVE_KEY = "zacaton-depths.save.v1";
const DIVER_DRAW_WIDTH = 142;
const DIVER_DRAW_HEIGHT = 96;
const DIVER_BODY_RADIUS = 36;
const CAVE_CENTER_X = GAME_MANIFEST.width * 0.5;
const BASE_CAVE_HALF_WIDTH = 265;
const LUNG_OXYGEN_DRAIN_PER_SECOND = 100 / 48;
const TANK_GAS_DRAIN_PER_SECOND = 0.5;
const LUNG_CRITICAL_THRESHOLD = 25;
const LUNG_DARKEN_THRESHOLD = 50;
const LUNG_FLASH_INTERVAL = 3;
const LUNG_DROWN_FLASH_COUNT = 4;
const SURFACE_BAND_HEIGHT = 44;
const ACTIVE_EXPLORATION_REWARD_PER_SECOND = 0.16;
const ACTIVE_EXPLORATION_REWARD_CAP_SECONDS = 420;
const MAPPING_BASE_REWARD = 8;
const LANDMARK_DISCOVERY_RADIUS_METERS = 3.2;
const FLASHLIGHT_LOW_BATTERY_RATIO = 0.2;
const TANK_LOW_GAS_RATIO = 0.2;
const SAFE_ASCENT_RATE_METERS_PER_MINUTE = 9;
const DECO_STRESS_FAILURE = 100;
const NARCOSIS_FAILURE_SECONDS = 8;
const TOXICITY_FAILURE_SECONDS = 10;
const NARCOSIS_DRIFT_THRESHOLD = 34;
const LIFELINE_POINT_SPACING_PIXELS = 28;
const LIFELINE_REACH_PIXELS = 72;
const LIFELINE_FOLLOW_BOOST = 0.92;
const TANK_CACHE_REACH_PIXELS = 64;
const SEDIMENT_VISIBILITY_PENALTY = 0.34;
const MENU_ACTION_BINDINGS: ActionBindings = {
  menu_prev: ["arrowup"],
  menu_next: ["arrowdown"],
  menu_confirm: ["enter", " "],
  menu_back: ["escape", "backspace"]
};
const UI = {
  panelFill: "rgba(3, 12, 17, 0.88)",
  panelStroke: "rgba(83, 171, 190, 0.5)",
  panelAccent: "rgba(118, 220, 233, 0.94)",
  title: "#e7fbff",
  text: "#b8d9df",
  muted: "#7398a4",
  ok: "#8df0cc",
  warn: "#f0c36c",
  danger: "#ff806f"
} as const;

function drawInstrumentPanel(renderer: Renderer2D, x: number, y: number, width: number, height: number, title?: string): void {
  renderer.rect(x, y, width, height, UI.panelFill);
  renderer.strokeRect(x, y, width, height, UI.panelStroke, 1);
  renderer.line(x + 14, y + 34, x + width - 14, y + 34, "rgba(168, 165, 132, 0.22)", 1);
  if (title) {
    renderer.text(title, x + 16, y + 23, {
      color: UI.panelAccent,
      font: "bold 13px Aptos, Segoe UI, sans-serif"
    });
  }
}

export class GameScene implements Scene {
  private assets: DiveAssets | null = null;
  private loadingError: string | null = null;
  private readonly actions: ActionMap;
  private readonly store = createLocalJsonStore<ProgressState>({
    key: SAVE_KEY,
    validate: isProgressState
  });

  private progress: ProgressState = createDefaultProgress();
  private screen: ScreenState = "menu";
  private player: DivePlayer | null = null;
  private cameraY = -110;
  private animationClock = 0;
  private selectedCategoryIndex = 0;
  private selectedUpgradeIndex = 0;
  private selectedContractIndex = 0;
  private selectedDiveSiteIndex = 0;
  private shopPane: "categories" | "items" = "categories";
  private message = "Plan the dive, dive the plan.";
  private outcome: DiveOutcome | null = null;
  private darknessCanvas: HTMLCanvasElement | null = null;
  private darknessCtx: CanvasRenderingContext2D | null = null;
  private readonly sfxAudio = new SynthAudio();
  private readonly musicAudio = new SynthAudio();
  private breathAudioClock = 0;
  private ambientAudioClock = 0;

  constructor(private readonly services: AppServices) {
    this.actions = new ActionMap(this.services.input, {
      ...createPlatformerActionBindings(),
      ...MENU_ACTION_BINDINGS,
      open_shop: ["s"],
      open_contracts: ["c"],
      open_sites: ["t"],
      start_dive: ["enter", " "],
      reset_progress: ["r"],
      toggle_flashlight: ["f"],
      drop_tank: ["q"],
      deploy_lifeline: ["l"],
      follow_lifeline: ["h"],
      cache_tank: ["c"],
      toggle_music: ["m"],
      toggle_sfx: ["v"]
    });

    const saved = this.store.load();
    if (saved) {
      const savedDiscoveryState = saved as ProgressState & {
        mappedDepthBands?: readonly number[];
        discoveredLandmarkIds?: readonly string[];
        activeContractId?: string | null;
        completedContractIds?: readonly string[];
        selectedDiveSiteId?: string;
        mappedSiteCells?: readonly string[];
        tanks?: readonly TankState[];
        nextTankId?: number;
        flashlightBattery?: number;
        settings?: SettingsState;
      };
      const savedEquipment = { ...createDefaultProgress().equipment, ...saved.equipment };
      const savedTanks = Array.isArray(savedDiscoveryState.tanks)
        ? savedDiscoveryState.tanks.map((tank) => ({ ...tank, dropped: false }))
        : this.tanksFromLegacyEquipment(saved.equipment);
      const maxFlashlightBattery = flashlightBatteryCapacity(savedEquipment);
      this.progress = {
        ...saved,
        activeMissionIndex: clamp(saved.activeMissionIndex, 0, MISSIONS.length - 1),
        mappedDepthBands: Array.isArray(savedDiscoveryState.mappedDepthBands) ? [...savedDiscoveryState.mappedDepthBands] : [],
        discoveredLandmarkIds: Array.isArray(savedDiscoveryState.discoveredLandmarkIds)
          ? [...savedDiscoveryState.discoveredLandmarkIds]
          : [],
        activeContractId: contractById(savedDiscoveryState.activeContractId) ? savedDiscoveryState.activeContractId ?? null : null,
        completedContractIds: Array.isArray(savedDiscoveryState.completedContractIds)
          ? savedDiscoveryState.completedContractIds.filter((id) => contractById(id))
          : [],
        selectedDiveSiteId: diveSiteById(savedDiscoveryState.selectedDiveSiteId).id,
        mappedSiteCells: Array.isArray(savedDiscoveryState.mappedSiteCells) ? [...savedDiscoveryState.mappedSiteCells] : [],
        tanks: savedTanks,
        nextTankId:
          typeof savedDiscoveryState.nextTankId === "number"
            ? savedDiscoveryState.nextTankId
            : this.nextTankIdFromTanks(savedTanks),
        flashlightBattery: clamp(
          typeof savedDiscoveryState.flashlightBattery === "number"
            ? savedDiscoveryState.flashlightBattery
            : maxFlashlightBattery,
          0,
          maxFlashlightBattery
        ),
        settings: savedDiscoveryState.settings ?? { musicEnabled: false, sfxEnabled: false },
        equipment: savedEquipment
      };
    }
    this.applyAudioSettings();

    void loadDiveAssets()
      .then((assets) => {
        this.assets = assets;
      })
      .catch((error: unknown) => {
        this.loadingError = error instanceof Error ? error.message : "Unknown asset loading error";
      });
  }

  update(dt: number): void {
    this.animationClock += dt;
    this.updateAudioSettingShortcuts();

    if (this.loadingError || !this.assets) {
      return;
    }

    switch (this.screen) {
      case "menu":
        this.updateMenu();
        break;
      case "shop":
        this.updateShop();
        break;
      case "contracts":
        this.updateContracts();
        break;
      case "sites":
        this.updateSites();
        break;
      case "dive":
        this.updateDive(dt);
        break;
      case "mission-complete":
        this.updateMissionComplete();
        break;
      case "game-over":
        this.updateGameOver();
        break;
    }
    this.updateAmbientAndBreathingAudio(dt);
  }

  render(_alpha: number): void {
    if (this.loadingError) {
      this.renderLoadingError();
      return;
    }

    if (!this.assets) {
      this.renderLoading();
      return;
    }

    if (this.screen === "dive") {
      this.renderDive();
      return;
    }

    this.renderMenuBackdrop();
    if (this.screen === "shop") {
      this.renderShop();
      return;
    }
    if (this.screen === "contracts") {
      this.renderContracts();
      return;
    }
    if (this.screen === "sites") {
      this.renderSites();
      return;
    }
    if (this.screen === "mission-complete") {
      this.renderMissionComplete();
      return;
    }
    if (this.screen === "game-over") {
      this.renderGameOver();
      return;
    }
    this.renderMenu();
  }

  private currentMission(): MissionDefinition {
    return MISSIONS[this.progress.activeMissionIndex] ?? MISSIONS[0]!;
  }

  private activeContract(): ContractDefinition | null {
    return contractById(this.progress.activeContractId);
  }

  private activeDiveSite(): DiveSiteDefinition {
    return diveSiteById(this.progress.selectedDiveSiteId);
  }

  private currentCategory(): (typeof UPGRADE_CATEGORIES)[number] {
    return UPGRADE_CATEGORIES[this.selectedCategoryIndex] ?? UPGRADE_CATEGORIES[0]!;
  }

  private currentCategoryUpgrades(): readonly UpgradeDefinition[] {
    return upgradesForCategory(this.currentCategory().id);
  }

  private updateAudioSettingShortcuts(): void {
    if (this.actions.wasPressed("toggle_music")) {
      const enabled = !this.progress.settings.musicEnabled;
      this.progress = {
        ...this.progress,
        settings: {
          ...this.progress.settings,
          musicEnabled: enabled
        }
      };
      this.applyAudioSettings();
      this.saveProgress();
      this.message = enabled ? "Music ambience enabled." : "Music ambience muted.";
    }

    if (this.actions.wasPressed("toggle_sfx")) {
      const enabled = !this.progress.settings.sfxEnabled;
      this.progress = {
        ...this.progress,
        settings: {
          ...this.progress.settings,
          sfxEnabled: enabled
        }
      };
      this.applyAudioSettings();
      this.saveProgress();
      this.message = enabled ? "Sound effects enabled." : "Sound effects muted.";
      if (enabled) {
        this.sfxAudio.beep(520, 0.05, "sine");
      }
    }
  }

  private applyAudioSettings(): void {
    this.sfxAudio.setEnabled(this.progress.settings.sfxEnabled);
    this.sfxAudio.setVolume(0.55);
    this.musicAudio.setEnabled(this.progress.settings.musicEnabled);
    this.musicAudio.setVolume(0.28);
  }

  private updateAmbientAndBreathingAudio(dt: number): void {
    const player = this.screen === "dive" ? this.player : null;
    if (!player) {
      this.breathAudioClock = 0;
      this.ambientAudioClock = 0;
      return;
    }

    const depth = this.depthFromWorldY(player.y);
    if (depth <= SURFACE_EXIT_DEPTH_METERS + 0.8 || player.surfacePromptVisible) {
      this.breathAudioClock = 0;
      this.ambientAudioClock = Math.max(0, this.ambientAudioClock - dt);
      return;
    }

    if (this.progress.settings.sfxEnabled) {
      this.breathAudioClock -= dt;
      if (this.breathAudioClock <= 0) {
        const gasStress = player.maxTankGas > 0 ? 1 - clamp(player.tankGas / player.maxTankGas, 0, 1) : 1 - clamp(player.lungOxygen / player.maxLungOxygen, 0, 1);
        this.sfxAudio.beep(105 + gasStress * 45, 0.045, "sine");
        this.breathAudioClock = clamp(3.8 - gasStress * 1.5 - depth / 360, 1.5, 4.1);
      }
    }

    if (this.progress.settings.musicEnabled) {
      this.ambientAudioClock -= dt;
      if (this.ambientAudioClock <= 0) {
        const depthFactor = clamp(depth / CAVE_MAX_DEPTH_METERS, 0, 1);
        this.musicAudio.beep(58 + depthFactor * 36, 0.28 + depthFactor * 0.22, "sine");
        if (depthFactor > 0.55) {
          this.musicAudio.beep(42 + depthFactor * 24, 0.18, "triangle");
        }
        this.ambientAudioClock = clamp(5.2 - depthFactor * 2.5, 2.1, 5.2);
      }
    }
  }

  private playSfx(kind: "flashlight" | "warning" | "surface" | "tank-drop" | "landmark" | "game-over"): void {
    if (!this.progress.settings.sfxEnabled) return;
    switch (kind) {
      case "flashlight":
        this.sfxAudio.beep(720, 0.045, "sine");
        break;
      case "warning":
        this.sfxAudio.beep(210, 0.09, "square");
        break;
      case "surface":
        this.sfxAudio.whoosh();
        break;
      case "tank-drop":
        this.sfxAudio.impact();
        break;
      case "landmark":
        this.sfxAudio.repair();
        break;
      case "game-over":
        this.sfxAudio.gameOver();
        break;
    }
  }

  private updateMenu(): void {
    if (this.actions.wasPressed("start_dive")) {
      this.startDive();
      return;
    }
    if (this.actions.wasPressed("open_shop")) {
      this.screen = "shop";
      this.shopPane = "categories";
      this.message = "Choose the next equipment decision.";
      return;
    }
    if (this.actions.wasPressed("open_contracts")) {
      this.screen = "contracts";
      this.selectedContractIndex = Math.max(
        0,
        CONTRACTS.findIndex((contract) => contract.id === this.progress.activeContractId)
      );
      this.message = "Contracts are optional. Pick one or dive without one.";
      return;
    }
    if (this.actions.wasPressed("open_sites")) {
      this.screen = "sites";
      this.selectedDiveSiteIndex = Math.max(
        0,
        DIVE_SITES.findIndex((site) => site.id === this.progress.selectedDiveSiteId)
      );
      this.message = "Choose a dive site. Zacaton remains the primary route.";
      return;
    }
    if (this.actions.wasPressed("reset_progress")) {
      this.progress = createDefaultProgress();
      this.player = null;
      this.outcome = null;
      this.message = "Research log reset.";
      this.store.clear();
    }
  }

  private updateShop(): void {
    if (this.actions.wasPressed("menu_back")) {
      if (this.shopPane === "items") {
        this.shopPane = "categories";
        this.message = "Choose a shop category.";
        return;
      }
      this.screen = "menu";
      this.message = "Plan the dive, dive the plan.";
      return;
    }

    if (this.actions.wasPressed("menu_next")) {
      if (this.shopPane === "categories") {
        this.selectedCategoryIndex = (this.selectedCategoryIndex + 1) % UPGRADE_CATEGORIES.length;
      } else {
        this.selectedUpgradeIndex = (this.selectedUpgradeIndex + 1) % this.currentCategoryUpgrades().length;
      }
    }
    if (this.actions.wasPressed("menu_prev")) {
      if (this.shopPane === "categories") {
        this.selectedCategoryIndex = (this.selectedCategoryIndex - 1 + UPGRADE_CATEGORIES.length) % UPGRADE_CATEGORIES.length;
      } else {
        const upgrades = this.currentCategoryUpgrades();
        this.selectedUpgradeIndex = (this.selectedUpgradeIndex - 1 + upgrades.length) % upgrades.length;
      }
    }

    if (this.actions.wasPressed("menu_confirm")) {
      if (this.shopPane === "categories") {
        this.shopPane = "items";
        this.selectedUpgradeIndex = 0;
        this.message = `Review ${this.currentCategory().name.toLowerCase()} options.`;
        return;
      }

      const upgrade = this.currentCategoryUpgrades()[this.selectedUpgradeIndex];
      if (!upgrade) return;
      const tankKind = this.tankKindForUpgrade(upgrade.id);
      if (tankKind) {
        this.handleTankShopAction(upgrade.id, tankKind);
        return;
      }
      if (this.isLightUpgrade(upgrade.id) && isUpgradePurchased(this.progress.equipment, upgrade.id)) {
        this.handleLightRecharge();
        return;
      }
      if (isUpgradePurchased(this.progress.equipment, upgrade.id)) {
        this.message = `${upgrade.name} is already installed.`;
        return;
      }
      const requirement = upgradeRequirementReason(this.progress.equipment, upgrade.id);
      if (requirement) {
        this.message = requirement;
        return;
      }
      if (this.progress.money < upgrade.cost) {
        this.message = `Need $${upgrade.cost - this.progress.money} more for ${upgrade.name}.`;
        return;
      }
      const installedEquipment = installUpgrade(this.progress.equipment, upgrade.id);
      const maxBattery = flashlightBatteryCapacity(installedEquipment);
      this.progress = {
        ...this.progress,
        money: this.progress.money - upgrade.cost,
        flashlightBattery: this.isLightUpgrade(upgrade.id) ? maxBattery : clamp(this.progress.flashlightBattery, 0, maxBattery),
        equipment: installedEquipment,
        tanks:
          upgrade.id === "trimix-training"
            ? this.progress.tanks.map((tank) => (tank.kind === "twin" ? { ...tank, gasMix: "trimix" } : tank))
            : this.progress.tanks
      };
      this.saveProgress();
      this.message = `${upgrade.name} installed.`;
    }
  }

  private updateContracts(): void {
    if (this.actions.wasPressed("menu_back")) {
      this.screen = "menu";
      this.message = "Contract board closed. Free expeditions remain available.";
      return;
    }
    if (this.actions.wasPressed("menu_next")) {
      this.selectedContractIndex = (this.selectedContractIndex + 1) % CONTRACTS.length;
    }
    if (this.actions.wasPressed("menu_prev")) {
      this.selectedContractIndex = (this.selectedContractIndex - 1 + CONTRACTS.length) % CONTRACTS.length;
    }
    if (!this.actions.wasPressed("menu_confirm")) return;

    const contract = CONTRACTS[this.selectedContractIndex];
    if (!contract) return;
    if (this.progress.completedContractIds.includes(contract.id)) {
      this.message = `${contract.title} is already archived.`;
      return;
    }
    if (this.progress.activeContractId === contract.id) {
      this.progress = {
        ...this.progress,
        activeContractId: null
      };
      this.saveProgress();
      this.message = `${contract.title} removed from the next expedition.`;
      return;
    }

    this.progress = {
      ...this.progress,
      activeContractId: contract.id
    };
    this.saveProgress();
    this.message = `${contract.title} accepted. Start a normal expedition when ready.`;
  }

  private updateSites(): void {
    if (this.actions.wasPressed("menu_back")) {
      this.screen = "menu";
      this.message = "Dive site board closed.";
      return;
    }
    if (this.actions.wasPressed("menu_next")) {
      this.selectedDiveSiteIndex = (this.selectedDiveSiteIndex + 1) % DIVE_SITES.length;
    }
    if (this.actions.wasPressed("menu_prev")) {
      this.selectedDiveSiteIndex = (this.selectedDiveSiteIndex - 1 + DIVE_SITES.length) % DIVE_SITES.length;
    }
    if (!this.actions.wasPressed("menu_confirm")) return;

    const site = DIVE_SITES[this.selectedDiveSiteIndex];
    if (!site) return;
    const lockReason = diveSiteUnlockReason(this.progress, site);
    if (lockReason) {
      this.message = lockReason;
      return;
    }
    this.progress = {
      ...this.progress,
      selectedDiveSiteId: site.id
    };
    this.saveProgress();
    this.message = `${site.name} selected. Start the expedition when ready.`;
  }

  private updateMissionComplete(): void {
    if (this.actions.wasPressed("menu_confirm")) {
      this.screen = "menu";
      this.message = this.allMissionsComplete()
        ? "All survey records complete. Free dive carefully."
        : "Expedition board updated. Press S to upgrade before the next dive.";
    }
  }

  private updateGameOver(): void {
    if (this.actions.wasPressed("menu_confirm")) {
      this.startDive();
      return;
    }
    if (this.actions.wasPressed("open_shop")) {
      this.screen = "shop";
      this.message = "Adjust the plan before the next attempt.";
      return;
    }
    if (this.actions.wasPressed("menu_back")) {
      this.screen = "menu";
      this.message = "Review the mission and try again.";
    }
  }

  private updateDive(dt: number): void {
    const player = this.player;
    if (!player) return;

    player.lifelineFollowActive = false;
    player.lungFlashPulse = Math.max(0, player.lungFlashPulse - dt);
    player.decoPulse = Math.max(0, player.decoPulse - dt);
    player.narcosisPulse = Math.max(0, player.narcosisPulse - dt);

    const currentDepth = this.depthFromWorldY(player.y);
    if (player.surfacePromptVisible) {
      player.depthRateMetersPerMinute = 0;
      player.lungOxygen = player.maxLungOxygen;
      player.lungFlashClock = 0;
      player.lungFlashCount = 0;
      player.lungFlashPulse = 0;
      this.updatePressureRisks(dt, currentDepth, player);
      if (this.screen !== "dive") {
        return;
      }
      if (this.actions.wasPressed("menu_confirm")) {
        if (recommendedDecoStopDepth(player.decoLoad) > 0 || player.decoStress > 18) {
          this.message = "Unresolved decompression stop. Esc/N, descend to the stop, and wait.";
          this.playSfx("warning");
          return;
        }
        this.finishExpedition(player);
        return;
      }
      if (this.actions.wasPressed("menu_back") || this.services.input.wasPressed("n")) {
        player.surfacePromptVisible = false;
        player.surfacePromptArmed = false;
        this.message = "Surface pause cancelled. Descend when ready.";
        return;
      }
      this.cameraY += (this.cameraTargetYFor(player) - this.cameraY) * Math.min(1, dt * 5.5);
      return;
    }

    if (this.actions.wasPressed("menu_back")) {
      this.failDive("Dive Aborted", "You left the expedition before returning to base.");
      return;
    }

    let moveX = this.actions.axis("move_left", "move_right");
    let moveY = this.actions.axis("move_up", "move_down");
    const stats = buildDiveStats(this.progress.equipment, player.tanks);
    const narcosisDrift = this.narcosisInputDrift(player);
    moveX += narcosisDrift.x;
    moveY += narcosisDrift.y;
    if (this.actions.wasPressed("toggle_flashlight")) {
      if (stats.hasFlashlight) {
        if (player.flashlightBattery <= 0) {
          player.flashlightOn = false;
          this.message = "Flashlight battery is empty.";
          this.playSfx("warning");
        } else {
          player.flashlightOn = !player.flashlightOn;
          this.message = player.flashlightOn ? "Flashlight on." : "Flashlight off.";
          this.playSfx("flashlight");
        }
      } else {
        this.message = "No flashlight installed.";
      }
    }
    if (this.actions.wasPressed("drop_tank")) {
      this.dropCarriedTank(player);
    }
    if (this.actions.wasPressed("deploy_lifeline")) {
      this.deployLifeline(player);
    }
    if (this.actions.wasPressed("cache_tank")) {
      this.handleTankCacheAction(player);
    }
    if (this.actions.wasPressed("follow_lifeline") && !player.lifelineDeployed) {
      this.message = stats.hasLifeline ? "Deploy the lifeline first with L." : "No lifeline spool installed.";
    }
    if (moveX < 0) player.facing = -1;
    if (moveX > 0) player.facing = 1;

    const length = Math.hypot(moveX, moveY);
    const normalX = length > 0 ? moveX / length : 0;
    const normalY = length > 0 ? moveY / length : 0;
    const lifelineHome = this.actions.isDown("follow_lifeline") ? this.lifelineHomeVector(player) : null;
    const visualIntentX = normalX + (lifelineHome?.x ?? 0) * 0.75;
    const visualIntentY = normalY + (lifelineHome?.y ?? 0) * 0.75;
    const tankWeightLoad = this.carriedTankWeight(player.tanks);
    const horizontalPenalty = 1 - clamp(tankWeightLoad / 130, 0, 0.14);
    const ascentPenalty = 1 - clamp(tankWeightLoad / 76, 0, 0.42);
    const descentBoost = 1 + clamp(tankWeightLoad / 62, 0, 0.6);
    const verticalFactor = normalY < 0 ? ascentPenalty : normalY > 0 ? descentBoost : 1;
    player.x += normalX * player.swimSpeed * 1.12 * horizontalPenalty * dt;
    player.y += normalY * player.swimSpeed * verticalFactor * dt;
    if (lifelineHome) {
      player.x += lifelineHome.x * player.swimSpeed * LIFELINE_FOLLOW_BOOST * dt;
      player.y += lifelineHome.y * player.swimSpeed * LIFELINE_FOLLOW_BOOST * dt;
      player.lifelineFollowActive = true;
    }
    player.y = clamp(player.y, 0, this.activeWorldMaxY());

    const depth = this.depthFromWorldY(player.y);
    player.depthRateMetersPerMinute = dt > 0 ? ((depth - currentDepth) / dt) * 60 : 0;
    this.updateDiverPresentation(dt, player, visualIntentX, visualIntentY);
    const atSurface = this.isAtSurface(depth);
    const bounds = this.caveBoundsAtDepth(depth);
    player.x = clamp(player.x, bounds.left + DIVER_BODY_RADIUS, bounds.right - DIVER_BODY_RADIUS);
    this.updateSedimentVisibility(dt, depth, length, player);
    this.updateLifelinePath(player);
    player.maxDepth = Math.max(player.maxDepth, depth);
    player.elapsed += dt;
    this.updatePressureRisks(dt, depth, player);
    if (this.screen !== "dive") {
      return;
    }

    if (depth > SURFACE_EXIT_DEPTH_METERS + 1.2) {
      player.surfacePromptArmed = true;
    }

    if (atSurface) {
      player.lungOxygen = player.maxLungOxygen;
      player.lungFlashClock = 0;
      player.lungFlashCount = 0;
      player.lungFlashPulse = 0;
      player.depthRateMetersPerMinute = 0;
      if (player.surfacePromptArmed) {
        if (!player.surfacePromptVisible) {
          this.playSfx("surface");
        }
        player.surfacePromptVisible = true;
        this.message = "Surface reached. Return to base? Enter yes, Esc/N no.";
      } else {
        this.message = "At surface. Breathing freely.";
      }
      this.cameraY += (this.cameraTargetYFor(player) - this.cameraY) * Math.min(1, dt * 5.5);
      return;
    }

    this.updateExplorationFunding(dt, depth, length > 0, player);
    this.updateContractProgress(depth, player);
    this.updateFlashlightBattery(dt, player);

    const moving = length > 0 ? 1.12 : 1;
    const pressureFactor = (1 + depth / 30) * stats.pressureDrainMultiplier;
    if (this.totalTankFill(player.tanks) > 0) {
      this.drainTankGas(player, TANK_GAS_DRAIN_PER_SECOND * pressureFactor * moving * dt);
      player.lungOxygen = player.maxLungOxygen;
      player.lungFlashClock = 0;
      player.lungFlashCount = 0;
    } else {
      player.lungOxygen = Math.max(0, player.lungOxygen - LUNG_OXYGEN_DRAIN_PER_SECOND * pressureFactor * moving * dt);
      this.updateLungWarning(dt, pressureFactor, player);
      if (this.screen !== "dive") {
        return;
      }
    }
    this.syncTankTotals(player);
    this.updateTankWarning(player);

    const mission = this.currentMission();
    if (!player.reachedTarget && depth >= mission.targetDepth) {
      player.reachedTarget = true;
      this.message = "Survey record reached. Begin ascent.";
    }

    const cameraTarget = this.cameraTargetYFor(player);
    this.cameraY += (cameraTarget - this.cameraY) * Math.min(1, dt * 5.5);
  }

  private startDive(): void {
    const diveTanks = this.progress.tanks.map((tank) => ({ ...tank, dropped: false }));
    const stats = buildDiveStats(this.progress.equipment, diveTanks);
    const maxFlashlightBattery = flashlightBatteryCapacity(this.progress.equipment);
    const flashlightBattery = clamp(this.progress.flashlightBattery, 0, maxFlashlightBattery);
    const site = this.activeDiveSite();
    this.player = {
      x: this.siteEntryX(site),
      y: 0,
      tanks: diveTanks,
      tankGas: this.totalTankFill(diveTanks),
      maxTankGas: this.totalTankCapacity(diveTanks),
      lungOxygen: stats.maxLungOxygen,
      maxLungOxygen: stats.maxLungOxygen,
      swimSpeed: stats.swimSpeed,
      lightRadius: stats.lightRadius,
      backupGas: 0,
      backupUsed: false,
      reachedTarget: false,
      maxDepth: 0,
      depthRateMetersPerMinute: 0,
      decoLoad: 0,
      decoStress: 0,
      decoPulse: 0,
      decoWarned: false,
      narcosis: 0,
      narcosisPulse: 0,
      narcosisWarned: false,
      narcosisIncidentClock: 0,
      gasWarned: false,
      toxicityClock: 0,
      expeditionFunding: 0,
      explorationFunding: 0,
      mappingFunding: 0,
      landmarkFunding: 0,
      activeExplorationSeconds: 0,
      newMappedDepthBands: new Set<number>(),
      newMappedSiteCells: new Set<string>(),
      newDiscoveredLandmarkIds: new Set<string>(),
      completedContractId: null,
      darkContractFound: false,
      sedimentCloud: 0,
      sedimentWarned: false,
      facing: 1,
      swimIntentX: 0,
      swimIntentY: 0,
      motionIntensity: 0,
      kickPhase: 0,
      visualPitch: 0,
      elapsed: 0,
      surfacePromptVisible: false,
      surfacePromptArmed: false,
      lungFlashClock: 0,
      lungFlashCount: 0,
      lungFlashPulse: 0,
      flashlightOn: stats.hasFlashlight && flashlightBattery > 0,
      flashlightBattery,
      maxFlashlightBattery,
      flashlightLowWarned: false,
      tankLowWarned: false,
      lifelineDeployed: false,
      lifelinePoints: [],
      lifelineLengthUsed: 0,
      lifelineFollowActive: false,
      lifelineLimitWarned: false,
      cachedTanks: [],
      nextCacheId: 1
    };
    this.cameraY = -110;
    this.outcome = null;
    this.screen = "dive";
    const contract = this.activeContract();
    this.message = contract
      ? site.id === DEFAULT_DIVE_SITE_ID
        ? `${site.shortName}: contract active: ${contract.title}. Optional record: ${this.currentMission().title}.`
        : `${site.shortName}: contract ${contract.title} belongs to Zacaton. This is a free survey dive.`
      : `${site.shortName}: explore freely. Optional record: ${this.currentMission().title}.`;
  }

  private updateDiverPresentation(dt: number, player: DivePlayer, intentX: number, intentY: number): void {
    const intentLength = Math.hypot(intentX, intentY);
    const targetIntensity = clamp(intentLength, 0, 1);
    const targetX = intentLength > 0.05 ? intentX / intentLength : 0;
    const targetY = intentLength > 0.05 ? intentY / intentLength : 0;
    const intentBlend = 1 - Math.exp(-dt * 7.5);
    const intensityBlend = 1 - Math.exp(-dt * 5.8);
    player.swimIntentX = this.lerp(player.swimIntentX, targetX, intentBlend);
    player.swimIntentY = this.lerp(player.swimIntentY, targetY, intentBlend);
    player.motionIntensity = this.lerp(player.motionIntensity, targetIntensity, intensityBlend);

    const ratePitch = clamp(player.depthRateMetersPerMinute / 56, -0.52, 0.52);
    const swimPitch = targetIntensity > 0.05 ? targetY * 0.42 : ratePitch * 0.34;
    const idlePitch = Math.sin(this.animationClock * 0.92) * (0.018 + (1 - player.motionIntensity) * 0.026);
    const pitchTarget = clamp(swimPitch + idlePitch, -0.5, 0.5);
    player.visualPitch = this.lerp(player.visualPitch, pitchTarget, 1 - Math.exp(-dt * 5.2));

    const kickSpeed = 1.6 + player.motionIntensity * 8.2 + clamp(Math.abs(player.depthRateMetersPerMinute) / 34, 0, 2.2);
    player.kickPhase = (player.kickPhase + dt * kickSpeed) % (Math.PI * 200);
  }

  private updateLungWarning(dt: number, pressureFactor: number, player: DivePlayer): void {
    if (player.lungOxygen > LUNG_DARKEN_THRESHOLD) {
      player.lungFlashClock = 0;
      player.lungFlashCount = 0;
      return;
    }

    if (player.lungOxygen > LUNG_CRITICAL_THRESHOLD) {
      player.lungFlashClock = 0;
      return;
    }

    player.lungFlashClock += dt * Math.max(0.7, pressureFactor);
    if (player.lungFlashClock < LUNG_FLASH_INTERVAL) {
      return;
    }

    player.lungFlashClock = 0;
    player.lungFlashCount += 1;
    player.lungFlashPulse = 0.56;
    if (player.lungFlashCount >= LUNG_DROWN_FLASH_COUNT) {
      this.failDive("Drowned", `Maximum depth reached: ${this.maxDepthReport(player)}. The fourth hypoxia flash ended the dive.`);
    } else {
      this.message = `Breath fading. Warning flash ${player.lungFlashCount}/3. Surface now.`;
      this.playSfx("warning");
    }
  }

  private updateFlashlightBattery(dt: number, player: DivePlayer): void {
    const capacity = flashlightBatteryCapacity(this.progress.equipment);
    player.maxFlashlightBattery = capacity;
    player.flashlightBattery = clamp(player.flashlightBattery, 0, capacity);
    if (capacity <= 0) {
      player.flashlightOn = false;
      return;
    }
    if (!player.flashlightOn) {
      return;
    }

    player.flashlightBattery = Math.max(
      0,
      player.flashlightBattery - flashlightBatteryDrainPerSecond(this.progress.equipment) * dt
    );
    const ratio = capacity > 0 ? player.flashlightBattery / capacity : 0;
    if (ratio <= 0) {
      player.flashlightOn = false;
      this.message = "Flashlight battery depleted. Darkness closes in.";
      this.playSfx("warning");
      return;
    }
    if (!player.flashlightLowWarned && ratio <= FLASHLIGHT_LOW_BATTERY_RATIO) {
      player.flashlightLowWarned = true;
      this.message = "Flashlight battery low.";
      this.playSfx("warning");
    }
  }

  private updateTankWarning(player: DivePlayer): void {
    if (player.maxTankGas <= 0) return;
    const ratio = clamp(player.tankGas / player.maxTankGas, 0, 1);
    if (ratio > TANK_LOW_GAS_RATIO || player.tankLowWarned) return;
    player.tankLowWarned = true;
    this.message = "Tank gas low. Plan the ascent.";
    this.playSfx("warning");
  }

  private narcosisInputDrift(player: DivePlayer): { x: number; y: number } {
    const drift = clamp((player.narcosis - NARCOSIS_DRIFT_THRESHOLD) / 66, 0, 1);
    if (drift <= 0) return { x: 0, y: 0 };
    return {
      x: Math.sin(this.animationClock * 1.7 + player.maxDepth * 0.03) * drift * 0.36,
      y: Math.cos(this.animationClock * 1.2 + player.elapsed * 0.31) * drift * 0.24
    };
  }

  private updatePressureRisks(dt: number, depth: number, player: DivePlayer): void {
    const gasPlan = assessGasPlan(depth, player.tanks);
    const loadRate = decompressionLoadRate(depth) * (gasPlan.isWrongGas ? 1.12 : 1);
    const reliefRate = decompressionReliefRate(depth);

    if (loadRate > 0) {
      player.decoLoad = clamp(player.decoLoad + loadRate * dt, 0, 100);
    } else {
      player.decoLoad = clamp(player.decoLoad - reliefRate * dt, 0, 100);
    }

    const stopDepth = recommendedDecoStopDepth(player.decoLoad);
    const ascentRate = Math.max(0, -player.depthRateMetersPerMinute);
    const speedStress =
      clamp((ascentRate - SAFE_ASCENT_RATE_METERS_PER_MINUTE) / 34, 0, 1) * clamp((player.decoLoad - 18) / 66, 0, 1);
    const ceilingStress =
      stopDepth > 0 && depth < stopDepth - 0.6
        ? clamp((stopDepth - depth) / Math.max(4, stopDepth), 0, 1) * clamp((player.decoLoad - 22) / 64, 0, 1)
        : 0;
    const decoStressInput = speedStress + ceilingStress;
    if (decoStressInput > 0) {
      player.decoStress = clamp(player.decoStress + decoStressInput * dt * 30, 0, DECO_STRESS_FAILURE + 20);
      player.decoPulse = Math.max(player.decoPulse, clamp(decoStressInput, 0.18, 1));
    } else {
      player.decoStress = clamp(player.decoStress - dt * (depth <= 18 ? 7 : 3), 0, DECO_STRESS_FAILURE + 20);
    }

    if (!player.decoWarned && (player.decoLoad >= 42 || player.decoStress >= 35)) {
      player.decoWarned = true;
      this.message = this.progress.equipment.depthGauge
        ? `Deco load rising. Hold near ${Math.max(6, stopDepth)}m and keep ascent under ${SAFE_ASCENT_RATE_METERS_PER_MINUTE}m/min.`
        : "Ascent stress building. Slow down and pause shallow.";
      this.playSfx("warning");
    }
    if (player.decoStress >= DECO_STRESS_FAILURE) {
      this.failDive("Decompression Injury", `A fast ascent from ${this.maxDepthReport(player)} overwhelmed the decompression margin.`);
      return;
    }

    const targetNarcosis = clamp((gasPlan.narcosisRisk + gasPlan.toxicityRisk * 0.38) * 100, 0, 100);
    player.narcosis += (targetNarcosis - player.narcosis) * Math.min(1, dt * 0.38);
    if (player.narcosis >= 42) {
      player.narcosisPulse = Math.max(player.narcosisPulse, clamp((player.narcosis - 38) / 62, 0.12, 1));
    }
    if (!player.gasWarned && gasPlan.isWrongGas && depth >= 62) {
      player.gasWarned = true;
      this.message = this.progress.equipment.depthGauge ? `${gasPlan.advice}. Wrong gas is increasing narcosis.` : "The gas feels wrong for this depth.";
      this.playSfx("warning");
    }
    if (!player.narcosisWarned && player.narcosis >= 52) {
      player.narcosisWarned = true;
      this.message = "Narcosis is distorting control. Ascend or switch the plan next dive.";
      this.playSfx("warning");
    }

    if (player.narcosis >= 92) {
      player.narcosisIncidentClock += dt;
    } else {
      player.narcosisIncidentClock = Math.max(0, player.narcosisIncidentClock - dt * 1.8);
    }
    if (gasPlan.toxicityRisk >= 0.72) {
      player.toxicityClock += gasPlan.toxicityRisk * dt;
    } else {
      player.toxicityClock = Math.max(0, player.toxicityClock - dt * 1.5);
    }

    if (player.narcosisIncidentClock >= NARCOSIS_FAILURE_SECONDS) {
      this.failDive("Narcosis Blackout", `Deep gas narcosis at ${this.depthReadout(depth, buildDiveStats(this.progress.equipment, player.tanks))} overwhelmed the diver.`);
      return;
    }
    if (player.toxicityClock >= TOXICITY_FAILURE_SECONDS) {
      this.failDive("Gas Toxicity", `The active gas mix was unsafe at ${this.maxDepthReport(player)}.`);
    }
  }

  private updateSedimentVisibility(dt: number, depth: number, movementAmount: number, player: DivePlayer): void {
    const site = this.activeDiveSite();
    const stats = buildDiveStats(this.progress.equipment, player.tanks);
    const bounds = this.caveBoundsAtDepth(depth);
    const wallDistance = Math.min(player.x - bounds.left, bounds.right - player.x);
    const wallSilt = clamp((92 - wallDistance) / 92, 0, 1);
    const descentSilt = clamp(player.depthRateMetersPerMinute / 42, 0, 1) * 0.18;
    const motionSilt = clamp(movementAmount, 0, 1) * (0.12 + wallSilt * 0.72 + descentSilt);
    const resistance = clamp(stats.sedimentResistance, 0, 0.72);
    const build = site.sedimentIntensity * motionSilt * (1 - resistance) * dt;
    const decay = (0.12 + (stats.hasSonar ? 0.1 : 0) + (site.geometry === "open-basin" ? 0.05 : 0)) * dt;
    player.sedimentCloud = clamp(player.sedimentCloud + build - decay, 0, 1);

    if (!player.sedimentWarned && player.sedimentCloud > 0.5) {
      player.sedimentWarned = true;
      this.message = stats.hasSonar
        ? "Sediment is clouding the route. Sonar keeps the wall readable."
        : "Sediment cloud building. Slow down and move away from the wall.";
      this.playSfx("warning");
    }
    if (player.sedimentCloud < 0.18) {
      player.sedimentWarned = false;
    }
  }

  private updateExplorationFunding(dt: number, depth: number, isMoving: boolean, player: DivePlayer): void {
    if (depth <= SURFACE_EXIT_DEPTH_METERS + 1.2) return;

    if (isMoving && player.activeExplorationSeconds < ACTIVE_EXPLORATION_REWARD_CAP_SECONDS) {
      const creditedSeconds = Math.min(dt, ACTIVE_EXPLORATION_REWARD_CAP_SECONDS - player.activeExplorationSeconds);
      player.activeExplorationSeconds += creditedSeconds;
      this.addExpeditionFunding(
        player,
        creditedSeconds * ACTIVE_EXPLORATION_REWARD_PER_SECOND * this.depthRewardMultiplier(depth),
        "exploration"
      );
    }

    this.checkMappingReward(depth, player);
    this.checkLandmarkReward(depth, player);
  }

  private updateContractProgress(depth: number, player: DivePlayer): void {
    if (player.completedContractId) return;
    const contract = this.activeContract();
    if (!contract || this.progress.completedContractIds.includes(contract.id)) return;
    if (this.activeDiveSite().id !== DEFAULT_DIVE_SITE_ID) return;

    let completed = false;
    if (contract.kind === "photograph-landmark" && contract.targetLandmarkId) {
      completed =
        player.newDiscoveredLandmarkIds.has(contract.targetLandmarkId) ||
        (this.progress.discoveredLandmarkIds.includes(contract.targetLandmarkId) &&
          Math.abs(depth - contract.targetDepth) <= LANDMARK_DISCOVERY_RADIUS_METERS);
    } else {
      completed = depth >= contract.targetDepth;
    }
    if (!completed) return;

    player.completedContractId = contract.id;
    player.darkContractFound = Boolean(contract.darkEvent);
    this.message = contract.darkEvent
      ? `${contract.title}: tag recovered. Return quietly to base.`
      : `${contract.title}: objective complete. Return to base for $${contract.reward}.`;
    this.playSfx(contract.darkEvent ? "warning" : "landmark");
  }

  private checkMappingReward(depth: number, player: DivePlayer): void {
    if (depth < 4) return;
    const site = this.activeDiveSite();
    const stats = buildDiveStats(this.progress.equipment, player.tanks);
    const band = Math.floor(depth / MAPPING_BAND_METERS);
    const cellId = mappingCellId(site.id, band);
    const alreadyMappedLegacy = site.id === DEFAULT_DIVE_SITE_ID && this.progress.mappedDepthBands.includes(band);
    if (alreadyMappedLegacy || this.progress.mappedSiteCells.includes(cellId) || player.newMappedSiteCells.has(cellId)) return;

    player.newMappedSiteCells.add(cellId);
    if (site.id === DEFAULT_DIVE_SITE_ID) {
      player.newMappedDepthBands.add(band);
    }
    const bandDepth = (band + 0.5) * MAPPING_BAND_METERS;
    const formalBonus = stats.hasMappingSlate ? 1.35 : 1;
    const sensorBonus = stats.hasSurveySensors && site.hasSensorRoute ? 1.18 : 1;
    const reward = MAPPING_BASE_REWARD * this.depthRewardMultiplier(bandDepth) * site.rewardMultiplier * formalBonus * sensorBonus;
    this.addExpeditionFunding(player, reward, "mapping");
    this.message = stats.hasMappingSlate
      ? `Formal map cell logged in ${site.shortName}. +$${Math.floor(reward)} pending.`
      : `Mapped a new ${this.roughDepthLabel(depth)} ${site.shortName} cell. +$${Math.floor(reward)} pending.`;
  }

  private checkLandmarkReward(depth: number, player: DivePlayer): void {
    for (const landmark of siteLandmarks(this.activeDiveSite().id)) {
      if (this.progress.discoveredLandmarkIds.includes(landmark.id) || player.newDiscoveredLandmarkIds.has(landmark.id)) {
        continue;
      }
      if (Math.abs(depth - landmark.depth) > LANDMARK_DISCOVERY_RADIUS_METERS) continue;

      player.newDiscoveredLandmarkIds.add(landmark.id);
      const reward = landmark.reward * this.depthRewardMultiplier(landmark.depth) * this.activeDiveSite().rewardMultiplier;
      this.addExpeditionFunding(player, reward, "landmark");
      this.message = `${landmark.name} discovered. +$${Math.floor(reward)} pending.`;
      this.playSfx("landmark");
      return;
    }
  }

  private addExpeditionFunding(player: DivePlayer, amount: number, source: "exploration" | "mapping" | "landmark"): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    player.expeditionFunding += amount;
    if (source === "exploration") player.explorationFunding += amount;
    if (source === "mapping") player.mappingFunding += amount;
    if (source === "landmark") player.landmarkFunding += amount;
  }

  private depthRewardMultiplier(depth: number): number {
    return 1 + clamp(depth, 0, CAVE_MAX_DEPTH_METERS) / 95;
  }

  private tankShopStatus(
    upgradeId: UpgradeId,
    kind: TankKind
  ): { label: string; detail: string; canAfford: boolean; requirement: string | null } {
    const definition = tankDefinition(kind);
    const existing = this.progress.tanks.find((tank) => tank.kind === kind);
    if (existing) {
      const refillCost = this.tankRefillCost(existing);
      const weight = tankWeight(existing).toFixed(1);
      return {
        label: refillCost > 0 ? `REFILL $${refillCost}` : "FULL",
        detail: `${definition.name}: ${Math.round(existing.fill)}/${definition.capacity} ${existing.gasMix}. Weight now ${weight}kg; empty ${definition.emptyWeight}kg.`,
        canAfford: refillCost <= 0 || this.progress.money >= refillCost,
        requirement: null
      };
    }

    const requirement = upgradeRequirementReason(this.progress.equipment, upgradeId);
    return {
      label: requirement ? "LOCKED" : `$${definition.buyCost}`,
      detail: requirement ?? `Buy and fill ${definition.name}. Capacity ${definition.capacity}, full ${definition.fullWeight}kg, empty ${definition.emptyWeight}kg.`,
      canAfford: !requirement && this.progress.money >= definition.buyCost,
      requirement
    };
  }

  private lightShopStatus(): { label: string; detail: string; canAfford: boolean; requirement: string | null } {
    const capacity = flashlightBatteryCapacity(this.progress.equipment);
    const currentCharge = clamp(this.progress.flashlightBattery, 0, capacity);
    const rechargeCost = flashlightRechargeCost(this.progress.equipment, currentCharge);
    return {
      label: rechargeCost > 0 ? `CHARGE $${rechargeCost}` : "FULL",
      detail:
        capacity > 0
          ? `Battery ${Math.round(currentCharge)}/${capacity}. Better lights improve beam strength and runtime.`
          : "No battery installed.",
      canAfford: rechargeCost <= 0 || this.progress.money >= rechargeCost,
      requirement: null
    };
  }

  private handleTankShopAction(upgradeId: UpgradeId, kind: TankKind): void {
    const existing = this.progress.tanks.find((tank) => tank.kind === kind);
    const definition = tankDefinition(kind);
    if (existing) {
      const refillCost = this.tankRefillCost(existing);
      if (refillCost <= 0) {
        this.message = `${definition.name} is already full.`;
        return;
      }
      if (this.progress.money < refillCost) {
        this.message = `Need $${refillCost - this.progress.money} more to refill ${definition.name}.`;
        return;
      }
      const gasMix = this.progress.equipment.trimixTraining && kind === "twin" ? "trimix" : definition.gasMix;
      this.progress = {
        ...this.progress,
        money: this.progress.money - refillCost,
        tanks: this.progress.tanks.map((tank) =>
          tank.id === existing.id
            ? {
                ...tank,
                fill: definition.capacity,
                gasMix
              }
            : tank
        ),
        equipment: installUpgrade(this.progress.equipment, upgradeId)
      };
      this.saveProgress();
      this.message = `${definition.name} refilled for $${refillCost}.`;
      return;
    }

    const requirement = upgradeRequirementReason(this.progress.equipment, upgradeId);
    if (requirement) {
      this.message = requirement;
      return;
    }
    if (this.progress.money < definition.buyCost) {
      this.message = `Need $${definition.buyCost - this.progress.money} more for ${definition.name}.`;
      return;
    }
    const gasMix = this.progress.equipment.trimixTraining && kind === "twin" ? "trimix" : definition.gasMix;
    const newTank = {
      ...this.makeTank(kind, this.progress.nextTankId),
      gasMix
    };
    this.progress = {
      ...this.progress,
      money: this.progress.money - definition.buyCost,
      tanks: [...this.progress.tanks, newTank],
      nextTankId: this.progress.nextTankId + 1,
      equipment: installUpgrade(this.progress.equipment, upgradeId)
    };
    this.saveProgress();
    this.message = `${definition.name} purchased and filled.`;
  }

  private handleLightRecharge(): void {
    const capacity = flashlightBatteryCapacity(this.progress.equipment);
    const currentCharge = clamp(this.progress.flashlightBattery, 0, capacity);
    const rechargeCost = flashlightRechargeCost(this.progress.equipment, currentCharge);
    if (capacity <= 0) {
      this.message = "No flashlight battery installed.";
      return;
    }
    if (rechargeCost <= 0) {
      this.message = "Flashlight battery is already full.";
      return;
    }
    if (this.progress.money < rechargeCost) {
      this.message = `Need $${rechargeCost - this.progress.money} more to recharge the flashlight.`;
      return;
    }
    this.progress = {
      ...this.progress,
      money: this.progress.money - rechargeCost,
      flashlightBattery: capacity
    };
    this.saveProgress();
    this.message = `Flashlight battery recharged for $${rechargeCost}.`;
  }

  private tankRefillCost(tank: TankState): number {
    const definition = tankDefinition(tank.kind);
    const missing = Math.max(0, definition.capacity - tank.fill);
    if (missing <= 0) return 0;
    return Math.max(1, Math.ceil((missing / definition.capacity) * definition.refillCost));
  }

  private tankKindForUpgrade(id: UpgradeId): TankKind | null {
    if (id === "basic-tank") return "single";
    if (id === "larger-tank") return "twin";
    if (id === "backup-tank") return "pony";
    return null;
  }

  private isLightUpgrade(id: UpgradeId): boolean {
    return id === "handheld-light" || id === "better-flashlight" || id === "wide-beam-filter";
  }

  private makeTank(kind: TankKind, numericId: number, fill = tankDefinition(kind).capacity): TankState {
    const definition = tankDefinition(kind);
    return {
      id: `tank-${numericId}`,
      kind,
      gasMix: definition.gasMix,
      fill: clamp(fill, 0, definition.capacity),
      dropped: false
    };
  }

  private tanksFromLegacyEquipment(equipment: ProgressState["equipment"]): TankState[] {
    const tanks: TankState[] = [];
    let nextId = 1;
    if (equipment.largerTank) {
      tanks.push({
        ...this.makeTank("twin", nextId),
        gasMix: equipment.trimixTraining ? "trimix" : "air"
      });
      nextId += 1;
    } else if (equipment.basicTank) {
      tanks.push(this.makeTank("single", nextId));
      nextId += 1;
    }
    if (equipment.backupTank) {
      tanks.push(this.makeTank("pony", nextId));
    }
    return tanks;
  }

  private nextTankIdFromTanks(tanks: readonly TankState[]): number {
    const maxId = tanks.reduce((max, tank) => {
      const match = /^tank-(\d+)$/.exec(tank.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return maxId + 1;
  }

  private totalTankFill(tanks: readonly TankState[]): number {
    return tanks.filter((tank) => !tank.dropped).reduce((sum, tank) => sum + Math.max(0, tank.fill), 0);
  }

  private totalTankCapacity(tanks: readonly TankState[]): number {
    return tanks.filter((tank) => !tank.dropped).reduce((sum, tank) => sum + tankDefinition(tank.kind).capacity, 0);
  }

  private carriedTankWeight(tanks: readonly TankState[]): number {
    return tanks.filter((tank) => !tank.dropped).reduce((sum, tank) => sum + tankWeight(tank), 0);
  }

  private syncTankTotals(player: DivePlayer): void {
    player.tankGas = this.totalTankFill(player.tanks);
    player.maxTankGas = this.totalTankCapacity(player.tanks);
  }

  private drainTankGas(player: DivePlayer, amount: number): void {
    let remaining = Math.max(0, amount);
    const drainOrder = player.tanks
      .map((tank, index) => ({ tank, index }))
      .filter(({ tank }) => !tank.dropped && tank.fill > 0)
      .sort((a, b) => {
        if (a.tank.kind === "pony" && b.tank.kind !== "pony") return 1;
        if (a.tank.kind !== "pony" && b.tank.kind === "pony") return -1;
        return b.tank.fill - a.tank.fill;
      });

    for (const entry of drainOrder) {
      if (remaining <= 0) break;
      const drained = Math.min(entry.tank.fill, remaining);
      player.tanks[entry.index] = {
        ...entry.tank,
        fill: entry.tank.fill - drained
      };
      remaining -= drained;
    }
  }

  private dropCarriedTank(player: DivePlayer): void {
    const carried = player.tanks
      .map((tank, index) => ({ tank, index }))
      .filter(({ tank }) => !tank.dropped)
      .sort((a, b) => {
        const aRatio = a.tank.fill / tankDefinition(a.tank.kind).capacity;
        const bRatio = b.tank.fill / tankDefinition(b.tank.kind).capacity;
        return aRatio - bRatio;
      });
    const selected = carried[0];
    if (!selected) {
      this.message = "No carried tanks to drop.";
      return;
    }

    player.tanks[selected.index] = {
      ...selected.tank,
      dropped: true
    };
    this.syncTankTotals(player);
    const definition = tankDefinition(selected.tank.kind);
    const remaining = Math.round(selected.tank.fill);
    this.message =
      remaining > 0
        ? `Dropped ${definition.name} with ${remaining} gas. Cache tanks on the lifeline before leaving them.`
        : `Dropped empty ${definition.name}. Ascent load reduced.`;
    this.playSfx("tank-drop");
  }

  private deployLifeline(player: DivePlayer): void {
    const capacity = this.lifelineCapacityPixels();
    if (capacity <= 0) {
      this.message = "No lifeline spool installed.";
      return;
    }
    if (player.lifelineDeployed) {
      this.message = "Lifeline already deployed. Hold H to follow it home.";
      return;
    }

    player.lifelineDeployed = true;
    player.lifelinePoints = [{ x: this.siteEntryX(), y: 0 }];
    player.lifelineLengthUsed = 0;
    player.lifelineLimitWarned = false;
    this.extendLifelineToward(player, { x: player.x, y: player.y }, true);
    this.message = `Lifeline deployed. ${Math.round(capacity / PIXELS_PER_METER)}m available; C caches tanks on the line.`;
  }

  private updateLifelinePath(player: DivePlayer): void {
    if (!player.lifelineDeployed) return;
    const nearest = this.nearestLifelinePoint(player);
    if (nearest && nearest.index < player.lifelinePoints.length - 1 && nearest.distance <= LIFELINE_REACH_PIXELS) {
      return;
    }
    this.extendLifelineToward(player, { x: player.x, y: player.y }, false);
  }

  private extendLifelineToward(player: DivePlayer, target: LifelinePoint, force: boolean): void {
    const last = player.lifelinePoints[player.lifelinePoints.length - 1];
    if (!last) {
      player.lifelinePoints = [{ x: target.x, y: target.y }];
      return;
    }

    const distance = this.distanceBetween(last, target);
    if (distance < (force ? 2 : LIFELINE_POINT_SPACING_PIXELS)) return;

    const capacity = this.lifelineCapacityPixels();
    const available = Math.max(0, capacity - player.lifelineLengthUsed);
    if (available <= 0) {
      this.warnLifelineLimit(player);
      return;
    }

    const used = Math.min(distance, available);
    player.lifelinePoints.push({
      x: last.x + ((target.x - last.x) / distance) * used,
      y: last.y + ((target.y - last.y) / distance) * used
    });
    player.lifelineLengthUsed += used;

    if (used < distance || player.lifelineLengthUsed >= capacity - 0.5) {
      this.warnLifelineLimit(player);
    }
  }

  private warnLifelineLimit(player: DivePlayer): void {
    if (player.lifelineLimitWarned) return;
    player.lifelineLimitWarned = true;
    this.message = "Lifeline fully paid out. Follow it home or upgrade the reel.";
    this.playSfx("warning");
  }

  private lifelineHomeVector(player: DivePlayer): { x: number; y: number } | null {
    if (!player.lifelineDeployed || player.lifelinePoints.length < 2) return null;
    const nearest = this.nearestLifelinePoint(player);
    if (!nearest || nearest.distance > LIFELINE_REACH_PIXELS || nearest.index <= 0) return null;

    const targetIndex = Math.max(0, nearest.index - 2);
    const target = player.lifelinePoints[targetIndex];
    if (!target) return null;
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return null;
    return {
      x: dx / distance,
      y: dy / distance
    };
  }

  private handleTankCacheAction(player: DivePlayer): void {
    const cacheIndex = this.nearestCachedTankIndex(player);
    if (cacheIndex !== null) {
      this.retrieveCachedTank(player, cacheIndex);
      return;
    }
    this.cacheCarriedTank(player);
  }

  private cacheCarriedTank(player: DivePlayer): void {
    if (this.lifelineCapacityPixels() <= 0) {
      this.message = "No lifeline spool installed.";
      return;
    }
    if (!player.lifelineDeployed) {
      this.message = "Deploy the lifeline before caching tanks.";
      return;
    }

    const nearest = this.nearestLifelinePoint(player);
    if (!nearest || nearest.distance > LIFELINE_REACH_PIXELS) {
      this.message = "Move onto the lifeline to cache a tank.";
      return;
    }

    const carried = player.tanks
      .map((tank, index) => ({ tank, index }))
      .filter(({ tank }) => !tank.dropped)
      .sort((a, b) => {
        const aRatio = a.tank.fill / tankDefinition(a.tank.kind).capacity;
        const bRatio = b.tank.fill / tankDefinition(b.tank.kind).capacity;
        return aRatio - bRatio;
      });
    const selected = carried[0];
    if (!selected) {
      this.message = "No carried tanks to cache.";
      return;
    }

    player.tanks[selected.index] = {
      ...selected.tank,
      dropped: true
    };
    player.cachedTanks.push({
      id: `cache-${player.nextCacheId}`,
      tank: {
        ...selected.tank,
        dropped: true
      },
      x: nearest.point.x,
      y: nearest.point.y,
      linePointIndex: nearest.index
    });
    player.nextCacheId += 1;
    this.syncTankTotals(player);

    const definition = tankDefinition(selected.tank.kind);
    this.message = `Cached ${definition.name} on the lifeline. Return to this point and press C to recover it.`;
    this.playSfx("tank-drop");
  }

  private retrieveCachedTank(player: DivePlayer, cacheIndex: number): void {
    const cache = player.cachedTanks[cacheIndex];
    if (!cache) return;
    player.cachedTanks.splice(cacheIndex, 1);

    const existingIndex = player.tanks.findIndex((tank) => tank.id === cache.tank.id);
    if (existingIndex >= 0) {
      player.tanks[existingIndex] = {
        ...cache.tank,
        dropped: false
      };
    } else {
      player.tanks.push({
        ...cache.tank,
        dropped: false
      });
    }

    this.syncTankTotals(player);
    const definition = tankDefinition(cache.tank.kind);
    this.message = `Recovered ${definition.name} from lifeline cache.`;
    this.playSfx("surface");
  }

  private nearestCachedTankIndex(player: DivePlayer): number | null {
    let nearestIndex: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < player.cachedTanks.length; index += 1) {
      const cache = player.cachedTanks[index];
      if (!cache) continue;
      const distance = this.distanceBetween(player, cache);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    return nearestDistance <= TANK_CACHE_REACH_PIXELS ? nearestIndex : null;
  }

  private nearestLifelinePoint(player: DivePlayer): { point: LifelinePoint; index: number; distance: number } | null {
    let nearest: { point: LifelinePoint; index: number; distance: number } | null = null;
    for (let index = 0; index < player.lifelinePoints.length; index += 1) {
      const point = player.lifelinePoints[index];
      if (!point) continue;
      const distance = this.distanceBetween(player, point);
      if (!nearest || distance < nearest.distance) {
        nearest = { point, index, distance };
      }
    }
    return nearest;
  }

  private lifelineCapacityPixels(): number {
    return lifelineLengthCapacity(this.progress.equipment) * PIXELS_PER_METER;
  }

  private distanceBetween(a: LifelinePoint, b: LifelinePoint): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private finishExpedition(player: DivePlayer): void {
    const mission = this.currentMission();
    const contract = this.completedContract(player);
    if (player.reachedTarget) {
      this.completeMission(mission, player);
      return;
    }

    const banked = this.bankExpedition(player, 0, contract?.reward ?? 0, this.progress.completedMissionIds, this.progress.activeMissionIndex);
    this.outcome = {
      title: contract ? "Contract Logged" : "Expedition Logged",
      details: contract
        ? `${contract.title}: returned safely after reaching ${this.maxDepthReport(player)}.`
        : `Returned safely after reaching ${this.maxDepthReport(player)}. No survey record completed.`,
      reward: banked.totalReward,
      discoverySummary: this.discoverySummary(player, banked)
    };
    this.screen = "mission-complete";
    this.message = banked.totalReward > 0 ? `Expedition funding banked: $${banked.totalReward}.` : "Returned to base. You can shop or dive again.";
  }

  private completeMission(mission: MissionDefinition, player: DivePlayer): void {
    const alreadyCompleted = this.progress.completedMissionIds.includes(mission.id);
    const reward = alreadyCompleted ? 0 : mission.reward;
    const completed = alreadyCompleted
      ? [...this.progress.completedMissionIds]
      : [...this.progress.completedMissionIds, mission.id];
    const missionIndex = nextMissionIndex(completed);
    const contract = this.completedContract(player);
    const banked = this.bankExpedition(player, reward, contract?.reward ?? 0, completed, missionIndex);
    this.outcome = {
      title: alreadyCompleted ? "Record Revisited" : "Survey Record Logged",
      details: contract
        ? `${mission.title} and ${contract.title}: returned from ${this.maxDepthReport(player)} in ${Math.round(player.elapsed)}s.`
        : `${mission.title}: returned from ${this.maxDepthReport(player)} in ${Math.round(player.elapsed)}s.`,
      reward: banked.totalReward,
      discoverySummary: this.discoverySummary(player, banked)
    };
    this.screen = "mission-complete";
    this.message = banked.totalReward > 0 ? `Research funding awarded: $${banked.totalReward}.` : "Survey already funded. Free dive logged.";
  }

  private failDive(title: string, details: string): void {
    const loss = this.player ? this.unbankedLossReport(this.player) : "No funding was banked.";
    this.outcome = {
      title,
      details: `${details} ${loss}`,
      reward: 0
    };
    this.screen = "game-over";
    this.message = "Expedition failed. Review equipment and gas plan.";
    this.playSfx("game-over");
  }

  private bankExpedition(
    player: DivePlayer,
    surveyReward: number,
    contractReward: number,
    completedMissionIds: readonly string[],
    activeMissionIndex: number
  ): BankedExpedition {
    const banked: BankedExpedition = {
      surveyReward,
      contractReward,
      explorationReward: Math.floor(player.explorationFunding),
      mappingReward: Math.floor(player.mappingFunding),
      landmarkReward: Math.floor(player.landmarkFunding),
      totalReward:
        surveyReward +
        contractReward +
        Math.floor(player.explorationFunding) +
        Math.floor(player.mappingFunding) +
        Math.floor(player.landmarkFunding)
    };
    const mappedDepthBands = [...new Set([...this.progress.mappedDepthBands, ...player.newMappedDepthBands])].sort((a, b) => a - b);
    const mappedSiteCells = [...new Set([...this.progress.mappedSiteCells, ...player.newMappedSiteCells])].sort();
    const discoveredLandmarkIds = [...new Set([...this.progress.discoveredLandmarkIds, ...player.newDiscoveredLandmarkIds])].sort();
    const returnedTanks = player.tanks.filter((tank) => !tank.dropped).map((tank) => ({ ...tank, dropped: false }));
    const completedContractIds = player.completedContractId
      ? [...new Set([...this.progress.completedContractIds, player.completedContractId])].sort()
      : [...this.progress.completedContractIds];
    this.progress = {
      ...this.progress,
      money: this.progress.money + banked.totalReward,
      completedMissionIds: [...completedMissionIds],
      activeMissionIndex,
      mappedDepthBands,
      mappedSiteCells,
      discoveredLandmarkIds,
      completedContractIds,
      activeContractId: player.completedContractId ? null : this.progress.activeContractId,
      tanks: returnedTanks,
      nextTankId: this.progress.nextTankId,
      flashlightBattery: clamp(player.flashlightBattery, 0, flashlightBatteryCapacity(this.progress.equipment))
    };
    this.saveProgress();
    return banked;
  }

  private pendingExpeditionFunding(player: DivePlayer): number {
    return Math.floor(player.explorationFunding) + Math.floor(player.mappingFunding) + Math.floor(player.landmarkFunding);
  }

  private completedContract(player: DivePlayer): ContractDefinition | null {
    return contractById(player.completedContractId);
  }

  private contractHudObjective(contract: ContractDefinition): string {
    if (this.activeDiveSite().id !== DEFAULT_DIVE_SITE_ID) return "Zacaton only";
    if (contract.kind === "photograph-landmark" && contract.targetLandmarkId) {
      const landmark = LANDMARKS.find((item) => item.id === contract.targetLandmarkId);
      return landmark ? `find ${landmark.name}` : "find landmark";
    }
    if (contract.kind === "quiet-recovery") return "recover tag";
    if (contract.kind === "place-sensor") return "place sensor";
    if (contract.kind === "recover-instrument") return "recover gauge";
    return "map target";
  }

  private unbankedLossReport(player: DivePlayer): string {
    const lostFunding = this.pendingExpeditionFunding(player);
    const lostMapping = player.newMappedSiteCells.size;
    const lostLandmarks = player.newDiscoveredLandmarkIds.size;
    const contract = this.completedContract(player);
    if (lostFunding <= 0 && lostMapping <= 0 && lostLandmarks <= 0 && !contract) return "No funding was banked.";
    const parts = [`Unbanked expedition funding lost: $${lostFunding}.`];
    if (lostMapping > 0 || lostLandmarks > 0) {
      parts.push(`Unlogged discoveries lost: ${lostMapping} map cells, ${lostLandmarks} landmarks.`);
    }
    if (contract) {
      parts.push(`Contract reward lost: ${contract.title}.`);
    }
    return parts.join(" ");
  }

  private discoverySummary(player: DivePlayer, banked: BankedExpedition): string {
    const parts = [
      `Explore $${banked.explorationReward}`,
      `Map $${banked.mappingReward}`,
      `Landmarks $${banked.landmarkReward}`
    ];
    if (banked.surveyReward > 0) parts.push(`Record $${banked.surveyReward}`);
    if (banked.contractReward > 0) parts.push(`Contract $${banked.contractReward}`);
    const landmarkNames = siteLandmarks(this.activeDiveSite().id)
      .filter((landmark) => player.newDiscoveredLandmarkIds.has(landmark.id))
      .map((landmark) => landmark.name);
    if (player.newMappedSiteCells.size > 0) {
      parts.push(`${player.newMappedSiteCells.size} new ${this.progress.equipment.mappingSlate ? "formal" : "rough"} map cells`);
    }
    if (landmarkNames.length > 0) parts.push(`Found: ${landmarkNames.join(", ")}`);
    const contract = this.completedContract(player);
    if (contract?.darkEvent) parts.push("Quiet recovery logged");
    return parts.join(" | ");
  }

  private saveProgress(): void {
    this.store.save(this.progress);
  }

  private allMissionsComplete(): boolean {
    return MISSIONS.every((mission) => this.progress.completedMissionIds.includes(mission.id));
  }

  private renderLoading(): void {
    const { renderer } = this.services;
    renderer.clear("#03101a");
    renderer.text(GAME_MANIFEST.name, renderer.width * 0.5, renderer.height * 0.5 - 14, {
      align: "center",
      color: "#e8f5ff",
      font: "bold 38px Trebuchet MS"
    });
    renderer.text("Loading dive equipment...", renderer.width * 0.5, renderer.height * 0.5 + 28, {
      align: "center",
      color: "#8cb8c8",
      font: "18px Trebuchet MS"
    });
  }

  private renderLoadingError(): void {
    const { renderer } = this.services;
    renderer.clear("#12080b");
    renderer.text("Asset loading failed", renderer.width * 0.5, renderer.height * 0.5 - 12, {
      align: "center",
      color: "#ffd7d7",
      font: "bold 30px Trebuchet MS"
    });
    renderer.text(this.loadingError ?? "Unknown error", renderer.width * 0.5, renderer.height * 0.5 + 24, {
      align: "center",
      color: "#dbaaaa",
      font: "16px Trebuchet MS"
    });
  }

  private renderMenuBackdrop(): void {
    const { renderer } = this.services;
    renderer.clear("#020b12");
    this.cameraY = -80 + Math.sin(this.animationClock * 0.2) * 8;
    this.renderCave();
    this.renderParticles(0.55);
    this.renderSurfaceGlow();
    this.renderMenuDarknessOverlay(CAVE_CENTER_X, 212, 255);
  }

  private renderMenu(): void {
    const { renderer } = this.services;
    const mission = this.currentMission();
    const completedCount = this.progress.completedMissionIds.length;
    const contract = this.activeContract();
    const site = this.activeDiveSite();
    const stats = buildDiveStats(this.progress.equipment);
    const siteLandmarkCount = siteLandmarks(site.id).length;
    const discoveredSiteLandmarkCount = siteLandmarks(site.id).filter((landmark) =>
      this.progress.discoveredLandmarkIds.includes(landmark.id)
    ).length;

    drawInstrumentPanel(renderer, 68, 70, 470, 450, "EXPEDITION BOARD");
    renderer.text(GAME_MANIFEST.name, 92, 128, {
      color: UI.title,
      font: "bold 40px Aptos, Segoe UI, sans-serif"
    });
    renderer.text("Vertical technical cave dive prototype", 94, 160, {
      color: UI.muted,
      font: "16px Aptos, Segoe UI, sans-serif"
    });

    renderer.text(`Funding: $${this.progress.money}`, 94, 208, {
      color: UI.ok,
      font: "bold 21px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Survey records: ${completedCount}/${MISSIONS.length}`, 94, 238, {
      color: UI.text,
      font: "16px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Site: ${site.name}`, 94, 266, {
      color: UI.title,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Map: ${this.progress.mappedSiteCells.length} cells  Landmarks: ${discoveredSiteLandmarkCount}/${siteLandmarkCount}`, 94, 288, {
      color: UI.text,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Contract: ${contract ? contract.title : "none"}`, 94, 310, {
      color: contract ? UI.warn : UI.muted,
      font: "15px Aptos, Segoe UI, sans-serif"
    });

    renderer.text(`Optional record: ${mission.title}`, 94, 338, {
      color: UI.title,
      font: "bold 22px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Target: ${this.targetDepthReadout(mission.targetDepth, stats)}  Reward: $${mission.reward}`, 94, 368, {
      color: UI.warn,
      font: "17px Aptos, Segoe UI, sans-serif"
    });
    drawTextBlock(renderer, site.summary, 94, 398, 385, 20, {
      color: UI.text,
      font: "15px Aptos, Segoe UI, sans-serif"
    });

    renderer.text("Enter/Space start dive", 94, 442, {
      color: UI.title,
      font: "bold 16px Aptos, Segoe UI, sans-serif"
    });
    renderer.text("T sites  C contracts  S shop  R reset", 94, 470, {
      color: UI.muted,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(
      `M music ${this.progress.settings.musicEnabled ? "on" : "off"}  V sfx ${this.progress.settings.sfxEnabled ? "on" : "off"}`,
      94,
      498,
      {
        color: UI.muted,
        font: "15px Aptos, Segoe UI, sans-serif"
      }
    );

    this.renderEquipmentSummary(742, 92);
    this.renderMessageBar();
  }

  private renderShop(): void {
    const { renderer } = this.services;
    const category = this.currentCategory();
    const upgrades = this.currentCategoryUpgrades();
    drawInstrumentPanel(renderer, 64, 54, 646, 600, "EQUIPMENT SHOP");
    renderer.text(`Funding: $${this.progress.money}`, 92, 104, {
      color: UI.ok,
      font: "bold 23px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(
      this.shopPane === "categories"
        ? "Up/Down select category  Enter/Space open  Esc back"
        : "Up/Down select option  Enter/Space buy  Esc categories",
      92,
      134,
      {
        color: UI.muted,
        font: "15px Aptos, Segoe UI, sans-serif"
      }
    );

    for (let index = 0; index < UPGRADE_CATEGORIES.length; index += 1) {
      const item = UPGRADE_CATEGORIES[index];
      if (!item) continue;
      const y = 186 + index * 84;
      const selected = this.shopPane === "categories" && index === this.selectedCategoryIndex;
      const active = index === this.selectedCategoryIndex;
      renderer.rect(88, y - 30, 214, 66, selected ? "rgba(64, 67, 47, 0.88)" : active ? "rgba(42, 45, 33, 0.78)" : "rgba(12, 17, 16, 0.72)");
      renderer.strokeRect(88, y - 30, 214, 66, selected ? UI.panelAccent : "rgba(168, 165, 132, 0.22)", selected ? 2 : 1);
      renderer.text(item.name, 108, y - 4, {
        color: active ? UI.title : UI.text,
        font: "bold 18px Aptos, Segoe UI, sans-serif"
      });
      renderer.text(`${upgradesForCategory(item.id).length} options`, 108, y + 22, {
        color: UI.muted,
        font: "13px Aptos, Segoe UI, sans-serif"
      });
    }

    renderer.text(category.name, 340, 174, {
      color: UI.title,
      font: "bold 24px Aptos, Segoe UI, sans-serif"
    });
    drawTextBlock(renderer, category.summary, 340, 202, 300, 19, {
      color: UI.muted,
      font: "14px Aptos, Segoe UI, sans-serif"
    });

    for (let index = 0; index < upgrades.length; index += 1) {
      const upgrade = upgrades[index];
      if (!upgrade) continue;
      const y = 270 + index * 74;
      const selected = this.shopPane === "items" && index === this.selectedUpgradeIndex;
      const tankKind = this.tankKindForUpgrade(upgrade.id);
      const tankStatus = tankKind ? this.tankShopStatus(upgrade.id, tankKind) : null;
      const lightStatus =
        !tankStatus && this.isLightUpgrade(upgrade.id) && isUpgradePurchased(this.progress.equipment, upgrade.id)
          ? this.lightShopStatus()
          : null;
      const itemStatus = tankStatus ?? lightStatus;
      const installed = itemStatus ? itemStatus.label === "FULL" : isUpgradePurchased(this.progress.equipment, upgrade.id);
      const canAfford = itemStatus ? itemStatus.canAfford : this.progress.money >= upgrade.cost;
      const requirement = itemStatus ? itemStatus.requirement : upgradeRequirementReason(this.progress.equipment, upgrade.id);
      renderer.rect(334, y - 26, 330, 62, selected ? "rgba(64, 67, 47, 0.82)" : "rgba(12, 17, 16, 0.72)");
      renderer.strokeRect(334, y - 26, 330, 62, selected ? UI.panelAccent : "rgba(168, 165, 132, 0.24)", selected ? 2 : 1);
      renderer.text(selected ? ">" : "", 342, y + 1, {
        color: UI.warn,
        font: "bold 18px Aptos, Segoe UI, sans-serif"
      });
      renderer.text(upgrade.name, 352, y - 2, {
        color: UI.title,
        font: "bold 16px Aptos, Segoe UI, sans-serif"
      });
      renderer.text(itemStatus ? itemStatus.label : installed ? "INSTALLED" : requirement ? "LOCKED" : `$${upgrade.cost}`, 646, y - 2, {
        align: "right",
        color: installed ? UI.ok : requirement ? UI.muted : canAfford ? UI.warn : UI.danger,
        font: "bold 14px Aptos, Segoe UI, sans-serif"
      });
      drawTextBlock(renderer, itemStatus ? itemStatus.detail : requirement ?? upgrade.effect, 352, y + 22, 284, 14, {
        color: requirement ? UI.danger : UI.text,
        font: "12px Aptos, Segoe UI, sans-serif"
      });
    }

    this.renderEquipmentSummary(770, 86);
    this.renderMessageBar();
  }

  private renderContracts(): void {
    const { renderer } = this.services;
    const selected = CONTRACTS[this.selectedContractIndex] ?? CONTRACTS[0]!;

    drawInstrumentPanel(renderer, 64, 54, 664, 600, "CONTRACTS");
    renderer.text("Optional work - free expeditions stay available", 92, 104, {
      color: UI.muted,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    renderer.text("Up/Down select  Enter/Space accept/remove  Esc board", 92, 132, {
      color: UI.muted,
      font: "15px Aptos, Segoe UI, sans-serif"
    });

    for (let index = 0; index < CONTRACTS.length; index += 1) {
      const contract = CONTRACTS[index];
      if (!contract) continue;
      const y = 184 + index * 76;
      const isSelected = index === this.selectedContractIndex;
      const isActive = this.progress.activeContractId === contract.id;
      const isDone = this.progress.completedContractIds.includes(contract.id);
      renderer.rect(88, y - 30, 280, 58, isSelected ? "rgba(64, 67, 47, 0.86)" : "rgba(12, 17, 16, 0.72)");
      renderer.strokeRect(88, y - 30, 280, 58, isSelected ? UI.panelAccent : "rgba(168, 165, 132, 0.22)", isSelected ? 2 : 1);
      renderer.text(contract.title, 108, y - 7, {
        color: isDone ? UI.muted : isActive ? UI.ok : UI.title,
        font: "bold 16px Aptos, Segoe UI, sans-serif"
      });
      renderer.text(isDone ? "ARCHIVED" : isActive ? "ACTIVE" : `$${contract.reward}`, 348, y - 7, {
        align: "right",
        color: isDone ? UI.muted : isActive ? UI.ok : UI.warn,
        font: "bold 13px Aptos, Segoe UI, sans-serif"
      });
      renderer.text(contract.contractor, 108, y + 18, {
        color: contract.darkEvent ? "#d5bab0" : UI.muted,
        font: "12px Aptos, Segoe UI, sans-serif"
      });
    }

    renderer.text(selected.title, 410, 174, {
      color: selected.darkEvent ? "#f0c8b4" : UI.title,
      font: "bold 25px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(selected.contractor, 410, 204, {
      color: UI.muted,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    drawTextBlock(renderer, selected.objective, 410, 240, 270, 19, {
      color: UI.text,
      font: "14px Aptos, Segoe UI, sans-serif"
    });
    drawTextBlock(renderer, selected.flavor, 410, 318, 270, 18, {
      color: UI.muted,
      font: "13px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Reward: $${selected.reward}`, 410, 410, {
      color: UI.warn,
      font: "bold 18px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Target: ${this.roughTargetLabel(selected.targetDepth)}`, 410, 440, {
      color: UI.text,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    drawTextBlock(renderer, `Risk: ${selected.riskHint}`, 410, 474, 270, 18, {
      color: selected.darkEvent ? "#d5bab0" : UI.text,
      font: "13px Aptos, Segoe UI, sans-serif"
    });

    this.renderEquipmentSummary(790, 86);
    this.renderMessageBar();
  }

  private renderSites(): void {
    const { renderer } = this.services;
    const selected = DIVE_SITES[this.selectedDiveSiteIndex] ?? DIVE_SITES[0]!;
    const selectedLock = diveSiteUnlockReason(this.progress, selected);
    const selectedCells = this.progress.mappedSiteCells.filter((cell) => cell.startsWith(`${selected.id}:`)).length;
    const selectedLandmarks = siteLandmarks(selected.id);
    const selectedLandmarksFound = selectedLandmarks.filter((landmark) => this.progress.discoveredLandmarkIds.includes(landmark.id)).length;
    const activeSite = this.activeDiveSite();

    drawInstrumentPanel(renderer, 64, 54, 664, 600, "DIVE SITES");
    renderer.text("Stage 9 expansion map layer - Zacaton remains the primary route", 92, 104, {
      color: UI.muted,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    renderer.text("Up/Down select  Enter/Space choose  Esc board", 92, 132, {
      color: UI.muted,
      font: "15px Aptos, Segoe UI, sans-serif"
    });

    for (let index = 0; index < DIVE_SITES.length; index += 1) {
      const site = DIVE_SITES[index];
      if (!site) continue;
      const y = 190 + index * 92;
      const isSelected = index === this.selectedDiveSiteIndex;
      const isActive = activeSite.id === site.id;
      const locked = Boolean(diveSiteUnlockReason(this.progress, site));
      renderer.rect(88, y - 34, 282, 72, isSelected ? "rgba(64, 67, 47, 0.86)" : "rgba(12, 17, 16, 0.72)");
      renderer.strokeRect(88, y - 34, 282, 72, isSelected ? UI.panelAccent : "rgba(168, 165, 132, 0.22)", isSelected ? 2 : 1);
      renderer.text(site.shortName, 108, y - 9, {
        color: locked ? UI.muted : isActive ? UI.ok : UI.title,
        font: "bold 17px Aptos, Segoe UI, sans-serif"
      });
      renderer.text(locked ? "LOCKED" : isActive ? "ACTIVE" : `${site.maxDepth}m`, 350, y - 9, {
        align: "right",
        color: locked ? UI.muted : isActive ? UI.ok : UI.warn,
        font: "bold 13px Aptos, Segoe UI, sans-serif"
      });
      renderer.text(site.geometry.replace("-", " "), 108, y + 17, {
        color: UI.muted,
        font: "12px Aptos, Segoe UI, sans-serif"
      });
    }

    renderer.text(selected.name, 410, 174, {
      color: selectedLock ? UI.muted : UI.title,
      font: "bold 25px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`${selected.geometry.replace("-", " ")}  |  max ${selected.maxDepth}m`, 410, 204, {
      color: UI.warn,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    drawTextBlock(renderer, selected.summary, 410, 240, 270, 19, {
      color: UI.text,
      font: "14px Aptos, Segoe UI, sans-serif"
    });
    drawTextBlock(renderer, `Risk: ${selected.riskHint}`, 410, 320, 270, 18, {
      color: UI.text,
      font: "13px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Mapped cells: ${selectedCells}`, 410, 406, {
      color: selectedCells > 0 ? UI.ok : UI.muted,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Landmarks: ${selectedLandmarksFound}/${selectedLandmarks.length}`, 410, 432, {
      color: selectedLandmarksFound > 0 ? UI.ok : UI.muted,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(
      `Features: ${[
        selected.hasSensorRoute ? "sensor route" : null,
        selected.hasHiddenChamber ? "hidden chamber" : null,
        selected.atmosphericWildlife ? "wildlife atmosphere" : null
      ]
        .filter(Boolean)
        .join(", ") || "focused route"}`,
      410,
      458,
      {
        color: UI.text,
        font: "13px Aptos, Segoe UI, sans-serif"
      }
    );
    renderer.text(selectedLock ?? (activeSite.id === selected.id ? "Current expedition site" : "Enter selects this site"), 410, 506, {
      color: selectedLock ? UI.danger : UI.ok,
      font: "bold 15px Aptos, Segoe UI, sans-serif"
    });

    this.renderEquipmentSummary(790, 86);
    this.renderMessageBar();
  }

  private renderMissionComplete(): void {
    const { renderer } = this.services;
    drawInstrumentPanel(renderer, 340, 132, 600, 398, "SURFACE LOG");
    const outcome = this.outcome;
    renderer.text(outcome?.title ?? "Expedition Complete", 640, 214, {
      align: "center",
      color: UI.ok,
      font: "bold 36px Aptos, Segoe UI, sans-serif"
    });
    drawTextBlock(renderer, outcome?.details ?? "", 640, 258, 430, 23, {
      align: "center",
      color: UI.text,
      font: "16px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Funding awarded: $${outcome?.reward ?? 0}`, 640, 310, {
      align: "center",
      color: UI.warn,
      font: "bold 24px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Total funding: $${this.progress.money}`, 640, 346, {
      align: "center",
      color: UI.ok,
      font: "19px Aptos, Segoe UI, sans-serif"
    });
    if (outcome?.discoverySummary) {
      drawTextBlock(renderer, outcome.discoverySummary, 640, 374, 500, 19, {
        align: "center",
        color: UI.text,
        font: "14px Aptos, Segoe UI, sans-serif"
      });
    }
    renderer.text(this.allMissionsComplete() ? "All survey records are complete." : "Enter/Space continue to shop", 640, 466, {
      align: "center",
      color: UI.title,
      font: "bold 16px Aptos, Segoe UI, sans-serif"
    });
    this.renderMessageBar();
  }

  private renderGameOver(): void {
    const { renderer } = this.services;
    drawInstrumentPanel(renderer, 360, 150, 560, 340, "INCIDENT REPORT");
    const outcome = this.outcome;
    renderer.text(outcome?.title ?? "Expedition Failed", 640, 222, {
      align: "center",
      color: UI.danger,
      font: "bold 36px Aptos, Segoe UI, sans-serif"
    });
    drawTextBlock(renderer, outcome?.details ?? "The diver did not complete the plan.", 640, 272, 432, 24, {
      align: "center",
      color: "#d5bab0",
      font: "16px Aptos, Segoe UI, sans-serif"
    });
    renderer.text("Enter retry  S shop  Esc expedition board", 640, 414, {
      align: "center",
      color: UI.title,
      font: "bold 16px Aptos, Segoe UI, sans-serif"
    });
    this.renderMessageBar();
  }

  private renderDive(): void {
    const player = this.player;
    if (!player || !this.assets) return;

    const { renderer } = this.services;
    renderer.clear("#020a11");
    this.renderCave();
    this.renderFlashlightGlow(player);
    this.renderParticles(1);
    this.renderDiver(player);
    this.renderDarknessOverlay(player);
    this.renderLifeline(player);
    this.renderDiveHud(player);
    this.renderSurfacePrompt(player);
    this.renderHypoxiaOverlay(player);
    this.renderPressureOverlay(player);
  }

  private renderCave(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const viewDepth = this.depthFromWorldY(this.cameraY + renderer.height * 0.5);
    const naturalLight = this.naturalLightAtDepth(viewDepth);
    const gradient = ctx.createLinearGradient(0, 0, 0, renderer.height);
    if (naturalLight > 0.55) {
      gradient.addColorStop(0, "#0a5360");
      gradient.addColorStop(0.45, "#073141");
      gradient.addColorStop(1, "#03121d");
    } else if (naturalLight > 0.16) {
      gradient.addColorStop(0, "#06283b");
      gradient.addColorStop(0.5, "#041826");
      gradient.addColorStop(1, "#020a12");
    } else if (naturalLight > 0.025) {
      gradient.addColorStop(0, "#081622");
      gradient.addColorStop(0.56, "#050d16");
      gradient.addColorStop(1, "#01050a");
    } else {
      gradient.addColorStop(0, "#03070c");
      gradient.addColorStop(0.6, "#010307");
      gradient.addColorStop(1, "#000104");
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, renderer.width, renderer.height);
    this.renderWaterLighting(naturalLight);

    const topWorldY = this.cameraY - 120;
    const bottomWorldY = this.cameraY + renderer.height + 140;
    const samples: { y: number; left: number; right: number }[] = [];
    for (let y = topWorldY; y <= bottomWorldY; y += 36) {
      const depth = this.depthFromWorldY(y);
      const bounds = this.caveBoundsAtDepth(depth);
      samples.push({ y: y - this.cameraY, left: bounds.left, right: bounds.right });
    }

    ctx.save();
    const wallGradient = ctx.createLinearGradient(0, 0, 0, renderer.height);
    wallGradient.addColorStop(0, naturalLight > 0.25 ? "#122428" : "#091116");
    wallGradient.addColorStop(0.5, naturalLight > 0.08 ? "#0b171b" : "#05090d");
    wallGradient.addColorStop(1, "#020509");
    ctx.fillStyle = wallGradient;
    ctx.beginPath();
    ctx.moveTo(0, -140);
    for (const point of samples) {
      ctx.lineTo(point.left, point.y);
    }
    ctx.lineTo(0, renderer.height + 160);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(renderer.width, -140);
    for (const point of samples) {
      ctx.lineTo(point.right, point.y);
    }
    ctx.lineTo(renderer.width, renderer.height + 160);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(0, 3, 7, 0.56)";
    ctx.lineWidth = 9;
    ctx.beginPath();
    for (let index = 0; index < samples.length; index += 1) {
      const point = samples[index];
      if (!point) continue;
      if (index === 0) ctx.moveTo(point.left, point.y);
      else ctx.lineTo(point.left, point.y);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let index = 0; index < samples.length; index += 1) {
      const point = samples[index];
      if (!point) continue;
      if (index === 0) ctx.moveTo(point.right, point.y);
      else ctx.lineTo(point.right, point.y);
    }
    ctx.stroke();

    ctx.strokeStyle = `rgba(101, 188, 202, ${0.12 + naturalLight * 0.28})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let index = 0; index < samples.length; index += 1) {
      const point = samples[index];
      if (!point) continue;
      if (index === 0) ctx.moveTo(point.left, point.y);
      else ctx.lineTo(point.left, point.y);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let index = 0; index < samples.length; index += 1) {
      const point = samples[index];
      if (!point) continue;
      if (index === 0) ctx.moveTo(point.right, point.y);
      else ctx.lineTo(point.right, point.y);
    }
    ctx.stroke();
    ctx.restore();

    this.renderWallSilhouettes(samples, naturalLight);
    this.renderRockDetails(topWorldY, bottomWorldY, naturalLight);
    this.renderEnvironmentalProps(topWorldY, bottomWorldY);
    this.renderAtmosphericWildlife(topWorldY, bottomWorldY, naturalLight);
    this.renderDepthHaze(viewDepth, naturalLight);
    this.renderSurfaceGlow();
  }

  private renderWaterLighting(naturalLight: number): void {
    if (naturalLight <= 0.012) return;

    const { renderer } = this.services;
    const { ctx } = renderer;
    ctx.save();
    ctx.fillStyle = `rgba(118, 226, 239, ${naturalLight * 0.05})`;
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    for (let i = 0; i < 9; i += 1) {
      const baseX = 110 + i * 145;
      const sway = Math.sin(this.animationClock * 0.22 + i * 1.7) * 34;
      const width = 72 + this.hash01(i, 301) * 64;
      const alpha = naturalLight * (0.025 + this.hash01(i, 307) * 0.035);
      ctx.fillStyle = `rgba(177, 239, 245, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(baseX + sway - width * 0.24, 0);
      ctx.lineTo(baseX + sway + width * 0.46, 0);
      ctx.lineTo(baseX + sway + width * 1.1, renderer.height);
      ctx.lineTo(baseX + sway - width * 0.88, renderer.height);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = `rgba(201, 255, 249, ${naturalLight * 0.08})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i += 1) {
      const y = 36 + i * 48 + Math.sin(this.animationClock * 0.8 + i) * 4;
      ctx.beginPath();
      for (let x = -20; x <= renderer.width + 20; x += 32) {
        const waveY = y + Math.sin(x * 0.018 + this.animationClock * 1.3 + i) * 4;
        if (x === -20) ctx.moveTo(x, waveY);
        else ctx.lineTo(x, waveY);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderWallSilhouettes(samples: { y: number; left: number; right: number }[], naturalLight: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const shadowAlpha = 0.18 + (1 - naturalLight) * 0.24;
    ctx.save();
    ctx.fillStyle = `rgba(0, 3, 6, ${shadowAlpha})`;

    for (let index = 1; index < samples.length - 2; index += 3) {
      const point = samples[index];
      if (!point) continue;
      const shelfHeight = 22 + this.hash01(index, 337) * 42;
      const leftShelf = 42 + this.hash01(index, 331) * 78;
      const rightShelf = 42 + this.hash01(index, 333) * 78;
      const y = point.y + this.hash01(index, 335) * 34 - 12;

      ctx.beginPath();
      ctx.moveTo(point.left, y);
      ctx.lineTo(point.left + leftShelf, y + shelfHeight * 0.18);
      ctx.lineTo(point.left + leftShelf * 0.58, y + shelfHeight);
      ctx.lineTo(point.left, y + shelfHeight * 0.72);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(point.right, y + 6);
      ctx.lineTo(point.right - rightShelf, y + shelfHeight * 0.24);
      ctx.lineTo(point.right - rightShelf * 0.62, y + shelfHeight * 1.04);
      ctx.lineTo(point.right, y + shelfHeight * 0.72);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = `rgba(72, 107, 111, ${0.08 + naturalLight * 0.1})`;
    ctx.lineWidth = 1;
    for (let index = 2; index < samples.length; index += 4) {
      const point = samples[index];
      if (!point) continue;
      const seamLength = 34 + this.hash01(index, 341) * 62;
      ctx.beginPath();
      ctx.moveTo(point.left + 8, point.y - 10);
      ctx.lineTo(point.left + 20 + seamLength * 0.45, point.y + 12);
      ctx.lineTo(point.left + 12 + seamLength, point.y + 34);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(point.right - 8, point.y + 8);
      ctx.lineTo(point.right - 22 - seamLength * 0.4, point.y + 25);
      ctx.lineTo(point.right - 18 - seamLength, point.y + 52);
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderDepthHaze(viewDepth: number, naturalLight: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const depthLoss = clamp((viewDepth - 52) / 230, 0, 1);
    const deepBlack = clamp((viewDepth - 140) / 195, 0, 1);
    const sediment = this.player ? this.player.sedimentCloud : 0;
    if (depthLoss <= 0.01 && sediment <= 0.01 && naturalLight > 0.6) return;

    ctx.save();
    ctx.fillStyle = `rgba(4, 12, 17, ${depthLoss * 0.16 + deepBlack * 0.16 + sediment * 0.08})`;
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    for (let i = 0; i < 8; i += 1) {
      const y = ((i * 97 + this.animationClock * (6 + i * 0.7)) % (renderer.height + 140)) - 70;
      const bandAlpha = (0.018 + this.hash01(i, 353) * 0.026) * (0.35 + depthLoss + sediment * 1.2);
      const gradient = ctx.createLinearGradient(0, y, renderer.width, y + 46);
      gradient.addColorStop(0, `rgba(67, 112, 119, 0)`);
      gradient.addColorStop(0.45, `rgba(79, 126, 129, ${bandAlpha})`);
      gradient.addColorStop(1, `rgba(47, 83, 92, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, y, renderer.width, 54 + this.hash01(i, 359) * 38);
    }

    if (deepBlack > 0.05) {
      const floorGradient = ctx.createLinearGradient(0, 0, 0, renderer.height);
      floorGradient.addColorStop(0, `rgba(0, 0, 0, 0)`);
      floorGradient.addColorStop(0.68, `rgba(0, 2, 5, ${deepBlack * 0.16})`);
      floorGradient.addColorStop(1, `rgba(0, 1, 3, ${deepBlack * 0.34})`);
      ctx.fillStyle = floorGradient;
      ctx.fillRect(0, 0, renderer.width, renderer.height);
    }
    if (sediment > 0.05) {
      ctx.fillStyle = `rgba(168, 154, 122, ${sediment * 0.11})`;
      ctx.fillRect(0, 0, renderer.width, renderer.height);
    }
    ctx.restore();
  }

  private renderRockDetails(topWorldY: number, bottomWorldY: number, naturalLight: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    ctx.save();
    ctx.strokeStyle = `rgba(109, 159, 166, ${0.12 + naturalLight * 0.12})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 48; i += 1) {
      const worldY = topWorldY + this.hash01(i, 9) * (bottomWorldY - topWorldY);
      const depth = this.depthFromWorldY(worldY);
      const bounds = this.caveBoundsAtDepth(depth);
      const onLeft = this.hash01(i, 12) < 0.5;
      const x = onLeft ? bounds.left - 16 - this.hash01(i, 19) * 120 : bounds.right + 16 + this.hash01(i, 19) * 120;
      const y = worldY - this.cameraY;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (onLeft ? -1 : 1) * (24 + this.hash01(i, 21) * 48), y + 18 + this.hash01(i, 23) * 36);
      ctx.stroke();

      if (i % 5 === 0) {
        const shelfWidth = 34 + this.hash01(i, 29) * 58;
        ctx.fillStyle = `rgba(116, 132, 128, ${0.08 + naturalLight * 0.08})`;
        ctx.beginPath();
        ctx.moveTo(onLeft ? bounds.left - shelfWidth : bounds.right, y + 4);
        ctx.lineTo(onLeft ? bounds.left + 12 : bounds.right + shelfWidth, y - 4);
        ctx.lineTo(onLeft ? bounds.left + 4 : bounds.right + shelfWidth * 0.7, y + 14);
        ctx.closePath();
        ctx.fill();
      }

      if (i % 6 === 2) {
        const seamAlpha = 0.1 + naturalLight * 0.18;
        ctx.strokeStyle = `rgba(139, 199, 186, ${seamAlpha})`;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        const startX = onLeft ? bounds.left + 8 : bounds.right - 8;
        const direction = onLeft ? 1 : -1;
        ctx.moveTo(startX, y - 16);
        ctx.lineTo(startX + direction * (20 + this.hash01(i, 363) * 36), y - 2);
        ctx.lineTo(startX + direction * (34 + this.hash01(i, 367) * 58), y + 20);
        ctx.stroke();
        ctx.strokeStyle = `rgba(223, 230, 174, ${seamAlpha * 0.35})`;
        ctx.beginPath();
        ctx.moveTo(startX + direction * 5, y - 12);
        ctx.lineTo(startX + direction * (18 + this.hash01(i, 369) * 28), y + 4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private renderEnvironmentalProps(topWorldY: number, bottomWorldY: number): void {
    if (!this.assets) return;

    const { renderer } = this.services;
    const { ctx } = renderer;
    const segmentSize = 148;
    const startSegment = Math.floor(topWorldY / segmentSize) - 1;
    const endSegment = Math.ceil(bottomWorldY / segmentSize) + 1;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    for (let segment = startSegment; segment <= endSegment; segment += 1) {
      const seed = segment + 8000;
      if (this.hash01(seed, 221) < 0.16) continue;

      const worldY = segment * segmentSize + this.hash01(seed, 223) * segmentSize;
      const depth = this.depthFromWorldY(worldY);
      if (depth < 1) continue;

      const bounds = this.caveBoundsAtDepth(depth);
      const onLeft = this.hash01(seed, 227) < 0.5;
      const image = this.environmentAssetForDepth(this.assets, seed, depth);
      const width = 48 + this.hash01(seed, 233) * 70;
      const aspect = image.naturalWidth > 0 ? image.naturalHeight / image.naturalWidth : 0.72;
      const height = width * clamp(aspect, 0.42, 1.3);
      const x = onLeft ? bounds.left - 8 : bounds.right + 8;
      const y = worldY - this.cameraY;
      const rotation = (this.hash01(seed, 239) - 0.5) * 0.26;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(onLeft ? 1 : -1, 1);
      ctx.rotate(onLeft ? rotation : -rotation);
      ctx.globalAlpha = 0.42 + this.naturalLightAtDepth(depth) * 0.38;
      ctx.drawImage(image, -width * 0.85, -height * 0.5, width, height);
      ctx.restore();
    }
    ctx.restore();
  }

  private renderAtmosphericWildlife(topWorldY: number, bottomWorldY: number, naturalLight: number): void {
    const site = this.activeDiveSite();
    if (!site.atmosphericWildlife || naturalLight <= 0.035) return;

    const { renderer } = this.services;
    const { ctx } = renderer;
    ctx.save();
    ctx.fillStyle = `rgba(131, 181, 178, ${0.08 + naturalLight * 0.12})`;
    for (let i = 0; i < 7; i += 1) {
      const worldY = topWorldY + this.hash01(i, 613) * (bottomWorldY - topWorldY);
      const depth = this.depthFromWorldY(worldY);
      if (depth < 10 || depth > site.maxDepth - 6) continue;
      const bounds = this.caveBoundsAtDepth(depth);
      const x = bounds.left + 72 + ((this.hash01(i, 617) * (bounds.right - bounds.left - 144) + this.animationClock * (6 + i)) % Math.max(80, bounds.right - bounds.left - 144));
      const y = worldY - this.cameraY + Math.sin(this.animationClock * 0.8 + i) * 5;
      const scale = 0.7 + this.hash01(i, 619) * 0.7;
      ctx.beginPath();
      ctx.ellipse(x, y, 9 * scale, 3.4 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 9 * scale, y);
      ctx.lineTo(x - 16 * scale, y - 5 * scale);
      ctx.lineTo(x - 16 * scale, y + 5 * scale);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private environmentAssetForDepth(assets: DiveAssets, seed: number, depth: number): HTMLImageElement {
    const roll = this.hash01(seed, 251);
    if (depth < 52 && roll < 0.42) return assets.cavePlant;
    if (roll < 0.36) return assets.limestoneShelf;
    if (roll < 0.68) return assets.rockCluster;
    return assets.mineralVein;
  }

  private renderSurfaceGlow(): void {
    const { renderer } = this.services;
    const surfaceY = -this.cameraY;
    if (surfaceY < -80 || surfaceY > renderer.height + 80) return;

    const { ctx } = renderer;
    const gradient = ctx.createLinearGradient(0, surfaceY - 38, 0, surfaceY + SURFACE_BAND_HEIGHT);
    gradient.addColorStop(0, "rgba(170, 237, 255, 0.42)");
    gradient.addColorStop(0.45, "rgba(74, 178, 202, 0.26)");
    gradient.addColorStop(1, "rgba(11, 65, 82, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, surfaceY - 38, renderer.width, SURFACE_BAND_HEIGHT + 38);

    ctx.save();
    ctx.strokeStyle = "rgba(213, 255, 255, 0.56)";
    ctx.lineWidth = 2;
    for (let line = 0; line < 4; line += 1) {
      ctx.beginPath();
      for (let x = -28; x <= renderer.width + 28; x += 28) {
        const y = surfaceY + line * 7 + Math.sin(x * 0.018 + this.animationClock * (0.75 + line * 0.1)) * (3.2 - line * 0.4);
        if (x === -28) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.globalAlpha = 1 - line * 0.18;
      ctx.stroke();
    }
    ctx.restore();

    renderer.line(0, surfaceY, renderer.width, surfaceY, "rgba(202, 249, 255, 0.76)", 2);
    renderer.text("SURFACE - BREATHING ZONE", 32, surfaceY - 10, {
      color: "rgba(238, 246, 217, 0.72)",
      font: "bold 13px Aptos, Segoe UI, sans-serif"
    });
  }

  private renderParticles(alpha: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const viewDepth = this.depthFromWorldY(this.cameraY + renderer.height * 0.5);
    const sediment = this.player ? this.player.sedimentCloud : 0;
    const murk = Math.max(clamp((viewDepth - 36) / 250, 0, 1), sediment);
    const current = Math.sin(this.animationClock * 0.33) * (2 + murk * 6);
    ctx.save();
    const count = 176 + Math.round(sediment * 90);
    for (let i = 0; i < count; i += 1) {
      const drift = this.animationClock * (5 + this.hash01(i, 41) * (8 + murk * 6));
      const worldY = this.cameraY - 90 + ((i * 61 + drift + this.hash01(i, 43) * 320) % (renderer.height + 180));
      const depth = this.depthFromWorldY(worldY);
      const bounds = this.caveBoundsAtDepth(depth);
      const lateralDrift = Math.sin(this.animationClock * (0.42 + this.hash01(i, 45)) + i) * (3 + murk * 11) + current;
      const x = bounds.left + 16 + this.hash01(i, 47) * Math.max(20, bounds.right - bounds.left - 32) + lateralDrift;
      const y = worldY - this.cameraY;
      const radius = (0.45 + this.hash01(i, 53) * 1.9) * (1 + murk * 0.2);
      ctx.globalAlpha = alpha * (0.1 + this.hash01(i, 59) * 0.28 + murk * 0.12 + sediment * 0.16);
      ctx.fillStyle = depth > 150 ? "#a9a28d" : i % 5 === 0 ? "#d7f6ff" : "#a7c9cf";
      if (i % 11 === 0) {
        ctx.strokeStyle = depth > 150 ? "rgba(184, 174, 147, 0.32)" : "rgba(194, 239, 240, 0.28)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 4 + murk * 8, y + 1.5 + this.hash01(i, 61) * 4);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private renderFlashlightGlow(player: DivePlayer): void {
    const stats = buildDiveStats(this.progress.equipment);
    if (!stats.hasFlashlight || !player.flashlightOn) return;

    const { renderer } = this.services;
    const { ctx } = renderer;
    const origin = this.diverLocalPoint(player, 54, 13);
    const angle = this.flashlightAimAngle(player);
    const length = stats.lightConeRange;
    const spread = stats.lightConeSpread;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const perpX = -dirY;
    const perpY = dirX;
    const endX = origin.x + dirX * length;
    const endY = origin.y + dirY * length;

    ctx.save();
    const gradient = ctx.createLinearGradient(origin.x, origin.y, endX, endY);
    gradient.addColorStop(0, "rgba(168, 241, 255, 0.18)");
    gradient.addColorStop(1, "rgba(168, 241, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(endX + perpX * spread * 0.5, endY + perpY * spread * 0.5);
    ctx.lineTo(endX - perpX * spread * 0.54, endY - perpY * spread * 0.54);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private diverBob(player: DivePlayer): number {
    const idle = Math.sin(this.animationClock * 1.28 + player.elapsed * 0.13) * (2.8 - player.motionIntensity * 0.9);
    const kickLift = Math.sin(player.kickPhase * 1.8) * player.motionIntensity * 0.9;
    return idle + kickLift;
  }

  private diverLocalPoint(player: DivePlayer, localX: number, localY: number): { x: number; y: number } {
    const screen = this.playerScreenPoint(player);
    const pitch = player.visualPitch * player.facing;
    const scaledX = localX * player.facing;
    const cos = Math.cos(pitch);
    const sin = Math.sin(pitch);
    return {
      x: screen.x + cos * scaledX - sin * localY,
      y: screen.y + this.diverBob(player) + sin * scaledX + cos * localY
    };
  }

  private flashlightAimAngle(player: DivePlayer): number {
    const rateAim = clamp(player.depthRateMetersPerMinute / 70, -0.72, 0.72);
    const verticalAim = clamp(player.swimIntentY * 0.58 + rateAim * 0.32 + player.visualPitch * 0.28, -0.86, 0.86);
    return Math.atan2(verticalAim, player.facing);
  }

  private drawDiverLayer(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    anchorX: number,
    anchorY: number,
    rotation: number,
    offsetX = 0,
    offsetY = 0,
    alpha = 1
  ): void {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(anchorX + offsetX, anchorY + offsetY);
    ctx.rotate(rotation);
    ctx.drawImage(image, -DIVER_DRAW_WIDTH / 2 - anchorX, -DIVER_DRAW_HEIGHT / 2 - anchorY, DIVER_DRAW_WIDTH, DIVER_DRAW_HEIGHT);
    ctx.restore();
  }

  private renderAnimatedFinBlades(ctx: CanvasRenderingContext2D, player: DivePlayer, hasFastFins: boolean): void {
    const kick = Math.sin(player.kickPhase);
    const counterKick = Math.sin(player.kickPhase + Math.PI * 0.82);
    const kickScale = 0.32 + player.motionIntensity * 0.9;
    const finFill = hasFastFins ? "rgba(25, 84, 91, 0.76)" : "rgba(38, 65, 61, 0.74)";
    const finStroke = hasFastFins ? "rgba(151, 231, 215, 0.72)" : "rgba(154, 184, 156, 0.62)";

    const drawBlade = (rootY: number, kickOffset: number): void => {
      const tipY = rootY + kickOffset * 8.5 * kickScale;
      ctx.beginPath();
      ctx.moveTo(-43, rootY - 4);
      ctx.lineTo(-72, tipY - 9);
      ctx.lineTo(-79, tipY + 2);
      ctx.lineTo(-43, rootY + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    ctx.save();
    ctx.fillStyle = finFill;
    ctx.strokeStyle = finStroke;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha *= 0.78;
    drawBlade(-17, kick);
    drawBlade(24, counterKick);
    ctx.restore();
  }

  private renderDiverHose(ctx: CanvasRenderingContext2D, player: DivePlayer): void {
    const sway = Math.sin(player.kickPhase * 0.72) * (1.2 + player.motionIntensity * 2.4);
    ctx.save();
    ctx.strokeStyle = "rgba(13, 22, 24, 0.92)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(16, -24 + sway * 0.28);
    ctx.bezierCurveTo(38, -38 + sway, 57, -25 - sway * 0.5, 48, -2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(100, 130, 128, 0.42)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(16, -24 + sway * 0.28);
    ctx.bezierCurveTo(38, -38 + sway, 57, -25 - sway * 0.5, 48, -2);
    ctx.stroke();
    ctx.restore();
  }

  private renderDiverPropulsionVehicle(ctx: CanvasRenderingContext2D, player: DivePlayer): void {
    const motion = player.motionIntensity;
    const propPulse = Math.sin(player.kickPhase * 2.4);
    const hover = Math.sin(this.animationClock * 1.8 + player.elapsed * 0.21) * (0.8 + motion * 0.6);

    ctx.save();
    ctx.translate(72, 18 + hover);
    ctx.rotate(player.swimIntentY * 0.12 + player.visualPitch * 0.16);
    ctx.globalAlpha *= 0.92;
    ctx.shadowColor = "rgba(107, 231, 232, 0.22)";
    ctx.shadowBlur = 8;

    ctx.fillStyle = "rgba(9, 31, 37, 0.96)";
    ctx.strokeStyle = "rgba(137, 229, 224, 0.72)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-25, -10, 58, 20, 10);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(28, 91, 99, 0.86)";
    ctx.beginPath();
    ctx.roundRect(4, -14, 22, 28, 8);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(202, 247, 238, 0.62)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -9);
    ctx.quadraticCurveTo(-14, -24, -31, -22);
    ctx.moveTo(-8, 9);
    ctx.quadraticCurveTo(-14, 24, -31, 22);
    ctx.stroke();

    ctx.strokeStyle = "rgba(191, 251, 247, 0.78)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(33, 0, 9, 13, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(205, 255, 249, 0.5)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(33, -9);
    ctx.lineTo(33 + propPulse * 4, 9);
    ctx.moveTo(27, 0);
    ctx.lineTo(39, propPulse * 2.5);
    ctx.stroke();
    ctx.restore();
  }

  private renderDiver(player: DivePlayer): void {
    if (!this.assets) return;
    const { renderer } = this.services;
    const { ctx } = renderer;
    const screen = this.playerScreenPoint(player);
    const bob = this.diverBob(player);
    const motion = player.motionIntensity;
    const kick = Math.sin(player.kickPhase);
    const tankSway = Math.sin(player.kickPhase * 0.56) * (0.4 + motion) * 0.035;
    const tankBob = Math.cos(player.kickPhase * 0.72) * (0.8 + motion * 1.4);
    const finRotation = kick * (0.05 + motion * 0.08);
    const flashlightAim = clamp(player.swimIntentY * 0.24 + player.depthRateMetersPerMinute / 420, -0.3, 0.3);

    ctx.save();
    ctx.translate(screen.x, screen.y + bob);
    ctx.rotate(player.visualPitch * player.facing);
    ctx.scale(player.facing, 1);
    ctx.imageSmoothingEnabled = true;
    const carriedTankKinds = new Set(player.tanks.filter((tank) => !tank.dropped).map((tank) => tank.kind));
    if (carriedTankKinds.has("single") || carriedTankKinds.has("twin")) {
      this.drawDiverLayer(
        ctx,
        carriedTankKinds.has("twin") ? this.assets.tankDouble : this.assets.tankSingle,
        10,
        -20,
        tankSway - player.visualPitch * 0.08,
        0,
        tankBob
      );
      this.renderDiverHose(ctx, player);
    }
    if (this.progress.equipment.rubberFins || this.progress.equipment.betterFins) {
      this.drawDiverLayer(
        ctx,
        this.progress.equipment.betterFins ? this.assets.finsFast : this.assets.finsStandard,
        -43,
        2,
        finRotation,
        0,
        Math.sin(player.kickPhase + Math.PI * 0.25) * motion * 2.2
      );
      this.renderAnimatedFinBlades(ctx, player, this.progress.equipment.betterFins);
    }
    ctx.drawImage(this.assets.diverBody, -DIVER_DRAW_WIDTH / 2, -DIVER_DRAW_HEIGHT / 2, DIVER_DRAW_WIDTH, DIVER_DRAW_HEIGHT);
    if (carriedTankKinds.has("pony")) {
      this.drawDiverLayer(ctx, this.assets.backupTank, 14, 12, -tankSway * 0.72, 0, -tankBob * 0.38);
    }
    if (this.progress.equipment.basicDepthGauge || this.progress.equipment.depthGauge) {
      ctx.drawImage(this.assets.depthGauge, -DIVER_DRAW_WIDTH / 2, -DIVER_DRAW_HEIGHT / 2, DIVER_DRAW_WIDTH, DIVER_DRAW_HEIGHT);
    }
    if (this.progress.equipment.diverPropulsionVehicle) {
      this.renderDiverPropulsionVehicle(ctx, player);
    }
    if (this.progress.equipment.handheldLight || this.progress.equipment.betterFlashlight) {
      this.drawDiverLayer(ctx, this.assets.flashlight, 46, 14, flashlightAim, 0, Math.sin(player.kickPhase * 0.44) * motion * 1.2);
    }
    ctx.restore();

    const bubbleOrigin = this.diverLocalPoint(player, 47, -14);
    this.renderBubbles(bubbleOrigin.x, bubbleOrigin.y, player);
  }

  private renderLifeline(player: DivePlayer): void {
    if (!player.lifelineDeployed || player.lifelinePoints.length === 0) return;

    const { renderer } = this.services;
    const { ctx } = renderer;
    ctx.save();
    ctx.setLineDash([8, 9]);
    ctx.lineWidth = player.lifelineFollowActive ? 3 : 2;
    ctx.strokeStyle = player.lifelineFollowActive ? "rgba(218, 255, 226, 0.92)" : "rgba(190, 237, 220, 0.68)";
    ctx.shadowColor = "rgba(121, 255, 220, 0.26)";
    ctx.shadowBlur = player.lifelineFollowActive ? 10 : 4;
    ctx.beginPath();
    for (let index = 0; index < player.lifelinePoints.length; index += 1) {
      const point = player.lifelinePoints[index];
      if (!point) continue;
      const screenY = point.y - this.cameraY;
      if (index === 0) ctx.moveTo(point.x, screenY);
      else ctx.lineTo(point.x, screenY);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(219, 251, 232, 0.76)";
    for (let index = 0; index < player.lifelinePoints.length; index += 5) {
      const point = player.lifelinePoints[index];
      if (!point) continue;
      const screenY = point.y - this.cameraY;
      if (screenY < -20 || screenY > renderer.height + 20) continue;
      ctx.beginPath();
      ctx.arc(point.x, screenY, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const cache of player.cachedTanks) {
      const screenY = cache.y - this.cameraY;
      if (screenY < -36 || screenY > renderer.height + 36) continue;
      const attach = player.lifelinePoints[cache.linePointIndex];
      if (attach) {
        ctx.strokeStyle = "rgba(228, 238, 190, 0.46)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(attach.x, attach.y - this.cameraY);
        ctx.lineTo(cache.x, screenY);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(234, 203, 119, 0.88)";
      ctx.strokeStyle = "rgba(52, 40, 18, 0.78)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(cache.x - 15, screenY - 8, 30, 16, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 244, 192, 0.94)";
      ctx.font = "bold 10px Aptos, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("CACHE", cache.x, screenY - 14);
    }
    ctx.restore();
  }

  private renderBubbles(x: number, y: number, player: DivePlayer): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const depth = this.depthFromWorldY(player.y);
    const murk = clamp((depth - 40) / 260, 0, 1);
    const moving = 0.5 + player.motionIntensity * 0.8;
    const count = player.maxTankGas > 0 ? 11 : 6;
    ctx.save();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < count; i += 1) {
      const offset = (this.animationClock * (16 + i * 2.8) * moving + i * 22) % 142;
      const drift = Math.sin(this.animationClock * 1.45 + i * 1.2) * (10 + murk * 6);
      const bubbleX = x - player.facing * (4 + this.hash01(i, 71) * 8) + drift;
      const bubbleY = y - offset;
      if (bubbleY < -12) continue;
      const radius = (1.7 + this.hash01(i, 73) * 4.8) * (1 - murk * 0.18);
      ctx.globalAlpha = 0.28 + this.hash01(i, 79) * 0.3;
      ctx.strokeStyle = murk > 0.55 ? "rgba(174, 205, 205, 0.34)" : "rgba(193, 240, 255, 0.45)";
      ctx.beginPath();
      ctx.arc(bubbleX, bubbleY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderDarknessOverlay(player: DivePlayer): void {
    const { renderer } = this.services;
    const darknessCtx = this.ensureDarknessContext();
    const darknessCanvas = darknessCtx.canvas;
    const center = this.diverLocalPoint(player, 18, 0);
    const lightOrigin = this.diverLocalPoint(player, 54, 13);
    const depth = this.depthFromWorldY(player.y);
    const lungRatio = player.lungOxygen / player.maxLungOxygen;
    const hypoxia = clamp((0.5 - lungRatio) / 0.5, 0, 1);
    const narcosis = clamp(player.narcosis / 100, 0, 1);
    const naturalLight = this.naturalLightAtDepth(depth);
    const depthHostility = clamp((depth - 115) / 224, 0, 1);
    const sediment = player.sedimentCloud;
    const darkness = clamp(
      0.08 + (1 - naturalLight) * 0.91 + depthHostility * 0.08 + hypoxia * 0.18 + narcosis * 0.1 + sediment * 0.12,
      0.08,
      0.997
    );
    const stats = buildDiveStats(this.progress.equipment);
    const visibleRadius =
      player.lightRadius * (1 - hypoxia * 0.34 - narcosis * 0.18 - depthHostility * 0.08 - sediment * SEDIMENT_VISIBILITY_PENALTY);
    const flashlightActive = stats.hasFlashlight && player.flashlightOn;

    darknessCtx.save();
    darknessCtx.clearRect(0, 0, renderer.width, renderer.height);
    darknessCtx.globalCompositeOperation = "source-over";
    darknessCtx.fillStyle = `rgba(0, 4, 10, ${darkness})`;
    darknessCtx.fillRect(0, 0, renderer.width, renderer.height);
    darknessCtx.globalCompositeOperation = "destination-out";
    if (flashlightActive) {
      this.cutRadialLight(darknessCtx, center.x, center.y, visibleRadius, 0.78);
      this.cutFlashlightBeam(
        darknessCtx,
        lightOrigin.x,
        lightOrigin.y,
        this.flashlightAimAngle(player),
        stats.lightConeRange,
        stats.lightConeSpread
      );
    } else if (naturalLight > 0.035) {
      this.cutRadialLight(darknessCtx, center.x, center.y, visibleRadius * (0.42 + naturalLight * 0.7), naturalLight * 0.5);
    }
    darknessCtx.restore();

    renderer.ctx.drawImage(darknessCanvas, 0, 0);
  }

  private renderMenuDarknessOverlay(centerX: number, centerY: number, radius: number): void {
    const { renderer } = this.services;
    const darknessCtx = this.ensureDarknessContext();
    const darknessCanvas = darknessCtx.canvas;
    darknessCtx.save();
    darknessCtx.clearRect(0, 0, renderer.width, renderer.height);
    darknessCtx.globalCompositeOperation = "source-over";
    darknessCtx.fillStyle = "rgba(0, 4, 10, 0.62)";
    darknessCtx.fillRect(0, 0, renderer.width, renderer.height);
    darknessCtx.globalCompositeOperation = "destination-out";
    this.cutRadialLight(darknessCtx, centerX, centerY, radius, 0.42);
    darknessCtx.restore();
    renderer.ctx.drawImage(darknessCanvas, 0, 0);
  }

  private naturalLightAtDepth(depth: number): number {
    if (depth <= 30) return this.lerp(1, 0.72, depth / 30);
    if (depth <= 60) return this.lerp(0.72, 0.44, (depth - 30) / 30);
    if (depth <= 100) return this.lerp(0.44, 0.16, (depth - 60) / 40);
    if (depth <= 200) return this.lerp(0.16, 0.055, (depth - 100) / 100);
    if (depth <= CAVE_MAX_DEPTH_METERS) return this.lerp(0.055, 0.006, (depth - 200) / (CAVE_MAX_DEPTH_METERS - 200));
    if (depth <= 500) return this.lerp(0.006, 0.002, (depth - CAVE_MAX_DEPTH_METERS) / (500 - CAVE_MAX_DEPTH_METERS));
    if (depth <= 1000) return this.lerp(0.002, 0.0005, (depth - 500) / 500);
    return 0;
  }

  private ambientLabelAtDepth(depth: number): string {
    if (depth < 30) return "bright";
    if (depth < 60) return "fading";
    if (depth < 100) return "dark";
    if (depth < 200) return "very dark";
    if (depth < 500) return "near black";
    return "black";
  }

  private depthReadout(depth: number, stats: DiveStats): string {
    if (!stats.hasDepthGauge) return this.roughDepthLabel(depth);
    if (stats.exactDepthGauge) return `${depth.toFixed(1)}m`;
    return `~${Math.round(depth / 5) * 5}m`;
  }

  private targetDepthReadout(depth: number, stats: DiveStats): string {
    if (!stats.hasDepthGauge) return this.roughTargetLabel(depth);
    if (stats.exactDepthGauge) return `${depth.toFixed(0)}m`;
    return `~${Math.round(depth / 5) * 5}m`;
  }

  private depthRateReadout(rateMetersPerMinute: number): string {
    const absoluteRate = Math.abs(rateMetersPerMinute);
    if (absoluteRate < 1) return "steady";
    return rateMetersPerMinute > 0
      ? `down ${absoluteRate.toFixed(0)} m/min`
      : `up ${absoluteRate.toFixed(0)} m/min`;
  }

  private maxDepthReport(player: DivePlayer): string {
    const stats = buildDiveStats(this.progress.equipment);
    if (!stats.hasDepthGauge) return `a ${this.roughDepthLabel(player.maxDepth)} zone`;
    return this.depthReadout(player.maxDepth, stats);
  }

  private roughDepthLabel(depth: number): string {
    if (depth < 4) return "surface";
    if (depth < 30) return "shallow";
    if (depth < 60) return "descending";
    if (depth < 100) return "deep";
    if (depth < 200) return "very deep";
    return "unknown";
  }

  private roughTargetLabel(depth: number): string {
    if (depth <= 25) return "first shelf";
    if (depth <= 45) return "thermocline drop";
    if (depth <= 70) return "lower bell";
    if (depth <= 140) return "black zone";
    return "unknown depth";
  }

  private lerp(start: number, end: number, t: number): number {
    return start + (end - start) * clamp(t, 0, 1);
  }

  private renderSurfacePrompt(player: DivePlayer): void {
    if (!player.surfacePromptVisible) return;
    const { renderer } = this.services;
    drawInstrumentPanel(renderer, 430, 236, 420, 182, "SURFACE");
    renderer.text("Return to base?", 640, 298, {
      align: "center",
      color: UI.title,
      font: "bold 30px Aptos, Segoe UI, sans-serif"
    });
    renderer.text("Enter/Space yes", 640, 342, {
      align: "center",
      color: UI.ok,
      font: "bold 17px Aptos, Segoe UI, sans-serif"
    });
    renderer.text("Esc or N no, continue exploring", 640, 372, {
      align: "center",
      color: UI.text,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
  }

  private renderHypoxiaOverlay(player: DivePlayer): void {
    const { renderer } = this.services;
    const lungRatio = player.lungOxygen / player.maxLungOxygen;
    if (lungRatio >= 0.5 && player.lungFlashPulse <= 0) return;

    const { ctx } = renderer;
    const dimAlpha = clamp((0.5 - lungRatio) / 0.5, 0, 1) * 0.12;
    if (dimAlpha > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(80, 12, 10, ${dimAlpha})`;
      ctx.fillRect(0, 0, renderer.width, renderer.height);
      ctx.restore();
    }

    if (player.lungFlashPulse > 0) {
      const alpha = Math.sin((player.lungFlashPulse / 0.56) * Math.PI) * 0.28;
      ctx.save();
      ctx.fillStyle = `rgba(255, 205, 176, ${Math.max(0, alpha)})`;
      ctx.fillRect(0, 0, renderer.width, renderer.height);
      ctx.restore();
    }
  }

  private renderPressureOverlay(player: DivePlayer): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const deco = clamp(player.decoStress / DECO_STRESS_FAILURE + player.decoPulse * 0.28, 0, 1);
    const narcosis = clamp(player.narcosis / 100 + player.narcosisPulse * 0.18, 0, 1);
    if (deco <= 0.04 && narcosis <= 0.18) return;

    ctx.save();
    if (narcosis > 0.18) {
      ctx.fillStyle = `rgba(87, 144, 165, ${narcosis * 0.09})`;
      ctx.fillRect(0, 0, renderer.width, renderer.height);
      ctx.strokeStyle = `rgba(182, 239, 229, ${narcosis * 0.22})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i += 1) {
        const x = 100 + this.hash01(i, 701) * (renderer.width - 200) + Math.sin(this.animationClock * 1.3 + i) * 18 * narcosis;
        const y = 82 + this.hash01(i, 709) * (renderer.height - 166);
        ctx.beginPath();
        ctx.arc(x, y, 5 + this.hash01(i, 719) * 10, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (deco > 0.04) {
      const pulse = 0.65 + Math.sin(this.animationClock * 8.2) * 0.35;
      ctx.fillStyle = `rgba(255, 190, 148, ${deco * (0.1 + pulse * 0.08)})`;
      ctx.fillRect(0, 0, renderer.width, renderer.height);
    }

    const tunnel = clamp(Math.max(deco * 0.75, narcosis * 0.55), 0, 1);
    if (tunnel > 0.05) {
      const gradient = ctx.createRadialGradient(
        renderer.width * 0.5,
        renderer.height * 0.5,
        130,
        renderer.width * 0.5,
        renderer.height * 0.5,
        620
      );
      gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
      gradient.addColorStop(0.55, `rgba(20, 4, 6, ${tunnel * 0.08})`);
      gradient.addColorStop(1, `rgba(0, 0, 0, ${tunnel * 0.42})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, renderer.width, renderer.height);
    }
    ctx.restore();
  }

  private hudJitter(player: DivePlayer): { x: number; y: number } {
    const pressure = clamp(player.decoStress / DECO_STRESS_FAILURE, 0, 1);
    const narcosis = clamp((player.narcosis - 45) / 55, 0, 1);
    const amount = Math.max(pressure, narcosis) * 3.6;
    if (amount <= 0.05) return { x: 0, y: 0 };
    return {
      x: Math.sin(this.animationClock * 18.7) * amount,
      y: Math.cos(this.animationClock * 13.1) * amount * 0.55
    };
  }

  private cutRadialLight(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, strength: number): void {
    const gradient = ctx.createRadialGradient(x, y, 8, x, y, radius);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${clamp(strength, 0, 1)})`);
    gradient.addColorStop(0.52, `rgba(255, 255, 255, ${clamp(strength * 0.42, 0, 1)})`);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private cutFlashlightBeam(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    angle: number,
    range: number,
    spread: number
  ): void {
    this.cutRadialLight(ctx, originX, originY, 42, 0.34);
    this.cutConeLight(ctx, originX, originY, angle, range, spread, 0.58);
    this.cutConeLight(ctx, originX, originY, angle, range * 0.62, spread * 0.48, 0.8);
  }

  private cutConeLight(
    ctx: CanvasRenderingContext2D,
    originX: number,
    originY: number,
    angle: number,
    range: number,
    spread: number,
    strength: number
  ): void {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const perpX = -dirY;
    const perpY = dirX;
    const endX = originX + dirX * range;
    const endY = originY + dirY * range;
    const gradient = ctx.createLinearGradient(originX, originY, endX, endY);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${clamp(strength, 0, 1)})`);
    gradient.addColorStop(0.72, `rgba(255, 255, 255, ${clamp(strength * 0.32, 0, 1)})`);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(endX + perpX * spread, endY + perpY * spread);
    ctx.lineTo(endX - perpX * spread, endY - perpY * spread);
    ctx.closePath();
    ctx.fill();
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
    if (!this.darknessCtx) {
      throw new Error("Failed to create darkness mask context.");
    }
    return this.darknessCtx;
  }

  private renderDiveHud(player: DivePlayer): void {
    const { renderer } = this.services;
    const hudJitter = this.hudJitter(player);
    renderer.ctx.save();
    renderer.ctx.translate(hudJitter.x, hudJitter.y);
    const mission = this.currentMission();
    const contract = this.activeContract();
    const site = this.activeDiveSite();
    const depth = this.depthFromWorldY(player.y);
    const stats = buildDiveStats(this.progress.equipment, player.tanks);
    const gasPlan = assessGasPlan(depth, player.tanks);
    const decoStopDepth = recommendedDecoStopDepth(player.decoLoad);
    const gasPercent = player.maxTankGas > 0 ? player.tankGas / player.maxTankGas : 0;
    const gasColor = gasPercent < 0.22 ? "#ff736b" : gasPercent < 0.45 ? "#f0c86f" : "#8be6d4";
    const depthText = this.depthReadout(depth, stats);
    const targetText = this.targetDepthReadout(mission.targetDepth, stats);
    const rateText = stats.exactDepthGauge ? this.depthRateReadout(player.depthRateMetersPerMinute) : null;
    const pressureLineCount = stats.exactDepthGauge ? 3 : stats.hasDepthGauge ? 1 : 0;
    const pressureStartY = rateText ? 184 : 156;
    const recordY = pressureStartY + pressureLineCount * 24 + (pressureLineCount > 0 ? 10 : 0);
    const computerPanelHeight = recordY + 36;
    const objective = player.reachedTarget ? "Return to surface" : `Find ${targetText}`;
    const pendingFunding = this.pendingExpeditionFunding(player);
    const newDiscoveries = player.newMappedSiteCells.size + player.newDiscoveredLandmarkIds.size;
    const carriedTanks = player.tanks.filter((tank) => !tank.dropped).length;
    const tankWeightLoad = this.carriedTankWeight(player.tanks);
    const ambientLabel = this.ambientLabelAtDepth(depth);
    const lightStatus = stats.hasFlashlight ? (player.flashlightOn ? "on (F)" : "off (F)") : "none";
    const lightColor = !stats.hasFlashlight ? UI.muted : player.flashlightOn ? UI.ok : UI.warn;
    const batteryPercent = player.maxFlashlightBattery > 0 ? player.flashlightBattery / player.maxFlashlightBattery : 0;
    const batteryColor = batteryPercent <= 0.12 ? UI.danger : batteryPercent <= FLASHLIGHT_LOW_BATTERY_RATIO ? UI.warn : UI.ok;
    const lifelineCapacity = stats.lifelineLengthMeters;
    const lifelineUsed = Math.round(player.lifelineLengthUsed / PIXELS_PER_METER);
    const lifelineColor = !stats.hasLifeline
      ? UI.muted
      : player.lifelineFollowActive
        ? UI.ok
        : player.lifelineDeployed
          ? UI.text
          : UI.warn;
    const sedimentLabel =
      player.sedimentCloud > 0.68 ? "opaque" : player.sedimentCloud > 0.38 ? "clouded" : player.sedimentCloud > 0.16 ? "hazy" : "clear";
    const sedimentColor =
      player.sedimentCloud > 0.68 ? UI.danger : player.sedimentCloud > 0.38 ? UI.warn : player.sedimentCloud > 0.16 ? UI.text : UI.ok;

    drawInstrumentPanel(renderer, 24, 22, 382, computerPanelHeight, "DIVE COMPUTER");
    renderer.text(
      player.maxTankGas > 0 ? `${stats.gasLabel} ${Math.max(0, player.tankGas).toFixed(0)}/${player.maxTankGas}` : "breath-hold air",
      44,
      70,
      {
      color: UI.title,
      font: "bold 17px Aptos, Segoe UI, sans-serif"
      }
    );
    if (player.maxTankGas > 0) {
      drawBar(renderer, 44, 84, 318, 18, player.tankGas, player.maxTankGas, gasColor);
    } else {
      renderer.rect(44, 84, 318, 18, "rgba(255,255,255,0.06)");
      renderer.strokeRect(44, 84, 318, 18, "rgba(168, 165, 132, 0.28)", 1);
      renderer.text("lungs hidden", 204, 98, {
        align: "center",
        color: UI.muted,
        font: "12px Aptos, Segoe UI, sans-serif"
      });
    }
    renderer.text(`Depth: ${depthText}`, 44, 126, {
      color: stats.hasDepthGauge ? (stats.exactDepthGauge ? UI.ok : UI.text) : UI.muted,
      font: "bold 19px Aptos, Segoe UI, sans-serif"
    });
    if (rateText) {
      renderer.text(`Rate: ${rateText}`, 44, 156, {
        color: UI.text,
        font: "15px Aptos, Segoe UI, sans-serif"
      });
    }
    if (stats.exactDepthGauge) {
      renderer.text(`Deco: ${Math.round(player.decoLoad)}% ${decoStopDepth > 0 ? `stop ${decoStopDepth}m` : "clear"}`, 44, pressureStartY, {
        color: player.decoStress > 45 || decoStopDepth > 0 ? UI.warn : UI.ok,
        font: "15px Aptos, Segoe UI, sans-serif"
      });
      renderer.text(`Gas: ${gasPlan.advice}`, 44, pressureStartY + 24, {
        color: gasPlan.isWrongGas ? UI.danger : UI.text,
        font: "15px Aptos, Segoe UI, sans-serif"
      });
      renderer.text(`Narcosis: ${Math.round(player.narcosis)}%`, 44, pressureStartY + 48, {
        color: player.narcosis > 55 ? UI.warn : UI.text,
        font: "15px Aptos, Segoe UI, sans-serif"
      });
    } else if (stats.hasDepthGauge) {
      const warning = player.decoLoad > 35 || player.narcosis > 45 || gasPlan.isWrongGas ? "Pressure risk: slow ascent" : "Pressure risk: low";
      renderer.text(warning, 44, pressureStartY, {
        color: warning.includes("slow") ? UI.warn : UI.text,
        font: "15px Aptos, Segoe UI, sans-serif"
      });
    }
    renderer.text(`Record: ${objective}`, 44, recordY, {
      color: player.reachedTarget ? UI.ok : UI.warn,
      font: "15px Aptos, Segoe UI, sans-serif"
    });

    drawInstrumentPanel(renderer, 874, 22, 382, 432, "EXPEDITION");
    renderer.text(`${site.shortName}: target ${targetText}`, 894, 68, {
      color: UI.warn,
      font: "bold 19px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Banked: $${this.progress.money}`, 894, 98, {
      color: UI.ok,
      font: "16px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Dive: $${pendingFunding} pending`, 894, 126, {
      color: pendingFunding > 0 ? UI.warn : UI.muted,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`New finds: ${newDiscoveries}`, 894, 154, {
      color: newDiscoveries > 0 ? UI.ok : UI.muted,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Tanks: ${carriedTanks}/${player.tanks.length} carried`, 894, 182, {
      color: carriedTanks > 0 ? UI.text : UI.muted,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Weight: ${tankWeightLoad.toFixed(1)}kg`, 894, 210, {
      color: tankWeightLoad > 22 ? UI.warn : UI.text,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Ambient: ${ambientLabel}`, 894, 238, {
      color: ambientLabel === "bright" ? UI.ok : ambientLabel === "black" ? UI.danger : UI.text,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Light: ${lightStatus}`, 894, 266, {
      color: lightColor,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(
      `Battery: ${
        player.maxFlashlightBattery > 0
          ? `${Math.max(0, Math.round(player.flashlightBattery))}/${player.maxFlashlightBattery}`
          : "none"
      }`,
      894,
      294,
      {
        color: player.maxFlashlightBattery > 0 ? batteryColor : UI.muted,
        font: "15px Aptos, Segoe UI, sans-serif"
      }
    );
    if (player.maxFlashlightBattery > 0) {
      drawBar(renderer, 894, 304, 320, 10, player.flashlightBattery, player.maxFlashlightBattery, batteryColor);
    }
    renderer.text(
      `Line: ${
        stats.hasLifeline
          ? player.lifelineDeployed
            ? `${lifelineUsed}/${lifelineCapacity}m${player.lifelineFollowActive ? " follow" : ""}`
            : `${lifelineCapacity}m ready (L)`
          : "none"
      }`,
      894,
      334,
      {
        color: lifelineColor,
        font: "15px Aptos, Segoe UI, sans-serif"
      }
    );
    renderer.text(`Caches: ${player.cachedTanks.length} tank${player.cachedTanks.length === 1 ? "" : "s"} staged`, 894, 362, {
      color: player.cachedTanks.length > 0 ? UI.warn : UI.muted,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(
      `Contract: ${
        contract ? (player.completedContractId === contract.id ? "complete, return" : this.contractHudObjective(contract)) : "none"
      }`,
      894,
      390,
      {
        color: contract ? (player.completedContractId === contract.id ? UI.ok : contract.darkEvent ? "#d5bab0" : UI.warn) : UI.muted,
        font: "15px Aptos, Segoe UI, sans-serif"
      }
    );
    renderer.text(`Sediment: ${sedimentLabel}${stats.hasSonar ? " (sonar)" : ""}`, 894, 418, {
      color: sedimentColor,
      font: "15px Aptos, Segoe UI, sans-serif"
    });

    this.renderMessageBar();
    renderer.text("WASD/Arrows move  F light  Q drop  L line  H follow  C cache/recover  M/V audio  Surface: Enter/Esc", renderer.width * 0.5, renderer.height - 8, {
      align: "center",
      color: "#89aeba",
      font: "13px Trebuchet MS"
    });
    renderer.ctx.restore();
  }

  private renderEquipmentSummary(x: number, y: number): void {
    const { renderer } = this.services;
    const stats: DiveStats = buildDiveStats(this.progress.equipment, this.progress.tanks);
    const tankFill = this.totalTankFill(this.progress.tanks);
    const tankCapacity = this.totalTankCapacity(this.progress.tanks);
    const tankWeightLoad = this.carriedTankWeight(this.progress.tanks);
    const batteryCapacity = flashlightBatteryCapacity(this.progress.equipment);
    const batteryCharge = clamp(this.progress.flashlightBattery, 0, batteryCapacity);
    drawInstrumentPanel(renderer, x, y, 384, 406, "CURRENT RIG");
    renderer.text(`Breathing: ${stats.gasLabel}`, x + 24, y + 60, {
      color: UI.text,
      font: "17px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Tank gas: ${tankCapacity > 0 ? `${Math.round(tankFill)}/${tankCapacity}` : "none"}`, x + 24, y + 92, {
      color: UI.text,
      font: "17px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Tank load: ${tankWeightLoad.toFixed(1)}kg`, x + 24, y + 124, {
      color: tankWeightLoad > 22 ? UI.warn : UI.text,
      font: "17px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Propulsion: ${stats.hasDpv ? `DPV ${stats.swimSpeed}px/s` : stats.hasFins ? `${stats.swimSpeed}px/s` : "none"}`, x + 24, y + 156, {
      color: UI.text,
      font: "17px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Light: ${stats.hasFlashlight ? `${stats.lightRadius}px` : "none"}`, x + 24, y + 188, {
      color: UI.text,
      font: "17px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Battery: ${batteryCapacity > 0 ? `${Math.round(batteryCharge)}/${batteryCapacity}` : "none"}`, x + 24, y + 220, {
      color: batteryCapacity > 0 && batteryCharge / batteryCapacity <= FLASHLIGHT_LOW_BATTERY_RATIO ? UI.warn : UI.text,
      font: "17px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(`Tank slots: ${this.progress.tanks.length}`, x + 24, y + 252, {
      color: UI.text,
      font: "17px Aptos, Segoe UI, sans-serif"
    });
    renderer.text(
      stats.hasDepthGauge ? (stats.exactDepthGauge ? "Computer: deco/gas" : "Depth: coarse") : "Depth: no gauge",
      x + 24,
      y + 284,
      {
        color: stats.exactDepthGauge ? UI.ok : UI.muted,
        font: "17px Aptos, Segoe UI, sans-serif"
      }
    );
    renderer.text(`Lifeline: ${stats.hasLifeline ? `${stats.lifelineLengthMeters}m spool` : "none"}`, x + 24, y + 316, {
      color: stats.hasLifeline ? UI.ok : UI.muted,
      font: "17px Aptos, Segoe UI, sans-serif"
    });

    const preview: DivePlayer = {
      x: x + 192,
      y: this.cameraY + y + 362,
      tanks: this.progress.tanks.map((tank) => ({ ...tank, dropped: false })),
      tankGas: tankFill,
      maxTankGas: tankCapacity,
      lungOxygen: stats.maxLungOxygen,
      maxLungOxygen: stats.maxLungOxygen,
      swimSpeed: stats.swimSpeed,
      lightRadius: stats.lightRadius,
      backupGas: stats.backupOxygen,
      backupUsed: false,
      reachedTarget: false,
      maxDepth: 0,
      depthRateMetersPerMinute: 0,
      decoLoad: 0,
      decoStress: 0,
      decoPulse: 0,
      decoWarned: false,
      narcosis: 0,
      narcosisPulse: 0,
      narcosisWarned: false,
      narcosisIncidentClock: 0,
      gasWarned: false,
      toxicityClock: 0,
      expeditionFunding: 0,
      explorationFunding: 0,
      mappingFunding: 0,
      landmarkFunding: 0,
      activeExplorationSeconds: 0,
      newMappedDepthBands: new Set<number>(),
      newMappedSiteCells: new Set<string>(),
      newDiscoveredLandmarkIds: new Set<string>(),
      completedContractId: null,
      darkContractFound: false,
      sedimentCloud: 0,
      sedimentWarned: false,
      facing: 1,
      swimIntentX: 0,
      swimIntentY: 0,
      motionIntensity: 0.26,
      kickPhase: this.animationClock * 2.1,
      visualPitch: Math.sin(this.animationClock * 0.92) * 0.04,
      elapsed: 0,
      surfacePromptVisible: false,
      surfacePromptArmed: false,
      lungFlashClock: 0,
      lungFlashCount: 0,
      lungFlashPulse: 0,
      flashlightOn: stats.hasFlashlight && batteryCharge > 0,
      flashlightBattery: batteryCharge,
      maxFlashlightBattery: batteryCapacity,
      flashlightLowWarned: false,
      tankLowWarned: false,
      lifelineDeployed: false,
      lifelinePoints: [],
      lifelineLengthUsed: 0,
      lifelineFollowActive: false,
      lifelineLimitWarned: false,
      cachedTanks: [],
      nextCacheId: 1
    };
    this.renderDiver(preview);
  }

  private renderMessageBar(): void {
    const { renderer } = this.services;
    renderer.rect(0, renderer.height - 64, renderer.width, 64, "rgba(4, 7, 7, 0.84)");
    renderer.strokeRect(18, renderer.height - 52, renderer.width - 36, 34, "rgba(168, 165, 132, 0.26)", 1);
    renderer.text(this.message, renderer.width * 0.5, renderer.height - 30, {
      align: "center",
      color: UI.text,
      font: "15px Aptos, Segoe UI, sans-serif"
    });
  }

  private playerScreenPoint(player: DivePlayer): { x: number; y: number } {
    return {
      x: player.x,
      y: player.y - this.cameraY
    };
  }

  private depthFromWorldY(y: number): number {
    return clamp(y / PIXELS_PER_METER, 0, this.activeDiveSite().maxDepth);
  }

  private isAtSurface(depth: number): boolean {
    return depth <= SURFACE_EXIT_DEPTH_METERS;
  }

  private activeWorldMaxY(): number {
    return this.activeDiveSite().maxDepth * PIXELS_PER_METER;
  }

  private cameraTargetYFor(player: DivePlayer): number {
    const maxCameraY = Math.max(-110, this.activeWorldMaxY() - this.services.renderer.height + 180);
    return clamp(player.y - this.services.renderer.height * 0.46, -110, maxCameraY);
  }

  private siteEntryX(site = this.activeDiveSite()): number {
    if (site.geometry === "open-basin") return CAVE_CENTER_X - 18;
    if (site.geometry === "side-passage") return CAVE_CENTER_X + 54;
    return CAVE_CENTER_X;
  }

  private caveCenterAtDepth(depth: number, site = this.activeDiveSite()): number {
    if (site.geometry === "side-passage") {
      const lateral = clamp((depth - 28) / 104, 0, 1);
      return CAVE_CENTER_X + 48 + lateral * 92 + Math.sin(depth * 0.052) * 46;
    }
    if (site.geometry === "open-basin") {
      return CAVE_CENTER_X - 18 + Math.sin(depth * 0.036 + 1.8) * 26;
    }
    return CAVE_CENTER_X + Math.sin(depth * 0.18) * 18 + Math.sin(depth * 0.047 + 2.1) * 22;
  }

  private caveBoundsAtDepth(depth: number): { left: number; right: number } {
    const site = this.activeDiveSite();
    const center = this.caveCenterAtDepth(depth, site);
    let halfWidth = BASE_CAVE_HALF_WIDTH + Math.sin(depth * 0.11 + 1.4) * 18;
    if (site.geometry === "side-passage") {
      halfWidth = 176 + Math.sin(depth * 0.15 + 0.8) * 24;
      if (depth > 44 && depth < 88) halfWidth += 42;
      if (site.hasHiddenChamber && depth > 108 && depth < 132) halfWidth += 62;
    } else if (site.geometry === "open-basin") {
      halfWidth = 338 + Math.sin(depth * 0.07) * 28;
    }
    return {
      left: center - halfWidth,
      right: center + halfWidth
    };
  }

  private hash01(index: number, salt: number): number {
    let value = Math.imul(index + 101, 0x45d9f3b) ^ Math.imul(salt + 17, 0x27d4eb2d);
    value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
    value = (value ^ (value >>> 13)) >>> 0;
    return value / 4294967296;
  }
}
