# Playloom Engine

AI-first web game engine workspace.

## Current status
- Engine modules are separated under `packages/*`.
- Embervault is a game consumer under `games/embervault`.
- Migration planning docs live in `docs/`.

## Run Embervault on Playloom
```bash
npm install
npm run dev
```

## Create A New Game
```bash
npm run new-game -- my-game-id
# optional: make it the default game entry
npm run new-game -- my-game-id --set-default
```

## Validate And Smoke Test
```bash
npm run validate
npm run test
npm run smoke
```

## Generate Starter Assets (AI-Friendly)
```bash
npm run asset:gen -- svg embervault crystal-core --palette ember --size 96
npm run asset:gen -- sprite embervault scout-bot --frames 6 --size 48 --fps 10
npm run asset:gen -- sfx embervault impact-hard --preset hit --duration 0.35
npm run asset:gen -- music-loop embervault bunker-drift --preset ambient --duration 8
```

## Key folders
- `packages/engine-core`: loop, scene, ecs, math, rng, generic local save/load store
- `packages/engine-input`: input manager
- `packages/engine-renderer-canvas`: canvas renderer and UI helpers
- `packages/engine-audio`: procedural browser audio
- `packages/engine-assets`: asset tooling + runtime manifest catalog loader
- `packages/cli`: AI-first project scaffolding commands
- `games/embervault`: game-specific implementation

## Key docs
- `docs/START_HERE.md`
- `docs/AI_REQUEST_TEMPLATE.md`
- `docs/ENGINE_APIS.md`
- `docs/CORE_PATH_STATUS.md`
- `docs/AI_WORKFLOW.md`
- `docs/GITHUB_PUBLISH_CHECKLIST.md`
