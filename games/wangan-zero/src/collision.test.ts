import { describe, expect, it } from "vitest";
import {
  BUMP_FRONT_GAIN_RATIO,
  BUMP_NUDGE_THRESHOLD_KPH,
  BUMP_REAR_LOSS_RATIO,
  CAR_COLLISION_LENGTH_METERS,
  PLAYER_FOLLOW_GAP_METERS,
  TRUCK_VEHICLE_MASS_FACTOR,
  resolveRoadVehicleCollisions,
  resolveTrafficCollisions
} from "./collision";
import type { TrafficVehicle } from "./trafficModel";

function car(overrides: Partial<TrafficVehicle> & Pick<TrafficVehicle, "id">): TrafficVehicle {
  return {
    kind: "sedan",
    lane: "center",
    laneFraction: 0,
    speedKph: 90,
    cruiseSpeedKph: 90,
    relativeMeters: 100,
    laneChangeCooldown: 0,
    cycle: 0,
    ...overrides
  };
}

describe("wangan zero collision resolution", () => {
  it("defines a sane traffic collision box and exchange ratios", () => {
    expect(CAR_COLLISION_LENGTH_METERS).toBeGreaterThan(3);
    expect(CAR_COLLISION_LENGTH_METERS).toBeLessThan(7);
    expect(PLAYER_FOLLOW_GAP_METERS).toBeGreaterThanOrEqual(CAR_COLLISION_LENGTH_METERS);
    // Loss stays within the closing delta (the bumper can never end up slower
    // than the car it hit was going) and exceeds the gain (crunch is lost, so
    // bumping never creates net speed).
    expect(BUMP_REAR_LOSS_RATIO).toBeLessThanOrEqual(1);
    expect(BUMP_REAR_LOSS_RATIO).toBeGreaterThan(BUMP_FRONT_GAIN_RATIO);
    // Gain + loss over 100% of the delta means the bumped car exits faster
    // than the bumper — the pair separates instead of re-colliding forever.
    expect(BUMP_FRONT_GAIN_RATIO + BUMP_REAR_LOSS_RATIO).toBeGreaterThan(1);
  });

  it("exchanges speed when the player rear-ends a slower car", () => {
    const traffic = [car({ id: "ahead", lane: "center", speedKph: 88, relativeMeters: 3 })];
    const result = resolveTrafficCollisions(traffic, 210, "center");

    // delta 122: the player keeps 210 - 0.65*122, the sedan gains 0.5*122.
    expect(result.playerSpeedKph).toBeCloseTo(130.7, 5);
    expect(result.traffic[0]!.speedKph).toBeCloseTo(149, 5);
    expect(result.playerImpact).toBe(true);
    // The bumped car exits faster than the bumper, so the pair separates.
    expect(result.traffic[0]!.speedKph).toBeGreaterThan(result.playerSpeedKph);
    // The player can never end up slower than the car it hit was going.
    expect(result.playerSpeedKph).toBeGreaterThanOrEqual(88);
    // The blocked car is held a bumper ahead rather than sinking into the player.
    expect(result.traffic[0]!.relativeMeters).toBe(PLAYER_FOLLOW_GAP_METERS);
  });

  it("fires one exchange per contact and holds a speed cap while re-arming", () => {
    const traffic = [car({ id: "ahead", lane: "center", speedKph: 88, relativeMeters: 3 })];
    const first = resolveRoadVehicleCollisions(traffic, 210, "center");
    expect(first.playerImpact).toBe(true);

    const second = resolveRoadVehicleCollisions(traffic, 210, "center", {
      contacts: first.contacts
    });

    // Same overlap within the cooldown: no fresh exchange, no donated speed —
    // just the old-style cap so the player cannot drive through.
    expect(second.playerImpact).toBe(false);
    expect(second.playerSpeedKph).toBe(88);
    expect(second.vehicles[0]!.speedKph).toBe(88);
  });

  it("merges train partners to their momentum average on a soft nudge", () => {
    const result = resolveRoadVehicleCollisions(
      [{
        id: "rival:lead",
        lane: "center" as const,
        speedKph: 200,
        relativeMeters: 5,
        trainPartner: true
      }],
      206,
      "center"
    );

    expect(206 - 200).toBeLessThan(BUMP_NUDGE_THRESHOLD_KPH);
    expect(result.playerSpeedKph).toBeCloseTo(203, 5);
    expect(result.vehicles[0]!.speedKph).toBeCloseTo(203, 5);
    expect(result.playerImpact).toBe(false);
  });

  it("only caps the player when nudging civilian traffic — no free bulldozing", () => {
    const traffic = [car({ id: "ahead", lane: "center", speedKph: 88, relativeMeters: 5 })];
    const result = resolveTrafficCollisions(traffic, 92, "center");

    expect(result.playerSpeedKph).toBe(88);
    expect(result.traffic[0]!.speedKph).toBe(88);
    expect(result.playerImpact).toBe(false);
  });

  it("trades mass-weighted speed when shunting the freight truck", () => {
    const result = resolveRoadVehicleCollisions(
      [{
        id: "traffic:freight",
        lane: "center" as const,
        speedKph: 60,
        relativeMeters: 3,
        massFactor: TRUCK_VEHICLE_MASS_FACTOR
      }],
      210,
      "center"
    );

    // delta 150 against a 2.6x mass: the truck barely moves while the player
    // eats nearly the whole closing speed.
    expect(result.vehicles[0]!.speedKph).toBeCloseTo(60 + 150 * 0.5 * (2 / 3.6), 4);
    expect(result.playerSpeedKph).toBeCloseTo(210 - 150 * 0.65 * (5.2 / 3.6), 4);
    expect(result.playerSpeedKph).toBeGreaterThanOrEqual(60);
    expect(result.playerImpact).toBe(true);
  });

  it("never pushes either participant past its mechanical speed limit", () => {
    const frontCapped = resolveRoadVehicleCollisions(
      [{
        id: "limited-leader",
        lane: "center" as const,
        speedKph: 100,
        relativeMeters: 3,
        maxSpeedKph: 140,
        trainPartner: true
      }],
      200,
      "center",
      { playerMaxSpeedKph: 180 }
    );

    expect(frontCapped.vehicles[0]!.speedKph).toBe(140);
    expect(frontCapped.playerSpeedKph).toBeLessThan(frontCapped.vehicles[0]!.speedKph);
    expect(frontCapped.playerSpeedKph).toBeLessThanOrEqual(180);

    const playerCapped = resolveRoadVehicleCollisions(
      [{
        id: "rear-launcher",
        lane: "center" as const,
        speedKph: 500,
        relativeMeters: -2,
        maxSpeedKph: 500,
        trainPartner: true
      }],
      340,
      "center",
      { playerMaxSpeedKph: 348 }
    );

    expect(playerCapped.playerSpeedKph).toBe(348);
    expect(playerCapped.vehicles[0]!.speedKph).toBeLessThanOrEqual(348);
  });

  it("anchors a soft train to the lower partner's cap without repeated nudges", () => {
    const result = resolveRoadVehicleCollisions(
      [{
        id: "limited-leader",
        lane: "center" as const,
        speedKph: 338,
        relativeMeters: 5,
        maxSpeedKph: 340,
        trainPartner: true
      }],
      344,
      "center",
      { playerMaxSpeedKph: 348 }
    );

    expect(result.playerSpeedKph).toBe(340);
    expect(result.vehicles[0]!.speedKph).toBe(340);
    expect(result.playerImpact).toBe(false);
  });

  it("boosts the player when a faster train partner shunts it from behind", () => {
    const result = resolveRoadVehicleCollisions(
      [{
        id: "rival:chaser",
        lane: "center" as const,
        speedKph: 110,
        relativeMeters: -2,
        trainPartner: true
      }],
      40,
      "center"
    );

    // delta 70: the player gains 35, the chaser keeps 110 - 0.65*70.
    expect(result.playerSpeedKph).toBeCloseTo(75, 5);
    expect(result.vehicles[0]!.speedKph).toBeCloseTo(64.5, 5);
    expect(result.vehicles[0]!.relativeMeters).toBe(-PLAYER_FOLLOW_GAP_METERS);
    expect(result.playerImpact).toBe(true);
  });

  it("does not exchange with a faster car ahead that is already pulling away", () => {
    const traffic = [car({ id: "ahead", lane: "center", speedKph: 140, relativeMeters: 8 })];
    const result = resolveTrafficCollisions(traffic, 100, "center");

    expect(result.playerSpeedKph).toBe(100);
    expect(result.traffic[0]!.speedKph).toBe(140);
    expect(result.playerImpact).toBe(false);
  });

  it("does not slow the player for a car it has not caught yet", () => {
    const traffic = [car({ id: "ahead", lane: "center", speedKph: 88, relativeMeters: 120 })];
    const result = resolveTrafficCollisions(traffic, 210, "center");

    expect(result.playerSpeedKph).toBe(210);
    expect(result.playerImpact).toBe(false);
    expect(result.traffic[0]!.relativeMeters).toBe(120);
  });

  it("ignores traffic in the side lanes when resolving player contact", () => {
    const traffic = [
      car({ id: "left", lane: "left", speedKph: 84, relativeMeters: 2 }),
      car({ id: "right", lane: "right", speedKph: 84, relativeMeters: 2 })
    ];
    const result = resolveTrafficCollisions(traffic, 210, "center");

    expect(result.playerSpeedKph).toBe(210);
    expect(result.playerImpact).toBe(false);
  });

  it("exchanges with traffic in the player's own lane, not other lanes", () => {
    const traffic = [
      car({ id: "center-blocker", lane: "center", speedKph: 84, relativeMeters: 3 }),
      car({ id: "left-blocker", lane: "left", speedKph: 90, relativeMeters: 3 })
    ];

    // In the left lane, only the left car exchanges; the center car is ignored.
    const result = resolveTrafficCollisions(traffic, 210, "left");
    expect(result.playerSpeedKph).toBeCloseTo(210 - 120 * 0.65, 5);
    expect(result.playerImpact).toBe(true);
    const leftBlocker = result.traffic.find((v) => v.id === "left-blocker")!;
    expect(leftBlocker.speedKph).toBeCloseTo(150, 5);
    expect(leftBlocker.relativeMeters).toBe(PLAYER_FOLLOW_GAP_METERS);
    // The center car was not caught, so it keeps its position and speed.
    const centerBlocker = result.traffic.find((v) => v.id === "center-blocker")!;
    expect(centerBlocker.relativeMeters).toBe(3);
    expect(centerBlocker.speedKph).toBe(84);
  });

  it("keeps a faster trailing car from passing through and exchanges their speed", () => {
    const traffic = [
      car({ id: "leader", lane: "right", speedKph: 84, relativeMeters: 202 }),
      car({ id: "follower", lane: "right", speedKph: 112, relativeMeters: 200 })
    ];
    const result = resolveTrafficCollisions(traffic, 60, "center");

    const leader = result.traffic.find((v) => v.id === "leader")!;
    const follower = result.traffic.find((v) => v.id === "follower")!;
    // Leader keeps its spot; follower is pushed back to a full car length behind.
    expect(leader.relativeMeters).toBe(202);
    expect(follower.relativeMeters).toBe(202 - CAR_COLLISION_LENGTH_METERS);
    // delta 28: the leader is shoved forward, the follower pays for the hit.
    expect(leader.speedKph).toBeCloseTo(98, 5);
    expect(follower.speedKph).toBeCloseTo(93.8, 5);
  });

  it("uses a participant's preferred contact gap consistently", () => {
    const result = resolveRoadVehicleCollisions(
      [
        { id: "leader", lane: "left" as const, speedKph: 200, relativeMeters: 20 },
        {
          id: "player-two",
          lane: "left" as const,
          speedKph: 200,
          relativeMeters: 11,
          contactGapMeters: PLAYER_FOLLOW_GAP_METERS,
          trainPartner: true
        }
      ],
      50,
      "right"
    );

    expect(result.vehicles.find((vehicle) => vehicle.id === "player-two")!.relativeMeters)
      .toBe(20 - PLAYER_FOLLOW_GAP_METERS);
  });

  it("does not mutate the input traffic array or the contact map", () => {
    const original = car({ id: "ahead", lane: "center", speedKph: 88, relativeMeters: 3 });
    const traffic = [original];
    const contacts = new Map([["stale|pair", 0.5]]);
    resolveRoadVehicleCollisions(traffic, 210, "center", { contacts });

    expect(original.relativeMeters).toBe(3);
    expect(original.speedKph).toBe(88);
    expect(contacts.get("stale|pair")).toBe(0.5);
  });

  it("resolves mixed traffic and rival vehicles through the same lane rules", () => {
    const vehicles = [
      { id: "traffic:slow", lane: "left" as const, speedKph: 88, relativeMeters: 120 },
      { id: "rival:red", lane: "left" as const, speedKph: 252, relativeMeters: 118, trainPartner: true }
    ];
    const result = resolveRoadVehicleCollisions(vehicles, 70, "center");

    const slow = result.vehicles.find((vehicle) => vehicle.id === "traffic:slow")!;
    const red = result.vehicles.find((vehicle) => vehicle.id === "rival:red")!;
    expect(slow.relativeMeters).toBe(120);
    expect(red.relativeMeters).toBe(120 - CAR_COLLISION_LENGTH_METERS);
    // delta 164: the sedan is launched forward, the rival pays the crunch.
    expect(slow.speedKph).toBeCloseTo(88 + 82, 5);
    expect(red.speedKph).toBeCloseTo(252 - 106.6, 5);
  });
});
