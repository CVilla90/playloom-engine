import { describe, expect, it } from "vitest";
import { ZoneMap } from "./ZoneMap";

describe("ZoneMap", () => {
  const zones = new ZoneMap([
    { id: "z1", type: "climb", x: 10, y: 20, width: 50, height: 40 },
    { id: "z2", type: "hazard", x: 80, y: 24, width: 30, height: 30 }
  ]);

  it("queries points by type", () => {
    expect(zones.queryPoint(20, 30, ["climb"]).map((zone) => zone.id)).toEqual(["z1"]);
    expect(zones.queryPoint(20, 30, ["hazard"])).toHaveLength(0);
  });

  it("queries intersecting rects", () => {
    const hits = zones.queryRect({ x: 55, y: 25, width: 30, height: 15 });
    expect(hits.map((zone) => zone.id)).toEqual(["z1", "z2"]);
  });

  it("returns first match helpers", () => {
    expect(zones.firstPoint(85, 40)?.id).toBe("z2");
    expect(zones.firstRect({ x: 200, y: 200, width: 8, height: 8 })).toBeNull();
  });
});
