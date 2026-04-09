import { AREAS, type AreaDef } from "./world";
import { BLACK_STICKMAN_TUNING } from "./tuning";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface AreaConnection extends Point {
  readonly fromId: string;
  readonly toId: string;
}

export interface StalkerSpawn extends Point {
  readonly areaId: string;
}

const MIN_TRAVERSAL_CONNECTION_SPAN = 24;

function overlapSpan(startA: number, endA: number, startB: number, endB: number): number {
  return Math.min(endA, endB) - Math.max(startA, startB);
}

export function areasShareTraversalBoundary(a: AreaDef, b: AreaDef): boolean {
  const sharedWidth = overlapSpan(a.x, a.x + a.width, b.x, b.x + b.width);
  const sharedHeight = overlapSpan(a.y, a.y + a.height, b.y, b.y + b.height);

  return (
    (sharedWidth >= MIN_TRAVERSAL_CONNECTION_SPAN && sharedHeight >= 0) ||
    (sharedHeight >= MIN_TRAVERSAL_CONNECTION_SPAN && sharedWidth >= 0)
  );
}

function connectionPoint(a: AreaDef, b: AreaDef): Point {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  return {
    x: (left + right) * 0.5,
    y: (top + bottom) * 0.5
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampToTraversalSpan(value: number, start: number, end: number, padding: number): number {
  const min = start + padding;
  const max = end - padding;
  if (min > max) {
    return (start + end) * 0.5;
  }

  return clamp(value, min, max);
}

function nudgePointIntoArea(point: Point, area: AreaDef, distance: number): Point {
  const centerX = area.x + area.width * 0.5;
  const centerY = area.y + area.height * 0.5;
  const deltaX = centerX - point.x;
  const deltaY = centerY - point.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length <= 0.001) {
    return point;
  }

  const paddingX = Math.min(18, Math.max(4, area.width * 0.1));
  const paddingY = Math.min(18, Math.max(4, area.height * 0.1));
  const nudgedX = point.x + (deltaX / length) * distance;
  const nudgedY = point.y + (deltaY / length) * distance;

  return {
    x: clamp(nudgedX, area.x + paddingX, area.x + area.width - paddingX),
    y: clamp(nudgedY, area.y + paddingY, area.y + area.height - paddingY)
  };
}

function buildAreaConnections(): Map<string, AreaConnection[]> {
  const graph = new Map<string, AreaConnection[]>();
  for (const area of AREAS) {
    graph.set(area.id, []);
  }

  for (let i = 0; i < AREAS.length; i += 1) {
    for (let j = i + 1; j < AREAS.length; j += 1) {
      const left = AREAS[i];
      const right = AREAS[j];
      if (!left || !right || !areasShareTraversalBoundary(left, right)) {
        continue;
      }

      const waypoint = connectionPoint(left, right);
      graph.get(left.id)?.push({ fromId: left.id, toId: right.id, ...waypoint });
      graph.get(right.id)?.push({ fromId: right.id, toId: left.id, ...waypoint });
    }
  }

  return graph;
}

export const AREA_CONNECTIONS = buildAreaConnections();

export function findAreaById(areaId: string): AreaDef | null {
  return AREAS.find((area) => area.id === areaId) ?? null;
}

export function pickAreaPoint(area: AreaDef, random = Math.random, padding = 28): Point {
  const usablePaddingX = Math.min(padding, Math.max(0, area.width * 0.25));
  const usablePaddingY = Math.min(padding, Math.max(0, area.height * 0.25));
  const minX = area.x + usablePaddingX;
  const maxX = area.x + area.width - usablePaddingX;
  const minY = area.y + usablePaddingY;
  const maxY = area.y + area.height - usablePaddingY;

  return {
    x: minX + (maxX - minX) * random(),
    y: minY + (maxY - minY) * random()
  };
}

function distanceSquared(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

export function chooseRandomStalkerSpawn(playerX: number, playerY: number, random = Math.random): StalkerSpawn {
  const spawnAreas = AREAS.filter(
    (area) => area.kind === "room" && area.id !== "entry-lobby" && area.id !== "prep-bay" && area.id !== "exit-chamber"
  );
  const minimumDistanceSq = BLACK_STICKMAN_TUNING.spawnMinDistance * BLACK_STICKMAN_TUNING.spawnMinDistance;

  for (let attempt = 0; attempt < 32; attempt += 1) {
    const area = spawnAreas[Math.floor(random() * spawnAreas.length)] ?? spawnAreas[0];
    if (!area) {
      break;
    }
    const point = pickAreaPoint(area, random);
    if (distanceSquared(playerX, playerY, point.x, point.y) >= minimumDistanceSq) {
      return {
        areaId: area.id,
        x: point.x,
        y: point.y
      };
    }
  }

  const fallbackArea = spawnAreas[0] ?? AREAS[0];
  if (!fallbackArea) {
    throw new Error("No valid areas are available for the black stickman spawn.");
  }
  const fallbackPoint = pickAreaPoint(fallbackArea, random);
  return {
    areaId: fallbackArea.id,
    x: fallbackPoint.x,
    y: fallbackPoint.y
  };
}

export function chooseRandomRoamArea(currentAreaId: string | null, random = Math.random): AreaDef {
  const roamAreas = AREAS.filter((area) => area.id !== "exit-chamber");
  if (roamAreas.length === 0) {
    throw new Error("No valid roam areas are available for the black stickman.");
  }

  if (roamAreas.length === 1) {
    return roamAreas[0]!;
  }

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const area = roamAreas[Math.floor(random() * roamAreas.length)] ?? roamAreas[0];
    if (area && area.id !== currentAreaId) {
      return area;
    }
  }

  return roamAreas.find((area) => area.id !== currentAreaId) ?? roamAreas[0]!;
}

export function findAreaPath(startAreaId: string, targetAreaId: string): string[] {
  if (startAreaId === targetAreaId) {
    return [startAreaId];
  }

  const queue = [startAreaId];
  const visited = new Set<string>(queue);
  const previous = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const neighbors = AREA_CONNECTIONS.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (visited.has(neighbor.toId)) {
        continue;
      }
      visited.add(neighbor.toId);
      previous.set(neighbor.toId, current);
      if (neighbor.toId === targetAreaId) {
        const path = [targetAreaId];
        let walker = targetAreaId;
        while (previous.has(walker)) {
          walker = previous.get(walker)!;
          path.unshift(walker);
        }
        return path;
      }
      queue.push(neighbor.toId);
    }
  }

  return [startAreaId];
}

export function waypointBetweenAreas(fromAreaId: string, toAreaId: string): Point | null {
  const connection = (AREA_CONNECTIONS.get(fromAreaId) ?? []).find((entry) => entry.toId === toAreaId);
  if (!connection) {
    return null;
  }

  const targetArea = findAreaById(toAreaId);
  if (!targetArea) {
    return { x: connection.x, y: connection.y };
  }

  return nudgePointIntoArea({ x: connection.x, y: connection.y }, targetArea, 18);
}

export function traversalWaypointBetweenAreas(
  fromAreaId: string,
  toAreaId: string,
  currentPoint: Point,
  distance = 18
): Point | null {
  const connection = (AREA_CONNECTIONS.get(fromAreaId) ?? []).find((entry) => entry.toId === toAreaId);
  const fromArea = findAreaById(fromAreaId);
  const targetArea = findAreaById(toAreaId);
  if (!connection || !fromArea || !targetArea) {
    return waypointBetweenAreas(fromAreaId, toAreaId);
  }

  const sharedWidth = overlapSpan(fromArea.x, fromArea.x + fromArea.width, targetArea.x, targetArea.x + targetArea.width);
  const sharedHeight = overlapSpan(fromArea.y, fromArea.y + fromArea.height, targetArea.y, targetArea.y + targetArea.height);
  const approachThreshold = Math.max(6, distance * 0.5);
  const padding = Math.max(2, Math.min(distance * 0.5, Math.max(sharedWidth, sharedHeight) * 0.25));

  const areasTouchVertically =
    Math.abs(fromArea.x + fromArea.width - targetArea.x) <= 0.001
    || Math.abs(targetArea.x + targetArea.width - fromArea.x) <= 0.001;
  if (areasTouchVertically && sharedHeight >= MIN_TRAVERSAL_CONNECTION_SPAN) {
    const direction = targetArea.x >= fromArea.x ? 1 : -1;
    const doorwayY = clampToTraversalSpan(
      currentPoint.y,
      Math.max(fromArea.y, targetArea.y),
      Math.min(fromArea.y + fromArea.height, targetArea.y + targetArea.height),
      padding
    );
    const approachPoint = {
      x: connection.x - direction * distance,
      y: doorwayY
    };
    const needsHorizontalApproach = direction > 0
      ? currentPoint.x < approachPoint.x
      : currentPoint.x > approachPoint.x;
    if (needsHorizontalApproach || Math.abs(currentPoint.y - doorwayY) > approachThreshold) {
      return approachPoint;
    }

    return {
      x: connection.x + direction * distance,
      y: doorwayY
    };
  }

  const areasTouchHorizontally =
    Math.abs(fromArea.y + fromArea.height - targetArea.y) <= 0.001
    || Math.abs(targetArea.y + targetArea.height - fromArea.y) <= 0.001;
  if (areasTouchHorizontally && sharedWidth >= MIN_TRAVERSAL_CONNECTION_SPAN) {
    const direction = targetArea.y >= fromArea.y ? 1 : -1;
    const doorwayX = clampToTraversalSpan(
      currentPoint.x,
      Math.max(fromArea.x, targetArea.x),
      Math.min(fromArea.x + fromArea.width, targetArea.x + targetArea.width),
      padding
    );
    const approachPoint = {
      x: doorwayX,
      y: connection.y - direction * distance
    };
    const needsVerticalApproach = direction > 0
      ? currentPoint.y < approachPoint.y
      : currentPoint.y > approachPoint.y;
    if (needsVerticalApproach || Math.abs(currentPoint.x - doorwayX) > approachThreshold) {
      return approachPoint;
    }

    return {
      x: doorwayX,
      y: connection.y + direction * distance
    };
  }

  return nudgePointIntoArea({ x: connection.x, y: connection.y }, targetArea, distance);
}
