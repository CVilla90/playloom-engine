function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

const ROOT_SEQUENCE = [73.42, 82.41, 65.41, 98.0] as const;
const LEAD_SEQUENCE = [220, 246.94, 293.66, 329.63, 293.66, 246.94, 196.0, 164.81] as const;
const CHORD_INTERVALS = [1, 1.25, 1.5] as const;
const ACTIVE_GAIN = 0.28;

export class VoidCreditsMusic {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private active = false;
  private volume = 1;
  private stepIndex = 0;
  private stepTimer = 0;

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
      this.master = this.context.createGain();
      this.master.gain.value = 0.0001;
      this.master.connect(this.context.destination);
    }

    if (this.context.state === "suspended") {
      void this.context.resume();
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.syncMasterGain(0.12);
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, volume);
    this.syncMasterGain(0.12);
  }

  setActive(active: boolean): void {
    this.active = active;
    this.stepTimer = 0;
    this.stepIndex = 0;
    if (active) {
      this.unlock();
    }
    this.syncMasterGain(0.16);
  }

  update(dt: number): void {
    if (!this.enabled || !this.active) {
      return;
    }

    this.unlock();
    if (!this.context || !this.master) {
      return;
    }

    this.stepTimer -= dt;
    while (this.stepTimer <= 0) {
      this.playStep();
      this.stepTimer += 0.56;
      this.stepIndex = (this.stepIndex + 1) % LEAD_SEQUENCE.length;
    }
  }

  shutdown(): void {
    if (this.context) {
      const context = this.context;
      this.context = null;
      this.master = null;
      void context.close().catch(() => {});
    }
  }

  private playStep(): void {
    if (!this.context || !this.master) {
      return;
    }

    const root = ROOT_SEQUENCE[Math.floor(this.stepIndex / 2) % ROOT_SEQUENCE.length] ?? ROOT_SEQUENCE[0];
    const lead = LEAD_SEQUENCE[this.stepIndex] ?? LEAD_SEQUENCE[0];
    const airyLead = lead * (this.stepIndex % 2 === 0 ? 1 : 0.5);

    this.playTone(root, 0.88, 0.05, "triangle");
    this.playTone(root * 2, 0.64, 0.02, "sine", 0.04);
    if (this.stepIndex % 2 === 0) {
      for (let i = 0; i < CHORD_INTERVALS.length; i += 1) {
        this.playTone(lead * CHORD_INTERVALS[i]!, 0.42 + i * 0.06, 0.018 - i * 0.003, "sine", i * 0.03);
      }
    } else {
      this.playTone(airyLead, 0.34, 0.024, "sine");
      this.playTone(airyLead * 1.5, 0.28, 0.012, "triangle", 0.05);
    }
  }

  private playTone(
    frequency: number,
    duration: number,
    gain: number,
    type: OscillatorType,
    delay = 0
  ): void {
    if (!this.context || !this.master) {
      return;
    }

    const start = this.context.currentTime + delay;
    const end = start + duration;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const amp = this.context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(type === "triangle" ? 900 : 1600, start);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.linearRampToValueAtTime(gain, start + 0.04);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);

    oscillator.start(start);
    oscillator.stop(end + 0.04);
  }

  private currentMasterGain(): number {
    return this.active && this.enabled ? Math.max(0.0001, ACTIVE_GAIN * this.volume) : 0.0001;
  }

  private syncMasterGain(rampDuration: number): void {
    if (!this.master) {
      return;
    }

    const now = this.context?.currentTime ?? 0;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(this.currentMasterGain(), now + rampDuration);
  }
}
