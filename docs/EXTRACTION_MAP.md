# Embervault -> Playloom Extraction Map

## Scope Notes
- This map excludes generated/build/vendor paths: `node_modules`, `dist`.
- Status labels:
  - `engine`: move to Playloom packages.
  - `game`: move to `games/embervault`.
  - `shared-candidate`: keep with Embervault first, promote later if reusable.
  - `ops`: project tooling/config.

## Source Classification
| Source Path | Status | Target Path | Action |
|---|---|---|---|
| `embervault-descent/packages/engine/src/core/FixedLoop.ts` | engine | `playloom-engine/packages/engine-core/src/loop/FixedLoop.ts` | Move |
| `embervault-descent/packages/engine/src/core/SceneManager.ts` | engine | `playloom-engine/packages/engine-core/src/scene/SceneManager.ts` | Move |
| `embervault-descent/packages/engine/src/math/rng.ts` | engine | `playloom-engine/packages/engine-core/src/math/rng.ts` | Move |
| `embervault-descent/packages/engine/src/math/collision.ts` | engine | `playloom-engine/packages/engine-core/src/math/collision.ts` | Move |
| `embervault-descent/packages/engine/src/ecs/EntityWorld.ts` | engine | `playloom-engine/packages/engine-core/src/ecs/EntityWorld.ts` | Move |
| `embervault-descent/packages/engine/src/input/InputManager.ts` | engine | `playloom-engine/packages/engine-input/src/InputManager.ts` | Move |
| `embervault-descent/packages/engine/src/render/Renderer2D.ts` | engine | `playloom-engine/packages/engine-renderer-canvas/src/Renderer2D.ts` | Move |
| `embervault-descent/packages/engine/src/audio/SynthAudio.ts` | engine | `playloom-engine/packages/engine-audio/src/SynthAudio.ts` | Move |
| `embervault-descent/packages/engine/src/ui/ui.ts` | shared-candidate | `playloom-engine/packages/engine-renderer-canvas/src/ui/ui.ts` | Move with neutral styling pass |
| `embervault-descent/packages/engine/src/index.ts` | engine | `playloom-engine/packages/engine-core/src/index.ts` | Split exports by package |
| `embervault-descent/packages/game/src/main.ts` | game | `playloom-engine/games/embervault/src/main.ts` | Move |
| `embervault-descent/packages/game/src/context.ts` | game | `playloom-engine/games/embervault/src/context.ts` | Move |
| `embervault-descent/packages/game/src/scenes/CharacterSelectScene.ts` | game | `playloom-engine/games/embervault/src/scenes/CharacterSelectScene.ts` | Move |
| `embervault-descent/packages/game/src/scenes/PlayScene.ts` | game | `playloom-engine/games/embervault/src/scenes/PlayScene.ts` | Move |
| `embervault-descent/packages/game/src/data/config.ts` | game | `playloom-engine/games/embervault/src/data/config.ts` | Move |
| `embervault-descent/packages/game/src/types.ts` | game | `playloom-engine/games/embervault/src/types.ts` | Move |
| `embervault-descent/packages/game/src/save.ts` | game | `playloom-engine/games/embervault/src/save.ts` | Move |
| `embervault-descent/packages/game/src/assets.ts` | game | `playloom-engine/games/embervault/src/assets.ts` | Move; retarget asset paths |
| `embervault-descent/packages/game/src/phase.ts` | game | `playloom-engine/games/embervault/src/phase.ts` | Move |
| `embervault-descent/packages/game/src/vite-env.d.ts` | game | `playloom-engine/games/embervault/src/vite-env.d.ts` | Move |
| `embervault-descent/assets/icons/*.svg` | shared-candidate | `playloom-engine/games/embervault/assets/icons/*` | Move now, promote later |
| `embervault-descent/assets/characters/*.svg` | game | `playloom-engine/games/embervault/assets/characters/*` | Move |
| `embervault-descent/assets/ui/panel.svg` | shared-candidate | `playloom-engine/games/embervault/assets/ui/panel.svg` | Move now, promote later |
| `embervault-descent/tools/generate-assets.mjs` | shared-candidate | `playloom-engine/packages/engine-assets/tools/generate-svg-assets.mjs` | Refactor to generic generator |
| `embervault-descent/docs/PROJECT.md` | game | `playloom-engine/games/embervault/docs/PROJECT.md` | Move |
| `embervault-descent/index.html` | ops | `playloom-engine/games/embervault/index.html` | Move and retarget entry path |
| `embervault-descent/vite.config.ts` | ops | `playloom-engine/games/embervault/vite.config.ts` | Move and retarget aliases |
| `embervault-descent/tsconfig.json` | ops | `playloom-engine/tsconfig.base.json` + game tsconfig | Split |
| `embervault-descent/package.json` | ops | `playloom-engine/package.json` + workspace packages | Split |
| `embervault-descent/packages/engine/package.json` | engine | `playloom-engine/packages/engine-core/package.json` and sibling packages | Replace |
| `embervault-descent/packages/game/package.json` | game | `playloom-engine/games/embervault/package.json` | Move/rename |

## Immediate Rename/Alias Plan
1. Replace `@engine/*` alias with scoped packages such as:
   - `@playloom/engine-core`
   - `@playloom/engine-input`
   - `@playloom/engine-renderer-canvas`
   - `@playloom/engine-audio`
2. Keep a temporary compatibility alias `@engine/*` during migration to reduce breakage.
3. Remove compatibility alias after Embervault builds on new package names.

## Risk Flags
1. `ui.ts` currently embeds Embervault-like visual defaults. It should be tokenized or style-parameterized before final promotion.
2. Asset generator currently outputs Embervault-themed visuals. Convert to template-driven generation before labeling as shared.
3. Save keys in `save.ts` are Embervault-specific and must stay in game scope.

## Execution Order
1. Create package scaffolds in `playloom-engine/packages/*`.
2. Move engine modules first and publish local imports/exports.
3. Move `games/embervault` source and retarget imports.
4. Move assets and fix URL import paths.
5. Stabilize build with compatibility alias.
6. Remove compatibility alias after successful smoke run.
