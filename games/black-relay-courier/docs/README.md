# Black Relay Courier: Slipwake Test Flight

First playable beta for `Black Relay Courier`.

## Premise
You are already in the void inside a stripped Black Relay cockpit with a live radio stack bolted into the dash. A registry handler drops your first charter over comms: sync the marked wake windows, keep the carrier readable, and earn your first provisional explorer lane.

## Controls
1. `W` / `Up`
   - Raise throttle
2. `S` / `Down`
   - Engage retro brake
   - Cut throttle
3. `R`
   - Restart the current band sequence
4. `H`
   - Toggle help card
5. `M`
   - Toggle the expanded sector map
6. `P`
   - Recall previous radio messages
   - Press again to step further back through message history
7. `L`
   - Toggle the expanded quest log
8. `1` / `2` / `3`
   - While the quest log is open and sync is unlocked, write to manual save slots
9. `V`
   - Toggle cockpit audio
10. `T`
   - Toggle the cheat console
   - Enter `show me the money` to inject `10000 CR`
   - Enter `skip tutorial` to file the Explorer Charter immediately
11. `Esc`
   - Close the focused overlay, or return to title if no overlay is open
12. Title screen
   - `Enter` / `N` starts a fresh flight
   - `C` continues the latest synced save
   - `1` / `2` / `3` loads manual archive slots
13. Overlay focus
   - `Up` / `Down` or `W` / `S` moves the current overlay selection
   - On the sector map, `Enter` burns for the selected travel-ready destination
   - `Left` / `Right` or `A` / `D` switches quest ledger panes
   - `Enter` confirms the current map or ledger selection
14. Orbit services
   - `Up` / `Down` selects an orbit service, market good, or workshop part
   - In markets, `Left` arms `sell`, `Right` arms `buy`, and `Enter` executes one lot
   - In workshops, `Left` / `Right` switches between `engine` and `cargo` fits, and `Enter` installs the selected part
15. Touch / phone play
   - A touch deck appears on phones and narrow screens beneath the canvas
   - `THR / UP` and `BRK / DN` hold the same throttle and brake bindings as keyboard flight
   - `LEFT`, `RIGHT`, `OK`, and `BACK` drive map, orbit, and overlay navigation
   - `MAP`, `LOG`, `MSG`, `RST`, and `AUD` expose the most important utility actions
   - Landscape orientation is strongly recommended for cockpit readability

## Gameplay Loop
1. Launch the Slipwake rig from the title screen.
2. Watch the upper-space view shift from tiny star dots into long warp streaks as SSI rises.
3. Push through randomized dramatic surge bands that fire a one-shot audio accent, cockpit shake, and brief canopy bloom while you climb.
4. Slam the retro brake hard enough to trigger descending collapse bands that dump speed with a cold canopy pinch and heavier downward kick.
5. Follow the first quest in the cockpit log while the radio stack feeds the contract over comms.
6. Use the nav radar between the drive and speed panels to keep nearby contacts in view, and pop the sector map open with `M` when you want a larger read.
7. Use throttle and retro brake to enter each marked relay window on the right-hand radio HUD.
8. Hold the band for the required time to clear the next stage.
9. Finish the final Slipwake window to complete the charter and leave the carrier open for free drift.
10. Clearing the charter writes an autosave and unlocks manual registry sync slots in the ledger.
11. Select a live destination on the map and hit `Enter` to burn for it: the four inner-cluster stops plus six frontier locations, `Helix Crown`, `Glass Maw`, `Bloom Ossuary`, `Tidal Choir`, `Lantern Vault`, and `Mute Reach`.
12. Transit distance is now route-specific, so `Registry -> Helix` can be a frontier sprint while opposite-side crossings like `Helix -> Mute Reach` become long sector runs.
13. Some lanes now carry route wonders such as `Prism Shear`, `Crown Arcs`, or the deliberately starved `Starless Run`, while other corridors stay plain.
14. Ride SSI high during transit, then brake down through generous orbit bands to avoid overshooting the destination approach.
15. `Black Relay` now starts at `720 SSI`, and the final speed state, `Singularity Veil`, begins at a per-campaign random threshold between `1100` and `1200 SSI`.
16. Crossing into `Singularity Veil` fades the normal starfield away and swaps the canopy into a wormhole-style tunnel pass.
17. Capture orbit and use the destination panel to trade cargo, inspect prices, or fit new hardware before you undock back into open wake.
18. The starter ship now tops out at roughly `400 SSI`, so current routes take longer unless you invest in better engines.
19. The `Blackglass Relay Heart` is the only engine fit that can actually breach the `Singularity Veil` threshold.
20. Buy low and sell high between destinations, then route those profits into larger cargo bays or faster drives.

## Current Prototype State
1. The cockpit now centers around four active meta loops: charter completion, route travel, trading, and workshop upgrades.
2. The merged bottom-center flight console is the main instrument cluster, with throttle, strain, credits, installed drive, and installed hold always visible.
3. Destination travel is player-driven and now route-specific: the chosen origin-destination lane sets distance and optional route wonders, while actual trip time is still determined by how well the player accelerates and brakes.
4. Destination approach framing now varies left and right per location instead of always entering from the same side of the screen.
5. Fresh flights now roll a starting balance between `200` and `400 CR`, so the opening routes push you into actual early trade decisions.
6. Save support is live through one autosave plus three manual slots surfaced in the quest ledger.
7. Radio transmissions are persistent in history, can be recalled with `P`, and the main quest copy is now framed as registry traffic rather than certification text.
8. The frontier sector now includes long-haul routes and non-dockable in-flight wonders, including explicit void lanes where the spectacle is intentional absence.

## Current Content
1. Destinations
   - `Registry Beacon`: records, contracts, registry presence
   - `Dust Market`: trade-heavy station around a ringed giant
   - `Cinder Yard`: industrial repair and fitting stop
   - `Null Seam`: remote drift anchor for later anomaly play
   - `Helix Crown`: magnetar crown station with hot engine work
   - `Glass Maw`: photon-ring harbor on a black-hole lane
   - `Bloom Ossuary`: planetary-nebula shrine shell and careful freight stop
   - `Tidal Choir`: old-light bridge station between warped galactic masses
   - `Lantern Vault`: deep archive in a globular-cluster lantern swarm
   - `Mute Reach`: skeletal void marker at the sector's empty edge
2. Upgrade ladders
   - `Engine`: `Mothline Scout Drive`, `Kestrel Burn Coil`, `Slipfin Courier Spine`, `Blackglass Relay Heart`
   - `Cargo`: `Latch Cradle-6`, `Sparrow Rack-10`, `Caravel Spine-16`, `Atlas Bloom-24`
3. Economy
   - Markets bias prices by destination so goods can be bought low and sold high across short regional loops or longer frontier hauls.
   - Cargo volume is enforced by the installed hold, and workshop access is destination-specific.
4. Route wonders
   - Some corridors now carry bespoke spectacle such as `Prism Shear`, `Choir Span`, `Petal Veil`, or `Starless Run`.
   - Wonders are route-bound rather than destination-bound, and some routes intentionally remain empty.

## MVP Scope
1. First-person cockpit view with the console occupying roughly the lower quarter of the screen.
2. Procedural starfield that visually stretches as speed increases, with some high-speed streaks spawning partway along the same center-to-edge warp path and with denser or sparser star regions over time.
3. Invented speed metric: `SSI` (`Slipwake Shear Index`).
4. Higher SSI ceiling with `Black Relay` beginning at `720 SSI` and `Singularity Veil` opening at a saved random threshold between `1100` and `1200 SSI`.
5. Randomized one-shot surge bands around each major acceleration tier that only re-arm after dropping back below the band's floor.
6. Rarer major surges can roll only in the `456+` and `576+` bands, with heavier audio, shake, and canopy bloom.
7. Three descending retro-collapse bands (`Relay Dump`, `Wake Collapse`, `Retro Shock`) that trigger only while braking downward through a hidden point with enough deceleration, then re-arm after climbing back above the band's ceiling.
8. Procedural cockpit audio bed that deepens with throttle, speed, and braking load.
9. Radio transmission bubble + quest log that frame the initial wake run as the player's first contract.
10. Compact radar panel plus expanded sector map that prepare for later destination selection.
11. Registry sync archive with one autosave plus three manual slots surfaced through the quest ledger.
12. Shared overlay focus controls that let the map track destinations and let the ledger navigate quest/sync panes.
13. Ten travel-ready destinations with SSI-driven transit, distinct approach visuals, forgiving orbit-capture bands, and orbit service panels across the inner cluster, frontier, and void edge.
14. Route-specific lane distances plus optional route wonders, including long-haul crossings that can exceed half a minute at high-end speeds.
15. A small dynamic trade economy with location-specific price biases, cargo capacity, and profitable route loops.
16. Two live upgrade ladders, `engine` and `cargo`, with destination-specific workshop availability and visible ship-fit slots in the cockpit.
17. A starter ship that deliberately tops out around `400 SSI`, with engine upgrades stepping up through roughly `680`, `920`, and finally `1250 SSI`.
18. `Singularity Veil` swaps normal travel into a wormhole tunnel effect once the player reaches the top band.
19. Four relay windows that force both acceleration and braking control.
20. No cargo hazards, combat, or destination-specific quest chains yet. Those belong to later `Black Relay Courier` milestones.

## Handoff Notes
1. The next likely expansion points are destination-specific interaction menus, deeper commodity variety, and turning the current map travel overlay into a fuller route-planning screen.
2. `Singularity Veil` is now triggered purely by speed, even in free drift, so visual work on that state should stay tied to SSI rather than route state.
3. Fresh-start economy is now leaner, but the cheat console still exists for test runs and rapid hardware checks.
