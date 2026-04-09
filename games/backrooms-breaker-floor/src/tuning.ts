export interface MovementTuning {
  readonly movementSpeed: number;
}

export interface PlayerTuning {
  readonly movement: MovementTuning;
  readonly maxHealth: number;
  readonly exitMovementSpeed: number;
  readonly punch: {
    readonly range: number;
    readonly radius: number;
    readonly damage: number;
    readonly cooldown: number;
    readonly animationDuration: number;
  };
}

export interface StalkerTuning {
  readonly movement: MovementTuning;
  readonly maxHealth: number;
  readonly attack: {
    readonly damage: number;
    readonly range: number;
    readonly cooldown: number;
    readonly animationDuration: number;
    readonly hitDelay: number;
  };
  readonly roamMovementSpeed: number;
  readonly nearbyAlertDistance: number;
  readonly chasePreferredDistance: number;
  readonly chaseDistanceTolerance: number;
  readonly combatHitboxWidth: number;
  readonly combatHitboxHeight: number;
  readonly detectionRange: number;
  readonly pursuitDropRange: number;
  readonly hearingRange: number;
  readonly visionDotThreshold: number;
  readonly memoryDuration: number;
  readonly spawnMinDistance: number;
  readonly roamStepInterval: number;
  readonly chaseStepInterval: number;
}

export const PLAYER_TUNING: PlayerTuning = {
  movement: {
    movementSpeed: 172
  },
  maxHealth: 100,
  exitMovementSpeed: 186,
  punch: {
    range: 14,
    radius: 8,
    damage: 10,
    cooldown: 0.24,
    animationDuration: 0.18
  }
};

export const BLACK_STICKMAN_TUNING: StalkerTuning = {
  movement: {
    movementSpeed: 148
  },
  maxHealth: 300,
  attack: {
    damage: 30,
    range: 42,
    cooldown: 1.05,
    animationDuration: 0.34,
    hitDelay: 0.16
  },
  roamMovementSpeed: 114,
  nearbyAlertDistance: 164,
  chasePreferredDistance: 34,
  chaseDistanceTolerance: 8,
  combatHitboxWidth: 18,
  combatHitboxHeight: 62,
  detectionRange: 360,
  pursuitDropRange: 520,
  hearingRange: 460,
  visionDotThreshold: 0.36,
  memoryDuration: 3,
  spawnMinDistance: 760,
  roamStepInterval: 0.56,
  chaseStepInterval: 0.34
};
