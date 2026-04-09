# Backrooms: Breaker Floor Multiplayer Spec

## Purpose
Define the first real multiplayer target for `backrooms-breaker-floor` before networking code starts. This spec replaces the earlier `private 2-player room-code` direction with a `single public match` model that still keeps the implementation small and server-authoritative.

## Product shape
1. One persistent public room exists on the server.
2. No accounts in the first version.
3. Players enter a name and join if the current round is still joinable.
4. If the round is no longer joinable, players stay on the front screen and wait for the next round.
5. The same map is used for all connected players.

## Core rules
1. Maximum player count: `6`.
2. Player names must be unique among currently connected players.
3. Name uniqueness is `case-insensitive` and based on trimmed text.
4. Empty names and overlong names are rejected by the server.
5. Players spawn only at authored spawn points in `Entry Lobby`.
6. PVP is enabled.
7. Objectives are shared globally across the whole match.
8. Combat, health, pickups, stalkers, timers, and objectives are all server-authoritative.

## Match phases
The room always sits in exactly one of these phases:

1. `waiting`
No active round. Players may join freely. The front screen shows that the room is open.

2. `round_joinable`
The round is running and late join is still allowed.

3. `round_locked`
The round is running but new players may no longer spawn into it.

4. `extraction_countdown`
One player has triggered extraction. All remaining active players have `10s` to reach the Exit Chamber.

5. `lockdown_swarm`
The Exit Chamber gate seals. Players inside are safe. Players outside are considered doomed. A stalker swarm presentation runs for `10s`.

6. `results`
The round is over. Winners and losers are shown.

7. `resetting`
Transient server cleanup phase before the room returns to `waiting`.

## Timers
1. Join grace window: until the final `1:30` of the round, which is `4:30` from round start in the current `6:00` round.
2. Round timer: `6:00` total from round start.
3. Extraction countdown: `10s`.
4. Lockdown swarm/results lead-in: `10s`.
5. Result screen hold: recommended `8s` to `12s`.

## Join window rules
The match is joinable only while all of these are true:
1. Current phase is `round_joinable`.
2. Fewer than `6` active players are already in the room.
3. The final `1:30` of the round has not started yet.
4. Extraction has not started.

The join window closes on the earliest of:
1. `1:30` before round timeout, which is `4:30` after round start in the current tuning.
2. Extraction sequence start.

## Front screen behavior
The front screen is not a separate fake menu disconnected from the game state. It is the live public-room entry surface.

It should show:
1. Room status:
   `Open`, `Joinable`, `Locked`, `Extraction`, or `Results`
2. Current player count:
   for example `4 / 6`
3. Join window:
   for example `01:18 remaining` or `Join closed`
4. Round timer:
   for example `04:42`
5. Mission progress:
   `Relays 2/3, Panels 1/2`
6. Join button state:
   `Join Now` or `Wait For Next Round`

## No-spectator rule for first release
1. There is no true spectator camera in the first multiplayer version.
2. Players who cannot join only see room status and round progress from the front screen.
3. This avoids PVP information leakage and reduces networking and UI scope.

## Spawn rules
1. Spawn points are authored inside `Entry Lobby`.
2. The server assigns a free or least-conflicted spawn point.
3. Players do not spawn on arbitrary random coordinates.
4. New joiners receive a short spawn protection window, recommended `2s`.
5. Spawn protection ends early if the player moves, attacks, or interacts.

## Shared mission rules
1. Relay pickup is global.
2. Breaker activation is global.
3. Exit Chamber remains physically inaccessible until the relay and panel sequence is complete.
4. Any player may contribute to objective progress.
5. Objective state is persisted only for the current round, not across rounds.

## PVP and death rules
1. Players can damage other players.
2. Stalkers can damage players.
3. Dead players stay dead for the rest of the round.
4. No mid-round respawns.
5. If all active players die before extraction, the round ends immediately in failure.

## Extraction sequence
### Trigger
1. Shared mission must already be complete.
2. At least one player inside the Exit Chamber interacts with the terminal/door control.

### On trigger
1. Server switches to `extraction_countdown`.
2. A global system banner appears in the bottom status area.
3. Recommended banner color is `alarm red` or `hot amber`, distinct from normal status text.
4. The message should clearly say extraction has started and how much time remains.

### Exit Chamber lighting
1. During extraction, the Exit Chamber gains its own beacon-like lighting.
2. This lighting remains visible even if players turn flashlights off.
3. The light spills beyond the room and fades into nearby hall space.
4. This is a gameplay beacon, not just an art flourish.

### Seal moment at `T+10s`
1. The Exit Chamber gate closes and locks.
2. Nothing may enter or leave after that moment.
3. The server determines safe players strictly by whether their authoritative position is inside the Exit Chamber at seal time.

## Lockdown swarm
1. After the gate seals, the phase switches to `lockdown_swarm`.
2. Players inside the Exit Chamber are already safe and cannot be harmed.
3. Players outside are treated as doomed even if they are still moving.
4. Many stalkers visually fade in across the walkable map outside the Exit Chamber.
5. The swarm is primarily presentation in the first version, not a requirement for dozens of fully simulated AI agents.
6. The intended feeling is unavoidable overrun, not a fair recoverable combat challenge.

## Results
1. After `10s` of lockdown swarm, the round moves to `results`.
2. Players inside the Exit Chamber at seal time are winners.
3. Players outside the Exit Chamber at seal time are losers.
4. Dead players are losers unless they were already inside and counted safe at seal time.
5. If the `6:00` round timer expires before extraction starts, treat the round as a failure and go to results.

## Reset behavior
1. After results, the room resets automatically back to `waiting`.
2. Recommended reset delay is short enough to keep a public room moving, not a manual admin action.
3. A later improvement may allow connected players to ready-up and skip the remainder of the result timer.

## Server authority rules
The server is authoritative over:
1. Player join acceptance and naming
2. Spawn assignment
3. Movement resolution
4. Punch attempts and hit validation
5. PVP and PvE damage
6. Health and death state
7. Pickup spawns and collection
8. Relay and panel state
9. Stalker state
10. Match phase changes
11. All timers and countdowns
12. Win and loss resolution

Clients should send:
1. Join request with desired name
2. Input intent
3. Interaction requests
4. Punch requests
5. UI acknowledgements only where needed

## Minimal network model
Recommended server snapshot data:
1. Match phase
2. Round timer and join timer
3. Objective state
4. Extraction timer if active
5. Player list:
   id, name, x, y, facing, health, maxHealth, dead/alive, inside-exit-safe flag
6. Pickup state
7. Stalker state
8. Status banner payload

Recommended event types:
1. `join_request`
2. `join_accepted`
3. `join_rejected`
4. `input_update`
5. `interaction_request`
6. `punch_request`
7. `snapshot`
8. `status_message`
9. `phase_changed`
10. `round_results`

## First implementation milestone order
1. Public room server with one room instance, join flow, and unique-name validation.
2. Front screen that reflects live room status.
3. Server-authoritative player spawning and movement replication.
4. Shared relay/panel state replication.
5. Nameplates and health bars over all players.
6. PVP damage replication.
7. Stalker replication and PvE damage.
8. Extraction countdown, lockdown seal, and result resolution.

## Explicit non-goals for the first multiplayer release
1. No account system.
2. No multiple public lobbies yet.
3. No true spectator camera.
4. No reconnect-and-resume guarantees yet.
5. No ranked matchmaking.
6. No voice chat.
7. No persistent progression.
