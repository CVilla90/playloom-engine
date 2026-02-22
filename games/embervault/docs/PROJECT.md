# Embervault Descent

**Tagline:** When the sky burns, dig deeper.

## Short Pitch
A 2D survival-crafting game where you race between calm resource runs and catastrophic meteor waves. Build an underground bunker one paid depth at a time, repair damaged layers, and survive escalating bombardments where a direct meteor strike means instant death.

## Tech Stack
- Language: TypeScript
- Runtime: Browser (Canvas 2D + WebAudio)
- Build tool: Vite 6+
- Package manager: npm
- Rendering: HTML5 Canvas 2D (no external game engine)
- Persistence: `localStorage`
- Automated check: `tsc --noEmit`

## Architecture Overview
### `packages/engine` (Reusable framework layer)
Responsibilities:
- Fixed timestep loop (`60Hz`) and render interpolation support
- Seeded RNG utility
- Scene/state manager
- Input manager
- Canvas renderer helper
- Lightweight entity world
- Collision helpers
- UI draw utilities
- Optional audio wrapper (procedural SFX)

Constraints:
- Engine does **not** import game modules.
- Engine APIs are generic enough for other games.

### `packages/game` (Game implementation layer)
Responsibilities:
- Game scenes (character select, play loop)
- Domain state (`inventory`, `bunker`, `waves`, `player`)
- Meteor spawner and difficulty curve
- Resource gathering and repair economy
- Bunker progression rules and costs
- Save/load logic
- Tutorial and pause/restart UI flows

## Gameplay Rules
### Resources
- `scrap`, `stone`, `metal`, `wood`

### Character Types
- Human: `+20%` gather yield
- Robot: `+30%` repair power
- Animal: `+25%` move speed

### Bunker Layers
- Discrete purchased depth layers; start with 1 layer.
- Layer HP increases by depth.
- Deeper layers absorb more impact and pass less damage downward.
- If a layer reaches `0 HP`, meteors no longer collide with it and can strike deeper intact layers.
- If all unlocked layers are destroyed, meteors pass into the bunker space and can directly hit the player.

### Effort System
- Actions consume effort points instead of gather-time delays.
- Base effort pool: `100`
- Regen: `36 effort/sec`
- Action effort costs:
  - Gather nearby node: variable (`10-24` based on node)
  - Repair: `26`
  - Unlock depth: `34`
- Actions are blocked when required effort exceeds current effort.

### Upgrade Cost Table
| Unlock Depth | Scrap | Stone | Metal | Wood |
|---|---:|---:|---:|---:|
| 2 | 18 | 24 | 8 | 14 |
| 3 | 32 | 38 | 16 | 24 |
| 4 | 50 | 58 | 30 | 36 |
| 5 | 74 | 86 | 46 | 48 |

### Repair Cost & Effect
- Repair action consumes: `4 scrap + 3 metal + 2 stone`
- Base repair: `22 HP` on most damaged unlocked layer
- Robot bonus applies to repair amount

### Meteor Damage & Scaling
- Waves recur on random interval in `[30s, 90s]`
- Wave intensity scales by elapsed wave count:
  - More meteors per wave
  - Higher average fall speed
  - Higher meteor size and impact damage
- Meteor contact with player is immediate game over.

## Controls
- `A/D` or `Left/Right`: move
- `W/S` or `Up/Down`: move vertically within unlocked depth
- `E`: instantly gather nearby resource node (consumes effort)
- `R`: repair bunker layer
- `U`: purchase next bunker depth
- `Esc` or `P`: pause/resume
- `Enter`: restart after game over
- `H`: toggle tutorial/help overlay

## Phase Plan (Each Phase Runnable)
### Phase 1 - MVP Survival Loop
Scope:
- Player movement
- Meteors falling
- Collision = instant game over
- One bunker layer with HP display
- Minimal HUD

Acceptance criteria:
- Player can move and avoid meteors
- Meteors damage bunker layer on impact
- Direct player hit immediately ends run

Run script:
- `npm run dev:phase1`

### Phase 2 - Economy Foundations
Scope:
- Resource node spawning and gathering
- Inventory HUD
- Repair action with costs and bunker HP restore
- Meteor wave timing randomized in `[30,90]` seconds

Acceptance criteria:
- Gathering increases resources
- Repair consumes resources and restores damaged layer HP
- HUD shows next-wave random range and countdown

Run script:
- `npm run dev:phase2`

### Phase 3 - Progression + Difficulty
Scope:
- Character selection (human/robot/animal)
- Bunker depth purchases with cost table
- Deeper layer protection model
- Difficulty curve across waves
- Save/load baseline (`localStorage`)

Acceptance criteria:
- Character choice changes gameplay stats
- Player can unlock deeper layers through resources
- Wave danger increases over time
- Save/load restores run state + seed

Run script:
- `npm run dev:phase3`

### Phase 4 - Polish + Robustness
Scope:
- Tutorial overlay / first-run hints
- Pause menu improvements
- Procedural audio feedback
- Balance pass and UI clarity polish

Acceptance criteria:
- First-run tutorial appears and is dismissible
- Pause and restart flows are reliable
- Audio cues play for core events
- Full game loop is stable and offline-capable once built

Run script:
- `npm run dev` (phase 4 default)

### Phase 5 - Layout + Layer Penetration
Scope:
- HUD moved to dedicated side columns (no overlap with playable viewport)
- Meteor collision checks respect destroyed layers and penetrate to deeper intact layers
- If all layers are destroyed, meteors remain active and can hit player directly

Acceptance criteria:
- Gameplay viewport is never covered by HUD panels
- Layer `0%` integrity no longer blocks impacts
- Direct meteor risk increases once bunker is fully breached

Run script:
- `npm run dev`

### Phase 6 - Instant Gather + Effort Economy
Scope:
- `E` gather becomes instant (no hold/progress wait)
- Shared effort pool gates actions and recharges quickly
- Gather/repair/upgrade all validate effort before executing

Acceptance criteria:
- Pressing `E` near a node collects immediately if effort is sufficient
- Effort bar clearly shows spend + recovery
- No action can execute if effort is below its cost

Run script:
- `npm run dev`

### Phase 7+ - Planned Roadmap
Scope ideas:
- Player level-up system with stat choices (effort max, regen, repair efficiency, gather yield)
- High-cost advanced actions to make progression choices meaningful
- Deeper visual damage representation per bunker layer (cracks, scorch marks, structural states)

## Determinism & Save
- Simulation uses fixed timestep (`1/60s`).
- RNG uses a seeded deterministic generator.
- Save includes RNG seed and simulation-critical state to keep runs reproducible.
