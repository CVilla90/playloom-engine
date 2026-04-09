# Backrooms: Breaker Floor

Small Backrooms match game for Playloom. The intended `v1` is an online browser game with one public room, and the current build now runs against a WebSocket-backed authoritative public room in dev.

## Start here
1. Read [HANDOFF.md](./HANDOFF.md) for the current implementation snapshot and return path.
2. Read [V1_SPEC.md](./V1_SPEC.md) for the target online scope.
3. Read [MULTIPLAYER_SPEC.md](./MULTIPLAYER_SPEC.md) for the current public-match networking target.

## Current playable slice
1. Expanded multi-wing top-down exploration prototype
2. WebSocket-backed authoritative public-room status, name-entry flow, and shared round state in dev
3. Unique-name join validation, player-count telemetry, late join until the last `90 seconds`, and a `6 minute` round timer on the front screen
4. Three relay pickups, two breaker panels, one locked exit
5. Desktop keyboard support
6. iPad-oriented touch joystick plus `USE / ACT / UTIL` action buttons
7. Hazmat-style player sprite plus game-specific low-volume horror ambience, footsteps, relay, and breaker sounds
8. One roaming black-stickman PvE that now simulates through the authoritative match core, screams on engagement, swings at close range for heavy damage, can be punched down, and collapses into a corpse sprite on death
9. Health bars above the player and stalker plus floating red damage numbers on hits taken or dealt
10. Random floor pickups rolled from room-biased spawn nodes, currently energy drinks and med kits
11. Player death state with a collapsed hazmat corpse sprite and return-to-title overlay
12. Global darkness-mask experiment with a flashlight reveal cone
13. Condensed top-bar HUD for mission/status and controls instead of large in-game cards

## Controls
1. Title screen:
   enter a unique name, then use the join card button
2. `W / A / S / D` or arrow keys: move
3. `E`, `Enter`, or `Space`: interact
4. `J` or `X`: primary action, currently punch
5. `F`: utility action, currently flashlight
6. `H`: toggle help overlay
7. `M`: mute / unmute
8. `Esc`: return to title
9. iPad touch:
   left pad: move
   lower-right button: `USE`
   left-side button: `ACT`
   upper-right button: `UTIL`
   top-right button: `LOBBY` with a confirm tap
10. Debug only:
   add `?debugMask=1` to the URL, then `G` toggles the darkness-mask compare view

## Gameplay loop
1. Explore a much larger breaker sector with archive, flooded, generator, and south-service wings.
2. Recover three relay modules spread across distant parts of the floor.
3. Grab opportunistic floor pickups when a room roll spawns them, especially energy drinks for escape speed.
4. Avoid or outrun the roaming black stickman once it picks up your movement, or wear it down with short-range punches before it closes for a heavy swipe.
5. Activate the core breaker panel, then reroute observation power.
6. Reach the exit terminal once the shutter unlocks.

## Local preview
1. Run `npm run dev` from the repo root.
2. Open `http://localhost:5173/games/backrooms-breaker-floor/`.

## Status
1. Shared-room multiplayer is implemented in the dev build through the WebSocket-backed authoritative room.
2. `?room=local` still forces the in-process local-authority fallback for debugging and comparison.
3. The floor plan is intentionally oversized relative to the current objective count so exploration and pacing can be tested before new systems are added.
4. Lighting is still in an active gameplay-validation state:
   the darkness compare toggle is now hidden from normal play and only exposed under `?debugMask=1`.
5. Room colors are intentionally more distinct than final art to make visibility behavior easier to validate.
