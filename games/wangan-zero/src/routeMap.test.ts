import { describe, expect, it } from "vitest";
import { ROUTE_LENGTH_METERS, ROUTE_SECTORS } from "./drivingModel";
import { ROUTE_MAP_SECTOR_PATHS, routeMapPositionAt } from "./routeMap";

describe("wangan zero loop map", () => {
  it("forms one continuous closed loop in sector order", () => {
    for (let index = 0; index < ROUTE_SECTORS.length; index += 1) {
      const sector = ROUTE_SECTORS[index]!;
      const next = ROUTE_SECTORS[(index + 1) % ROUTE_SECTORS.length]!;
      const path = ROUTE_MAP_SECTOR_PATHS[sector.id];
      const nextPath = ROUTE_MAP_SECTOR_PATHS[next.id];
      expect(path[path.length - 1]).toEqual(nextPath[0]);
    }
  });

  it("reports the current sector and a position inside the tunnel", () => {
    const position = routeMapPositionAt(5400);
    expect(position.sector.id).toBe("tunnel");
    expect(position.sectorProgress).toBeCloseTo(0.5);
    expect(position.x).toBeGreaterThan(0.35);
    expect(position.x).toBeLessThan(0.5);
  });

  it("wraps map position exactly with the route", () => {
    expect(routeMapPositionAt(ROUTE_LENGTH_METERS)).toEqual(routeMapPositionAt(0));
    expect(routeMapPositionAt(ROUTE_LENGTH_METERS + 125)).toEqual(routeMapPositionAt(125));
  });

  it("keeps every authored map point within normalized GPS bounds", () => {
    for (const sector of ROUTE_SECTORS) {
      for (const point of ROUTE_MAP_SECTOR_PATHS[sector.id]) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(1);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(1);
      }
    }
  });
});
