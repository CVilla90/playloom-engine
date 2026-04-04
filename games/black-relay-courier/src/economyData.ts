import { currentCargoPart, shipPartById, type CargoPart, type ShipPart, type ShipPartCategory } from "./shipData";

export interface Commodity {
  readonly id: string;
  readonly name: string;
  readonly basePrice: number;
  readonly accent: string;
  readonly description: string;
}

export interface CargoManifestEntry {
  readonly commodityId: string;
  readonly quantity: number;
}

export interface MarketQuote {
  readonly commodity: Commodity;
  readonly buyPrice: number;
  readonly sellPrice: number;
  readonly relativeDelta: number;
}

interface MarketProfile {
  readonly title: string;
  readonly summary: string;
  readonly biases: Record<string, number>;
}

interface WorkshopProfile {
  readonly title: string;
  readonly summary: string;
  readonly offerings: Record<ShipPartCategory, readonly string[]>;
}

export const COMMODITIES: readonly Commodity[] = [
  {
    id: "amber-grain",
    name: "Amber Grain",
    basePrice: 22,
    accent: "#f2cb79",
    description: "Shelf-stable food stock that moves well anywhere crews need cheap calories."
  },
  {
    id: "coolant-gel",
    name: "Coolant Gel",
    basePrice: 34,
    accent: "#8fe7ff",
    description: "Drive coolant slurry used by haulers, yards, and any pilot who burns hot for long."
  },
  {
    id: "relay-wire",
    name: "Relay Wire",
    basePrice: 46,
    accent: "#ffd59b",
    description: "Shielded signal braid for relays, docks, and improvised workshop fixes."
  },
  {
    id: "spice-resin",
    name: "Spice Resin",
    basePrice: 58,
    accent: "#ffaf8d",
    description: "A fragrant sealed cargo favored by markets and expensive frontier counters."
  },
  {
    id: "echo-glass",
    name: "Echo Glass",
    basePrice: 72,
    accent: "#a9ffd1",
    description: "Lensing shards and seam-grown panes used in specialty instruments and anomaly work."
  }
] as const;

const MARKET_PROFILES: Record<string, MarketProfile> = {
  "registry-beacon": {
    title: "Provision Counter",
    summary: "Registry provision prices skew toward clean supplies and expensive specialty stock. It is safe, lawful, and rarely the cheapest place to buy bulk.",
    biases: {
      "amber-grain": 1.13,
      "coolant-gel": 0.96,
      "relay-wire": 1.06,
      "spice-resin": 1.08,
      "echo-glass": 1.12
    }
  },
  "dust-market": {
    title: "Dust Market Floor",
    summary: "The ring-market is broad and lively: grain and spice run cheap, while technical stock gets marked up under the cargo lights.",
    biases: {
      "amber-grain": 0.82,
      "coolant-gel": 1.02,
      "relay-wire": 1.12,
      "spice-resin": 0.88,
      "echo-glass": 1.07
    }
  },
  "cinder-yard": {
    title: "Scrap Exchange",
    summary: "Yard commerce favors industrial lots. Coolant and wire go cheap, while luxury and food stock pay better if you brought them in clean.",
    biases: {
      "amber-grain": 1.08,
      "coolant-gel": 0.84,
      "relay-wire": 0.86,
      "spice-resin": 1.12,
      "echo-glass": 1.04
    }
  },
  "null-seam": {
    title: "Drift Exchange",
    summary: "Quiet seam brokers care about specialty glass and rare drift stock. Ordinary commodities move, but not at the best margin in the sector.",
    biases: {
      "amber-grain": 1.02,
      "coolant-gel": 1.05,
      "relay-wire": 1.08,
      "spice-resin": 0.96,
      "echo-glass": 0.84
    }
  },
  "helix-crown": {
    title: "Field Exchange",
    summary: "Helix Crown trades in charged consumables and hot hardware. Precision glass and coil stock spike here whenever the beam windows hold.",
    biases: {
      "amber-grain": 1.1,
      "coolant-gel": 0.82,
      "relay-wire": 0.9,
      "spice-resin": 1.12,
      "echo-glass": 1.16
    }
  },
  "glass-maw": {
    title: "Lens Bourse",
    summary: "The Maw pays for nerve and optics. Echo glass is relatively cheap near the ring, while luxury and relay stock clear expensive margins.",
    biases: {
      "amber-grain": 1.08,
      "coolant-gel": 1.04,
      "relay-wire": 1.14,
      "spice-resin": 1.12,
      "echo-glass": 0.78
    }
  },
  "bloom-ossuary": {
    title: "Petal Exchange",
    summary: "Bloom traffic favors resin and ceremonial freight. Bulk food is middling here, but delicate high-value cargo often clears well inside the shell.",
    biases: {
      "amber-grain": 0.94,
      "coolant-gel": 1.06,
      "relay-wire": 1.02,
      "spice-resin": 0.86,
      "echo-glass": 1.1
    }
  },
  "tidal-choir": {
    title: "Span Market",
    summary: "Tidal Choir moves preserved luxuries and patient old-light freight. Spice runs cheap, while precision and archival stock trend expensive.",
    biases: {
      "amber-grain": 1.1,
      "coolant-gel": 1.02,
      "relay-wire": 0.94,
      "spice-resin": 0.82,
      "echo-glass": 1.14
    }
  },
  "lantern-vault": {
    title: "Vault Exchange",
    summary: "Lantern Vault values careful cargo over cheap volume. Precision tools, sealed luxuries, and technical stock usually command the best prices here.",
    biases: {
      "amber-grain": 1.06,
      "coolant-gel": 1.1,
      "relay-wire": 1.18,
      "spice-resin": 1.16,
      "echo-glass": 0.88
    }
  }
};

const WORKSHOP_PROFILES: Record<string, WorkshopProfile> = {
  "dust-market": {
    title: "Ring Workshop",
    summary: "Cargo-hold retrofits are cheap enough here to matter. Dust crews stretch space first and worry about engine ferocity later.",
    offerings: {
      engine: [],
      cargo: ["sparrow-rack-10", "caravel-spine-16"]
    }
  },
  "cinder-yard": {
    title: "Cinder Yard Workshop",
    summary: "This is the serious hardware stop. Engine upgrades live here, and the yard can also fit the largest cargo bloom once you can pay for it.",
    offerings: {
      engine: ["kestrel-burn-coil", "slipfin-courier-spine", "blackglass-relay-heart"],
      cargo: ["atlas-bloom-24"]
    }
  },
  "helix-crown": {
    title: "Coil Gallery",
    summary: "Crown techs specialize in hot balancing and upper-end engine work. They care about the drive more than they care about you.",
    offerings: {
      engine: ["slipfin-courier-spine", "blackglass-relay-heart"],
      cargo: []
    }
  },
  "bloom-ossuary": {
    title: "Bloom Rig",
    summary: "Bloom riggers stretch holds for careful freight and shrine cargo. It is one of the quietest places in the sector to buy more space.",
    offerings: {
      engine: [],
      cargo: ["caravel-spine-16", "atlas-bloom-24"]
    }
  },
  "lantern-vault": {
    title: "Precision Bay",
    summary: "Lantern fitters move slowly and charge accordingly. Their work is controlled, exact, and rarely cheap.",
    offerings: {
      engine: ["kestrel-burn-coil", "slipfin-courier-spine"],
      cargo: ["caravel-spine-16"]
    }
  }
};

function commodityById(id: string | null): Commodity | null {
  if (!id) {
    return null;
  }
  return COMMODITIES.find((commodity) => commodity.id === id) ?? null;
}

function deterministicUnit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

export function marketProfileFor(destinationId: string | null): MarketProfile | null {
  if (!destinationId) {
    return null;
  }
  return MARKET_PROFILES[destinationId] ?? null;
}

export function workshopProfileFor(destinationId: string | null): WorkshopProfile | null {
  if (!destinationId) {
    return null;
  }
  return WORKSHOP_PROFILES[destinationId] ?? null;
}

export function marketQuotesFor(destinationId: string | null, pulse: number): MarketQuote[] {
  const profile = marketProfileFor(destinationId);
  if (!profile) {
    return [];
  }

  return COMMODITIES.map((commodity) => {
    const bias = profile.biases[commodity.id] ?? 1;
    const wobble = 0.97 + deterministicUnit(`${destinationId}:${commodity.id}:${pulse}`) * 0.06;
    const buyPrice = Math.max(4, Math.round(commodity.basePrice * bias * wobble));
    const sellPrice = Math.max(3, Math.floor(buyPrice * 0.9));
    return {
      commodity,
      buyPrice,
      sellPrice,
      relativeDelta: buyPrice / commodity.basePrice - 1
    };
  });
}

export function workshopPartsFor(destinationId: string | null, category: ShipPartCategory): ShipPart[] {
  const profile = workshopProfileFor(destinationId);
  if (!profile) {
    return [];
  }

  return (profile.offerings[category] ?? [])
    .map((id) => shipPartById(id))
    .filter((part): part is ShipPart => part !== null);
}

export function cargoManifestFromEntries(entries: readonly CargoManifestEntry[] | undefined): Record<string, number> {
  const manifest: Record<string, number> = {};
  if (!entries) {
    return manifest;
  }
  for (const entry of entries) {
    if (!commodityById(entry.commodityId)) {
      continue;
    }
    const quantity = Math.max(0, Math.floor(entry.quantity));
    if (quantity <= 0) {
      continue;
    }
    manifest[entry.commodityId] = quantity;
  }
  return manifest;
}

export function cargoEntriesFromManifest(manifest: Record<string, number>): CargoManifestEntry[] {
  return Object.entries(manifest)
    .map(([commodityId, quantity]) => ({
      commodityId,
      quantity: Math.max(0, Math.floor(quantity))
    }))
    .filter((entry) => entry.quantity > 0 && commodityById(entry.commodityId) !== null)
    .sort((a, b) => a.commodityId.localeCompare(b.commodityId));
}

export function cargoUsedCapacity(manifest: Record<string, number>): number {
  return Object.values(manifest).reduce((sum, quantity) => sum + Math.max(0, Math.floor(quantity)), 0);
}

export function cargoCapacityFromParts(partIds: readonly string[]): number {
  return currentCargoPart(partIds).capacity;
}

export function cargoFreeCapacity(manifest: Record<string, number>, partIds: readonly string[]): number {
  return Math.max(0, cargoCapacityFromParts(partIds) - cargoUsedCapacity(manifest));
}

export function cargoQuantity(manifest: Record<string, number>, commodityId: string): number {
  return manifest[commodityId] ?? 0;
}

export function describeCargoPart(partIds: readonly string[]): CargoPart {
  return currentCargoPart(partIds);
}

export function isCargoManifestEntry(value: unknown): value is CargoManifestEntry {
  return typeof value === "object" && value !== null
    && "commodityId" in value && typeof value.commodityId === "string"
    && "quantity" in value && typeof value.quantity === "number";
}
