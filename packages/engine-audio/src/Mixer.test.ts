import { describe, expect, it } from "vitest";
import { AudioMixer } from "./Mixer";

describe("AudioMixer", () => {
  it("combines master and bus volume to gain", () => {
    const mixer = new AudioMixer();
    mixer.setVolume("master", 0.5);
    mixer.setVolume("music", 0.4);
    expect(mixer.gain("music")).toBeCloseTo(0.2);
  });

  it("mutes when master or bus is muted", () => {
    const mixer = new AudioMixer();
    mixer.setMuted("sfx", true);
    expect(mixer.gain("sfx")).toBe(0);
    mixer.setMuted("sfx", false);
    mixer.setMuted("master", true);
    expect(mixer.gain("sfx")).toBe(0);
  });

  it("applies effective volume to audio-like targets", () => {
    const mixer = new AudioMixer();
    mixer.setVolume("master", 0.5);
    mixer.setVolume("sfx", 0.8);
    const target = { volume: 1, muted: false };
    mixer.apply(target, "sfx", 0.75);
    expect(target.volume).toBeCloseTo(0.3);
    expect(target.muted).toBe(false);
  });
});
