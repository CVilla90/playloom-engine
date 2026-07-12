import { describe, expect, it } from "vitest";
import {
  TRAFFIC_CLOSE_VIEW_METERS,
  TRAFFIC_MAX_SPEED_KPH,
  TRAFFIC_MIN_SPEED_KPH,
  TRAFFIC_PRESENCE_RATIO,
  TRAFFIC_REARVIEW_RENDER_BEHIND_METERS,
  TRAFFIC_SEDAN_MAX_SPEED_KPH,
  TRAFFIC_SEDAN_HARD_SPEED_LIMIT_KPH,
  TRAFFIC_SEDAN_MIN_SPEED_KPH,
  TRAFFIC_SPACING_MULTIPLIER,
  TRAFFIC_TRUCK_MAX_SPEED_KPH,
  TRAFFIC_TRUCK_HARD_SPEED_LIMIT_KPH,
  TRAFFIC_TRUCK_MIN_SPEED_KPH,
  createInitialTraffic,
  laneRoadFraction,
  rearViewTrafficSpriteView,
  stepTraffic,
  trafficIsRearViewRenderable,
  trafficIsRenderable,
  trafficSpriteView,
  trafficYawFrame
} from "./trafficModel";
import type { TrafficVehicle } from "./trafficModel";

function trafficCar(overrides: Partial<TrafficVehicle> & Pick<TrafficVehicle, "id">): TrafficVehicle {
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

describe("wangan zero traffic model", () => {
  it("keeps light initial traffic across valid lanes and the expressway speed band", () => {
    const traffic = createInitialTraffic();

    expect(traffic).toHaveLength(2);
    expect(traffic.filter((vehicle) => vehicle.kind === "sedan")).toHaveLength(1);
    expect(traffic.filter((vehicle) => vehicle.kind === "truck")).toHaveLength(1);
    expect(traffic.find((vehicle) => vehicle.kind === "sedan")!.lane).toBe("center");
    expect(traffic.find((vehicle) => vehicle.kind === "truck")!.lane).toBe("left");
    expect(traffic.find((vehicle) => vehicle.kind === "sedan")!.speedKph).toBeCloseTo(79.2);
    expect(traffic.find((vehicle) => vehicle.kind === "truck")!.speedKph).toBeCloseTo(67.2);
    expect(
      traffic.every(
        (vehicle) =>
          vehicle.lane === "left" || vehicle.lane === "center" || vehicle.lane === "right"
      )
    ).toBe(true);
    // At least one car now runs in the center lane so the player can collide with it.
    expect(traffic.some((vehicle) => vehicle.lane === "center")).toBe(true);
    expect(
      traffic.every(
        (vehicle) =>
          vehicle.speedKph >= TRAFFIC_MIN_SPEED_KPH &&
          vehicle.speedKph <= TRAFFIC_MAX_SPEED_KPH
      )
    ).toBe(true);
  });

  it("defines slower sedan and truck speed bands", () => {
    expect(TRAFFIC_SEDAN_MIN_SPEED_KPH).toBeCloseTo(84 * 0.9);
    expect(TRAFFIC_SEDAN_MAX_SPEED_KPH).toBeCloseTo(112 * 0.9);
    expect(TRAFFIC_TRUCK_MIN_SPEED_KPH).toBeCloseTo(84 * 0.7);
    expect(TRAFFIC_TRUCK_MAX_SPEED_KPH).toBeCloseTo(112 * 0.7);
    expect(TRAFFIC_MIN_SPEED_KPH).toBe(TRAFFIC_TRUCK_MIN_SPEED_KPH);
    expect(TRAFFIC_MAX_SPEED_KPH).toBe(TRAFFIC_SEDAN_MAX_SPEED_KPH);
  });

  it("applies two consecutive 25 percent traffic reductions with deterministic spacing", () => {
    const traffic = createInitialTraffic();
    expect(TRAFFIC_PRESENCE_RATIO).toBeCloseTo(0.5625);
    expect(TRAFFIC_SPACING_MULTIPLIER).toBeCloseTo(16 / 9);
    expect(traffic[0]!.relativeMeters).toBeCloseTo(132 * (16 / 9));
    expect(traffic[1]!.relativeMeters).toBeCloseTo(244 * (16 / 9));
  });

  it("moves traffic closer when the player is faster", () => {
    const initial = createInitialTraffic().slice(0, 1);
    const next = stepTraffic(initial, 180, 0.05);
    expect(next[0]!.relativeMeters).toBeLessThan(initial[0]!.relativeMeters);
  });

  it("lets faster traffic move ahead when the player is slow", () => {
    const initial = createInitialTraffic().slice(0, 1);
    const next = stepTraffic(initial, 20, 0.05);
    expect(next[0]!.relativeMeters).toBeGreaterThan(initial[0]!.relativeMeters);
  });

  it("uses only the direct and close passing frames", () => {
    expect(trafficYawFrame(TRAFFIC_CLOSE_VIEW_METERS + 1)).toBe(0);
    expect(trafficYawFrame(TRAFFIC_CLOSE_VIEW_METERS)).toBe(8);
    expect(trafficYawFrame(0)).toBe(8);
    expect(trafficYawFrame(-TRAFFIC_CLOSE_VIEW_METERS)).toBe(8);
  });

  it("mirrors lane placement around the center lane", () => {
    expect(laneRoadFraction("left")).toBe(-laneRoadFraction("right"));
    expect(laneRoadFraction("center")).toBe(0);
    expect(Math.abs(laneRoadFraction("left"))).toBeGreaterThan(1 / 3);
  });

  it("selects traffic sprites from the player's lane relative to the vehicle", () => {
    expect(trafficSpriteView("center", "center")).toEqual({ frame: 0, mirrored: false });

    // Player is to the truck's right: use the regular 04° frame.
    expect(trafficSpriteView("left", "center")).toEqual({ frame: 4, mirrored: false });
    expect(trafficSpriteView("left", "right")).toEqual({ frame: 4, mirrored: false });

    // Player is to the truck's left: mirror the 04° frame.
    expect(trafficSpriteView("right", "center")).toEqual({ frame: 4, mirrored: true });
    expect(trafficSpriteView("right", "left")).toEqual({ frame: 4, mirrored: true });
  });

  it("selects rear-view mirror front sprites from the vehicle's lane relative to the player", () => {
    expect(rearViewTrafficSpriteView("center", "center")).toEqual({ frame: 0, mirrored: false });

    // Vehicle is to the player's right: use the regular front 04° frame.
    expect(rearViewTrafficSpriteView("right", "center")).toEqual({ frame: 4, mirrored: false });
    expect(rearViewTrafficSpriteView("right", "left")).toEqual({ frame: 4, mirrored: false });

    // Vehicle is to the player's left: mirror the front 04° frame.
    expect(rearViewTrafficSpriteView("left", "center")).toEqual({ frame: 4, mirrored: true });
    expect(rearViewTrafficSpriteView("left", "right")).toEqual({ frame: 4, mirrored: true });
  });

  it("recycles vehicles ahead with kind-weighted lane and speed choices", () => {
    const initial = createInitialTraffic();
    const recycled = stepTraffic(
      [
        initial[0]!,
        { ...initial[1]!, relativeMeters: -160.1 }
      ],
      300,
      0.05
    )[1]!;

    expect(recycled.relativeMeters).toBeGreaterThan(400);
    expect(recycled.kind).toBe("truck");
    expect(recycled.lane).toBe("left");
    expect(recycled.speedKph).toBeLessThanOrEqual(TRAFFIC_TRUCK_MAX_SPEED_KPH);
    expect(recycled.cruiseSpeedKph).toBe(recycled.speedKph);
    expect(recycled.cycle).toBe(initial[1]!.cycle + 1);
  });

  it("lets sedans change lanes to pass a slower blocker", () => {
    let traffic = [
      trafficCar({ id: "sedan", lane: "center", laneFraction: 0, speedKph: 90, cruiseSpeedKph: 90 }),
      trafficCar({ id: "truck", kind: "truck", lane: "center", laneFraction: 0, speedKph: 58, cruiseSpeedKph: 58, relativeMeters: 132 })
    ];
    let [sedan] = stepTraffic(
      traffic,
      80,
      0.05,
      { playerLane: "right" }
    );

    expect(sedan!.lane).toBe("center");
    expect(sedan!.laneChange?.targetLane).toBe("left");
    expect(sedan!.laneFraction).toBeLessThan(0);

    traffic = [sedan!, traffic[1]!];
    for (let index = 0; index < 19; index += 1) {
      traffic = stepTraffic(traffic, 80, 0.05, { playerLane: "right" });
    }
    sedan = traffic[0]!;

    expect(sedan.lane).toBe("left");
    expect(sedan.laneChange).toBeNull();
    expect(sedan.laneFraction).toBeCloseTo(laneRoadFraction("left"));
  });

  it("lets traffic accelerate harder while drafting a faster same-lane car", () => {
    const sedan = trafficCar({
      id: "sedan",
      lane: "center",
      laneFraction: 0,
      speedKph: 80,
      cruiseSpeedKph: 90,
      relativeMeters: 100
    });
    const [base] = stepTraffic([sedan], 20, 0.05);
    const [drafted] = stepTraffic([sedan], 20, 0.05, {
      obstacles: [
        {
          id: "fast-front",
          lane: "center",
          speedKph: 220,
          relativeMeters: 112
        }
      ]
    });

    expect(drafted!.speedKph).toBeGreaterThan(base!.speedKph);
  });

  it("lets sedans change lanes around a slower player", () => {
    let traffic = [
      trafficCar({ id: "sedan", lane: "center", laneFraction: 0, speedKph: 82, cruiseSpeedKph: 82, relativeMeters: -30 })
    ];
    let [sedan] = stepTraffic(
      traffic,
      10,
      0.05,
      { playerLane: "center" }
    );

    expect(sedan!.lane).toBe("center");
    expect(sedan!.laneChange?.targetLane).toBe("left");

    traffic = [sedan!];
    for (let index = 0; index < 19; index += 1) {
      traffic = stepTraffic(traffic, 10, 0.05, { playerLane: "center" });
    }
    sedan = traffic[0]!;

    expect(sedan.lane).toBe("left");
  });

  it("bleeds bump-donated speed gently back toward the cruise speed", () => {
    const pushed = trafficCar({
      id: "sedan",
      lane: "center",
      laneFraction: 0,
      speedKph: 150,
      cruiseSpeedKph: 90,
      relativeMeters: 100
    });
    const [sedan] = stepTraffic([pushed], 20, 0.05);

    // TRAFFIC_PUSHED_BLEED (9 kph/s), not the 34 kph/s blocker braking rate.
    expect(sedan!.speedKph).toBeCloseTo(150 - 9 * 0.05, 5);
  });

  it("caps collision-launched traffic and then recovers toward behavioral cruise", () => {
    let [sedan, truck] = stepTraffic(
      [
        trafficCar({ id: "sedan", speedKph: 250, cruiseSpeedKph: 90 }),
        trafficCar({
          id: "truck",
          kind: "truck",
          lane: "left",
          laneFraction: laneRoadFraction("left"),
          speedKph: 250,
          cruiseSpeedKph: 70
        })
      ],
      20,
      0.05
    );

    expect(sedan!.speedKph).toBe(TRAFFIC_SEDAN_HARD_SPEED_LIMIT_KPH);
    expect(truck!.speedKph).toBe(TRAFFIC_TRUCK_HARD_SPEED_LIMIT_KPH);

    for (let frame = 0; frame < 60; frame += 1) {
      [sedan, truck] = stepTraffic([sedan!, truck!], 20, 0.05);
    }
    expect(sedan!.speedKph).toBeLessThan(TRAFFIC_SEDAN_HARD_SPEED_LIMIT_KPH);
    expect(truck!.speedKph).toBeLessThan(TRAFFIC_TRUCK_HARD_SPEED_LIMIT_KPH);
    expect(sedan!.speedKph).toBeGreaterThan(sedan!.cruiseSpeedKph);
    expect(truck!.speedKph).toBeGreaterThan(truck!.cruiseSpeedKph);
  });

  it("brakes sedans when blocked and no safe merge lane exists", () => {
    const [sedan] = stepTraffic(
      [
        trafficCar({ id: "sedan", lane: "center", laneFraction: 0, speedKph: 90, cruiseSpeedKph: 90, relativeMeters: 100 }),
        trafficCar({ id: "center-blocker", kind: "truck", lane: "center", laneFraction: 0, speedKph: 58, cruiseSpeedKph: 58, relativeMeters: 132 }),
        trafficCar({ id: "left-blocker", lane: "left", laneFraction: laneRoadFraction("left"), speedKph: 78, cruiseSpeedKph: 78, relativeMeters: 120 }),
        trafficCar({ id: "right-blocker", lane: "right", laneFraction: laneRoadFraction("right"), speedKph: 78, cruiseSpeedKph: 78, relativeMeters: 84 })
      ],
      80,
      0.05,
      { playerLane: "right" }
    );

    expect(sedan!.lane).toBe("center");
    expect(sedan!.speedKph).toBeLessThan(90);
  });

  it("keeps authoritative traffic persistent when it crosses the route seam", () => {
    const vehicle = trafficCar({
      id: "persistent",
      speedKph: 100,
      cruiseSpeedKph: 100,
      relativeMeters: 3599.9,
      cycle: 4
    });
    const [stepped] = stepTraffic([vehicle], 0, 0.05, { persistentLoop: true });

    expect(stepped!.relativeMeters).toBeLessThan(-3598);
    expect(stepped!.cycle).toBe(4);
  });

  it("renders only the road-space interval visible through the windshield", () => {
    expect(trafficIsRenderable(-13)).toBe(false);
    expect(trafficIsRenderable(-12)).toBe(true);
    expect(trafficIsRenderable(300)).toBe(true);
    expect(trafficIsRenderable(451)).toBe(false);
  });

  it("renders rear-view mirror traffic only while it is behind the player", () => {
    expect(trafficIsRearViewRenderable(0)).toBe(false);
    expect(trafficIsRearViewRenderable(-0.1)).toBe(true);
    expect(trafficIsRearViewRenderable(-TRAFFIC_REARVIEW_RENDER_BEHIND_METERS)).toBe(true);
    expect(trafficIsRearViewRenderable(-TRAFFIC_REARVIEW_RENDER_BEHIND_METERS - 0.1)).toBe(false);
    expect(trafficIsRearViewRenderable(12)).toBe(false);
  });
});
