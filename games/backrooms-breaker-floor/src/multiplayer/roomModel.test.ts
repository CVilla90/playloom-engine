import { describe, expect, it } from "vitest";
import {
  JOIN_GRACE_MS,
  PLAYER_NAME_MAX_LENGTH,
  ROUND_DURATION_MS,
  formatPublicRoomStatus,
  type RoomPresence
} from "./publicRoomTypes";
import {
  buildPublicRoomSnapshot,
  dedupeActivePlayers,
  normalizePlayerName,
  validatePlayerName
} from "./roomModel";

describe("public room model", () => {
  it("normalizes and validates player names", () => {
    expect(normalizePlayerName("  Carla   West ")).toBe("carla west");

    expect(validatePlayerName("   ").ok).toBe(false);
    expect(validatePlayerName("A".repeat(PLAYER_NAME_MAX_LENGTH + 1)).ok).toBe(false);

    const valid = validatePlayerName("  Relay Runner  ");
    expect(valid.ok).toBe(true);
    expect(valid.trimmedName).toBe("Relay Runner");
    expect(valid.normalizedName).toBe("relay runner");
  });

  it("dedupes duplicate active names deterministically", () => {
    const players: RoomPresence[] = [
      {
        sessionId: "b-session",
        name: "Carla",
        normalizedName: "carla",
        joinedAt: 200,
        lastSeenAt: 1000
      },
      {
        sessionId: "a-session",
        name: "  carla  ",
        normalizedName: "carla",
        joinedAt: 200,
        lastSeenAt: 1000
      },
      {
        sessionId: "c-session",
        name: "Milo",
        normalizedName: "milo",
        joinedAt: 260,
        lastSeenAt: 1000
      }
    ];

    const deduped = dedupeActivePlayers(players);
    expect(deduped.map((player) => player.sessionId)).toEqual(["a-session", "c-session"]);
  });

  it("builds joinable and locked room snapshots from timers", () => {
    const players: RoomPresence[] = [{
      sessionId: "session-1",
      name: "Carla",
      normalizedName: "carla",
      joinedAt: 10_000,
      lastSeenAt: 10_000 + ROUND_DURATION_MS
    }];

    const joinable = buildPublicRoomSnapshot({
      players,
      meta: { roundStartedAt: 10_000 },
      now: 10_000 + JOIN_GRACE_MS - 1000,
      localPlayerId: "session-1"
    });
    expect(joinable.phase).toBe("round_joinable");
    expect(joinable.isJoinable).toBe(true);
    expect(joinable.joinTimeRemainingMs).toBe(1000);
    expect(joinable.roundTimeRemainingMs).toBe(ROUND_DURATION_MS - JOIN_GRACE_MS + 1000);

    const locked = buildPublicRoomSnapshot({
      players,
      meta: { roundStartedAt: 10_000 },
      now: 10_000 + JOIN_GRACE_MS + 1,
      localPlayerId: "session-2"
    });
    expect(locked.phase).toBe("round_locked");
    expect(locked.isJoinable).toBe(false);
    expect(locked.waitReason).toBe("Current round is already locked.");
    expect(locked.localPlayerJoined).toBe(false);
  });

  it("returns waiting state when no active players remain", () => {
    const snapshot = buildPublicRoomSnapshot({
      players: [],
      meta: { roundStartedAt: 10_000 },
      now: 20_000,
      localPlayerId: "none"
    });

    expect(snapshot.phase).toBe("waiting");
    expect(snapshot.isJoinable).toBe(true);
    expect(snapshot.roundStartedAt).toBeNull();
  });

  it("maps internal match phases to front-screen status labels", () => {
    expect(formatPublicRoomStatus("waiting")).toBe("Open");
    expect(formatPublicRoomStatus("round_joinable")).toBe("Joinable");
    expect(formatPublicRoomStatus("round_locked")).toBe("Locked");
    expect(formatPublicRoomStatus("extraction_countdown")).toBe("Extraction");
    expect(formatPublicRoomStatus("lockdown_swarm")).toBe("Extraction");
    expect(formatPublicRoomStatus("results")).toBe("Results");
    expect(formatPublicRoomStatus("resetting")).toBe("Results");
  });
});
