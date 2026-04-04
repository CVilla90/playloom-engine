import { NAV_CONTACTS } from "./navData";

export type RouteWonderId =
  | "prism-shear"
  | "crown-arcs"
  | "petal-veil"
  | "choir-span"
  | "ashwake-reef"
  | "red-wake-cataract"
  | "graveglass-drift"
  | "starless-run"
  | "dead-relay-chain";

export interface RouteWonderDefinition {
  readonly id: RouteWonderId;
  readonly label: string;
  readonly accent: string;
  readonly summary: string;
  readonly start: number;
  readonly end: number;
}

export interface TravelRouteProfile {
  readonly originId: string;
  readonly destinationId: string;
  readonly totalDistance: number;
  readonly wonderId: RouteWonderId | null;
}

interface RouteNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly tier: number;
}

const FREE_WAKE_NODE: RouteNode = {
  id: "free-wake",
  x: 0,
  y: 0,
  tier: 0
};

const CONTACT_TIERS: Record<string, number> = {
  "free-wake": 0,
  "registry-beacon": 0,
  "dust-market": 0,
  "cinder-yard": 0,
  "null-seam": 0,
  "helix-crown": 1,
  "glass-maw": 1,
  "bloom-ossuary": 1,
  "tidal-choir": 1,
  "lantern-vault": 2,
  "mute-reach": 3
};

export const ROUTE_WONDERS: readonly RouteWonderDefinition[] = [
  {
    id: "prism-shear",
    label: "Prism Shear",
    accent: "#cbbdff",
    summary: "Lensing walls split the stars into mirrored arcs and bent halos.",
    start: 0.3,
    end: 0.72
  },
  {
    id: "crown-arcs",
    label: "Crown Arcs",
    accent: "#8fd1ff",
    summary: "Charged aurora ribbons crawl across the route in blue-white sheets.",
    start: 0.24,
    end: 0.68
  },
  {
    id: "petal-veil",
    label: "Petal Veil",
    accent: "#ff9ecb",
    summary: "A flowering shell of gas drifts across the canopy in translucent folds.",
    start: 0.28,
    end: 0.78
  },
  {
    id: "choir-span",
    label: "Choir Span",
    accent: "#ffd7a4",
    summary: "A tidal river of old galactic light hangs nearly still across the lane.",
    start: 0.22,
    end: 0.74
  },
  {
    id: "ashwake-reef",
    label: "Ashwake Reef",
    accent: "#ffb18d",
    summary: "Slag plates, ember fragments, and dead hulls drift together like a reef.",
    start: 0.18,
    end: 0.58
  },
  {
    id: "red-wake-cataract",
    label: "Red Wake Cataract",
    accent: "#ff8f7f",
    summary: "Shock-red filaments and supernova curtains spill diagonally across the route.",
    start: 0.34,
    end: 0.82
  },
  {
    id: "graveglass-drift",
    label: "Graveglass Drift",
    accent: "#d8efff",
    summary: "Sparse reflective shards flash and vanish in the cold dark.",
    start: 0.26,
    end: 0.66
  },
  {
    id: "starless-run",
    label: "Starless Run",
    accent: "#9eb3c7",
    summary: "The stars simply die away until the route feels almost empty.",
    start: 0.08,
    end: 0.94
  },
  {
    id: "dead-relay-chain",
    label: "Dead Relay Chain",
    accent: "#8edfff",
    summary: "Ancient courier markers and dead beacons line the wake like a forgotten road.",
    start: 0.2,
    end: 0.76
  }
] as const;

const ROUTE_WONDER_LOOKUP = Object.fromEntries(ROUTE_WONDERS.map((wonder) => [wonder.id, wonder])) as Record<RouteWonderId, RouteWonderDefinition>;

function routeKey(a: string, b: string): string {
  return a.localeCompare(b) <= 0 ? `${a}::${b}` : `${b}::${a}`;
}

const ROUTE_WONDER_PAIR_ENTRIES: readonly [string, string, RouteWonderId][] = [
  ["registry-beacon", "glass-maw", "prism-shear"],
  ["glass-maw", "null-seam", "prism-shear"],
  ["glass-maw", "lantern-vault", "prism-shear"],
  ["helix-crown", "registry-beacon", "crown-arcs"],
  ["cinder-yard", "helix-crown", "crown-arcs"],
  ["helix-crown", "lantern-vault", "crown-arcs"],
  ["bloom-ossuary", "dust-market", "petal-veil"],
  ["bloom-ossuary", "null-seam", "petal-veil"],
  ["bloom-ossuary", "lantern-vault", "petal-veil"],
  ["dust-market", "tidal-choir", "choir-span"],
  ["registry-beacon", "tidal-choir", "choir-span"],
  ["lantern-vault", "tidal-choir", "choir-span"],
  ["cinder-yard", "dust-market", "ashwake-reef"],
  ["cinder-yard", "tidal-choir", "ashwake-reef"],
  ["bloom-ossuary", "cinder-yard", "red-wake-cataract"],
  ["bloom-ossuary", "helix-crown", "red-wake-cataract"],
  ["lantern-vault", "mute-reach", "graveglass-drift"],
  ["null-seam", "mute-reach", "starless-run"],
  ["glass-maw", "mute-reach", "starless-run"],
  ["bloom-ossuary", "mute-reach", "starless-run"],
  ["lantern-vault", "registry-beacon", "dead-relay-chain"],
  ["mute-reach", "registry-beacon", "dead-relay-chain"]
];

const ROUTE_WONDER_PAIRS = Object.fromEntries(
  ROUTE_WONDER_PAIR_ENTRIES.map(([originId, destinationId, wonderId]) => [routeKey(originId, destinationId), wonderId])
) as Record<string, RouteWonderId>;

function routeNodeFor(id: string | null): RouteNode | null {
  if (!id) {
    return null;
  }
  if (id === FREE_WAKE_NODE.id) {
    return FREE_WAKE_NODE;
  }
  const contact = NAV_CONTACTS.find((entry) => entry.id === id);
  if (!contact) {
    return null;
  }
  return {
    id: contact.id,
    x: contact.x,
    y: contact.y,
    tier: CONTACT_TIERS[contact.id] ?? 0
  };
}

function computedDistance(origin: RouteNode, destination: RouteNode): number {
  const spatial = Math.hypot(origin.x - destination.x, origin.y - destination.y);
  const remoteTier = Math.max(origin.tier, destination.tier);
  const tierGap = Math.abs(origin.tier - destination.tier);
  const distance = 2.6 + spatial * 13.2 + remoteTier * 3.4 + tierGap * 1.5;
  return Math.round(distance * 10) / 10;
}

export function routeWonderById(id: RouteWonderId | null): RouteWonderDefinition | null {
  if (!id) {
    return null;
  }
  return ROUTE_WONDER_LOOKUP[id] ?? null;
}

export function routeWonderFor(originId: string, destinationId: string): RouteWonderDefinition | null {
  return routeWonderById(ROUTE_WONDER_PAIRS[routeKey(originId, destinationId)] ?? null);
}

export function travelRouteFor(originId: string | null, destinationId: string | null): TravelRouteProfile | null {
  const origin = routeNodeFor(originId);
  const destination = routeNodeFor(destinationId);
  if (!origin || !destination || origin.id === destination.id) {
    return null;
  }

  return {
    originId: origin.id,
    destinationId: destination.id,
    totalDistance: computedDistance(origin, destination),
    wonderId: ROUTE_WONDER_PAIRS[routeKey(origin.id, destination.id)] ?? null
  };
}
