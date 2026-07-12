import { describe, expect, it } from "vitest";
import { AuthoritativeRaceSession, routeRelativeMeters } from "./AuthoritativeRaceSession";
import {
  MAX_SPEED_KPH,
  NATURAL_TOP_SPEED_KPH,
  rpmForSpeed,
  stepDriveModel,
  type DriveState
} from "../drivingModel";
import { PLAYER_FOLLOW_GAP_METERS } from "../collision";
import { calculateDraftState } from "../draftModel";
import { createInitialTraffic, laneRoadFraction, type TrafficLane } from "../trafficModel";
import type { RaceRivalSnapshot, RaceTrafficSnapshot } from "./protocol";

const blueGold = { name: "Akira", mainColor: "blue", accentColor: "yellow" } as const;

interface TestPlayerState {
  drive: DriveState;
  lane: TrafficLane;
  laneFraction: number;
}

interface SessionInternals {
  players: Map<string, TestPlayerState>;
  rivals: RaceRivalSnapshot[];
  traffic: RaceTrafficSnapshot[];
}

function internals(session: AuthoritativeRaceSession): SessionInternals {
  return session as unknown as SessionInternals;
}

function stageFastPlayer(session: AuthoritativeRaceSession, distanceMeters = 100): TestPlayerState {
  const player = internals(session).players.get("one")!;
  player.lane = "left";
  player.laneFraction = laneRoadFraction("left");
  player.drive = {
    ...player.drive,
    distanceMeters,
    visualDistanceMeters: distanceMeters,
    speedKph: 320,
    gear: 6,
    rpm: rpmForSpeed(320, 6)
  };
  return player;
}

describe("AuthoritativeRaceSession", () => {
  it("rejects case-insensitive duplicate names and frees names when players leave", () => {
    const session = new AuthoritativeRaceSession(() => 0.5);
    expect(session.joinPlayer("one", blueGold, 100).ok).toBe(true);
    expect(session.joinPlayer("two", { ...blueGold, name: "  AKIRA  " }, 101)).toMatchObject({
      ok: false,
      reason: "That player name is already in this session."
    });
    session.removePlayer("one");
    expect(session.joinPlayer("two", { ...blueGold, name: "AKIRA" }, 102).ok).toBe(true);
  });

  it("spawns players in the starter sector without sharing the same lane slot", () => {
    const session = new AuthoritativeRaceSession(() => 0.25);
    session.joinPlayer("one", blueGold, 100);
    session.joinPlayer("two", { ...blueGold, name: "Mika" }, 101);
    const [one, two] = session.getSnapshot(102).players;
    expect(one?.distanceMeters).toBeGreaterThanOrEqual(0);
    expect(one?.distanceMeters).toBeLessThan(1200);
    expect(two?.distanceMeters).toBeGreaterThanOrEqual(0);
    expect(two?.distanceMeters).toBeLessThan(1200);
    expect(`${one?.lane}:${one?.distanceMeters}`).not.toBe(`${two?.lane}:${two?.distanceMeters}`);
  });

  it("advances drivetrain state from control intent on the server", () => {
    const session = new AuthoritativeRaceSession(() => 0.1);
    session.joinPlayer("one", blueGold, 0);
    const before = session.getSnapshot(0).players[0]!;
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
    session.tick(0);
    for (let now = 16; now <= 1000; now += 16) {
      session.tick(now);
    }
    const after = session.getSnapshot(1000).players[0]!;
    expect(after.speedKph).toBeGreaterThan(before.speedKph);
    expect(after.distanceMeters).toBeGreaterThan(before.distanceMeters);
    expect(after.acknowledgedInputSequence).toBe(1);
  });

  it("latches an authorized mobile H-gate selection through the server tick", () => {
    const session = new AuthoritativeRaceSession(() => 0.1);
    session.joinPlayer("one", blueGold, 0);
    session.applyInput("one", {
      type: "race_input",
      sequence: 1,
      accelerate: false,
      brake: false,
      clutch: false,
      shiftUp: false,
      shiftDown: false,
      selectGear: 2,
      steer: 0
    });
    session.tick(0);
    session.tick(16);
    expect(session.getSnapshot(16).players[0]?.gear).toBe(2);
  });

  it("applies authoritative drafting power from an AI rival ahead", () => {
    const session = new AuthoritativeRaceSession(() => 0);
    session.joinPlayer("one", blueGold, 0);
    const before = session.getSnapshot(0).players[0]!;
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
    session.tick(0);
    session.tick(16);
    const after = session.getSnapshot(16).players[0]!;
    const withoutDraft = stepDriveModel(before, { accelerate: true, brake: false }, 0.016);
    expect(after.speedKph).toBeGreaterThan(withoutDraft.speedKph);
  });

  it("restores a small authoritative draft from slow civilian traffic", () => {
    // Session construction consumes 20 seeded draws (5 ambient rivals x 3 +
    // the police interceptor's 5); spawn candidates start at draw 21, so the
    // second candidate (84 m, center lane) is draw 22.
    let randomCalls = 0;
    const session = new AuthoritativeRaceSession(() => {
      randomCalls += 1;
      if (randomCalls <= 20) return 0;
      return randomCalls === 22 ? 0 : 0.9;
    });
    session.joinPlayer("one", blueGold, 0);
    const snapshot = session.getSnapshot(0);
    const player = snapshot.players[0]!;
    const sedan = snapshot.traffic.find((vehicle) => vehicle.kind === "sedan")!;
    const draft = calculateDraftState(
      { id: player.id, lane: player.lane, speedKph: player.speedKph, relativeMeters: 0 },
      [{
        id: sedan.id,
        lane: sedan.lane,
        speedKph: sedan.speedKph,
        relativeMeters: routeRelativeMeters(player.distanceMeters, sedan.distanceMeters)
      }]
    );

    expect(player.lane).toBe("center");
    expect(draft.active).toBe(true);
    expect(draft.powerMultiplier).toBeGreaterThan(1);
    expect(draft.powerMultiplier).toBeLessThan(1.05);
  });

  it("applies a severe server-owned penalty when rear-ending a heavy truck", () => {
    const session = new AuthoritativeRaceSession(() => 0);
    session.joinPlayer("one", blueGold, 0);
    stageFastPlayer(session);
    const truck = createInitialTraffic().find((vehicle) => vehicle.kind === "truck")!;
    const { relativeMeters: _relativeMeters, ...globalTruck } = truck;
    const state = internals(session);
    state.rivals = [];
    state.traffic = [{
      ...globalTruck,
      lane: "left",
      laneFraction: laneRoadFraction("left"),
      distanceMeters: 108
    }];

    session.tick(0);
    session.tick(16);
    const snapshot = session.getSnapshot(16);
    expect(snapshot.players[0]!.speedKph).toBeLessThan(120);
    expect(snapshot.traffic[0]!.speedKph).toBeLessThan(160);
  });

  it("applies an authoritative speed penalty when rear-ending an AI rival", () => {
    const session = new AuthoritativeRaceSession(() => 0);
    session.joinPlayer("one", blueGold, 0);
    stageFastPlayer(session);
    const state = internals(session);
    const rival = state.rivals[0]!;
    state.traffic = [];
    state.rivals = [{
      ...rival,
      lane: "left",
      laneFraction: laneRoadFraction("left"),
      speedKph: 100,
      distanceMeters: 108,
      encounterActive: true,
      laneChange: null
    }];

    session.tick(0);
    session.tick(16);
    const snapshot = session.getSnapshot(16);
    expect(snapshot.players[0]!.speedKph).toBeLessThan(200);
    expect(snapshot.rivals[0]!.speedKph).toBeLessThan(230);
  });

  it("exchanges speed between players with the same authoritative contact gap", () => {
    const session = new AuthoritativeRaceSession(() => 0);
    session.joinPlayer("one", blueGold, 0);
    session.joinPlayer("two", { ...blueGold, name: "Mika" }, 0);
    const state = internals(session);
    const rear = state.players.get("one")!;
    const front = state.players.get("two")!;
    rear.lane = "left";
    rear.laneFraction = laneRoadFraction("left");
    rear.drive = {
      ...rear.drive,
      distanceMeters: 100,
      visualDistanceMeters: 100,
      speedKph: 200,
      gear: 6,
      rpm: rpmForSpeed(200, 6)
    };
    front.lane = "left";
    front.laneFraction = laneRoadFraction("left");
    front.drive = {
      ...front.drive,
      distanceMeters: 108,
      visualDistanceMeters: 108,
      speedKph: 100,
      gear: 6,
      rpm: rpmForSpeed(100, 6)
    };
    state.rivals = [];
    state.traffic = [];

    session.tick(0);
    session.tick(16);
    const snapshot = session.getSnapshot(16);
    const resolvedRear = snapshot.players.find((player) => player.id === "one")!;
    const resolvedFront = snapshot.players.find((player) => player.id === "two")!;

    expect(resolvedRear.speedKph).toBeLessThan(200);
    expect(resolvedFront.speedKph).toBeGreaterThan(100);
    expect(routeRelativeMeters(resolvedRear.distanceMeters, resolvedFront.distanceMeters))
      .toBeCloseTo(PLAYER_FOLLOW_GAP_METERS, 5);
  });

  it("keeps NPC world speed independent of the anchor player's motion", () => {
    const session = new AuthoritativeRaceSession(() => 0.5);
    session.joinPlayer("one", blueGold, 0);
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
    session.tick(0);
    const before = session.getSnapshot(0);
    // Far-from-everything cruising rival: its world advance must integrate its
    // own speed. The broken anchor-frame reconstruction subtracted the
    // anchor's speed from every NPC, so a moving player made rivals crawl.
    const cruiser = before.rivals.find((rival) => rival.id === "rival-red-01")!;
    const truckBefore = before.traffic.find((vehicle) => vehicle.kind === "truck")!;

    const elapsedSeconds = 20;
    for (let now = 16; now <= elapsedSeconds * 1000; now += 16) {
      session.tick(now);
    }

    const after = session.getSnapshot(elapsedSeconds * 1000);
    const player = after.players[0]!;
    expect(player.speedKph).toBeGreaterThan(30);

    const cruiserAfter = after.rivals.find((rival) => rival.id === cruiser.id)!;
    const rivalWorldAdvance =
      ((cruiserAfter.distanceMeters - cruiser.distanceMeters) % 7200 + 7200) % 7200;
    const impliedRivalSpeedKph = (rivalWorldAdvance / elapsedSeconds) * 3.6;
    expect(Math.abs(impliedRivalSpeedKph - cruiserAfter.speedKph)).toBeLessThan(6);

    const truckAfter = after.traffic.find((vehicle) => vehicle.id === truckBefore.id)!;
    const truckWorldAdvance =
      ((truckAfter.distanceMeters - truckBefore.distanceMeters) % 7200 + 7200) % 7200;
    const impliedTruckSpeedKph = (truckWorldAdvance / elapsedSeconds) * 3.6;
    expect(Math.abs(impliedTruckSpeedKph - truckAfter.speedKph)).toBeLessThan(15);
  });

  it("wakes a rival into racing mode when a non-anchor player is in range", () => {
    const session = new AuthoritativeRaceSession(() => 0.5);
    session.joinPlayer("one", blueGold, 0);
    session.joinPlayer("two", { ...blueGold, name: "Mika" }, 1);
    const state = internals(session);
    const scout = state.players.get("two")!;
    scout.lane = "center";
    scout.laneFraction = laneRoadFraction("center");
    scout.drive = { ...scout.drive, distanceMeters: 3000, visualDistanceMeters: 3000 };

    // Position one cruising rival just ahead of the SECOND player, far outside
    // the anchor's own encounter window, in a free lane so nothing blocks it.
    const rival = state.rivals[0]!;
    state.rivals = state.rivals.map((candidate, index) =>
      index === 0
        ? {
            ...candidate,
            lane: "right" as const,
            laneFraction: laneRoadFraction("right"),
            distanceMeters: 3060,
            encounterActive: false,
            laneChange: null
          }
        : candidate
    );
    const cruiseSpeedKph = rival.speedKph;

    session.tick(0);
    for (let now = 16; now <= 4000; now += 16) {
      session.tick(now);
    }

    const snapshot = session.getSnapshot(4000);
    const woken = snapshot.rivals.find((candidate) => candidate.id === rival.id)!;
    expect(woken.encounterActive).toBe(true);
    expect(woken.speedKph).toBeGreaterThan(cruiseSpeedKph + 5);
  });

  it("police interceptor crosses lanes and rams a session player", () => {
    const session = new AuthoritativeRaceSession(() => 0.5);
    session.joinPlayer("one", blueGold, 0);
    const state = internals(session);
    const target = state.players.get("one")!;
    target.lane = "center";
    target.laneFraction = laneRoadFraction("center");
    target.drive = { ...target.drive, distanceMeters: 3000, visualDistanceMeters: 3000 };
    const police = state.rivals.find((rival) => rival.kind === "police")!;
    state.traffic = [];
    state.rivals = [{
      ...police,
      lane: "right",
      laneFraction: laneRoadFraction("right"),
      distanceMeters: 2900,
      speedKph: 180,
      encounterActive: true,
      laneChange: null,
      laneChangeCooldown: 0,
      maxSpeedKphOverride: 321,
      accelerationMultiplierOverride: 1.1
    }];

    session.tick(0);
    for (let now = 16; now <= 8000; now += 16) {
      session.tick(now);
    }

    const snapshot = session.getSnapshot(8000);
    const interceptor = snapshot.rivals[0]!;
    const rammed = snapshot.players[0]!;
    // It hunted across lanes into the player's path...
    expect(interceptor.lane).toBe("center");
    // ...and the contact exchange shoved the idle player forward.
    expect(rammed.maxSpeedKph).toBeGreaterThan(15);
  });

  it("sustains a server-authoritative two-player draft train above solo speed", () => {
    const session = new AuthoritativeRaceSession(() => 0);
    session.joinPlayer("one", blueGold, 0);
    session.joinPlayer("two", { ...blueGold, name: "Mika" }, 0);
    const state = internals(session);
    const leader = state.players.get("one")!;
    const chaser = state.players.get("two")!;
    leader.lane = "center";
    leader.laneFraction = laneRoadFraction("center");
    leader.drive = {
      ...leader.drive,
      distanceMeters: 100,
      visualDistanceMeters: 100,
      speedKph: 320,
      gear: 6,
      rpm: rpmForSpeed(320, 6)
    };
    chaser.lane = "center";
    chaser.laneFraction = laneRoadFraction("center");
    chaser.drive = {
      ...chaser.drive,
      distanceMeters: 100 - PLAYER_FOLLOW_GAP_METERS,
      visualDistanceMeters: 100 - PLAYER_FOLLOW_GAP_METERS,
      speedKph: 320,
      gear: 6,
      rpm: rpmForSpeed(320, 6)
    };
    state.rivals = [];
    state.traffic = [];
    for (const [id, sequence] of [["one", 1], ["two", 1]] as const) {
      session.applyInput(id, {
        type: "race_input",
        sequence,
        accelerate: true,
        brake: false,
        clutch: false,
        shiftUp: false,
        shiftDown: false,
        selectGear: null,
        steer: 0
      });
    }

    session.tick(0);
    for (let now = 16; now <= 60_000; now += 16) {
      session.tick(now);
    }
    const snapshot = session.getSnapshot(60_000);
    const resolvedLeader = snapshot.players.find((player) => player.id === "one")!;
    const resolvedChaser = snapshot.players.find((player) => player.id === "two")!;

    expect(Math.min(resolvedLeader.speedKph, resolvedChaser.speedKph))
      .toBeGreaterThan(NATURAL_TOP_SPEED_KPH + 6);
    expect(Math.max(resolvedLeader.speedKph, resolvedChaser.speedKph))
      .toBeLessThanOrEqual(MAX_SPEED_KPH);
    expect(Math.abs(routeRelativeMeters(resolvedChaser.distanceMeters, resolvedLeader.distanceMeters)))
      .toBeLessThanOrEqual(PLAYER_FOLLOW_GAP_METERS + 1);
  });
});
