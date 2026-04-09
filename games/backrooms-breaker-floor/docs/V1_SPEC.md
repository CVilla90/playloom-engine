# Backrooms: Breaker Floor v1 Spec

## Product goal
Ship a small online Backrooms match game that works in the browser on desktop and iPad, favors tension over shock, and is deployable on lightweight web hosting without heavyweight backend infrastructure.

## Experience pillars
1. Shared-space tension: multiple players occupy the same floor and create both cooperation and threat.
2. Slow dread: fluorescent hum, oppressive layout, and isolation pressure instead of jump scares.
3. Short sessions: one run should fit in roughly `6 to 8` minutes plus results/reset.
4. Tight scope: one public room, one floor, one objective chain, one reliable deployment path.

## v1 target scope
1. `1 public room` with up to `6 players`.
2. Name-based join flow with no accounts.
3. Top-down 2D navigation across the existing breaker-floor layout.
4. Shared objective chain:
   collect relays -> activate core breaker -> reroute hallway power -> open exit
5. One player may trigger extraction after the mission is complete.
6. Late join is allowed until the final `90 seconds` of the `6 minute` round.
7. Round timer is `6 minutes`.
8. PVP is enabled.
9. Browser support:
   desktop keyboard
   iPad landscape touch controls
10. Lightweight room server plus browser client.

## Non-goals
1. No account system.
2. No multi-room matchmaking yet.
3. No true spectator mode in the first release.
4. No voice chat.
5. No infinite procedural maze.
6. No crafting or complex inventory.
7. No jump scares or cheap instant ambushes.

## Current implementation milestone
The current coded slice is still local-only, but it is now validating the actual combat-and-extraction shape that multiplayer will use:

1. Local exploration prototype in a fixed Backrooms floor.
2. Shared objective loop, local combat, pickups, and extraction geography validated before networking.
3. Touch overlay validated before server sync.
4. Multiplayer added next as a dedicated layer rather than mixed into throwaway prototype code.
5. Lighting is currently being validated with a full-map darkness mask and flashlight reveal pass.
6. Room palette contrast is temporarily exaggerated to make lighting verification obvious during development.

## Current prototype state
1. Playable route:
   `http://localhost:5173/games/backrooms-breaker-floor/`
2. Current implemented systems:
   title screen, local movement, interactables, objective chain, touch controls, audio, player/stalker combat, pickups, corpse states, HUD
3. Current debug controls:
   `F` flashlight toggle, `G` darkness mask toggle, on-canvas `Mask ON/OFF` debug button
4. Current lighting model:
   full black mask over the rendered map, then a flashlight-shaped reveal cut through that mask
5. Current intended use of the lighting debug pass:
   prove that the flashlight is actually revealing map content underneath rather than painting a decorative cone

## What is not started yet
1. Room server or networking transport
2. Remote player replication
3. Public-room join flow
4. Reconnect handling
5. Multiplayer-specific UX and sync debugging
6. Extraction-phase networking and win/loss synchronization

## Multiplayer shape
1. Authoritative room state on a small Node server.
2. Exactly one public room exists in the first release.
3. Client sends movement intent, punch requests, and interaction requests.
4. Server publishes player transforms, combat state, objective state, stalker state, and match phase.
5. Room model supports an array of players from day one, with an initial shipped cap of `6`.
6. Full round rules are defined in [MULTIPLAYER_SPEC.md](./MULTIPLAYER_SPEC.md).

## Deployment notes
1. Host the client and room server together as one web app when possible.
2. Use name-based temporary identity instead of accounts.
3. Keep protocol small and snapshot-driven.
4. Do not build the first version around multiple lobby types.

## Next build steps
1. Freeze the public-room multiplayer rules in [MULTIPLAYER_SPEC.md](./MULTIPLAYER_SPEC.md).
2. Build the room server and front-screen join status flow.
3. Add authoritative player spawning and remote player replication.
4. Synchronize shared objective state and timers.
5. Add extraction countdown, lockdown seal, and results sync.
