import { describe, expect, it } from "vitest";
import {
  PlatformerController,
  createPlatformerState,
  defaultPlatformerProfile,
  type PlatformerBody
} from "./PlatformerController";

function createBody(overrides: Partial<PlatformerBody> = {}): PlatformerBody {
  return {
    x: 10,
    y: 36,
    width: 10,
    height: 10,
    vx: 0,
    vy: 0,
    ...overrides
  };
}

describe("PlatformerController", () => {
  it("auto-hooks when entering climb zone", () => {
    const controller = new PlatformerController();
    const step = controller.step({
      dt: 1 / 60,
      input: { moveX: 0, moveY: 0, jumpPressed: false },
      body: createBody(),
      state: createPlatformerState("grounded"),
      isInClimbZone: () => true
    });
    expect(step.state.mode).toBe("climbing");
  });

  it("detaches climb on horizontal jump and honors rehook cooldown", () => {
    const controller = new PlatformerController();
    const first = controller.step({
      dt: 1 / 60,
      input: { moveX: 1, moveY: 0, jumpPressed: true },
      body: createBody(),
      state: createPlatformerState("climbing"),
      isInClimbZone: () => true
    });

    expect(first.state.mode).toBe("airborne");
    expect(first.state.detachTimer).toBeGreaterThan(0);

    const second = controller.step({
      dt: 1 / 60,
      input: { moveX: 0, moveY: 0, jumpPressed: false },
      body: first.body,
      state: first.state,
      isInClimbZone: () => true
    });
    expect(second.state.mode).toBe("airborne");
  });

  it("supports stair hop jump while staying in climb mode", () => {
    const controller = new PlatformerController();
    const start = createBody({ y: 100 });
    const step = controller.step({
      dt: 1 / 60,
      input: { moveX: 0, moveY: 0, jumpPressed: true },
      body: start,
      state: createPlatformerState("climbing"),
      isInClimbZone: () => true
    });
    expect(step.state.mode).toBe("climbing");
    expect(step.body.y).toBeLessThan(start.y);
  });

  it("lands using ground resolver", () => {
    const controller = new PlatformerController({
      ...defaultPlatformerProfile(),
      gravity: 500
    });

    let body = createBody({ y: 0, vy: 0 });
    let state = createPlatformerState("grounded");

    ({ body, state } = controller.step({
      dt: 1 / 60,
      input: { moveX: 0, moveY: 0, jumpPressed: true },
      body,
      state,
      resolveGroundY: (_previousBottom, candidate) => (candidate.y + candidate.height >= 100 ? 100 : null),
      confirmGroundY: (candidate) => (candidate.y + candidate.height >= 100 ? 100 : null)
    }));

    expect(state.mode).toBe("airborne");

    let landed = false;
    for (let i = 0; i < 120; i += 1) {
      const step = controller.step({
        dt: 1 / 60,
        input: { moveX: 0, moveY: 0, jumpPressed: false },
        body,
        state,
        resolveGroundY: (_previousBottom, candidate) => (candidate.y + candidate.height >= 100 ? 100 : null),
        confirmGroundY: (candidate) => (candidate.y + candidate.height >= 100 ? 100 : null)
      });
      body = step.body;
      state = step.state;
      landed = landed || step.events.landed;
      if (state.mode === "grounded") break;
    }

    expect(landed).toBe(true);
    expect(state.mode).toBe("grounded");
    expect(body.y + body.height).toBe(100);
  });
});
