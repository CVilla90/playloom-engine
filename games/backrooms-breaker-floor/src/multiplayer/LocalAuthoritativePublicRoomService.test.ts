import { describe, expect, it } from "vitest";
import { RELAYS } from "../world";
import { LocalAuthoritativePublicRoomService } from "./LocalAuthoritativePublicRoomService";
import { ROUND_DURATION_MS } from "./publicRoomTypes";

describe("LocalAuthoritativePublicRoomService", () => {
  it("joins the local player and keeps the authoritative player snapshot in sync", () => {
    const room = new LocalAuthoritativePublicRoomService({
      now: 1_000,
      random: () => 0.2
    });

    expect(room.join("Carla")).toEqual({
      ok: true,
      reason: null
    });

    const joinedPlayer = room.getLocalPlayerMatchSnapshot();
    expect(joinedPlayer).not.toBeNull();

    const syncedPlayer = room.syncLocalPlayerState({
      x: (joinedPlayer?.x ?? 0) + 24,
      y: (joinedPlayer?.y ?? 0) + 18,
      move: { x: 1, y: 0 },
      facing: { x: 0, y: 1 },
      flashlightOn: false,
      wantsInteract: false,
      wantsPunch: false
    }, 1_050);

    expect(syncedPlayer?.x).toBeGreaterThan(joinedPlayer?.x ?? 0);
    expect(syncedPlayer?.x).toBeLessThan((joinedPlayer?.x ?? 0) + 24);
    expect(syncedPlayer?.y).toBeGreaterThan(joinedPlayer?.y ?? 0);
    expect(syncedPlayer?.y).toBeLessThan((joinedPlayer?.y ?? 0) + 18);
    expect(syncedPlayer?.facing).toEqual({ x: 0, y: 1 });
    expect(syncedPlayer?.flashlightOn).toBe(false);
    expect(room.getSnapshot().localPlayerJoined).toBe(true);
  });

  it("keeps room and match snapshots updated as the authoritative round advances", () => {
    const room = new LocalAuthoritativePublicRoomService({
      now: 5_000,
      random: () => 0.3
    });

    expect(room.join("Milo").ok).toBe(true);
    const startedAt = room.getMatchSnapshot()?.roundStartedAt ?? 5_000;
    room.tick(startedAt + ROUND_DURATION_MS + 1);
    expect(room.getSnapshot().phase).toBe("results");
    expect(room.getMatchSnapshot()?.results?.reason).toBe("timeout");
  });

  it("exposes authoritative objective and pickup snapshots through the room service", () => {
    const room = new LocalAuthoritativePublicRoomService({
      now: 8_000,
      random: () => 0.61
    });

    expect(room.join("Rhea").ok).toBe(true);
    const matchSnapshot = room.getMatchSnapshot();
    expect(matchSnapshot?.objectives.restoredRelayIds).toEqual([]);
    expect(matchSnapshot?.objectives.activatedPanelIds).toEqual([]);
    expect(matchSnapshot?.missionProgress.relayTotal).toBe(RELAYS.length);
    expect((matchSnapshot?.pickups.length ?? 0) > 0).toBe(true);
  });

  it("routes authoritative punch validation through the room service", () => {
    const room = new LocalAuthoritativePublicRoomService({
      now: 8_500,
      random: () => 0.2
    });

    expect(room.join("Piper").ok).toBe(true);
    const player = room.getLocalPlayerMatchSnapshot();
    const initialStalker = room.getMatchSnapshot()?.stalkers[0];
    expect(initialStalker).toBeTruthy();

    room.syncPrimaryStalkerState({
      x: (player?.x ?? 0) + 12,
      y: player?.y ?? 0,
      facing: { x: -1, y: 0 },
      health: initialStalker!.health,
      maxHealth: initialStalker!.maxHealth,
      isDead: false,
      mode: "chase",
      areaId: initialStalker!.areaId
    }, 8_510);

    const punch = room.submitPunch({ x: 1, y: 0 }, 8_520);
    expect(punch.ok).toBe(true);
    expect(punch.value?.hits[0]?.targetKind).toBe("stalker");
    expect(room.consumeLocalPunchResults()).toEqual([punch.value]);
    expect(room.consumeLocalPunchResults()).toEqual([]);
    expect(room.getMatchSnapshot()?.stalkers[0]?.health).toBeLessThan(initialStalker!.health);
  });

  it("syncs and damages the primary stalker through the room service", () => {
    const room = new LocalAuthoritativePublicRoomService({
      now: 9_000,
      random: () => 0.2
    });

    expect(room.join("Vale").ok).toBe(true);

    const stalker = room.getMatchSnapshot()?.stalkers[0];
    expect(stalker).toBeTruthy();

    const synced = room.syncPrimaryStalkerState({
      x: stalker!.x + 20,
      y: stalker!.y + 10,
      facing: { x: 0, y: 1 },
      health: stalker!.health,
      maxHealth: stalker!.maxHealth,
      isDead: false,
      mode: "chase",
      areaId: stalker!.areaId
    }, 9_010);
    expect(synced?.x).toBe(stalker!.x + 20);
    expect(room.getMatchSnapshot()?.stalkers[0]?.mode).toBe("chase");

    const damage = room.applyPrimaryStalkerDamage(stalker!.maxHealth, 9_020);
    expect(damage.ok).toBe(true);
    expect(room.getMatchSnapshot()?.stalkers[0]?.isDead).toBe(true);
  });
});
