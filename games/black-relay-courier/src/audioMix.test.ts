import { describe, expect, it } from "vitest";
import { cycleAudioMixMode, getAudioMixProfile, setAudioMixMode } from "./audioMix";

describe("audio mix cycling", () => {
  it("cycles mid to max to mute and back to mid", () => {
    setAudioMixMode("mid");

    expect(cycleAudioMixMode()).toBe("max");
    expect(cycleAudioMixMode()).toBe("mute");
    expect(cycleAudioMixMode()).toBe("mid");
  });

  it("keeps mute silent and max louder than default soundtrack", () => {
    const mid = getAudioMixProfile("mid");
    const max = getAudioMixProfile("max");
    const mute = getAudioMixProfile("mute");

    expect(max.soundtrack).toBeGreaterThan(mid.soundtrack);
    expect(mute.audible).toBe(false);
    expect(mute.soundtrack).toBe(0);
  });
});
