# Zacaton Depths

MVP technical diving game inspired by deep vertical sinkholes such as El Zacaton in Mexico.

## Core Loop
- Start an open expedition from the board.
- Descend through a mostly straight vertical underwater cave capped near 339m.
- Optional survey records still pay funding, but a run can simply be exploration.
- Active swimming below the surface slowly builds unbanked expedition funding.
- First-time depth-band mapping and rare landmark discoveries pay larger unbanked rewards.
- Depth increases the funding multiplier for exploration, mapping, and landmarks.
- Expedition funding is banked only after returning to base alive.
- Owned tanks keep their remaining fill after a safe return and can be refilled cheaply in the shop.
- Dropped tanks reduce carried weight immediately, but are lost without a lifeline and must be rebought.
- Full and empty tanks both add weight; heavier rigs descend faster and ascend more slowly.
- Tank gas drains over time when equipped and drains faster at greater depth.
- Flashlights drain battery only while switched on; stronger lights have longer runtime.
- Music and sound effects are opt-in and default to off.
- A lifeline spool can be deployed from the entry, followed home for a route boost, and used for temporary tank caches.
- Decompression load builds on deeper dives; fast ascents or missed stops can injure the diver even with gas remaining.
- Deep air increases narcosis and gas toxicity risk; trimix planning makes deep zones more manageable.
- Contracts are optional and separate from free expeditions; accepting one adds an extra objective and reward.
- Dive sites are selectable from a separate board; Zacaton remains the primary route, with side-passage and open-basin expansion hooks.
- Formal mapping cells, compact sonar, survey sensors, a diver propulsion vehicle, and sediment clouds support future map expansion without forking the dive loop.
- Diver pose, fins, equipment, bubbles, sediment, wall silhouettes, and water haze respond to movement and depth for clearer side-view presentation.
- Hidden lung oxygen exists even when it is not shown in the HUD.
- Successful survey records award research funding.
- Spend funding in category submenus for gas, light, propulsion, instruments, and safety.
- The player starts with breath-hold air only: no tank, no flashlight, no fins, and no depth gauge.

## Survey Records
- Record 1: reach the first shelf and return, reward $140.
- Record 2: reach the thermocline drop and return, reward $230.
- Record 3: reach the lower bell and return, reward $360. It is not blocked by equipment, but it is very risky without upgrades.
- Exact depth is hidden until the player buys instruments: no gauge shows rough zone language, analog gauge shows coarse rounded depth, and digital computer shows exact depth, ascent/descent rate, decompression load, and gas advice.

## Exploration Funding
- Dive HUD shows banked funding, pending expedition funding, and new finds.
- Surface log breaks down banked money into exploration, mapping, landmark, contract, and survey-record rewards.
- Dying or aborting before returning to base loses pending expedition funding and unlogged discoveries.
- Persistent map progress tracks site-scoped mapping cells, legacy Zacaton depth bands, and discovered landmarks.

## Dive Sites And Mapping
- Press T at base to open the dive site board.
- Zacaton Main Shaft is the default and remains the focused first map.
- Limestone Side Passage unlocks after mapping at least 60m and uses a narrower lateral cave profile with heavier sediment.
- Open Basin Transect unlocks after mapping at least 30m and uses wider open-water geometry with non-combat wildlife silhouettes.
- The survey mapping slate turns rough route notes into formal map-cell rewards.
- Compact sonar reduces sediment visibility penalties and supports hidden-chamber routes.
- The survey sensor kit improves formal survey rewards on routes with sensor lines.
- The diver propulsion vehicle, or DPV, is the top propulsion upgrade: it improves movement speed while reducing fin-kick sediment.
- Sediment clouds build from swimming near walls and fade over time; they reduce visibility but are not a separate death system.

## Tank Inventory
- Gas shop entries buy missing tanks or refill owned tanks depending on current inventory state.
- Current tank slots are single cylinder, twin set, and reserve pony bottle.
- Each tank tracks gas mix, capacity, current fill, empty weight, full weight, buy cost, and refill cost.
- Refilling an owned tank is cheaper than replacing it.
- Returned empty tanks remain owned and can be refilled.
- Dropped tanks are removed from the diver and disappear from the sprite; only tanks cached on the lifeline and recovered before return survive the expedition.

## Decompression And Narcosis
- Deco load builds below the shallow zone and clears slowly during shallow pauses.
- The digital depth computer shows exact deco load and recommended stop depth.
- Surfacing with unresolved deco load is blocked until the diver descends and clears the stop.
- Ascending faster than the safe ascent rate while loaded creates decompression stress and can end the dive.
- Narcosis rises with depth and gets worse when breathing air in deep zones.
- Narcosis narrows visibility, adds input drift, creates false visual artifacts, and can black out the diver if ignored.
- Trimix planning converts the twin set to trimix refills and reduces deep narcosis risk.
- The digital computer recommends air or trimix based on current depth, but there is still no manual in-dive gas switcher.

## Contracts
- The contracts board is separate from the expedition board.
- Press C at base to review optional short contracts.
- Accepting a contract does not replace the open expedition or survey record.
- Contract objectives include mapping a ledge, placing a sensor, recovering an instrument, photographing a landmark, and a rare quiet recovery.
- Contractor, objective, risk hint, and reward are shown before accepting.
- Contract rewards are paid only after the objective is completed and the diver returns safely.
- The quiet recovery contract is non-gory and handled as a restrained tag recovery.

## Lifeline And Caches
- Safety shop entries install a lifeline spool and a longer line extension.
- Pressing L during a dive deploys the line from the surface entry and records the paid-out path.
- The line has a length limit; the base spool reaches 120m and the extension reaches 260m.
- Holding H near the deployed line pulls the diver toward earlier line points for a route-home movement boost.
- Pressing C near the line caches the emptiest carried tank on the guideline.
- Pressing C near a cached tank recovers it with its remaining fill, making it part of the carried rig again.
- Unrecovered caches are still left behind when the expedition returns to base.

## Light And Audio
- Light shop entries install flashlight upgrades; owned light entries recharge the current battery.
- The dive HUD shows battery charge and warns when the flashlight is low or empty.
- Better flashlight upgrades improve light radius, cone reach, and battery duration.
- Music ambience is sparse and becomes more intense with depth when enabled.
- Sound effects cover breathing pulses, warning cues, flashlight toggles, surface return, tank drops, landmark discovery, and failure.

## Animation And Presentation
- The diver pitches more clearly when ascending, descending, or leveling out.
- Fins kick independently from the body drift, and idle buoyancy keeps the diver from reading as static.
- Tanks, backup bottle, hose, and flashlight layers have subtle motion while remaining attached to the diver.
- The flashlight beam and darkness cutout aim with the diver's movement direction.
- Bubbles, sediment particles, depth haze, cave shelves, wall silhouettes, and mineral seams are stronger at depth.

## Controls
- WASD or arrow keys: swim left, right, up, and down.
- F: toggle the flashlight after buying a light.
- Q: drop the emptiest carried tank during a dive.
- L: deploy the lifeline after buying a spool.
- H: hold near the lifeline to follow it home faster.
- T at base: open dive site selection.
- C at base: open contracts.
- C during a dive: cache a tank on the lifeline or recover a nearby cached tank.
- Enter or Space: start an expedition, accept the surface return prompt, continue from reports, or buy selected shop item.
- Esc or N at the surface prompt: continue exploring.
- S: explicitly open the shop from the expedition board or incident report.
- M: toggle music ambience.
- V: toggle sound effects.
- Up/Down arrows: select shop category or submenu item.
- Escape or Backspace: leave shop, abort a dive, or return to the expedition board.
- R: reset progress from the expedition board.
- Touch/small-screen overlay: movement pad plus buttons for dive/confirm, back, light, drop, line, home, job/cache, site, shop, music, and sound effects.

## Upgrades
- Gas submenu: buy/refill single cylinder, twin set, reserve pony bottle, and simplified trimix planning.
- Light submenu: handheld flashlight, stronger flashlight, and wide-beam filter.
- Propulsion submenu: rubber fins, technical fins, and a diver propulsion vehicle.
- Instruments submenu: analog depth gauge, digital depth computer, survey mapping slate, compact sonar, and survey sensor kit.
- Safety submenu: lifeline spool and line extension reel.

## Implementation Notes
- Game-specific survey, exploration, tank inventory, save, and upgrade data lives in `src/gameData.ts`.
- The MVP state machine is in `src/scenes/GameScene.ts`.
- SVG diver and equipment layers live in `assets/svg/` and are registered in `assets/asset.manifest.json`.
- Future development stages are tracked in `docs/ROADMAP.md`.
- Stage 9 site expansion is data-driven from `DIVE_SITES`; cave bounds and depth limits use the active site instead of a forked scene.
- Darkness is rendered as a top mask layer with light cutouts, similar to `backrooms-breaker-floor`.
- Natural light fades by depth: bright to 30m, darker to 60m, serious darkness by 100m, and near-black by the lower Zacaton shaft.
- Cave visuals use SVG layers plus canvas silhouettes for wall plants, rocks, limestone shelves, mineral seams, water haze, sediment, and open-water wildlife atmosphere.
- Non-diegetic depth marker lines are not rendered; the surface breathing zone is the only fixed line in the cave.
- Returning above the surface line refills hidden lung oxygen and pauses oxygen-deprivation death.
- Below 50% hidden lung oxygen, visibility tightens; below 25%, creamy-red warning flashes lead to drowning on the fourth flash.
- There are no enemies, combat, detailed gas switching, reputation system, AI companions, multiplayer, or rebreather automation in this version.
