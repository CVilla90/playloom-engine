import type { SynthAudio } from "@playloom/engine-audio";
import type { InputManager } from "@playloom/engine-input";
import type { Renderer2D } from "@playloom/engine-renderer-canvas";
import type { GameAssets } from "./assets";
import type { CharacterId, PhaseCap, RunSnapshot } from "./types";

export interface AppServices {
  renderer: Renderer2D;
  input: InputManager;
  audio: SynthAudio;
  assets: GameAssets;
  phaseCap: PhaseCap;
  startNewRun: (characterId: CharacterId) => void;
  continueRun: () => void;
  restartFlow: () => void;
  saveRun: (characterId: CharacterId, snapshot: RunSnapshot) => void;
}
