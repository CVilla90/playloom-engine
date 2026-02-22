# Playloom AI Workflow

## Objective
Enable an AI agent to create a new game with minimal manual steps while preserving engine boundaries.

## Agent Protocol
1. Scaffold new game:
   - `npm run new-game -- <game-id>`
   - Optional immediate run target: `npm run new-game -- <game-id> --set-default`
2. Reference engine packages only through:
   - `@playloom/engine-core`
   - `@playloom/engine-input`
   - `@playloom/engine-renderer-canvas`
   - `@playloom/engine-audio`
   - `@playloom/engine-assets`
3. Add game assets under `games/<game-id>/assets`.
4. Generate starter assets as needed:
   - `npm run asset:gen -- svg <game-id> <asset-id>`
   - `npm run asset:gen -- sprite <game-id> <asset-id>`
   - `npm run asset:gen -- sfx <game-id> <asset-id>`
   - `npm run asset:gen -- music-loop <game-id> <asset-id>`
5. Register assets in `assets/asset.manifest.json` (auto-upserted by Asset Lab).
6. Validate manifests and boundaries:
   - `npm run validate`
7. Run targeted tests:
   - `npm run test`
8. Run full smoke checks:
   - `npm run smoke`
9. If missing engine capability is found, propose an engine extension PR before game-side workaround.

## Engine Extension Rule
When adding engine functionality, agent must update:
1. Engine package code.
2. Example usage in a game.
3. `docs/ARCHITECTURE.md` when boundaries change.
4. `docs/MIGRATION.md` when API is breaking.

## Prohibited Patterns
1. Game constants in `packages/*`.
2. Hardcoded lore/UI copy in engine modules.
3. Engine imports from `games/*`.
4. Cross-game imports (`games/a` importing `games/b`).
