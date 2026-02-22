#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(cliRoot, "..", "..", "..");

function printHelp() {
  console.log(`Playloom CLI

Usage:
  playloom new-game <game-id> [options]

Options:
  --name <display name>   Human title shown in starter scene
  --width <pixels>        Canvas width (default: 960)
  --height <pixels>       Canvas height (default: 540)
  --fps <hz>              Fixed update rate (default: 60)
  --set-default           Point root index.html to the new game entry
  --force                 Overwrite existing files in target game folder
  --dry-run               Print planned files without writing them

Examples:
  npm run new-game -- sky-runner
  npm run new-game -- sky-runner --name "Sky Runner" --width 1280 --height 720
`);
}

function parseNumberFlag(args, flag, defaultValue) {
  const index = args.indexOf(flag);
  if (index === -1) return defaultValue;
  const raw = args[index + 1];
  if (!raw) throw new Error(`Missing value for ${flag}`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric value for ${flag}: ${raw}`);
  }
  return Math.round(parsed);
}

function parseStringFlag(args, flag, defaultValue) {
  const index = args.indexOf(flag);
  if (index === -1) return defaultValue;
  const raw = args[index + 1];
  if (!raw) throw new Error(`Missing value for ${flag}`);
  return raw;
}

function toTitleCase(id) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeTextFile(path, content, force) {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  if (!force && (await pathExists(path))) {
    throw new Error(`Refusing to overwrite existing file: ${path}`);
  }
  await writeFile(path, content, "utf8");
}

function buildFileMap({ gameId, gameName, width, height, fps }) {
  const saveKey = `${gameId}.save.v1`;
  return {
    "package.json": `{
  "name": "@playloom/game-${gameId}",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
`,
    "game.manifest.json": `{
  "id": "${gameId}",
  "name": "${gameName}",
  "entry": "src/main.ts",
  "render": {
    "width": ${width},
    "height": ${height},
    "targetFps": ${fps}
  },
  "features": ["prototype"],
  "assetsManifest": "assets/asset.manifest.json",
  "save": {
    "key": "${saveKey}",
    "version": 1
  }
}
`,
    "assets/asset.manifest.json": `{
  "gameId": "${gameId}",
  "assets": []
}
`,
    "docs/README.md": `# ${gameName}

This folder is scaffolded by Playloom CLI.

## Next steps
1. Define gameplay rules in \`src/scenes\`.
2. Add art/audio files under \`assets/\`.
3. Register each asset in \`assets/asset.manifest.json\`.
4. Keep all game-specific logic inside \`games/${gameId}\`.
`,
    "src/vite-env.d.ts": `interface ImportMetaEnv {
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.svg?url" {
  const content: string;
  export default content;
}
`,
    "src/types.ts": `export interface GameManifest {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

export const GAME_MANIFEST: GameManifest = {
  id: "${gameId}",
  name: "${gameName}",
  width: ${width},
  height: ${height},
  fps: ${fps}
};
`,
    "src/context.ts": `import type { InputManager } from "@playloom/engine-input";
import type { Renderer2D } from "@playloom/engine-renderer-canvas";

export interface AppServices {
  renderer: Renderer2D;
  input: InputManager;
}
`,
    "src/scenes/BootScene.ts": `import type { Scene } from "@playloom/engine-core";
import type { AppServices } from "../context";
import { GAME_MANIFEST } from "../types";

export class BootScene implements Scene {
  constructor(private readonly services: AppServices) {}

  update(_dt: number): void {}

  render(_alpha: number): void {
    const { renderer, input } = this.services;
    renderer.clear("#111318");
    renderer.text(GAME_MANIFEST.name, renderer.width / 2, renderer.height / 2 - 26, {
      align: "center",
      color: "#f5f0de",
      font: "bold 40px Trebuchet MS"
    });
    renderer.text("Playloom starter scene", renderer.width / 2, renderer.height / 2 + 6, {
      align: "center",
      color: "#c7d8f1",
      font: "20px Trebuchet MS"
    });
    renderer.text("Arrow keys state: " + (input.isDown("arrowleft", "arrowright", "arrowup", "arrowdown") ? "active" : "idle"), renderer.width / 2, renderer.height / 2 + 34, {
      align: "center",
      color: "#a0bf9a",
      font: "16px Trebuchet MS"
    });
  }
}
`,
    "src/main.ts": `import { FixedLoop, SceneManager } from "@playloom/engine-core";
import { InputManager } from "@playloom/engine-input";
import { Renderer2D } from "@playloom/engine-renderer-canvas";
import type { AppServices } from "./context";
import { BootScene } from "./scenes/BootScene";
import { GAME_MANIFEST } from "./types";

class GameApp {
  private readonly renderer: Renderer2D;
  private readonly input = new InputManager(window);
  private readonly sceneManager = new SceneManager();
  private readonly services: AppServices;

  constructor() {
    const root = document.querySelector<HTMLDivElement>("#app");
    if (!root) {
      throw new Error("Missing #app container");
    }

    const canvas = document.createElement("canvas");
    canvas.width = GAME_MANIFEST.width;
    canvas.height = GAME_MANIFEST.height;
    canvas.setAttribute("aria-label", GAME_MANIFEST.name);
    root.appendChild(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context is not available");
    }

    this.renderer = new Renderer2D(ctx, GAME_MANIFEST.width, GAME_MANIFEST.height);
    this.services = {
      renderer: this.renderer,
      input: this.input
    };

    this.sceneManager.setScene(new BootScene(this.services));

    const loop = new FixedLoop(
      GAME_MANIFEST.fps,
      (dt) => {
        this.sceneManager.update(dt);
        this.input.endFrame();
      },
      (alpha) => this.sceneManager.render(alpha)
    );

    loop.start();
  }
}

new GameApp();
`
  };
}

async function setDefaultEntry(gameId) {
  const indexPath = join(workspaceRoot, "index.html");
  const html = await readFile(indexPath, "utf8");
  const scriptRe = /<script type="module" src="\/games\/[^"]+\/src\/main\.ts"><\/script>/;
  if (!scriptRe.test(html)) {
    throw new Error("Unable to find game entry script tag in root index.html");
  }
  const updated = html.replace(
    scriptRe,
    `<script type="module" src="/games/${gameId}/src/main.ts"></script>`
  );
  await writeFile(indexPath, updated, "utf8");
}

async function createNewGame(args) {
  const gameId = args[0];
  if (!gameId) {
    throw new Error("Missing required <game-id>");
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(gameId)) {
    throw new Error("Game id must match ^[a-z0-9][a-z0-9-]*$");
  }

  const gameName = parseStringFlag(args, "--name", toTitleCase(gameId));
  const width = parseNumberFlag(args, "--width", 960);
  const height = parseNumberFlag(args, "--height", 540);
  const fps = parseNumberFlag(args, "--fps", 60);
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");
  const setDefault = args.includes("--set-default");

  const gameDir = join(workspaceRoot, "games", gameId);
  const fileMap = buildFileMap({ gameId, gameName, width, height, fps });

  if (dryRun) {
    console.log(`[dry-run] Would scaffold ${gameDir}`);
    for (const relPath of Object.keys(fileMap)) {
      console.log(`[dry-run] + ${join("games", gameId, relPath)}`);
    }
    if (setDefault) {
      console.log(`[dry-run] ~ update index.html entry to /games/${gameId}/src/main.ts`);
    }
    return;
  }

  await mkdir(gameDir, { recursive: true });
  for (const [relPath, content] of Object.entries(fileMap)) {
    await writeTextFile(join(gameDir, relPath), content, force);
  }

  if (setDefault) {
    await setDefaultEntry(gameId);
  }

  console.log(`Scaffolded game '${gameId}' in games/${gameId}`);
  if (setDefault) {
    console.log(`Default entry updated to /games/${gameId}/src/main.ts`);
  }
  console.log("Next command:");
  console.log(`  npm run validate`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "new-game") {
    await createNewGame(args.slice(1));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`Playloom CLI error: ${error.message}`);
  process.exit(1);
});
