import { describe, expect, it } from "vitest";
import {
  DRAFT_MAX_DISTANCE_METERS,
  DRAFT_MIN_DISTANCE_METERS,
  LEAD_PUSH_MAX_DISTANCE_METERS,
  LEAD_PUSH_MAX_POWER_MULTIPLIER,
  calculateDraftState,
  calculateLeadPushState,
  draftBoostRatio,
  findDraftTarget,
  findLeadPusher,
  leadPushRatio,
  type DraftVehicle
} from "./draftModel";

function vehicle(overrides: Partial<DraftVehicle> & Pick<DraftVehicle, "id">): DraftVehicle {
  return {
    lane: "center",
    speedKph: 180,
    relativeMeters: 0,
    ...overrides
  };
}

describe("wangan zero draft model", () => {
  it("chooses the nearest same-lane vehicle ahead", () => {
    const target = findDraftTarget(
      vehicle({ id: "player" }),
      [
        vehicle({ id: "far", relativeMeters: 42 }),
        vehicle({ id: "near", relativeMeters: 14 }),
        vehicle({ id: "behind", relativeMeters: -8 })
      ]
    );

    expect(target?.id).toBe("near");
  });

  it("ignores vehicles in other lanes", () => {
    const draft = calculateDraftState(
      vehicle({ id: "player" }),
      [vehicle({ id: "front", lane: "left", speedKph: 220, relativeMeters: 12 })]
    );

    expect(draft.active).toBe(false);
    expect(draft.powerMultiplier).toBe(1);
  });

  it("does not boost when the target is too far away", () => {
    const draft = calculateDraftState(
      vehicle({ id: "player" }),
      [vehicle({ id: "front", speedKph: 220, relativeMeters: DRAFT_MAX_DISTANCE_METERS + 1 })]
    );

    expect(draft.active).toBe(false);
    expect(draft.targetId).toBe("front");
    expect(draft.powerMultiplier).toBe(1);
  });

  it("reaches maximum distance boost at one meter", () => {
    const maxBoost = draftBoostRatio(DRAFT_MIN_DISTANCE_METERS, 220);
    const closeBoost = draftBoostRatio(12, 220);

    expect(maxBoost).toBeGreaterThan(closeBoost);
    expect(maxBoost).toBeCloseTo(draftBoostRatio(0.5, 220));
  });

  it("scales boost by distance and front vehicle speed", () => {
    expect(draftBoostRatio(12, 220)).toBeGreaterThan(draftBoostRatio(250, 220));
    expect(draftBoostRatio(250, 220)).toBeGreaterThan(draftBoostRatio(390, 220));
    expect(draftBoostRatio(12, 220)).toBeGreaterThan(draftBoostRatio(12, 90));
  });

  it("starts a light wake near 400 m and builds strongly toward the bumper", () => {
    expect(draftBoostRatio(390, 240)).toBeGreaterThan(0.02);
    expect(draftBoostRatio(300, 240)).toBeGreaterThan(draftBoostRatio(390, 240));
    expect(draftBoostRatio(100, 240)).toBeGreaterThan(0.5);
    expect(draftBoostRatio(12, 240)).toBeGreaterThan(0.9);
    expect(draftBoostRatio(400, 240)).toBe(0);
  });

  it("chooses the nearest same-lane vehicle behind as the pusher", () => {
    const pusher = findLeadPusher(
      vehicle({ id: "leader", relativeMeters: 0 }),
      [
        vehicle({ id: "far-back", relativeMeters: -40 }),
        vehicle({ id: "near-back", relativeMeters: -9 }),
        vehicle({ id: "ahead", relativeMeters: 20 }),
        vehicle({ id: "other-lane", lane: "left", relativeMeters: -4 })
      ]
    );

    expect(pusher?.id).toBe("near-back");
  });

  it("boosts a leader with a fast car glued to its bumper", () => {
    const push = calculateLeadPushState(
      vehicle({ id: "leader", speedKph: 300, relativeMeters: 0 }),
      [vehicle({ id: "chaser", speedKph: 298, relativeMeters: -6 })]
    );

    expect(push.active).toBe(true);
    expect(push.pusherId).toBe("chaser");
    expect(push.powerMultiplier).toBeGreaterThan(1);
    expect(push.powerMultiplier).toBeLessThanOrEqual(LEAD_PUSH_MAX_POWER_MULTIPLIER);
  });

  it("fades the push with distance and ends it past the push window", () => {
    expect(leadPushRatio(6, 298, 300)).toBeGreaterThan(leadPushRatio(20, 298, 300));
    expect(leadPushRatio(20, 298, 300)).toBeGreaterThan(0);
    expect(leadPushRatio(LEAD_PUSH_MAX_DISTANCE_METERS, 298, 300)).toBe(0);
  });

  it("forms no pressure pocket behind a pusher that cannot keep pace", () => {
    expect(leadPushRatio(6, 100, 300)).toBe(0);
    const push = calculateLeadPushState(
      vehicle({ id: "leader", speedKph: 300, relativeMeters: 0 }),
      [vehicle({ id: "slow-chaser", speedKph: 100, relativeMeters: -6 })]
    );
    expect(push.active).toBe(false);
    expect(push.powerMultiplier).toBe(1);
  });
});
