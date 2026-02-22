# Strata Machina

Stage 1 prototype for a vertical machine megastructure exploration game.

## Stage 1 Goal
Establish atmosphere and movement in a deterministic infinite machine world where the player can traverse endlessly across horizontal sectors and vertical tiers.

## Controls
1. `A / D` or `Left / Right`: move
2. `W / S` or `Up / Down`: move vertically when inside a stair shaft
3. `Space` or `X`: jump
4. `H`: show/hide help HUD
5. `F1`: toggle climb-zone debug overlay
6. Press any key or click once: unlock and start audio in browser
7. Click `Silence Ambient` in the help HUD to mute/unmute
8. Character lab in HUD:
   - `1 / 2 / 3 / 4`: select character
   - `Q / E`: head tint
   - `R / T`: chest tint
   - `Y / U`: legs tint

## Gameplay Loop (Stage 1)
1. Spawn in a metallic tier of the megastructure.
2. Move through procedurally generated horizontal sectors and corridor breaks.
3. Find stair shafts to climb up or down between generated tiers.
4. Keep traversing while ambient loop and motion SFX reinforce the tone.

## Procedural World Rules (Stage 1)
1. World generation is deterministic from a fixed seed.
2. Horizontal space is infinite in both directions; vertical tiers remain infinite.
3. Layouts are mostly coherent and walkable, with rare dead-end/backtrack pockets.
4. Stair continuity is not guaranteed per sector, so vertical progress may require horizontal exploration.
5. Rare color-variant sectors appear for visual contrast while keeping the same industrial palette language.
6. Spawn neighborhood is generated as a safer, more readable onboarding zone.

## Engine Reuse In This Game
1. `@playloom/engine-core`: `ZoneMap`, `PlatformerController`
2. `@playloom/engine-input`: `ActionMap`
3. `@playloom/engine-audio`: `AudioMixer`
4. `@playloom/engine-renderer-canvas`: blockout segment helpers

## Assets Included
1. Background texture
2. Wall, floor, ceiling, and stair visuals
3. Character sprite sheets:
   - `chrome-bot` (active): simple square robotic 6-frame cyberpunk runner sheet
   - `neon-runner`: simple human 6-frame cyberpunk runner sheet
   - `alley-jackal`: simple animal-like 6-frame cyberpunk runner sheet
   - `synth-raider`: simple human-robot hybrid 6-frame cyberpunk runner sheet
   - Runtime tint customization in HUD for head/chest/legs
4. Ambient loop music
5. Footstep, jump, and landing effects

## Visual Theme Toggle
1. Stage rendering supports two profiles in `games/strata-machina/src/scenes/StageOneScene.ts`:
2. `legacy`: original blockout visuals and original icon set.
3. `darkindustrial-v2`: first dark-industrial visual pass.
4. `darkindustrial-v3`: caged-service stair rebuild with new stair and connector graphics.
5. `darkindustrial-v4`: switchback gantry stair tower with cross-braced connector shaft.
6. `darkindustrial-v5`: minimal ladder-style stair shaft with simple rails and rungs.
7. Rollback is a one-line change of `VISUAL_THEME` back to `legacy`.
