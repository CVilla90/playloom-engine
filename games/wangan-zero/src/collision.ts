import type { TrafficLane, TrafficVehicle } from "./trafficModel";

// --- Traffic collision box (road-space meters) ------------------------------
// Every car (player and traffic) owns an axis-aligned box in road space. Lanes
// are discrete today, so only the longitudinal length participates in
// resolution; the width is defined for the eventual lane-change / side-swipe
// pass. Two boxes in the same lane overlap when their centers are closer than
// one car length.
export const CAR_COLLISION_LENGTH_METERS = 4.8;
export const CAR_COLLISION_WIDTH_METERS = 1.9;

// Minimum center-to-center spacing two same-lane cars are allowed to reach.
const CAR_MIN_SEPARATION_METERS = CAR_COLLISION_LENGTH_METERS;

// The player holds a slightly wider gap than the raw box so a blocked car reads
// as "close ahead" instead of engulfing the windshield. Used for the player both
// ahead (rear-ending a slower car) and behind (a faster car catching up).
export const PLAYER_FOLLOW_GAP_METERS = 12;

// --- Rear-contact speed exchange --------------------------------------------
// A bump trades speed through the closing delta (rear speed minus front speed,
// kph): the car ahead gains BUMP_FRONT_GAIN_RATIO of it, the car behind loses
// BUMP_REAR_LOSS_RATIO, and the gap between the two ratios is crunch lost to
// the hit (so no exchange ever creates net speed). Both sides scale by the
// mass ratio, so shunting the freight truck barely moves it while costing the
// bumper nearly the whole delta. The rear car's loss is capped at 100% of the
// delta: the bumper can never end up slower than the car it just hit was
// going. Because gain + loss > delta, the bumped car exits FASTER than the
// bumper — the pair separates cleanly instead of machine-gunning re-collisions.
export const BUMP_FRONT_GAIN_RATIO = 0.5;
export const BUMP_REAR_LOSS_RATIO = 0.65;
// Below this closing speed a contact is a nudge, not a crash. Between train
// partners (player/rivals) the pair merges to its momentum average with no
// crunch — the mechanism that lets a draft train feed speed forward bumper to
// bumper. Against civilian traffic a nudge just caps the rear car (you cannot
// bulldoze a sedan down the wangan for free).
export const BUMP_NUDGE_THRESHOLD_KPH = 8;
// One hard exchange per pair per contact; re-arming takes this long.
export const BUMP_PAIR_COOLDOWN_SECONDS = 0.7;
export const DEFAULT_VEHICLE_MASS_FACTOR = 1;
export const TRUCK_VEHICLE_MASS_FACTOR = 2.6;

export interface CollisionResolution {
  /** Traffic with same-lane overlaps resolved (cars never pass through each other). */
  readonly traffic: TrafficVehicle[];
  /** Player speed after bump exchanges with same-lane vehicles. */
  readonly playerSpeedKph: number;
  /** True when a hard bump involving the player fired this frame. */
  readonly playerImpact: boolean;
}

export interface RoadCollisionVehicle {
  readonly id: string;
  readonly lane: TrafficLane;
  readonly speedKph: number;
  readonly relativeMeters: number;
  readonly lengthMeters?: number;
  /** Relative collision mass; heavier vehicles trade less speed. Default 1. */
  readonly massFactor?: number;
  /** Absolute mechanical speed ceiling for this car. Default: uncapped. */
  readonly maxSpeedKph?: number;
  /** Preferred center-to-center contact gap. Defaults to the physical car length. */
  readonly contactGapMeters?: number;
  /** Train partners (player/rivals) merge speed on soft contact; traffic does not. */
  readonly trainPartner?: boolean;
}

export interface RoadCollisionResolution<T extends RoadCollisionVehicle> {
  /** Vehicles with same-lane overlaps resolved and bump exchanges applied. */
  readonly vehicles: T[];
  /** Player speed after bump exchanges — may be HIGHER than the input when hit from behind. */
  readonly playerSpeedKph: number;
  /** True when a hard bump involving the player fired this frame. */
  readonly playerImpact: boolean;
  /** Closing speed (kph) of the hardest player bump this frame, for cue scaling. */
  readonly playerImpactDeltaKph: number;
  /** Per-pair exchange cooldowns; feed back in via options on the next frame. */
  readonly contacts: ReadonlyMap<string, number>;
}

export interface RoadCollisionOptions {
  /** Frame time used to decay pair cooldowns. */
  readonly dt?: number;
  /** Pair cooldowns returned by the previous frame's resolution. */
  readonly contacts?: ReadonlyMap<string, number>;
  readonly playerMassFactor?: number;
  /** Absolute mechanical speed ceiling for the player. Default: uncapped. */
  readonly playerMaxSpeedKph?: number;
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

interface ExchangeBody {
  readonly id: string;
  speedKph: number;
  readonly massFactor: number;
  readonly maxSpeedKph: number;
  readonly trainPartner: boolean;
}

interface ExchangeOutcome {
  readonly hardBump: boolean;
  readonly deltaKph: number;
}

function vehicleLength(vehicle: RoadCollisionVehicle): number {
  return vehicle.lengthMeters ?? CAR_COLLISION_LENGTH_METERS;
}

function minimumSeparation(a: RoadCollisionVehicle, b: RoadCollisionVehicle): number {
  return Math.max(
    CAR_MIN_SEPARATION_METERS,
    (vehicleLength(a) + vehicleLength(b)) * 0.5,
    a.contactGapMeters ?? 0,
    b.contactGapMeters ?? 0
  );
}

function mechanicalSpeedLimit(maxSpeedKph: number | undefined): number {
  return maxSpeedKph !== undefined && Number.isFinite(maxSpeedKph)
    ? Math.max(0, maxSpeedKph)
    : Number.POSITIVE_INFINITY;
}

function capBodySpeed(body: ExchangeBody): void {
  body.speedKph = Math.min(body.maxSpeedKph, Math.max(0, body.speedKph));
}

function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

// Resolve one rear-into-front contact. Mutates both bodies' speeds and returns
// whether a hard (cue-worthy) bump fired. `cooldowns` is the already-decayed
// mutable map for this frame.
function resolveContact(
  rear: ExchangeBody,
  front: ExchangeBody,
  cooldowns: Map<string, number>
): ExchangeOutcome {
  const deltaKph = rear.speedKph - front.speedKph;
  if (deltaKph <= 0) {
    // Already separating — the overlap is positional only.
    return { hardBump: false, deltaKph: 0 };
  }

  const massTotal = rear.massFactor + front.massFactor;

  if (deltaKph < BUMP_NUDGE_THRESHOLD_KPH) {
    if (rear.trainPartner && front.trainPartner) {
      // Train feed: merge to the momentum average, no crunch, every frame. A
      // lower-ceiling partner anchors the pair at its hard limit rather than
      // being pushed over it and re-triggering an endless nudge every frame.
      const averageKph =
        (rear.massFactor * rear.speedKph + front.massFactor * front.speedKph) / massTotal;
      const sharedSpeedKph = Math.min(averageKph, rear.maxSpeedKph, front.maxSpeedKph);
      rear.speedKph = sharedSpeedKph;
      front.speedKph = sharedSpeedKph;
    } else {
      // Civilian bumper: just match its speed, nothing is donated.
      rear.speedKph = front.speedKph;
    }
    return { hardBump: false, deltaKph: 0 };
  }

  const key = pairKey(rear.id, front.id);
  if ((cooldowns.get(key) ?? 0) > 0) {
    // Exchange already fired for this contact; hold the old-style speed cap so
    // the rear car still cannot drive through while the pair re-arms.
    rear.speedKph = Math.min(rear.speedKph, front.speedKph);
    return { hardBump: false, deltaKph: 0 };
  }

  const frontGainKph = Math.min(
    deltaKph,
    deltaKph * BUMP_FRONT_GAIN_RATIO * ((2 * rear.massFactor) / massTotal)
  );
  const rearLossKph = Math.min(
    deltaKph,
    deltaKph * BUMP_REAR_LOSS_RATIO * ((2 * front.massFactor) / massTotal)
  );
  front.speedKph += frontGainKph;
  rear.speedKph -= rearLossKph;
  capBodySpeed(front);
  capBodySpeed(rear);
  // A capped leader may be unable to accept the full calculated gain. Match
  // the bumper down when necessary so the pair still separates cleanly and a
  // hard hit cannot become an infinite sequence of contact exchanges.
  if (rear.speedKph >= front.speedKph) {
    rear.speedKph = front.speedKph;
  }
  cooldowns.set(key, BUMP_PAIR_COOLDOWN_SECONDS);
  return { hardBump: true, deltaKph };
}

// Resolve same-lane car/car overlaps and the player colliding with same-lane
// traffic. Overlaps are removed by pushing the trailing car back to a bumper
// gap so nothing passes through anything, and every fresh contact runs the
// rear-contact speed exchange above (the player included, in both directions).
// This function is pure: it copies the input, never mutates the caller's array
// or contact map, and returns the updated cooldowns for the next frame.
export function resolveRoadVehicleCollisions<T extends RoadCollisionVehicle>(
  vehicles: readonly T[],
  playerSpeedKph: number,
  playerLane: TrafficLane,
  options: RoadCollisionOptions = {}
): RoadCollisionResolution<T> {
  const dt = options.dt ?? 1 / 60;
  const cooldowns = new Map<string, number>();
  for (const [key, remaining] of options.contacts ?? []) {
    const next = remaining - dt;
    if (next > 0) {
      cooldowns.set(key, next);
    }
  }

  const resolved = vehicles.map((vehicle) => ({ ...vehicle })) as Array<Mutable<T>>;
  const bodies = new Map<string, ExchangeBody>(
    resolved.map((vehicle) => [
      vehicle.id,
      {
        id: vehicle.id,
        speedKph: Math.min(
          mechanicalSpeedLimit(vehicle.maxSpeedKph),
          Math.max(0, vehicle.speedKph)
        ),
        massFactor: vehicle.massFactor ?? DEFAULT_VEHICLE_MASS_FACTOR,
        maxSpeedKph: mechanicalSpeedLimit(vehicle.maxSpeedKph),
        trainPartner: vehicle.trainPartner === true
      }
    ])
  );
  const player: ExchangeBody = {
    id: "__player__",
    speedKph: Math.max(0, playerSpeedKph),
    massFactor: options.playerMassFactor ?? DEFAULT_VEHICLE_MASS_FACTOR,
    maxSpeedKph: mechanicalSpeedLimit(options.playerMaxSpeedKph),
    trainPartner: true
  };
  capBodySpeed(player);
  let playerImpact = false;
  let playerImpactDeltaKph = 0;

  for (const lane of ["left", "center", "right"] as const) {
    // Front (largest relativeMeters) first so trailing vehicles are pushed back.
    const laneCars = resolved
      .filter((vehicle) => vehicle.lane === lane)
      .sort((a, b) => b.relativeMeters - a.relativeMeters);

    // Vehicle/vehicle: a trailing vehicle may never overlap the vehicle ahead.
    for (let i = 1; i < laneCars.length; i += 1) {
      const ahead = laneCars[i - 1]!;
      const behind = laneCars[i]!;
      const maxRel = ahead.relativeMeters - minimumSeparation(ahead, behind);
      if (behind.relativeMeters > maxRel) {
        resolveContact(bodies.get(behind.id)!, bodies.get(ahead.id)!, cooldowns);
        behind.relativeMeters = maxRel;
      }
    }

    if (lane !== playerLane) {
      continue;
    }

    // Player/vehicle: the player sits at relativeMeters 0 in this lane.
    for (const car of laneCars) {
      const body = bodies.get(car.id)!;
      if (car.relativeMeters >= 0 && car.relativeMeters < PLAYER_FOLLOW_GAP_METERS) {
        // Contact ahead: the player is the rear car of the exchange.
        const outcome = resolveContact(player, body, cooldowns);
        car.relativeMeters = PLAYER_FOLLOW_GAP_METERS;
        if (outcome.hardBump) {
          playerImpact = true;
          playerImpactDeltaKph = Math.max(playerImpactDeltaKph, outcome.deltaKph);
        }
      } else if (car.relativeMeters < 0 && car.relativeMeters > -PLAYER_FOLLOW_GAP_METERS) {
        // Contact behind: a faster car shunts the player forward.
        const outcome = resolveContact(body, player, cooldowns);
        car.relativeMeters = -PLAYER_FOLLOW_GAP_METERS;
        if (outcome.hardBump) {
          playerImpact = true;
          playerImpactDeltaKph = Math.max(playerImpactDeltaKph, outcome.deltaKph);
        }
      }
    }
  }

  for (const vehicle of resolved) {
    const body = bodies.get(vehicle.id)!;
    capBodySpeed(body);
    vehicle.speedKph = body.speedKph;
  }

  return {
    vehicles: resolved as T[],
    playerSpeedKph: Math.min(player.maxSpeedKph, Math.max(0, player.speedKph)),
    playerImpact,
    playerImpactDeltaKph,
    contacts: cooldowns
  };
}

export function resolveTrafficCollisions(
  traffic: readonly TrafficVehicle[],
  playerSpeedKph: number,
  playerLane: TrafficLane,
  options: RoadCollisionOptions = {}
): CollisionResolution {
  const resolution = resolveRoadVehicleCollisions(traffic, playerSpeedKph, playerLane, options);

  return {
    traffic: resolution.vehicles,
    playerSpeedKph: resolution.playerSpeedKph,
    playerImpact: resolution.playerImpact
  };
}
