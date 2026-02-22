function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

export class SynthAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  unlock(): void {
    if (!this.enabled || this.context) return;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;
    this.context = new Ctor();
    this.master = this.context.createGain();
    this.master.gain.value = 0.25;
    this.master.connect(this.context.destination);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  beep(freq = 440, duration = 0.07, type: OscillatorType = "square"): void {
    this.playTone(freq, duration, 0.12, type);
  }

  impact(): void {
    this.playTone(90, 0.18, 0.16, "triangle");
  }

  whoosh(): void {
    this.playSweep(560, 180, 0.22);
  }

  gameOver(): void {
    this.playSweep(240, 70, 0.62);
  }

  repair(): void {
    this.playTone(640, 0.05, 0.09, "sine");
    this.playTone(760, 0.06, 0.06, "sine", 0.04);
  }

  private playTone(freq: number, duration: number, gain: number, type: OscillatorType, delay = 0): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.context || !this.master) return;

    const start = this.context.currentTime + delay;
    const end = start + duration;

    const osc = this.context.createOscillator();
    const amp = this.context.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(amp);
    amp.connect(this.master);

    osc.start(start);
    osc.stop(end + 0.02);
  }

  private playSweep(startFreq: number, endFreq: number, duration: number): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.context || !this.master) return;

    const start = this.context.currentTime;
    const end = start + duration;

    const osc = this.context.createOscillator();
    const amp = this.context.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(startFreq, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), end);

    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(amp);
    amp.connect(this.master);

    osc.start(start);
    osc.stop(end + 0.02);
  }
}
