# Playloom Engine Architecture Contract

## Goal
Define strict boundaries so AI agents can create many games quickly without contaminating the engine with game-specific logic.

## Canonical Layout
```text
playloom-engine/
  docs/
    ARCHITECTURE.md
    EXTRACTION_MAP.md
    AI_WORKFLOW.md
    GAME_SPEC.md
    MIGRATION.md
  packages/
    engine-core/
    engine-renderer-canvas/
    engine-audio/
    engine-input/
    engine-assets/
    cli/
  games/
    embervault/
    <new-game>/
```

## Dependency Direction
Allowed:
- `games/*` -> `packages/*`
- `packages/*` -> `packages/*` (engine internal dependencies only)

Forbidden:
- `packages/*` -> `games/*`
- `games/*` -> `games/*` (without explicit shared package)

## Package Responsibilities
`packages/engine-core`
- Fixed loop, scene contract, deterministic utilities, lightweight ECS, math helpers.
- Generic persistence helpers (`LocalJsonStore`) for reusable save/load flows.
- No HTML theme, no game constants, no lore, no save-key naming.

`packages/engine-renderer-canvas`
- Canvas abstraction, primitive draws, sprite rendering helpers.
- No game HUD copy or game color themes hardcoded as defaults.

`packages/engine-input`
- Keyboard/pointer/gamepad state APIs and frame transitions.
- No game keymap assumptions.

`packages/engine-audio`
- Browser audio utilities and synthesis primitives.
- No game event semantics as required API.

`packages/engine-assets`
- Asset manifest loading, validation, metadata typing, and runtime catalog/URL resolution.
- Includes license/source metadata requirements.

`packages/cli`
- Scaffolding and validation commands for AI/human workflows.
- Generates new game skeletons and manifest templates.

`games/<name>`
- Rules, scenes, balancing, narrative, UI text, progression, game save policy.
- Imports only from public engine package exports.

## AI-First Contracts
1. Every game has a machine-readable `game.manifest.json`.
2. Every shared asset has `asset.manifest.json` with source and license fields.
3. Engine packages expose small typed APIs with examples.
4. New game creation defaults to `games/<name>` and never edits engine internals unless capability is missing.
5. If capability is missing, agent proposes:
   - API addition
   - test
   - docs update
   - migration note

## Promotion Rules
Promote code/assets to engine only if all are true:
1. Reusable in at least two distinct game concepts.
2. No Embervault-specific names, text, stats, or domain assumptions.
3. Has typed API boundary.
4. Has at least one usage example in docs or starter template.

## Versioning and Stability
1. Engine packages use semver.
2. Breaking changes require migration notes in `docs/MIGRATION.md`.
3. Games pin engine versions explicitly.

## Automated Guards
1. `npm run validate:manifests` enforces game and asset manifest contracts.
2. `npm run validate:boundaries` enforces package/game import boundaries.
3. `npm run smoke` runs validation + type-check + build.
4. `npm run test` runs targeted unit tests for core engine modules.

## Initial Mapping From Current Repo
Current source: `embervault-descent/packages/engine/src/*`
Target: `playloom-engine/packages/*`

Current game: `embervault-descent/packages/game/src/*`
Target: `playloom-engine/games/embervault/src/*`

Current art source: `embervault-descent/assets/*`
Target:
- `playloom-engine/games/embervault/assets/*` for game-specific assets
- `playloom-engine/packages/engine-assets/shared/*` only after promotion review
