import { describe, expect, it } from "vitest";
import {
  SHIROKAGE_MAX_SPEED_KPH,
  RIVAL_DEFINITIONS,
  RIVAL_DRAFT_TOP_SPEED_BONUS_KPH,
  RIVAL_ROUTE_HALF_LENGTH_METERS,
  createInitialRivals,
  rivalHardSpeedLimitKph,
  stepRivals,
  wrapRouteRelativeMeters,
  type RivalObstacle,
  type RivalState
} from "./rivalModel";
import { ROUTE_LENGTH_METERS } from "./drivingModel";

function obstacle(overrides: Partial<RivalObstacle> & Pick<RivalObstacle, "id">): RivalObstacle {
  return {
    lane: "left",
    speedKph: 90,
    relativeMeters: 0,
    ...overrides
  };
}

describe("wangan zero rival model", () => {
  it("spawns one of each rival at session-randomized positions and cruise speeds", () => {
    const sequence = [0, 0, 0, 0.25, 0.25, 0.25, 0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 1, 0.99, 0.99];
    let cursor = 0;
    const rivals = createInitialRivals(() => sequence[cursor++] ?? 0.5);
    const [rival] = rivals;

    expect(rivals).toHaveLength(5);
    expect(rivals.map((entry) => entry.kind)).toEqual([
      "shirokage",
      "shirokageRed",
      "hibanaRs",
      "aonamiGt",
      "kageroVx"
    ]);
    expect(rival).toMatchObject({
      kind: "shirokage",
      encounterActive: false,
    });
    expect(rival!.speedKph).toBeGreaterThanOrEqual(RIVAL_DEFINITIONS.shirokage!.inactiveSpeedRangeKph[0]);
    expect(rival!.speedKph).toBeLessThanOrEqual(RIVAL_DEFINITIONS.shirokage!.inactiveSpeedRangeKph[1]);
    expect(new Set(rivals.map((entry) => entry.definitionId)).size).toBe(5);
    expect(rivals.every((entry) => Math.abs(entry.relativeMeters) <= RIVAL_ROUTE_HALF_LENGTH_METERS)).toBe(true);
  });

  it("owns the agreed speed, acceleration, aggression, and braking personalities", () => {
    expect(RIVAL_DEFINITIONS.shirokage).toMatchObject({
      maxSpeedKph: 221,
      accelerationMultiplier: 0.86,
      aggression: 34,
      brakingKphPerSecond: 47,
      reactionDistanceMeters: 194,
      laneChangeCooldownSeconds: 1.32
    });
    expect(RIVAL_DEFINITIONS.hibana_rs).toMatchObject({
      maxSpeedKph: 283,
      accelerationMultiplier: 1.18,
      aggression: 88,
      brakingKphPerSecond: 70,
      reactionDistanceMeters: 112,
      laneChangeCooldownSeconds: 0.4
    });
    expect(RIVAL_DEFINITIONS.aonami_gt).toMatchObject({
      maxSpeedKph: 309,
      accelerationMultiplier: 1,
      aggression: 44,
      brakingKphPerSecond: 56,
      reactionDistanceMeters: 210,
      laneChangeCooldownSeconds: 1.15
    });
    expect(RIVAL_DEFINITIONS.kagero_vx).toMatchObject({
      maxSpeedKph: 321,
      accelerationMultiplier: 1.08,
      aggression: 68,
      brakingKphPerSecond: 82,
      reactionDistanceMeters: 170,
      laneChangeCooldownSeconds: 0.72
    });
  });

  it("holds its inactive cruise speed before entering the player's sight", () => {
    const [randomSeed] = createInitialRivals(() => 0.5);
    const seed = { ...randomSeed!, relativeMeters: 1000, encounterActive: false };
    const [rival] = stepRivals([seed], {
      playerSpeedKph: seed.speedKph,
      playerLane: "center",
      obstacles: [],
      dt: 0.05
    });

    expect(rival!.encounterActive).toBe(false);
    expect(rival!.speedKph).toBe(seed.inactiveCruiseSpeedKph);
  });

  it("activates the white Shirokage in sight without exceeding its 221 kph cap", () => {
    let [rival] = createInitialRivals();
    const startSpeed = rival!.speedKph;
    rival = {
      ...rival!,
      lane: "left",
      laneFraction: -2 / 3,
      relativeMeters: 120,
      encounterActive: true
    };
    for (let index = 0; index < 500; index += 1) {
      [rival] = stepRivals([rival!], {
        playerSpeedKph: 245,
        playerLane: "center",
        obstacles: [],
        dt: 0.05
      });
    }

    expect(rival!.speedKph).toBeGreaterThan(startSpeed + 35);
    expect(rival!.speedKph).toBeLessThanOrEqual(SHIROKAGE_MAX_SPEED_KPH);
  });

  it("applies each new rival's acceleration multiplier", () => {
    const rivals = createInitialRivals();
    const speedAfterOneStep = (kind: RivalState["kind"]): number => {
      const seed = rivals.find((rival) => rival.kind === kind)!;
      const [rival] = stepRivals(
        [
          {
            ...seed,
            lane: "center",
            laneFraction: 0,
            speedKph: 180,
            relativeMeters: 100,
            encounterActive: true,
            laneChangeCooldown: 1
          }
        ],
        {
          playerSpeedKph: 150,
          playerLane: "right",
          obstacles: [],
          dt: 0.05
        }
      );
      return rival!.speedKph;
    };

    const aonamiSpeed = speedAfterOneStep("aonamiGt");
    const kageroSpeed = speedAfterOneStep("kageroVx");
    const hibanaSpeed = speedAfterOneStep("hibanaRs");
    expect(hibanaSpeed).toBeGreaterThan(kageroSpeed);
    expect(kageroSpeed).toBeGreaterThan(aonamiSpeed);
  });

  it("lets the Kagero use its high-speed reserve up to the 321 kph cap", () => {
    let rival = createInitialRivals().find((entry) => entry.kind === "kageroVx")!;
    rival = {
      ...rival,
      lane: "left",
      laneFraction: -2 / 3,
      speedKph: 300,
      relativeMeters: 100,
      encounterActive: true,
      laneChangeCooldown: 1
    };

    for (let index = 0; index < 1000; index += 1) {
      rival = stepRivals([rival], {
        playerSpeedKph: 300,
        playerLane: "right",
        obstacles: [],
        dt: 0.05
      })[0]!;
    }

    expect(rival.speedKph).toBeGreaterThan(320);
    expect(rival.speedKph).toBeLessThanOrEqual(RIVAL_DEFINITIONS.kagero_vx.maxSpeedKph);
  });

  it("lets the aggressive Hibana take a tighter opening than the patient Aonami", () => {
    const rivals = createInitialRivals();
    const tightOpening = [
      obstacle({ id: "center-slow", lane: "center", speedKph: 92, relativeMeters: 142 }),
      obstacle({ id: "left-behind", lane: "left", speedKph: 220, relativeMeters: 80 }),
      obstacle({ id: "right-ahead", lane: "right", speedKph: 220, relativeMeters: 118 })
    ];
    const stepPersonality = (kind: RivalState["kind"]): RivalState => {
      const seed = rivals.find((rival) => rival.kind === kind)!;
      return stepRivals(
        [
          {
            ...seed,
            lane: "center",
            laneFraction: 0,
            speedKph: 220,
            relativeMeters: 100,
            encounterActive: true,
            laneChangeCooldown: 0
          }
        ],
        {
          playerSpeedKph: 180,
          playerLane: "right",
          obstacles: tightOpening,
          dt: 0.05
        }
      )[0]!;
    };

    expect(stepPersonality("hibanaRs").laneChange?.targetLane).toBe("left");
    expect(stepPersonality("aonamiGt").laneChange).toBeNull();
  });

  it("changes lanes to pass a slower blocker when the next lane is clear", () => {
    const [seed] = createInitialRivals();
    let rivals: RivalState[] = [
        {
          ...seed!,
          lane: "center",
          laneFraction: 0,
          speedKph: 220,
          relativeMeters: 100,
          laneChangeCooldown: 0
        }
      ];
    let rival = stepRivals(
      rivals,
      {
        playerSpeedKph: 180,
        playerLane: "right",
        obstacles: [obstacle({ id: "slow-traffic", lane: "center", speedKph: 92, relativeMeters: 142 })],
        dt: 0.05
      }
    )[0]!;

    expect(rival!.lane).toBe("center");
    expect(rival!.laneChange?.targetLane).toBe("left");
    expect(rival!.laneFraction).toBeLessThan(0);
    expect(rival!.speedKph).toBeGreaterThan(220);

    rivals = [rival!];
    for (let index = 0; index < 19; index += 1) {
      rivals = stepRivals(rivals, {
        playerSpeedKph: 180,
        playerLane: "right",
        obstacles: [obstacle({ id: "slow-traffic", lane: "center", speedKph: 92, relativeMeters: 142 })],
        dt: 0.05
      });
    }
    rival = rivals[0]!;

    expect(rival.lane).toBe("left");
    expect(rival.laneChange).toBeNull();
  });

  it("starts crossing toward a far open lane when the adjacent lane is still constrained", () => {
    const [seed] = createInitialRivals();
    const [rival] = stepRivals(
      [
        {
          ...seed!,
          lane: "left",
          laneFraction: -2 / 3,
          speedKph: 210,
          relativeMeters: 100,
          laneChangeCooldown: 0
        }
      ],
      {
        playerSpeedKph: 190,
        playerLane: "right",
        obstacles: [
          obstacle({ id: "left-slow", lane: "left", speedKph: 95, relativeMeters: 145 }),
          obstacle({ id: "center-slow", lane: "center", speedKph: 110, relativeMeters: 180 })
        ],
        dt: 0.05
      }
    );

    expect(rival!.lane).toBe("left");
    expect(rival!.laneChange?.targetLane).toBe("center");
    expect(rival!.laneChange?.direction).toBe("right");
    expect(rival!.speedKph).toBeGreaterThan(210);
  });

  it("keeps speed while already signaling around a blocker", () => {
    const [seed] = createInitialRivals();
    const [rival] = stepRivals(
      [
        {
          ...seed!,
          lane: "center",
          laneFraction: -0.2,
          speedKph: 220,
          relativeMeters: 100,
          laneChangeCooldown: 0,
          laneChange: {
            fromLane: "center",
            targetLane: "left",
            direction: "left",
            elapsedSeconds: 0.45,
            durationSeconds: 1
          }
        }
      ],
      {
        playerSpeedKph: 180,
        playerLane: "right",
        obstacles: [obstacle({ id: "slow-traffic", lane: "center", speedKph: 92, relativeMeters: 132 })],
        dt: 0.05
      }
    );

    expect(rival!.lane).toBe("center");
    expect(rival!.laneChange?.targetLane).toBe("left");
    expect(rival!.speedKph).toBeGreaterThan(220);
  });

  it("accelerates harder while drafting a faster same-lane car", () => {
    const [seed] = createInitialRivals();
    const rival = {
      ...seed!,
      lane: "center" as const,
      laneFraction: 0,
      speedKph: 180,
      relativeMeters: 100,
      encounterActive: true,
      laneChangeCooldown: 1
    };
    const [base] = stepRivals([rival], {
      playerSpeedKph: 150,
      playerLane: "right",
      obstacles: [],
      dt: 0.05
    });
    const [drafted] = stepRivals([rival], {
      playerSpeedKph: 150,
      playerLane: "right",
      obstacles: [obstacle({ id: "fast-front", lane: "center", speedKph: 230, relativeMeters: 112 })],
      dt: 0.05
    });

    expect(drafted!.speedKph).toBeGreaterThan(base!.speedKph);
  });

  it("runs past its own top speed inside a strong slipstream, within the draft bonus", () => {
    const [seed] = createInitialRivals();
    let rival: RivalState = {
      ...seed!,
      lane: "center",
      laneFraction: 0,
      speedKph: SHIROKAGE_MAX_SPEED_KPH - 0.2,
      relativeMeters: 100,
      encounterActive: true,
      laneChangeCooldown: 1
    };
    for (let index = 0; index < 120; index += 1) {
      rival = {
        ...stepRivals([rival], {
          playerSpeedKph: 150,
          playerLane: "right",
          obstacles: [
            obstacle({ id: "faster-front", lane: "center", speedKph: 320, relativeMeters: rival.relativeMeters + 12 })
          ],
          dt: 0.05
        })[0]!,
        laneChangeCooldown: 1
      };
    }

    expect(rival.speedKph).toBeGreaterThan(SHIROKAGE_MAX_SPEED_KPH);
    expect(rival.speedKph).toBeLessThanOrEqual(
      SHIROKAGE_MAX_SPEED_KPH + RIVAL_DRAFT_TOP_SPEED_BONUS_KPH
    );
  });

  it("bleeds bump-donated overspeed gently instead of brake-slamming it away", () => {
    const seed = createInitialRivals().find((entry) => entry.kind === "hibanaRs")!;
    const [rival] = stepRivals(
      [
        {
          ...seed,
          lane: "center",
          laneFraction: 0,
          speedKph: 300,
          relativeMeters: 100,
          encounterActive: true,
          laneChangeCooldown: 1
        }
      ],
      {
        playerSpeedKph: 150,
        playerLane: "right",
        obstacles: [],
        dt: 0.05
      }
    );

    // Hibana's cap is 283 but the excess decays at RIVAL_OVERSPEED_BLEED
    // (5.5 kph/s), not its 70 kph/s braking rate — donated speed is kept.
    expect(rival!.speedKph).toBeCloseTo(300 - 5.5 * 0.05, 5);
  });

  it("never lets a collision donation exceed the rival's mechanical limit", () => {
    const seed = createInitialRivals().find((entry) => entry.kind === "hibanaRs")!;
    const [rival] = stepRivals(
      [{
        ...seed,
        lane: "center",
        laneFraction: 0,
        speedKph: 350,
        relativeMeters: 100,
        encounterActive: true,
        laneChangeCooldown: 1
      }],
      {
        playerSpeedKph: 150,
        playerLane: "right",
        obstacles: [],
        dt: 0.05
      }
    );

    expect(rival!.speedKph).toBe(rivalHardSpeedLimitKph(seed));
  });

  it("has aggressive rivals tuck in behind a fast train partner instead of swerving", () => {
    const rivals = createInitialRivals();
    const trainSetup = (kind: RivalState["kind"]): RivalState => {
      const seed = rivals.find((rival) => rival.kind === kind)!;
      return stepRivals(
        [
          {
            ...seed,
            lane: "center",
            laneFraction: 0,
            speedKph: 265,
            relativeMeters: 100,
            encounterActive: true,
            laneChangeCooldown: 0
          }
        ],
        {
          playerSpeedKph: 180,
          playerLane: "right",
          obstacles: [
            obstacle({
              id: "rival:partner",
              lane: "center",
              speedKph: 270,
              relativeMeters: 130,
              trainPartner: true
            })
          ],
          dt: 0.05
        }
      )[0]!;
    };

    // Hibana (aggression 88) stays in lane and keeps closing on the partner.
    const hibana = trainSetup("hibanaRs");
    expect(hibana.laneChange).toBeNull();
    expect(hibana.lane).toBe("center");
    expect(hibana.speedKph).toBeGreaterThan(265);

    // Aonami (aggression 44) still prefers to swing around.
    const aonami = trainSetup("aonamiGt");
    expect(aonami.laneChange?.targetLane).toBeDefined();
  });

  it("brakes instead of lane-changing into a boxed gap", () => {
    const [seed] = createInitialRivals();
    const [rival] = stepRivals(
      [
        {
          ...seed!,
          lane: "center",
          laneFraction: 0,
          speedKph: 220,
          relativeMeters: 100,
          laneChangeCooldown: 0
        }
      ],
      {
        playerSpeedKph: 180,
        playerLane: "right",
        obstacles: [
          obstacle({ id: "slow-traffic", lane: "center", speedKph: 92, relativeMeters: 142 }),
          obstacle({ id: "left-ahead", lane: "left", speedKph: 96, relativeMeters: 118 }),
          obstacle({ id: "right-behind", lane: "right", speedKph: 170, relativeMeters: 94 })
        ],
        dt: 0.05
      }
    );

    expect(rival!.lane).toBe("center");
    expect(rival!.laneChange).toBeNull();
    expect(rival!.speedKph).toBeLessThan(220);
  });

  it("keeps the same rival alive while its position wraps around the closed route", () => {
    const [seed] = createInitialRivals();
    const [rival] = stepRivals(
      [
        {
          ...seed!,
          relativeMeters: RIVAL_ROUTE_HALF_LENGTH_METERS - 0.05,
          speedKph: 321,
          encounterActive: true
        }
      ],
      {
        playerSpeedKph: 0,
        playerLane: "center",
        obstacles: [],
        dt: 0.05
      }
    );

    expect(rival!.id).toBe(seed!.id);
    expect(rival!.definitionId).toBe(seed!.definitionId);
    expect(rival!.encounterActive).toBe(true);
    expect(rival!.relativeMeters).toBeLessThan(-RIVAL_ROUTE_HALF_LENGTH_METERS + 5);
    expect(wrapRouteRelativeMeters(ROUTE_LENGTH_METERS + 120)).toBe(120);
  });
});
