function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

const TEMPO = 132;
const STEP_SECONDS = 60 / TEMPO / 2;
const RIFF: readonly (number | null)[] = [
  38, 38, null, 41, 38, 45, 43, null,
  38, 38, 50, 48, 45, 43, 41, null,
  36, 36, null, 41, 43, 41, 38, null,
  33, 33, 36, 38, 41, 38, 36, null
];
const LEAD: readonly (number | null)[] = [
  null, 74, null, null, 77, null, 81, null,
  null, 74, 77, null, 84, 81, 77, null,
  null, 72, null, 76, null, 79, 77, null,
  69, null, 72, 74, null, 77, 76, null
];

function midiFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export class MidnightActionTitleMusic {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private active = false;
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
      this.noiseBuffer = this.createNoiseBuffer();
    }
    if (this.context.state === "suspended") {
      void this.context.resume().then(() => this.syncGain(0.12));
    }
    this.syncGain(0.12);
  }

  setActive(active: boolean): void {
    this.active = active;
    this.stepIndex = 0;
    this.stepTimer = 0;
    if (active) {
      this.unlock();
    }
    this.syncGain(0.14);
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
    this.stepTimer -= dt;
    while (this.stepTimer <= 0) {
      this.playStep(this.stepIndex);
      this.stepIndex = (this.stepIndex + 1) % RIFF.length;
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
    this.noiseBuffer = null;
    void context.close().catch(() => {});
  }

  private playStep(step: number): void {
    const barStep = step % 16;
    const riffNote = RIFF[step];
    if (riffNote !== null && riffNote !== undefined) {
      const accent = barStep === 0 || barStep === 8 ? 1.3 : 1;
      this.playGuitar(midiFrequency(riffNote), STEP_SECONDS * 1.65, 0.036 * accent);
      this.playBass(midiFrequency(riffNote - 12), STEP_SECONDS * 1.25, 0.09 * accent);
    }

    const leadNote = LEAD[step];
    if (leadNote !== null && leadNote !== undefined) {
      this.playLead(midiFrequency(leadNote), STEP_SECONDS * 1.7);
    }

    if (barStep === 0 || barStep === 3 || barStep === 8 || barStep === 10 || barStep === 14) {
      this.playKick();
    }
    if (barStep === 4 || barStep === 12) {
      this.playSnare();
    }
    this.playHat(barStep % 4 === 2 ? 0.022 : 0.011);
  }

  private playGuitar(frequency: number, duration: number, gain: number): void {
    if (!this.context || !this.master) {
      return;
    }
    const start = this.context.currentTime;
    const end = start + duration;
    const amp = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const distortion = this.context.createWaveShaper();
    const root = this.context.createOscillator();
    const fifth = this.context.createOscillator();
    const fifthGain = this.context.createGain();

    root.type = "sawtooth";
    fifth.type = "square";
    root.frequency.setValueAtTime(frequency, start);
    fifth.frequency.setValueAtTime(frequency * 1.5, start);
    fifthGain.gain.value = 0.28;
    distortion.curve = this.createDistortionCurve(34);
    distortion.oversample = "2x";
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1750, start);
    filter.frequency.exponentialRampToValueAtTime(720, end);
    filter.Q.value = 0.9;
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.linearRampToValueAtTime(gain, start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    root.connect(distortion);
    fifth.connect(fifthGain);
    fifthGain.connect(distortion);
    distortion.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    root.start(start);
    fifth.start(start);
    root.stop(end + 0.03);
    fifth.stop(end + 0.03);
  }

  private playBass(frequency: number, duration: number, gain: number): void {
    if (!this.context || !this.master) {
      return;
    }
    const start = this.context.currentTime;
    const end = start + duration;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const amp = this.context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(frequency, start);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(330, start);
    filter.Q.value = 1.4;
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.linearRampToValueAtTime(gain, start + 0.014);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    oscillator.start(start);
    oscillator.stop(end + 0.03);
  }

  private playLead(frequency: number, duration: number): void {
    if (!this.context || !this.master) {
      return;
    }
    const start = this.context.currentTime;
    const end = start + duration;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const amp = this.context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.detune.setValueAtTime(-7, start);
    oscillator.detune.linearRampToValueAtTime(7, end);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1450, start);
    filter.Q.value = 2.1;
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.linearRampToValueAtTime(0.021, start + 0.025);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    oscillator.start(start);
    oscillator.stop(end + 0.03);
  }

  private playKick(): void {
    if (!this.context || !this.master) {
      return;
    }
    const start = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const amp = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(138, start);
    oscillator.frequency.exponentialRampToValueAtTime(44, start + 0.14);
    amp.gain.setValueAtTime(0.18, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    oscillator.connect(amp);
    amp.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + 0.2);
  }

  private playSnare(): void {
    this.playNoise(0.17, 0.062, 980);
    if (!this.context || !this.master) {
      return;
    }
    const start = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const amp = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = 186;
    amp.gain.setValueAtTime(0.035, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    oscillator.connect(amp);
    amp.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + 0.14);
  }

  private playHat(gain: number): void {
    this.playNoise(0.045, gain, 5200);
  }

  private playNoise(duration: number, gain: number, highpassHz: number): void {
    if (!this.context || !this.master || !this.noiseBuffer) {
      return;
    }
    const start = this.context.currentTime;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const amp = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = highpassHz;
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  private createNoiseBuffer(): AudioBuffer | null {
    if (!this.context) {
      return null;
    }
    const buffer = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private createDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const samples = 1024;
    const curve = new Float32Array(samples);
    for (let index = 0; index < samples; index += 1) {
      const x = (index * 2) / samples - 1;
      curve[index] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  private syncGain(rampSeconds: number): void {
    if (!this.context || !this.master) {
      return;
    }
    const now = this.context.currentTime;
    const target = this.active && this.enabled ? 0.3 * this.volumeScale : 0.0001;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(target, now + rampSeconds);
  }
}

