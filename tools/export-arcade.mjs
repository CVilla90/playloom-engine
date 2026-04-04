import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(toolRoot, "..");
const defaultArcadeRoot = resolve(workspaceRoot, "..", "playloom-arcade");

function printHelp() {
  console.log(`Playloom arcade export

Usage:
  npm run export:arcade -- <game-id> [options]

Options:
  --arcade <path>    Override the target playloom-arcade workspace path
  --mode <mode>      Vite mode to build with (default: phase4)

Example:
  npm run export:arcade -- black-relay-courier
`);
}

function parseStringFlag(args, flag, defaultValue) {
  const index = args.indexOf(flag);
  if (index === -1) return defaultValue;
  const raw = args[index + 1];
  if (!raw) {
    throw new Error(`Missing value for ${flag}`);
  }
  return raw;
}

function loadManifest(manifestPath) {
  return readFile(manifestPath, "utf8").then((content) => JSON.parse(content));
}

async function buildGame(gameId, arcadeRoot, mode) {
  const gameDir = join(workspaceRoot, "games", gameId);
  const manifestPath = join(gameDir, "game.manifest.json");
  const manifest = await loadManifest(manifestPath);
  const exportRoot = join(workspaceRoot, ".playloom-export", gameId);
  const viteRoot = exportRoot;
  const outDir = join(arcadeRoot, "runtime", gameId);

  await rm(exportRoot, { recursive: true, force: true });
  await mkdir(viteRoot, { recursive: true });

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Playloom Engine - ${manifest.name}</title>
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        background: radial-gradient(circle at top, #182130 0%, #0b1018 54%, #040608 100%);
        color: #f6f2df;
        font-family: "Trebuchet MS", Verdana, sans-serif;
        min-height: 100%;
      }

      body {
        min-height: 100vh;
      }

      #app {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: flex-start;
      }

      canvas {
        display: block;
        max-width: 100%;
        height: auto;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="../../games/${gameId}/src/main.ts"></script>
  </body>
</html>
`;

  await writeFile(join(viteRoot, "index.html"), html, "utf8");
  await rm(outDir, { recursive: true, force: true });

  const viteBin = join(workspaceRoot, "node_modules", "vite", "bin", "vite.js");
  const result = spawnSync(
    process.execPath,
    [
      viteBin,
      "build",
      viteRoot,
      "--config",
      join(workspaceRoot, "vite.config.ts"),
      "--mode",
      mode,
      "--base",
      "./",
      "--outDir",
      outDir,
      "--emptyOutDir"
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit"
    }
  );

  await rm(exportRoot, { recursive: true, force: true });

  if (result.status !== 0) {
    throw new Error(`Vite build failed for ${gameId}`);
  }

  console.log(`Exported ${gameId} to ${outDir}`);
  console.log(`Arcade runtime path: /runtime/${gameId}/index.html`);
}

async function main() {
  const args = process.argv.slice(2);
  const gameId = args[0];

  if (!gameId || gameId === "--help" || gameId === "-h" || gameId === "help") {
    printHelp();
    return;
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(gameId)) {
    throw new Error("Game id must match ^[a-z0-9][a-z0-9-]*$");
  }

  const arcadeRoot = resolve(parseStringFlag(args, "--arcade", defaultArcadeRoot));
  const mode = parseStringFlag(args, "--mode", "phase4");

  await buildGame(gameId, arcadeRoot, mode);
}

main().catch((error) => {
  console.error(`Arcade export error: ${error.message}`);
  process.exit(1);
});
