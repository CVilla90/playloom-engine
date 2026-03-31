# Backrooms: Breaker Floor

Small co-op Backrooms game for Playloom. The intended `v1` is an online browser game with private rooms, but the current build is still a local prototype focused on map feel, touch support, atmosphere, and visibility experimentation.

## Start here
1. Read [HANDOFF.md](./HANDOFF.md) for the current implementation snapshot and return path.
2. Read [V1_SPEC.md](./V1_SPEC.md) for the target online scope.

## Current playable slice
1. Fixed-room top-down exploration prototype
2. Three relay pickups, two breaker panels, one locked exit
3. Desktop keyboard support
4. iPad-oriented touch joystick and interact button overlay
5. Hazmat-style player sprite, ambient audio, footsteps, relay pickup, and breaker sounds
6. Global darkness-mask experiment with a flashlight reveal cone

## Controls
1. `W / A / S / D` or arrow keys: move
2. `E`, `Enter`, or `Space`: interact
3. `F`: toggle flashlight
4. `G`: toggle darkness mask for testing
5. `H`: toggle help overlay
6. `M`: mute / unmute
7. `Esc`: return to title
8. `Tap / click` on the title screen: start
9. iPad touch:
   left pad: move
   right button: interact

## Gameplay loop
1. Explore the breaker floor and follow the hum deeper into the sector.
2. Recover three relay modules from surrounding rooms.
3. Activate the core breaker panel, then reroute observation power.
4. Reach the exit terminal once the shutter unlocks.

## Local preview
1. Run `npm run dev` from the repo root.
2. Open `http://localhost:5173/games/backrooms-breaker-floor/`.

## Status
1. Local prototype only. Online multiplayer is not implemented yet.
2. Lighting is in an active test state:
   the whole map can be masked to black and the flashlight reveal can be compared against the raw map with `G`.
3. Room colors are intentionally more distinct than final art to make visibility behavior easier to validate.
