# Backrooms: Breaker Floor Handoff

_Last updated: April 8, 2026_

## Purpose
This document is the return point for this prototype. It records what is actually working now, what was fixed during the latest networking pass, and what still needs to be finished next so work can resume tomorrow without re-deriving context.

## Project status
1. This prototype now has a real shared-room multiplayer transport in the dev build.
2. The target product is still `v1` online public-match play for browser desktop plus iPad.
3. The game now runs by default against a WebSocket-backed authoritative public room hosted through Vite dev server integration.
4. The authoritative match core, shared transport, async join flow, shared mission state, PVP/PVE combat, and first-pass client prediction are all working.
5. The build is no longer at the "networking not started" stage. The current gap is feel/visibility polish for replicated actors, not basic transport.

## Multiplayer progress snapshot
### Done
1. Public-room types and room-service contract under `src/multiplayer/`.
2. Front screen wired to live room snapshots instead of a static menu.
3. Full 7-phase round state machine in `AuthoritativePublicMatch`:
   `waiting` → `round_joinable` → `round_locked` → `extraction_countdown` → `lockdown_swarm` → `results` → `resetting`
4. Authoritative match core owns:
   join acceptance and unique-name validation
   authored spawn assignment
   shared relay/panel mission progression
   pickup state
   extraction start and seal
   timeout / wipe / extraction result resolution
   PVP and PvE combat validation
   primary stalker AI
5. `protocol.ts` is now bound to a real transport, not just typed for later.
6. `NetworkedAuthoritativePublicRoomService` is implemented and is the default room service in `main.ts`.
7. `LocalAuthoritativePublicRoomService` still exists behind `?room=local` as the fallback/dev comparison path.
8. `BackroomsPublicMatchSocketServer` hosts one authoritative `AuthoritativePublicMatch` instance over WebSockets inside the Vite dev server.
9. Browser/server socket constants were split cleanly so the client no longer imports Node-only code.
10. WebSocket upgrade handling was narrowed to `/ws/backrooms-breaker-floor`, so Vite HMR no longer breaks with `Invalid frame header`.
11. `BootScene` now waits for async join acceptance instead of assuming same-frame success.
12. Join/leave/reconnect flow works through the shared room service.
13. `GameScene` consumes authoritative snapshot state for:
   local spawn/health/death
   relay/panel objective ids
   pickup availability
   remote player snapshots
   round banners/results
   primary stalker state
14. Local player movement no longer feels frame-skippy in the networked room.
15. That local movement fix came from first-pass client prediction/reconciliation plus throttled `input_update` sends in `NetworkedAuthoritativePublicRoomService`.
16. Stalker visual movement no longer feels frame-skippy locally.
17. That stalker fix came from render-side smoothing plus letting stalker attack animation time continue locally between snapshots.
18. Joining the round no longer crashes on the first snapshot; the constructor-order bug around stalker bootstrap in `GameScene` was fixed.
19. Damage numbers now appear when the local player damages authoritative targets: stalker hits still follow authoritative stalker health deltas, and resolved punch results now also drive exact floating damage numbers on struck remote players.
20. Stalker pathing across connected rooms was improved with doorway-aligned traversal waypoints, so it no longer oscillates in front of many room boundaries before crossing.
21. Stalker doorway traversal now commits into the next area instead of immediately re-evaluating chase spacing on the seam, which fixes the "hovering in the doorway" failure case when players bait a room transition during attack cooldown.
22. Shared snapshots already replicate enough state for:
   player names
   positions/facing
   health/death
   pickups/objectives
   banners/results
   stalker state
23. Remote players no longer render directly from raw snapshot coordinates; `GameScene` now keeps a render-side visual state per remote player and smooths body motion between authoritative updates.
24. Remote player overlays now follow those smoothed positions too, so nameplates/health bars no longer jitter independently of the body.
25. Player snapshots now replicate flashlight state plus first-pass punch animation state, so other clients can render remote flashlight use and remote punch telegraphing.
26. Remote players now render under the darkness mask instead of on top of it, and other players' flashlight beams cut shared visibility into that mask for observers.
27. Remote nameplates, health bars, stalker health bars, and floating damage numbers now obey the same reveal rules instead of leaking hidden actors for free.
28. Late join now stays open until the final `90` seconds of the `6:00` round instead of closing after the first `2:00`, and mission completion no longer auto-locks the room before that timer.
29. Player snapshots now carry authoritative `joinedAt`, which `GameScene` uses to trigger a short spawn/materialization effect for local and remote players.
30. Touch HUD now includes a dedicated `LOBBY` button with a second-tap confirm instead of relying on desktop-only `Esc` copy.
31. `world.test.ts` now forbids positive-area overlaps between authored walkable regions, documenting the archive-west/transit-spine geometry bug so it does not silently come back.
32. Verified after the latest fixes:
   `npm run validate`
   `npm run check`
   `npm run test`
   `npm run smoke`

### Still not done
These are the remaining practical gaps after the networking pass.

**1. Live multi-browser verification is still required**
The remote punch and darkness pass is implemented, but it still needs real observer validation in multiple browser windows/tabs.
What still needs to happen:
- verify another player's punch reads clearly before or as damage lands
- verify the attacking client reliably sees the correct damage number on struck players and the stalker
- verify another player's flashlight beam visibly reveals shared space for observers
- verify hidden actors are not given away by bars or floating numbers
- verify remote movement smoothing, punch telegraphing, and darkness occlusion still feel coherent together under actual latency/jitter

**2. Visibility tuning may still need one more pass**
The rules are now wired together, but the exact reveal balance may still need tuning after live play.
Possible follow-up knobs:
- flashlight cone length/spread
- ambient fixture reveal radius/strength
- how aggressively overlays disappear at the edge of light
- whether any remaining local-only visibility behavior should be tightened

**3. Production/deployment work is still separate**
The prototype has a real shared-room transport in dev, but there is still no dedicated deployable room host story finalized beyond the current Vite/dev integration.

## How to run it
1. From the repo root, run `npm run dev`.
2. Open `http://localhost:5173/` or `http://localhost:5173/games/backrooms-breaker-floor/`.
3. Default behavior uses the WebSocket-backed authoritative room.
4. Use `?room=local` to force the in-process local-authority fallback path.

## What is currently implemented
1. Top-down map expanded into a much larger multi-wing floor with archive, flooded, generator, depot, and exit-transfer sectors.
2. Three collectible relays.
3. Two breaker panels with enforced sequence.
4. Locked exit shutter and exit terminal.
5. Desktop keyboard movement and interaction.
6. Touch joystick plus first-pass `USE / ACT / UTIL` controls, plus a confirm-to-leave `LOBBY` button, for iPad-style testing.
7. Shared-room front screen with unique-name join validation, room status, join/round timing, and mission progress.
8. Real shared-room authority over WebSockets in dev.
9. PVP and PvE combat through the authoritative room service.
10. One black-stickman PvE that roams, chases, attacks, can be killed, and now crosses authored room boundaries more fluently.
11. Yellow hazmat-style player sprite plus corpse sprite on death.
12. Health bars and floating damage numbers.
13. Custom footstep, relay pickup, breaker toggle, punch, and stalker audio.
14. Random floor pickups, currently energy drinks and med kits.
15. Slim top summary HUD for area/objective/round status plus a matching top controls summary, with prompts and status text anchored at the bottom.
16. Darkness mask plus flashlight reveal experiment.
17. Real-time replicated remote players are rendered.
18. Local player visual smoothing in the networked room.
19. Stalker visual smoothing in the networked room.
20. Remote player visual smoothing for bodies plus nameplate/health-bar tracking in the networked room.
21. Remote flashlight replication plus shared darkness-mask reveal for other players.
22. Remote punch telegraph replication using authoritative player punch state.
23. Darkness-gated combat overlays and floating damage numbers.

## Current controls
1. `W / A / S / D` or arrow keys: move
2. `E`, `Enter`, or `Space`: interact
3. `J` or `X`: punch
4. `F`: toggle flashlight
6. `H`: toggle help overlay
7. `M`: mute / unmute
8. `Esc`: return to title
9. `R`: return to title after escape or death
10. Touch:
   left pad moves
   lower-right button uses / interacts
   left-side action button triggers the primary action (`ACT`, currently punch)
   upper-right button triggers utility (`UTIL`, currently flashlight)
   top-right button leaves for the lobby after a confirm tap
11. Debug only:
   add `?debugMask=1` to the URL, then `G` toggles the darkness compare view and the on-canvas mask button becomes available

## Lighting state
1. Lighting is still intentionally experimental/debug-heavy.
2. The world is rendered first.
3. A darkness mask is drawn on top.
4. The flashlight cuts visibility out of that mask.
5. The compare/debug toggle is now hidden from normal play and only exposed under `?debugMask=1`.
6. The remaining lighting issue is no longer just "does the cone look right".
7. The real unfinished problem is visibility correctness for replicated actors and their overlays under darkness.

## Key files
1. [GameScene.ts](C:/Users/carlo/code/Brainstorm/playloom-engine/games/backrooms-breaker-floor/src/scenes/GameScene.ts)
   gameplay scene, replicated actor rendering, HUD, darkness mask, flashlight, combat overlays
2. [BootScene.ts](C:/Users/carlo/code/Brainstorm/playloom-engine/games/backrooms-breaker-floor/src/scenes/BootScene.ts)
   front screen, async join flow, public-room status surface
3. [NetworkedAuthoritativePublicRoomService.ts](C:/Users/carlo/code/Brainstorm/playloom-engine/games/backrooms-breaker-floor/src/multiplayer/NetworkedAuthoritativePublicRoomService.ts)
   browser transport, prediction/reconciliation, reconnect/join flow
4. [BackroomsPublicMatchSocketServer.ts](C:/Users/carlo/code/Brainstorm/playloom-engine/games/backrooms-breaker-floor/src/multiplayer/server/BackroomsPublicMatchSocketServer.ts)
   WebSocket room host bound into Vite
5. [AuthoritativePublicMatch.ts](C:/Users/carlo/code/Brainstorm/playloom-engine/games/backrooms-breaker-floor/src/multiplayer/AuthoritativePublicMatch.ts)
   authoritative round, combat, mission, stalker, timers, results
6. [protocol.ts](C:/Users/carlo/code/Brainstorm/playloom-engine/games/backrooms-breaker-floor/src/multiplayer/protocol.ts)
   transport DTOs/messages
7. [stalker.ts](C:/Users/carlo/code/Brainstorm/playloom-engine/games/backrooms-breaker-floor/src/stalker.ts)
   area graph, roam selection, traversal waypoints
8. [vite.config.ts](C:/Users/carlo/code/Brainstorm/playloom-engine/vite.config.ts)
   dev-server integration for the shared room
9. [MULTIPLAYER_SPEC.md](C:/Users/carlo/code/Brainstorm/playloom-engine/games/backrooms-breaker-floor/docs/MULTIPLAYER_SPEC.md)
   source of truth for public-match rules/phases

## What is intentionally not done yet
1. Live multi-browser verification of remote punch readability and darkness/visibility correctness
2. Final tuning of flashlight and ambient reveal balance after that verification
3. Final art direction for rooms
4. Final lighting balance
5. Final mobile UX tuning
6. Dedicated production room-host/deployment path beyond the current dev integration

## Suggested resume order
Target: finish feel/readability polish for the shared room before broader feature work.

1. **Run a live multi-browser verification pass**
Specifically verify:
- two-player movement readability
- remote punch readability
- shared flashlight visibility for observers
- darkness occlusion of actors and overlays
- stalker chase across multiple rooms

2. **Tune reveal balance based on that pass**
Adjust flashlight/ambient reveal and any overlay edge cases only after watching the current implementation in live play.

3. **Only then move on to broader polish**
After that verification/tuning pass, return to art/lighting/mobile tuning and production-host planning.

## Practical scope reminder
Keep `v1` small:
1. one public room first
2. max `6` players
3. one short session
4. combat and extraction only, no feature sprawl
5. no jump scares
6. no infinite generation
7. no voice chat

## Notes for future-you
1. Default dev path is now the networked room, not the old local-only room.
2. `?room=local` is the fallback if you need the in-process authority path while debugging.
3. Do not reintroduce browser imports of the Node socket server. Shared constants live in `socketConstants.ts`.
4. The Vite integration must only handle WebSocket upgrades for `/ws/backrooms-breaker-floor`; otherwise HMR breaks again.
5. Local player feel, stalker feel, remote player smoothing, remote punch telegraphing, and first-pass darkness-correct visibility are now in. The next job is live validation and tuning, not a new feature layer.
6. Darkness is still a gameplay/visibility problem, not an art-complete system. Treat it as a visibility-rules task first.
7. Shared flashlight visibility is part of gameplay readability now, not optional polish. It affects both co-op readability and PvP stealth/position disclosure.
8. The next important polish milestone is not "more features". It is "remote actors and their light sources feel readable, fair, and correctly hidden/revealed under light."
9. The release-facing HUD now uses slim top summary bars; keep future status/control additions inside that condensed format instead of reintroducing large in-game cards.
10. Authored walkable areas must only touch, not overlap. Positive-area overlaps break `currentAreaAt` and doorway traversal assumptions inside `AuthoritativePublicMatch` and `stalker.ts`.
