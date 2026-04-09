import { describe, expect, it } from "vitest";
import {
  EXTRACTION_COUNTDOWN_MS,
  JOIN_GRACE_MS,
  LOCKDOWN_SWARM_MS,
  RESULTS_HOLD_MS,
  ROUND_DURATION_MS
} from "./publicRoomTypes";
import { AuthoritativePublicMatch } from "./AuthoritativePublicMatch";
import { EXIT_TERMINAL, LOCKED_EXIT_GATE, PANELS, PLAYER_SPAWN_POINTS, RELAYS } from "../world";

describe("AuthoritativePublicMatch", () => {
  it("accepts unique joins, starts a round, and assigns authored spawn points", () => {
    const match = new AuthoritativePublicMatch({
      now: 1_000,
      random: () => 0.25
    });

    const first = match.joinPlayer({ id: "p1", name: "Carla" }, 1_000);
    expect(first.ok).toBe(true);
    expect(first.value?.spawnProtectionTimeRemainingMs).toBe(2000);

    const second = match.joinPlayer({ id: "p2", name: "Milo" }, 1_005);
    expect(second.ok).toBe(true);
    expect(second.value?.x === first.value?.x && second.value?.y === first.value?.y).toBe(false);

    const duplicate = match.joinPlayer({ id: "p3", name: "  carla  " }, 1_010);
    expect(duplicate.ok).toBe(false);
    expect(duplicate.reason).toContain("already in the room");

    match.joinPlayer({ id: "p3", name: "Rhea" }, 1_015);
    match.joinPlayer({ id: "p4", name: "Ivo" }, 1_020);
    match.joinPlayer({ id: "p5", name: "Juno" }, 1_025);
    match.joinPlayer({ id: "p6", name: "Beck" }, 1_030);

    const full = match.joinPlayer({ id: "p7", name: "Nash" }, 1_035);
    expect(full.ok).toBe(false);
    expect(full.reason).toBe("Room is full.");

    const snapshot = match.getSnapshot(1_040);
    expect(snapshot.phase).toBe("round_joinable");
    expect(snapshot.players).toHaveLength(6);
    expect(snapshot.missionProgress.relayTotal).toBe(RELAYS.length);
    expect(snapshot.missionProgress.panelTotal).toBe(PANELS.length);
    expect(snapshot.objectives.restoredRelayIds).toEqual([]);
    expect(snapshot.objectives.activatedPanelIds).toEqual([]);
  });

  it("tracks collected pickups and objective ids in authoritative snapshots", () => {
    const match = new AuthoritativePublicMatch({
      now: 2_000,
      random: () => 0.61
    });

    expect(match.joinPlayer({ id: "p1", name: "Carla" }, 2_000).ok).toBe(true);

    const pickup = match.getSnapshot(2_010).pickups.find((candidate) => candidate.type === "energy_drink");
    expect(pickup).toBeTruthy();
    expect(match.collectPickup("p1", pickup!.id, 2_015).ok).toBe(false);

    match.setPlayerPosition("p1", pickup!.x, pickup!.y, 2_018);
    const pickupResult = match.collectPickup("p1", pickup!.id, 2_020);
    expect(pickupResult.ok).toBe(true);
    expect(match.getSnapshot(2_021).pickups.find((candidate) => candidate.id === pickup!.id)?.collected).toBe(true);

    match.setPlayerPosition("p1", RELAYS[0]!.x, RELAYS[0]!.y, 2_028);
    expect(match.collectRelay("p1", RELAYS[0]!.id, 2_030).ok).toBe(true);
    const snapshot = match.getSnapshot(2_031);
    expect(snapshot.objectives.restoredRelayIds).toEqual([RELAYS[0]!.id]);
    expect(snapshot.objectives.activatedPanelIds).toEqual([]);
    expect(snapshot.players[0]?.speedBoostTimeRemainingMs).toBeGreaterThan(0);
  });

  it("keeps player health authoritative and validates punch hits in the match core", () => {
    const match = new AuthoritativePublicMatch({
      now: 2_500,
      random: () => 0.2
    });

    expect(match.joinPlayer({ id: "p1", name: "Carla" }, 2_500).ok).toBe(true);
    expect(match.joinPlayer({ id: "p2", name: "Milo" }, 2_505).ok).toBe(true);

    match.setPlayerPosition("p1", 640, 480, 2_520);
    match.setPlayerPosition("p2", 662, 480, 2_520);
    expect(match.applyPlayerDamage("p1", 30, 2_530).ok).toBe(true);

    const synced = match.syncPlayerState("p1", {
      x: 640,
      y: 480,
      move: { x: 0, y: 0 },
      facing: { x: 1, y: 0 },
      flashlightOn: true,
      wantsInteract: false,
      wantsPunch: false
    }, 2_540);
    expect(synced.value?.health).toBe(70);

    const punch = match.submitPunch("p1", { x: 1, y: 0 }, 2_550);
    expect(punch.ok).toBe(true);
    expect(punch.value?.hits).toContainEqual({
      targetKind: "player",
      targetId: "p2",
      damage: 10,
      defeated: false
    });
    expect(match.getSnapshot(2_551).players.find((player) => player.id === "p2")?.health).toBe(90);
  });

  it("clamps synced player movement against locked gates and walkable areas", () => {
    const match = new AuthoritativePublicMatch({
      now: 2_700,
      random: () => 0.2
    });

    expect(match.joinPlayer({ id: "p1", name: "Carla" }, 2_700).ok).toBe(true);

    const startX = LOCKED_EXIT_GATE.x - 20;
    const startY = LOCKED_EXIT_GATE.y + LOCKED_EXIT_GATE.height * 0.5;
    match.setPlayerPosition("p1", startX, startY, 2_710);

    const synced = match.syncPlayerState("p1", {
      x: LOCKED_EXIT_GATE.x + LOCKED_EXIT_GATE.width + 40,
      y: startY,
      move: { x: 1, y: 0 },
      facing: { x: 1, y: 0 },
      flashlightOn: true,
      wantsInteract: false,
      wantsPunch: false
    }, 2_760);

    expect(synced.value).not.toBeNull();
    expect(synced.value!.x).toBeLessThan(LOCKED_EXIT_GATE.x);
    expect(synced.value!.y).toBe(startY);
  });

  it("tracks primary stalker state and damage in authoritative snapshots", () => {
    const match = new AuthoritativePublicMatch({
      now: 3_000,
      random: () => 0.2
    });

    expect(match.joinPlayer({ id: "p1", name: "Carla" }, 3_000).ok).toBe(true);
    const stalker = match.getSnapshot(3_010).stalkers[0];
    expect(stalker).toBeTruthy();

    const syncResult = match.syncStalkerState(stalker!.id, {
      x: stalker!.x + 32,
      y: stalker!.y + 18,
      facing: { x: 0, y: 1 },
      health: stalker!.health,
      maxHealth: stalker!.maxHealth,
      isDead: false,
      mode: "chase",
      areaId: stalker!.areaId
    }, 3_020);
    expect(syncResult.ok).toBe(true);

    const moved = match.getSnapshot(3_021).stalkers[0];
    expect(moved?.x).toBeGreaterThan(stalker!.x);
    expect(moved?.isDead).toBe(false);

    const damageResult = match.applyStalkerDamage(stalker!.id, stalker!.maxHealth, 3_030);
    expect(damageResult.ok).toBe(true);
    expect(match.getSnapshot(3_031).stalkers[0]?.isDead).toBe(true);
  });

  it("replicates flashlight toggles and remote punch animation state in player snapshots", () => {
    const match = new AuthoritativePublicMatch({
      now: 3_400,
      random: () => 0.2
    });

    expect(match.joinPlayer({ id: "p1", name: "Carla" }, 3_400).ok).toBe(true);

    match.applyInputUpdate("p1", {
      move: { x: 0, y: 0 },
      facing: { x: 0, y: 1 },
      flashlightOn: false,
      wantsInteract: false,
      wantsPunch: false
    }, 3_410);
    expect(match.getSnapshot(3_411).players[0]?.flashlightOn).toBe(false);

    const punch = match.submitPunch("p1", { x: 0, y: 1 }, 3_420);
    expect(punch.ok).toBe(true);

    const punching = match.getSnapshot(3_421).players[0];
    expect(punching?.punchTimeRemainingMs).toBeGreaterThan(0);
    expect(punching?.punchFacing).toEqual({ x: 0, y: 1 });
    expect(punching?.punchArmSide).toBe(1);

    match.tick(3_520);
    match.tick(3_620);
    const cooled = match.getSnapshot(3_801).players[0];
    expect(cooled?.punchTimeRemainingMs).toBeNull();
    expect(cooled?.punchFacing).toBeNull();
    expect(cooled?.punchArmSide).toBeNull();
  });

  it("keeps late joins open until the final 90 seconds of the round", () => {
    const match = new AuthoritativePublicMatch({
      now: 3_900,
      random: () => 0.2
    });

    expect(match.joinPlayer({ id: "p1", name: "Carla" }, 3_900).ok).toBe(true);
    expect(match.joinPlayer({ id: "p2", name: "Milo" }, 3_900 + JOIN_GRACE_MS - 1).ok).toBe(true);

    match.tick(3_900 + JOIN_GRACE_MS + 1);

    const lockedJoin = match.joinPlayer({ id: "p3", name: "Rhea" }, 3_900 + JOIN_GRACE_MS + 2);
    expect(lockedJoin.ok).toBe(false);
    expect(lockedJoin.reason).toBe("Locked in progress. Wait for the next round.");
  });

  it("moves the stalker through connected room boundaries while chasing a player", () => {
    const match = new AuthoritativePublicMatch({
      now: 4_000,
      random: () => 0.2
    });

    expect(match.joinPlayer({ id: "p1", name: "Carla" }, 4_000).ok).toBe(true);
    const stalker = match.getSnapshot(4_010).stalkers[0];
    expect(stalker).toBeTruthy();

    const syncResult = match.syncStalkerState(stalker!.id, {
      x: 188,
      y: 188,
      facing: { x: 1, y: 0 },
      health: stalker!.health,
      maxHealth: stalker!.maxHealth,
      isDead: false,
      mode: "chase",
      areaId: "entry-lobby"
    }, 4_020);
    expect(syncResult.ok).toBe(true);

    match.setPlayerPosition("p1", 500, 292, 4_020);
    for (let step = 1; step <= 24; step += 1) {
      match.tick(4_020 + step * 100);
    }

    const moved = match.getSnapshot(6_500).stalkers[0];
    expect(moved).toBeTruthy();
    expect(moved!.x).toBeGreaterThan(432);
    expect(moved!.areaId === "entry-lobby" || moved!.areaId === "intake-hall").toBe(true);
  });

  it("commits through a doorway instead of hovering on the seam during attack cooldown", () => {
    const match = new AuthoritativePublicMatch({
      now: 4_700,
      random: () => 0.2
    });

    expect(match.joinPlayer({ id: "p1", name: "Carla" }, 4_700).ok).toBe(true);
    const stalker = match.getSnapshot(4_710).stalkers[0];
    expect(stalker).toBeTruthy();

    expect(match.syncStalkerState(stalker!.id, {
      x: 500,
      y: 292,
      facing: { x: -1, y: 0 },
      health: stalker!.health,
      maxHealth: stalker!.maxHealth,
      isDead: false,
      mode: "chase",
      areaId: "intake-hall"
    }, 4_720).ok).toBe(true);

    match.setPlayerPosition("p1", 460, 292, 4_730);
    match.tick(4_820);

    const attacking = match.getSnapshot(4_821).stalkers[0];
    expect(attacking?.attackCooldownTimeRemainingMs).toBeGreaterThan(0);

    match.setPlayerPosition("p1", 412, 292, 4_830);
    for (let step = 1; step <= 8; step += 1) {
      match.tick(4_830 + step * 100);
    }

    const committed = match.getSnapshot(5_700).stalkers[0];
    expect(committed).toBeTruthy();
    expect(committed!.areaId).toBe("entry-lobby");
    expect(committed!.x).toBeLessThanOrEqual(418);
  });

  it("still resolves the correct chase area when the player hugs the doorway seam", () => {
    const match = new AuthoritativePublicMatch({
      now: 5_800,
      random: () => 0.2
    });

    expect(match.joinPlayer({ id: "p1", name: "Carla" }, 5_800).ok).toBe(true);
    const stalker = match.getSnapshot(5_810).stalkers[0];
    expect(stalker).toBeTruthy();

    expect(match.syncStalkerState(stalker!.id, {
      x: 500,
      y: 292,
      facing: { x: -1, y: 0 },
      health: stalker!.health,
      maxHealth: stalker!.maxHealth,
      isDead: false,
      mode: "chase",
      areaId: "intake-hall"
    }, 5_820).ok).toBe(true);

    match.setPlayerPosition("p1", 424, 292, 5_830);
    for (let step = 1; step <= 10; step += 1) {
      match.tick(5_830 + step * 100);
    }

    const crossed = match.getSnapshot(6_900).stalkers[0];
    expect(crossed).toBeTruthy();
    expect(crossed!.x).toBeLessThan(432);
    expect(crossed!.areaId).toBe("entry-lobby");
  });

  it("locks the room on mission completion and resolves extraction results from exit-chamber positions", () => {
    const match = new AuthoritativePublicMatch({
      now: 5_000,
      random: () => 0.3
    });

    expect(match.joinPlayer({ id: "p1", name: "Carla" }, 5_000).ok).toBe(true);
    expect(match.joinPlayer({ id: "p2", name: "Milo" }, 5_010).ok).toBe(true);

    for (const relay of RELAYS) {
      match.setPlayerPosition("p1", relay.x, relay.y, 5_090 + RELAYS.indexOf(relay));
      const result = match.collectRelay("p1", relay.id, 5_100);
      expect(result.ok).toBe(true);
    }

    for (const panel of [...PANELS].sort((left, right) => left.sequence - right.sequence)) {
      match.setPlayerPosition("p2", panel.x, panel.y, 5_180 + panel.sequence);
      const result = match.activatePanel("p2", panel.id, 5_200 + panel.sequence);
      expect(result.ok).toBe(true);
    }

    const missionSnapshot = match.getSnapshot(5_250);
    expect(missionSnapshot.phase).toBe("round_joinable");
    expect(missionSnapshot.missionProgress.exitUnlocked).toBe(true);

    match.setPlayerPosition("p1", EXIT_TERMINAL.x, EXIT_TERMINAL.y, 5_260);
    const outsideSpawn = PLAYER_SPAWN_POINTS[0]!;
    match.setPlayerPosition("p2", outsideSpawn.x, outsideSpawn.y, 5_260);

    const extraction = match.startExtraction("p1", 5_300);
    expect(extraction.ok).toBe(true);
    expect(match.getSnapshot(5_300).phase).toBe("extraction_countdown");

    match.tick(5_300 + EXTRACTION_COUNTDOWN_MS + 1);
    const sealed = match.getSnapshot(5_300 + EXTRACTION_COUNTDOWN_MS + 1);
    expect(sealed.phase).toBe("lockdown_swarm");
    expect(sealed.players.find((player) => player.id === "p1")?.insideExitSafe).toBe(true);
    expect(sealed.players.find((player) => player.id === "p2")?.insideExitSafe).toBe(false);

    match.tick(5_300 + EXTRACTION_COUNTDOWN_MS + LOCKDOWN_SWARM_MS + 2);
    const results = match.getSnapshot(5_300 + EXTRACTION_COUNTDOWN_MS + LOCKDOWN_SWARM_MS + 2);
    expect(results.phase).toBe("results");
    expect(results.results?.reason).toBe("extraction");
    expect(results.results?.players.find((player) => player.id === "p1")?.outcome).toBe("winner");
    expect(results.results?.players.find((player) => player.id === "p2")?.outcome).toBe("loser");
  });

  it("fails the round when the master timer expires and then resets back to waiting", () => {
    const match = new AuthoritativePublicMatch({
      now: 10_000,
      random: () => 0.1
    });

    expect(match.joinPlayer({ id: "p1", name: "Solo" }, 10_000).ok).toBe(true);

    const timeoutAt = 10_000 + ROUND_DURATION_MS + 1;
    match.tick(timeoutAt);
    const timedOut = match.getSnapshot(timeoutAt);
    expect(timedOut.phase).toBe("results");
    expect(timedOut.results?.reason).toBe("timeout");
    expect(timedOut.results?.players[0]?.outcome).toBe("loser");

    match.tick(timeoutAt + RESULTS_HOLD_MS + 1);
    expect(match.getSnapshot(timeoutAt + RESULTS_HOLD_MS + 1).phase).toBe("resetting");

    match.tick(timeoutAt + RESULTS_HOLD_MS + 300);
    const reset = match.getSnapshot(timeoutAt + RESULTS_HOLD_MS + 300);
    expect(reset.phase).toBe("waiting");
    expect(reset.players).toHaveLength(0);
  });

  it("fails the round immediately when all active players die before extraction", () => {
    const match = new AuthoritativePublicMatch({
      now: 20_000,
      random: () => 0.45
    });

    expect(match.joinPlayer({ id: "p1", name: "Ari" }, 20_000).ok).toBe(true);
    expect(match.joinPlayer({ id: "p2", name: "Vale" }, 20_010).ok).toBe(true);

    const firstSpawn = PLAYER_SPAWN_POINTS[0]!;
    const secondSpawn = PLAYER_SPAWN_POINTS[1]!;
    match.setPlayerPosition("p1", firstSpawn.x + 4, firstSpawn.y + 4, 20_100);
    match.setPlayerPosition("p2", secondSpawn.x + 4, secondSpawn.y + 4, 20_100);

    expect(match.applyPlayerDamage("p1", 100, 20_200).ok).toBe(true);
    expect(match.applyPlayerDamage("p2", 100, 20_200).ok).toBe(true);

    const wiped = match.getSnapshot(20_201);
    expect(wiped.phase).toBe("results");
    expect(wiped.results?.reason).toBe("wipe");
    expect(wiped.results?.players.every((player) => player.outcome === "loser")).toBe(true);
  });
});
