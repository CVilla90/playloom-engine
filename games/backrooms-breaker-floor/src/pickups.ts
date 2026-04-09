export type PickupType = "energy_drink" | "medkit";

export type PickupLootProfile = "medical" | "stimulant" | "general" | "industrial";

export interface PickupSpawnPoint {
  readonly id: string;
  readonly areaId: string;
  readonly x: number;
  readonly y: number;
  readonly profile: PickupLootProfile;
}

interface WeightedEntry<T extends string> {
  readonly type: T;
  readonly weight: number;
}

export interface PickupDefinition {
  readonly label: string;
  readonly radius: number;
  readonly color: string;
  readonly accentColor: string;
  readonly glowColor: string;
}

export const ENERGY_DRINK_SPEED_MULTIPLIER = 1.28;
export const ENERGY_DRINK_DURATION = 8;
export const MEDKIT_HEAL_AMOUNT = 25;

export const PICKUP_DEFINITIONS: Record<PickupType, PickupDefinition> = {
  energy_drink: {
    label: "Energy Drink",
    radius: 12,
    color: "#4dc0c5",
    accentColor: "#ddfff3",
    glowColor: "rgba(97, 225, 232, 0.24)"
  },
  medkit: {
    label: "Med Kit",
    radius: 12,
    color: "#efe8dc",
    accentColor: "#d94a57",
    glowColor: "rgba(255, 140, 140, 0.18)"
  }
};

const WILDCARD_TABLE: readonly WeightedEntry<PickupType>[] = [
  { type: "energy_drink", weight: 50 },
  { type: "medkit", weight: 50 }
];

const LOOT_TABLES: Record<PickupLootProfile, readonly WeightedEntry<PickupType | "nothing" | "wildcard">[]> = {
  medical: [
    { type: "nothing", weight: 60 },
    { type: "medkit", weight: 25 },
    { type: "energy_drink", weight: 10 },
    { type: "wildcard", weight: 5 }
  ],
  stimulant: [
    { type: "nothing", weight: 60 },
    { type: "energy_drink", weight: 25 },
    { type: "medkit", weight: 10 },
    { type: "wildcard", weight: 5 }
  ],
  general: [
    { type: "nothing", weight: 70 },
    { type: "energy_drink", weight: 13 },
    { type: "medkit", weight: 13 },
    { type: "wildcard", weight: 4 }
  ],
  industrial: [
    { type: "nothing", weight: 74 },
    { type: "energy_drink", weight: 15 },
    { type: "medkit", weight: 7 },
    { type: "wildcard", weight: 4 }
  ]
};

export const PICKUP_SPAWN_POINTS: readonly PickupSpawnPoint[] = [
  { id: "prep-bay-kit-a", areaId: "prep-bay", x: 226, y: 522, profile: "medical" },
  { id: "archive-west-cache-a", areaId: "archive-west", x: 960, y: 226, profile: "general" },
  { id: "signal-loft-cache-a", areaId: "signal-loft", x: 1324, y: 176, profile: "stimulant" },
  { id: "observation-deck-cache-a", areaId: "observation-deck", x: 2246, y: 214, profile: "stimulant" },
  { id: "observation-deck-cache-b", areaId: "observation-deck", x: 2466, y: 308, profile: "general" },
  { id: "tape-vault-cache-a", areaId: "tape-vault", x: 518, y: 818, profile: "general" },
  { id: "flooded-annex-cache-a", areaId: "flooded-annex", x: 1416, y: 820, profile: "industrial" },
  { id: "flooded-annex-cache-b", areaId: "flooded-annex", x: 1602, y: 724, profile: "general" },
  { id: "generator-gallery-cache-a", areaId: "generator-gallery", x: 2198, y: 752, profile: "stimulant" },
  { id: "generator-gallery-cache-b", areaId: "generator-gallery", x: 2410, y: 878, profile: "stimulant" },
  { id: "breaker-core-cache-a", areaId: "breaker-core", x: 2218, y: 1252, profile: "industrial" },
  { id: "breaker-core-cache-b", areaId: "breaker-core", x: 2452, y: 1388, profile: "general" },
  { id: "quiet-depot-cache-a", areaId: "quiet-depot", x: 1046, y: 1688, profile: "medical" },
  { id: "archive-crawl-cache-a", areaId: "archive-crawl", x: 1468, y: 1694, profile: "general" },
  { id: "south-cross-cache-a", areaId: "south-cross", x: 1778, y: 1674, profile: "industrial" },
  { id: "intake-hall-cache-a", areaId: "intake-hall", x: 612, y: 292, profile: "general" }
];

function chooseWeighted<T extends string>(entries: readonly { type: T; weight: number }[], random = Math.random): T {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    throw new Error("Weighted pickup table must have a positive total weight.");
  }

  let roll = random() * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.type;
    }
  }

  return entries[entries.length - 1]!.type;
}

export function rollPickupType(profile: PickupLootProfile, random = Math.random): PickupType | null {
  const result = chooseWeighted(LOOT_TABLES[profile], random);
  if (result === "nothing") {
    return null;
  }
  if (result === "wildcard") {
    return chooseWeighted(WILDCARD_TABLE, random);
  }
  return result;
}
