export interface GameManifest {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly saveKey: string;
}

export const GAME_MANIFEST: GameManifest = {
  id: "black-relay-courier",
  name: "Black Relay Courier",
  width: 1280,
  height: 720,
  fps: 60,
  saveKey: "black-relay-courier.save.v1"
};

export const FLIGHT_SLICE_TITLE = "Slipwake: Open Carrier";
export const GAME_TAGLINE = "Ride the slipwake while the relay stack stays readable.";
export const SPACE_VIEW_RATIO = 0.75;
