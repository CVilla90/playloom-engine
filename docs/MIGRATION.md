# Migration Log

## 2026-02-21
### Canonical rename and layout adoption
1. Created new canonical workspace: `playloom-engine/`.
2. Established contract: engine code in `packages/*`, game code in `games/*`.
3. Added architecture and extraction planning docs:
   - `docs/ARCHITECTURE.md`
   - `docs/EXTRACTION_MAP.md`
   - `docs/AI_WORKFLOW.md`
   - `docs/GAME_SPEC.md`

### Embervault migration (first slice)
1. Copied engine modules into split Playloom packages:
   - `engine-core`
   - `engine-input`
   - `engine-renderer-canvas`
   - `engine-audio`
   - `engine-assets` (manifest seed)
2. Copied Embervault into `games/embervault`.
3. Rewired Embervault imports from `@engine/index` to `@playloom/*`.
4. Updated asset paths to local game asset folder.
5. Added Playloom root project config (`package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`).

### Validation
1. Type-check passed via local TypeScript binary.
2. Vite build not validated yet because dependencies are not installed in `playloom-engine`.

## 2026-02-21 (AI-first hardening)
1. Added CLI scaffolder:
   - `packages/cli/src/playloom.mjs`
   - `npm run new-game -- <game-id>`
2. Added manifest validator:
   - `tools/validate-manifests.mjs`
3. Added boundary validator:
   - `tools/check-boundaries.mjs`
4. Added smoke orchestrator:
   - `tools/smoke-check.mjs`
   - `npm run smoke`
5. Added compact operator guide:
   - `docs/AGENT_PLAYBOOK.md`

## 2026-02-21 (Phase 1 asset generation tools)
1. Added `asset-lab` generator:
   - `packages/engine-assets/tools/asset-lab.mjs`
2. Added supported generated asset classes:
   - `svg` icons
   - `sprite` sheets (+ sprite metadata json)
   - `sfx` wav effects
   - `music-loop` wav loops
3. Added auto-manifest upsert for generated assets.
4. Added usage docs:
   - `docs/AI_ASSET_PIPELINE.md`

## 2026-02-22 (Core completion path: steps 1-4)
1. Added runtime asset APIs in `@playloom/engine-assets`:
   - manifest validation
   - manifest fetch/load
   - runtime catalog indexing
   - asset URL resolution
2. Added generic save/load utility in `@playloom/engine-core`:
   - `createLocalJsonStore`
3. Migrated Embervault save module to use the generic store.
4. Packaging cleanup:
   - root workspace declarations (`packages/*`, `games/*`)
   - package export/type fields in engine package manifests
5. Added targeted unit tests:
   - RNG determinism
   - collision helpers
   - scene manager transitions
   - generic local store behavior
   - asset manifest/catalog behavior
6. Extended quality pipeline:
   - `npm run test`
   - `npm run smoke` now includes tests.

## 2026-02-22 (Reusable gameplay primitives for AI-first prototyping)
1. Added reusable motion + zone systems in `@playloom/engine-core`:
   - `ZoneMap` for typed rectangular gameplay zones
   - `PlatformerController` for grounded/airborne/climbing locomotion transitions
2. Added reusable input action mapping in `@playloom/engine-input`:
   - `ActionMap`
   - `createPlatformerActionBindings`
3. Added reusable bus-based audio control in `@playloom/engine-audio`:
   - `AudioMixer` (master/music/sfx volume + mute + one-shot helper)
4. Added reusable blockout and debug visuals in `@playloom/engine-renderer-canvas`:
   - industrial floor/ceiling/stair primitives
   - zone overlay helper
5. Refactored `games/strata-machina` Stage 1 to consume new engine APIs instead of game-local control logic.
6. Added unit tests for all new modules (core/input/audio/renderer).

## 2026-02-22 (Character lab promoted to engine-level reusable APIs)
1. Added character-lab action bindings in `@playloom/engine-input`:
   - `createCharacterLabActionBindings()`
2. Added reusable runtime sprite recolor helper in `@playloom/engine-renderer-canvas`:
   - `composeTintedSpriteFrame(context, options)`
3. Refactored `games/strata-machina` to consume engine APIs for:
   - character slot selection keybinds
   - head/chest/legs tint composition
4. Added tests for the new input and renderer helpers.
