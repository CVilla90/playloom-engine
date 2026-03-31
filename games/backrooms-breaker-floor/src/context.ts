import type { InputManager } from "@playloom/engine-input";
import type { Renderer2D } from "@playloom/engine-renderer-canvas";

export interface AppServices {
  renderer: Renderer2D;
  input: InputManager;
}
