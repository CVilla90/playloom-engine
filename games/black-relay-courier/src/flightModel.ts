export interface FlightInputState {
  readonly accelerate: boolean;
  readonly brake: boolean;
}

export interface FlightState {
  readonly throttle: number;
  readonly ssi: number;
}

export interface FlightTuning {
  readonly accelerationMultiplier?: number;
  readonly maxSsiMultiplier?: number;
}

export interface SpeedState {
  readonly label: string;
  readonly accent: string;
}

export interface CertificationBand {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly holdSeconds: number;
  readonly accent: string;
  readonly brief: string;
}

export const MAX_SSI = 1000;
export const SSI_EFFECT_CEILING = 1250;
export const BLACK_RELAY_SSI = 720;
export const SINGULARITY_SSI_MIN = 1100;
export const SINGULARITY_SSI_MAX = 1200;
export const DEFAULT_SINGULARITY_SSI = 1150;

export const CERTIFICATION_BANDS: readonly CertificationBand[] = [
  {
    id: "ignition-lattice",
    label: "Ignition Lattice",
    min: 50,
    max: 78,
    holdSeconds: 3,
    accent: "#73d8ff",
    brief: "Raise the drive cleanly. Slipwake pilots do not spike the core from cold."
  },
  {
    id: "courier-burn",
    label: "Courier Burn",
    min: 115,
    max: 155,
    holdSeconds: 4,
    accent: "#f5d58a",
    brief: "Ride the legal relay lane and keep the hull quiet inside the band."
  },
  {
    id: "relay-drop",
    label: "Relay Drop",
    min: 28,
    max: 48,
    holdSeconds: 3,
    accent: "#a9f0c8",
    brief: "Bleed velocity without flatlining the drive. Couriers must arrive under control."
  },
  {
    id: "slipwake-peak",
    label: "Slipwake Peak",
    min: 230,
    max: 280,
    holdSeconds: 5,
    accent: "#ff9c87",
    brief: "Touch courier threshold and hold the wake without shaking the ship apart."
  }
];

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function stepFlightModel(state: FlightState, input: FlightInputState, dt: number, tuning: FlightTuning = {}): FlightState {
  const safeDt = Math.max(0, dt);
  let throttle = state.throttle;
  let ssi = state.ssi;
  const accelerationMultiplier = tuning.accelerationMultiplier ?? 1;
  const driveCeilingMultiplier = tuning.maxSsiMultiplier ?? 1;
  const maxSsi = MAX_SSI * driveCeilingMultiplier;

  if (input.accelerate) {
    throttle += 34 * accelerationMultiplier * safeDt;
  }
  if (input.brake) {
    throttle -= 68 * safeDt;
  }

  throttle = clamp(throttle, 0, 100);

  const thrust =
    throttle * (1.85 + accelerationMultiplier * 0.55 + driveCeilingMultiplier * 0.55) +
    (input.accelerate ? 18 * accelerationMultiplier : 0);
  const drag = 18 + ssi * Math.max(0.22, 0.58 - driveCeilingMultiplier * 0.26);
  const retro = input.brake ? 85 + ssi * 0.48 : 0;

  ssi += (thrust - drag - retro) * safeDt;
  ssi = clamp(ssi, 0, maxSsi);

  return { throttle, ssi };
}

export function normalizeSingularityThreshold(ssi: number | null | undefined): number {
  if (typeof ssi !== "number" || !Number.isFinite(ssi)) {
    return DEFAULT_SINGULARITY_SSI;
  }
  return clamp(Math.round(ssi), SINGULARITY_SSI_MIN, SINGULARITY_SSI_MAX);
}

export function rollSingularityThreshold(random: () => number = Math.random): number {
  const clamped = clamp(random(), 0, 0.999999);
  return SINGULARITY_SSI_MIN + Math.floor(clamped * (SINGULARITY_SSI_MAX - SINGULARITY_SSI_MIN + 1));
}

export function getSpeedState(ssi: number, singularityThreshold = DEFAULT_SINGULARITY_SSI): SpeedState {
  const singularitySsi = normalizeSingularityThreshold(singularityThreshold);
  if (ssi < 20) {
    return { label: "Drift", accent: "#cfd6eb" };
  }
  if (ssi < 120) {
    return { label: "Burn", accent: "#7dd7ff" };
  }
  if (ssi < 250) {
    return { label: "Streak", accent: "#ffe291" };
  }
  if (ssi < 420) {
    return { label: "Needle", accent: "#9aefc0" };
  }
  if (ssi < BLACK_RELAY_SSI) {
    return { label: "Slipwake", accent: "#ff9d86" };
  }
  if (ssi < singularitySsi) {
    return { label: "Black Relay", accent: "#ff8fc1" };
  }
  return { label: "Singularity Veil", accent: "#caa7ff" };
}

export function computeStrain(throttle: number, ssi: number, braking: boolean): number {
  const throttleLoad = Math.max(0, throttle - 55) * 0.9;
  const shearLoad = Math.max(0, ssi - 180) * 0.28;
  const brakeLoad = braking ? 18 + ssi * 0.06 : 0;
  return clamp(throttleLoad + shearLoad + brakeLoad, 0, 100);
}

export function isWithinBand(ssi: number, band: CertificationBand): boolean {
  return ssi >= band.min && ssi <= band.max;
}

export function updateHoldProgress(current: number, ssi: number, band: CertificationBand, dt: number): number {
  const delta = isWithinBand(ssi, band) ? dt : -dt * 1.35;
  return clamp(current + delta, 0, band.holdSeconds);
}

export function bandCommand(ssi: number, band: CertificationBand): string {
  if (ssi < band.min) {
    return `Raise SSI by ${Math.ceil(band.min - ssi)}`;
  }
  if (ssi > band.max) {
    return `Bleed ${Math.ceil(ssi - band.max)} SSI`;
  }
  return "Hold steady inside the wake";
}
