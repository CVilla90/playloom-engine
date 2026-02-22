export type PhaseCap = 1 | 2 | 3 | 4;

export type ResourceKey = "scrap" | "stone" | "metal" | "wood";
export type CharacterId = "human" | "robot" | "animal";

export type Inventory = Record<ResourceKey, number>;

export interface CharacterProfile {
  id: CharacterId;
  label: string;
  gatherMultiplier: number;
  repairMultiplier: number;
  speedMultiplier: number;
  iconKey: CharacterId;
  flavor: string;
}

export interface LayerState {
  maxHp: number;
  hp: number;
  absorption: number;
  flash: number;
}

export interface MeteorState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
}

export interface DebrisState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

export interface ResourceNodeState {
  id: number;
  type: ResourceKey;
  x: number;
  y: number;
  amount: number;
  gatherNeed: number;
  gatherProgress?: number;
}

export interface WaveState {
  index: number;
  active: boolean;
  nextWaveIn: number;
  spawnRemaining: number;
  spawnCooldown: number;
}

export interface PlayerState {
  x: number;
  y: number;
  radius: number;
}

export interface RunSnapshot {
  runSeed: number;
  rngState: number;
  elapsed: number;
  effort: number;
  effortMax: number;
  inventory: Inventory;
  unlockedDepth: number;
  layers: Array<Pick<LayerState, "maxHp" | "hp" | "absorption">>;
  player: PlayerState;
  meteors: MeteorState[];
  debris: DebrisState[];
  resourceNodes: ResourceNodeState[];
  wave: WaveState;
}
