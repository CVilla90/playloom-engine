import type { CharacterId, CharacterProfile, Inventory, ResourceKey } from "../types";

export const GAME_NAME = "Embervault Descent";
export const TAGLINE = "When the sky burns, dig deeper.";

export const CANVAS_WIDTH = 1360;
export const CANVAS_HEIGHT = 540;
export const HUD_COLUMN_WIDTH = 240;
export const PLAYFIELD_X = HUD_COLUMN_WIDTH;
export const PLAYFIELD_WIDTH = CANVAS_WIDTH - HUD_COLUMN_WIDTH * 2;
export const PLAYFIELD_RIGHT = PLAYFIELD_X + PLAYFIELD_WIDTH;
export const BUNKER_TOP = 178;
export const LAYER_HEIGHT = 62;
export const MAX_DEPTH = 5;

export const WAVE_MIN_INTERVAL = 30;
export const WAVE_MAX_INTERVAL = 90;
export const EFFORT_MAX = 100;
export const EFFORT_REGEN_PER_SEC = 36;
export const REPAIR_EFFORT_COST = 26;
export const UPGRADE_EFFORT_COST = 34;

export const RESOURCE_KEYS: readonly ResourceKey[] = ["scrap", "stone", "metal", "wood"];

export const STARTING_INVENTORY: Inventory = {
  scrap: 10,
  stone: 10,
  metal: 8,
  wood: 9
};

export const RESOURCE_COLORS: Record<ResourceKey, string> = {
  scrap: "#cfc0a0",
  stone: "#888d9a",
  metal: "#96c8d6",
  wood: "#92633e"
};

export const CHARACTERS: Record<CharacterId, CharacterProfile> = {
  human: {
    id: "human",
    label: "Human",
    gatherMultiplier: 1.2,
    repairMultiplier: 1,
    speedMultiplier: 1,
    iconKey: "human",
    flavor: "Efficient gatherer with balanced survival instincts."
  },
  robot: {
    id: "robot",
    label: "Robot",
    gatherMultiplier: 1,
    repairMultiplier: 1.3,
    speedMultiplier: 0.95,
    iconKey: "robot",
    flavor: "Optimized for repairs and bunker maintenance."
  },
  animal: {
    id: "animal",
    label: "Animal",
    gatherMultiplier: 0.95,
    repairMultiplier: 0.9,
    speedMultiplier: 1.25,
    iconKey: "animal",
    flavor: "Fast mover with sharp meteor evasion reflexes."
  }
};

export const UPGRADE_COSTS: Record<number, Inventory> = {
  2: { scrap: 18, stone: 24, metal: 8, wood: 14 },
  3: { scrap: 32, stone: 38, metal: 16, wood: 24 },
  4: { scrap: 50, stone: 58, metal: 30, wood: 36 },
  5: { scrap: 74, stone: 86, metal: 46, wood: 48 }
};

export const REPAIR_COST: Inventory = {
  scrap: 4,
  stone: 2,
  metal: 3,
  wood: 0
};

export function layerMaxHp(depthIndex: number): number {
  return 120 + depthIndex * 70;
}

export function layerAbsorption(depthIndex: number): number {
  return Math.min(0.18 + depthIndex * 0.11, 0.62);
}

export function playerMoveSpeed(character: CharacterProfile): number {
  return 178 * character.speedMultiplier;
}

export function meteorSpawnCount(wave: number, phaseCap: number): number {
  const scale = phaseCap >= 3 ? 1.35 : 0.7;
  return Math.round(4 + wave * scale);
}

export function meteorDamage(wave: number, phaseCap: number, radius: number): number {
  const waveBonus = phaseCap >= 3 ? wave * 2.5 : wave * 1.1;
  return 11 + radius * 0.65 + waveBonus;
}

export function meteorSpeed(wave: number, phaseCap: number): number {
  const base = 120;
  const scaling = phaseCap >= 3 ? 14 : 6;
  return base + wave * scaling;
}
