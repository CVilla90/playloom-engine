export const PIXELS_PER_METER = 16;
export const CAVE_MAX_DEPTH_METERS = 339;
export const SURFACE_EXIT_DEPTH_METERS = 0.7;

export interface MissionDefinition {
  readonly id: string;
  readonly title: string;
  readonly targetDepth: number;
  readonly reward: number;
  readonly briefing: string;
}

export interface LandmarkDefinition {
  readonly id: string;
  readonly siteId?: string;
  readonly name: string;
  readonly depth: number;
  readonly reward: number;
  readonly description: string;
}

export type DiveSiteGeometry = "vertical-shaft" | "side-passage" | "open-basin";

export interface DiveSiteDefinition {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly geometry: DiveSiteGeometry;
  readonly maxDepth: number;
  readonly summary: string;
  readonly riskHint: string;
  readonly rewardMultiplier: number;
  readonly sedimentIntensity: number;
  readonly unlockDepth?: number;
  readonly hasHiddenChamber?: boolean;
  readonly hasSensorRoute?: boolean;
  readonly atmosphericWildlife?: boolean;
}

export type ContractKind = "map-depth" | "place-sensor" | "recover-instrument" | "photograph-landmark" | "quiet-recovery";

export interface ContractDefinition {
  readonly id: string;
  readonly contractor: string;
  readonly title: string;
  readonly objective: string;
  readonly flavor: string;
  readonly riskHint: string;
  readonly reward: number;
  readonly kind: ContractKind;
  readonly targetDepth: number;
  readonly targetLandmarkId?: string;
  readonly darkEvent?: boolean;
}

export type TankKind = "single" | "twin" | "pony";
export type GasMix = "air" | "trimix";

export interface TankDefinition {
  readonly kind: TankKind;
  readonly name: string;
  readonly gasMix: GasMix;
  readonly capacity: number;
  readonly emptyWeight: number;
  readonly fullWeight: number;
  readonly buyCost: number;
  readonly refillCost: number;
}

export interface TankState {
  readonly id: string;
  readonly kind: TankKind;
  readonly gasMix: GasMix;
  readonly fill: number;
  readonly dropped: boolean;
}

export interface GasPlanAssessment {
  readonly activeGasMix: GasMix;
  readonly recommendedGasMix: GasMix;
  readonly isWrongGas: boolean;
  readonly narcosisRisk: number;
  readonly toxicityRisk: number;
  readonly advice: string;
}

export const MISSIONS: readonly MissionDefinition[] = [
  {
    id: "mission-20m",
    title: "Survey Shelf",
    targetDepth: 20,
    reward: 140,
    briefing: "Reach the first marked shelf and return on breath-hold air. It is possible, but the margin is thin."
  },
  {
    id: "mission-40m",
    title: "Thermocline Drop",
    targetDepth: 40,
    reward: 230,
    briefing: "Drop past the dim thermocline band and make a disciplined ascent."
  },
  {
    id: "mission-60m",
    title: "Black Bell",
    targetDepth: 60,
    reward: 360,
    briefing: "Touch the lower bell and return alive. Better instruments and gas make this much safer."
  }
] as const;

export const MAPPING_BAND_METERS = 10;
export const DEFAULT_DIVE_SITE_ID = "zacaton-shaft";

export const DIVE_SITES: readonly DiveSiteDefinition[] = [
  {
    id: DEFAULT_DIVE_SITE_ID,
    name: "Zacaton Main Shaft",
    shortName: "Zacaton",
    geometry: "vertical-shaft",
    maxDepth: CAVE_MAX_DEPTH_METERS,
    summary: "The focused deep vertical sinkhole route. This remains the primary map.",
    riskHint: "Deep gas, darkness, deco discipline, and line planning still matter most here.",
    rewardMultiplier: 1,
    sedimentIntensity: 0.72,
    hasSensorRoute: true
  },
  {
    id: "limestone-side-passage",
    name: "Limestone Side Passage",
    shortName: "Side Passage",
    geometry: "side-passage",
    maxDepth: 156,
    summary: "A lateral cave route with narrower shoulders, hidden pockets, and heavier silt.",
    riskHint: "Sediment clouds and walls punish fast, careless swimming.",
    rewardMultiplier: 1.12,
    sedimentIntensity: 1,
    unlockDepth: 60,
    hasHiddenChamber: true,
    hasSensorRoute: true
  },
  {
    id: "open-basin-transect",
    name: "Open Basin Transect",
    shortName: "Open Basin",
    geometry: "open-basin",
    maxDepth: 86,
    summary: "A wider open-water survey route for sensors, visibility, and non-combat wildlife atmosphere.",
    riskHint: "Less overhead restriction, but poor visibility can still break orientation.",
    rewardMultiplier: 0.86,
    sedimentIntensity: 0.38,
    unlockDepth: 30,
    atmosphericWildlife: true
  }
] as const;

export const TANK_DEFINITIONS: readonly TankDefinition[] = [
  {
    kind: "single",
    name: "Single cylinder",
    gasMix: "air",
    capacity: 155,
    emptyWeight: 8,
    fullWeight: 16,
    buyCost: 90,
    refillCost: 18
  },
  {
    kind: "twin",
    name: "Twin set",
    gasMix: "air",
    capacity: 270,
    emptyWeight: 18,
    fullWeight: 34,
    buyCost: 180,
    refillCost: 32
  },
  {
    kind: "pony",
    name: "Reserve pony",
    gasMix: "air",
    capacity: 60,
    emptyWeight: 5,
    fullWeight: 8,
    buyCost: 170,
    refillCost: 12
  }
] as const;

export const LANDMARKS: readonly LandmarkDefinition[] = [
  {
    id: "root-curtain",
    siteId: DEFAULT_DIVE_SITE_ID,
    name: "Root Curtain",
    depth: 16,
    reward: 42,
    description: "A shallow curtain of roots fading into the blue light."
  },
  {
    id: "thermocline-mirror",
    siteId: DEFAULT_DIVE_SITE_ID,
    name: "Thermocline Mirror",
    depth: 38,
    reward: 58,
    description: "A wavering density layer that makes the shaft look split in two."
  },
  {
    id: "limestone-cathedral",
    siteId: DEFAULT_DIVE_SITE_ID,
    name: "Limestone Cathedral",
    depth: 74,
    reward: 76,
    description: "A wide pale wall section with shelves and mineral scars."
  },
  {
    id: "black-ledge",
    siteId: DEFAULT_DIVE_SITE_ID,
    name: "Black Ledge",
    depth: 132,
    reward: 98,
    description: "A narrow ledge where natural light has almost completely failed."
  },
  {
    id: "silent-bell",
    siteId: DEFAULT_DIVE_SITE_ID,
    name: "Silent Bell",
    depth: 214,
    reward: 130,
    description: "A bell-shaped void that absorbs the last useful ambient glow."
  },
  {
    id: "zacaton-floor-plume",
    siteId: DEFAULT_DIVE_SITE_ID,
    name: "Floor Plume",
    depth: 332,
    reward: 190,
    description: "The deep floor region where the shaft becomes sediment and black water."
  },
  {
    id: "side-passage-window",
    siteId: "limestone-side-passage",
    name: "Side Passage Window",
    depth: 66,
    reward: 88,
    description: "A pale lateral opening where the main wall bends into a low chamber."
  },
  {
    id: "silted-sensor-bend",
    siteId: "limestone-side-passage",
    name: "Silted Sensor Bend",
    depth: 118,
    reward: 118,
    description: "A quiet bend where old sensor tape disappears under fine suspended silt."
  },
  {
    id: "basin-light-columns",
    siteId: "open-basin-transect",
    name: "Basin Light Columns",
    depth: 28,
    reward: 44,
    description: "Open-water light shafts broken by faint drifting life."
  },
  {
    id: "basin-thermistor-line",
    siteId: "open-basin-transect",
    name: "Thermistor Line",
    depth: 68,
    reward: 72,
    description: "A simple sensor line stretched across the wider basin route."
  }
] as const;

export const CONTRACTS: readonly ContractDefinition[] = [
  {
    id: "ledge-sketch-52m",
    contractor: "UACH Hydrogeology",
    title: "Map the Broken Ledge",
    objective: "Reach the broken ledge band near 52m and return with a route note.",
    flavor: "A new sonar shadow suggests the wall opens briefly below the thermocline.",
    riskHint: "Short dive, but careless ascent still builds pressure risk.",
    reward: 165,
    kind: "map-depth",
    targetDepth: 52
  },
  {
    id: "sensor-78m",
    contractor: "Municipal Water Lab",
    title: "Place Conductivity Sensor",
    objective: "Touch 78m to stage a sensor package, then return safely.",
    flavor: "The lab wants a quiet reading below the pale limestone cathedral.",
    riskHint: "Bring enough gas to pause shallow on the way back.",
    reward: 240,
    kind: "place-sensor",
    targetDepth: 78
  },
  {
    id: "lost-gauge-96m",
    contractor: "Independent Surveyor",
    title: "Recover Lost Gauge",
    objective: "Reach the instrument trace around 96m and recover the gauge.",
    flavor: "The surveyor says the gauge went dark while the line was still moving upward.",
    riskHint: "Deep air will feel wrong; trimix planning helps.",
    reward: 315,
    kind: "recover-instrument",
    targetDepth: 96
  },
  {
    id: "photo-black-ledge",
    contractor: "Karst Archive",
    title: "Photograph Black Ledge",
    objective: "Find the Black Ledge landmark and return with a still image.",
    flavor: "The archive wants a clean record before sediment shifts again.",
    riskHint: "The landmark sits where natural light is almost gone.",
    reward: 355,
    kind: "photograph-landmark",
    targetDepth: 132,
    targetLandmarkId: "black-ledge"
  },
  {
    id: "quiet-recovery-118m",
    contractor: "Park Liaison",
    title: "Quiet Recovery",
    objective: "Locate a silent marker near 118m and return with the attached tag.",
    flavor: "No broadcast, no spectacle. Just bring back the tag and close the report.",
    riskHint: "Rare dark recovery. Non-gory, deep enough to demand discipline.",
    reward: 420,
    kind: "quiet-recovery",
    targetDepth: 118,
    darkEvent: true
  }
] as const;

export type UpgradeCategoryId = "gas" | "light" | "propulsion" | "instruments" | "safety";
export type UpgradeId =
  | "basic-tank"
  | "larger-tank"
  | "backup-tank"
  | "trimix-training"
  | "handheld-light"
  | "better-flashlight"
  | "wide-beam-filter"
  | "rubber-fins"
  | "better-fins"
  | "diver-propulsion-vehicle"
  | "basic-depth-gauge"
  | "depth-gauge"
  | "mapping-slate"
  | "compact-sonar"
  | "survey-sensor-kit"
  | "lifeline-spool"
  | "longer-lifeline";

export interface UpgradeCategoryDefinition {
  readonly id: UpgradeCategoryId;
  readonly name: string;
  readonly summary: string;
}

export interface UpgradeDefinition {
  readonly id: UpgradeId;
  readonly category: UpgradeCategoryId;
  readonly name: string;
  readonly cost: number;
  readonly effect: string;
}

export const UPGRADE_CATEGORIES: readonly UpgradeCategoryDefinition[] = [
  {
    id: "gas",
    name: "Gas",
    summary: "Breath-hold, air cylinders, reserve gas, and deep gas planning."
  },
  {
    id: "light",
    name: "Light",
    summary: "From no torch to stronger beam control in dark water."
  },
  {
    id: "propulsion",
    name: "Propulsion",
    summary: "Bare feet, starter fins, technical fins, and low-silt scooter movement."
  },
  {
    id: "instruments",
    name: "Instruments",
    summary: "Depth readability and planning confidence."
  },
  {
    id: "safety",
    name: "Safety",
    summary: "Lifeline reels, route finding, and recoverable tank caches."
  }
] as const;

export const UPGRADES: readonly UpgradeDefinition[] = [
  {
    id: "basic-tank",
    category: "gas",
    name: "Single air cylinder",
    cost: 90,
    effect: "Adds a visible air cylinder and 155 gas units over breath-hold air."
  },
  {
    id: "larger-tank",
    category: "gas",
    name: "Twin air set",
    cost: 180,
    effect: "Adds a high-capacity twin set with 270 gas units as a separate carried slot."
  },
  {
    id: "backup-tank",
    category: "gas",
    name: "Reserve pony bottle",
    cost: 170,
    effect: "Adds a 60-unit reserve pony bottle as a separate carried tank slot."
  },
  {
    id: "trimix-training",
    category: "gas",
    name: "Trimix planning",
    cost: 260,
    effect: "Prototype simplification: reduces the depth consumption penalty on deep dives."
  },
  {
    id: "handheld-light",
    category: "light",
    name: "Handheld flashlight",
    cost: 70,
    effect: "Adds a visible flashlight beam with a basic rechargeable battery."
  },
  {
    id: "better-flashlight",
    category: "light",
    name: "Better flashlight",
    cost: 120,
    effect: "Adds 80px of light radius, a longer beam, and a longer battery."
  },
  {
    id: "wide-beam-filter",
    category: "light",
    name: "Wide beam filter",
    cost: 150,
    effect: "Adds a wider close-range pool of visibility and a modest battery boost."
  },
  {
    id: "rubber-fins",
    category: "propulsion",
    name: "Rubber fins",
    cost: 70,
    effect: "Adds starter fins and 10px/s swim speed."
  },
  {
    id: "better-fins",
    category: "propulsion",
    name: "Better fins",
    cost: 130,
    effect: "Swaps in longer technical fins and adds another 16px/s swim speed."
  },
  {
    id: "diver-propulsion-vehicle",
    category: "propulsion",
    name: "Diver propulsion vehicle",
    cost: 340,
    effect: "Adds a compact DPV scooter for the best movement speed and less fin-kick sediment."
  },
  {
    id: "basic-depth-gauge",
    category: "instruments",
    name: "Analog depth gauge",
    cost: 60,
    effect: "Shows coarse depth instead of guesswork and adds a visible wrist gauge."
  },
  {
    id: "depth-gauge",
    category: "instruments",
    name: "Digital depth computer",
    cost: 150,
    effect: "Shows exact depth, ascent rate, decompression load, and gas mix advice."
  },
  {
    id: "mapping-slate",
    category: "instruments",
    name: "Survey mapping slate",
    cost: 130,
    effect: "Turns rough depth-band notes into formal site map cells and improves mapping payouts."
  },
  {
    id: "compact-sonar",
    category: "instruments",
    name: "Compact sonar",
    cost: 240,
    effect: "Highlights branches and hidden chambers while reducing sediment visibility penalties."
  },
  {
    id: "survey-sensor-kit",
    category: "instruments",
    name: "Survey sensor kit",
    cost: 220,
    effect: "Adds route-sensor notation for new maps and improves formal survey rewards."
  },
  {
    id: "lifeline-spool",
    category: "safety",
    name: "Lifeline spool",
    cost: 120,
    effect: "Deploys a 120m guideline from the entry, enables route-home following, and allows tank caches."
  },
  {
    id: "longer-lifeline",
    category: "safety",
    name: "Line extension reel",
    cost: 170,
    effect: "Extends the deployed guideline to 260m for deeper staging and tank recovery."
  }
] as const;

export interface EquipmentState {
  readonly basicTank: boolean;
  readonly largerTank: boolean;
  readonly backupTank: boolean;
  readonly trimixTraining: boolean;
  readonly handheldLight: boolean;
  readonly betterFlashlight: boolean;
  readonly wideBeamFilter: boolean;
  readonly rubberFins: boolean;
  readonly betterFins: boolean;
  readonly diverPropulsionVehicle: boolean;
  readonly basicDepthGauge: boolean;
  readonly depthGauge: boolean;
  readonly mappingSlate: boolean;
  readonly compactSonar: boolean;
  readonly surveySensorKit: boolean;
  readonly lifelineSpool: boolean;
  readonly longerLifeline: boolean;
}

export interface SettingsState {
  readonly musicEnabled: boolean;
  readonly sfxEnabled: boolean;
}

export interface ProgressState {
  readonly money: number;
  readonly activeMissionIndex: number;
  readonly completedMissionIds: readonly string[];
  readonly mappedDepthBands: readonly number[];
  readonly discoveredLandmarkIds: readonly string[];
  readonly activeContractId: string | null;
  readonly completedContractIds: readonly string[];
  readonly selectedDiveSiteId: string;
  readonly mappedSiteCells: readonly string[];
  readonly tanks: readonly TankState[];
  readonly nextTankId: number;
  readonly flashlightBattery: number;
  readonly settings: SettingsState;
  readonly equipment: EquipmentState;
}

export interface DiveStats {
  readonly maxOxygen: number;
  readonly maxTankGas: number;
  readonly maxLungOxygen: number;
  readonly swimSpeed: number;
  readonly lightRadius: number;
  readonly lightConeRange: number;
  readonly lightConeSpread: number;
  readonly backupOxygen: number;
  readonly hasTank: boolean;
  readonly carriedTankWeight: number;
  readonly hasFlashlight: boolean;
  readonly hasFins: boolean;
  readonly hasDpv: boolean;
  readonly hasDepthGauge: boolean;
  readonly exactDepthGauge: boolean;
  readonly hasMappingSlate: boolean;
  readonly hasSonar: boolean;
  readonly hasSurveySensors: boolean;
  readonly hasLifeline: boolean;
  readonly lifelineLengthMeters: number;
  readonly sedimentResistance: number;
  readonly pressureDrainMultiplier: number;
  readonly gasLabel: string;
}

export const DEFAULT_EQUIPMENT: EquipmentState = {
  basicTank: false,
  largerTank: false,
  backupTank: false,
  trimixTraining: false,
  handheldLight: false,
  betterFlashlight: false,
  wideBeamFilter: false,
  rubberFins: false,
  betterFins: false,
  diverPropulsionVehicle: false,
  basicDepthGauge: false,
  depthGauge: false,
  mappingSlate: false,
  compactSonar: false,
  surveySensorKit: false,
  lifelineSpool: false,
  longerLifeline: false
};

export function lifelineLengthCapacity(equipment: EquipmentState): number {
  if (!equipment.lifelineSpool && !equipment.longerLifeline) return 0;
  return equipment.longerLifeline ? 260 : 120;
}

export function recommendedGasMixForDepth(depth: number): GasMix {
  return depth >= 65 ? "trimix" : "air";
}

export function activeBreathingGas(tanks?: readonly TankState[]): GasMix {
  const carried = tanks?.filter((tank) => !tank.dropped && tank.fill > 0) ?? [];
  if (carried.length === 0) return "air";
  const active = [...carried].sort((a, b) => {
    if (a.kind === "pony" && b.kind !== "pony") return 1;
    if (a.kind !== "pony" && b.kind === "pony") return -1;
    return b.fill - a.fill;
  })[0];
  return active?.gasMix ?? "air";
}

export function assessGasPlan(depth: number, tanks?: readonly TankState[]): GasPlanAssessment {
  const activeGasMix = activeBreathingGas(tanks);
  const recommendedGasMix = recommendedGasMixForDepth(depth);
  const isWrongGas = activeGasMix !== recommendedGasMix;
  const deepAirPenalty = activeGasMix === "air" ? clamp01((depth - 55) / 95) : 0;
  const trimixRelief = activeGasMix === "trimix" ? 0.45 : 1;
  const narcosisRisk = clamp01(clamp01((depth - 35) / 145) * trimixRelief + deepAirPenalty * 0.42);
  const toxicityRisk = activeGasMix === "air" ? clamp01((depth - 90) / 135) : 0;
  const advice =
    recommendedGasMix === activeGasMix
      ? `${activeGasMix} ok`
      : recommendedGasMix === "trimix"
        ? "trimix advised"
        : "air advised";
  return {
    activeGasMix,
    recommendedGasMix,
    isWrongGas,
    narcosisRisk,
    toxicityRisk,
    advice
  };
}

export function decompressionLoadRate(depth: number): number {
  if (depth <= 24) return 0;
  return 0.32 + clamp01((depth - 24) / 130) * 1.18;
}

export function decompressionReliefRate(depth: number): number {
  if (depth <= 6) return 1.9;
  if (depth <= 12) return 1.55;
  if (depth <= 18) return 1.05;
  if (depth <= 24) return 0.35;
  return 0;
}

export function recommendedDecoStopDepth(decoLoad: number): number {
  if (decoLoad < 18) return 0;
  if (decoLoad < 42) return 6;
  if (decoLoad < 68) return 9;
  if (decoLoad < 88) return 12;
  return 18;
}

export const DEFAULT_SETTINGS: SettingsState = {
  musicEnabled: false,
  sfxEnabled: false
};

export function createDefaultProgress(): ProgressState {
  return {
    money: 0,
    activeMissionIndex: 0,
    completedMissionIds: [],
    mappedDepthBands: [],
    discoveredLandmarkIds: [],
    activeContractId: null,
    completedContractIds: [],
    selectedDiveSiteId: DEFAULT_DIVE_SITE_ID,
    mappedSiteCells: [],
    tanks: [],
    nextTankId: 1,
    flashlightBattery: 0,
    settings: { ...DEFAULT_SETTINGS },
    equipment: { ...DEFAULT_EQUIPMENT }
  };
}

export function tankDefinition(kind: TankKind): TankDefinition {
  return TANK_DEFINITIONS.find((definition) => definition.kind === kind) ?? TANK_DEFINITIONS[0]!;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function tankWeight(tank: TankState): number {
  const definition = tankDefinition(tank.kind);
  const fillRatio = clamp01(tank.fill / definition.capacity);
  return definition.emptyWeight + (definition.fullWeight - definition.emptyWeight) * fillRatio;
}

export function flashlightBatteryCapacity(equipment: EquipmentState): number {
  if (!equipment.handheldLight && !equipment.betterFlashlight && !equipment.wideBeamFilter) return 0;
  return 115 + (equipment.betterFlashlight ? 115 : 0) + (equipment.wideBeamFilter ? 35 : 0);
}

export function flashlightBatteryDrainPerSecond(equipment: EquipmentState): number {
  if (flashlightBatteryCapacity(equipment) <= 0) return 0;
  const efficiency = 1 + (equipment.betterFlashlight ? 0.45 : 0) + (equipment.wideBeamFilter ? 0.14 : 0);
  return 1 / efficiency;
}

export function flashlightRechargeCost(equipment: EquipmentState, currentCharge: number): number {
  const capacity = flashlightBatteryCapacity(equipment);
  const missing = Math.max(0, capacity - currentCharge);
  if (capacity <= 0 || missing <= 0) return 0;
  const fullRechargeCost = 14 + (equipment.betterFlashlight ? 13 : 0) + (equipment.wideBeamFilter ? 5 : 0);
  return Math.max(1, Math.ceil((missing / capacity) * fullRechargeCost));
}

export function buildDiveStats(equipment: EquipmentState, tanks?: readonly TankState[]): DiveStats {
  const maxLungOxygen = 100;
  const carriedTanks = tanks?.filter((tank) => !tank.dropped) ?? [];
  const hasRealTankInventory = tanks !== undefined;
  const maxTankGas = hasRealTankInventory
    ? carriedTanks.reduce((sum, tank) => sum + tankDefinition(tank.kind).capacity, 0)
    : (equipment.basicTank ? 155 : 0) + (equipment.largerTank ? 115 : 0) + (equipment.trimixTraining ? 50 : 0);
  const filledTankGas = hasRealTankInventory
    ? carriedTanks.reduce((sum, tank) => sum + Math.max(0, tank.fill), 0)
    : maxTankGas;
  const carriedTankWeight = hasRealTankInventory
    ? carriedTanks.reduce((sum, tank) => sum + tankWeight(tank), 0)
    : 0;
  const swimSpeed =
    50 +
    (equipment.rubberFins ? 10 : 0) +
    (equipment.betterFins ? 16 : 0) +
    (equipment.diverPropulsionVehicle ? 34 : 0);
  const lightRadius =
    76 +
    (equipment.handheldLight ? 54 : 0) +
    (equipment.betterFlashlight ? 80 : 0) +
    (equipment.wideBeamFilter ? 34 : 0);
  const lightConeRange = equipment.handheldLight ? 170 + (equipment.betterFlashlight ? 120 : 0) : 0;
  const lightConeSpread = equipment.handheldLight ? 38 + (equipment.wideBeamFilter ? 34 : 0) : 0;
  const gasLabel = hasRealTankInventory
    ? carriedTanks.length > 0
      ? carriedTanks.some((tank) => tank.gasMix === "trimix")
        ? "mixed gas"
        : "air cylinders"
      : "breath-hold"
    : equipment.trimixTraining
    ? "trimix plan"
    : equipment.largerTank
      ? "twin tanks"
      : equipment.basicTank
        ? "single tank"
        : "breath-hold";

  return {
    maxOxygen: maxTankGas > 0 ? maxTankGas : maxLungOxygen,
    maxTankGas: hasRealTankInventory ? filledTankGas : maxTankGas,
    maxLungOxygen,
    swimSpeed,
    lightRadius,
    lightConeRange,
    lightConeSpread,
    backupOxygen: hasRealTankInventory ? 0 : equipment.backupTank ? 60 : 0,
    hasTank: hasRealTankInventory ? carriedTanks.some((tank) => tank.fill > 0) : equipment.basicTank || equipment.largerTank,
    carriedTankWeight,
    hasFlashlight: equipment.handheldLight || equipment.betterFlashlight || equipment.wideBeamFilter,
    hasFins: equipment.rubberFins || equipment.betterFins || equipment.diverPropulsionVehicle,
    hasDpv: equipment.diverPropulsionVehicle,
    hasDepthGauge: equipment.basicDepthGauge || equipment.depthGauge,
    exactDepthGauge: equipment.depthGauge,
    hasMappingSlate: equipment.mappingSlate,
    hasSonar: equipment.compactSonar,
    hasSurveySensors: equipment.surveySensorKit,
    hasLifeline: equipment.lifelineSpool || equipment.longerLifeline,
    lifelineLengthMeters: lifelineLengthCapacity(equipment),
    sedimentResistance:
      (equipment.mappingSlate ? 0.12 : 0) +
      (equipment.compactSonar ? 0.32 : 0) +
      (equipment.surveySensorKit ? 0.18 : 0) +
      (equipment.diverPropulsionVehicle ? 0.28 : 0),
    pressureDrainMultiplier: equipment.trimixTraining ? 0.86 : 1,
    gasLabel
  };
}

export function isUpgradePurchased(equipment: EquipmentState, id: UpgradeId): boolean {
  switch (id) {
    case "basic-tank":
      return equipment.basicTank;
    case "larger-tank":
      return equipment.largerTank;
    case "backup-tank":
      return equipment.backupTank;
    case "trimix-training":
      return equipment.trimixTraining;
    case "handheld-light":
      return equipment.handheldLight;
    case "better-flashlight":
      return equipment.betterFlashlight;
    case "wide-beam-filter":
      return equipment.wideBeamFilter;
    case "rubber-fins":
      return equipment.rubberFins;
    case "better-fins":
      return equipment.betterFins;
    case "diver-propulsion-vehicle":
      return equipment.diverPropulsionVehicle;
    case "basic-depth-gauge":
      return equipment.basicDepthGauge;
    case "depth-gauge":
      return equipment.depthGauge;
    case "mapping-slate":
      return equipment.mappingSlate;
    case "compact-sonar":
      return equipment.compactSonar;
    case "survey-sensor-kit":
      return equipment.surveySensorKit;
    case "lifeline-spool":
      return equipment.lifelineSpool;
    case "longer-lifeline":
      return equipment.longerLifeline;
  }
}

export function installUpgrade(equipment: EquipmentState, id: UpgradeId): EquipmentState {
  switch (id) {
    case "basic-tank":
      return { ...equipment, basicTank: true };
    case "larger-tank":
      return { ...equipment, basicTank: true, largerTank: true };
    case "backup-tank":
      return { ...equipment, basicTank: true, backupTank: true };
    case "trimix-training":
      return { ...equipment, basicTank: true, largerTank: true, trimixTraining: true };
    case "handheld-light":
      return { ...equipment, handheldLight: true };
    case "better-flashlight":
      return { ...equipment, handheldLight: true, betterFlashlight: true };
    case "wide-beam-filter":
      return { ...equipment, handheldLight: true, betterFlashlight: true, wideBeamFilter: true };
    case "rubber-fins":
      return { ...equipment, rubberFins: true };
    case "better-fins":
      return { ...equipment, rubberFins: true, betterFins: true };
    case "diver-propulsion-vehicle":
      return { ...equipment, rubberFins: true, betterFins: true, diverPropulsionVehicle: true };
    case "basic-depth-gauge":
      return { ...equipment, basicDepthGauge: true };
    case "depth-gauge":
      return { ...equipment, basicDepthGauge: true, depthGauge: true };
    case "mapping-slate":
      return { ...equipment, mappingSlate: true };
    case "compact-sonar":
      return { ...equipment, basicDepthGauge: true, mappingSlate: true, compactSonar: true };
    case "survey-sensor-kit":
      return { ...equipment, mappingSlate: true, surveySensorKit: true };
    case "lifeline-spool":
      return { ...equipment, lifelineSpool: true };
    case "longer-lifeline":
      return { ...equipment, lifelineSpool: true, longerLifeline: true };
  }
}

export function upgradeRequirementReason(equipment: EquipmentState, id: UpgradeId): string | null {
  switch (id) {
    case "larger-tank":
    case "backup-tank":
      return equipment.basicTank ? null : "Requires single air cylinder.";
    case "trimix-training":
      return equipment.largerTank ? null : "Requires twin air set.";
    case "better-flashlight":
      return equipment.handheldLight ? null : "Requires handheld flashlight.";
    case "wide-beam-filter":
      return equipment.betterFlashlight ? null : "Requires better flashlight.";
    case "better-fins":
      return equipment.rubberFins ? null : "Requires rubber fins.";
    case "diver-propulsion-vehicle":
      return equipment.betterFins ? null : "Requires better fins.";
    case "depth-gauge":
      return equipment.basicDepthGauge ? null : "Requires analog depth gauge.";
    case "compact-sonar":
      return equipment.mappingSlate ? null : "Requires survey mapping slate.";
    case "survey-sensor-kit":
      return equipment.mappingSlate ? null : "Requires survey mapping slate.";
    case "longer-lifeline":
      return equipment.lifelineSpool ? null : "Requires lifeline spool.";
    case "basic-tank":
    case "handheld-light":
    case "rubber-fins":
    case "basic-depth-gauge":
    case "mapping-slate":
    case "lifeline-spool":
      return null;
  }
}

export function upgradesForCategory(categoryId: UpgradeCategoryId): readonly UpgradeDefinition[] {
  return UPGRADES.filter((upgrade) => upgrade.category === categoryId);
}

export function contractById(id: string | null | undefined): ContractDefinition | null {
  if (!id) return null;
  return CONTRACTS.find((contract) => contract.id === id) ?? null;
}

export function diveSiteById(id: string | null | undefined): DiveSiteDefinition {
  if (!id) return DIVE_SITES[0]!;
  return DIVE_SITES.find((site) => site.id === id) ?? DIVE_SITES[0]!;
}

export function highestMappedDepthMeters(progress: Pick<ProgressState, "mappedDepthBands" | "mappedSiteCells">): number {
  const legacyDepth = progress.mappedDepthBands.reduce((max, band) => Math.max(max, (band + 1) * MAPPING_BAND_METERS), 0);
  const siteDepth = progress.mappedSiteCells.reduce((max, cell) => {
    const parts = cell.split(":");
    const band = Number(parts[1]);
    return Number.isInteger(band) ? Math.max(max, (band + 1) * MAPPING_BAND_METERS) : max;
  }, 0);
  return Math.max(legacyDepth, siteDepth);
}

export function diveSiteUnlockReason(progress: ProgressState, site: DiveSiteDefinition): string | null {
  if (!site.unlockDepth) return null;
  return highestMappedDepthMeters(progress) >= site.unlockDepth ? null : `Map at least ${site.unlockDepth}m in Zacaton first.`;
}

export function mappingCellId(siteId: string, band: number): string {
  return `${siteId}:${band}`;
}

export function siteLandmarks(siteId: string): readonly LandmarkDefinition[] {
  return LANDMARKS.filter((landmark) => (landmark.siteId ?? DEFAULT_DIVE_SITE_ID) === siteId);
}

export function missionLockReason(_progress: ProgressState, _mission: MissionDefinition): string | null {
  return null;
}

export function nextMissionIndex(completedMissionIds: readonly string[]): number {
  const index = MISSIONS.findIndex((mission) => !completedMissionIds.includes(mission.id));
  return index === -1 ? MISSIONS.length - 1 : index;
}

function isTankStateRecord(value: unknown): value is TankState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || record.id.length === 0) return false;
  if (!TANK_DEFINITIONS.some((definition) => definition.kind === record.kind)) return false;
  if (record.gasMix !== "air" && record.gasMix !== "trimix") return false;
  if (typeof record.fill !== "number" || !Number.isFinite(record.fill) || record.fill < 0) return false;
  if (typeof record.dropped !== "boolean") return false;
  const definition = tankDefinition(record.kind as TankKind);
  return record.fill <= definition.capacity;
}

function isSettingsStateRecord(value: unknown): value is SettingsState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.musicEnabled === "boolean" && typeof record.sfxEnabled === "boolean";
}

export function isProgressState(value: unknown): value is ProgressState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const equipment = record.equipment;
  if (typeof record.money !== "number" || !Number.isFinite(record.money) || record.money < 0) return false;
  if (
    typeof record.activeMissionIndex !== "number" ||
    !Number.isInteger(record.activeMissionIndex) ||
    record.activeMissionIndex < 0
  ) {
    return false;
  }
  if (!Array.isArray(record.completedMissionIds) || record.completedMissionIds.some((id) => typeof id !== "string")) {
    return false;
  }
  if (
    record.mappedDepthBands !== undefined &&
    (!Array.isArray(record.mappedDepthBands) ||
      record.mappedDepthBands.some((band) => typeof band !== "number" || !Number.isInteger(band) || band < 0))
  ) {
    return false;
  }
  if (
    record.discoveredLandmarkIds !== undefined &&
    (!Array.isArray(record.discoveredLandmarkIds) || record.discoveredLandmarkIds.some((id) => typeof id !== "string"))
  ) {
    return false;
  }
  if (
    record.activeContractId !== undefined &&
    record.activeContractId !== null &&
    (typeof record.activeContractId !== "string" || !CONTRACTS.some((contract) => contract.id === record.activeContractId))
  ) {
    return false;
  }
  if (
    record.completedContractIds !== undefined &&
    (!Array.isArray(record.completedContractIds) || record.completedContractIds.some((id) => typeof id !== "string"))
  ) {
    return false;
  }
  if (
    record.selectedDiveSiteId !== undefined &&
    (typeof record.selectedDiveSiteId !== "string" || !DIVE_SITES.some((site) => site.id === record.selectedDiveSiteId))
  ) {
    return false;
  }
  if (
    record.mappedSiteCells !== undefined &&
    (!Array.isArray(record.mappedSiteCells) ||
      record.mappedSiteCells.some((cell) => {
        if (typeof cell !== "string") return true;
        const parts = cell.split(":");
        if (parts.length !== 2) return true;
        const site = DIVE_SITES.find((item) => item.id === parts[0]);
        const band = Number(parts[1]);
        return !site || !Number.isInteger(band) || band < 0 || band * MAPPING_BAND_METERS > site.maxDepth + MAPPING_BAND_METERS;
      }))
  ) {
    return false;
  }
  if (record.tanks !== undefined && (!Array.isArray(record.tanks) || record.tanks.some((tank) => !isTankStateRecord(tank)))) {
    return false;
  }
  if (
    record.nextTankId !== undefined &&
    (typeof record.nextTankId !== "number" || !Number.isInteger(record.nextTankId) || record.nextTankId < 1)
  ) {
    return false;
  }
  if (
    record.flashlightBattery !== undefined &&
    (typeof record.flashlightBattery !== "number" || !Number.isFinite(record.flashlightBattery) || record.flashlightBattery < 0)
  ) {
    return false;
  }
  if (record.settings !== undefined && !isSettingsStateRecord(record.settings)) {
    return false;
  }
  if (typeof equipment !== "object" || equipment === null || Array.isArray(equipment)) return false;
  const equipmentRecord = equipment as Record<string, unknown>;
  return (
    typeof equipmentRecord.basicTank === "boolean" &&
    typeof equipmentRecord.largerTank === "boolean" &&
    typeof equipmentRecord.backupTank === "boolean" &&
    typeof equipmentRecord.trimixTraining === "boolean" &&
    typeof equipmentRecord.handheldLight === "boolean" &&
    typeof equipmentRecord.betterFlashlight === "boolean" &&
    typeof equipmentRecord.wideBeamFilter === "boolean" &&
    typeof equipmentRecord.rubberFins === "boolean" &&
    typeof equipmentRecord.betterFins === "boolean" &&
    (equipmentRecord.diverPropulsionVehicle === undefined || typeof equipmentRecord.diverPropulsionVehicle === "boolean") &&
    typeof equipmentRecord.basicDepthGauge === "boolean" &&
    typeof equipmentRecord.depthGauge === "boolean" &&
    (equipmentRecord.mappingSlate === undefined || typeof equipmentRecord.mappingSlate === "boolean") &&
    (equipmentRecord.compactSonar === undefined || typeof equipmentRecord.compactSonar === "boolean") &&
    (equipmentRecord.surveySensorKit === undefined || typeof equipmentRecord.surveySensorKit === "boolean") &&
    (equipmentRecord.lifelineSpool === undefined || typeof equipmentRecord.lifelineSpool === "boolean") &&
    (equipmentRecord.longerLifeline === undefined || typeof equipmentRecord.longerLifeline === "boolean")
  );
}
