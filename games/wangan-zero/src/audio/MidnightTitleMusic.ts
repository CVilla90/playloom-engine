function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

const TEMPO = 94;
const STEP_SECONDS = 60 / TEMPO / 2;
const ROOT_NOTES = [38, 36, 41, 33] as const;
const CHORD_NOTES = [
  [50, 53, 57, 60],
  [48, 52, 55, 59],
  [53, 57, 60, 64],
  [45, 48, 52, 55]
] as const;
const LEAD_NOTES: readonly (number | null)[] = [
  74, null, 77, 81, null, 79, 77, null,
  72, null, 76, 79, 77, null, 72, 69,
  74, null, 77, 81, 84, null, 81, 79,
  77, null, 76, 72, null, 69, 72, null
];

function midiFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export class MidnightTitleMusic {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private active = false;
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
      void this.context.resume().then(() => this.syncGain(0.18));
    }
    this.syncGain(0.18);
  }

  setActive(active: boolean): void {
    this.active = active;
    this.stepIndex = 0;
    this.stepTimer = 0;
    if (active) {
      this.unlock();
    }
    this.syncGain(0.18);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.unlock();
    }
    this.syncGain(0.12);
  }

  update(dt: number): void {
    if (!this.active || !this.enabled || !this.context || this.context.state !== "running") {
      return;
    }

    this.stepTimer -= dt;
    while (this.stepTimer <= 0) {
      this.playStep(this.stepIndex);
      this.stepIndex = (this.stepIndex + 1) % LEAD_NOTES.length;
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
    const chordIndex = Math.floor(step / 8) % CHORD_NOTES.length;

    if (barStep === 0 || barStep === 8) {
      const chord = CHORD_NOTES[chordIndex] ?? CHORD_NOTES[0];
      for (let noteIndex = 0; noteIndex < chord.length; noteIndex += 1) {
        this.playTone(midiFrequency(chord[noteIndex]!), STEP_SECONDS * 8.6, 0.018, "sine", {
          attack: 0.46,
          filterHz: 1050 + noteIndex * 150,
          detune: noteIndex % 2 === 0 ? -5 : 5
        });
      }
    }

    if (barStep % 2 === 0) {
      const root = ROOT_NOTES[chordIndex] ?? ROOT_NOTES[0];
      this.playTone(midiFrequency(root), STEP_SECONDS * 1.7, 0.075, "triangle", {
        attack: 0.018,
        filterHz: 420
      });
    }

    const lead = LEAD_NOTES[step];
    if (lead !== null && lead !== undefined) {
      this.playTone(midiFrequency(lead), STEP_SECONDS * 1.45, 0.032, "triangle", {
        attack: 0.025,
        filterHz: 1850,
        delay: STEP_SECONDS * 0.06
      });
      this.playTone(midiFrequency(lead - 12), STEP_SECONDS * 1.1, 0.009, "sine", {
        attack: 0.04,
        filterHz: 1200,
        delay: STEP_SECONDS * 0.11
      });
    }

    if (barStep === 0 || barStep === 6 || barStep === 8 || barStep === 14) {
      this.playKick();
    }
    if (barStep === 4 || barStep === 12) {
      this.playSnare();
    }
    if (barStep % 2 === 1) {
      this.playNoise(0.055, 0.014, 4200);
    }
  }

  private playTone(
    frequency: number,
    duration: number,
    gain: number,
    type: OscillatorType,
    options: {
      readonly attack: number;
      readonly filterHz: number;
      readonly delay?: number;
      readonly detune?: number;
    }
  ): void {
    if (!this.context || !this.master) {
      return;
    }
    const start = this.context.currentTime + (options.delay ?? 0);
    const end = start + duration;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const amp = this.context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.detune.setValueAtTime(options.detune ?? 0, start);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(options.filterHz, start);
    filter.Q.value = 0.7;
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.linearRampToValueAtTime(gain, start + options.attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    oscillator.start(start);
    oscillator.stop(end + 0.05);
  }

  private playKick(): void {
    if (!this.context || !this.master) {
      return;
    }
    const start = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const amp = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(112, start);
    oscillator.frequency.exponentialRampToValueAtTime(42, start + 0.16);
    amp.gain.setValueAtTime(0.13, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
    oscillator.connect(amp);
    amp.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + 0.22);
  }

  private playSnare(): void {
    this.playNoise(0.16, 0.045, 1250);
    this.playTone(178, 0.11, 0.026, "triangle", {
      attack: 0.008,
      filterHz: 720
    });
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

  private syncGain(rampSeconds: number): void {
    if (!this.context || !this.master) {
      return;
    }
    const now = this.context.currentTime;
    const target = this.active && this.enabled ? 0.34 : 0.0001;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(target, now + rampSeconds);
  }
}

