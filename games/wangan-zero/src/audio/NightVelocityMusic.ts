function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/** Original 148 BPM euro-trance / Japanese-rock driving theme. */
export const NIGHT_VELOCITY_TEMPO = 148;
export const NIGHT_VELOCITY_STEPS = 64;

const STEP_SECONDS = 60 / NIGHT_VELOCITY_TEMPO / 4;
const ROOTS = [42, 38, 45, 40] as const; // F# minor -> D -> A -> E
const LEAD: readonly (number | null)[] = [
  78, null, 81, 85, null, 81, 78, 76,
  74, null, 76, 78, 81, null, 78, null,
  81, null, 85, 86, null, 85, 81, 78,
  76, 78, 81, null, 78, 76, 74, null,
  78, 81, 85, null, 88, 85, 81, null,
  74, 76, 78, 81, null, 78, 76, null,
  81, 85, 86, null, 90, 88, 85, 81,
  78, null, 76, 74, 73, 74, 76, null
];

function midiFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export class NightVelocityMusic {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private leadEchoInput: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private active = false;
  private enabled = true;
  private volumeScale = 1;
  private stepIndex = 0;
  private stepTimer = 0;

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
      this.master = this.context.createGain();
      this.master.gain.value = 0.0001;
      this.master.connect(this.context.destination);
      this.musicBus = this.context.createGain();
      this.musicBus.gain.value = 0.82;
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.008;
      compressor.release.value = 0.16;
      this.musicBus.connect(compressor);
      compressor.connect(this.master);
      this.leadEchoInput = this.context.createGain();
      const leadDelay = this.context.createDelay(0.5);
      const leadFeedback = this.context.createGain();
      const leadEchoOut = this.context.createGain();
      leadDelay.delayTime.value = STEP_SECONDS * 2;
      leadFeedback.gain.value = 0.16;
      leadEchoOut.gain.value = 0.18;
      this.leadEchoInput.connect(leadDelay);
      leadDelay.connect(leadEchoOut);
      leadEchoOut.connect(this.musicBus);
      leadDelay.connect(leadFeedback);
      leadFeedback.connect(leadDelay);
      this.noiseBuffer = this.createNoiseBuffer();
    }
    if (this.context.state === "suspended") {
      void this.context.resume().then(() => this.syncGain(0.14));
    }
    this.syncGain(0.14);
  }

  setActive(active: boolean): void {
    this.active = active;
    this.stepIndex = 0;
    this.stepTimer = 0;
    if (active) {
      this.unlock();
    }
    this.syncGain(0.16);
  }

  setVolume(scale: number): void {
    this.volumeScale = Math.max(0, scale);
    this.enabled = this.volumeScale > 0;
    if (this.enabled) {
      this.unlock();
    }
    this.syncGain(0.08);
  }

  update(dt: number): void {
    if (!this.active || !this.enabled || !this.context || this.context.state !== "running") {
      return;
    }
    this.stepTimer -= Math.max(0, Math.min(dt, 0.1));
    while (this.stepTimer <= 0) {
      this.playStep(this.stepIndex);
      this.stepIndex = (this.stepIndex + 1) % NIGHT_VELOCITY_STEPS;
      this.stepTimer += STEP_SECONDS;
    }
  }

  shutdown(): void {
    if (!this.context) {
      return;
    }
    const context = this.context;
    this.context = null;
    this.master = null;
    this.musicBus = null;
    this.leadEchoInput = null;
    this.noiseBuffer = null;
    void context.close().catch(() => {});
  }

  private playStep(step: number): void {
    const barStep = step % 16;
    const root = ROOTS[Math.floor(step / 16)]!;

    // Four-on-the-floor kick, rock backbeat, and a bright offbeat trance hat.
    if (barStep % 4 === 0) {
      this.playKick(barStep === 0 ? 0.25 : 0.21);
    }
    if (barStep === 4 || barStep === 12) {
      this.playSnare();
    }
    if (barStep % 2 === 0) {
      this.playHat(barStep % 4 === 2 ? 0.038 : 0.017, barStep % 4 === 2 ? 0.11 : 0.045);
    }

    // Syncopated octave bass drives between the kicks.
    if (barStep % 4 === 2 || barStep === 7 || barStep === 15) {
      const octave = barStep === 15 ? 12 : 0;
      this.playBass(midiFrequency(root + octave), STEP_SECONDS * 1.75, barStep === 2 ? 0.12 : 0.095);
    }

    // Muted power-chord attacks provide the Japanese-rock edge.
    if (barStep === 0 || barStep === 6 || barStep === 8 || barStep === 14) {
      this.playPowerChord(root + 12, STEP_SECONDS * (barStep === 0 ? 3.2 : 1.7));
    }

    // The lead opens up after the first bar and resolves every four bars.
    const leadNote = LEAD[step];
    if (step >= 8 && leadNote !== null && leadNote !== undefined) {
      this.playLead(midiFrequency(leadNote), STEP_SECONDS * (barStep % 4 === 0 ? 2.6 : 1.55));
    }
  }

  private playKick(gain: number): void {
    if (!this.context || !this.musicBus) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const amp = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(164, now);
    oscillator.frequency.exponentialRampToValueAtTime(47, now + 0.13);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    oscillator.connect(amp);
    amp.connect(this.musicBus);
    oscillator.start(now);
    oscillator.stop(now + 0.22);
  }

  private playSnare(): void {
    this.playNoise(0.18, 0.09, 1000);
    if (!this.context || !this.musicBus) return;
    const now = this.context.currentTime;
    const body = this.context.createOscillator();
    const amp = this.context.createGain();
    body.type = "triangle";
    body.frequency.value = 188;
    amp.gain.setValueAtTime(0.052, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    body.connect(amp);
    amp.connect(this.musicBus);
    body.start(now);
    body.stop(now + 0.15);
  }

  private playHat(gain: number, duration: number): void {
    this.playNoise(duration, gain, 5700);
  }

  private playBass(frequency: number, duration: number, gain: number): void {
    if (!this.context || !this.musicBus) return;
    const now = this.context.currentTime;
    const end = now + duration;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const amp = this.context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = frequency;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(540, now);
    filter.frequency.exponentialRampToValueAtTime(145, end);
    filter.Q.value = 3.2;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(gain, now + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(filter);
    filter.connect(amp);
    amp.connect(this.musicBus);
    oscillator.start(now);
    oscillator.stop(end + 0.03);
  }

  private playPowerChord(rootNote: number, duration: number): void {
    if (!this.context || !this.musicBus) return;
    const now = this.context.currentTime;
    const end = now + duration;
    const filter = this.context.createBiquadFilter();
    const distortion = this.context.createWaveShaper();
    const amp = this.context.createGain();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2250, now);
    filter.frequency.exponentialRampToValueAtTime(620, end);
    distortion.curve = this.createDistortionCurve(22);
    distortion.oversample = "2x";
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(0.035, now + 0.009);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    distortion.connect(filter);
    filter.connect(amp);
    amp.connect(this.musicBus);
    for (const interval of [0, 7, 12]) {
      const oscillator = this.context.createOscillator();
      oscillator.type = interval === 7 ? "square" : "sawtooth";
      oscillator.frequency.value = midiFrequency(rootNote + interval);
      oscillator.detune.value = interval === 12 ? 5 : interval === 0 ? -5 : 0;
      oscillator.connect(distortion);
      oscillator.start(now);
      oscillator.stop(end + 0.03);
    }
  }

  private playLead(frequency: number, duration: number): void {
    if (!this.context || !this.musicBus) return;
    const now = this.context.currentTime;
    const end = now + duration;
    const filter = this.context.createBiquadFilter();
    const amp = this.context.createGain();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 1.05;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(0.026, now + 0.018);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    filter.connect(amp);
    amp.connect(this.musicBus);
    if (this.leadEchoInput) {
      amp.connect(this.leadEchoInput);
    }
    for (const detune of [-9, 9]) {
      const oscillator = this.context.createOscillator();
      oscillator.type = "sawtooth";
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      oscillator.connect(filter);
      oscillator.start(now);
      oscillator.stop(end + 0.03);
    }
  }

  private playNoise(duration: number, gain: number, highpassHz: number): void {
    if (!this.context || !this.musicBus || !this.noiseBuffer) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const amp = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = highpassHz;
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.musicBus);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  private createNoiseBuffer(): AudioBuffer | null {
    if (!this.context) return null;
    const buffer = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private createDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const curve = new Float32Array(1024);
    for (let index = 0; index < curve.length; index += 1) {
      const x = (index * 2) / curve.length - 1;
      curve[index] = ((3 + amount) * x * 20 * (Math.PI / 180)) /
        (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  private syncGain(rampSeconds: number): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const target = this.active && this.enabled ? 0.22 * this.volumeScale : 0.0001;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(target, now + rampSeconds);
  }
}
