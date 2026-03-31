# Backrooms: Breaker Floor Handoff

## Purpose
This document is the return point for this prototype. It records what exists today, what is still temporary, and what the next sensible steps are so work can pause cleanly and resume later without reverse-engineering context.

## Project status
1. This is a local single-player prototype inside the engine repo.
2. The target product is still `v1` online co-op for browser desktop plus iPad.
3. Multiplayer has not started yet.
4. The current build is proving map feel, objective readability, touch support, atmosphere, sprite presentation, and lighting behavior.

## How to run it
1. From the repo root, run `npm run dev`.
2. Open `http://localhost:5173/games/backrooms-breaker-floor/`.
3. The repo root route `/` may still point to another game; this game uses its own page on purpose.

## What is currently implemented
1. Top-down map with varied room sizes and hall widths.
2. Three collectible relays.
3. Two breaker panels with enforced sequence.
4. Locked exit shutter and exit terminal.
5. Desktop keyboard movement and interaction.
6. Touch joystick plus interact button overlay for iPad-style testing.
7. Ambient fluorescent hum.
8. Footstep, relay pickup, and breaker toggle sounds.
9. Yellow hazmat-style player sprite.
10. HUD with room name, objective, progress, prompts, and controls.
11. Global darkness mask experiment with flashlight reveal.

## Current controls
1. `W / A / S / D` or arrow keys: move
2. `E`, `Enter`, or `Space`: interact
3. `F`: toggle flashlight
4. `G`: toggle darkness mask
5. `H`: toggle help overlay
6. `M`: mute / unmute
7. `Esc`: return to title
8. `R`: return to title after escape
9. Touch:
   left pad moves
   right button interacts

## Current game loop
1. Spawn in the entry side of the breaker floor.
2. Recover all three relays.
3. Activate `Core Breaker A`.
4. Activate `Observation Reroute B`.
5. Reach the exit terminal after the shutter opens.

## Lighting state
1. Lighting is intentionally in a debug-heavy state.
2. The rendered world is drawn first.
3. A full black darkness mask is drawn on top.
4. The flashlight cuts visibility out of that darkness mask.
5. `G` exists specifically to compare:
   raw map with no mask
   masked map with flashlight reveal
6. Several room colors are intentionally more distinct than final art so the reveal behavior is easier to inspect.
7. There is also an on-canvas debug button for the darkness mask.

## Important note about the current lighting work
The flashlight and darkness work was being iterated live. The active question at pause time is not whether there should be darkness, but whether the flashlight reveal feels like a true visibility tool instead of just a decorative cone. That means the current build should be treated as a visibility test bed, not a finished art pass.

## Key files
1. [GameScene.ts](C:/Users/carlo/code/Brainstorm/playloom-engine/games/backrooms-breaker-floor/src/scenes/GameScene.ts)
   main gameplay scene, player movement, objective flow, HUD, darkness mask, flashlight, audio hooks
2. [world.ts](C:/Users/carlo/code/Brainstorm/playloom-engine/games/backrooms-breaker-floor/src/world.ts)
   room layout, palette, interactable placement, dimensions
3. [TouchControls.ts](C:/Users/carlo/code/Brainstorm/playloom-engine/games/backrooms-breaker-floor/src/touch/TouchControls.ts)
   iPad-oriented touch movement and interact UI
4. [assets.ts](C:/Users/carlo/code/Brainstorm/playloom-engine/games/backrooms-breaker-floor/src/assets.ts)
   sprite and audio loading
5. [index.html](C:/Users/carlo/code/Brainstorm/playloom-engine/games/backrooms-breaker-floor/index.html)
   game-specific entry page for local dev
6. [V1_SPEC.md](C:/Users/carlo/code/Brainstorm/playloom-engine/games/backrooms-breaker-floor/docs/V1_SPEC.md)
   target online game scope

## What is intentionally not done yet
1. Online multiplayer
2. Room-code flow
3. Replit deployment server
4. Remote player sprites or sync interpolation
5. Final art direction for rooms
6. Final lighting balance
7. Final mobile UX tuning

## Suggested resume order
1. Re-check the darkness mask and flashlight reveal against clearly visible room text and floor colors.
2. Once the visibility model feels correct, decide whether to keep all-room blackout or reintroduce selective ambient light per room.
3. Remove or hide debug-only lighting controls from normal play if they are no longer needed.
4. Start the online room server as a game-local layer instead of changing the engine globally.
5. Add 2-player sync first, while keeping room capacity data-structured for more players later.

## Practical scope reminder
Keep `v1` small:
1. 2-player co-op first
2. private room code
3. one short session
4. no combat
5. no jump scares
6. no infinite generation
7. no voice chat

## Notes for future-you
1. The root repo had unrelated dirty changes, so this game was kept isolated on its own route instead of taking over `/`.
2. The current prototype is already a decent atmosphere and pacing test; the largest unfinished system is networking, not content.
3. If returning after a while, do not assume the lighting debug tools are shippable features. Re-evaluate them as development aids first.
