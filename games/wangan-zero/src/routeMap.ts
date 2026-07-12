import {
  ROUTE_LENGTH_METERS,
  ROUTE_SECTORS,
  getRouteSector,
  type RouteSector
} from "./drivingModel";

export interface RouteMapPoint {
  readonly x: number;
  readonly y: number;
}

export interface RouteMapPosition extends RouteMapPoint {
  readonly sector: RouteSector;
  readonly sectorIndex: number;
  readonly sectorProgress: number;
}

/**
 * A compact fictionalized Kurohama loop. It preserves sector order and hints at
 * each visual road profile without claiming that the 1D driving simulation is
 * literal geography. Adjacent paths share endpoints, including the final wrap.
 */
export const ROUTE_MAP_SECTOR_PATHS: Readonly<
  Record<RouteSector["id"], readonly RouteMapPoint[]>
> = {
  downtown: [
    { x: 0.2, y: 0.22 },
    { x: 0.29, y: 0.17 },
    { x: 0.4, y: 0.13 },
    { x: 0.52, y: 0.1 }
  ],
  bridge: [
    { x: 0.52, y: 0.1 },
    { x: 0.67, y: 0.1 },
    { x: 0.79, y: 0.16 },
    { x: 0.84, y: 0.28 }
  ],
  harbor: [
    { x: 0.84, y: 0.28 },
    { x: 0.9, y: 0.39 },
    { x: 0.91, y: 0.52 },
    { x: 0.87, y: 0.62 }
  ],
  mountains: [
    { x: 0.87, y: 0.62 },
    { x: 0.82, y: 0.76 },
    { x: 0.72, y: 0.87 },
    { x: 0.6, y: 0.88 }
  ],
  tunnel: [
    { x: 0.6, y: 0.88 },
    { x: 0.48, y: 0.86 },
    { x: 0.36, y: 0.82 },
    { x: 0.25, y: 0.78 }
  ],
  skyline: [
    { x: 0.25, y: 0.78 },
    { x: 0.13, y: 0.68 },
    { x: 0.1, y: 0.49 },
    { x: 0.14, y: 0.32 },
    { x: 0.2, y: 0.22 }
  ]
};

function wrapRouteDistance(distanceMeters: number): number {
  return ((distanceMeters % ROUTE_LENGTH_METERS) + ROUTE_LENGTH_METERS) % ROUTE_LENGTH_METERS;
}

export function routeMapPositionAt(distanceMeters: number): RouteMapPosition {
  const wrappedDistance = wrapRouteDistance(distanceMeters);
  const sector = getRouteSector(wrappedDistance);
  const sectorIndex = ROUTE_SECTORS.findIndex((candidate) => candidate.id === sector.id);
  const nextStart = ROUTE_SECTORS[sectorIndex + 1]?.startMeters ?? ROUTE_LENGTH_METERS;
  const sectorProgress = Math.max(
    0,
    Math.min(1, (wrappedDistance - sector.startMeters) / (nextStart - sector.startMeters))
  );
  const path = ROUTE_MAP_SECTOR_PATHS[sector.id];
  const scaledProgress = sectorProgress * (path.length - 1);
  const segmentIndex = Math.min(path.length - 2, Math.floor(scaledProgress));
  const segmentProgress = scaledProgress - segmentIndex;
  const from = path[segmentIndex]!;
  const to = path[segmentIndex + 1]!;

  return {
    sector,
    sectorIndex,
    sectorProgress,
    x: from.x + (to.x - from.x) * segmentProgress,
    y: from.y + (to.y - from.y) * segmentProgress
  };
}
