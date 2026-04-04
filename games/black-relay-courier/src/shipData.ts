export type ShipPartCategory = "engine" | "cargo";

interface ShipPartBase {
  readonly id: string;
  readonly category: ShipPartCategory;
  readonly tier: number;
  readonly name: string;
  readonly shortName: string;
  readonly departmentLabel: string;
  readonly description: string;
  readonly price: number;
}

export interface EnginePart extends ShipPartBase {
  readonly category: "engine";
  readonly accelerationMultiplier: number;
  readonly maxSsiMultiplier: number;
}

export interface CargoPart extends ShipPartBase {
  readonly category: "cargo";
  readonly capacity: number;
}

export type ShipPart = EnginePart | CargoPart;

export const STARTING_CREDITS_MIN = 200;
export const STARTING_CREDITS_MAX = 400;
export const STARTING_CREDITS = 300;
export const STARTING_HULL_INTEGRITY = 100;
export const STARTER_ENGINE_ID = "mothline-scout-drive";
export const STARTER_CARGO_ID = "latch-cradle-6";
export const STARTER_PART_IDS = [STARTER_ENGINE_ID, STARTER_CARGO_ID] as const;

export const SHIP_PARTS: readonly ShipPart[] = [
  {
    id: STARTER_ENGINE_ID,
    category: "engine",
    tier: 1,
    name: "Mothline Scout Drive",
    shortName: "Mothline Scout",
    departmentLabel: "Drive",
    description: "Stock courier engine. Stable and readable, but deliberately slow on spool and hard-capped well below relay-black territory.",
    price: 0,
    accelerationMultiplier: 0.52,
    maxSsiMultiplier: 0.4
  },
  {
    id: "kestrel-burn-coil",
    category: "engine",
    tier: 2,
    name: "Kestrel Burn Coil",
    shortName: "Kestrel Coil",
    departmentLabel: "Drive",
    description: "A clean courier-grade retrofit with sharper throttle response and enough ceiling to live inside a real slipwake burn.",
    price: 520,
    accelerationMultiplier: 1,
    maxSsiMultiplier: 0.68
  },
  {
    id: "slipfin-courier-spine",
    category: "engine",
    tier: 3,
    name: "Slipfin Courier Spine",
    shortName: "Slipfin Spine",
    departmentLabel: "Drive",
    description: "A tuned relay spine that pushes the hull into proper courier territory and gives you a stable black-relay envelope.",
    price: 980,
    accelerationMultiplier: 1.34,
    maxSsiMultiplier: 0.92
  },
  {
    id: "blackglass-relay-heart",
    category: "engine",
    tier: 4,
    name: "Blackglass Relay Heart",
    shortName: "Blackglass Heart",
    departmentLabel: "Drive",
    description: "A brutal high-tier drive core built for long burns, violent spool, and the only live route into singularity-veil speeds.",
    price: 1720,
    accelerationMultiplier: 1.52,
    maxSsiMultiplier: 1.25
  },
  {
    id: STARTER_CARGO_ID,
    category: "cargo",
    tier: 1,
    name: "Latch Cradle-6",
    shortName: "Cradle-6",
    departmentLabel: "Hold",
    description: "Bare starter cradle with room for a few trade lots and not much else.",
    price: 0,
    capacity: 6
  },
  {
    id: "sparrow-rack-10",
    category: "cargo",
    tier: 2,
    name: "Sparrow Rack-10",
    shortName: "Rack-10",
    departmentLabel: "Hold",
    description: "A compact rack upgrade that makes early trade loops worth the burn.",
    price: 360,
    capacity: 10
  },
  {
    id: "caravel-spine-16",
    category: "cargo",
    tier: 3,
    name: "Caravel Spine-16",
    shortName: "Spine-16",
    departmentLabel: "Hold",
    description: "A midline cargo spine for serious route profit without swallowing the whole ship.",
    price: 820,
    capacity: 16
  },
  {
    id: "atlas-bloom-24",
    category: "cargo",
    tier: 4,
    name: "Atlas Bloom-24",
    shortName: "Bloom-24",
    departmentLabel: "Hold",
    description: "A heavy bloom bay that turns the courier into a real hauler if you can afford the volume and the risk.",
    price: 1580,
    capacity: 24
  }
] as const;

export function shipPartById(id: string | null): ShipPart | null {
  if (!id) {
    return null;
  }
  return SHIP_PARTS.find((part) => part.id === id) ?? null;
}

export function installedShipPart(partIds: readonly string[], category: ShipPartCategory): ShipPart {
  const installed = partIds
    .map((id) => shipPartById(id))
    .find((part): part is ShipPart => part !== null && part.category === category);

  if (installed) {
    return installed;
  }

  return category === "engine"
    ? (shipPartById(STARTER_ENGINE_ID) as EnginePart)
    : (shipPartById(STARTER_CARGO_ID) as CargoPart);
}

export function currentEnginePart(partIds: readonly string[]): EnginePart {
  return installedShipPart(partIds, "engine") as EnginePart;
}

export function currentCargoPart(partIds: readonly string[]): CargoPart {
  return installedShipPart(partIds, "cargo") as CargoPart;
}

export function replaceInstalledPart(partIds: readonly string[], nextPartId: string): string[] {
  const nextPart = shipPartById(nextPartId);
  if (!nextPart) {
    return [...partIds];
  }

  const filtered = partIds.filter((id) => shipPartById(id)?.category !== nextPart.category);
  filtered.push(nextPart.id);
  return filtered;
}

export function shipPartsForCategory(category: ShipPartCategory): readonly ShipPart[] {
  return SHIP_PARTS.filter((part) => part.category === category);
}

export function rollStartingCredits(randomUnit = Math.random()): number {
  const unit = Math.min(1, Math.max(0, randomUnit));
  return STARTING_CREDITS_MIN + Math.round((STARTING_CREDITS_MAX - STARTING_CREDITS_MIN) * unit);
}
