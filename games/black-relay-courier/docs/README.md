# Black Relay Courier: Slipwake Test Flight

First playable beta for `Black Relay Courier`.

## Premise
You are flying the courier certification rig every Black Relay pilot must survive before taking live cargo through illegal high-shear space. The ship is already in the void. Your job is simple: raise and bleed speed until the Slipwake Shear Index lines up with each relay band, then hold it cleanly.

## Controls
1. `W` / `Up`
   - Raise throttle
2. `S` / `Down`
   - Engage retro brake
   - Cut throttle
3. `R`
   - Restart the certification run
4. `H`
   - Toggle help card
5. `M`
   - Toggle cockpit audio
6. `Esc`
   - Return to title

## Gameplay Loop
1. Launch the Slipwake test from the title screen.
2. Watch the upper-space view shift from tiny star dots into long warp streaks as SSI rises.
3. Push through randomized dramatic surge bands that fire a one-shot audio accent, cockpit shake, and brief canopy bloom while you climb.
4. Slam the retro brake hard enough to trigger descending collapse bands that dump speed with a cold canopy pinch and heavier downward kick.
5. Use throttle and retro brake to enter each certification band on the right HUD.
6. Hold the band for the required time to clear the next stage.
7. Finish the final Slipwake window to earn relay clearance.

## MVP Scope
1. First-person cockpit view with the console occupying roughly the lower quarter of the screen.
2. Procedural starfield that visually stretches as speed increases, with some high-speed streaks spawning partway along the same center-to-edge warp path and with denser or sparser star regions over time.
3. Invented speed metric: `SSI` (`Slipwake Shear Index`).
4. Higher SSI ceiling with a top-end `Black Relay` speed state above standard Slipwake.
5. Randomized one-shot surge bands around each major acceleration tier that only re-arm after dropping back below the band's floor.
6. Rarer major surges can roll only in the `380+` and `480+` bands, with heavier audio, shake, and canopy bloom.
7. Three descending retro-collapse bands (`Relay Dump`, `Wake Collapse`, `Retro Shock`) that trigger only while braking downward through a hidden point with enough deceleration, then re-arm after climbing back above the band's ceiling.
8. Procedural cockpit audio bed that deepens with throttle, speed, and braking load.
9. Four certification bands that force both acceleration and braking control.
10. No cargo, enemies, stations, or route choices yet. Those belong to later `Black Relay Courier` milestones.
