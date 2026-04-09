import { describe, expect, it } from "vitest";
import { PICKUP_SPAWN_POINTS, rollPickupType } from "./pickups";

describe("pickup tables", () => {
  it("supports empty rolls and real items for the medical profile", () => {
    expect(rollPickupType("medical", () => 0.05)).toBeNull();
    expect(rollPickupType("medical", () => 0.7)).toBe("medkit");
  });

  it("supports profile-biased and wildcard item rolls", () => {
    expect(rollPickupType("stimulant", () => 0.7)).toBe("energy_drink");
    expect(rollPickupType("general", () => 0.985)).toBe("medkit");
  });

  it("defines pickup spawn points across multiple parts of the floor", () => {
    const areaIds = new Set(PICKUP_SPAWN_POINTS.map((point) => point.areaId));
    expect(PICKUP_SPAWN_POINTS.length).toBeGreaterThan(10);
    expect(areaIds.has("prep-bay")).toBe(true);
    expect(areaIds.has("generator-gallery")).toBe(true);
    expect(areaIds.has("south-cross")).toBe(true);
  });
});
