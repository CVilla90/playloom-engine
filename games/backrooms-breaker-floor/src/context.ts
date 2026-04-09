import type { InputManager } from "@playloom/engine-input";
import type { Renderer2D } from "@playloom/engine-renderer-canvas";
import type { PublicRoomService } from "./multiplayer/PublicRoomService";

export interface AppServices {
  renderer: Renderer2D;
  input: InputManager;
  uiRoot: HTMLDivElement;
  room: PublicRoomService;
}
