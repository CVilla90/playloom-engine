# Zacaton Depths Session Handoff

Last updated: 2026-06-06

## Current Progress

Stage 1 through Stage 9 are implemented:

- Open expeditions are available without blocking dives behind equipment.
- Cave depth is capped at 339m, inspired by El Zacaton.
- Exact depth is hidden unless instruments are purchased.
- Exploration, mapping bands, and landmarks generate unbanked funding that is only banked on safe return.
- Tank inventory exists with buy/refill state, gas fill, gas mix, variable weight, and safe-return persistence.
- Dropping tanks reduces carried weight immediately; caching tanks on the lifeline allows planned recovery during the expedition.

Stage 4 is implemented at MVP level:

- Flashlight battery charge is saved in progress.
- Flashlight battery drains only while the light is on during a dive.
- Better light upgrades increase beam strength and battery capacity/duration.
- Owned light shop rows can recharge the battery instead of only showing installed state.
- Low battery and empty battery warning states exist.
- Music and sound effects settings are persistent and default to off.
- Optional synth sound cues exist for breathing, warnings, flashlight toggle, surface return, tank drop, landmark discovery, and failure.
- Sparse depth-based ambience plays only when music is enabled.
- A touch/small-screen control overlay exists for movement, dive/confirm, back, light, drop tank, shop, music, and SFX.
- Tank drop moved from `D` to `Q` to avoid conflicting with WASD right movement.

Stage 5 is now implemented at MVP level:

- Safety shop entries add a lifeline spool and line extension reel.
- `L` deploys a route line from the entry point during a dive.
- The deployed line records paid-out path points until its length limit is reached.
- `H` held near the line adds a route-home movement boost toward earlier line points.
- `C` caches the emptiest carried tank when the diver is near the line.
- `C` near a cached tank recovers it with its remaining fill so it can be used again.
- Cached tanks persist only during the expedition; unrecovered caches are still left behind on return.
- Touch controls include line, home/follow, and cache/recover buttons.

Stage 6 is now implemented at MVP level:

- Deco load builds during deeper exposure and clears slowly in shallow stop zones.
- Fast ascent and missed stop ceilings convert deco load into decompression stress that can end a dive.
- Surfacing with unresolved deco load blocks safe return until the diver descends and clears the stop.
- Narcosis is separate from lung/tank gas supply and increases with depth and wrong gas.
- Deep air produces stronger narcosis and gas toxicity risk; trimix planning lowers deep narcosis.
- Narcosis adds input drift, tighter darkness, false visual artifacts, HUD instability, and blackout risk.
- The digital depth computer now shows exact deco load, stop depth, gas advice, and narcosis percent.
- Analog/no-gauge instrumentation only gets vague pressure-risk warnings.

Stage 7 is now implemented at MVP level:

- Contracts board is separate from the expedition board and opens from base with `C`.
- Contracts are optional; free expeditions and survey records still work without accepting one.
- Contract entries include contractor, title, objective, flavor, risk hint, reward, and completion state.
- Accepting a contract adds an extra objective to the next normal dive instead of replacing exploration.
- Completed contract rewards are banked only on safe return.
- Contract examples include mapping a ledge, placing a sensor, recovering an instrument, photographing a landmark, and one restrained dark recovery.
- The quiet recovery objective is non-gory and treated as a tag recovery.
- Touch controls use the contextual `JOB` button for contracts at base and cache/recover during dives.

Stage 8 is now implemented at MVP level:

- Diver animation now uses movement-driven presentation state for body pitch, kick phase, and idle buoyancy.
- SVG equipment layers remain the main art format but are drawn with subtle tank, backup bottle, hose, fin, and flashlight motion.
- Fins kick independently from the body, making side-view swimming easier to read.
- The flashlight beam and darkness cutout now aim with the diver's current movement/ascent direction.
- Bubbles originate from the posed diver and vary with gas use, motion, and depth.
- Cave atmosphere is stronger through deeper color loss, water haze, sediment particles, wall silhouettes, shelves, and mineral seams.
- Deep areas feel more hostile without adding enemies or changing core mechanics.

Stage 9 is now implemented at MVP level:

- Scope landed as a shippable expansion layer rather than a rewrite: data-driven dive sites, a site-select board, formal mapping equipment, sediment visibility hazards, and future-map hooks.
- Zacaton should remain the default focused first map.
- Any new site behavior should reuse `GameScene` dive systems instead of forking mechanics.
- Slice 1 complete: `gameData.ts` now defines data-driven dive sites (`Zacaton Main Shaft`, `Limestone Side Passage`, `Open Basin Transect`), site unlock helpers, site-scoped map cell IDs, and site-specific landmarks.
- Slice 1 complete: `GameScene` now has an active dive site helper, site-based max-depth clamping, site entry points, and geometry-specific cave bounds.
- Slice 2 complete: the base board can open a `DIVE SITES` screen with `T`, and touch controls include a `SITE` button.
- Slice 2 complete: mapping rewards now use site-scoped map cells; Zacaton legacy depth bands are still preserved for old saves.
- Slice 2 complete: the survey mapping slate, compact sonar, and survey sensor kit are instrument upgrades. Slate improves mapping rewards, sonar reduces sediment penalties, and sensor kit improves site survey rewards.
- Propulsion polish complete: the shop now includes a diver propulsion vehicle as the top movement upgrade, with faster travel and reduced fin-kick sediment.
- Slice 2 complete: sediment clouds build from movement near walls and reduce visibility without becoming a new death mechanic.
- Slice 2 complete: the open basin map can render faint non-combat wildlife silhouettes for atmosphere only.
- Contracts remain authored for Zacaton; if a contract is active while another site is selected, the HUD reports it as Zacaton-only.

## Important Files

- `src/gameData.ts`: progression schema, upgrades, tank definitions, contracts, flashlight battery helpers, gas/deco helpers, save validation.
- `src/gameData.ts`: also includes Stage 9 dive site definitions, site unlock helpers, and site-scoped mapping helpers.
- `src/scenes/GameScene.ts`: main game state machine, shop/contracts/sites behavior, dive loop, lighting, audio hooks, lifeline/caches, deco/narcosis, sediment, HUD, and canvas presentation polish.
- `src/touch/DiveTouchControls.ts`: mobile/touch virtual input overlay.
- `src/main.ts`: mounts the canvas and touch controls.
- `src/gameData.test.ts`: progression, save-shape, tank, battery, lifeline, gas, deco, and contract helper tests.
- `docs/ROADMAP.md`: staged design plan.
- `docs/README.md`: current feature and control documentation.

## Verification

- `npm run check` passed after Stage 8 work.
- `npm run validate` passed after Stage 8 work.
- `npm run test -- games/zacaton-depths/src/gameData.test.ts` passed after Stage 8 work.
- `npm run smoke` passed after Stage 8 work.
- `npm run check` passed after Stage 9 work.
- `npm run validate` passed after Stage 9 work.
- `npm run test -- games/zacaton-depths/src/gameData.test.ts` passed after Stage 9 work with 15 tests.
- `npm run smoke` passed after Stage 9 work.
- Smoke covered manifest validation, boundary validation, TypeScript type-check, 123 tests, and production build.

## Known Caveats

- Stage 4 audio uses the existing synth audio helper, so ambience is sparse tone pulses rather than a full layered music system.
- Touch controls are visible on touch/coarse-pointer or small screens; desktop remains keyboard-first.
- Flashlight battery is only persisted when the diver safely returns to base, matching the current safe-return banking model.
- Dropped tanks are still lost unless they are cached and then recovered before returning to base.
- Lifeline following uses simple point-to-point guidance against the recorded route, not a full rope physics simulation.
- Deco and narcosis are intentionally simplified pressure systems, not dive-table simulation.
- Contracts have no reputation system yet.
- There is still no manual in-dive gas switching UI or rebreather automation.
- Stage 8 animation is canvas-layered SVG presentation polish, not skeletal animation or new sprite sheets.
- Stage 9 new-map support is still one shared 2D cave scene with data-driven geometry, not separate authored tile maps.
- Side passage and open basin are expansion hooks with site-specific geometry, landmarks, sediment, and atmosphere; Zacaton remains the primary complete route.
- AI companions and multiplayer remain intentionally unstarted.

## Next Work

Stage 4-7 polish, if desired:

- Tune battery capacity/drain values after playtesting.
- Add richer audio once the engine has ambient loops or lightweight generated noise beds.
- Add canvas or DOM click hit zones for desktop mouse-only menu/shop operation if keyboard-free desktop control becomes important.
- Consider an explicit settings panel later instead of only `M`/`V` toggles.
- Tune line lengths, follow speed, and cache reach after playtesting.
- Add richer cache UI if multiple nearby tanks become hard to distinguish.

Stage 6 polish, if desired:

- Tune deco load, safe ascent rate, and stop-clearing speeds after playtesting.
- Add a dedicated gas analyzer or manual gas switcher if multiple mixes become common in one dive.
- Add richer narcosis artifacts after the visual language is settled.
- Add contract reputation, failure consequences, or contractor-specific progression later.

Stage 8 polish, if desired:

- Tune animation amplitudes after playtesting on desktop and touch screens.
- Add more SVG variants later if the single-layer body asset starts to limit readability.

Stage 9 polish, if desired:

- Add deeper authored contracts per non-Zacaton site.
- Add a proper cave-map viewer for site cells.
- Add more site-specific props and route labels once the shared site system settles.
