# Wangan Zero Multiplayer

## Runtime shape

Wangan Zero uses one process-local `AuthoritativeRaceSession`. One deployed Node process therefore creates exactly one global lobby, which matches the intended single-machine Replit deployment.

- WebSocket path: `/ws/wangan-zero`
- Capacity: `12`
- Simulation: `60 Hz`
- Snapshots: `20 Hz`
- Join window: always open while capacity remains
- Player identity: connection-scoped UUID plus a server-validated unique display name
- Name comparison: trimmed, Unicode NFKC-normalized, case-insensitive
- Spawn area: `Kurohama Access` (`0–1200 m`), using randomized lane/distance slots with same-lane separation

## Authority boundary

The server owns:

- join acceptance, capacity, and unique names
- allowed car color IDs
- spawn lane and route distance
- throttle/brake/clutch drivetrain simulation
- gear selection and sequential shifts
- timed lane changes
- player-to-player drafting, bump push, and contact resolution
- the five shared ambient rivals, including their route positions, lane AI, and draft/push interaction with players
- the persistent sedan and freight truck, including route position, lane AI, low-speed drafting, and mass-weighted impacts
- authoritative speed and route position

The client owns presentation:

- immediate local prediction from the same pure drive model
- gradual reconciliation or a hard correction when prediction diverges materially; a locally predicted bump exchange is held against stale snapshots for `0.7 s` (`clientPrediction.ts`) so reconciliation cannot snap a crashed car back to its pre-crash speed
- local contact prediction against `getContactWorld()` — the latest snapshot's remote players, rivals, and traffic (local car as origin) dead-reckoned forward by snapshot age plus half a snapshot interval, because snapshots arrive with server-resolved bumps already clamped outside the contact window
- the crash flash/audio cue, fired on a locally predicted bump or on a hard reconciliation speed snap (a server-resolved crash the prediction missed) — never silently
- remote-player, AI-rival, and civilian-traffic snapshot interpolation
- runtime sprite recoloring and nameplates
- cockpit, road, audio, burnout, traffic, and ambient-rival presentation

Clients send only control intent. They cannot submit speed, RPM, gear, lane, or route position.

## Deployment

`game.manifest.json` declares:

```json
"serverEntry": "src/multiplayer/server/server-entry.ts"
```

The arcade exporter bundles this as `game-servers/wangan-zero.mjs`. The hosting process must import its `attachGameServer(httpServer)` export and call it once on the same HTTP server that serves the game. WebSocket upgrades must reach that Node process without rewriting `/ws/wangan-zero`.

For local development and Vite preview, `vite.config.ts` attaches `WanganRaceSocketServer` automatically.

Use one Replit machine/process. Horizontal scaling would create one lobby per process unless a future version replaces the in-memory session with shared state and sticky routing.

## Current limits

- No accounts, persistence, matchmaking, private rooms, or reconnect-resume guarantee.
- A brief disconnect removes the driver; the client automatically reconnects and rejoins with the saved profile when possible, receiving a new safe spawn.
- The five ambient rivals and both civilian traffic vehicles are server-owned and shared by the global lobby. Clients predict contact presentation and reconcile to the authoritative speed exchange.
