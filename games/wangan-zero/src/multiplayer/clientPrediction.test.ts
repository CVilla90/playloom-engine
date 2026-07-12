import { describe, expect, it } from "vitest";
import {
  DEAD_RECKON_MAX_SECONDS,
  HARD_SNAP_SPEED_KPH,
  IMPACT_RECONCILE_HOLD_SECONDS,
  deadReckonDistanceMeters,
  reconcileDrive
} from "./clientPrediction";
import { AuthoritativeRaceSession, routeRelativeMeters } from "./AuthoritativeRaceSession";
import type { RaceSessionSnapshot } from "./protocol";
import {
  MAX_SPEED_KPH,
  ROUTE_LENGTH_METERS,
  clamp,
  createInitialDriveState,
  rpmForSpeed,
  stepDriveModel,
  type DriveState
} from "../drivingModel";
import { TRUCK_VEHICLE_MASS_FACTOR, resolveRoadVehicleCollisions } from "../collision";
import { createInitialTraffic, laneRoadFraction } from "../trafficModel";

function drive(overrides: Partial<DriveState>): DriveState {
  return { ...createInitialDriveState(), ...overrides };
}

describe("deadReckonDistanceMeters", () => {
  it("advances a vehicle by its speed over the snapshot age", () => {
    // 72 kph = 20 m/s
    expect(deadReckonDistanceMeters(100, 72, 0.1)).toBeCloseTo(102, 5);
  });

  it("caps the extrapolation window so a stalled snapshot stream freezes vehicles", () => {
    expect(deadReckonDistanceMeters(100, 72, 5)).toBeCloseTo(100 + 20 * DEAD_RECKON_MAX_SECONDS, 5);
  });

  it("never rewinds on a negative age and wraps the route loop", () => {
    expect(deadReckonDistanceMeters(100, 72, -1)).toBe(100);
    expect(deadReckonDistanceMeters(ROUTE_LENGTH_METERS - 1, 72, 0.1)).toBeCloseTo(1, 5);
  });
});

describe("reconcileDrive", () => {
  it("blends smoothly toward small divergence without reporting a snap", () => {
    const predicted = drive({ speedKph: 100, distanceMeters: 100 });
    const authoritative = drive({ speedKph: 110, distanceMeters: 104 });
    const result = reconcileDrive(predicted, authoritative, 1 / 60);
    expect(result.snappedSpeedDeltaKph).toBe(0);
    expect(result.state.speedKph).toBeGreaterThan(100);
    expect(result.state.speedKph).toBeLessThan(110);
  });

  it("hard-snaps and reports the correction on large speed divergence", () => {
    const predicted = drive({ speedKph: 320, distanceMeters: 100 });
    const authoritative = drive({ speedKph: 82, distanceMeters: 100 });
    const result = reconcileDrive(predicted, authoritative, 1 / 60);
    expect(result.state.speedKph).toBe(82);
    expect(result.snappedSpeedDeltaKph).toBeCloseTo(-238, 5);
  });

  it("holds a locally predicted bump exchange against a stale faster snapshot", () => {
    const predicted = drive({ speedKph: 83, distanceMeters: 100 });
    const stale = drive({ speedKph: 320, distanceMeters: 102 });
    const result = reconcileDrive(predicted, stale, 1 / 60, true);
    expect(result.state.speedKph).toBe(83);
    expect(result.snappedSpeedDeltaKph).toBe(0);
  });

  it("still hard-snaps on a teleport-class distance error during an impact hold", () => {
    const predicted = drive({ speedKph: 83, distanceMeters: 100 });
    const teleported = drive({ speedKph: 320, distanceMeters: 400 });
    const result = reconcileDrive(predicted, teleported, 1 / 60, true);
    expect(result.state.speedKph).toBe(320);
    expect(result.state.distanceMeters).toBe(400);
  });

  it("converges normally once the authoritative exchange lands near the prediction", () => {
    const predicted = drive({ speedKph: 83, distanceMeters: 100 });
    const confirmed = drive({ speedKph: 82.6, distanceMeters: 100.5 });
    const result = reconcileDrive(predicted, confirmed, 1 / 60, true);
    expect(result.snappedSpeedDeltaKph).toBe(0);
    expect(result.state.speedKph).toBeLessThan(83);
    expect(result.state.speedKph).toBeGreaterThan(82.5);
  });
});

// --- Integration: the GameScene contact loop against the real session --------
// Reproduces the live wiring: the server ticks at 60 Hz and publishes 20 Hz
// snapshots (optionally delayed), while the client predicts its own drive
// state, reconciles with an impact hold, and collides against dead-reckoned
// snapshot traffic — the same ordering GameScene.update uses.

interface ClientRunResult {
  localImpacts: number;
  snapCues: number;
  firstCueSpeedKph: number;
  maxSpeedAfterFirstCueKph: number;
  minSpeedAfterFirstCueKph: number;
  truckSpeedAfterCueKph: number;
  finalClientSpeedKph: number;
  finalServerSpeedKph: number;
}

function simulateTruckRam(snapshotLatencyMs: number): ClientRunResult {
  const session = new AuthoritativeRaceSession(() => 0);
  session.joinPlayer("one", { name: "Akira", mainColor: "blue", accentColor: "yellow" }, 0);
  const internals = session as unknown as {
    players: Map<string, { drive: DriveState; lane: string; laneFraction: number }>;
    rivals: unknown[];
    traffic: Array<Record<string, unknown>>;
  };
  const serverPlayer = internals.players.get("one")!;
  serverPlayer.lane = "left";
  serverPlayer.laneFraction = laneRoadFraction("left");
  serverPlayer.drive = {
    ...serverPlayer.drive,
    distanceMeters: 100,
    visualDistanceMeters: 100,
    speedKph: 320,
    gear: 6,
    rpm: rpmForSpeed(320, 6)
  };
  const truck = createInitialTraffic().find((vehicle) => vehicle.kind === "truck")!;
  const { relativeMeters: _relativeMeters, ...globalTruck } = truck;
  internals.rivals = [];
  internals.traffic = [{
    ...globalTruck,
    lane: "left",
    laneFraction: laneRoadFraction("left"),
    distanceMeters: 250,
    speedKph: 70
  }];
  session.applyInput("one", {
    type: "race_input",
    sequence: 1,
    accelerate: true,
    brake: false,
    clutch: false,
    shiftUp: false,
    shiftDown: false,
    selectGear: null,
    steer: 0
  });

  let clientState: DriveState = { ...serverPlayer.drive };
  let contacts: ReadonlyMap<string, number> = new Map();
  let impactHoldSeconds = 0;
  const pipe: Array<{ arriveAt: number; snapshot: RaceSessionSnapshot }> = [];
  let latest = session.getSnapshot(0);
  let latestReceivedAt = 0;
  let lastSnapshotTakenAt = 0;

  const result: ClientRunResult = {
    localImpacts: 0,
    snapCues: 0,
    firstCueSpeedKph: Number.NaN,
    maxSpeedAfterFirstCueKph: 0,
    minSpeedAfterFirstCueKph: Number.POSITIVE_INFINITY,
    truckSpeedAfterCueKph: Number.NaN,
    finalClientSpeedKph: 0,
    finalServerSpeedKph: 0
  };
  let cued = false;

  const frameMs = 1000 / 60;
  for (let step = 1; step <= 60 * 6; step += 1) {
    const now = step * frameMs;
    const dt = frameMs / 1000;

    session.tick(now);
    if (now - lastSnapshotTakenAt >= 50) {
      pipe.push({ arriveAt: now + snapshotLatencyMs, snapshot: session.getSnapshot(now) });
      lastSnapshotTakenAt = now;
    }
    while (pipe.length > 0 && pipe[0]!.arriveAt <= now) {
      latest = pipe.shift()!.snapshot;
      latestReceivedAt = now;
    }

    // Client frame, ordered like GameScene.update.
    clientState = stepDriveModel(clientState, { accelerate: true, brake: false }, dt);
    impactHoldSeconds = Math.max(0, impactHoldSeconds - dt);
    const reconciliation = reconcileDrive(clientState, latest.players[0]!, dt, impactHoldSeconds > 0);
    clientState = reconciliation.state;

    // Snapshot-consistent contact frame, mirroring WanganSessionClient.getContactWorld:
    // rebase against the snapshot's own player, dead-reckoned with a half-interval bias.
    const ageSeconds = (now - latestReceivedAt + 25) / 1000;
    const authoritative = latest.players[0]!;
    const originDistanceMeters = deadReckonDistanceMeters(
      authoritative.distanceMeters,
      authoritative.speedKph,
      ageSeconds
    );
    const vehicles = latest.traffic.map((vehicle) => ({
      id: `traffic:${vehicle.id}`,
      lane: vehicle.lane,
      speedKph: vehicle.speedKph,
      relativeMeters: routeRelativeMeters(
        originDistanceMeters,
        deadReckonDistanceMeters(vehicle.distanceMeters, vehicle.speedKph, ageSeconds)
      ),
      massFactor: vehicle.kind === "truck" ? TRUCK_VEHICLE_MASS_FACTOR : 1
    }));
    const collision = resolveRoadVehicleCollisions(vehicles, clientState.speedKph, "left", { dt, contacts });
    contacts = collision.contacts;
    if (collision.playerSpeedKph !== clientState.speedKph) {
      const speedKph = clamp(collision.playerSpeedKph, 0, MAX_SPEED_KPH);
      clientState = { ...clientState, speedKph, rpm: rpmForSpeed(speedKph, clientState.gear) };
    }
    if (collision.playerImpact) {
      impactHoldSeconds = IMPACT_RECONCILE_HOLD_SECONDS;
      result.localImpacts += 1;
    }
    if (Math.abs(reconciliation.snappedSpeedDeltaKph) > HARD_SNAP_SPEED_KPH) {
      result.snapCues += 1;
    }
    if (!cued && (collision.playerImpact || Math.abs(reconciliation.snappedSpeedDeltaKph) > HARD_SNAP_SPEED_KPH)) {
      cued = true;
      result.firstCueSpeedKph = clientState.speedKph;
      result.truckSpeedAfterCueKph = session.getSnapshot(now).traffic[0]!.speedKph;
    } else if (cued) {
      result.maxSpeedAfterFirstCueKph = Math.max(result.maxSpeedAfterFirstCueKph, clientState.speedKph);
      result.minSpeedAfterFirstCueKph = Math.min(result.minSpeedAfterFirstCueKph, clientState.speedKph);
    }
  }

  result.finalClientSpeedKph = clientState.speedKph;
  result.finalServerSpeedKph = session.getSnapshot(6000).players[0]!.speedKph;
  return result;
}

describe("client contact prediction against the authoritative session", () => {
  it("fires the local exchange and its cue when ramming the truck over a realistic link", () => {
    const run = simulateTruckRam(30);
    // The local resolver saw the contact itself — the crash cue and the
    // mass-weighted exchange happen client-side, not as a silent teleport.
    expect(run.localImpacts).toBeGreaterThanOrEqual(1);
    // Reconciliation never fought the predicted exchange back up to cruise.
    expect(run.snapCues).toBe(0);
    // Canonical formula outcome: the bumper eats most of the delta, the heavy
    // truck still gets launched forward.
    expect(run.firstCueSpeedKph).toBeLessThan(160);
    expect(run.truckSpeedAfterCueKph).toBeGreaterThan(100);
    // No pinball: after the hit the player stays in the exchanged speed band.
    expect(run.maxSpeedAfterFirstCueKph).toBeLessThan(180);
    // Client and server agree at the end of the run.
    expect(Math.abs(run.finalClientSpeedKph - run.finalServerSpeedKph)).toBeLessThan(10);
  });

  it("never lets a crash land silently even on a zero-latency link", () => {
    const run = simulateTruckRam(0);
    expect(run.localImpacts + run.snapCues).toBeGreaterThanOrEqual(1);
    expect(run.maxSpeedAfterFirstCueKph).toBeLessThan(180);
    expect(Math.abs(run.finalClientSpeedKph - run.finalServerSpeedKph)).toBeLessThan(10);
  });
});
