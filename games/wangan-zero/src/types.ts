export interface GameManifest {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

export const GAME_MANIFEST: GameManifest = {
  id: "wangan-zero",
  name: "Wangan Zero",
  width: 1280,
  height: 720,
  fps: 60
};

export const GAME_TITLE_JP = "湾岸ゼロ";

export const GAME_TAGLINE = "The city sleeps. Its fastest road does not.";
