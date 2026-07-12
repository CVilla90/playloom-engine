export type AudioMode = "normal" | "boosted" | "muted";

const AUDIO_MODE_CYCLE: readonly AudioMode[] = ["normal", "boosted", "muted"];

/** Advance the M-button cycle: normal -> boosted -> muted -> normal. */
export function nextAudioMode(mode: AudioMode): AudioMode {
  const index = AUDIO_MODE_CYCLE.indexOf(mode);
  return AUDIO_MODE_CYCLE[(index + 1) % AUDIO_MODE_CYCLE.length]!;
}

/** Master-gain multiplier for a mode (0 mutes). */
export function audioModeScale(mode: AudioMode): number {
  switch (mode) {
    case "boosted":
      return 1.7;
    case "muted":
      return 0;
    default:
      return 1;
  }
}

export function audioModeLabel(mode: AudioMode): string {
  switch (mode) {
    case "boosted":
      return "AUDIO BOOST";
    case "muted":
      return "AUDIO MUTED";
    default:
      return "AUDIO LIVE";
  }
}
