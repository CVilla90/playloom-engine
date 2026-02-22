type BusName = "master" | "music" | "sfx";

interface BusState {
  volume: number;
  muted: boolean;
}

export interface AudioLike {
  volume: number;
  muted: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class AudioMixer {
  private readonly buses = new Map<BusName, BusState>([
    ["master", { volume: 1, muted: false }],
    ["music", { volume: 1, muted: false }],
    ["sfx", { volume: 1, muted: false }]
  ]);

  setVolume(bus: BusName, volume: number): void {
    const state = this.requireBus(bus);
    state.volume = clamp(volume, 0, 1);
  }

  setMuted(bus: BusName, muted: boolean): void {
    const state = this.requireBus(bus);
    state.muted = muted;
  }

  volume(bus: BusName): number {
    return this.requireBus(bus).volume;
  }

  isMuted(bus: BusName): boolean {
    return this.requireBus(bus).muted;
  }

  gain(bus: Exclude<BusName, "master">): number {
    const master = this.requireBus("master");
    const target = this.requireBus(bus);
    if (master.muted || target.muted) {
      return 0;
    }
    return clamp(master.volume * target.volume, 0, 1);
  }

  apply(audio: AudioLike, bus: Exclude<BusName, "master">, baseVolume = 1): void {
    const effective = clamp(this.gain(bus) * baseVolume, 0, 1);
    audio.volume = effective;
    audio.muted = effective <= 0;
  }

  playOneShot(url: string, baseVolume = 1): HTMLAudioElement | null {
    if (typeof Audio === "undefined") {
      return null;
    }
    const shot = new Audio(url);
    this.apply(shot, "sfx", baseVolume);
    void shot.play().catch(() => undefined);
    return shot;
  }

  private requireBus(bus: BusName): BusState {
    const state = this.buses.get(bus);
    if (!state) {
      throw new Error(`Unknown bus: ${bus}`);
    }
    return state;
  }
}
