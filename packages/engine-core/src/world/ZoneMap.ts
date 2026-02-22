import type { Rect } from "../math/collision";

export interface RectZone {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data?: Record<string, unknown>;
}

function rectContainsPoint(zone: RectZone, x: number, y: number): boolean {
  return x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height;
}

function rectIntersectsRect(zone: RectZone, rect: Rect): boolean {
  return !(
    zone.x + zone.width < rect.x ||
    zone.x > rect.x + rect.width ||
    zone.y + zone.height < rect.y ||
    zone.y > rect.y + rect.height
  );
}

function matchesType(zone: RectZone, types?: readonly string[]): boolean {
  if (!types || types.length === 0) return true;
  return types.includes(zone.type);
}

export class ZoneMap {
  private readonly zones: RectZone[];

  constructor(zones: readonly RectZone[] = []) {
    this.zones = zones.map((zone) => ({ ...zone }));
  }

  all(): readonly RectZone[] {
    return this.zones;
  }

  listByType(type: string): RectZone[] {
    return this.zones.filter((zone) => zone.type === type);
  }

  queryPoint(x: number, y: number, types?: readonly string[]): RectZone[] {
    return this.zones.filter((zone) => matchesType(zone, types) && rectContainsPoint(zone, x, y));
  }

  queryRect(rect: Rect, types?: readonly string[]): RectZone[] {
    return this.zones.filter((zone) => matchesType(zone, types) && rectIntersectsRect(zone, rect));
  }

  firstPoint(x: number, y: number, types?: readonly string[]): RectZone | null {
    return this.queryPoint(x, y, types)[0] ?? null;
  }

  firstRect(rect: Rect, types?: readonly string[]): RectZone | null {
    return this.queryRect(rect, types)[0] ?? null;
  }
}
