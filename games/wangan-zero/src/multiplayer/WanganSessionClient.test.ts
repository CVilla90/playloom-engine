import { describe, expect, it } from "vitest";
import { createInitialDriveState } from "../drivingModel";
import type { RacePlayerSnapshot, RaceSessionSnapshot } from "./protocol";
import { WanganSessionClient } from "./WanganSessionClient";

function player(id: string, distanceMeters: number, speedKph: number): RacePlayerSnapshot {
  return {
    ...createInitialDriveState(),
    id,
    name: id,
    mainColor: "blue",
    accentColor: "yellow",
    joinedAt: 0,
    distanceMeters,
    visualDistanceMeters: distanceMeters,
    speedKph,
    lane: "center",
    laneFraction: 0,
    laneChange: null,
    acknowledgedInputSequence: 0
  };
}

describe("WanganSessionClient contact world", () => {
  it("includes remote players in the same dead-reckoned collision frame", () => {
    const snapshot: RaceSessionSnapshot = {
      serverTime: 0,
      capacity: 12,
      players: [player("local", 0, 72), player("remote", 100, 144)],
      rivals: [],
      traffic: []
    };
    const client = Object.create(WanganSessionClient.prototype) as WanganSessionClient;
    Object.assign(client as unknown as Record<string, unknown>, {
      currentSnapshot: snapshot,
      playerId: "local",
      snapshotReceivedAt: 0,
      snapshotIntervalMs: 50
    });

    const world = client.getContactWorld(50)!;

    // Snapshot age (50 ms) + half the 50 ms snapshot interval = 75 ms.
    expect(world.originDistanceMeters).toBeCloseTo(1.5, 5);
    expect(world.players).toHaveLength(1);
    expect(world.players[0]!.id).toBe("remote");
    expect(world.players[0]!.distanceMeters).toBeCloseTo(103, 5);
  });
});
