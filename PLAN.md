# Playloom Engine Plan

## Purpose
Build `playloom-engine` as an AI-first, reusable web game engine extracted from Embervault, so new games can be assembled quickly from shared systems and assets.

## Canonical Outcomes
1. Embervault-specific logic is isolated into a game package.
2. Reusable engine systems live in `playloom-engine` with clean APIs.
3. Shared assets are organized with licensing metadata and reusable manifests.
4. Documentation is optimized for AI agents first, humans second.

## Proposed Target Layout
```text
playloom-engine/
  PLAN.md
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
```

## Migration Phases
### Phase 1: Inventory and Classification
- Audit Embervault code and assets.
- Tag each item as `engine`, `game`, or `shared`.
- Produce an extraction map with source path and destination path.

### Phase 2: Engine Contract
- Define stable interfaces for loop, scenes, entities, input, rendering, audio, and asset loading.
- Enforce one-way dependency rule: game code depends on engine, never inverse.
- Define plugin hooks for game-specific behaviors.

### Phase 3: Extraction
- Move reusable modules from `embervault-descent/packages/engine` into `playloom-engine/packages/*`.
- Keep behavior unchanged while moving code.
- Add compatibility shims where needed to reduce breakage.

### Phase 4: Embervault Isolation
- Refactor Embervault into a game package under `playloom-engine/games/embervault`.
- Replace direct internals access with public engine APIs only.
- Validate that Embervault runs with the new engine packages.

### Phase 5: Engine Enhancements
- Add asset manifest format with typed metadata.
- Add scene schema validation and startup diagnostics.
- Add deterministic seed/session utilities and save-state helpers.
- Add minimal CLI for scaffolding a new game from templates.

### Phase 6: AI-First Documentation
- `ARCHITECTURE.md`: system boundaries and dependency rules.
- `AI_WORKFLOW.md`: exact agent protocol for creating/extending games.
- `GAME_SPEC.md`: machine-friendly game declaration format.
- `MIGRATION.md`: Embervault-to-Playloom migration history and decisions.

### Phase 7: Quality Gates
- Type checks and smoke tests for engine packages.
- Example game boot test.
- Determinism checks for seeded systems.

## Non-Negotiable Rules
- Engine modules must be domain-agnostic.
- Public APIs must be small, typed, and documented with examples.
- Assets must include origin/license notes before promotion to shared.
- New game creation must require minimal manual boilerplate.

## Immediate Next Step
Use `docs/EXTRACTION_MAP.md` to execute Phase 2 (engine contract extraction boundaries) and Phase 3 (code move sequence).
