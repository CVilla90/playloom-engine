# Playloom Engine

AI-first workspace for building 2D single-player web games on a shared engine.

This file is the `one-file startup brief` for the repo. If a new conversation, new contributor, or AI agent needs fast context before creating or modifying a game, reading this file should be enough to start correctly.

## What Playloom Is
- `2D web game engine workspace`, not a generic app monorepo
- `AI-first`, meaning scaffolding, engine boundaries, manifests, and asset tooling are shaped so an agent can build a new game quickly without guessing the repo structure
- `Shared engine + many games`, where reusable systems live in `packages/*` and each game lives in `games/<game-id>`

## Core Operating Model
- Create new games only in `games/<game-id>`
- Scaffold first with the CLI before hand-building folders
- Games may import from public engine packages only
- Engine packages must never import from games
- One game must never import another game
- Keep game-specific rules, copy, progression, HUD text, balance, and assets inside the game folder

## Repo Shape
```text
playloom-engine/
  docs/
  packages/
    engine-core/
    engine-input/
    engine-renderer-canvas/
    engine-audio/
    engine-assets/
    cli/
  games/
    embervault/
    quiet-collapse/
    strata-machina/
    backrooms-breaker-floor/
    black-relay-courier/
```

## Public Engine Packages
- `@playloom/engine-core`
  Fixed loop, scene manager, RNG, math helpers, local JSON save/load, `ZoneMap`, `PlatformerController`
- `@playloom/engine-input`
  `InputManager`, `ActionMap`, reusable bindings such as `createMenuActionBindings()`
- `@playloom/engine-renderer-canvas`
  `Renderer2D`, text helpers, bars, panels, blockout drawing helpers, sprite tinting
- `@playloom/engine-audio`
  `SynthAudio`, `AudioMixer`
- `@playloom/engine-assets`
  Asset manifest validation, runtime catalog loading, asset URL resolution

## Fast Commands
```bash
npm install
npm run dev
npm run new-game -- my-game-id
npm run new-game -- my-game-id --set-default
npm run export:arcade -- my-game-id
npm run validate
npm run test
npm run smoke
```

## New Game Workflow
1. Scaffold the game:
   `npm run new-game -- <game-id> --set-default`
2. Implement scenes in:
   `games/<game-id>/src/scenes`
3. Keep the game manifest valid:
   `games/<game-id>/game.manifest.json`
4. Keep the asset manifest valid:
   `games/<game-id>/assets/asset.manifest.json`
5. Add or generate assets as needed
6. Update the game README with controls and gameplay loop:
   `games/<game-id>/docs/README.md`
7. Run the safety gates:
   `npm run validate`
   `npm run test`
   `npm run smoke`

## Asset Generation
Use the built-in asset lab when a prototype needs placeholders quickly.

```bash
npm run asset:gen -- svg <game-id> <asset-id> --palette ember --size 96
npm run asset:gen -- sprite <game-id> <asset-id> --frames 6 --size 48 --fps 10
npm run asset:gen -- sfx <game-id> <asset-id> --preset hit --duration 0.35
npm run asset:gen -- music-loop <game-id> <asset-id> --preset ambient --duration 8
```

Generated assets are registered into the game asset manifest automatically by the tool.

## Arcade Export
Use this when a game should become playable inside `playloom-arcade`.

```bash
npm run export:arcade -- <game-id>
```

What it does:
- builds the chosen game with relative asset paths
- writes the export to `../playloom-arcade/runtime/<game-id>/`
- leaves the main engine `index.html` unchanged

After export:
1. confirm `playloom-arcade/runtime/<game-id>/index.html` exists
2. set that game's `deployment.status` to `"live"` in `playloom-arcade/site-data.js`
3. keep `deployment.runtimePath` pointed at `/runtime/<game-id>/index.html`

## Boundary Rules
- Allowed:
  `games/* -> packages/*`
  `packages/* -> packages/*`
- Forbidden:
  `packages/* -> games/*`
  `games/* -> games/*`

When something feels reusable, promote it into `packages/*` only if it is genuinely game-agnostic. Do not move lore, HUD copy, game constants, or theme-specific logic into the engine.

## AI-First Defaults
- Scaffold before coding from scratch
- Prefer `ActionMap` over raw key checks
- Prefer engine helpers before custom one-off utilities
- For movement-heavy prototypes, look at `ZoneMap` and `PlatformerController`
- For HUD/text work, use `drawPanel`, `drawBar`, `wrapTextLines`, and `drawTextBlock`
- For mute/volume/one-shot audio, use `AudioMixer`
- If an engine capability is missing, add it at the engine layer only if it is reusable by more than one game

## Minimal Game Contract
Every game should have:
- `game.manifest.json`
- `assets/asset.manifest.json`
- `src/main.ts`
- `src/context.ts`
- `src/scenes/*`
- `docs/README.md`

Minimal manifest example:

```json
{
  "id": "my-game",
  "name": "My Game",
  "entry": "src/main.ts",
  "render": {
    "width": 1280,
    "height": 720,
    "targetFps": 60
  },
  "features": ["prototype"],
  "assetsManifest": "assets/asset.manifest.json",
  "save": {
    "key": "my-game.save.v1",
    "version": 1
  }
}
```

## Quality Gates
- `npm run validate`
  Checks game manifests and import boundaries
- `npm run test`
  Runs Vitest suites across engine and game tests
- `npm run smoke`
  Runs validate, type-check, tests, and production build

## Current Example Games
- `games/embervault`
  Existing game consumer
- `games/quiet-collapse`
  UI-heavy narrative route game
- `games/backrooms-breaker-floor`
  first-person-feel prototype built with 2D canvas techniques
- `games/black-relay-courier`
  current cockpit-speed prototype

## Read Order For Deeper Context
If this README is enough, stop here and build.

If you need more detail:
1. `AGENTS.md`
2. `docs/ENGINE_APIS.md`
3. `docs/AI_WORKFLOW.md`
4. `games/<game-id>/docs/README.md`

## Prompt Shortcut
For future sessions, a good starting prompt is:

```text
Read playloom-engine/README.md and use it as the main repo brief. Then create or modify the target game under games/<game-id>.
```
