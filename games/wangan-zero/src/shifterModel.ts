export interface HShifterLayout {
  readonly columns: readonly [number, number, number];
  readonly topY: number;
  readonly neutralY: number;
  readonly bottomY: number;
  readonly neutralBandHalfHeight: number;
  readonly hitPadding: number;
}

export interface ShifterPoint {
  readonly x: number;
  readonly y: number;
}

/** 1/2 left, 3/4 center, 5/6 right. */
export function shifterGatePoint(gear: number, layout: HShifterLayout): ShifterPoint {
  const safeGear = Math.max(1, Math.min(6, Math.round(gear)));
  const columnIndex = Math.floor((safeGear - 1) / 2);
  return {
    x: layout.columns[columnIndex]!,
    y: safeGear % 2 === 1 ? layout.topY : layout.bottomY
  };
}

/**
 * Resolve a released pointer to an H-gate. The middle crossbar is a true
 * neutral corridor: releasing there leaves the current gear selected.
 */
export function gearAtShifterPoint(
  point: ShifterPoint,
  layout: HShifterLayout
): number | null {
  const minX = layout.columns[0] - layout.hitPadding;
  const maxX = layout.columns[2] + layout.hitPadding;
  const minY = layout.topY - layout.hitPadding;
  const maxY = layout.bottomY + layout.hitPadding;
  if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) {
    return null;
  }
  if (Math.abs(point.y - layout.neutralY) <= layout.neutralBandHalfHeight) {
    return null;
  }

  let columnIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  layout.columns.forEach((columnX, index) => {
    const distance = Math.abs(point.x - columnX);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      columnIndex = index;
    }
  });
  const rowOffset = point.y < layout.neutralY ? 1 : 2;
  return columnIndex * 2 + rowOffset;
}

export function clampShifterPoint(
  point: ShifterPoint,
  layout: HShifterLayout
): ShifterPoint {
  return {
    x: Math.max(layout.columns[0], Math.min(layout.columns[2], point.x)),
    y: Math.max(layout.topY, Math.min(layout.bottomY, point.y))
  };
}
