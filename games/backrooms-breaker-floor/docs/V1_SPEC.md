# Backrooms: Breaker Floor v1 Spec

## Product goal
Ship a small online co-op Backrooms game that works in the browser on desktop and iPad, favors tension over shock, and is deployable on Replit without requiring heavyweight backend infrastructure.

## Experience pillars
1. Co-op first: players move freely and solve the escape loop together.
2. Slow dread: fluorescent hum, oppressive layout, and isolation pressure instead of jump scares.
3. Short sessions: one run should fit in 10 to 20 minutes.
4. Tight scope: one floor, one objective chain, one reliable deployment path.

## v1 target scope
1. `2 players` online with a private room code.
2. Free movement for both players at all times.
3. Top-down 2D navigation across `8 to 12` connected spaces.
4. Shared objective chain:
   collect relays -> activate core breaker -> reroute hallway power -> open exit
5. Browser support:
   desktop keyboard
   iPad landscape touch controls
6. Replit deployment with a lightweight room server and browser client.

## Non-goals
1. No public matchmaking.
2. No voice chat.
3. No combat.
4. No infinite procedural maze.
5. No crafting or complex inventory.
6. No jump scares or instant-death ambushes.

## Current implementation milestone
The first coded slice is intentionally smaller than the full online target:

1. Local exploration prototype in a fixed Backrooms floor.
2. Objective loop and room pacing validated before networking.
3. Touch overlay validated before server sync.
4. Multiplayer added next as a dedicated layer rather than mixed into throwaway prototype code.
5. Lighting is currently being validated with a full-map darkness mask and flashlight reveal pass.
6. Room palette contrast is temporarily exaggerated to make lighting verification obvious during development.

## Current prototype state
1. Playable route:
   `http://localhost:5173/games/backrooms-breaker-floor/`
2. Current implemented systems:
   title screen, local movement, interactables, objective chain, touch controls, audio, player sprite, HUD
3. Current debug controls:
   `F` flashlight toggle, `G` darkness mask toggle, on-canvas `Mask ON/OFF` debug button
4. Current lighting model:
   full black mask over the rendered map, then a flashlight-shaped reveal cut through that mask
5. Current intended use of the lighting debug pass:
   prove that the flashlight is actually revealing map content underneath rather than painting a decorative cone

## What is not started yet
1. Room server or networking transport
2. Remote player replication
3. Room-code join flow
4. Reconnect handling
5. Multiplayer-specific UX and sync debugging

## Multiplayer shape
1. Authoritative room state on a small Node server.
2. Client sends movement intent and interaction requests.
3. Server publishes player transforms, relay state, breaker state, and exit state.
4. Room model supports an array of players from day one, but the shipped cap remains `2` until balance and UI are ready.

## Replit deployment notes
1. Host the client and room server together as one web app.
2. Use a single room code flow instead of account-based identity.
3. Keep protocol small:
   join room
   player snapshot
   interaction event
   room state snapshot
   disconnect / reconnect

## Next build steps
1. Lock the flashlight and darkness behavior so visibility feels intentional rather than purely diagnostic.
2. Decide which debug lighting tools stay for development only and which get removed from player-facing UI.
3. Add a minimal networking package or game-local room server.
4. Synchronize two players and room state.
5. Add reconnect handling and mobile session testing.
