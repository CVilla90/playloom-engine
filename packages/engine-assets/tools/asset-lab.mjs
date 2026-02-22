#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const toolPath = fileURLToPath(import.meta.url);
const workspaceRoot = join(dirname(toolPath), "..", "..", "..");
const sourceTag = "packages/engine-assets/tools/asset-lab.mjs";

const palettes = {
  ember: ["#261512", "#5d241c", "#b5482c", "#f09b53", "#f6d8a3"],
  forest: ["#0f1c16", "#234736", "#3b7a50", "#6ab56f", "#cff3bc"],
  neon: ["#120f26", "#2c1f4f", "#5b3fd9", "#3fd8ff", "#dcff8a"],
  mono: ["#101010", "#3a3a3a", "#7a7a7a", "#bdbdbd", "#efefef"]
};

function printHelp() {
  console.log(`Asset Lab

Usage:
  npm run asset:gen -- <command> <game-id> <asset-id> [options]

Commands:
  svg          Generate one icon SVG and register it in asset.manifest.json
  sprite       Generate one sprite-sheet SVG (+ .sprite.json metadata) and register both
  sfx          Generate one procedural .wav sound effect and register it
  music-loop   Generate one procedural .wav loop and register it

Examples:
  npm run asset:gen -- svg embervault crystal-core --palette ember --size 96
  npm run asset:gen -- sprite embervault rover --frames 6 --size 48 --fps 10 --palette neon
  npm run asset:gen -- sfx embervault hit-metal --preset hit --duration 0.35
  npm run asset:gen -- music-loop embervault bunker-hum --preset ambient --duration 8
`);
}

function parseFlag(args, key, fallback) {
  const idx = args.indexOf(key);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

function parseNumberFlag(args, key, fallback) {
  const raw = parseFlag(args, key, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid value for ${key}: ${raw}`);
  }
  return value;
}

function validateId(label, value) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new Error(`${label} must match ^[a-z0-9][a-z0-9-]*$`);
  }
}

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function seeded01(seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000000) / 1000000;
}

function pickPalette(name) {
  return palettes[name] ?? palettes.neon;
}

function svgIcon(assetId, size, paletteName) {
  const p = pickPalette(paletteName);
  const r = seeded01(assetId);
  const mid = size / 2;
  const radius = size * (0.26 + r * 0.08);
  const inner = radius * 0.45;
  const ring = radius * 1.25;
  const angle = r * Math.PI * 2;
  const x2 = mid + Math.cos(angle) * radius * 0.7;
  const y2 = mid + Math.sin(angle) * radius * 0.7;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%">
      <stop offset="0%" stop-color="${p[3]}"/>
      <stop offset="100%" stop-color="${p[0]}"/>
    </radialGradient>
    <linearGradient id="core" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="${p[4]}"/>
      <stop offset="100%" stop-color="${p[2]}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.16)}" fill="${p[0]}"/>
  <circle cx="${mid}" cy="${mid}" r="${ring}" fill="none" stroke="${p[1]}" stroke-width="${Math.round(size * 0.05)}" opacity="0.8"/>
  <circle cx="${mid}" cy="${mid}" r="${radius}" fill="url(#core)" stroke="${p[4]}" stroke-width="${Math.round(size * 0.04)}"/>
  <circle cx="${x2.toFixed(2)}" cy="${y2.toFixed(2)}" r="${inner}" fill="${p[1]}" opacity="0.78"/>
  <circle cx="${mid}" cy="${mid}" r="${inner * 0.62}" fill="${p[4]}" opacity="0.9"/>
</svg>
`;
}

function spriteSheetSvg(assetId, size, frames, paletteName) {
  const p = pickPalette(paletteName);
  const width = size * frames;
  const height = size;
  const base = seeded01(`sprite-${assetId}`);
  const bodyColor = p[3];
  const accent = p[4];
  const shadow = p[1];

  let layers = "";
  for (let i = 0; i < frames; i += 1) {
    const frameX = i * size;
    const t = i / Math.max(1, frames - 1);
    const bounce = Math.sin(t * Math.PI * 2 + base * Math.PI * 2) * size * 0.08;
    const x = frameX + size * (0.46 + Math.sin((t + base) * Math.PI * 2) * 0.08);
    const y = size * 0.6 + bounce;
    const eyeShift = Math.sin((t + base) * Math.PI * 2) * size * 0.02;
    const limb = Math.sin((t + base) * Math.PI * 2) * size * 0.04;

    layers += `
  <g transform="translate(${frameX},0)">
    <rect x="0" y="0" width="${size}" height="${size}" fill="${p[0]}"/>
    <ellipse cx="${size * 0.5}" cy="${size * 0.82}" rx="${size * 0.24}" ry="${size * 0.08}" fill="${shadow}" opacity="0.35"/>
    <ellipse cx="${x - frameX}" cy="${y}" rx="${size * 0.19}" ry="${size * 0.2}" fill="${bodyColor}" stroke="${p[1]}" stroke-width="${Math.max(1, Math.round(size * 0.03))}"/>
    <circle cx="${x - frameX + eyeShift}" cy="${y - size * 0.05}" r="${size * 0.03}" fill="${p[0]}"/>
    <circle cx="${x - frameX + size * 0.07 + eyeShift}" cy="${y - size * 0.05}" r="${size * 0.03}" fill="${p[0]}"/>
    <rect x="${x - frameX - size * 0.16}" y="${y + size * 0.16 + limb}" width="${size * 0.1}" height="${size * 0.16}" rx="${size * 0.03}" fill="${accent}"/>
    <rect x="${x - frameX + size * 0.06}" y="${y + size * 0.16 - limb}" width="${size * 0.1}" height="${size * 0.16}" rx="${size * 0.03}" fill="${accent}"/>
  </g>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
${layers}
</svg>
`;
}

function clampSample(v) {
  return Math.max(-1, Math.min(1, v));
}

function envelope(t, duration, attack = 0.01, release = 0.08) {
  if (t < attack) return t / attack;
  if (t > duration - release) return Math.max(0, (duration - t) / release);
  return 1;
}

function sfxWave(preset, durationSec, sampleRate, seed) {
  const count = Math.max(1, Math.floor(durationSec * sampleRate));
  const data = new Float32Array(count);
  const noisePhase = seeded01(seed) * 1000;

  for (let i = 0; i < count; i += 1) {
    const t = i / sampleRate;
    const env = envelope(t, durationSec, 0.005, Math.min(0.09, durationSec * 0.35));
    let s = 0;

    if (preset === "laser") {
      const f0 = 1200;
      const f1 = 170;
      const freq = f0 + (f1 - f0) * (t / durationSec);
      s = Math.sin(2 * Math.PI * freq * t);
    } else if (preset === "pickup") {
      const fA = 500 + t * 650;
      const fB = 700 + t * 900;
      s = 0.6 * Math.sin(2 * Math.PI * fA * t) + 0.4 * Math.sin(2 * Math.PI * fB * t);
    } else if (preset === "jump") {
      const freq = 220 + 300 * Math.sin((t / durationSec) * Math.PI * 0.5);
      s = Math.sin(2 * Math.PI * freq * t);
    } else {
      const n = Math.sin(2 * Math.PI * (340 + noisePhase) * t) * Math.sin(2 * Math.PI * (1200 + noisePhase * 0.3) * t);
      s = n;
    }

    data[i] = clampSample(s * env * 0.72);
  }
  return data;
}

function midiFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function musicWave(preset, durationSec, sampleRate, seed) {
  const count = Math.max(1, Math.floor(durationSec * sampleRate));
  const data = new Float32Array(count);
  const beatHz = preset === "chiptune" ? 2.6 : 1.8;
  const base = seeded01(seed);

  const sequence = preset === "chiptune" ? [60, 64, 67, 72, 67, 64] : [48, 55, 60, 62, 55, 53];
  for (let i = 0; i < count; i += 1) {
    const t = i / sampleRate;
    const phaseBeat = t * beatHz;
    const step = Math.floor(phaseBeat) % sequence.length;
    const stepPos = phaseBeat - Math.floor(phaseBeat);
    const freq = midiFreq(sequence[step]);
    const toneA = Math.sin(2 * Math.PI * freq * t);
    const toneB = Math.sin(2 * Math.PI * freq * 0.5 * t + base * Math.PI * 2) * 0.42;
    const gate = Math.pow(1 - stepPos, preset === "chiptune" ? 2.1 : 1.2);
    const pad = preset === "chiptune" ? 0 : Math.sin(2 * Math.PI * (freq * 1.5) * t) * 0.18;
    const fade = Math.min(1, t / 0.06) * Math.min(1, (durationSec - t) / 0.1);
    data[i] = clampSample((toneA * 0.58 + toneB + pad) * gate * fade * 0.65);
  }
  return data;
}

function writeWavMono16(samples, sampleRate) {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeAscii(offset, text) {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
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
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.round(clampSample(samples[i]) * 32767);
    view.setInt16(offset, sample, true);
    offset += 2;
  }
  return Buffer.from(buffer);
}

async function loadManifest(gameId) {
  const manifestPath = join(workspaceRoot, "games", gameId, "assets", "asset.manifest.json");
  const existsManifest = await exists(manifestPath);
  if (!existsManifest) {
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          gameId,
          assets: []
        },
        null,
        2
      ) + "\n",
      "utf8"
    );
  }
  const raw = await readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid JSON in ${relative(workspaceRoot, manifestPath)}`);
  }
  if (!Array.isArray(parsed.assets)) {
    parsed.assets = [];
  }
  parsed.gameId = gameId;
  return { manifestPath, manifest: parsed };
}

function upsertAsset(manifest, entry) {
  const index = manifest.assets.findIndex((item) => item && item.id === entry.id);
  if (index >= 0) {
    manifest.assets[index] = entry;
  } else {
    manifest.assets.push(entry);
  }
}

async function writeManifest(manifestPath, manifest) {
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

async function runSvg(gameId, assetId, args) {
  const size = Math.round(parseNumberFlag(args, "--size", 64));
  const palette = parseFlag(args, "--palette", "neon");
  const relPath = `generated/icons/${assetId}.svg`;
  const outPath = join(workspaceRoot, "games", gameId, "assets", relPath);
  const content = svgIcon(assetId, size, palette);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, content, "utf8");

  const { manifestPath, manifest } = await loadManifest(gameId);
  upsertAsset(manifest, {
    id: assetId,
    kind: "image",
    path: relPath,
    license: "generated-in-repo",
    source: `${sourceTag}#svg`
  });
  await writeManifest(manifestPath, manifest);

  console.log(`Generated: games/${gameId}/assets/${relPath}`);
  console.log(`Manifest updated: games/${gameId}/assets/asset.manifest.json`);
}

async function runSprite(gameId, assetId, args) {
  const size = Math.round(parseNumberFlag(args, "--size", 48));
  const frames = Math.max(2, Math.round(parseNumberFlag(args, "--frames", 6)));
  const fps = Math.max(1, Math.round(parseNumberFlag(args, "--fps", 10)));
  const palette = parseFlag(args, "--palette", "neon");
  const imageRelPath = `generated/sprites/${assetId}.svg`;
  const metaRelPath = `generated/sprites/${assetId}.sprite.json`;
  const imagePath = join(workspaceRoot, "games", gameId, "assets", imageRelPath);
  const metaPath = join(workspaceRoot, "games", gameId, "assets", metaRelPath);

  await mkdir(dirname(imagePath), { recursive: true });
  await writeFile(imagePath, spriteSheetSvg(assetId, size, frames, palette), "utf8");
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        id: assetId,
        image: imageRelPath,
        frameWidth: size,
        frameHeight: size,
        frameCount: frames,
        fps
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  const { manifestPath, manifest } = await loadManifest(gameId);
  upsertAsset(manifest, {
    id: assetId,
    kind: "image",
    path: imageRelPath,
    license: "generated-in-repo",
    source: `${sourceTag}#sprite`
  });
  upsertAsset(manifest, {
    id: `${assetId}-sprite-meta`,
    kind: "data",
    path: metaRelPath,
    license: "generated-in-repo",
    source: `${sourceTag}#sprite-meta`
  });
  await writeManifest(manifestPath, manifest);

  console.log(`Generated: games/${gameId}/assets/${imageRelPath}`);
  console.log(`Generated: games/${gameId}/assets/${metaRelPath}`);
  console.log(`Manifest updated: games/${gameId}/assets/asset.manifest.json`);
}

async function runSfx(gameId, assetId, args) {
  const preset = parseFlag(args, "--preset", "laser");
  const duration = parseNumberFlag(args, "--duration", 0.4);
  const sampleRate = 44100;
  const relPath = `generated/audio/${assetId}.wav`;
  const outPath = join(workspaceRoot, "games", gameId, "assets", relPath);

  const samples = sfxWave(preset, duration, sampleRate, `${gameId}-${assetId}-${preset}`);
  const wav = writeWavMono16(samples, sampleRate);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, wav);

  const { manifestPath, manifest } = await loadManifest(gameId);
  upsertAsset(manifest, {
    id: assetId,
    kind: "audio",
    path: relPath,
    license: "generated-in-repo",
    source: `${sourceTag}#sfx-${preset}`
  });
  await writeManifest(manifestPath, manifest);

  console.log(`Generated: games/${gameId}/assets/${relPath}`);
  console.log(`Manifest updated: games/${gameId}/assets/asset.manifest.json`);
}

async function runMusicLoop(gameId, assetId, args) {
  const preset = parseFlag(args, "--preset", "ambient");
  const duration = parseNumberFlag(args, "--duration", 8);
  const sampleRate = 44100;
  const relPath = `generated/audio/${assetId}.wav`;
  const outPath = join(workspaceRoot, "games", gameId, "assets", relPath);

  const samples = musicWave(preset, duration, sampleRate, `${gameId}-${assetId}-${preset}`);
  const wav = writeWavMono16(samples, sampleRate);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, wav);

  const { manifestPath, manifest } = await loadManifest(gameId);
  upsertAsset(manifest, {
    id: assetId,
    kind: "audio",
    path: relPath,
    license: "generated-in-repo",
    source: `${sourceTag}#music-${preset}`
  });
  await writeManifest(manifestPath, manifest);

  console.log(`Generated: games/${gameId}/assets/${relPath}`);
  console.log(`Manifest updated: games/${gameId}/assets/asset.manifest.json`);
}

async function ensureGame(gameId) {
  const gameManifestPath = join(workspaceRoot, "games", gameId, "game.manifest.json");
  if (!(await exists(gameManifestPath))) {
    throw new Error(`Unknown game '${gameId}'. Expected: games/${gameId}/game.manifest.json`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  const gameId = args[1];
  const assetId = args[2];
  if (!gameId || !assetId) {
    throw new Error("Usage: <command> <game-id> <asset-id> [options]");
  }
  validateId("game-id", gameId);
  validateId("asset-id", assetId);
  await ensureGame(gameId);

  const extra = args.slice(3);
  if (command === "svg") {
    await runSvg(gameId, assetId, extra);
    return;
  }
  if (command === "sprite") {
    await runSprite(gameId, assetId, extra);
    return;
  }
  if (command === "sfx") {
    await runSfx(gameId, assetId, extra);
    return;
  }
  if (command === "music-loop") {
    await runMusicLoop(gameId, assetId, extra);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`Asset Lab error: ${error.message}`);
  process.exit(1);
});
