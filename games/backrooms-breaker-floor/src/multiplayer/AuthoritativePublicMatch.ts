import {
  ENERGY_DRINK_DURATION,
  ENERGY_DRINK_SPEED_MULTIPLIER,
  MEDKIT_HEAL_AMOUNT,
  PICKUP_DEFINITIONS,
  PICKUP_SPAWN_POINTS,
  rollPickupType
} from "../pickups";
import {
  chooseRandomRoamArea,
  chooseRandomStalkerSpawn,
  findAreaPath,
  pickAreaPoint,
  traversalWaypointBetweenAreas,
  waypointBetweenAreas,
  type Point
} from "../stalker";
import { BLACK_STICKMAN_TUNING, PLAYER_TUNING } from "../tuning";
import {
  AREAS,
  EXIT_TERMINAL,
  LOCKED_EXIT_GATE,
  PANELS,
  PLAYER_SPAWN_POINTS,
  RELAYS,
  type PlayerSpawnPointDef,
  type Rect
} from "../world";
import {
  EXTRACTION_COUNTDOWN_MS,
  JOIN_GRACE_MS,
  LOCKDOWN_SWARM_MS,
  PUBLIC_ROOM_CAPACITY,
  RESULTS_HOLD_MS,
  ROUND_DURATION_MS,
  formatPublicRoomStatus,
  type PublicRoundPlayerResult,
  type PublicRoundResults,
  type PublicRoomMissionProgress,
  type PublicRoomPhase,
  type PublicRoomSnapshot,
  type PublicRoomStatusBanner
} from "./publicRoomTypes";
import {
  validatePlayerName
} from "./roomModel";
import type {
  MatchObjectiveSnapshot,
  MatchPunchHit,
  MatchPunchResult,
  MatchPickupSnapshot,
  MatchPlayerSnapshot,
  MatchSnapshot,
  MatchStalkerSnapshot,
  MatchStalkerMode,
  MatchVector
} from "./protocol";

const RESETTING_HOLD_MS = 250;
const SPAWN_PROTECTION_MS = 2000;
const DEFAULT_STALKER_ID = "stalker-primary";
const PLAYER_RADIUS = 12;
const RELAY_INTERACTION_RANGE = 46;
const PANEL_INTERACTION_RANGE = 52;
const EXIT_INTERACTION_RANGE = 58;
const MAX_MOVEMENT_DELTA_MS = 250;
const MOVEMENT_GRACE_DISTANCE = 4;
const STALKER_TRANSITION_COMMIT_DISTANCE = 22;
const STALKER_TRANSITION_REACHED_DISTANCE = 8;

interface MatchPlayerState {
  readonly id: string;
  readonly joinedAt: number;
  name: string;
  normalizedName: string;
  x: number;
  y: number;
  facing: MatchVector;
  flashlightOn: boolean;
  health: number;
  maxHealth: number;
  isDead: boolean;
  insideExitSafe: boolean;
  spawnProtectionEndsAt: number | null;
  speedBoostEndsAt: number | null;
  punchCooldownEndsAt: number | null;
  punchTimeRemainingMs: number;
  punchFacing: MatchVector;
  punchArmSide: -1 | 1;
  nextPunchArmSide: -1 | 1;
  lastPositionSyncAt: number;
}

interface MatchPickupState {
  id: string;
  type: MatchPickupSnapshot["type"];
  x: number;
  y: number;
  radius: number;
  collected: boolean;
}

interface MatchStalkerState {
  id: string;
  x: number;
  y: number;
  facing: MatchVector;
  health: number;
  maxHealth: number;
  isDead: boolean;
  mode: MatchStalkerSnapshot["mode"];
  areaId: string | null;
  roamAreaId: string | null;
  roamTargetX: number;
  roamTargetY: number;
  lastSeenPlayerX: number;
  lastSeenPlayerY: number;
  lastSeenPlayerAreaId: string | null;
  chaseMemoryRemainingMs: number;
  attackTimeRemainingMs: number;
  attackCooldownTimeRemainingMs: number;
  attackArmSide: -1 | 1;
  attackDidDamage: boolean;
  transitionFromAreaId: string | null;
  transitionToAreaId: string | null;
  transitionWaypointX: number;
  transitionWaypointY: number;
}

interface ActionResult<T> {
  readonly ok: boolean;
  readonly reason: string | null;
  readonly value: T | null;
}

export interface JoinPlayerArgs {
  readonly id: string;
  readonly name: string;
}

export interface SyncPlayerStateArgs {
  readonly x: number;
  readonly y: number;
  readonly move: MatchVector;
  readonly facing: MatchVector;
  readonly flashlightOn: boolean;
  readonly wantsInteract: boolean;
  readonly wantsPunch: boolean;
}

export interface SyncStalkerStateArgs {
  readonly x: number;
  readonly y: number;
  readonly facing: MatchVector;
  readonly health: number;
  readonly maxHealth: number;
  readonly isDead: boolean;
  readonly mode: MatchStalkerMode;
  readonly areaId: string | null;
}

export interface AuthoritativePublicMatchOptions {
  readonly now?: number;
  readonly random?: () => number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distanceSquared(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

function circlesIntersect(
  x1: number,
  y1: number,
  radius1: number,
  x2: number,
  y2: number,
  radius2: number
): boolean {
  const radius = radius1 + radius2;
  return distanceSquared(x1, y1, x2, y2) <= radius * radius;
}

function circleIntersectsRect(cx: number, cy: number, radius: number, rect: Rect): boolean {
  const closestX = clamp(cx, rect.x, rect.x + rect.width);
  const closestY = clamp(cy, rect.y, rect.y + rect.height);
  return distanceSquared(cx, cy, closestX, closestY) <= radius * radius;
}

function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function rectContainsPoint(rect: Rect, x: number, y: number, padding = 0): boolean {
  return (
    x >= rect.x + padding &&
    x <= rect.x + rect.width - padding &&
    y >= rect.y + padding &&
    y <= rect.y + rect.height - padding
  );
}

const EXIT_CHAMBER = AREAS.find((area) => area.id === "exit-chamber");

function normalizeFacing(facing: MatchVector): MatchVector {
  const length = Math.hypot(facing.x, facing.y);
  if (length <= 0.001) {
    return { x: 1, y: 0 };
  }

  return {
    x: facing.x / length,
    y: facing.y / length
  };
}

export class AuthoritativePublicMatch {
  private readonly random: () => number;
  private phase: PublicRoomPhase = "waiting";
  private phaseChangedAt: number;
  private lastTickAt: number;
  private roundStartedAt: number | null = null;
  private extractionStartedAt: number | null = null;
  private statusBanner: PublicRoomStatusBanner | null = null;
  private results: PublicRoundResults | null = null;
  private readonly players = new Map<string, MatchPlayerState>();
  private pickups: MatchPickupState[] = [];
  private stalkers: MatchStalkerState[] = [];
  private readonly collectedRelayIds = new Set<string>();
  private readonly activatedPanelIds = new Set<string>();

  constructor(options: AuthoritativePublicMatchOptions = {}) {
    const now = options.now ?? Date.now();
    this.random = options.random ?? Math.random;
    this.phaseChangedAt = now;
    this.lastTickAt = now;
  }

  getPhase(): PublicRoomPhase {
    return this.phase;
  }

  getMissionProgress(): PublicRoomMissionProgress {
    return {
      relaysRestored: this.collectedRelayIds.size,
      relayTotal: RELAYS.length,
      panelsActivated: this.activatedPanelIds.size,
      panelTotal: PANELS.length,
      exitUnlocked: this.exitUnlocked()
    };
  }

  getObjectiveSnapshot(): MatchObjectiveSnapshot {
    return {
      restoredRelayIds: [...this.collectedRelayIds].sort(),
      activatedPanelIds: [...this.activatedPanelIds].sort(),
      exitUnlocked: this.exitUnlocked()
    };
  }

  joinPlayer(args: JoinPlayerArgs, now = Date.now()): ActionResult<MatchPlayerSnapshot> {
    const validation = validatePlayerName(args.name);
    if (!validation.ok) {
      return {
        ok: false,
        reason: validation.reason,
        value: null
      };
    }

    this.tick(now);
    if (!this.isJoinable(now)) {
      return {
        ok: false,
        reason: this.joinWaitReason(now) ?? "Current room is not joinable right now.",
        value: null
      };
    }

    const duplicateName = [...this.players.values()].some(
      (player) => player.id !== args.id && player.normalizedName === validation.normalizedName
    );
    if (duplicateName) {
      return {
        ok: false,
        reason: "That name is already in the room. Choose another one.",
        value: null
      };
    }

    const spawnPoint = this.chooseSpawnPoint();
    const existing = this.players.get(args.id);
    const player: MatchPlayerState = {
      id: args.id,
      joinedAt: existing?.joinedAt ?? now,
      name: validation.trimmedName,
      normalizedName: validation.normalizedName,
      x: spawnPoint.x,
      y: spawnPoint.y,
      facing: { x: 1, y: 0 },
      flashlightOn: true,
      health: PLAYER_TUNING.maxHealth,
      maxHealth: PLAYER_TUNING.maxHealth,
      isDead: false,
      insideExitSafe: false,
      spawnProtectionEndsAt: now + SPAWN_PROTECTION_MS,
      speedBoostEndsAt: null,
      punchCooldownEndsAt: null,
      punchTimeRemainingMs: 0,
      punchFacing: { x: 1, y: 0 },
      punchArmSide: 1,
      nextPunchArmSide: 1,
      lastPositionSyncAt: now
    };
    this.players.set(player.id, player);

    if (this.phase === "waiting") {
      this.startRound(now);
    }

    this.tick(now);
    return {
      ok: true,
      reason: null,
      value: this.toPlayerSnapshot(player, now)
    };
  }

  removePlayer(playerId: string, now = Date.now()): void {
    this.players.delete(playerId);
    if (this.players.size === 0) {
      this.resetToWaiting(now);
      return;
    }

    if (!this.hasActiveLivingPlayers() && this.isRoundActive()) {
      this.finishRound("wipe", now);
      return;
    }

    this.tick(now);
  }

  applyInputUpdate(
    playerId: string,
    input: {
      readonly move: MatchVector;
      readonly facing: MatchVector;
      readonly flashlightOn: boolean;
      readonly wantsInteract: boolean;
      readonly wantsPunch: boolean;
    },
    now = Date.now()
  ): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }

    player.facing = normalizeFacing(input.facing);
    const flashlightChanged = player.flashlightOn !== input.flashlightOn;
    player.flashlightOn = input.flashlightOn;
    const isBreakingProtection =
      Math.abs(input.move.x) > 0.01 ||
      Math.abs(input.move.y) > 0.01 ||
      flashlightChanged ||
      input.wantsInteract ||
      input.wantsPunch;
    if (isBreakingProtection) {
      player.spawnProtectionEndsAt = null;
    }
  }

  syncPlayerState(
    playerId: string,
    state: SyncPlayerStateArgs,
    now = Date.now()
  ): ActionResult<MatchPlayerSnapshot> {
    const player = this.players.get(playerId);
    if (!player) {
      return {
        ok: false,
        reason: "Player is not active in the match.",
        value: null
      };
    }

    player.facing = normalizeFacing(state.facing);
    const flashlightChanged = player.flashlightOn !== state.flashlightOn;
    player.flashlightOn = state.flashlightOn;
    const isBreakingProtection =
      Math.abs(state.move.x) > 0.01 ||
      Math.abs(state.move.y) > 0.01 ||
      flashlightChanged ||
      state.wantsInteract ||
      state.wantsPunch ||
      player.x !== state.x ||
      player.y !== state.y;
    if (isBreakingProtection) {
      player.spawnProtectionEndsAt = null;
    }

    const validatedPosition = this.resolveValidatedPlayerPosition(player, state.x, state.y, now);
    player.x = validatedPosition.x;
    player.y = validatedPosition.y;
    player.lastPositionSyncAt = now;

    if (!this.hasActiveLivingPlayers() && this.isRoundActive()) {
      this.finishRound("wipe", now);
      return {
        ok: true,
        reason: null,
        value: this.toPlayerSnapshot(player, now)
      };
    }

    this.tick(now);
    return {
      ok: true,
      reason: null,
      value: this.toPlayerSnapshot(player, now)
    };
  }

  syncStalkerState(
    stalkerId: string,
    state: SyncStalkerStateArgs,
    now = Date.now()
  ): ActionResult<MatchStalkerSnapshot> {
    const stalker = this.stalkers.find((candidate) => candidate.id === stalkerId);
    if (!stalker) {
      return {
        ok: false,
        reason: "Stalker is not active in the match.",
        value: null
      };
    }

    stalker.x = state.x;
    stalker.y = state.y;
    stalker.facing = normalizeFacing(state.facing);
    stalker.health = clamp(state.isDead ? 0 : state.health, 0, Math.max(1, state.maxHealth));
    stalker.maxHealth = Math.max(1, state.maxHealth);
    stalker.isDead = state.isDead || stalker.health <= 0;
    if (stalker.isDead) {
      stalker.health = 0;
      stalker.attackTimeRemainingMs = 0;
      stalker.attackCooldownTimeRemainingMs = 0;
      stalker.attackDidDamage = true;
      this.clearStalkerTransition(stalker);
    }
    stalker.mode = state.mode;
    stalker.areaId = state.areaId;
    this.clearStalkerTransition(stalker);
    this.tick(now);
    return {
      ok: true,
      reason: null,
      value: this.toStalkerSnapshot(stalker)
    };
  }

  setPlayerPosition(playerId: string, x: number, y: number, now = Date.now()): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }

    if (player.x !== x || player.y !== y) {
      player.spawnProtectionEndsAt = null;
    }
    player.x = x;
    player.y = y;
    player.lastPositionSyncAt = now;
    this.tick(now);
  }

  submitPunch(playerId: string, facing: MatchVector, now = Date.now()): ActionResult<MatchPunchResult> {
    const player = this.players.get(playerId);
    if (!player || player.isDead) {
      return {
        ok: false,
        reason: "Player is not active in the match.",
        value: null
      };
    }

    this.tick(now);
    if (!this.isRoundActive()) {
      return {
        ok: false,
        reason: "Combat is unavailable in the current phase.",
        value: null
      };
    }

    if (player.punchCooldownEndsAt !== null && player.punchCooldownEndsAt > now) {
      return {
        ok: false,
        reason: "Punch is still on cooldown.",
        value: null
      };
    }

    if (this.phase === "lockdown_swarm" && player.insideExitSafe) {
      return {
        ok: false,
        reason: "Safe players cannot attack during lockdown.",
        value: null
      };
    }

    player.facing = normalizeFacing(facing);
    player.spawnProtectionEndsAt = null;
    player.punchCooldownEndsAt = now + PLAYER_TUNING.punch.cooldown * 1000;
    player.punchFacing = {
      ...player.facing
    };
    player.punchTimeRemainingMs = PLAYER_TUNING.punch.animationDuration * 1000;
    player.punchArmSide = player.nextPunchArmSide;
    player.nextPunchArmSide = player.nextPunchArmSide === 1 ? -1 : 1;

    const hitX = player.x + player.facing.x * PLAYER_TUNING.punch.range;
    const hitY = player.y + player.facing.y * PLAYER_TUNING.punch.range;
    const hits: MatchPunchHit[] = [];

    for (const stalker of this.stalkers) {
      if (stalker.isDead) {
        continue;
      }

      if (!circleIntersectsRect(hitX, hitY, PLAYER_TUNING.punch.radius, this.stalkerCombatHitbox(stalker))) {
        continue;
      }

      this.damageStalkerState(stalker, PLAYER_TUNING.punch.damage);
      hits.push({
        targetKind: "stalker",
        targetId: stalker.id,
        damage: PLAYER_TUNING.punch.damage,
        defeated: stalker.isDead
      });
    }

    for (const target of this.players.values()) {
      if (target.id === player.id || target.isDead || this.isDamageProtected(target, now)) {
        continue;
      }

      if (!circlesIntersect(hitX, hitY, PLAYER_TUNING.punch.radius, target.x, target.y, PLAYER_RADIUS)) {
        continue;
      }

      this.damagePlayerState(target, PLAYER_TUNING.punch.damage, now);
      hits.push({
        targetKind: "player",
        targetId: target.id,
        damage: PLAYER_TUNING.punch.damage,
        defeated: target.isDead
      });
    }

    this.tick(now);
    return {
      ok: true,
      reason: null,
      value: {
        attackerId: player.id,
        hits
      }
    };
  }

  collectRelay(playerId: string, relayId: string, now = Date.now()): ActionResult<PublicRoomMissionProgress> {
    const player = this.players.get(playerId);
    if (!player || player.isDead) {
      return {
        ok: false,
        reason: "Player is not active in the match.",
        value: null
      };
    }

    const relay = RELAYS.find((candidate) => candidate.id === relayId);
    if (!relay) {
      return {
        ok: false,
        reason: "Unknown relay.",
        value: null
      };
    }

    if (!this.isWithinInteractionRange(player.x, player.y, relay.x, relay.y, RELAY_INTERACTION_RANGE)) {
      return {
        ok: false,
        reason: "Move closer to the relay first.",
        value: null
      };
    }

    if (this.collectedRelayIds.has(relayId)) {
      return {
        ok: false,
        reason: "Relay is already restored.",
        value: null
      };
    }

    this.collectedRelayIds.add(relayId);
    this.tick(now);
    return {
      ok: true,
      reason: null,
      value: this.getMissionProgress()
    };
  }

  collectPickup(playerId: string, pickupId: string, now = Date.now()): ActionResult<MatchPickupSnapshot> {
    const player = this.players.get(playerId);
    if (!player || player.isDead) {
      return {
        ok: false,
        reason: "Player is not active in the match.",
        value: null
      };
    }

    const pickup = this.pickups.find((candidate) => candidate.id === pickupId);
    if (!pickup || pickup.collected) {
      return {
        ok: false,
        reason: "Pickup is no longer available.",
        value: null
      };
    }

    if (!this.isWithinInteractionRange(player.x, player.y, pickup.x, pickup.y, PLAYER_RADIUS + pickup.radius)) {
      return {
        ok: false,
        reason: "Move closer to the pickup first.",
        value: null
      };
    }

    pickup.collected = true;
    if (pickup.type === "medkit") {
      player.health = clamp(player.health + MEDKIT_HEAL_AMOUNT, 0, player.maxHealth);
    } else if (pickup.type === "energy_drink") {
      player.speedBoostEndsAt = Math.max(player.speedBoostEndsAt ?? 0, now + ENERGY_DRINK_DURATION * 1000);
    }

    this.tick(now);
    return {
      ok: true,
      reason: null,
      value: pickup
    };
  }

  activatePanel(playerId: string, panelId: string, now = Date.now()): ActionResult<PublicRoomMissionProgress> {
    const player = this.players.get(playerId);
    if (!player || player.isDead) {
      return {
        ok: false,
        reason: "Player is not active in the match.",
        value: null
      };
    }

    const panel = PANELS.find((candidate) => candidate.id === panelId);
    if (!panel) {
      return {
        ok: false,
        reason: "Unknown breaker panel.",
        value: null
      };
    }

    if (!this.isWithinInteractionRange(player.x, player.y, panel.x, panel.y, PANEL_INTERACTION_RANGE)) {
      return {
        ok: false,
        reason: "Move closer to the breaker panel first.",
        value: null
      };
    }

    if (this.activatedPanelIds.has(panelId)) {
      return {
        ok: false,
        reason: "Panel is already activated.",
        value: null
      };
    }

    if (this.collectedRelayIds.size < RELAYS.length) {
      return {
        ok: false,
        reason: "Restore all relays before touching the breakers.",
        value: null
      };
    }

    const expectedSequence = this.activatedPanelIds.size + 1;
    if (panel.sequence !== expectedSequence) {
      return {
        ok: false,
        reason: `Activate panel sequence ${expectedSequence} first.`,
        value: null
      };
    }

    this.activatedPanelIds.add(panelId);
    if (this.exitUnlocked()) {
      this.statusBanner = {
        text: "Exit Chamber unlocked. Reach the terminal.",
        tone: "success"
      };
    }
    this.tick(now);
    return {
      ok: true,
      reason: null,
      value: this.getMissionProgress()
    };
  }

  startExtraction(playerId: string, now = Date.now()): ActionResult<MatchSnapshot> {
    const player = this.players.get(playerId);
    if (!player || player.isDead) {
      return {
        ok: false,
        reason: "Player is not active in the match.",
        value: null
      };
    }

    if (!this.exitUnlocked()) {
      return {
        ok: false,
        reason: "The mission is not complete yet.",
        value: null
      };
    }

    if (this.phase !== "round_locked" && this.phase !== "round_joinable") {
      return {
        ok: false,
        reason: "Extraction cannot start in the current phase.",
        value: null
      };
    }

    if (!this.isWithinInteractionRange(player.x, player.y, EXIT_TERMINAL.x, EXIT_TERMINAL.y, EXIT_INTERACTION_RANGE)) {
      return {
        ok: false,
        reason: "Reach the Exit Chamber terminal first.",
        value: null
      };
    }

    this.phase = "extraction_countdown";
    this.phaseChangedAt = now;
    this.extractionStartedAt = now;
    this.statusBanner = {
      text: "Extraction started. Reach the Exit Chamber before seal.",
      tone: "alarm"
    };
    this.tick(now);
    return {
      ok: true,
      reason: null,
      value: this.getSnapshot(now)
    };
  }

  applyPlayerDamage(playerId: string, amount: number, now = Date.now()): ActionResult<MatchPlayerSnapshot> {
    const player = this.players.get(playerId);
    if (!player || player.isDead) {
      return {
        ok: false,
        reason: "Player is not active in the match.",
        value: null
      };
    }

    if (this.isDamageProtected(player, now)) {
      return {
        ok: false,
        reason: "Player cannot take damage right now.",
        value: null
      };
    }

    this.damagePlayerState(player, amount, now);
    this.tick(now);
    return {
      ok: true,
      reason: null,
      value: this.toPlayerSnapshot(player, now)
    };
  }

  applyStalkerDamage(stalkerId: string, amount: number, now = Date.now()): ActionResult<MatchStalkerSnapshot> {
    const stalker = this.stalkers.find((candidate) => candidate.id === stalkerId);
    if (!stalker || stalker.isDead) {
      return {
        ok: false,
        reason: "Stalker is not active in the match.",
        value: null
      };
    }

    this.damageStalkerState(stalker, amount);
    this.tick(now);
    return {
      ok: true,
      reason: null,
      value: this.toStalkerSnapshot(stalker)
    };
  }

  getSnapshot(now = Date.now()): MatchSnapshot {
    const { joinDeadlineAt, roundDeadlineAt, extractionDeadlineAt, phaseEndsAt } = this.deadlines();
    return {
      phase: this.phase,
      roundStartedAt: this.roundStartedAt,
      joinDeadlineAt,
      roundDeadlineAt,
      extractionDeadlineAt,
      phaseEndsAt,
      joinTimeRemainingMs: joinDeadlineAt === null ? null : Math.max(0, joinDeadlineAt - now),
      roundTimeRemainingMs: roundDeadlineAt === null ? null : Math.max(0, roundDeadlineAt - now),
      extractionTimeRemainingMs: extractionDeadlineAt === null ? null : Math.max(0, extractionDeadlineAt - now),
      phaseTimeRemainingMs: phaseEndsAt === null ? null : Math.max(0, phaseEndsAt - now),
      missionProgress: this.getMissionProgress(),
      objectives: this.getObjectiveSnapshot(),
      players: [...this.players.values()]
        .sort((left, right) => left.joinedAt - right.joinedAt || left.id.localeCompare(right.id))
        .map((player) => this.toPlayerSnapshot(player, now)),
      pickups: this.pickups.map((pickup) => ({
        ...pickup
      })),
      stalkers: this.stalkers.map((stalker) => this.toStalkerSnapshot(stalker)),
      statusBanner: this.statusBanner,
      results: this.results
    };
  }

  getRoomSnapshot(localPlayerId: string, now = Date.now()): PublicRoomSnapshot {
    const snapshot = this.getSnapshot(now);
    const localPlayer = this.players.get(localPlayerId) ?? null;
    return {
      phase: snapshot.phase,
      players: [...this.players.values()]
        .sort((left, right) => left.joinedAt - right.joinedAt || left.id.localeCompare(right.id))
        .map((player) => ({
          sessionId: player.id,
          name: player.name,
          normalizedName: player.normalizedName,
          joinedAt: player.joinedAt,
          lastSeenAt: now
        })),
      capacity: PUBLIC_ROOM_CAPACITY,
      roundStartedAt: snapshot.roundStartedAt,
      joinDeadlineAt: snapshot.joinDeadlineAt,
      roundDeadlineAt: snapshot.roundDeadlineAt,
      extractionDeadlineAt: snapshot.extractionDeadlineAt,
      phaseEndsAt: snapshot.phaseEndsAt,
      joinTimeRemainingMs: snapshot.joinTimeRemainingMs,
      roundTimeRemainingMs: snapshot.roundTimeRemainingMs,
      extractionTimeRemainingMs: snapshot.extractionTimeRemainingMs,
      phaseTimeRemainingMs: snapshot.phaseTimeRemainingMs,
      isJoinable: this.isJoinable(now),
      waitReason: this.joinWaitReason(now),
      missionProgress: snapshot.missionProgress,
      statusBanner: snapshot.statusBanner,
      results: snapshot.results,
      localPlayerId,
      localPlayerName: localPlayer?.name ?? null,
      localPlayerJoined: localPlayer !== null,
      transportState: "connected",
      transportError: null,
      joinRequestPending: false,
      joinError: null
    };
  }

  tick(now = Date.now()): void {
    const deltaMs = this.consumeTickDelta(now);
    if (deltaMs > 0) {
      this.tickPlayers(deltaMs);
    }
    if (this.phase === "waiting") {
      return;
    }

    if ((this.phase === "round_joinable" || this.phase === "round_locked") && this.roundStartedAt !== null) {
      if (this.roundStartedAt + ROUND_DURATION_MS <= now) {
        this.finishRound("timeout", now);
        return;
      }

      if (this.phase === "round_joinable" && this.roundStartedAt + JOIN_GRACE_MS <= now) {
        this.phase = "round_locked";
        this.phaseChangedAt = now;
      }
    }

    if (this.phase === "extraction_countdown" && this.extractionStartedAt !== null) {
      if (this.extractionStartedAt + EXTRACTION_COUNTDOWN_MS <= now) {
        this.sealExit(now);
        return;
      }
    }

    if (this.phase === "lockdown_swarm" && this.phaseChangedAt + LOCKDOWN_SWARM_MS <= now) {
      this.finishRound("extraction", now);
      return;
    }

    if (this.phase === "results" && this.phaseChangedAt + RESULTS_HOLD_MS <= now) {
      this.phase = "resetting";
      this.phaseChangedAt = now;
      this.statusBanner = {
        text: "Resetting public room.",
        tone: "neutral"
      };
      return;
    }

    if (this.phase === "resetting" && this.phaseChangedAt + RESETTING_HOLD_MS <= now) {
      this.resetToWaiting(now);
      return;
    }

    if (deltaMs > 0 && (this.phase === "round_joinable" || this.phase === "round_locked" || this.phase === "extraction_countdown")) {
      this.tickStalkers(deltaMs, now);
    }
  }

  private startRound(now: number): void {
    this.phase = "round_joinable";
    this.phaseChangedAt = now;
    this.roundStartedAt = now;
    this.extractionStartedAt = null;
    this.results = null;
    this.statusBanner = null;
    this.collectedRelayIds.clear();
    this.activatedPanelIds.clear();
    this.pickups = this.seedPickups();
    this.stalkers = this.seedStalkers();
  }

  private resetToWaiting(now: number): void {
    this.phase = "waiting";
    this.phaseChangedAt = now;
    this.roundStartedAt = null;
    this.extractionStartedAt = null;
    this.statusBanner = null;
    this.results = null;
    this.pickups = [];
    this.stalkers = [];
    this.collectedRelayIds.clear();
    this.activatedPanelIds.clear();
    this.players.clear();
  }

  private finishRound(reason: PublicRoundResults["reason"], now: number): void {
    const players = [...this.players.values()]
      .sort((left, right) => left.joinedAt - right.joinedAt || left.id.localeCompare(right.id))
      .map<PublicRoundPlayerResult>((player) => ({
        id: player.id,
        name: player.name,
        outcome: player.insideExitSafe ? "winner" : "loser",
        insideExitSafe: player.insideExitSafe,
        wasDead: player.isDead
      }));

    this.results = {
      reason,
      players
    };
    this.phase = "results";
    this.phaseChangedAt = now;
    const reasonLabel = reason === "extraction" ? "Extraction resolved." : reason === "timeout" ? "Round failed. Time expired." : "Round failed. Team wiped.";
    this.statusBanner = {
      text: reasonLabel,
      tone: reason === "extraction" ? "success" : "alarm"
    };
  }

  private sealExit(now: number): void {
    for (const player of this.players.values()) {
      player.insideExitSafe = !player.isDead && this.isInsideExitChamber(player.x, player.y);
    }

    this.phase = "lockdown_swarm";
    this.phaseChangedAt = now;
    this.statusBanner = {
      text: "Exit Chamber sealed. Outside players are doomed.",
      tone: "alarm"
    };
    this.stalkers = this.stalkers.map((stalker) => ({
      ...stalker,
      mode: "swarm"
    }));
  }

  private seedPickups(): MatchPickupState[] {
    return PICKUP_SPAWN_POINTS.flatMap((spawnPoint) => {
      const type = rollPickupType(spawnPoint.profile, this.random);
      if (!type) {
        return [];
      }

      return [{
        id: spawnPoint.id,
        type,
        x: spawnPoint.x,
        y: spawnPoint.y,
        radius: PICKUP_DEFINITIONS[type].radius,
        collected: false
      }];
    });
  }

  private seedStalkers(): MatchStalkerState[] {
    const firstSpawn = PLAYER_SPAWN_POINTS[0]!;
    const spawn = chooseRandomStalkerSpawn(firstSpawn.x, firstSpawn.y, this.random);
    const roamArea = chooseRandomRoamArea(spawn.areaId, this.random);
    const roamPoint = pickAreaPoint(roamArea, this.random);
    return [{
      id: DEFAULT_STALKER_ID,
      x: spawn.x,
      y: spawn.y,
      facing: { x: 0, y: 1 },
      health: BLACK_STICKMAN_TUNING.maxHealth,
      maxHealth: BLACK_STICKMAN_TUNING.maxHealth,
      isDead: false,
      mode: "roam",
      areaId: spawn.areaId,
      roamAreaId: roamArea.id,
      roamTargetX: roamPoint.x,
      roamTargetY: roamPoint.y,
      lastSeenPlayerX: firstSpawn.x,
      lastSeenPlayerY: firstSpawn.y,
      lastSeenPlayerAreaId: "entry-lobby",
      chaseMemoryRemainingMs: 0,
      attackTimeRemainingMs: 0,
      attackCooldownTimeRemainingMs: 0,
      attackArmSide: 1,
      attackDidDamage: false,
      transitionFromAreaId: null,
      transitionToAreaId: null,
      transitionWaypointX: spawn.x,
      transitionWaypointY: spawn.y
    }];
  }

  private consumeTickDelta(now: number): number {
    const deltaMs = Math.max(0, now - this.lastTickAt);
    this.lastTickAt = now;
    return Math.min(deltaMs, 100);
  }

  private tickPlayers(deltaMs: number): void {
    for (const player of this.players.values()) {
      player.punchTimeRemainingMs = Math.max(0, player.punchTimeRemainingMs - deltaMs);
    }
  }

  private tickStalkers(deltaMs: number, now: number): void {
    for (const stalker of this.stalkers) {
      this.tickPrimaryStalker(stalker, deltaMs, now);
    }
  }

  private tickPrimaryStalker(stalker: MatchStalkerState, deltaMs: number, now: number): void {
    if (stalker.isDead || stalker.mode === "swarm") {
      return;
    }

    stalker.attackCooldownTimeRemainingMs = Math.max(0, stalker.attackCooldownTimeRemainingMs - deltaMs);
    const previousAttackTimeRemainingMs = stalker.attackTimeRemainingMs;
    stalker.attackTimeRemainingMs = Math.max(0, stalker.attackTimeRemainingMs - deltaMs);
    if (previousAttackTimeRemainingMs > 0 && stalker.attackTimeRemainingMs === 0) {
      stalker.attackDidDamage = true;
    }

    const stalkerArea = this.currentAreaAt(stalker.x, stalker.y);
    if (stalkerArea) {
      stalker.areaId = stalkerArea.id;
    }

    const targetPlayer = this.closestLivingPlayer(stalker.x, stalker.y);
    if (!targetPlayer) {
      return;
    }

    const playerDistance = Math.hypot(targetPlayer.x - stalker.x, targetPlayer.y - stalker.y);
    const playerArea = this.currentAreaAt(targetPlayer.x, targetPlayer.y);
    const playerVisible = this.canStalkerSeePlayer(stalker, targetPlayer, playerDistance);
    const nearbyAlert = this.canStalkerSenseNearbyPlayer(stalker, playerArea?.id ?? null, playerDistance);
    if (playerVisible || nearbyAlert) {
      stalker.lastSeenPlayerX = targetPlayer.x;
      stalker.lastSeenPlayerY = targetPlayer.y;
      stalker.lastSeenPlayerAreaId = playerArea?.id ?? null;
      stalker.chaseMemoryRemainingMs = BLACK_STICKMAN_TUNING.memoryDuration * 1000;
    } else {
      stalker.chaseMemoryRemainingMs = Math.max(0, stalker.chaseMemoryRemainingMs - deltaMs);
    }

    const nextMode: MatchStalkerMode =
      playerVisible ||
      nearbyAlert ||
      (stalker.mode === "chase" && playerDistance <= BLACK_STICKMAN_TUNING.pursuitDropRange && stalker.chaseMemoryRemainingMs > 0)
        ? "chase"
        : "roam";
    if (nextMode !== stalker.mode) {
      stalker.mode = nextMode;
      if (nextMode === "roam") {
        this.assignStalkerRoamTarget(stalker);
      }
    }

    if (previousAttackTimeRemainingMs > 0 && !stalker.attackDidDamage) {
      const hitDelayMs = BLACK_STICKMAN_TUNING.attack.hitDelay * 1000;
      if (previousAttackTimeRemainingMs > hitDelayMs && stalker.attackTimeRemainingMs <= hitDelayMs) {
        stalker.attackDidDamage = true;
        if (playerDistance <= BLACK_STICKMAN_TUNING.attack.range) {
          this.damagePlayerState(targetPlayer, BLACK_STICKMAN_TUNING.attack.damage, now);
        }
      }
    }

    if (stalker.attackTimeRemainingMs > 0) {
      if (playerDistance > 0.001) {
        stalker.facing = {
          x: (targetPlayer.x - stalker.x) / playerDistance,
          y: (targetPlayer.y - stalker.y) / playerDistance
        };
      }
      return;
    }

    if (
      stalker.mode === "chase" &&
      !targetPlayer.isDead &&
      stalker.attackCooldownTimeRemainingMs <= 0 &&
      playerDistance <= BLACK_STICKMAN_TUNING.attack.range
    ) {
      this.startStalkerAttack(stalker, targetPlayer, playerDistance);
      return;
    }

    const target = stalker.mode === "chase"
      ? this.resolveStalkerChaseTarget(stalker, targetPlayer, playerArea?.id ?? null, playerDistance)
      : this.resolveStalkerRoamTarget(stalker);
    const deltaX = target.x - stalker.x;
    const deltaY = target.y - stalker.y;
    const targetDistance = Math.hypot(deltaX, deltaY);
    if (targetDistance <= 8) {
      if (stalker.mode === "roam") {
        this.assignStalkerRoamTarget(stalker);
      }
      return;
    }

    const dirX = deltaX / targetDistance;
    const dirY = deltaY / targetDistance;
    stalker.facing = { x: dirX, y: dirY };
    const speed = stalker.mode === "chase" ? BLACK_STICKMAN_TUNING.movement.movementSpeed : BLACK_STICKMAN_TUNING.roamMovementSpeed;
    this.moveStalkerBody(stalker, dirX * speed * (deltaMs / 1000), dirY * speed * (deltaMs / 1000));
    const areaAfterMove = this.currentAreaAt(stalker.x, stalker.y);
    if (areaAfterMove) {
      stalker.areaId = areaAfterMove.id;
    }
  }

  private closestLivingPlayer(x: number, y: number): MatchPlayerState | null {
    let best: MatchPlayerState | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (const player of this.players.values()) {
      if (player.isDead) {
        continue;
      }
      const currentDistanceSq = distanceSquared(x, y, player.x, player.y);
      if (currentDistanceSq < bestDistanceSq) {
        best = player;
        bestDistanceSq = currentDistanceSq;
      }
    }

    return best;
  }

  private canStalkerSeePlayer(stalker: MatchStalkerState, player: MatchPlayerState, playerDistance: number): boolean {
    if (playerDistance <= 0.001 || playerDistance > BLACK_STICKMAN_TUNING.detectionRange) {
      return false;
    }

    const dirX = stalker.facing.x;
    const dirY = stalker.facing.y;
    const toPlayerX = (player.x - stalker.x) / playerDistance;
    const toPlayerY = (player.y - stalker.y) / playerDistance;
    return dirX * toPlayerX + dirY * toPlayerY >= BLACK_STICKMAN_TUNING.visionDotThreshold;
  }

  private canStalkerSenseNearbyPlayer(stalker: MatchStalkerState, targetAreaId: string | null, playerDistance: number): boolean {
    if (playerDistance > BLACK_STICKMAN_TUNING.nearbyAlertDistance) {
      return false;
    }

    if (!stalker.areaId || !targetAreaId) {
      return false;
    }

    if (stalker.areaId === targetAreaId) {
      return true;
    }

    return findAreaPath(stalker.areaId, targetAreaId).length === 2;
  }

  private startStalkerAttack(stalker: MatchStalkerState, player: MatchPlayerState, playerDistance: number): void {
    if (playerDistance <= 0.001) {
      return;
    }

    const currentFacingX = stalker.facing.x;
    const currentFacingY = stalker.facing.y;
    const sideDot = (player.x - stalker.x) * -currentFacingY + (player.y - stalker.y) * currentFacingX;
    stalker.facing = {
      x: (player.x - stalker.x) / playerDistance,
      y: (player.y - stalker.y) / playerDistance
    };
    stalker.attackArmSide = sideDot >= 0 ? 1 : -1;
    stalker.attackTimeRemainingMs = BLACK_STICKMAN_TUNING.attack.animationDuration * 1000;
    stalker.attackCooldownTimeRemainingMs = BLACK_STICKMAN_TUNING.attack.cooldown * 1000;
    stalker.attackDidDamage = false;
  }

  private resolveStalkerChaseTarget(
    stalker: MatchStalkerState,
    player: MatchPlayerState,
    playerAreaId: string | null,
    playerDistance: number
  ): Point {
    const trackingCurrentPlayer = stalker.chaseMemoryRemainingMs > 0;
    const targetX = trackingCurrentPlayer ? player.x : stalker.lastSeenPlayerX;
    const targetY = trackingCurrentPlayer ? player.y : stalker.lastSeenPlayerY;
    const targetAreaId = trackingCurrentPlayer ? playerAreaId : stalker.lastSeenPlayerAreaId;
    const activeTransition = this.currentStalkerTransitionTarget(stalker);
    if (activeTransition) {
      return activeTransition;
    }

    if (trackingCurrentPlayer && stalker.areaId && targetAreaId && stalker.areaId === targetAreaId && playerDistance > 0.001) {
      const toPlayerX = (targetX - stalker.x) / playerDistance;
      const toPlayerY = (targetY - stalker.y) / playerDistance;
      if (stalker.attackCooldownTimeRemainingMs <= 0) {
        return { x: targetX, y: targetY };
      }

      const desiredDistance = Math.max(18, BLACK_STICKMAN_TUNING.attack.range * 0.4);
      const tolerance = 6;
      const minDistance = desiredDistance - tolerance;
      const maxDistance = desiredDistance + tolerance;

      if (playerDistance > maxDistance) {
        return { x: targetX, y: targetY };
      }

      if (playerDistance >= minDistance) {
        return { x: stalker.x, y: stalker.y };
      }

      const retreatX = targetX - toPlayerX * desiredDistance;
      const retreatY = targetY - toPlayerY * desiredDistance;
      if (this.canOccupy(retreatX, retreatY, BLACK_STICKMAN_TUNING.combatHitboxWidth * 0.5)) {
        return { x: retreatX, y: retreatY };
      }

      return { x: stalker.x, y: stalker.y };
    }

    return this.resolveStalkerPathTarget(stalker, targetAreaId, targetX, targetY);
  }

  private resolveStalkerRoamTarget(stalker: MatchStalkerState): Point {
    const activeTransition = this.currentStalkerTransitionTarget(stalker);
    if (activeTransition) {
      return activeTransition;
    }

    if (!stalker.roamAreaId) {
      this.assignStalkerRoamTarget(stalker);
    }

    if (
      stalker.roamAreaId &&
      stalker.areaId === stalker.roamAreaId &&
      Math.hypot(stalker.x - stalker.roamTargetX, stalker.y - stalker.roamTargetY) <= 24
    ) {
      this.assignStalkerRoamTarget(stalker);
    }

    return this.resolveStalkerPathTarget(stalker, stalker.roamAreaId, stalker.roamTargetX, stalker.roamTargetY);
  }

  private assignStalkerRoamTarget(stalker: MatchStalkerState): void {
    const roamArea = chooseRandomRoamArea(stalker.areaId, this.random);
    const roamPoint = pickAreaPoint(roamArea, this.random);
    stalker.roamAreaId = roamArea.id;
    stalker.roamTargetX = roamPoint.x;
    stalker.roamTargetY = roamPoint.y;
  }

  private resolveStalkerPathTarget(stalker: MatchStalkerState, targetAreaId: string | null, fallbackX: number, fallbackY: number): Point {
    if (!stalker.areaId || !targetAreaId || stalker.areaId === targetAreaId) {
      this.clearStalkerTransition(stalker);
      return { x: fallbackX, y: fallbackY };
    }

    const path = findAreaPath(stalker.areaId, targetAreaId);
    if (path.length >= 2) {
      const waypoint = this.setStalkerTransitionTarget(
        stalker,
        path[0] ?? stalker.areaId,
        path[1] ?? targetAreaId
      );
      if (waypoint) {
        return waypoint;
      }
    }

    this.clearStalkerTransition(stalker);
    return { x: fallbackX, y: fallbackY };
  }

  private currentStalkerTransitionTarget(stalker: MatchStalkerState): Point | null {
    if (!stalker.transitionFromAreaId || !stalker.transitionToAreaId) {
      return null;
    }

    const waypoint = traversalWaypointBetweenAreas(
      stalker.transitionFromAreaId,
      stalker.transitionToAreaId,
      { x: stalker.x, y: stalker.y },
      STALKER_TRANSITION_COMMIT_DISTANCE
    ) ?? waypointBetweenAreas(stalker.transitionFromAreaId, stalker.transitionToAreaId);
    if (!waypoint) {
      this.clearStalkerTransition(stalker);
      return null;
    }

    stalker.transitionWaypointX = waypoint.x;
    stalker.transitionWaypointY = waypoint.y;
    const waypointDistance = Math.hypot(stalker.x - waypoint.x, stalker.y - waypoint.y);
    if (stalker.areaId === stalker.transitionToAreaId) {
      if (waypointDistance > STALKER_TRANSITION_REACHED_DISTANCE) {
        return waypoint;
      }

      this.clearStalkerTransition(stalker);
      return null;
    }

    if (stalker.areaId === stalker.transitionFromAreaId && waypointDistance <= STALKER_TRANSITION_REACHED_DISTANCE) {
      this.clearStalkerTransition(stalker);
      return null;
    }

    if (stalker.areaId === null || stalker.areaId === stalker.transitionFromAreaId) {
      return waypoint;
    }

    this.clearStalkerTransition(stalker);
    return null;
  }

  private setStalkerTransitionTarget(stalker: MatchStalkerState, fromAreaId: string, toAreaId: string): Point | null {
    stalker.transitionFromAreaId = fromAreaId;
    stalker.transitionToAreaId = toAreaId;
    return this.currentStalkerTransitionTarget(stalker);
  }

  private clearStalkerTransition(stalker: MatchStalkerState): void {
    stalker.transitionFromAreaId = null;
    stalker.transitionToAreaId = null;
    stalker.transitionWaypointX = stalker.x;
    stalker.transitionWaypointY = stalker.y;
  }

  private moveStalkerBody(stalker: MatchStalkerState, dx: number, dy: number): void {
    this.moveStalkerAxis(stalker, dx, 0);
    this.moveStalkerAxis(stalker, 0, dy);
  }

  private moveStalkerAxis(stalker: MatchStalkerState, dx: number, dy: number): void {
    const distanceToCover = Math.abs(dx) + Math.abs(dy);
    const steps = Math.max(1, Math.ceil(distanceToCover / 4));
    for (let i = 0; i < steps; i += 1) {
      const nextX = stalker.x + dx / steps;
      const nextY = stalker.y + dy / steps;
      if (!this.canOccupy(nextX, nextY, BLACK_STICKMAN_TUNING.combatHitboxWidth * 0.5)) {
        break;
      }
      stalker.x = nextX;
      stalker.y = nextY;
    }
  }

  private canOccupy(x: number, y: number, radius = 0): boolean {
    const insideArea = AREAS.some((area) => rectContainsPoint(area, x, y));
    if (!insideArea) {
      return false;
    }

    if (!this.exitUnlocked() && rectContainsPoint(LOCKED_EXIT_GATE, x, y, radius)) {
      return false;
    }

    return true;
  }

  private currentAreaAt(x: number, y: number, padding = 0): typeof AREAS[number] | null {
    const matches = AREAS.filter((area) => rectContainsPoint(area, x, y, padding));
    if (matches.length === 0) {
      return null;
    }

    matches.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "room" ? -1 : 1;
      }

      return left.width * left.height - right.width * right.height;
    });

    return matches[0] ?? null;
  }

  private chooseSpawnPoint(): PlayerSpawnPointDef {
    const activePlayers = [...this.players.values()].filter((player) => !player.isDead);
    let bestPoint = PLAYER_SPAWN_POINTS[0]!;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < PLAYER_SPAWN_POINTS.length; index += 1) {
      const point = PLAYER_SPAWN_POINTS[index]!;
      const nearbyCount = activePlayers.filter((player) => distanceSquared(player.x, player.y, point.x, point.y) < 72 * 72).length;
      const minDistanceSq = activePlayers.reduce((minDistance, player) => {
        return Math.min(minDistance, distanceSquared(player.x, player.y, point.x, point.y));
      }, Number.POSITIVE_INFINITY);
      const score = (Number.isFinite(minDistanceSq) ? minDistanceSq : 1_000_000_000) - nearbyCount * 1_000_000 - index;
      if (score > bestScore) {
        bestScore = score;
        bestPoint = point;
      }
    }

    return bestPoint;
  }

  private isJoinable(now: number): boolean {
    if (this.players.size >= PUBLIC_ROOM_CAPACITY) {
      return false;
    }

    if (this.phase === "waiting") {
      return true;
    }

    if (this.phase !== "round_joinable") {
      return false;
    }

    if (this.roundStartedAt === null) {
      return false;
    }

    if (this.roundStartedAt + JOIN_GRACE_MS <= now) {
      return false;
    }

    return this.extractionStartedAt === null;
  }

  private joinWaitReason(now: number): string | null {
    if (this.players.size >= PUBLIC_ROOM_CAPACITY) {
      return "Room is full.";
    }

    if (this.isJoinable(now)) {
      return null;
    }

    return `${formatPublicRoomStatus(this.phase)} in progress. Wait for the next round.`;
  }

  private isRoundActive(): boolean {
    return this.phase !== "waiting" && this.phase !== "results" && this.phase !== "resetting";
  }

  private hasActiveLivingPlayers(): boolean {
    return [...this.players.values()].some((player) => !player.isDead);
  }

  private exitUnlocked(): boolean {
    return this.collectedRelayIds.size === RELAYS.length && this.activatedPanelIds.size === PANELS.length;
  }

  private isInsideExitChamber(x: number, y: number): boolean {
    return EXIT_CHAMBER ? containsPoint(EXIT_CHAMBER, x, y) : false;
  }

  private isWithinInteractionRange(x1: number, y1: number, x2: number, y2: number, range: number): boolean {
    return distanceSquared(x1, y1, x2, y2) <= range * range;
  }

  private isSpawnProtected(player: MatchPlayerState, now: number): boolean {
    return player.spawnProtectionEndsAt !== null && player.spawnProtectionEndsAt > now;
  }

  private isDamageProtected(player: MatchPlayerState, now: number): boolean {
    return this.isSpawnProtected(player, now) || (this.phase === "lockdown_swarm" && player.insideExitSafe);
  }

  private resolveValidatedPlayerPosition(
    player: MatchPlayerState,
    targetX: number,
    targetY: number,
    now: number
  ): { x: number; y: number } {
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const distance = Math.hypot(dx, dy);
    const maxDistance = this.allowedPlayerTravelDistance(player, now);
    const scale = distance <= maxDistance || distance <= 0.001 ? 1 : maxDistance / distance;
    const body = {
      x: player.x,
      y: player.y,
      radius: PLAYER_RADIUS
    };

    this.moveBody(body, dx * scale, dy * scale);
    return {
      x: body.x,
      y: body.y
    };
  }

  private allowedPlayerTravelDistance(player: MatchPlayerState, now: number): number {
    const deltaMs = Math.min(MAX_MOVEMENT_DELTA_MS, Math.max(16, now - player.lastPositionSyncAt));
    const baseSpeed = this.exitUnlocked() ? PLAYER_TUNING.exitMovementSpeed : PLAYER_TUNING.movement.movementSpeed;
    const movementSpeed =
      player.speedBoostEndsAt !== null && player.speedBoostEndsAt > now
        ? baseSpeed * ENERGY_DRINK_SPEED_MULTIPLIER
        : baseSpeed;
    return movementSpeed * (deltaMs / 1000) + MOVEMENT_GRACE_DISTANCE;
  }

  private moveBody(body: { x: number; y: number; radius: number }, dx: number, dy: number): void {
    this.moveBodyAxis(body, dx, 0);
    this.moveBodyAxis(body, 0, dy);
  }

  private moveBodyAxis(body: { x: number; y: number; radius: number }, dx: number, dy: number): void {
    const distanceToCover = Math.abs(dx) + Math.abs(dy);
    const steps = Math.max(1, Math.ceil(distanceToCover / 4));
    for (let i = 0; i < steps; i += 1) {
      const nextX = body.x + dx / steps;
      const nextY = body.y + dy / steps;
      if (!this.canOccupy(nextX, nextY, body.radius)) {
        break;
      }
      body.x = nextX;
      body.y = nextY;
    }
  }

  private damagePlayerState(player: MatchPlayerState, amount: number, now: number): void {
    player.health = clamp(player.health - amount, 0, player.maxHealth);
    if (player.health > 0) {
      return;
    }

    player.isDead = true;
    player.flashlightOn = false;
    player.spawnProtectionEndsAt = null;
    player.speedBoostEndsAt = null;
    player.punchCooldownEndsAt = null;
    player.punchTimeRemainingMs = 0;
    if (!this.hasActiveLivingPlayers() && this.isRoundActive()) {
      this.finishRound("wipe", now);
    }
  }

  private damageStalkerState(stalker: MatchStalkerState, amount: number): void {
    stalker.health = clamp(stalker.health - amount, 0, stalker.maxHealth);
    if (stalker.health > 0) {
      return;
    }

    stalker.isDead = true;
    stalker.mode = "roam";
    stalker.attackTimeRemainingMs = 0;
    stalker.attackCooldownTimeRemainingMs = 0;
    stalker.attackDidDamage = true;
    this.clearStalkerTransition(stalker);
  }

  private stalkerCombatHitbox(stalker: MatchStalkerState): Rect {
    return {
      x: stalker.x - BLACK_STICKMAN_TUNING.combatHitboxWidth * 0.5,
      y: stalker.y - BLACK_STICKMAN_TUNING.combatHitboxHeight,
      width: BLACK_STICKMAN_TUNING.combatHitboxWidth,
      height: BLACK_STICKMAN_TUNING.combatHitboxHeight
    };
  }

  private toPlayerSnapshot(player: MatchPlayerState, now: number): MatchPlayerSnapshot {
    return {
      id: player.id,
      name: player.name,
      joinedAt: player.joinedAt,
      x: player.x,
      y: player.y,
      facing: player.facing,
      flashlightOn: player.flashlightOn,
      health: player.health,
      maxHealth: player.maxHealth,
      isDead: player.isDead,
      insideExitSafe: player.insideExitSafe,
      spawnProtectionTimeRemainingMs:
        player.spawnProtectionEndsAt === null ? null : Math.max(0, player.spawnProtectionEndsAt - now),
      speedBoostTimeRemainingMs:
        player.speedBoostEndsAt === null ? null : Math.max(0, player.speedBoostEndsAt - now),
      punchTimeRemainingMs: player.punchTimeRemainingMs > 0 ? player.punchTimeRemainingMs : null,
      punchFacing: player.punchTimeRemainingMs > 0 ? player.punchFacing : null,
      punchArmSide: player.punchTimeRemainingMs > 0 ? player.punchArmSide : null
    };
  }

  private toStalkerSnapshot(stalker: MatchStalkerState): MatchStalkerSnapshot {
    return {
      id: stalker.id,
      x: stalker.x,
      y: stalker.y,
      facing: {
        ...stalker.facing
      },
      health: stalker.health,
      maxHealth: stalker.maxHealth,
      isDead: stalker.isDead,
      mode: stalker.mode,
      areaId: stalker.areaId,
      attackTimeRemainingMs: stalker.attackTimeRemainingMs > 0 ? stalker.attackTimeRemainingMs : null,
      attackCooldownTimeRemainingMs: stalker.attackCooldownTimeRemainingMs > 0 ? stalker.attackCooldownTimeRemainingMs : null,
      attackArmSide: stalker.attackTimeRemainingMs > 0 ? stalker.attackArmSide : null
    };
  }

  private deadlines(): {
    joinDeadlineAt: number | null;
    roundDeadlineAt: number | null;
    extractionDeadlineAt: number | null;
    phaseEndsAt: number | null;
  } {
    const joinDeadlineAt = this.roundStartedAt === null ? null : this.roundStartedAt + JOIN_GRACE_MS;
    const roundDeadlineAt = this.roundStartedAt === null ? null : this.roundStartedAt + ROUND_DURATION_MS;
    const extractionDeadlineAt = this.extractionStartedAt === null ? null : this.extractionStartedAt + EXTRACTION_COUNTDOWN_MS;
    let phaseEndsAt: number | null = null;
    switch (this.phase) {
      case "round_joinable":
        phaseEndsAt = joinDeadlineAt;
        break;
      case "round_locked":
        phaseEndsAt = roundDeadlineAt;
        break;
      case "extraction_countdown":
        phaseEndsAt = extractionDeadlineAt;
        break;
      case "lockdown_swarm":
        phaseEndsAt = this.phaseChangedAt + LOCKDOWN_SWARM_MS;
        break;
      case "results":
        phaseEndsAt = this.phaseChangedAt + RESULTS_HOLD_MS;
        break;
      case "resetting":
        phaseEndsAt = this.phaseChangedAt + RESETTING_HOLD_MS;
        break;
      case "waiting":
        phaseEndsAt = null;
        break;
    }

    return {
      joinDeadlineAt,
      roundDeadlineAt,
      extractionDeadlineAt,
      phaseEndsAt
    };
  }
}
