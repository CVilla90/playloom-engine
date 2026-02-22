# Playloom Engine Agent Rules

This file defines mandatory behavior for AI agents working in this repository.

## Mission
Build and maintain 2D single-player web games using Playloom Alpha 1.0.

## Non-Negotiable Workflow
1. Create new games only under `games/<game-id>`.
2. Scaffold first:
   - `npm run new-game -- <game-id>`
   - Optional default entry switch:
     - `npm run new-game -- <game-id> --set-default`
3. Use only public engine imports:
   - `@playloom/engine-core`
   - `@playloom/engine-input`
   - `@playloom/engine-renderer-canvas`
   - `@playloom/engine-audio`
   - `@playloom/engine-assets`
4. Keep manifests valid:
   - `games/<game-id>/game.manifest.json`
   - `games/<game-id>/assets/asset.manifest.json`
5. Generate starter assets/audio via:
   - `npm run asset:gen -- ...`
6. Run quality gates before finishing:
   - `npm run validate`
   - `npm run test`
   - `npm run smoke`

## Boundary Rules
1. Never import from `games/*` inside `packages/*`.
2. Never import from one game into another game.
3. Keep reusable logic in `packages/*`.
4. Keep game-specific logic and content in `games/<game-id>/*`.

## Delivery Rules
1. Update `games/<game-id>/docs/README.md` with controls and gameplay loop.
2. If engine APIs change, update:
   - `docs/ENGINE_APIS.md`
   - `docs/MIGRATION.md`
3. If workflow changes, update:
   - `docs/AI_WORKFLOW.md`
   - `docs/AGENT_PLAYBOOK.md`
