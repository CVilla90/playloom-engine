# Wangan Zero

First playable speed prototype for a cockpit-first night expressway racing RPG.

The complete product direction is maintained in [LONG_TERM_VISION.md](./LONG_TERM_VISION.md). Agents (human or AI) resuming work should start with [HANDOFF.md](./HANDOFF.md) for current state, architecture, invariants, and how to run/verify.

## Premise

Drivers join one shared Kurohama Bay session at 02:13 in a customizable `Reimei XR`. Civilian traffic, five distinct ambient rivals, and every connected player share one uninterrupted loop from downtown, across the bay, through the ranges and Yomikage Bore, then back beneath the skyline.

## Joining the Global Session

1. Select **Join session** on the title screen.
2. Enter a unique player name (case-insensitive; up to 18 characters).
3. Choose the Reimei XR main and accent colors from red, yellow, blue, green, black, and white.
4. Join at any time. The server places the car in a free randomized slot within Kurohama Access, the starter sector.

There is one global lobby with a capacity of 12 connected drivers. Names appear above remote player cars. The server owns join validation, spawn assignment, drivetrain state, lane changes, route position, shared rival/traffic state, drafting against all vehicle types, and mass-weighted contact. The local client predicts the current car and interpolates remote, rival, and traffic snapshots for responsive animation.

## Controls

- `W` / `Up`: throttle
- `S` / `Down`: brake
- `C`: clutch (must be held to change gear; throttle free-revs while disengaged)
- Burnout: while below `40 km/h` in first, hold `C` + throttle past `5,000 RPM`, then release `C`; this is smoke/squeal presentation only and does not change grip or acceleration
- `C` + `Q`: sequential downshift
- `C` + `E`: sequential upshift
- `A` / `D` or `Left` / `Right`: signal a lane change; it commits after `1.0 s`
- `R`: reserved; online players cannot reset their server-owned route position
- `M`: cycle normal, boosted, and muted audio
- `Esc`: return to the title
- Touch devices: hold the in-cockpit clutch pedal with one finger and drag the enlarged H-pattern stick with another; the three cockpit pedals and steering wheel are all live multi-touch controls. The compact deck below the canvas remains as a sequential-gear/utility fallback
- Mouse: hold keyboard `C` while click-dragging the stick into any numbered gate; click-drag the steering wheel left/right to request a lane change. Keyboard driving remains the recommended desktop setup

## Gameplay Loop

1. Join the always-active global session and spawn in a free location within Kurohama Access.
2. Accelerate through a six-speed sequential transmission. Reimei's torque and drag balance near `321 km/h`; drafting and bump-draft trains can work the car toward the absolute `348 km/h` limit.
3. Shift before the rev limiter cuts power and breaks up the engine note.
4. Keep the engine high in its temporary power curve: low revs lug, while high revs produce materially stronger acceleration.
4a. For a cosmetic clutch-launch burnout, stay below `40 km/h` in first, free-rev above `5,000 RPM`, and release the clutch. Twin rear-wheel smoke appears in the mirror for `1.5 s` with a synthesized tire squeal; drivetrain behavior is unchanged.
5. Experience speed through dashboard response, camera kick, engine pitch, faster road markings, lighting, and environmental motion without windshield streak overlays.
6. Read sedan and container-truck traffic through the windshield and rear-view mirror as they approach, fall behind, or pass across all three lanes.
7. Encounter five persistent rivals, one per identity. Each receives a random route position, lane, and cruise speed once per session, drives the full loop even while out of sight, then activates its racing behavior when first visible.
8. Signal lane changes before they commit; blinkers flash immediately and again at the half-second mark.
9. Draft any same-lane vehicle ahead of you for a distance- and speed-based acceleration boost — or form a bump-draft train with another player or a willing rival: the leader gets pushed, the chaser gets the slipstream, and soft nose-to-tail contact feeds speed forward so the pair cruises past its solo natural speed without exceeding either car's mechanical limit.
9a. Rear-end contact exchanges the closing-speed difference: the car ahead receives 50% while the bumper pays 65%, dissipating the rest so a hard crash is never profitable and the pair separates instead of colliding every frame. Traffic bleeds donated speed back to its cruise pace over the following seconds; rivals retain it longer. The `2.6×` freight truck barely moves and eats most of the bumper's momentum. Every result is clamped to the affected vehicle's hard top speed.
10. Watch distinct horizon backdrops and visual-only road shapes — downtown straight, bridge sweep, harbor waterfront, mountain bends, structural tunnel, skyline return. Outdoor scenery cross-fades; Yomikage's mouths are live see-through portals — the amber bore is visible through the entrance from outside, and the skyline night, road, lamps, and traffic are visible through the exit from inside — and the exact hard cuts at `4800 m` / `6000 m` land the same instant the portal frame sweeps past the windshield.
11. Pass through six authored sectors: Kurohama Access, Bayshore Span, Minato Wharf, Ryujin Ridge, Yomikage Bore, and Chuo Skyline.
12. Read the continuous route and exact current position from the loop GPS built into Reimei's center console.
13. When the 7.2 km route reaches the end, it loops back to the first sector and cruising continues.
14. Exit only by pressing `Esc` or tapping the in-canvas `EXIT` button.

## Current Prototype Scope

- Every player drives the `Reimei XR`, with independently selectable main/accent colors. It has a `321 km/h` natural equilibrium and a boost-only `348 km/h` hard limit (a lone drafter tops out around `336`; bump-draft trains can push further)
- One server-side global lobby accepts up to 12 players at any time, enforces case-insensitive unique names, and assigns non-overlapping randomized spawn slots in Kurohama Access
- Remote Reimei cars render in the windshield and rear-view mirror with colorways and nameplates; their snapshots are interpolated locally
- Player controls and contact against remote players, rivals, and traffic are predicted locally for immediate response, then reconciled to the 60 Hz authoritative server simulation; the server broadcasts player, rival, and traffic snapshots at 20 Hz
- Five runtime rival identities with clean mirrorable sprites: white `Project Shirokage`, red Shirokage, orange `Hibana RS`, teal `Aonami GT`, and violet `Kagero VX`
- Five ambient rival personalities: white Shirokage is the conservative `221 km/h` entry rival; red Shirokage reaches `261`; Hibana is an aggressive, quick-accelerating `283` street fighter; Aonami is a patient `309` highway specialist; Kagero is a precise, hard-braking `321` predator
- One integrated large container-truck traffic NPC using the same clean mirrorable lane-relative sprite system
- Supplemental front-facing `0°`/`4°` sprite pairs exist for the sedan, container truck, and Shirokage variants; the rear-view mirror uses them for vehicles behind the player
- One fixed 7.2 km route with six equal-length sectors
- Open cruise loop: no mission objective, no finish overlay, route distance wraps back to sector one
- Straight-line driving only in gameplay/physics; shallow curves are visual projection only
- Manual six-speed sequential transmission with a required clutch; a disengaged clutch lets the engine free-rev but sends no acceleration to the wheels
- Presentation-only first-gear burnout: a tested clutch-release edge below `40 km/h` and above `5,000 RPM` starts a `1.5 s` twin-wheel smoke sprite and procedural squeal. The effect model is serializable and the smoke painter accepts arbitrary wheel coordinates for a future remote-player renderer; this single-player prototype has no multiplayer transport yet
- Temporary rising-RPM power curve that rewards using every ratio
- Gear-specific rev limiting with synchronized audio breakup
- Numbered analogue tachometer and speedometer; gear reads from the large draggable H-gate shifter knob
- "Bayside PA, 02:13" title screen: the parked Reimei XR under a sodium lamp at a Kurohama bayside parking area, with the animated Bayshore Span, water, and a vertical-JP + stacked-EN title lockup — the one place the player sees their own car
- Dark procedural rock theme for the title screen
- Softer original menu theme retained for a later garage or secondary menu
- Distinct per-sector horizon backdrops (city skyline, bay bridge, harbor, mountains, and the structural Yomikage tunnel); outdoor scenes cross-fade, while tunnel entry and exit hand off through see-through portal mouths that cross the camera plane exactly at the sector boundaries
- Yomikage uses warm concrete wall planes divided into upright structural bays, repeating roof cross-members, amber reflectors, a service conduit above the pale utility strip, periodic green-lit emergency refuge doors, a dark ceiling, receding recessed lights, sparse green wayfinding, and dramatic entry/exit portals. Each aperture is a live clipped window onto the real next environment — the bore interior on approach, the Chuo Skyline night at the exit — with the road running through it; roadside lamps and guardrails stop at the entrance mouth and resume past the exit mouth, and interior lights/signs cull at the exit plane. The exit aperture also cuts through the foreground wall mask, so no tunnel panel can appear beyond the opening
- Per-sector visual road shape: downtown stays level, bridge sweeps gently, harbor stays level near the waterfront, mountains use a long shallow bend, the tunnel settles nearly straight, and skyline eases back toward the start
- A fictionalized closed-loop GPS lives inside the center console, highlights the current sector, and interpolates a live player marker along the route; its model is ready for future rival/player markers
- Exactly two deterministic civilian traffic vehicles, now spaced at `16/9` of the original distance for `56.25%` of the original encounter frequency after two consecutive 25% reductions: sedans cruise at `75.6–100.8 km/h` with a `180 km/h` mechanical limit; trucks cruise at `58.8–78.4 km/h` with a `120 km/h` mechanical limit
- Traffic spawn lanes are weighted: trucks prefer left, then center, rarely right; sedans prefer center, then left, rarely right
- Player, sedan traffic, and rivals use timed lane-change intent: blinkers pulse at `0.0 s` and `0.5 s`, the committed collision/draft lane changes at `1.0 s`, and AI checks merge safety over that delay before moving
- Sedan traffic can change lanes around slower blockers or the player when a safe adjacent lane exists; otherwise it brakes and follows
- Exactly five persistent ambient rivals: one instance of each identity is randomized around the 7.2 km loop per session, continuously advances at its own speed whether visible or not, activates once visible, and never recycles relative to the player
- Player, traffic, and rival vehicles share a same-lane drafting model: a light wake begins just inside `400 m`, crosses half strength near `105 m`, and becomes near-full at the bumper (up to `1.75×` power); leaders get their own push bonus (up to `1.28×`) from a pace-keeping car glued behind
- Rear contact runs a mass-weighted, hard-capped speed exchange (one hard bump per contact with a cue that scales with closing speed; soft nudges between train partners merge speed silently), so draft trains work while crashes cost the bumper and no vehicle can be pushed above its mechanical top speed
- The minimal HUD removes the former route-distance and mission panels. Its live teal draft chip shows boost percentage and an amber push chip appears when a train partner is filling your wake; the road-space draft brackets and gap/risk readout are intentionally absent
- Road seams, lane dashes, and kerb stripes scroll `1.35×` faster than general environment parallax for stronger per-km/h speed drama without changing physics
- Forward traffic uses rear `0°` in the player's lane and rear `4°` across lanes; the `4°` frame is mirrored when the player is to the traffic vehicle's left
- The rear-view mirror renders only vehicles behind the player with front `0°` in the same lane, front `4°` to the player's right, and mirrored front `4°` to the player's left
- Lane movement, player-to-player contact/drafting, a first rear-view mirror, five ambient rivals, and the global multiplayer session are integrated; no duel prompt, challenge flow, economy, upgrades, accounts, or persistent saves yet
- Touch-ready right-hand-drive cockpit: the complete wheel rim is visible and isolated on the right, the navigation/signal stack sits against the left edge, a large draggable six-speed H-gate occupies its own space between them, and the three-pedal footwell remains at the far right
- Original procedural `Night Velocity` driving theme: a 148 BPM euro-trance/J-rock hybrid sharing the `M` key and mobile AUDIO cycle with engine, impact, wind, and tire sound
- Tunnel-only engine reflection bus adds a short filtered echo immediately inside Yomikage and eases it away at exit; its wet level is `0.41`, trimmed 40% from the earlier `0.68` pass
- Procedural Canvas 2D visuals and Web Audio music/engine/wind/tire layers
