import type { DramaticSurgeTier, RangeLike } from "./surgeBands";

export interface RetroCollapseBandConfig {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly accent: string;
  readonly tier: DramaticSurgeTier;
  readonly rarity: number;
  readonly minDecel: number;
}

export interface RetroCollapseBandState extends RetroCollapseBandConfig {
  readonly trigger: number;
  readonly triggered: boolean;
  readonly armed: boolean;
}

export const RETRO_COLLAPSE_BANDS: readonly RetroCollapseBandConfig[] = [
  {
    id: "relay-dump",
    label: "Relay Dump",
    min: 576,
    max: 624,
    accent: "#b9d8ff",
    tier: "major",
    rarity: 0.52,
    minDecel: 180
  },
  {
    id: "wake-collapse",
    label: "Wake Collapse",
    min: 384,
    max: 468,
    accent: "#93ecff",
    tier: "minor",
    rarity: 1,
    minDecel: 140
  },
  {
    id: "retro-shock",
    label: "Retro Shock",
    min: 204,
    max: 300,
    accent: "#d9e8ff",
    tier: "minor",
    rarity: 1,
    minDecel: 105
  }
];

export function rollRetroCollapseTrigger(band: RetroCollapseBandConfig, rng: RangeLike): number {
  return rng.range(band.min, band.max);
}

function rollRetroCollapseArming(band: RetroCollapseBandConfig, rng: RangeLike): boolean {
  return band.rarity >= 1 || rng.chance(band.rarity);
}

function rollRetroCollapseBandState(band: RetroCollapseBandConfig, rng: RangeLike): RetroCollapseBandState {
  return {
    ...band,
    trigger: rollRetroCollapseTrigger(band, rng),
    triggered: false,
    armed: rollRetroCollapseArming(band, rng)
  };
}

export function createRetroCollapseState(rng: RangeLike): RetroCollapseBandState[] {
  return RETRO_COLLAPSE_BANDS.map((band) => rollRetroCollapseBandState(band, rng));
}

export function rearmRetroCollapseBandIfAbove(
  band: RetroCollapseBandState,
  previousSsi: number,
  currentSsi: number,
  rng: RangeLike
): RetroCollapseBandState {
  if (!(previousSsi <= band.max && currentSsi > band.max)) {
    return band;
  }

  return rollRetroCollapseBandState(band, rng);
}

export function shouldTriggerRetroCollapse(
  band: RetroCollapseBandState,
  previousSsi: number,
  currentSsi: number,
  braking: boolean,
  decelRate: number
): boolean {
  return (
    band.armed &&
    braking &&
    !band.triggered &&
    decelRate >= band.minDecel &&
    previousSsi > band.trigger &&
    currentSsi <= band.trigger
  );
}
