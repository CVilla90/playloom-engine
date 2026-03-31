import { SSI_EFFECT_CEILING, clamp } from "../flightModel";

export interface CockpitAudioState {
  readonly throttle: number;
  readonly ssi: number;
  readonly strain: number;
  readonly accelerating: boolean;
  readonly braking: boolean;
}

export interface CockpitAudioProfile {
  readonly bodyFreq: number;
  readonly bodyGain: number;
  readonly bodyFilter: number;
  readonly overtoneFreq: number;
  readonly overtoneGain: number;
  readonly overtoneFilter: number;
  readonly windGain: number;
  readonly windFilter: number;
  readonly brakeGain: number;
  readonly brakeFilter: number;
  readonly stereoSpread: number;
}

function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

export function deriveCockpitAudioProfile(state: CockpitAudioState): CockpitAudioProfile {
  const throttleRatio = clamp(state.throttle / 100, 0, 1);
  const speedRatio = clamp(state.ssi / SSI_EFFECT_CEILING, 0, 1);
  const strainRatio = clamp(state.strain / 100, 0, 1);
  const accelerating = state.accelerating ? 1 : 0;
  const braking = state.braking ? 1 : 0;

  return {
    bodyFreq: 28 + throttleRatio * 32 + speedRatio * 18,
    bodyGain: 0.012 + throttleRatio * 0.05 + speedRatio * 0.02,
    bodyFilter: 110 + throttleRatio * 90 + speedRatio * 80,
    overtoneFreq: 76 + throttleRatio * 92 + speedRatio * 110 + accelerating * 12,
    overtoneGain: 0.004 + throttleRatio * 0.015 + speedRatio * 0.021 + accelerating * 0.009,
    overtoneFilter: 260 + throttleRatio * 540 + speedRatio * 720,
    windGain: speedRatio * speedRatio * 0.075 + accelerating * 0.012,
    windFilter: 420 + throttleRatio * 320 + speedRatio * 2800,
    brakeGain: braking ? 0.014 + speedRatio * 0.05 + strainRatio * 0.03 : 0.0001,
    brakeFilter: 380 + speedRatio * 1180 + braking * 260,
    stereoSpread: 0.18 + throttleRatio * 0.16 + speedRatio * 0.14
  };
}

export class CockpitAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private initialized = false;

  private leftOsc: OscillatorNode | null = null;
  private rightOsc: OscillatorNode | null = null;
  private overtoneOsc: OscillatorNode | null = null;

  private leftGain: GainNode | null = null;
  private rightGain: GainNode | null = null;
  private overtoneGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private brakeGain: GainNode | null = null;

  private leftPan: StereoPannerNode | null = null;
  private rightPan: StereoPannerNode | null = null;

  private bodyFilter: BiquadFilterNode | null = null;
  private overtoneFilter: BiquadFilterNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private brakeFilter: BiquadFilterNode | null = null;

  private windSource: AudioBufferSourceNode | null = null;
  private brakeSource: AudioBufferSourceNode | null = null;

  unlock(): void {
    if (!this.enabled) {
      return;
    }

    const Ctor = getAudioContextCtor();
    if (!Ctor) {
      return;
    }

    if (!this.context) {
      this.context = new Ctor();
    }
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
    if (this.initialized) {
      this.setEnabled(this.enabled);
      return;
    }

    this.buildGraph();
    this.initialized = true;
    this.setEnabled(this.enabled);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled && this.context?.state === "suspended") {
      void this.context.resume();
    }
    if (!this.master || !this.context) {
      return;
    }

    this.target(this.master.gain, enabled ? 0.92 : 0.0001, 0.08);
  }

  update(state: CockpitAudioState): void {
    if (!this.enabled || !this.context || !this.initialized) {
      return;
    }

    const profile = deriveCockpitAudioProfile(state);
    this.targetFrequency(this.leftOsc, profile.bodyFreq * 0.992);
    this.targetFrequency(this.rightOsc, profile.bodyFreq * 1.008);
    this.target(this.leftGain?.gain, profile.bodyGain * 0.64, 0.1);
    this.target(this.rightGain?.gain, profile.bodyGain * 0.64, 0.1);
    this.target(this.bodyFilter?.frequency, profile.bodyFilter, 0.1);
    this.target(this.leftPan?.pan, -profile.stereoSpread, 0.14);
    this.target(this.rightPan?.pan, profile.stereoSpread, 0.14);

    this.targetFrequency(this.overtoneOsc, profile.overtoneFreq);
    this.target(this.overtoneGain?.gain, profile.overtoneGain, 0.08);
    this.target(this.overtoneFilter?.frequency, profile.overtoneFilter, 0.08);

    this.target(this.windGain?.gain, profile.windGain, 0.12);
    this.target(this.windFilter?.frequency, profile.windFilter, 0.12);

    this.target(this.brakeGain?.gain, profile.brakeGain, 0.05);
    this.target(this.brakeFilter?.frequency, profile.brakeFilter, 0.05);
  }

  shutdown(): void {
    this.stopSource(this.windSource);
    this.stopSource(this.brakeSource);
    this.stopSource(this.leftOsc);
    this.stopSource(this.rightOsc);
    this.stopSource(this.overtoneOsc);

    this.windSource = null;
    this.brakeSource = null;
    this.leftOsc = null;
    this.rightOsc = null;
    this.overtoneOsc = null;
    this.leftGain = null;
    this.rightGain = null;
    this.overtoneGain = null;
    this.windGain = null;
    this.brakeGain = null;
    this.leftPan = null;
    this.rightPan = null;
    this.bodyFilter = null;
    this.overtoneFilter = null;
    this.windFilter = null;
    this.brakeFilter = null;
    this.master = null;
    this.initialized = false;

    if (this.context) {
      const context = this.context;
      this.context = null;
      void context.close().catch(() => {});
    }
  }

  private buildGraph(): void {
    if (!this.context) {
      return;
    }

    this.master = this.context.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(this.context.destination);

    this.bodyFilter = this.context.createBiquadFilter();
    this.bodyFilter.type = "lowpass";
    this.bodyFilter.frequency.value = 130;
    this.bodyFilter.Q.value = 0.9;
    this.bodyFilter.connect(this.master);

    this.leftGain = this.context.createGain();
    this.rightGain = this.context.createGain();
    this.leftGain.gain.value = 0.0001;
    this.rightGain.gain.value = 0.0001;
    this.leftPan = this.context.createStereoPanner();
    this.rightPan = this.context.createStereoPanner();
    this.leftPan.pan.value = -0.22;
    this.rightPan.pan.value = 0.22;
    this.leftGain.connect(this.leftPan);
    this.rightGain.connect(this.rightPan);
    this.leftPan.connect(this.bodyFilter);
    this.rightPan.connect(this.bodyFilter);

    this.leftOsc = this.context.createOscillator();
    this.rightOsc = this.context.createOscillator();
    this.leftOsc.type = "sawtooth";
    this.rightOsc.type = "sawtooth";
    this.leftOsc.frequency.value = 34;
    this.rightOsc.frequency.value = 34.4;
    this.leftOsc.connect(this.leftGain);
    this.rightOsc.connect(this.rightGain);

    this.overtoneFilter = this.context.createBiquadFilter();
    this.overtoneFilter.type = "bandpass";
    this.overtoneFilter.frequency.value = 380;
    this.overtoneFilter.Q.value = 0.9;
    this.overtoneGain = this.context.createGain();
    this.overtoneGain.gain.value = 0.0001;
    this.overtoneOsc = this.context.createOscillator();
    this.overtoneOsc.type = "triangle";
    this.overtoneOsc.frequency.value = 92;
    this.overtoneOsc.connect(this.overtoneFilter);
    this.overtoneFilter.connect(this.overtoneGain);
    this.overtoneGain.connect(this.master);

    this.windFilter = this.context.createBiquadFilter();
    this.windFilter.type = "highpass";
    this.windFilter.frequency.value = 720;
    this.windGain = this.context.createGain();
    this.windGain.gain.value = 0.0001;
    this.windSource = this.createNoiseSource();
    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);

    this.brakeFilter = this.context.createBiquadFilter();
    this.brakeFilter.type = "bandpass";
    this.brakeFilter.frequency.value = 820;
    this.brakeFilter.Q.value = 1.8;
    this.brakeGain = this.context.createGain();
    this.brakeGain.gain.value = 0.0001;
    this.brakeSource = this.createNoiseSource();
    this.brakeSource.connect(this.brakeFilter);
    this.brakeFilter.connect(this.brakeGain);
    this.brakeGain.connect(this.master);

    this.leftOsc.start();
    this.rightOsc.start();
    this.overtoneOsc.start();
    this.windSource.start();
    this.brakeSource.start();
  }

  private createNoiseSource(): AudioBufferSourceNode {
    if (!this.context) {
      throw new Error("Cannot create noise source before audio context exists.");
    }

    const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i += 1) {
      channel[i] = Math.random() * 2 - 1;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  private target(param: AudioParam | null | undefined, value: number, time = 0.08): void {
    if (!param || !this.context) {
      return;
    }

    param.cancelScheduledValues(this.context.currentTime);
    param.setTargetAtTime(value, this.context.currentTime, time);
  }

  private targetFrequency(node: OscillatorNode | null, value: number, time = 0.08): void {
    if (!node || !this.context) {
      return;
    }

    node.frequency.cancelScheduledValues(this.context.currentTime);
    node.frequency.setTargetAtTime(Math.max(1, value), this.context.currentTime, time);
  }

  private stopSource(node: AudioScheduledSourceNode | null): void {
    if (!node) {
      return;
    }

    try {
      node.stop();
    } catch {
      return;
    }
  }
}
