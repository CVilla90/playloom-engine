#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const gameRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputRoot = join(gameRoot, "assets", "generated", "audio");
const sampleRate = 44100;

function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

function smoothstep01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function envelope(time, duration, attack, release) {
  const attackGain = attack <= 0 ? 1 : Math.min(1, time / attack);
  const releaseGain = release <= 0 ? 1 : Math.min(1, Math.max(0, duration - time) / release);
  return attackGain * releaseGain;
}

function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function fract(value) {
  return value - Math.floor(value);
}

function createNoise(seed) {
  return (time) => {
    const value = Math.sin(time * (437.58 + seed * 13.11)) * 43758.5453123;
    return fract(value) * 2 - 1;
  };
}

function createBuffer(durationSec, sampler) {
  const count = Math.max(1, Math.floor(durationSec * sampleRate));
  const data = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const time = i / sampleRate;
    data[i] = clampSample(sampler(time, i, count));
  }
  return data;
}

function createAmbientHumClip(duration, seed, ballastBase, ballastDriftHz, swellRate) {
  const noiseA = createNoise(1.7 + seed);
  const noiseB = createNoise(3.1 + seed * 0.83);
  const attack = Math.min(0.8, duration * 0.18);
  const release = Math.min(1.1, duration * 0.24);

  return createBuffer(duration, (time) => {
    const env = envelope(time, duration, attack, release);
    const drift = Math.sin(2 * Math.PI * ballastDriftHz * time + seed * 0.9);
    const breath = 0.88 + 0.12 * Math.sin(2 * Math.PI * swellRate * time - seed * 0.6);
    const flickerPulse = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * (0.18 + seed * 0.01) * time + 0.8), 7);

    const hum60 = Math.sin(2 * Math.PI * (60 + drift * 0.2) * time + seed * 0.2);
    const hum120 = Math.sin(2 * Math.PI * (120 + drift * 0.35) * time + 0.25 + seed * 0.1);
    const ballast = Math.sin(2 * Math.PI * (ballastBase + drift * 4.5) * time + 0.6);
    const lowRing = Math.sin(2 * Math.PI * (ballastBase * 0.58 + drift * 2.2) * time + 1.2);
    const sputter = (noiseA(time * (10 + seed * 0.6)) * 0.012 + noiseB(time * (16 + seed * 0.8)) * 0.01) * (0.22 + flickerPulse * 0.55);

    return (
      (
        hum60 * 0.15 +
        hum120 * 0.24 +
        ballast * 0.13 +
        lowRing * 0.07 +
        sputter
      ) *
      breath *
      env *
      0.76
    );
  });
}

function createStep() {
  const duration = 0.22;
  const noise = createNoise(7.2);

  return createBuffer(duration, (time) => {
    const env = envelope(time, duration, 0.002, 0.16);
    const thump = Math.sin(2 * Math.PI * (78 - time * 46) * time) * Math.exp(-time * 15);
    const rasp = noise(time * 42) * Math.exp(-time * 11);
    const click = Math.sin(2 * Math.PI * 970 * time) * Math.exp(-time * 44);
    return (thump * 0.66 + rasp * 0.17 + click * 0.07) * env * 0.78;
  });
}

function createRelayPickup() {
  const duration = 1.05;
  const noise = createNoise(11.4);

  return createBuffer(duration, (time) => {
    const env = envelope(time, duration, 0.01, 0.42);
    const rise = time / duration;
    const bellA = Math.sin(2 * Math.PI * (midiToHz(67) + rise * 40) * time);
    const bellB = Math.sin(2 * Math.PI * (midiToHz(74) + rise * 55) * time + 0.8);
    const glass = Math.sin(2 * Math.PI * (midiToHz(86) + rise * 80) * time + 1.2);
    const tail = noise(time * 10) * Math.exp(-time * 4.2) * 0.08;
    const wobble = 1 + Math.sin(time * 12.4) * 0.018;
    return ((bellA * 0.28 + bellB * 0.22 + glass * 0.1) * wobble + tail) * env * 0.72;
  });
}

function createBreakerToggle() {
  const duration = 1.25;
  const noise = createNoise(18.1);

  return createBuffer(duration, (time) => {
    const env = envelope(time, duration, 0.001, 0.5);
    const impact = Math.sin(2 * Math.PI * (62 - time * 20) * time) * Math.exp(-time * 7);
    const knock = Math.sin(2 * Math.PI * (126 - time * 18) * time + 0.4) * Math.exp(-time * 10);
    const crackle = noise(time * 68) * Math.exp(-time * 3.6) * 0.18;
    const buzz = Math.sin(2 * Math.PI * 118 * time) * Math.sin(2 * Math.PI * 1220 * time) * Math.exp(-time * 2.2) * 0.16;
    const tail = Math.sin(2 * Math.PI * 241 * time + 1.1) * Math.exp(-time * 4.4) * 0.09;
    return (impact * 0.72 + knock * 0.34 + crackle + buzz + tail) * env * 0.74;
  });
}

function createPunchSwing() {
  const duration = 0.16;
  const noise = createNoise(22.4);

  return createBuffer(duration, (time) => {
    const env = envelope(time, duration, 0.001, 0.09);
    const whoosh = noise(time * 30) * Math.exp(-time * 12) * 0.26;
    const snap = Math.sin(2 * Math.PI * (320 - time * 120) * time) * Math.exp(-time * 18) * 0.18;
    const air = Math.sin(2 * Math.PI * 980 * time) * Math.exp(-time * 34) * 0.04;
    return (whoosh + snap + air) * env * 0.78;
  });
}

function createPunchImpact() {
  const duration = 0.22;
  const noise = createNoise(26.7);

  return createBuffer(duration, (time) => {
    const env = envelope(time, duration, 0.001, 0.12);
    const thud = Math.sin(2 * Math.PI * (84 - time * 34) * time) * Math.exp(-time * 11) * 0.72;
    const slap = Math.sin(2 * Math.PI * 420 * time) * Math.exp(-time * 24) * 0.12;
    const cloth = noise(time * 18) * Math.exp(-time * 15) * 0.14;
    return (thud + slap + cloth) * env * 0.84;
  });
}

function createStalkerStep() {
  const duration = 0.34;
  const noise = createNoise(23.6);

  return createBuffer(duration, (time) => {
    const env = envelope(time, duration, 0.003, 0.21);
    const wood = Math.sin(2 * Math.PI * (46 - time * 16) * time) * Math.exp(-time * 8.4);
    const scrape = noise(time * 34) * Math.exp(-time * 6.6) * 0.24;
    const click = Math.sin(2 * Math.PI * 1420 * time) * Math.exp(-time * 26) * 0.08;
    return (wood * 0.78 + scrape + click) * env * 0.74;
  });
}

function createStalkerGrowl() {
  const duration = 3;
  const noise = createNoise(37.8);

  return createBuffer(duration, (time) => {
    const phase = time / duration;
    const loopEnvelope = Math.sin(Math.PI * phase) ** 0.88;
    const lfoA = Math.sin(phase * Math.PI * 2 * 1.4);
    const lfoB = Math.sin(phase * Math.PI * 2 * 2.2 + 0.8);
    const baseFreq = 58 + lfoA * 5 + lfoB * 3;
    const chest = Math.sin(2 * Math.PI * baseFreq * time + Math.sin(phase * Math.PI * 2 * 2.5) * 0.22);
    const throat = Math.sin(2 * Math.PI * (baseFreq * 1.48) * time + 1.4) * 0.36;
    const rumble = Math.sin(2 * Math.PI * (baseFreq * 0.5) * time + 0.5) * 0.2;
    const bark = Math.sin(2 * Math.PI * (baseFreq * 2.08) * time + 0.8) * 0.14;
    const grit = noise(time * 13) * (0.07 + (0.5 + 0.5 * lfoA) * 0.04);
    return (chest * 0.46 + throat + rumble + bark + grit) * loopEnvelope * 0.68;
  });
}

function createStalkerGrowl02() {
  const duration = 3.4;
  const noise = createNoise(42.6);

  return createBuffer(duration, (time) => {
    const phase = time / duration;
    const loopEnvelope = Math.sin(Math.PI * phase) ** 0.9;
    const lfoA = Math.sin(phase * Math.PI * 2 * 1.1);
    const lfoB = Math.sin(phase * Math.PI * 2 * 1.9 + 1.3);
    const baseFreq = 52 + lfoA * 4 + lfoB * 2.5;
    const chest = Math.sin(2 * Math.PI * baseFreq * time + Math.sin(phase * Math.PI * 2 * 2) * 0.18);
    const throat = Math.sin(2 * Math.PI * (baseFreq * 1.42) * time + 1.2) * 0.34;
    const rumble = Math.sin(2 * Math.PI * (baseFreq * 0.48) * time + 0.4) * 0.24;
    const snarl = Math.sin(2 * Math.PI * (baseFreq * 2.18) * time + 0.9) * 0.11;
    const bark = Math.sin(2 * Math.PI * (baseFreq * 2.92) * time + 1.5) * 0.07;
    const grit = noise(time * 11.5) * (0.066 + (0.5 + 0.5 * lfoA) * 0.036);
    return (chest * 0.52 + throat + rumble + snarl + bark + grit) * loopEnvelope * 0.72;
  });
}

function encodeWav(samples) {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  function writeAscii(offset, text) {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(offset, Math.round(clampSample(samples[i]) * 32767), true);
    offset += 2;
  }

  return Buffer.from(buffer);
}

async function writeAudioFile(filename, samples) {
  const path = join(outputRoot, filename);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, encodeWav(samples));
  return path;
}

async function main() {
  const outputs = [
    ["backrooms-office-hum-01.wav", createAmbientHumClip(3.8, 1.2, 186, 0.11, 0.14)],
    ["backrooms-office-hum-02.wav", createAmbientHumClip(6.4, 2.1, 214, 0.09, 0.1)],
    ["backrooms-office-hum-03.wav", createAmbientHumClip(8.9, 3.4, 172, 0.07, 0.08)],
    ["backrooms-office-hum-04.wav", createAmbientHumClip(5.2, 4.2, 198, 0.13, 0.12)],
    ["backrooms-suit-step.wav", createStep()],
    ["backrooms-punch-swing.wav", createPunchSwing()],
    ["backrooms-punch-impact.wav", createPunchImpact()],
    ["backrooms-relay-surge.wav", createRelayPickup()],
    ["backrooms-breaker-clang.wav", createBreakerToggle()],
    ["backrooms-stalker-step.wav", createStalkerStep()],
    ["backrooms-stalker-growl.wav", createStalkerGrowl()],
    ["backrooms-stalker-growl-02.wav", createStalkerGrowl02()]
  ];

  for (const [filename, samples] of outputs) {
    await writeAudioFile(filename, samples);
    console.log(`Generated ${filename}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
