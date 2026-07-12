import { describe, expect, it } from "vitest";
import {
  ROUTE_LENGTH_METERS,
  MAX_GEAR,
  MAX_SPEED_KPH,
  NATURAL_TOP_SPEED_KPH,
  REV_LIMITER_RPM,
  REIMEI_XR_PERFORMANCE,
  createInitialDriveState,
  driveAccelerationKphPerSecond,
  enginePowerFactor,
  getRouteSector,
  rpmForSpeed,
  speedLimitForGear,
  stepDriveModel
} from "./drivingModel";

describe("midnight artery driving model", () => {
  it("requires the driver to shift through the sequential gearbox", () => {
    let state = createInitialDriveState();
    for (let frame = 0; frame < 60 * 90; frame += 1) {
      const shiftUp = state.revLimiterActive && state.gear < MAX_GEAR;
      state = stepDriveModel(state, { accelerate: true, brake: false, clutch: shiftUp, shiftUp }, 1 / 60);
    }

    expect(state.speedKph).toBeGreaterThan(170);
    expect(state.gear).toBe(MAX_GEAR);
    expect(state.distanceMeters).toBeGreaterThan(500);
  });

  it("brakes harder than the car coasts", () => {
    let coast = createInitialDriveState();
    let brake = createInitialDriveState();
    for (let i = 0; i < 120; i += 1) {
      coast = stepDriveModel(coast, { accelerate: false, brake: false }, 1 / 60);
      brake = stepDriveModel(brake, { accelerate: false, brake: true }, 1 / 60);
    }

    expect(brake.speedKph).toBeLessThan(coast.speedKph - 20);
  });

  it("uses stable manual gear and rpm bands", () => {
    expect(speedLimitForGear(1)).toBe(58);
    expect(speedLimitForGear(3)).toBe(158);
    expect(speedLimitForGear(5)).toBe(272);
    expect(speedLimitForGear(6)).toBe(362);
    expect(rpmForSpeed(80, 2)).toBeGreaterThan(rpmForSpeed(48, 2));
  });

  it("models Reimei XR with a natural torque limit below its boost-only ceiling", () => {
    expect(REIMEI_XR_PERFORMANCE.displayName).toBe("Reimei XR");
    expect(NATURAL_TOP_SPEED_KPH).toBe(321);
    expect(MAX_SPEED_KPH).toBe(348);

    const naturalAt321 = driveAccelerationKphPerSecond({
      speedKph: 321,
      gear: MAX_GEAR,
      throttle: 1,
      brakePressure: 0
    });
    const naturalAt322 = driveAccelerationKphPerSecond({
      speedKph: 322,
      gear: MAX_GEAR,
      throttle: 1,
      brakePressure: 0
    });
    // Trailing draft at the 12 m bumper gap (~1.59x) holds a train's rear car
    // in the mid-330s; being bump-drafted (~1.18x) holds a leader past natural.
    const draftedAt334 = driveAccelerationKphPerSecond({
      speedKph: 334,
      gear: MAX_GEAR,
      throttle: 1,
      brakePressure: 0,
      powerMultiplier: 1.59
    });
    const pushedAt326 = driveAccelerationKphPerSecond({
      speedKph: 326,
      gear: MAX_GEAR,
      throttle: 1,
      brakePressure: 0,
      powerMultiplier: 1.18
    });

    expect(naturalAt321).toBeGreaterThan(0);
    expect(naturalAt322).toBeLessThan(0);
    expect(draftedAt334).toBeGreaterThan(0);
    expect(pushedAt326).toBeGreaterThan(0);
  });

  it("never exceeds Reimei XR's absolute limit even with excessive boost", () => {
    const state = {
      ...createInitialDriveState(),
      speedKph: 347.99,
      throttle: 1,
      gear: MAX_GEAR,
      rpm: rpmForSpeed(347.99, MAX_GEAR)
    };
    const next = stepDriveModel(
      state,
      { accelerate: true, brake: false, draftPowerMultiplier: 3 },
      0.05
    );

    expect(next.speedKph).toBe(MAX_SPEED_KPH);
  });

  it("produces substantially more power as revs rise", () => {
    expect(enginePowerFactor(1800)).toBeLessThan(enginePowerFactor(4200));
    expect(enginePowerFactor(4200)).toBeLessThan(enginePowerFactor(7200));
    expect(enginePowerFactor(7200)).toBeGreaterThan(0.85);
  });

  it("applies draft as a power multiplier during acceleration", () => {
    const base = driveAccelerationKphPerSecond({
      speedKph: 120,
      gear: 3,
      throttle: 1,
      brakePressure: 0,
      powerMultiplier: 1
    });
    const drafted = driveAccelerationKphPerSecond({
      speedKph: 120,
      gear: 3,
      throttle: 1,
      brakePressure: 0,
      powerMultiplier: 1.25
    });

    expect(drafted).toBeGreaterThan(base);
  });

  it("requires the clutch for sequential upshifts and downshifts", () => {
    let state = createInitialDriveState();
    state = stepDriveModel(state, { accelerate: false, brake: false, shiftUp: true }, 1 / 60);
    expect(state.gear).toBe(1);

    state = stepDriveModel(state, { accelerate: false, brake: false, clutch: true, shiftUp: true }, 1 / 60);
    expect(state.gear).toBe(2);

    state = { ...state, shiftTimer: 0 };
    state = stepDriveModel(state, { accelerate: false, brake: false, clutch: true, shiftDown: true }, 1 / 60);
    expect(state.gear).toBe(1);

    state = { ...state, gear: MAX_GEAR, shiftTimer: 0 };
    state = stepDriveModel(state, { accelerate: false, brake: false, clutch: true, shiftUp: true }, 1 / 60);
    expect(state.gear).toBe(MAX_GEAR);
  });

  it("allows direct H-gate selection only while the clutch is held", () => {
    let state = createInitialDriveState();
    state = stepDriveModel(
      state,
      { accelerate: false, brake: false, selectGear: 5 },
      1 / 60
    );
    expect(state.gear).toBe(1);

    state = stepDriveModel(
      { ...state, shiftTimer: 0 },
      { accelerate: false, brake: false, clutch: true, selectGear: 5 },
      1 / 60
    );
    expect(state.gear).toBe(5);
  });

  it("free-revs without driving the wheels while the clutch is held", () => {
    const start = { ...createInitialDriveState(), speedKph: 80, gear: 3, rpm: rpmForSpeed(80, 3) };
    let clutched = start;
    let coupled = start;
    for (let frame = 0; frame < 60; frame += 1) {
      clutched = stepDriveModel(clutched, { accelerate: true, brake: false, clutch: true }, 1 / 60);
      coupled = stepDriveModel(coupled, { accelerate: true, brake: false, clutch: false }, 1 / 60);
    }

    expect(clutched.rpm).toBeGreaterThan(REV_LIMITER_RPM - 300);
    expect(clutched.speedKph).toBeLessThan(start.speedKph);
    expect(coupled.speedKph).toBeGreaterThan(start.speedKph);
  });

  it("holds first gear at the rev limiter until the driver shifts", () => {
    let state = createInitialDriveState();
    let limiterFrames = 0;
    for (let frame = 0; frame < 60 * 10; frame += 1) {
      state = stepDriveModel(state, { accelerate: true, brake: false }, 1 / 60);
      limiterFrames += Number(state.revLimiterActive);
    }

    expect(state.gear).toBe(1);
    expect(state.speedKph).toBeLessThanOrEqual(speedLimitForGear(1));
    expect(limiterFrames).toBeGreaterThan(0);
  });

  it("amplifies perceived road travel progressively with speed", () => {
    const lowState = createInitialDriveState();
    const lowNext = stepDriveModel(lowState, { accelerate: false, brake: false }, 0.05);
    const lowActualTravel = lowNext.distanceMeters - lowState.distanceMeters;
    const lowVisualTravel = lowNext.visualDistanceMeters - lowState.visualDistanceMeters;

    const highState = {
      ...createInitialDriveState(),
      speedKph: 280,
      gear: MAX_GEAR,
      rpm: rpmForSpeed(280, MAX_GEAR)
    };
    const highNext = stepDriveModel(highState, { accelerate: false, brake: false }, 0.05);
    const highActualTravel = highNext.distanceMeters - highState.distanceMeters;
    const highVisualTravel = highNext.visualDistanceMeters - highState.visualDistanceMeters;

    expect(lowVisualTravel / lowActualTravel).toBeLessThan(highVisualTravel / highActualTravel);
    expect(highVisualTravel / highActualTravel).toBeGreaterThan(2.6);
  });

  it("rewards sequential shifting over launching in fifth gear", () => {
    let sequential = createInitialDriveState();
    let fifthGear = {
      ...createInitialDriveState(),
      gear: MAX_GEAR,
      rpm: rpmForSpeed(createInitialDriveState().speedKph, MAX_GEAR)
    };

    for (let frame = 0; frame < 60 * 25; frame += 1) {
      const shiftUp = sequential.revLimiterActive && sequential.gear < MAX_GEAR;
      sequential = stepDriveModel(sequential, { accelerate: true, brake: false, clutch: shiftUp, shiftUp }, 1 / 60);
      fifthGear = stepDriveModel(fifthGear, { accelerate: true, brake: false }, 1 / 60);
    }

    expect(sequential.speedKph).toBeGreaterThan(fifthGear.speedKph + 50);
    expect(sequential.distanceMeters).toBeGreaterThan(fifthGear.distanceMeters * 1.5);
  });

  it("selects authored route sectors by distance", () => {
    expect(getRouteSector(0).id).toBe("downtown");
    expect(getRouteSector(1500).id).toBe("bridge");
    expect(getRouteSector(2800).id).toBe("harbor");
    expect(getRouteSector(4000).id).toBe("mountains");
    expect(getRouteSector(5200).id).toBe("tunnel");
    expect(getRouteSector(6500).id).toBe("skyline");
  });

  it("loops route progress instead of finishing the run", () => {
    const state = {
      ...createInitialDriveState(),
      speedKph: 200,
      distanceMeters: ROUTE_LENGTH_METERS - 0.1
    };
    const looped = stepDriveModel(state, { accelerate: true, brake: false }, 1 / 60);
    expect(looped.distanceMeters).toBeLessThan(1);
    expect(looped.finished).toBe(false);
  });

  it("allows a full-throttle run to keep cruising across route loops", () => {
    let state = createInitialDriveState();
    for (let frame = 0; frame < 60 * 120; frame += 1) {
      const shiftUp = state.revLimiterActive && state.gear < MAX_GEAR;
      state = stepDriveModel(state, { accelerate: true, brake: false, clutch: shiftUp, shiftUp }, 1 / 60);
    }

    expect(state.finished).toBe(false);
    expect(state.distanceMeters).toBeGreaterThanOrEqual(0);
    expect(state.distanceMeters).toBeLessThan(ROUTE_LENGTH_METERS);
    expect(state.maxSpeedKph).toBeGreaterThan(210);
  });
});
