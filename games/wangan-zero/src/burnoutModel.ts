import { clamp } from "./drivingModel";

export const BURNOUT_MAX_SPEED_KPH = 40;
export const BURNOUT_MIN_RPM = 5000;
export const BURNOUT_DURATION_SECONDS = 1.5;

export interface BurnoutInput {
  readonly speedKph: number;
  readonly gear: number;
  readonly rpm: number;
  readonly clutchDown: boolean;
}

/**
 * Presentation-only state. `sequence` gives a future multiplayer snapshot a
 * stable event counter; no value from this model feeds driving physics.
 */
export interface BurnoutEffectState {
  readonly clutchWasDown: boolean;
  readonly launchReady: boolean;
  readonly remainingSeconds: number;
  readonly elapsedSeconds: number;
  readonly sequence: number;
}

export function createBurnoutEffectState(): BurnoutEffectState {
  return {
    clutchWasDown: false,
    launchReady: false,
    remainingSeconds: 0,
    elapsedSeconds: 0,
    sequence: 0
  };
}

export function stepBurnoutEffect(
  state: BurnoutEffectState,
  input: BurnoutInput,
  dt: number
): BurnoutEffectState {
  const safeDt = clamp(dt, 0, 0.05);
  let remainingSeconds = Math.max(0, state.remainingSeconds - safeDt);
  let elapsedSeconds = remainingSeconds > 0 ? state.elapsedSeconds + safeDt : 0;
  let sequence = state.sequence;

  const eligibleNow =
    input.clutchDown &&
    input.gear === 1 &&
    input.speedKph < BURNOUT_MAX_SPEED_KPH &&
    input.rpm >= BURNOUT_MIN_RPM;
  const releasedClutch = state.clutchWasDown && !input.clutchDown;
  const triggered =
    releasedClutch &&
    state.launchReady &&
    input.gear === 1 &&
    input.speedKph < BURNOUT_MAX_SPEED_KPH;

  if (triggered) {
    remainingSeconds = BURNOUT_DURATION_SECONDS;
    elapsedSeconds = 0;
    sequence += 1;
  }

  return {
    clutchWasDown: input.clutchDown,
    launchReady: eligibleNow,
    remainingSeconds,
    elapsedSeconds,
    sequence
  };
}

export function burnoutIntensity(state: BurnoutEffectState): number {
  if (state.remainingSeconds <= 0) {
    return 0;
  }
  const attack = clamp((state.elapsedSeconds + 0.025) / 0.1, 0, 1);
  const release = Math.pow(
    clamp(state.remainingSeconds / BURNOUT_DURATION_SECONDS, 0, 1),
    0.62
  );
  return attack * release;
}
