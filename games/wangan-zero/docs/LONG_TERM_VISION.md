# Wangan Zero: Long-Term Vision

## Product Statement

`Wangan Zero` is a cockpit-first street-racing RPG set across the nocturnal expressways of a fictional Japanese bay metropolis. The player cruises authored highway sections, encounters rival drivers and clubs, issues or receives challenges, earns reputation and currency, and develops inexpensive street cars into machines capable of competing with the city's most respected builds.

The game does not depend on inventing a new racing ruleset. Its defining value is the combination of:

1. A cinematic sensation of speed from inside the car.
2. A tactile manual-driving experience that works especially well on touchscreens.
3. A persistent RPG structure built around cars, upgrades, garages, reputation, clubs, and rival relationships.
4. A believable, active midnight expressway world.

## Tone and Identity

- Late-twentieth-century Japanese tuning culture and night-driving nostalgia, without being restricted to one decade.
- Dense urban night scenery: elevated roads, tunnels, bridges, industrial waterfronts, skyline masses, apartment lights, signage, exits, and ordinary traffic.
- Roads and cities should feel inhabited and functional rather than like isolated race arenas.
- Music, engine character, environmental audio, lighting, cockpit reflections, camera motion, and speed effects are primary systems rather than final polish.
- Cars, manufacturers, badges, body details, liveries, clubs, characters, road networks, and music must be original. Real-world automotive eras and engineering categories may guide the design, but production content should remain fictional and legally distinct.

## World and Route Structure

- Driving sessions always begin with the player already on the expressway.
- The player selects an unlocked entry section before appearing on the road.
- Maps are authored, fixed routes rather than procedurally generated roads.
- Long straights are the dominant rhythm, interrupted by light curves, tunnels, bridges, lane splits, and exits into connected expressway sections.
- Connected sections should eventually create the impression of a continuous metropolitan road network.
- The prototype now presents its six sectors as one fictionalized closed loop on Reimei's in-console GPS. Sector coloring and the live player marker establish the display path for future rival and multiplayer markers, even though current physics remain one-dimensional.
- Clubs have favored sections or territories, making their members more likely to appear on particular routes.
- Time, weather, traffic density, special events, and club activity can vary while road geometry remains authored.

## Traffic and Lane Awareness

- The first traffic prototype uses a three-lane expressway with the player cruising in the center lane.
- Civilian traffic occupies only the left and right lanes during this phase, keeping the center lane clear while relative-speed behavior and visual scale are developed.
- Traffic vehicles cruise near ordinary Japanese expressway speeds, with modest driver-to-driver variation so some vehicles are slightly faster or slower than others.
- Every traffic vehicle needs an acknowledged lane, forward position, and cruising speed. Its position relative to the player determines whether it is ahead, alongside, or behind.
- When the player is faster, a distant vehicle begins small near the horizon and grows as the player approaches and overtakes it.
- When the player slows or stops, faster traffic approaches from behind, becomes larger as it passes beside the cockpit, and then shrinks toward the horizon ahead.
- A first functional rearview mirror is part of this traffic phase so vehicles approaching from behind remain readable before they pass.
- Traffic-car perspective uses pre-rendered, mirrorable yaw frames from one reusable low-poly 3D source model. The rear-facing frame set covers `0°`, `4°`, `8°`, `16°`, `24°`, `36°`, `52°`, `70°`, and `90°`; lateral passing position selects the view while distance controls sprite scale. A supplemental front-facing `0°`/`4°` pair exists for behind-player/rearview/rival readability. This preserves one car's proportions throughout a pass and makes wheel visibility increase naturally as the viewing angle opens.
- Large traffic reuses the same perspective pipeline. The integrated truck is a simple solid three-axle container carrier with a closed freight box, deliberately larger and taller than the sedan while retaining clean mirrorable yaw frames and its own front-facing `0°`/`4°` pair.
- Later traffic iterations may occupy the center lane and require lane changes, braking, and overtaking decisions. The clear center lane is an intentional early-prototype constraint, not the final traffic design.

## Cockpit and Driving Experience

- The road remains the visual focus.
- The current prototype may fake light curves visually while retaining straight-line lane/traffic physics until true authored road geometry exists.
- The visible interior includes the steering wheel, dashboard, gauges, center console, manual shifter, mirrors, windshield framing, and vehicle-specific trim.
- Speed must be communicated simultaneously through road texture velocity, passing lights, parallax, camera vibration, suspension motion, field-of-view changes, wind, tire noise, drivetrain pitch, gear changes, reflections, and environmental compression.
- Background architecture should move as one continuous system and morph between city buildings, tunnel structure, bridge pylons, and other route identities instead of stacking isolated scenic overlays.
- The intended final transmission model includes accelerator, brake, clutch, and fully manual gear selection.
- Touchscreen clutch and shifting are intended to become meaningful mechanics rather than simplified UI buttons.
- The current prototype uses sequential shifting without a clutch as the intermediate step.
- The current prototype approximates a power band by increasing acceleration with RPM. A later drivetrain model should use vehicle-specific torque and horsepower curves, gear ratios, mass, drag, traction, and upgrade effects.
- Steering and timed/signaled lane changes now exist in the prototype; future traffic iterations can deepen lateral collision, AI personality, and blinker-reading behavior.

## Cars and Balance

- All production vehicles are fictional designs inspired by broad categories of historically significant sports cars, grand tourers, tuned coupes, and rear-engine performance cars.
- `Project Shirokage` is an original compact 1980s-inspired coupe with an extended angular roofline, two-door cues, and simple red/amber/white rear lamps. Its white/black `221 km/h` version is now the slowest ambient rival, while its red variant reaches `261 km/h`. Its conservative closed geometry keeps the vehicle solid at steep three-quarter angles.
- The first additional rival bodies are the orange compact-liftback `Hibana RS`, teal grand-tourer `Aonami GT`, and violet mid-engine wedge `Kagero VX`. Their current ambient personalities establish the intended range: aggressive acceleration, patient high-speed running, and precise high-performance braking respectively.
- `Reimei XR` is the current hero/player car: a deep-cobalt front-mid-engine coupe with a long low nose, rear-set canopy, broad shoulders, gold side blade, and divided full-width tail signature. Its runtime drivetrain has improved acceleration, balances torque against aerodynamic load near `321 km/h` without assistance, and reserves its absolute `331 km/h` limit for drafting or future power bonuses.
- The player begins with an affordable, relatively slow car.
- Later and more expensive cars begin at higher performance tiers.
- Early cars can reach overlapping competitive performance bands with late-game cars, but require substantially more yen and workshop investment to get there.
- Balance should preserve meaningful differences in handling, power delivery, gearing, weight, cockpit character, and upgrade cost without making starter cars disposable.
- The player can own multiple cars, including multiple examples of the same model with different builds.
- Every active car has a visible speed or performance rating used by the encounter system.

## Garage, Tools, and Upgrades

- The garage stores the player's vehicle collection.
- Garage expansions unlock additional vehicle slots.
- The workbench and tool set can be upgraded.
- Higher tool tiers unlock more advanced part installation and tuning.
- Upgrade categories can include engine internals, induction, exhaust, cooling, electronics, transmission, differential, suspension, brakes, tires, weight reduction, and aero.
- Upgrades affect both numerical performance and sensory presentation, especially engine sound, acceleration, rev behavior, shifting, cockpit vibration, and maximum speed.
- Reputation milestones and club-leader victories unlock special parts or tuning knowledge.

## Reputation and Progression

- The player begins as an unknown local driver.
- Early rivals are primarily other amateurs.
- Increasing reputation attracts established drivers and organized clubs.
- Club progression moves through members of increasing status before the player can challenge a leader.
- Winning grants currency and reputation.
- Rewards increase with the rival's reputation and challenge level.
- Losing does not remove currency, but it removes a small percentage of reputation.
- Defeating leaders and reaching reputation thresholds unlocks routes, encounters, tools, upgrades, and special parts.

## Rival Encounters

- Rivals appear dynamically while the player cruises.
- Reputation and the current car's performance rating remain separate matchmaking dimensions.
- Driver reputation determines who is aware of or interested in the player.
- Vehicle rating determines which cars can provide a reasonably competitive run.
- Most encounters should be near the player's current level, with a controlled long-tail chance of meeting much weaker or stronger drivers.
- A highly reputable player in a slow car can encounter both respected drivers and cars close to the current vehicle's rating.
- Club territory, route, time, recent victories, rival personality, and story state modify encounter probability.
- High-reputation rivals and club leaders remain rare at low reputation but never mathematically impossible.

## Challenge Flow

- Driving near a rival reveals a compact prompt with the driver's name, club, reputation, car, and vehicle rating.
- The player may issue a challenge or continue cruising.
- Rivals may also challenge the player.
- Challenge acceptance depends on driver personality, reputation difference, vehicle-rating difference, club relationships, and current narrative state.
- Large mismatches increase rejection probability without making acceptance impossible.
- A powerful rival may dismiss an unknown slow driver with a short response such as `Not interested.`
- Occasionally, an underdog accepts an apparently unfair race. These exceptions should create memorable stories.
- The final race-start ritual should feel diegetic and immediate, without moving the player into a separate sterile event menu.

## Race Format

- Initial race formats focus on high-speed expressway duels.
- A race begins from an existing cruise encounter.
- Win conditions should reward maintaining pressure, controlling speed, choosing lanes, and surviving traffic rather than relying only on a conventional closed-circuit finish line.
- The precise duel scoring model remains open for prototyping.
- Traffic and route exits eventually become tactical elements.

## Economy

- Currency is denominated in yen and pays for cars, garage space, tools, parts, repairs, and tuning work.
- Winning races is the primary early income source.
- Higher-reputation opponents yield larger rewards.
- The economy should support long-term investment in a favorite starter car while still making later vehicles desirable.
- Losing a race never directly removes money.

## Online Direction

- Long-term online play supports shared cruising and direct duels.
- Players should be able to meet naturally on a route, inspect one another's car/reputation summary, and issue challenges using the same language as AI rival encounters.
- Online systems should preserve the authored-road, cockpit-first atmosphere rather than turn the game into a lobby-first experience.
- The current proof of concept remains single-player.

## Presentation and Audio

- Each car needs a recognizable engine, intake, exhaust, transmission, tire, wind, and cabin sound profile.
- Gear ratios, rev limits, upgrades, tunnels, barriers, and speed must affect the mix.
- The soundtrack should reinforce midnight urban driving without copying existing compositions.
- Menus, garages, cruising, rival encounters, and duels can have distinct musical intensity.
- The title screen uses a darker action-rock theme to establish risk and speed before the player drives.
- The softer original theme remains reserved for a later garage, planning, or secondary menu context.
- Visual development should prioritize readable darkness, city-light density, reflective surfaces, tunnel rhythm, bridge silhouettes, road signage, and vehicle-specific cockpit detail.

## Development Sequence

1. Cinematic straight-line speed prototype.
2. Sequential manual shifting and rev behavior.
3. Clutch and full manual transmission.
4. Lane changes and traffic.
5. One rival encounter and challenge flow.
6. One complete duel format.
7. Reputation, rewards, and persistent save.
8. Garage, one upgrade ladder, and performance rating.
9. Multiple authored route sections and exits.
10. Clubs, territories, hierarchy, and leader unlocks.
11. Expanded vehicle roster and deep tuning.
12. Shared online cruising and player duels.

This sequence is directional rather than contractual. Each step should preserve the existing sensation of speed before adding more systems.
