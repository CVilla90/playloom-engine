import {
  MAX_SPEED_KPH,
  ROUTE_LENGTH_METERS,
  createInitialDriveState,
  rpmForSpeed,
  stepDriveModel,
  type DriveInputState,
  type DriveState
} from "../drivingModel";
import {
  PLAYER_FOLLOW_GAP_METERS,
  TRUCK_VEHICLE_MASS_FACTOR,
  resolveRoadVehicleCollisions
} from "../collision";
import { calculateDraftState, calculateLeadPushState, type DraftVehicle } from "../draftModel";
import {
  ROAD_LANES,
  laneChangeProgress,
  startLaneChangeIntent,
  stepLaneChange,
  type LaneChangeIntent
} from "../laneChangeModel";
import {
  createInitialTraffic,
  laneRoadFraction,
  stepTraffic,
  trafficHardSpeedLimitKph,
  type TrafficLane,
  type TrafficVehicle
} from "../trafficModel";
import {
  createInitialRivals,
  rivalHardSpeedLimitKph,
  stepRivals,
  type RivalState
} from "../rivalModel";
import type {
  RaceInputMessage,
  RacePlayerSnapshot,
  RaceRivalSnapshot,
  RaceSessionSnapshot,
  RaceTrafficSnapshot
} from "./protocol";
import {
  WANGAN_SESSION_CAPACITY,
  normalizePlayerName,
  validatePlayerProfile,
  type PlayerProfile
} from "./playerProfile";

interface PlayerInputState {
  accelerate: boolean;
  brake: boolean;
  clutch: boolean;
  shiftUp: boolean;
  shiftDown: boolean;
  selectGear: number | null;
  steer: -1 | 0 | 1;
  sequence: number;
}

interface RacePlayerState {
  readonly id: string;
  readonly profile: PlayerProfile;
  readonly joinedAt: number;
  drive: DriveState;
  lane: TrafficLane;
  laneFraction: number;
  laneChange: LaneChangeIntent | null;
  input: PlayerInputState;
}

type AuthoritativeRivalState = Omit<RivalState, "relativeMeters"> & {
  distanceMeters: number;
};

type AuthoritativeTrafficState = Omit<TrafficVehicle, "relativeMeters"> & {
  distanceMeters: number;
};

interface AuthoritativeCollisionVehicle {
  readonly id: string;
  readonly entityKind: "player" | "rival" | "traffic";
  readonly entityId: string;
  readonly lane: TrafficLane;
  readonly speedKph: number;
  readonly relativeMeters: number;
  readonly lengthMeters?: number;
  readonly massFactor?: number;
  readonly maxSpeedKph?: number;
  readonly contactGapMeters?: number;
  readonly trainPartner?: boolean;
}

export interface JoinRacePlayerResult {
  readonly ok: boolean;
  readonly reason: string | null;
  readonly player: RacePlayerSnapshot | null;
}

const EMPTY_INPUT: PlayerInputState = {
  accelerate: false,
  brake: false,
  clutch: false,
  shiftUp: false,
  shiftDown: false,
  selectGear: null,
  steer: 0,
  sequence: 0
};

const SPAWN_DISTANCE_SLOTS = [84, 236, 388, 540, 692, 844, 996, 1148] as const;
const MIN_SPAWN_GAP_METERS = 72;

function wrapRouteDistance(distanceMeters: number): number {
  return ((distanceMeters % ROUTE_LENGTH_METERS) + ROUTE_LENGTH_METERS) % ROUTE_LENGTH_METERS;
}

export function routeRelativeMeters(fromMeters: number, toMeters: number): number {
  const half = ROUTE_LENGTH_METERS * 0.5;
  const wrapped = ((toMeters - fromMeters + half) % ROUTE_LENGTH_METERS + ROUTE_LENGTH_METERS) % ROUTE_LENGTH_METERS - half;
  return wrapped === -half ? half : wrapped;
}

function laneFractionDuringIntent(intent: LaneChangeIntent): number {
  return laneRoadFraction(intent.fromLane) +
    (laneRoadFraction(intent.targetLane) - laneRoadFraction(intent.fromLane)) * laneChangeProgress(intent);
}

export class AuthoritativeRaceSession {
  private readonly players = new Map<string, RacePlayerState>();
  private rivals: AuthoritativeRivalState[];
  private traffic: AuthoritativeTrafficState[];
  private lastTickAt: number | null = null;
  private collisionContacts: ReadonlyMap<string, number> = new Map();

  constructor(private readonly random: () => number = Math.random) {
    this.rivals = createInitialRivals(random).map(({ relativeMeters, ...rival }) => ({
      ...rival,
      distanceMeters: wrapRouteDistance(relativeMeters)
    }));
    this.traffic = createInitialTraffic().map(({ relativeMeters, ...vehicle }) => ({
      ...vehicle,
      distanceMeters: wrapRouteDistance(relativeMeters)
    }));
  }

  joinPlayer(id: string, rawProfile: Partial<PlayerProfile> | null | undefined, now = Date.now()): JoinRacePlayerResult {
    if (this.players.has(id)) {
      const player = this.players.get(id)!;
      return { ok: true, reason: null, player: this.toSnapshot(player) };
    }

    const validation = validatePlayerProfile(rawProfile ?? {});
    if (!validation.ok || !validation.profile) {
      return { ok: false, reason: validation.reason, player: null };
    }
    if (this.players.size >= WANGAN_SESSION_CAPACITY) {
      return { ok: false, reason: "The global session is full. Try again when a driver leaves.", player: null };
    }
    if ([...this.players.values()].some((player) => normalizePlayerName(player.profile.name) === validation.normalizedName)) {
      return { ok: false, reason: "That player name is already in this session.", player: null };
    }

    const spawn = this.chooseSpawn();
    const baseDrive = createInitialDriveState();
    const player: RacePlayerState = {
      id,
      profile: validation.profile,
      joinedAt: now,
      drive: {
        ...baseDrive,
        distanceMeters: spawn.distanceMeters,
        visualDistanceMeters: spawn.distanceMeters
      },
      lane: spawn.lane,
      laneFraction: laneRoadFraction(spawn.lane),
      laneChange: null,
      input: { ...EMPTY_INPUT }
    };
    this.players.set(id, player);
    return { ok: true, reason: null, player: this.toSnapshot(player) };
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  applyInput(id: string, message: RaceInputMessage): void {
    const player = this.players.get(id);
    if (!player || !Number.isSafeInteger(message.sequence) || message.sequence <= player.input.sequence) {
      return;
    }
    player.input = {
      accelerate: message.accelerate === true,
      brake: message.brake === true,
      clutch: message.clutch === true,
      shiftUp: message.shiftUp === true,
      shiftDown: message.shiftDown === true,
      selectGear:
        message.selectGear !== null && Number.isFinite(message.selectGear)
          ? Math.max(1, Math.min(6, Math.round(message.selectGear)))
          : null,
      steer: message.steer === -1 || message.steer === 1 ? message.steer : 0,
      sequence: message.sequence
    };
  }

  tick(now = Date.now()): void {
    if (this.lastTickAt === null) {
      this.lastTickAt = now;
      return;
    }
    const dt = Math.max(0, Math.min(0.05, (now - this.lastTickAt) / 1000));
    this.lastTickAt = now;
    if (dt <= 0) {
      return;
    }

    const draftVehicles = [...this.players.values()];
    // Rivals/traffic step in the anchor's relative frame. Capture every
    // player's pre-step position so that frame can be anchored at the START of
    // this tick; converting AND reconstructing against the post-step anchor
    // position double-subtracts the anchor's own motion, which silently drags
    // every NPC backward by the anchor's speed in world coordinates.
    const preStepDistances = new Map(
      draftVehicles.map((player) => [player.id, player.drive.distanceMeters])
    );
    for (const player of this.players.values()) {
      this.stepPlayer(player, draftVehicles, this.rivals, this.traffic, dt);
    }
    this.stepAuthoritativeRivals(draftVehicles, preStepDistances, dt);
    this.stepAuthoritativeTraffic(draftVehicles, preStepDistances, dt);
    this.resolveAuthoritativeCollisions(dt);
  }

  getSnapshot(now = Date.now()): RaceSessionSnapshot {
    return {
      serverTime: now,
      capacity: WANGAN_SESSION_CAPACITY,
      players: [...this.players.values()].map((player) => this.toSnapshot(player)),
      rivals: this.rivals.map((rival) => this.toRivalSnapshot(rival)),
      traffic: this.traffic.map((vehicle) => this.toTrafficSnapshot(vehicle))
    };
  }

  private stepPlayer(
    player: RacePlayerState,
    allPlayers: readonly RacePlayerState[],
    rivals: readonly AuthoritativeRivalState[],
    traffic: readonly AuthoritativeTrafficState[],
    dt: number
  ): void {
    if (player.laneChange === null && player.input.steer !== 0) {
      const currentIndex = ROAD_LANES.indexOf(player.lane);
      const targetIndex = Math.max(0, Math.min(ROAD_LANES.length - 1, currentIndex + player.input.steer));
      player.laneChange = startLaneChangeIntent(player.lane, ROAD_LANES[targetIndex]!);
    }
    const laneStep = stepLaneChange(player.lane, player.laneChange, dt);
    player.lane = laneStep.lane;
    player.laneChange = laneStep.intent;
    player.laneFraction = player.laneChange
      ? laneFractionDuringIntent(player.laneChange)
      : laneRoadFraction(player.lane);

    const relativePlayers: DraftVehicle[] = allPlayers
      .filter((other) => other.id !== player.id)
      .map((other) => ({
        id: other.id,
        lane: other.lane,
        speedKph: other.drive.speedKph,
        relativeMeters: routeRelativeMeters(player.drive.distanceMeters, other.drive.distanceMeters)
      }));
    relativePlayers.push(...rivals.map((rival) => ({
      id: rival.id,
      lane: rival.lane,
      speedKph: rival.speedKph,
      relativeMeters: routeRelativeMeters(player.drive.distanceMeters, rival.distanceMeters)
    })));
    relativePlayers.push(...traffic.map((vehicle) => ({
      id: vehicle.id,
      lane: vehicle.lane,
      speedKph: vehicle.speedKph,
      relativeMeters: routeRelativeMeters(player.drive.distanceMeters, vehicle.distanceMeters)
    })));
    const subject: DraftVehicle = {
      id: player.id,
      lane: player.lane,
      speedKph: player.drive.speedKph,
      relativeMeters: 0
    };
    const draft = calculateDraftState(subject, relativePlayers);
    const push = calculateLeadPushState(subject, relativePlayers);
    const driveInput: DriveInputState = {
      accelerate: player.input.accelerate,
      brake: player.input.brake,
      // A mobile H-gate selection is queued only after the client confirms the
      // clutch was held. Latch that authorization through this server tick so
      // near-simultaneous finger release cannot discard an otherwise valid shift.
      clutch: player.input.clutch || player.input.selectGear !== null,
      shiftUp: player.input.shiftUp,
      shiftDown: player.input.shiftDown,
      selectGear: player.input.selectGear ?? undefined,
      draftPowerMultiplier: draft.powerMultiplier * push.powerMultiplier
    };
    player.drive = stepDriveModel(player.drive, driveInput, dt);
    player.input.shiftUp = false;
    player.input.shiftDown = false;
    player.input.selectGear = null;
    player.input.steer = 0;
  }

  private stepAuthoritativeRivals(
    players: readonly RacePlayerState[],
    preStepDistances: ReadonlyMap<string, number>,
    dt: number
  ): void {
    const anchor = players[0];
    if (!anchor) {
      this.rivals = this.rivals.map((rival) => ({
        ...rival,
        distanceMeters: wrapRouteDistance(rival.distanceMeters + (rival.speedKph / 3.6) * dt)
      }));
      return;
    }

    // Convert into the anchor frame as it was at the START of this tick, but
    // reconstruct against the anchor's post-step position: stepRivals advances
    // relativeMeters by (rivalSpeed - anchorSpeed) * dt, so the anchor's own
    // travel this tick must be added back exactly once.
    const anchorFrameMeters = preStepDistances.get(anchor.id) ?? anchor.drive.distanceMeters;
    const playerRelativePositions = players.map((player) =>
      routeRelativeMeters(
        anchorFrameMeters,
        preStepDistances.get(player.id) ?? player.drive.distanceMeters
      )
    );
    const relativeRivals: RivalState[] = this.rivals.map(({ distanceMeters, ...rival }) => ({
      ...rival,
      relativeMeters: routeRelativeMeters(anchorFrameMeters, distanceMeters)
    }));
    const obstacles = [
      ...players.slice(1).map((player) => ({
        id: `player:${player.id}`,
        lane: player.lane,
        speedKph: player.drive.speedKph,
        relativeMeters: routeRelativeMeters(
          anchorFrameMeters,
          preStepDistances.get(player.id) ?? player.drive.distanceMeters
        ),
        trainPartner: true
      })),
      ...this.traffic.map((vehicle) => ({
        id: `traffic:${vehicle.id}`,
        lane: vehicle.lane,
        speedKph: vehicle.speedKph,
        relativeMeters: routeRelativeMeters(anchorFrameMeters, vehicle.distanceMeters),
        trainPartner: false
      }))
    ];
    const stepped = stepRivals(relativeRivals, {
      playerSpeedKph: anchor.drive.speedKph,
      playerLane: anchor.lane,
      obstacles,
      playerRelativePositions,
      dt
    });
    this.rivals = stepped.map(({ relativeMeters, ...rival }) => ({
      ...rival,
      distanceMeters: wrapRouteDistance(anchor.drive.distanceMeters + relativeMeters)
    }));
  }

  private stepAuthoritativeTraffic(
    players: readonly RacePlayerState[],
    preStepDistances: ReadonlyMap<string, number>,
    dt: number
  ): void {
    const anchor = players[0];
    // Same frame rule as rivals: convert against the anchor's pre-step
    // position, reconstruct against its post-step position, so traffic keeps
    // its own world speed instead of losing the anchor's.
    const anchorFrameMeters = anchor
      ? preStepDistances.get(anchor.id) ?? anchor.drive.distanceMeters
      : 0;
    const anchorDistanceNow = anchor?.drive.distanceMeters ?? 0;
    const relativeTraffic: TrafficVehicle[] = this.traffic.map(({ distanceMeters, ...vehicle }) => ({
      ...vehicle,
      relativeMeters: routeRelativeMeters(anchorFrameMeters, distanceMeters)
    }));
    const obstacles = [
      ...this.rivals.map((rival) => ({
        id: `rival:${rival.id}`,
        lane: rival.lane,
        speedKph: rival.speedKph,
        relativeMeters: routeRelativeMeters(anchorFrameMeters, rival.distanceMeters)
      })),
      ...players.slice(1).map((player) => ({
        id: `player:${player.id}`,
        lane: player.lane,
        speedKph: player.drive.speedKph,
        relativeMeters: routeRelativeMeters(
          anchorFrameMeters,
          preStepDistances.get(player.id) ?? player.drive.distanceMeters
        )
      }))
    ];
    const stepped = stepTraffic(relativeTraffic, anchor?.drive.speedKph ?? 0, dt, {
      playerLane: anchor?.lane,
      obstacles,
      persistentLoop: true
    });
    this.traffic = stepped.map(({ relativeMeters, ...vehicle }) => ({
      ...vehicle,
      distanceMeters: wrapRouteDistance(anchorDistanceNow + relativeMeters)
    }));
  }

  private chooseSpawn(): { distanceMeters: number; lane: TrafficLane } {
    const candidates = SPAWN_DISTANCE_SLOTS.flatMap((distanceMeters) =>
      ROAD_LANES.map((lane) => ({ distanceMeters, lane, random: this.random() }))
    ).sort((left, right) => left.random - right.random);
    const available = candidates.filter((candidate) =>
      [...this.players.values()].every((player) =>
        player.lane !== candidate.lane ||
        Math.abs(routeRelativeMeters(candidate.distanceMeters, player.drive.distanceMeters)) >= MIN_SPAWN_GAP_METERS
      ) &&
      this.rivals.every((rival) =>
        rival.lane !== candidate.lane ||
        Math.abs(routeRelativeMeters(candidate.distanceMeters, rival.distanceMeters)) >= MIN_SPAWN_GAP_METERS
      ) &&
      this.traffic.every((vehicle) =>
        vehicle.lane !== candidate.lane ||
        Math.abs(routeRelativeMeters(candidate.distanceMeters, vehicle.distanceMeters)) >= MIN_SPAWN_GAP_METERS
      )
    );
    const picked = available[0] ?? candidates[0] ?? { distanceMeters: 84, lane: "center" as const };
    return { distanceMeters: wrapRouteDistance(picked.distanceMeters), lane: picked.lane };
  }

  private resolveAuthoritativeCollisions(dt: number): void {
    const players = [...this.players.values()];
    const anchor = players[0];
    if (!anchor) {
      this.collisionContacts = new Map();
      return;
    }
    const vehicles: AuthoritativeCollisionVehicle[] = [
      ...players.slice(1).map((player) => ({
        id: `player:${player.id}`,
        entityKind: "player" as const,
        entityId: player.id,
        lane: player.lane,
        speedKph: player.drive.speedKph,
        relativeMeters: routeRelativeMeters(anchor.drive.distanceMeters, player.drive.distanceMeters),
        // Player cars keep the same readable 12 m contact gap regardless of
        // whether either participant happens to be the session anchor.
        contactGapMeters: PLAYER_FOLLOW_GAP_METERS,
        maxSpeedKph: MAX_SPEED_KPH,
        trainPartner: true
      })),
      ...this.rivals.map((rival) => ({
        id: `rival:${rival.id}`,
        entityKind: "rival" as const,
        entityId: rival.id,
        lane: rival.lane,
        speedKph: rival.speedKph,
        relativeMeters: routeRelativeMeters(anchor.drive.distanceMeters, rival.distanceMeters),
        maxSpeedKph: rivalHardSpeedLimitKph(rival),
        trainPartner: true
      })),
      ...this.traffic.map((vehicle) => ({
        id: `traffic:${vehicle.id}`,
        entityKind: "traffic" as const,
        entityId: vehicle.id,
        lane: vehicle.lane,
        speedKph: vehicle.speedKph,
        relativeMeters: routeRelativeMeters(anchor.drive.distanceMeters, vehicle.distanceMeters),
        massFactor: vehicle.kind === "truck" ? TRUCK_VEHICLE_MASS_FACTOR : 1,
        maxSpeedKph: trafficHardSpeedLimitKph(vehicle.kind),
        trainPartner: false
      }))
    ];
    const resolved = resolveRoadVehicleCollisions(vehicles, anchor.drive.speedKph, anchor.lane, {
      dt,
      contacts: this.collisionContacts,
      playerMaxSpeedKph: MAX_SPEED_KPH
    });
    this.collisionContacts = resolved.contacts;
    anchor.drive = {
      ...anchor.drive,
      speedKph: resolved.playerSpeedKph,
      rpm: anchor.input.clutch ? anchor.drive.rpm : rpmForSpeed(resolved.playerSpeedKph, anchor.drive.gear),
      maxSpeedKph: Math.max(anchor.drive.maxSpeedKph, resolved.playerSpeedKph)
    };
    const playersById = new Map(players.map((player) => [player.id, player]));
    const resolvedById = new Map(resolved.vehicles.map((vehicle) => [vehicle.id, vehicle]));
    for (const vehicle of resolved.vehicles) {
      if (vehicle.entityKind !== "player") {
        continue;
      }
      const player = playersById.get(vehicle.entityId);
      if (!player) continue;
      const distanceMeters = wrapRouteDistance(anchor.drive.distanceMeters + vehicle.relativeMeters);
      player.drive = {
        ...player.drive,
        distanceMeters,
        speedKph: vehicle.speedKph,
        rpm: player.input.clutch ? player.drive.rpm : rpmForSpeed(vehicle.speedKph, player.drive.gear),
        maxSpeedKph: Math.max(player.drive.maxSpeedKph, vehicle.speedKph)
      };
    }
    this.rivals = this.rivals.map((rival) => {
      const vehicle = resolvedById.get(`rival:${rival.id}`);
      return vehicle
        ? {
            ...rival,
            distanceMeters: wrapRouteDistance(anchor.drive.distanceMeters + vehicle.relativeMeters),
            speedKph: vehicle.speedKph
          }
        : rival;
    });
    this.traffic = this.traffic.map((traffic) => {
      const vehicle = resolvedById.get(`traffic:${traffic.id}`);
      return vehicle
        ? {
            ...traffic,
            distanceMeters: wrapRouteDistance(anchor.drive.distanceMeters + vehicle.relativeMeters),
            speedKph: vehicle.speedKph
          }
        : traffic;
    });
  }

  private toSnapshot(player: RacePlayerState): RacePlayerSnapshot {
    return {
      id: player.id,
      name: player.profile.name,
      mainColor: player.profile.mainColor,
      accentColor: player.profile.accentColor,
      joinedAt: player.joinedAt,
      ...player.drive,
      lane: player.lane,
      laneFraction: player.laneFraction,
      laneChange: player.laneChange,
      acknowledgedInputSequence: player.input.sequence
    };
  }

  private toRivalSnapshot(rival: AuthoritativeRivalState): RaceRivalSnapshot {
    return { ...rival };
  }

  private toTrafficSnapshot(vehicle: AuthoritativeTrafficState): RaceTrafficSnapshot {
    return { ...vehicle };
  }
}
