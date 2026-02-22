export type LocomotionMode = "grounded" | "airborne" | "climbing";

export interface PlatformerBody {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
}

export interface PlatformerInputState {
  moveX: number;
  moveY: number;
  jumpPressed: boolean;
}

export interface PlatformerState {
  mode: LocomotionMode;
  facing: 1 | -1;
  detachTimer: number;
}

export interface PlatformerProfile {
  moveSpeed: number;
  climbSpeed: number;
  climbHorizontalFactor: number;
  jumpSpeed: number;
  gravity: number;
  stairHopHeight: number;
  stairDetachJumpFactor: number;
  rehookCooldown: number;
}

export interface PlatformerCollisionHooks {
  isInClimbZone?: (body: PlatformerBody) => boolean;
  resolveGroundY?: (previousBottom: number, body: PlatformerBody) => number | null;
  confirmGroundY?: (body: PlatformerBody) => number | null;
  clampBody?: (body: PlatformerBody) => void;
}

export interface PlatformerStepOptions extends PlatformerCollisionHooks {
  dt: number;
  input: PlatformerInputState;
  body: PlatformerBody;
  state: PlatformerState;
}

export interface PlatformerStepEvents {
  jumped: boolean;
  landed: boolean;
  modeChanged: boolean;
}

export interface PlatformerStepResult {
  body: PlatformerBody;
  state: PlatformerState;
  events: PlatformerStepEvents;
}

function clampAxis(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function defaultPlatformerProfile(): PlatformerProfile {
  return {
    moveSpeed: 238,
    climbSpeed: 184,
    climbHorizontalFactor: 0.66,
    jumpSpeed: 430,
    gravity: 1320,
    stairHopHeight: 52,
    stairDetachJumpFactor: 0.82,
    rehookCooldown: 0.24
  };
}

export function createPlatformerState(initialMode: LocomotionMode = "grounded"): PlatformerState {
  return {
    mode: initialMode,
    facing: 1,
    detachTimer: 0
  };
}

export class PlatformerController {
  private readonly profile: PlatformerProfile;

  constructor(profile: Partial<PlatformerProfile> = {}) {
    this.profile = { ...defaultPlatformerProfile(), ...profile };
  }

  step(options: PlatformerStepOptions): PlatformerStepResult {
    const body: PlatformerBody = { ...options.body };
    const state: PlatformerState = { ...options.state };
    const events: PlatformerStepEvents = {
      jumped: false,
      landed: false,
      modeChanged: false
    };
    const previousMode = state.mode;

    const dt = Math.max(0, options.dt);
    const moveX = clampAxis(options.input.moveX);
    const moveY = clampAxis(options.input.moveY);
    const jumpPressed = options.input.jumpPressed;

    if (moveX !== 0) {
      state.facing = moveX > 0 ? 1 : -1;
    }
    state.detachTimer = Math.max(0, state.detachTimer - dt);

    const inClimbZone = options.isInClimbZone?.(body) ?? false;
    if (state.mode !== "climbing" && inClimbZone && state.detachTimer <= 0) {
      state.mode = "climbing";
      body.vy = 0;
    } else if (state.mode === "climbing" && !inClimbZone) {
      state.mode = "airborne";
    }

    if (state.mode === "climbing") {
      body.vx = moveX * this.profile.moveSpeed * this.profile.climbHorizontalFactor;
      body.vy = moveY * this.profile.climbSpeed;
      body.x += body.vx * dt;
      body.y += body.vy * dt;

      if (jumpPressed) {
        events.jumped = true;
        if (moveX === 0) {
          body.y -= this.profile.stairHopHeight;
        } else {
          state.mode = "airborne";
          state.detachTimer = this.profile.rehookCooldown;
          body.vy = -this.profile.jumpSpeed * this.profile.stairDetachJumpFactor;
        }
      }
    }

    if (state.mode !== "climbing") {
      body.vx = moveX * this.profile.moveSpeed;
      body.x += body.vx * dt;

      if (jumpPressed && state.mode === "grounded") {
        body.vy = -this.profile.jumpSpeed;
        state.mode = "airborne";
        events.jumped = true;
      }

      if (state.mode !== "grounded") {
        body.vy += this.profile.gravity * dt;
      }

      const previousBottom = body.y + body.height;
      body.y += body.vy * dt;

      if (body.vy >= 0 && options.resolveGroundY) {
        const groundY = options.resolveGroundY(previousBottom, body);
        if (groundY !== null) {
          body.y = groundY - body.height;
          body.vy = 0;
          if (state.mode !== "grounded") {
            events.landed = true;
          }
          state.mode = "grounded";
        } else if (state.mode === "grounded") {
          state.mode = "airborne";
        }
      }

      if (state.mode === "grounded" && options.confirmGroundY) {
        const supportY = options.confirmGroundY(body);
        if (supportY === null) {
          state.mode = "airborne";
        } else {
          body.y = supportY - body.height;
          body.vy = 0;
        }
      }
    }

    options.clampBody?.(body);

    const climbAfterMove = options.isInClimbZone?.(body) ?? false;
    if (state.mode === "climbing" && !climbAfterMove) {
      state.mode = "airborne";
    } else if (state.mode !== "climbing" && climbAfterMove && state.detachTimer <= 0) {
      state.mode = "climbing";
      body.vy = 0;
    }

    events.modeChanged = state.mode !== previousMode;

    return {
      body,
      state,
      events
    };
  }
}
