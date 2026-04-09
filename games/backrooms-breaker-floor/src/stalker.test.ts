import { describe, expect, it } from "vitest";
import {
  areasShareTraversalBoundary,
  chooseRandomRoamArea,
  chooseRandomStalkerSpawn,
  findAreaPath,
  findAreaById,
  traversalWaypointBetweenAreas,
  waypointBetweenAreas
} from "./stalker";
import { PLAYER_SPAWN } from "./world";

describe("black stickman helpers", () => {
  it("finds a traversable area path across the floor", () => {
    const path = findAreaPath("entry-lobby", "exit-chamber");
    expect(path[0]).toBe("entry-lobby");
    expect(path[path.length - 1]).toBe("exit-chamber");
    expect(path.length).toBeGreaterThan(2);

    const firstLink = waypointBetweenAreas(path[0]!, path[1]!);
    expect(firstLink).not.toBeNull();
  });

  it("spawns the stalker away from the player inside a valid area", () => {
    const values = [0.82, 0.18, 0.66, 0.44, 0.72];
    let index = 0;
    const random = () => {
      const value = values[index % values.length] ?? 0.5;
      index += 1;
      return value;
    };

    const spawn = chooseRandomStalkerSpawn(PLAYER_SPAWN.x, PLAYER_SPAWN.y, random);
    const area = findAreaById(spawn.areaId);
    expect(area).not.toBeNull();
    expect(area && spawn.x >= area.x && spawn.x <= area.x + area.width).toBe(true);
    expect(area && spawn.y >= area.y && spawn.y <= area.y + area.height).toBe(true);
    expect(Math.hypot(spawn.x - PLAYER_SPAWN.x, spawn.y - PLAYER_SPAWN.y)).toBeGreaterThan(700);
  });

  it("can roam through halls and avoids the locked exit chamber target", () => {
    const seenKinds = new Set<string>();

    for (let i = 0; i < 24; i += 1) {
      const roll = (i + 0.25) / 24;
      const area = chooseRandomRoamArea(null, () => roll);
      seenKinds.add(area.kind);
      expect(area.id).not.toBe("exit-chamber");
    }

    expect(seenKinds.has("hall")).toBe(true);
    expect(seenKinds.has("room")).toBe(true);
  });

  it("connects only through real shared edges and not corner contact", () => {
    const leftRoom = {
      id: "left-room",
      label: "Left Room",
      kind: "room" as const,
      x: 0,
      y: 0,
      width: 120,
      height: 80,
      floor: "#000",
      trim: "#000",
      glow: "rgba(0,0,0,0)",
      lighting: {
        axis: "x" as const,
        start: 0,
        end: 0
      }
    };
    const hallway = {
      ...leftRoom,
      id: "hallway",
      kind: "hall" as const,
      x: 120,
      y: 18,
      width: 84,
      height: 40
    };
    const cornerTouch = {
      ...leftRoom,
      id: "corner-touch",
      x: 120,
      y: 80,
      width: 90,
      height: 90
    };

    expect(areasShareTraversalBoundary(leftRoom, hallway)).toBe(true);
    expect(areasShareTraversalBoundary(leftRoom, cornerTouch)).toBe(false);
  });

  it("aligns traversal targets with doorway openings before crossing into the next area", () => {
    const approach = traversalWaypointBetweenAreas("entry-lobby", "intake-hall", {
      x: 188,
      y: 188
    });
    expect(approach).not.toBeNull();
    expect(approach!.x).toBeLessThanOrEqual(432);
    expect(approach!.y).toBeGreaterThanOrEqual(244);
    expect(approach!.y).toBeLessThanOrEqual(340);

    const crossing = traversalWaypointBetweenAreas("entry-lobby", "intake-hall", {
      x: 420,
      y: 292
    });
    expect(crossing).not.toBeNull();
    expect(crossing!.x).toBeGreaterThan(432);
    expect(crossing!.y).toBe(292);
  });
});
