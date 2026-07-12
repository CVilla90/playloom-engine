import { clamp } from "../drivingModel";

export const TUNNEL_ECHO_WET_GAIN = 0.41;

export interface RoadCarAudioState {
  readonly rpm: number;
  readonly speedKph: number;
  readonly throttle: number;
  readonly brakePressure: number;
  readonly shifting: boolean;
  readonly revLimiterActive: boolean;
  readonly elapsedSeconds: number;
  /** 0 outdoors, 1 inside a tunnel; controls the engine reflection bus. */
  readonly tunnelMix: number;
  /** Cosmetic clutch-launch tire squeal, from 0 (silent) to 1 (full). */
  readonly burnoutIntensity: number;
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

export class RoadCarAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private tunnelWetGain: GainNode | null = null;
  private intakeGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private tireGain: GainNode | null = null;
  private burnoutGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private intakeFilter: BiquadFilterNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private burnoutFilter: BiquadFilterNode | null = null;
  private engineFundamental: OscillatorNode | null = null;
  private engineHarmonic: OscillatorNode | null = null;
  private intakeSource: AudioBufferSourceNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private tireSource: AudioBufferSourceNode | null = null;
  private burnoutTone: OscillatorNode | null = null;
  private burnoutNoise: AudioBufferSourceNode | null = null;
  private initialized = false;
  private enabled = true;
  private volumeScale = 1;

  unlock(): void {
    if (!this.enabled) {
      return;
    }
    const Constructor = getAudioContextConstructor();
    if (!Constructor) {
      return;
    }
    if (!this.context) {
      this.context = new Constructor();
    }
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
    if (!this.initialized) {
      this.buildGraph();
      this.initialized = true;
    }
    this.applyEnabled();
  }

  setVolume(scale: number): void {
    this.volumeScale = Math.max(0, scale);
    this.enabled = this.volumeScale > 0;
    if (this.enabled) {
      this.unlock();
    }
    this.applyEnabled();
  }

  update(state: RoadCarAudioState): void {
    if (!this.context || !this.initialized || !this.enabled) {
      return;
    }

    const rpmRatio = clamp((state.rpm - 900) / 6900, 0, 1);
    const speedRatio = clamp(state.speedKph / 262, 0, 1);
    const firingFrequency = Math.max(32, (state.rpm / 60) * 2);
    const shiftDuck = state.shifting ? 0.28 : 1;
    const limiterWave = Math.sin(state.elapsedSeconds * 92);
    const limiterGate = state.revLimiterActive ? (limiterWave > -0.05 ? 1 : 0.08) : 1;
    const limiterPitch = state.revLimiterActive ? 1 + Math.sin(state.elapsedSeconds * 71) * 0.018 : 1;
    const responseTime = state.revLimiterActive ? 0.006 : 0.035;
    const burnout = clamp(state.burnoutIntensity, 0, 1);
    const squealFlutter = Math.sin(state.elapsedSeconds * 47) * 0.5 + 0.5;

    this.targetFrequency(this.engineFundamental, firingFrequency * limiterPitch, responseTime);
    this.targetFrequency(this.engineHarmonic, firingFrequency * 2.015 * limiterPitch, responseTime);
    this.target(this.engineGain?.gain, (0.025 + state.throttle * 0.075 + rpmRatio * 0.028) * shiftDuck * limiterGate, responseTime);
    this.target(
      this.tunnelWetGain?.gain,
      clamp(state.tunnelMix, 0, 1) * TUNNEL_ECHO_WET_GAIN,
      0.09
    );
    this.target(this.engineFilter?.frequency, 180 + rpmRatio * 1250 + state.throttle * 520, 0.045);
    this.target(this.intakeGain?.gain, state.throttle * (0.008 + rpmRatio * 0.05) * shiftDuck * limiterGate, responseTime);
    this.target(this.intakeFilter?.frequency, 420 + rpmRatio * 1900, 0.05);
    this.target(this.windGain?.gain, speedRatio * speedRatio * 0.12, 0.12);
    this.target(this.windFilter?.frequency, 520 + speedRatio * 2900, 0.12);
    this.target(this.tireGain?.gain, 0.006 + speedRatio * 0.036 + state.brakePressure * 0.018, 0.08);
    this.targetFrequency(this.burnoutTone, 720 + squealFlutter * 190, 0.018);
    this.target(this.burnoutFilter?.frequency, 980 + squealFlutter * 540, 0.022);
    this.target(this.burnoutGain?.gain, burnout * (0.105 + squealFlutter * 0.025), 0.018);
  }

  // One-shot impact thud for a collision: a fast pitch-dropping sine plus a
  // short filtered noise crunch. Respects the master volume scale (silent when
  // muted, louder when boosted). Safe to call every frame; it self-decays.
  playImpact(): void {
    if (!this.context || !this.initialized || !this.enabled || !this.master) {
      return;
    }
    const now = this.context.currentTime;

    const thud = this.context.createOscillator();
    thud.type = "sine";
    thud.frequency.setValueAtTime(150, now);
    thud.frequency.exponentialRampToValueAtTime(46, now + 0.22);
    const thudGain = this.context.createGain();
    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.exponentialRampToValueAtTime(0.6 * this.volumeScale, now + 0.012);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    thud.connect(thudGain);
    thudGain.connect(this.master);
    thud.start(now);
    thud.stop(now + 0.36);

    const crunch = this.createNoiseSource();
    const crunchFilter = this.context.createBiquadFilter();
    crunchFilter.type = "lowpass";
    crunchFilter.frequency.value = 900;
    const crunchGain = this.context.createGain();
    crunchGain.gain.setValueAtTime(0.5 * this.volumeScale, now);
    crunchGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    crunch.connect(crunchFilter);
    crunchFilter.connect(crunchGain);
    crunchGain.connect(this.master);
    crunch.start(now);
    crunch.stop(now + 0.2);
  }

  shutdown(): void {
    for (const source of [
      this.engineFundamental,
      this.engineHarmonic,
      this.intakeSource,
      this.windSource,
      this.tireSource,
      this.burnoutTone,
      this.burnoutNoise
    ]) {
      try {
        source?.stop();
      } catch {
        // The source may already be stopped.
      }
    }
    this.engineFundamental = null;
    this.engineHarmonic = null;
    this.intakeSource = null;
    this.windSource = null;
    this.tireSource = null;
    this.burnoutTone = null;
    this.burnoutNoise = null;
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

    this.engineFilter = this.context.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.Q.value = 1.6;
    this.engineGain = this.context.createGain();
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);

    // A short filtered feedback reflection gives the engine a restrained tunnel
    // echo. The wet gain stays at zero outdoors and eases in only after the car
    // crosses the portal; the dry engine remains untouched and responsive.
    const tunnelDelay = this.context.createDelay(0.5);
    const tunnelFeedback = this.context.createGain();
    const tunnelFilter = this.context.createBiquadFilter();
    this.tunnelWetGain = this.context.createGain();
    tunnelDelay.delayTime.value = 0.115;
    tunnelFeedback.gain.value = 0.23;
    tunnelFilter.type = "lowpass";
    tunnelFilter.frequency.value = 1850;
    tunnelFilter.Q.value = 0.7;
    this.tunnelWetGain.gain.value = 0;
    this.engineGain.connect(tunnelDelay);
    tunnelDelay.connect(tunnelFilter);
    tunnelFilter.connect(this.tunnelWetGain);
    this.tunnelWetGain.connect(this.master);
    tunnelFilter.connect(tunnelFeedback);
    tunnelFeedback.connect(tunnelDelay);

    this.engineFundamental = this.context.createOscillator();
    this.engineFundamental.type = "sawtooth";
    this.engineFundamental.connect(this.engineFilter);
    this.engineHarmonic = this.context.createOscillator();
    this.engineHarmonic.type = "triangle";
    const harmonicGain = this.context.createGain();
    harmonicGain.gain.value = 0.24;
    this.engineHarmonic.connect(harmonicGain);
    harmonicGain.connect(this.engineFilter);

    this.intakeFilter = this.context.createBiquadFilter();
    this.intakeFilter.type = "bandpass";
    this.intakeFilter.Q.value = 0.8;
    this.intakeGain = this.context.createGain();
    this.intakeSource = this.createNoiseSource();
    this.intakeSource.connect(this.intakeFilter);
    this.intakeFilter.connect(this.intakeGain);
    this.intakeGain.connect(this.master);

    this.windFilter = this.context.createBiquadFilter();
    this.windFilter.type = "highpass";
    this.windGain = this.context.createGain();
    this.windSource = this.createNoiseSource();
    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    const tireFilter = this.context.createBiquadFilter();
    tireFilter.type = "bandpass";
    tireFilter.frequency.value = 115;
    tireFilter.Q.value = 0.7;
    this.tireGain = this.context.createGain();
    this.tireSource = this.createNoiseSource();
    this.tireSource.connect(tireFilter);
    tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.master);

    // A narrow, fluttering tone mixed with filtered friction noise reads as a
    // brief tire squeal without requiring an external sample asset.
    this.burnoutFilter = this.context.createBiquadFilter();
    this.burnoutFilter.type = "bandpass";
    this.burnoutFilter.frequency.value = 1180;
    this.burnoutFilter.Q.value = 3.2;
    this.burnoutGain = this.context.createGain();
    this.burnoutGain.gain.value = 0;
    this.burnoutTone = this.context.createOscillator();
    this.burnoutTone.type = "sawtooth";
    const burnoutToneGain = this.context.createGain();
    burnoutToneGain.gain.value = 0.16;
    this.burnoutNoise = this.createNoiseSource();
    this.burnoutTone.connect(burnoutToneGain);
    burnoutToneGain.connect(this.burnoutFilter);
    this.burnoutNoise.connect(this.burnoutFilter);
    this.burnoutFilter.connect(this.burnoutGain);
    this.burnoutGain.connect(this.master);
    this.engineFundamental.start();
    this.engineHarmonic.start();
    this.intakeSource.start();
    this.windSource.start();
    this.tireSource.start();
    this.burnoutTone.start();
    this.burnoutNoise.start();
  }

  private createNoiseSource(): AudioBufferSourceNode {
    if (!this.context) {
      throw new Error("Audio context must exist before creating noise.");
    }
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  private applyEnabled(): void {
    if (!this.master || !this.context) {
      return;
    }
    this.target(this.master.gain, this.enabled ? 0.72 * this.volumeScale : 0.0001, 0.06);
  }

  private target(param: AudioParam | null | undefined, value: number, time: number): void {
    if (!param || !this.context) {
      return;
    }
    param.cancelScheduledValues(this.context.currentTime);
    param.setTargetAtTime(value, this.context.currentTime, time);
  }

  private targetFrequency(node: OscillatorNode | null, value: number, time = 0.035): void {
    if (!node || !this.context) {
      return;
    }
    this.target(node.frequency, Math.max(1, value), time);
  }
}
