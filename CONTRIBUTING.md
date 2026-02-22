# Contributing

## Scope
Playloom is AI-first, but human contributions are welcome.

## Setup
1. `npm install`
2. `npm run validate`
3. `npm run test`

## Branching
1. Create a feature branch from `main`.
2. Keep changes focused (engine vs game logic should remain separated).

## Required checks before PR
1. `npm run validate`
2. `npm run test`
3. `npm run smoke`

## Design rules
1. Reusable code belongs in `packages/*`.
2. Game-specific code belongs in `games/<game-id>/*`.
3. Keep manifests accurate:
   - `game.manifest.json`
   - `asset.manifest.json`

## Documentation updates
If behavior/workflow/API changes, update relevant docs in `docs/`.
