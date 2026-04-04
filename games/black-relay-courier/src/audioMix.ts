export type AudioMixMode = "mid" | "max" | "mute";

export interface AudioMixProfile {
  readonly mode: AudioMixMode;
  readonly label: string;
  readonly shortLabel: string;
  readonly statusText: string;
  readonly audible: boolean;
  readonly synth: number;
  readonly cockpit: number;
  readonly soundtrack: number;
}

const AUDIO_MIX_ORDER: readonly AudioMixMode[] = ["mid", "max", "mute"];

const AUDIO_MIX_PROFILES: Record<AudioMixMode, AudioMixProfile> = {
  mid: {
    mode: "mid",
    label: "mid-low",
    shortLabel: "mid-low",
    statusText: "Audio mix set to mid-low.",
    audible: true,
    synth: 0.82,
    cockpit: 0.76,
    soundtrack: 0.72
  },
  max: {
    mode: "max",
    label: "max",
    shortLabel: "max",
    statusText: "Audio mix set to max.",
    audible: true,
    synth: 1.16,
    cockpit: 1,
    soundtrack: 10.00
  },
  mute: {
    mode: "mute",
    label: "mute",
    shortLabel: "mute",
    statusText: "Audio muted.",
    audible: false,
    synth: 0,
    cockpit: 0,
    soundtrack: 0
  }
};

let currentAudioMixMode: AudioMixMode = "mid";

export function getAudioMixMode(): AudioMixMode {
  return currentAudioMixMode;
}

export function getAudioMixProfile(mode = currentAudioMixMode): AudioMixProfile {
  return AUDIO_MIX_PROFILES[mode];
}

export function setAudioMixMode(mode: AudioMixMode): AudioMixMode {
  currentAudioMixMode = mode;
  return currentAudioMixMode;
}

export function cycleAudioMixMode(): AudioMixMode {
  const currentIndex = AUDIO_MIX_ORDER.indexOf(currentAudioMixMode);
  currentAudioMixMode = AUDIO_MIX_ORDER[(currentIndex + 1) % AUDIO_MIX_ORDER.length] ?? "mid";
  return currentAudioMixMode;
}
