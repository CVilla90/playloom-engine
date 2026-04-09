import { describe, expect, it } from "vitest";
import type { LocalPlayerSyncState } from "./PublicRoomService";
import type { MatchPlayerSnapshot } from "./protocol";
import {
  buildPredictedLocalPlayerSnapshot,
  INPUT_SEND_INTERVAL_MS,
  reconcilePredictedLocalPlayerSnapshot,
  shouldSendInputUpdate
} from "./networkClientPrediction";

function createPlayerSnapshot(overrides: Partial<MatchPlayerSnapshot> = {}): MatchPlayerSnapshot {
  return {
    id: "player-1",
    name: "Carlos",
    joinedAt: 1_000,
    x: 100,
    y: 120,
    facing: { x: 1, y: 0 },
    flashlightOn: true,
    health: 100,
    maxHealth: 100,
    isDead: false,
    insideExitSafe: false,
    spawnProtectionTimeRemainingMs: null,
    speedBoostTimeRemainingMs: null,
    punchTimeRemainingMs: null,
    punchFacing: null,
    punchArmSide: null,
    ...overrides
  };
}

function createLocalSyncState(overrides: Partial<LocalPlayerSyncState> = {}): LocalPlayerSyncState {
  return {
    x: 112,
    y: 132,
    move: { x: 1, y: 0 },
    facing: { x: 1, y: 0 },
    flashlightOn: true,
    wantsInteract: false,
    wantsPunch: false,
    ...overrides
  };
}

describe("networkClientPrediction", () => {
  it("keeps local predicted movement while preserving authoritative combat state", () => {
    const authoritative = createPlayerSnapshot({
      health: 82,
      speedBoostTimeRemainingMs: 1400,
      punchTimeRemainingMs: 120
    });

    const predicted = buildPredictedLocalPlayerSnapshot(authoritative, createLocalSyncState());

    expect(predicted).toMatchObject({
      x: 112,
      y: 132,
      flashlightOn: true,
      health: 82,
      speedBoostTimeRemainingMs: 1400,
      punchTimeRemainingMs: 120
    });
  });

  it("snaps back to the authoritative position when local prediction drifts too far", () => {
    const authoritative = createPlayerSnapshot({
      x: 100,
      y: 120
    });

    const predicted = buildPredictedLocalPlayerSnapshot(authoritative, createLocalSyncState({
      x: 220,
      y: 260
    }));

    expect(predicted).toMatchObject({
      x: 100,
      y: 120
    });
  });

  it("reconciles new authoritative health without throwing away a close local prediction", () => {
    const authoritative = createPlayerSnapshot({
      health: 74
    });
    const predicted = createPlayerSnapshot({
      x: 116,
      y: 136,
      facing: { x: 0, y: 1 }
    });

    const reconciled = reconcilePredictedLocalPlayerSnapshot(authoritative, predicted);

    expect(reconciled).toMatchObject({
      x: 116,
      y: 136,
      facing: { x: 0, y: 1 },
      health: 74
    });
  });

  it("throttles identical movement updates until the send interval elapses", () => {
    const previous = createLocalSyncState();
    const current = createLocalSyncState({
      x: 118,
      y: 132
    });

    expect(shouldSendInputUpdate(current, previous, 1000, 990)).toBe(false);
    expect(shouldSendInputUpdate(current, previous, 1000 + INPUT_SEND_INTERVAL_MS + 1, 1000)).toBe(true);
  });

  it("sends action taps immediately even inside the throttle window", () => {
    const previous = createLocalSyncState();
    const current = createLocalSyncState({
      wantsPunch: true
    });

    expect(shouldSendInputUpdate(current, previous, 1000, 995)).toBe(true);
  });

  it("sends flashlight toggles immediately and keeps the predicted light state local-first", () => {
    const previous = createLocalSyncState({
      flashlightOn: false
    });
    const current = createLocalSyncState({
      flashlightOn: true
    });

    expect(shouldSendInputUpdate(current, previous, 1000, 995)).toBe(true);
    expect(buildPredictedLocalPlayerSnapshot(createPlayerSnapshot({
      flashlightOn: false
    }), current)?.flashlightOn).toBe(true);
  });
});
