import { describe, expect, it } from "vitest";
import {
  MAX_GEAR,
  MAX_SPEED_KPH,
  NATURAL_TOP_SPEED_KPH,
  clamp,
  driveAccelerationKphPerSecond
} from "./drivingModel";
import { calculateDraftState, calculateLeadPushState, type DraftVehicle } from "./draftModel";
import { PLAYER_FOLLOW_GAP_METERS, resolveRoadVehicleCollisions } from "./collision";

// Integration proof of the draft train: two full-throttle Reimei-class cars —
// the chaser in the leader's slipstream, the leader bump-drafted from behind,
// nudge contact merging their speed through the real collision resolver —
// must sustain a cruise meaningfully above the solo natural top speed.
describe("wangan zero draft train", () => {
  function fullThrottleAcceleration(speedKph: number, powerMultiplier: number): number {
    return driveAccelerationKphPerSecond({
      speedKph,
      gear: MAX_GEAR,
      throttle: 1,
      brakePressure: 0,
      powerMultiplier
    });
  }

  it("lets a two-car bump-draft train cruise past the solo natural top", () => {
    const dt = 1 / 60;
    let chaserSpeedKph = 300; // plays the "player" slot in the resolver
    let leaderSpeedKph = 300;
    let gapMeters = PLAYER_FOLLOW_GAP_METERS;
    let contacts: ReadonlyMap<string, number> = new Map();

    for (let frame = 0; frame < 60 * 90; frame += 1) {
      const leaderVehicle: DraftVehicle = {
        id: "leader",
        lane: "center",
        speedKph: leaderSpeedKph,
        relativeMeters: gapMeters
      };
      const chaserVehicle: DraftVehicle = {
        id: "chaser",
        lane: "center",
        speedKph: chaserSpeedKph,
        relativeMeters: 0
      };
      const draft = calculateDraftState(chaserVehicle, [leaderVehicle]);
      const push = calculateLeadPushState(leaderVehicle, [chaserVehicle]);

      chaserSpeedKph = clamp(
        chaserSpeedKph + fullThrottleAcceleration(chaserSpeedKph, draft.powerMultiplier) * dt,
        0,
        MAX_SPEED_KPH
      );
      leaderSpeedKph = clamp(
        leaderSpeedKph + fullThrottleAcceleration(leaderSpeedKph, push.powerMultiplier) * dt,
        0,
        MAX_SPEED_KPH
      );
      gapMeters += ((leaderSpeedKph - chaserSpeedKph) / 3.6) * dt;

      const resolution = resolveRoadVehicleCollisions(
        [{
          id: "leader",
          lane: "center" as const,
          speedKph: leaderSpeedKph,
          relativeMeters: gapMeters,
          trainPartner: true
        }],
        chaserSpeedKph,
        "center",
        { dt, contacts }
      );
      contacts = resolution.contacts;
      chaserSpeedKph = resolution.playerSpeedKph;
      leaderSpeedKph = resolution.vehicles[0]!.speedKph;
      gapMeters = resolution.vehicles[0]!.relativeMeters;
    }

    // Both cars cruise clearly above what either could do alone, without ever
    // breaching the hard ceiling — and the pair stays nose-to-tail.
    expect(Math.min(chaserSpeedKph, leaderSpeedKph)).toBeGreaterThan(NATURAL_TOP_SPEED_KPH + 6);
    expect(Math.max(chaserSpeedKph, leaderSpeedKph)).toBeLessThanOrEqual(MAX_SPEED_KPH);
    expect(gapMeters).toBeLessThanOrEqual(PLAYER_FOLLOW_GAP_METERS + 1);
  });

  it("caps a solo car at the natural top under the same simulation", () => {
    const dt = 1 / 60;
    let speedKph = 300;
    for (let frame = 0; frame < 60 * 90; frame += 1) {
      speedKph = clamp(speedKph + fullThrottleAcceleration(speedKph, 1) * dt, 0, MAX_SPEED_KPH);
    }

    expect(speedKph).toBeLessThanOrEqual(NATURAL_TOP_SPEED_KPH + 1);
    expect(speedKph).toBeGreaterThan(NATURAL_TOP_SPEED_KPH - 4);
  });
});
