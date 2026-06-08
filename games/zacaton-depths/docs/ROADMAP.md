# Zacaton Depths Roadmap

This roadmap keeps the game moving from a simple vertical dive prototype toward an open technical-diving exploration game. The guiding rule is to add one playable pressure at a time: exploration, planning, weight, light, gas, decompression, then contracts and mystery.

## Design Pillars

- Open expeditions first: the player can dive without accepting a mission.
- Survival comes from planning, darkness, gas, depth, weight, and ascent decisions.
- Information is equipment-gated: the player should not know exact depth, gas advice, or decompression risk without the right tools.
- Mobile-ready controls are added gradually: every keyboard action should eventually have a click or touch equivalent.
- Audio is opt-in: music and sound effects default off, with clear toggles.
- Darkness is part of the simulation: deep water, weak lights, low oxygen, and narcosis can all reduce what the player sees.
- Keep each stage shippable before starting the next one.

## Stage 1 - Expedition Baseline

Goal: make the current game fully match the open-exploration direction before adding deeper systems.

- Set the cave depth target to 339m to match the Zacaton-inspired depth goal.
- Remove non-diegetic depth marker lines from the cave view.
- Hide exact depth unless the player owns a depth tool.
- Without a gauge, show only rough depth language such as "shallow", "descending", "deep", or "unknown".
- With an analog gauge, show coarse rounded depth.
- With a digital computer, show exact depth and ascent/descent rate.
- Keep survey records optional and present them as discoveries or records instead of missions.
- Increase tank gas duration so dives feel planned rather than instantly doomed.
- Keep surface safety behavior: above the surface line, oxygen deprivation pauses and lungs refill.

Acceptance:

- A player can start an expedition with no contract.
- The player does not see exact depth without buying a depth gauge.
- The deepest reachable world space is around 339m.
- Existing smoke tests pass.

## Stage 2 - Exploration Funding

Goal: make every expedition useful, even when the player does not complete a formal objective.

- Add a per-dive unbanked funding counter.
- Award tiny funding for active exploration time or distance traveled, capped to prevent surface farming.
- Divide the cave into mapping cells or depth bands.
- Award better funding the first time a new cell or depth band is mapped.
- Add rare landmark discoveries with larger one-time rewards.
- Apply a depth multiplier to exploration, mapping, and landmark rewards.
- Bank expedition funding only when the player returns to base alive.
- On death, lose unbanked expedition funding, while permanent funding remains.

Acceptance:

- Swimming around slowly earns a small amount.
- First-time mapping pays more than repeat swimming.
- Landmark discovery pays clearly more than normal mapping.
- Returning to base banks the dive results.
- Dying discards only unbanked dive earnings.

## Stage 3 - Tank Inventory, Refills, and Weight

Goal: turn gas tanks into concrete objects that affect planning and movement.

- Replace simple tank upgrades with tank inventory slots.
- Each tank has type, gas mix, max capacity, current fill, weight full, weight empty, refill cost, and replacement cost.
- Owned tanks can be filled, partially empty, empty, dropped, recovered, or lost.
- Refilling an owned tank is cheaper than buying a new one.
- Dropping a tank reduces carried weight.
- Empty tanks still weigh something, so dropping empties can make ascent easier.
- If a tank is dropped without a lifeline/cache system, returning to base marks it as lost and requires replacement.
- Show tank slots in the HUD and shop with fill state, gas label, and weight impact.
- Add mouse/touch actions for tank inspection, refill, buy, and drop.

Acceptance:

- Carrying more tanks makes descent easier and ascent harder.
- Dropping a tank immediately improves ascent handling.
- Returning with an empty tank allows cheap refill.
- Leaving a tank behind without recovery requires buying a replacement.
- The player can understand tank count and fill state from the UI.

## Stage 4 - Light, Batteries, Sound, and Mobile Controls

Goal: make darkness, atmosphere, and mobile interaction feel intentional.

- Add flashlight battery charge.
- Flashlight battery drains only while the light is on.
- Better flashlights provide stronger beam, wider radius, and longer battery life.
- Add warning states for low battery.
- Add shop actions for replacing or recharging batteries if needed.
- Add settings toggles for music and sound effects, both defaulting to off.
- Add low, subtle ambience that becomes more intense with depth when music is enabled.
- Add sound effects for breathing, bubbles, flashlight toggle, low gas warning, surface splash, tank drop, and landmark discovery.
- Add click/touch controls for starting dives, returning to base, shop navigation, flashlight toggle, and tank actions.
- Add an optional on-screen movement pad for mobile.
- Ensure UI hit targets are large enough for touch.

Acceptance:

- The flashlight can run out of battery.
- Better light equipment lasts longer and visibly improves exploration.
- Sound never starts unless the player opts in.
- A full expedition can be started, played, and exited with mouse/touch controls.

## Stage 5 - Lifeline and Tank Caches

Goal: add a cave-diving safety tool that also supports deeper future systems.

- Add a lifeline spool item.
- When deployed, the line follows the player path from the surface or entry point.
- Show the line clearly but minimally in the cave.
- Let the player follow the deployed line back toward base for a movement boost.
- Let the player attach tanks to the lifeline as caches.
- Cached tanks persist during the expedition and can be recovered or used later.
- Add a simple line-length limit that can be upgraded.
- Add touch/click controls for deploy, follow, cache tank, and retrieve tank.

Acceptance:

- The lifeline visually marks the route home.
- Following the lifeline toward base is faster than normal swimming.
- Tanks cached on the line can be picked back up.
- Cached tanks are not considered lost if recovered before returning.

## Stage 6 - Deco Load, Narcosis, and Gas Mixtures

Goal: add realistic diving pressure without overwhelming the player.

- Add deco load as the first ascent-risk system.
- Deco load builds while deep and falls slowly at shallower depths.
- Fast ascent with high deco load increases danger and can kill the player.
- Add visual warnings before death: blur, tunnel vision, red/cream pulses, and unstable HUD.
- Add simple decompression stop guidance once the player owns the right instrument.
- Add narcosis as a separate deep-depth risk.
- Narcosis increases with depth and wrong gas choice.
- Narcosis causes control drift, blur, delayed input, false visual hints, or hallucination-like artifacts.
- Add gas types gradually: air for shallow zones, trimix for deeper zones, then later richer systems.
- Wrong gas at depth increases narcosis or toxicity risk.
- Add a purchasable gas analyzer/depth computer that recommends the right mix for current depth.
- Add high-end rebreather equipment later that can automate gas management.

Acceptance:

- The player can die from reckless ascent even with remaining gas.
- A careful ascent allows deco load to reduce.
- Wrong gas choice makes deep dives feel risky before it becomes fatal.
- Better instruments make safe diving easier without playing the game for the player.

## Stage 7 - Contracts and Dark Discoveries

Goal: add optional authored objectives without replacing free exploration.

- Add a contracts menu separate from expeditions.
- Contracts are optional and short.
- Each contract includes contractor name, objective, short flavor text, risk hint, and reward.
- Contract examples:
  - Map a newly reported ledge.
  - Place a sensor at a target depth.
  - Recover a lost instrument.
  - Photograph a mineral formation.
  - Rarely, recover a dead diver.
- Keep dead-body discoveries rare, quiet, and non-gory.
- Add reputation later based on contract type, success, failure, and contractor.
- Allow contracts to point toward landmarks but keep exploration discoveries possible without contracts.

Acceptance:

- The player can ignore contracts and still progress through exploration funding.
- Accepting a contract gives a clear extra reward objective.
- Contractor details add tone without becoming a dialogue system.
- Rare dark events feel memorable, not routine.

## Stage 8 - Animation and Presentation Polish

Goal: make the diver and cave feel more alive without changing core mechanics.

- Add more side-profile diver animation frames.
- Animate fin kicks separately from body drift.
- Animate tank and hose movement subtly.
- Add stronger body pitch changes for ascending, descending, and horizontal swimming.
- Add idle buoyancy movement.
- Add hand/flashlight aiming that follows movement direction.
- Improve sediment particles, bubbles, water haze, wall silhouettes, shelves, rocks, plants, and mineral seams.
- Add stronger depth-based color loss.
- Keep SVG as the main art format.

Acceptance:

- Movement reads clearly from the side view.
- Equipment remains visibly attached through animation.
- Deep areas feel darker and more hostile without adding enemies.

## Stage 9 - New Maps and Long-Term Expansion

Goal: leave room for the game to grow beyond the Zacaton shaft.

- Add other maps after the vertical sinkhole loop is strong.
- New maps can include horizontal caves, branching passages, open sea entries, sensor routes, and hidden chambers.
- Add cave mapping as a formal tool.
- Add sediment clouds that reduce visibility.
- Add sonar and survey sensors.
- Add AI companions later for rescue, contract help, or tutorial guidance.
- Consider multiplayer only after inventory, lifeline, gas, and contracts are stable.
- Add atmospheric wildlife only in open-water maps, not as combat.

Acceptance:

- Zacaton remains the focused first map.
- New maps reuse shared systems instead of forked gameplay logic.
- Multiplayer or AI work does not begin until the single-player dive loop is strong.

## Immediate Implementation Order

1. Stage 1: expedition baseline, 339m depth, hidden depth UI, no marker lines.
2. Stage 2: exploration funding and discoveries.
3. Stage 3: tank inventory, refill/rebuy/drop, and weight.
4. Stage 4: flashlight batteries, opt-in sound, and mouse/touch controls.
5. Stage 5: lifeline and tank caches.
6. Stage 6: decompression and gas correctness.
