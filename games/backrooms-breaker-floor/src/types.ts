export interface GameManifest {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

export const GAME_MANIFEST: GameManifest = {
  id: "backrooms-breaker-floor",
  name: "Backrooms: Breaker Floor",
  width: 960,
  height: 540,
  fps: 60
};
