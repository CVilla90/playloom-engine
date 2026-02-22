import type { PhaseCap } from "./types";

function modeToPhase(mode: string): PhaseCap {
  switch (mode) {
    case "phase1":
      return 1;
    case "phase2":
      return 2;
    case "phase3":
      return 3;
    default:
      return 4;
  }
}

export const PHASE_CAP: PhaseCap = modeToPhase(import.meta.env.MODE);
