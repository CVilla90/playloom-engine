export interface GameManifest {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

export const GAME_MANIFEST: GameManifest = {
  id: "black-relay-courier",
  name: "Black Relay Courier",
  width: 1280,
  height: 720,
  fps: 60
};

export const FLIGHT_SLICE_TITLE = "Slipwake: Test Flight";
export const GAME_TAGLINE = "Earn courier clearance by surfing illegal high-shear lanes.";
export const SPACE_VIEW_RATIO = 0.75;
