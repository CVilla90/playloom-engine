export interface GameManifest {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

export const GAME_MANIFEST: GameManifest = {
  id: "zacaton-depths",
  name: "Zacaton Depths",
  width: 1280,
  height: 720,
  fps: 60
};
