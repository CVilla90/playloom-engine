export interface DriveInputState {
  readonly accelerate: boolean;
  readonly brake: boolean;
  readonly clutch?: boolean;
  readonly shiftUp?: boolean;
  readonly shiftDown?: boolean;
  /** Direct H-gate selection used by the draggable cockpit shifter. */
  readonly selectGear?: number;
  readonly draftPowerMultiplier?: number;
}

export interface DriveState {
  readonly speedKph: number;
  readonly throttle: number;
  readonly brakePressure: number;
  readonly clutchPressure: number;
  readonly distanceMeters: number;
  readonly visualDistanceMeters: number;
  readonly elapsedSeconds: number;
  readonly gear: number;
  readonly rpm: number;
  readonly shiftTimer: number;
  readonly revLimiterActive: boolean;
  readonly maxSpeedKph: number;
  readonly finished: boolean;
}

export interface DriveAccelerationState {
  readonly speedKph: number;
  readonly gear: number;
  readonly throttle: number;
  readonly brakePressure: number;
  readonly clutchDisengaged?: boolean;
  readonly shifting?: boolean;
  readonly powerMultiplier?: number;
  readonly performance?: DrivePerformanceProfile;
}

export interface DrivePerformanceProfile {
  readonly id: string;
  readonly displayName: string;
  /** Absolute drivetrain/safety ceiling, including temporary power bonuses. */
  readonly hardSpeedLimitKph: number;
  /** Stable full-throttle speed without drafting or another power bonus. */
  readonly naturalTopSpeedKph: number;
  readonly basePowerKphPerSecond: number;
  readonly aerodynamicDragAtNaturalTopKphPerSecond: number;
  readonly gearSpeedLimitsKph: readonly number[];
  readonly gearTorqueMultipliers: readonly number[];
}

export interface RouteSector {
  readonly id: "downtown" | "bridge" | "harbor" | "mountains" | "tunnel" | "skyline";
  readonly label: string;
  readonly startMeters: number;
  readonly accent: string;
}

export const ROUTE_LENGTH_METERS = 7200;
export const MAX_GEAR = 6;
export const IDLE_RPM = 950;
export const REV_LIMITER_RPM = 7600;
export const MAX_RPM = 7800;

export const ROUTE_SECTORS: readonly RouteSector[] = [
  { id: "downtown", label: "Kurohama Access", startMeters: 0, accent: "#ffb36b" },
  { id: "bridge", label: "Bayshore Span", startMeters: 1200, accent: "#ef82bd" },
  { id: "harbor", label: "Minato Wharf", startMeters: 2400, accent: "#7dd9ff" },
  { id: "mountains", label: "Ryujin Ridge", startMeters: 3600, accent: "#9fe0b0" },
  { id: "tunnel", label: "Yomikage Bore", startMeters: 4800, accent: "#ffc56e" },
  { id: "skyline", label: "Chuo Skyline", startMeters: 6000, accent: "#c9a2ff" }
];

/**
 * Reimei XR is the current hero car. The redline gearing reaches beyond its hard
 * limit, while torque and aerodynamic load balance at ~321 km/h. This separation
 * lets drafting add enough power to run well past natural without making
 * ordinary throttle capable of doing so: a lone drafter tops out around ~336
 * and a bump-draft train can work the pair toward the 348 ceiling. The 362
 * gear-6 limit keeps the rev limiter (~351 in 6th) from walling a train first.
 * Future cars can use the same model with another profile.
 */
export const REIMEI_XR_PERFORMANCE: DrivePerformanceProfile = {
  id: "reimei_xr",
  displayName: "Reimei XR",
  hardSpeedLimitKph: 348,
  naturalTopSpeedKph: 321,
  basePowerKphPerSecond: 38,
  aerodynamicDragAtNaturalTopKphPerSecond: 3.9,
  // 5th (272 @ 0.78) is tuned so its rev limiter still fires against the
  // heavier aero — the driver must get the shift-to-6th cue at full throttle.
  gearSpeedLimitsKph: [0, 58, 104, 158, 220, 272, 362],
  gearTorqueMultipliers: [0, 1.65, 1.27, 1.02, 0.84, 0.78, 0.58]
};

export const MAX_SPEED_KPH = REIMEI_XR_PERFORMANCE.hardSpeedLimitKph;
export const NATURAL_TOP_SPEED_KPH = REIMEI_XR_PERFORMANCE.naturalTopSpeedKph;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function moveToward(value: number, target: number, maxDelta: number): number {
  if (value < target) {
    return Math.min(target, value + maxDelta);
  }
  return Math.max(target, value - maxDelta);
}

export function speedLimitForGear(
  gear: number,
  performance: DrivePerformanceProfile = REIMEI_XR_PERFORMANCE
): number {
  const safeGear = clamp(Math.round(gear), 1, MAX_GEAR);
  return performance.gearSpeedLimitsKph[safeGear] ?? performance.hardSpeedLimitKph;
}

export function rpmForSpeed(
  speedKph: number,
  gear: number,
  shifting = false,
  performance: DrivePerformanceProfile = REIMEI_XR_PERFORMANCE
): number {
  const safeGear = clamp(Math.round(gear), 1, MAX_GEAR);
  const speedLimit = speedLimitForGear(safeGear, performance);
  const ratio = clamp(speedKph / speedLimit, 0, 1);
  const rpm = IDLE_RPM + ratio * (MAX_RPM - IDLE_RPM);
  return shifting ? Math.max(IDLE_RPM, rpm * 0.7) : rpm;
}

// Engine torque as a function of revs. Higher revs still pull harder, but the
// floor is deliberately well above zero: a real engine makes usable torque off
// idle, so a low gear should still move the car briskly at low revs (only tall
// gears feel weak down low, because their gear multiplier is small).
export function enginePowerFactor(rpm: number): number {
  const revProgress = clamp((rpm - IDLE_RPM) / (REV_LIMITER_RPM - IDLE_RPM), 0, 1);
  return 0.12 + Math.pow(revProgress, 1.5) * 0.88;
}

export function aerodynamicDragKphPerSecond(
  speedKph: number,
  performance: DrivePerformanceProfile = REIMEI_XR_PERFORMANCE
): number {
  const speedRatio = Math.max(0, speedKph) / performance.naturalTopSpeedKph;
  return performance.aerodynamicDragAtNaturalTopKphPerSecond * Math.pow(speedRatio, 4);
}

export function driveAccelerationKphPerSecond(state: DriveAccelerationState): number {
  const performance = state.performance ?? REIMEI_XR_PERFORMANCE;
  const safeGear = clamp(Math.round(state.gear), 1, MAX_GEAR);
  const shifting = state.shifting === true;
  const clutchDisengaged = state.clutchDisengaged === true;
  const effectiveThrottle =
    clamp(state.throttle, 0, 1) * (clutchDisengaged ? 0 : shifting ? 0.18 : 1);
  const brakePressure = clamp(state.brakePressure, 0, 1);
  const gearSpeedLimit = speedLimitForGear(safeGear, performance);
  const gearSpeedRatio = clamp(state.speedKph / gearSpeedLimit, 0, 1.08);
  const torqueMultiplier = performance.gearTorqueMultipliers[safeGear] ?? 0.76;
  const currentRpm = rpmForSpeed(state.speedKph, safeGear, false, performance);
  const ignitionCut = !shifting && state.throttle > 0.45 && currentRpm >= REV_LIMITER_RPM;
  const powerMultiplier = Math.max(0, state.powerMultiplier ?? 1);
  const availablePower =
    (ignitionCut ? 0 : 1) *
    performance.basePowerKphPerSecond *
    torqueMultiplier *
    enginePowerFactor(currentRpm) *
    powerMultiplier *
    Math.max(0.15, 1 - Math.pow(gearSpeedRatio, 3.4));
  const rollingDrag = 0.72 + state.speedKph * 0.006;
  const aerodynamicDrag = aerodynamicDragKphPerSecond(state.speedKph, performance);
  const brakingForce = brakePressure * (38 + state.speedKph * 0.055);
  const overRevEngineBrake = Math.max(0, gearSpeedRatio - 1) * 72;
  return effectiveThrottle * availablePower - rollingDrag - aerodynamicDrag - brakingForce - overRevEngineBrake;
}

export function createInitialDriveState(
  performance: DrivePerformanceProfile = REIMEI_XR_PERFORMANCE
): DriveState {
  const speedKph = 22;
  const gear = 1;
  return {
    speedKph,
    throttle: 0.12,
    brakePressure: 0,
    clutchPressure: 0,
    distanceMeters: 0,
    visualDistanceMeters: 0,
    elapsedSeconds: 0,
    gear,
    rpm: rpmForSpeed(speedKph, gear, false, performance),
    shiftTimer: 0,
    revLimiterActive: false,
    maxSpeedKph: speedKph,
    finished: false
  };
}

export function stepDriveModel(
  state: DriveState,
  input: DriveInputState,
  dt: number,
  performance: DrivePerformanceProfile = REIMEI_XR_PERFORMANCE
): DriveState {
  const safeDt = clamp(dt, 0, 0.05);
  const throttle = moveToward(state.throttle, input.accelerate ? 1 : 0, safeDt * (input.accelerate ? 1.7 : 2.1));
  const brakePressure = moveToward(state.brakePressure, input.brake ? 1 : 0, safeDt * (input.brake ? 3.4 : 4.8));
  const clutchDisengaged = input.clutch === true;
  const clutchPressure = moveToward(
    state.clutchPressure,
    clutchDisengaged ? 1 : 0,
    safeDt * (clutchDisengaged ? 5.8 : 7.4)
  );
  let shiftTimer = Math.max(0, state.shiftTimer - safeDt);
  let gear = state.gear;

  const selectedGear =
    input.selectGear === undefined
      ? null
      : clamp(Math.round(input.selectGear), 1, MAX_GEAR);
  if (
    clutchDisengaged &&
    shiftTimer <= 0 &&
    selectedGear !== null &&
    selectedGear !== gear
  ) {
    const shiftingUp = selectedGear > gear;
    gear = selectedGear;
    shiftTimer = shiftingUp ? 0.2 : 0.16;
  } else if (clutchDisengaged && shiftTimer <= 0 && input.shiftUp && gear < MAX_GEAR) {
    gear += 1;
    shiftTimer = 0.2;
  } else if (clutchDisengaged && shiftTimer <= 0 && input.shiftDown && gear > 1) {
    gear -= 1;
    shiftTimer = 0.16;
  }

  const shifting = shiftTimer > 0;
  const accelerationKphPerSecond = driveAccelerationKphPerSecond({
    speedKph: state.speedKph,
    gear,
    throttle,
    brakePressure,
    clutchDisengaged,
    shifting,
    powerMultiplier: input.draftPowerMultiplier ?? 1,
    performance
  });
  const speedKph = clamp(
    state.speedKph + accelerationKphPerSecond * safeDt,
    0,
    performance.hardSpeedLimitKph
  );
  const coupledRpm = rpmForSpeed(speedKph, gear, shifting, performance);
  const freeRevTarget = IDLE_RPM + throttle * (MAX_RPM - IDLE_RPM);
  const rpm = clutchDisengaged
    ? moveToward(state.rpm, freeRevTarget, safeDt * (throttle > 0.05 ? 9800 : 7200))
    : coupledRpm;
  const revLimiterActive = throttle > 0.45 && rpm >= REV_LIMITER_RPM;

  const distanceTravelMeters = (speedKph / 3.6) * safeDt;
  const distanceMeters = (state.distanceMeters + distanceTravelMeters) % ROUTE_LENGTH_METERS;
  const speedRatio = clamp(speedKph / performance.hardSpeedLimitKph, 0, 1);
  // Perceived road scroll runs at ~2x the physical speed so the sensation of
  // velocity reads strongly on a straight road (still ramps up with speed).
  const visualSpeedMultiplier = 1.4 + speedRatio * 1.5;
  const visualDistanceMeters =
    state.visualDistanceMeters + (speedKph / 3.6) * visualSpeedMultiplier * safeDt;
  return {
    speedKph,
    throttle,
    brakePressure,
    clutchPressure,
    distanceMeters,
    visualDistanceMeters,
    elapsedSeconds: state.elapsedSeconds + safeDt,
    gear,
    rpm,
    shiftTimer,
    revLimiterActive,
    maxSpeedKph: Math.max(state.maxSpeedKph, speedKph),
    finished: false
  };
}

export function getRouteSector(distanceMeters: number): RouteSector {
  let sector: RouteSector = ROUTE_SECTORS[0]!;
  for (const candidate of ROUTE_SECTORS) {
    if (distanceMeters >= candidate.startMeters) {
      sector = candidate;
    }
  }
  return sector;
}
