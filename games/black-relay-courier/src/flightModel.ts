export interface FlightInputState {
  readonly accelerate: boolean;
  readonly brake: boolean;
}

export interface FlightState {
  readonly throttle: number;
  readonly ssi: number;
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

export const MAX_SSI = 560;
export const SSI_EFFECT_CEILING = 440;

export const CERTIFICATION_BANDS: readonly CertificationBand[] = [
  {
    id: "ignition-lattice",
    label: "Ignition Lattice",
    min: 60,
    max: 90,
    holdSeconds: 3,
    accent: "#73d8ff",
    brief: "Raise the drive cleanly. Slipwake pilots do not spike the core from cold."
  },
  {
    id: "courier-burn",
    label: "Courier Burn",
    min: 145,
    max: 185,
    holdSeconds: 4,
    accent: "#f5d58a",
    brief: "Ride the legal relay lane and keep the hull quiet inside the band."
  },
  {
    id: "relay-drop",
    label: "Relay Drop",
    min: 35,
    max: 60,
    holdSeconds: 3,
    accent: "#a9f0c8",
    brief: "Bleed velocity without flatlining the drive. Couriers must arrive under control."
  },
  {
    id: "slipwake-peak",
    label: "Slipwake Peak",
    min: 290,
    max: 340,
    holdSeconds: 5,
    accent: "#ff9c87",
    brief: "Touch courier threshold and hold the wake without shaking the ship apart."
  }
];

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function stepFlightModel(state: FlightState, input: FlightInputState, dt: number): FlightState {
  const safeDt = Math.max(0, dt);
  let throttle = state.throttle;
  let ssi = state.ssi;

  if (input.accelerate) {
    throttle += 34 * safeDt;
  }
  if (input.brake) {
    throttle -= 68 * safeDt;
  }

  throttle = clamp(throttle, 0, 100);

  const thrust = throttle * 2.45 + (input.accelerate ? 16 : 0);
  const drag = 18 + ssi * 0.44;
  const retro = input.brake ? 85 + ssi * 0.48 : 0;

  ssi += (thrust - drag - retro) * safeDt;
  ssi = clamp(ssi, 0, MAX_SSI);

  return { throttle, ssi };
}

export function getSpeedState(ssi: number): SpeedState {
  if (ssi < 12) {
    return { label: "Drift", accent: "#cfd6eb" };
  }
  if (ssi < 80) {
    return { label: "Burn", accent: "#7dd7ff" };
  }
  if (ssi < 160) {
    return { label: "Streak", accent: "#ffe291" };
  }
  if (ssi < 260) {
    return { label: "Needle", accent: "#9aefc0" };
  }
  if (ssi < 400) {
    return { label: "Slipwake", accent: "#ff9d86" };
  }
  return { label: "Black Relay", accent: "#ff8fc1" };
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
