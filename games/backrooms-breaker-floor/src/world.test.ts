import { describe, expect, it } from "vitest";
import {
  AREAS,
  EXIT_TERMINAL,
  LOCKED_EXIT_GATE,
  PANELS,
  PLAYER_SPAWN,
  PLAYER_SPAWN_POINTS,
  RELAYS,
  TRAINING_DUMMY,
  type Rect
} from "./world";

function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function touchesOrOverlaps(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function overlapArea(a: Rect, b: Rect): number {
  const overlapWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const overlapHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return overlapWidth * overlapHeight;
}

describe("backrooms-breaker-floor world layout", () => {
  it("keeps the full area graph connected from the spawn room", () => {
    const spawnArea = AREAS.find((area) => containsPoint(area, PLAYER_SPAWN.x, PLAYER_SPAWN.y));
    expect(spawnArea).toBeDefined();

    const visited = new Set<string>();
    const queue = [spawnArea!];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) {
        continue;
      }
      visited.add(current.id);

      for (const candidate of AREAS) {
        if (visited.has(candidate.id) || candidate.id === current.id) {
          continue;
        }
        if (touchesOrOverlaps(current, candidate)) {
          queue.push(candidate);
        }
      }
    }

    expect(visited.size).toBe(AREAS.length);
  });

  it("does not author positive-area overlaps between walkable regions", () => {
    for (let index = 0; index < AREAS.length; index += 1) {
      for (let candidateIndex = index + 1; candidateIndex < AREAS.length; candidateIndex += 1) {
        const overlap = overlapArea(AREAS[index]!, AREAS[candidateIndex]!);
        expect(overlap, `${AREAS[index]!.id} overlaps ${AREAS[candidateIndex]!.id}`).toBe(0);
      }
    }
  });

  it("keeps objectives inside valid, reachable areas", () => {
    const areaIds = new Set(AREAS.map((area) => area.id));

    for (const relay of RELAYS) {
      expect(areaIds.has(relay.areaId)).toBe(true);
      const relayArea = AREAS.find((area) => area.id === relay.areaId);
      expect(relayArea && containsPoint(relayArea, relay.x, relay.y)).toBe(true);
    }

    for (const panel of PANELS) {
      expect(areaIds.has(panel.areaId)).toBe(true);
      const panelArea = AREAS.find((area) => area.id === panel.areaId);
      expect(panelArea && containsPoint(panelArea, panel.x, panel.y)).toBe(true);
    }

    const exitArea = AREAS.find((area) => area.id === "exit-chamber");
    expect(exitArea && containsPoint(exitArea, EXIT_TERMINAL.x, EXIT_TERMINAL.y)).toBe(true);

    const dummyArea = AREAS.find((area) => area.id === TRAINING_DUMMY.areaId);
    expect(dummyArea && containsPoint(dummyArea, TRAINING_DUMMY.x, TRAINING_DUMMY.y)).toBe(true);

    const gateCarrierArea = AREAS.find((area) => touchesOrOverlaps(area, LOCKED_EXIT_GATE));
    expect(gateCarrierArea).toBeDefined();
  });

  it("keeps all authored player spawn points inside the Entry Lobby", () => {
    const entryLobby = AREAS.find((area) => area.id === "entry-lobby");
    expect(entryLobby).toBeDefined();
    expect(PLAYER_SPAWN_POINTS).toHaveLength(6);

    const seenIds = new Set<string>();
    for (const spawn of PLAYER_SPAWN_POINTS) {
      expect(spawn.areaId).toBe("entry-lobby");
      expect(containsPoint(entryLobby!, spawn.x, spawn.y)).toBe(true);
      expect(seenIds.has(spawn.id)).toBe(false);
      seenIds.add(spawn.id);
    }
  });
});
