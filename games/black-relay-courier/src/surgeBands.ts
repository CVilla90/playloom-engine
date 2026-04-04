export interface RangeLike {
  range(min: number, max: number): number;
  chance(probability: number): boolean;
}

export type DramaticSurgeTier = "minor" | "major";

export interface DramaticSurgeBandConfig {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly accent: string;
  readonly tier: DramaticSurgeTier;
  readonly rarity: number;
}

export interface DramaticSurgeBandState extends DramaticSurgeBandConfig {
  readonly trigger: number;
  readonly triggered: boolean;
  readonly armed: boolean;
}

export const DRAMATIC_SURGE_BANDS: readonly DramaticSurgeBandConfig[] = [
  { id: "warm-spike", label: "Warm Spike", min: 96, max: 144, accent: "#7edaff", tier: "minor", rarity: 1 },
  { id: "hull-tremor", label: "Hull Tremor", min: 216, max: 264, accent: "#ffe08f", tier: "minor", rarity: 1 },
  { id: "wake-kick", label: "Wake Kick", min: 336, max: 384, accent: "#9aefc0", tier: "minor", rarity: 1 },
  { id: "slip-crack", label: "Slip Crack", min: 456, max: 504, accent: "#ffb08f", tier: "major", rarity: 0.58 },
  { id: "relay-black", label: "Relay Black", min: 576, max: 624, accent: "#ff8ec0", tier: "major", rarity: 0.42 }
];

export function rollSurgeTrigger(band: DramaticSurgeBandConfig, rng: RangeLike): number {
  return rng.range(band.min, band.max);
}

function rollSurgeArming(band: DramaticSurgeBandConfig, rng: RangeLike): boolean {
  return band.rarity >= 1 || rng.chance(band.rarity);
}

function rollSurgeBandState(band: DramaticSurgeBandConfig, rng: RangeLike): DramaticSurgeBandState {
  return {
    ...band,
    trigger: rollSurgeTrigger(band, rng),
    triggered: false,
    armed: rollSurgeArming(band, rng)
  };
}

export function createDramaticSurgeState(rng: RangeLike): DramaticSurgeBandState[] {
  return DRAMATIC_SURGE_BANDS.map((band) => rollSurgeBandState(band, rng));
}

export function rearmSurgeBandIfBelow(
  band: DramaticSurgeBandState,
  previousSsi: number,
  currentSsi: number,
  rng: RangeLike
): DramaticSurgeBandState {
  if (!(previousSsi >= band.min && currentSsi < band.min)) {
    return band;
  }

  return rollSurgeBandState(band, rng);
}

export function shouldTriggerSurge(
  band: DramaticSurgeBandState,
  previousSsi: number,
  currentSsi: number,
  accelerating: boolean
): boolean {
  return band.armed && accelerating && !band.triggered && previousSsi < band.trigger && currentSsi >= band.trigger;
}
