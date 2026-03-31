import { describe, expect, it } from "vitest";
import { deriveCockpitAudioProfile } from "./CockpitAudio";

describe("cockpit audio profile", () => {
  it("deepens and brightens as throttle and speed rise", () => {
    const idle = deriveCockpitAudioProfile({
      throttle: 0,
      ssi: 0,
      strain: 0,
      accelerating: false,
      braking: false
    });
    const fast = deriveCockpitAudioProfile({
      throttle: 90,
      ssi: 300,
      strain: 72,
      accelerating: true,
      braking: false
    });

    expect(fast.bodyFreq).toBeGreaterThan(idle.bodyFreq);
    expect(fast.overtoneGain).toBeGreaterThan(idle.overtoneGain);
    expect(fast.windGain).toBeGreaterThan(idle.windGain);
    expect(fast.stereoSpread).toBeGreaterThan(idle.stereoSpread);
  });

  it("pushes a stronger brake layer only while braking", () => {
    const coasting = deriveCockpitAudioProfile({
      throttle: 50,
      ssi: 180,
      strain: 45,
      accelerating: false,
      braking: false
    });
    const braking = deriveCockpitAudioProfile({
      throttle: 50,
      ssi: 180,
      strain: 45,
      accelerating: false,
      braking: true
    });

    expect(braking.brakeGain).toBeGreaterThan(coasting.brakeGain);
    expect(braking.brakeFilter).toBeGreaterThan(coasting.brakeFilter);
  });
});
