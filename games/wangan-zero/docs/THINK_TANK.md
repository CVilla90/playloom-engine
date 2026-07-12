# Wangan Zero: Think Tank (future ideas)

> **Status: brainstorm with some items now promoted.** Captured 2026-07-05 for future planning. The clean player/rival sprite sources described in item 2 now exist, five ambient rivals are integrated, Reimei XR is the player car, a first rear-view mirror and in-console loop GPS exist, a first proximity drafting model is implemented, and timed/signaled lane changes are implemented. The remaining mechanics here are still ideas only. The polished direction lives in `LONG_TERM_VISION.md`; this file is the raw parking lot.
>
> **Content rule still applies:** every car body/badge, rival name, place name, and music track must be **original and legally distinct**. Real games/eras (Tokyo Xtreme Racer Zero, Top Gear 2, JDM tuning culture) are *feel references only* — no copied art, names, or compositions.

---

## 1. Draft train + speed exchange on rear contact

> **Status: IMPLEMENTED (2026-07-11, HANDOFF item set "latest session").** The shipped design differs from the sketch below in the tuned details: instead of a full speed swap, a hard bump trades the closing delta (front car +50%, rear car −65%, 15% crunch — the rear car never drops below the front car's pre-hit speed, and the bumped car exits faster so the pair separates); soft contact (<8 kph closing) merges train partners to their momentum average with no penalty, which is the actual train-feed mechanism; exchanges are mass-weighted (the truck barely moves); traffic bleeds donated speed back to cruise while rivals keep it; leaders get a new `LeadPush` power bonus from a car glued behind; and the Reimei profile gained headroom (348 ceiling) so trains reach the mid-330s. Remaining future layers: 3+-car AI train choreography, drafting/duel-score interaction, damage.

The first **proximity draft** pass now exists in `src/draftModel.ts`: same-lane trailing vehicles get a speed- and distance-based acceleration power multiplier (now concentrated at the bumper with a leader-side push bonus).

**Implemented proximity draft.** A car sitting closely behind another gets an acceleration boost while it stays close behind (reduced drag in the slipstream). Player, traffic, and rivals consume the same model.

**Draft train.** Two cars nose-to-tail both go faster: the one **behind** gains from drafting; the one **ahead** gains because it's being *pushed* by rear contact from the car behind. Chain several and you get a train that's faster than any one car alone.

**Rear-contact = speed exchange (retune of the collision system).** Today `collision.ts` hard-caps the player to the blocker's speed and just holds position. The new model, when car A hits car B from behind:
- **A (the one behind)** drops **down** to B's speed (the car it just hit).
- **B (the one ahead)** is pushed **up** to the speed A had a moment before the hit.
- i.e. the two **exchange** speed on contact, instead of A simply being capped.

**Against traffic.** The exchange still happens — the player is drastically cut to the traffic car's speed, and the traffic car is momentarily shoved up to the player's (higher) speed. But traffic wants to hold a "legal"/**programmed** cruising speed, so the instant it's pushed above that, it spends a few seconds **decaying back down** to its programmed speed. So you can bump a slow car forward briefly, but it bleeds off — traffic is a soft, temporary launch pad, not a train partner.

**Against a rival / another player.** They're usually *accelerating*, so a rear bump gives them a boost they'll **want to keep** (they won't decay it away like traffic) — unless they're already at their top speed. So rival contact genuinely helps the car ahead, which is what makes the push-train interesting between two willing players.

**Touches:** `collision.ts` (replace the hard speed-cap with a bidirectional exchange) and `trafficModel.ts` (decay pushed traffic back toward its programmed/cruise speed). Open questions: how much speed transfers on contact vs. is lost, damage/penalty (probably none early), and how drafting interacts with the duel score below.

---

## 2. Player / rival car sprites (new 3D render) + name labels

- The white/black compact `Project Shirokage` source now exists and is integrated as the slowest rival (`tools/generate-shirokage-car-sprites.mjs`). The red rival reuses its solid geometry; Hibana RS, Aonami GT, Kagero VX, and the player-owned Reimei XR share the proven mirrorable yaw pipeline.
- Rivals (and remote players online) draw their **name floating above the car**.
- Same pipeline as the traffic car: one OBJ/MTL source, offline-rasterized transparent yaw PNGs, mirror for the opposite side. Keep it original (no real marque silhouette).
- Open questions: future livery/color variation; how the name label scales/fades with distance and stays readable over city lights.

---

## 3. Duels — Tokyo-Xtreme-Racer-Zero-style health bar

- A duel is scored by a **health/SP bar** driven by the **gap** between the two cars: the further you fall **behind**, the **faster your bar drains**; the further **ahead** you are, the faster the *opponent's* drains (and yours recovers). First to empty loses.
- Starts from a cruise encounter (per the vision's challenge flow), no separate arena.
- Ties directly into drafting: sitting in the draft keeps you close enough to not bleed, then a pass swings the bar hard.
- Open questions: drain curve vs. gap, catch-up/rubber-banding, what traffic collisions do to the bar, timeout/sudden-death, visual placement of the two bars in the cockpit HUD.

---

## 4. Lane changes take ~1 second + a signal (anti-blocking)

**Implemented first pass.** A lane change is no longer instant: `src/laneChangeModel.ts` creates a one-lane intent, blinkers pulse at `0.0 s` and `0.5 s`, and the committed collision/draft lane changes at `1.0 s`. It applies to the player, sedan traffic, and rivals. Rival AI now scans all three lanes and starts the first one-lane step toward a far open lane when appropriate.

**Future refinement:** abort/cancel rules, richer side/turning sprites, cooldown tuning per driver, and AI behavior that explicitly reacts to another driver's blinker.

---

## 5. Pedals + mandatory clutch, and the full input model

**Pedals** live on the **left** of the cockpit: **Clutch / Brake / Accelerator**.

**Clutch is mandatory to shift.** You must hold the clutch, *then* change gear; without it the gear won't change (it stays put). This is the vision's "full manual transmission" step made concrete.

**Free (non-sequential) shifting.** With a real clutch + draggable shifter, gears are **freely selectable** (drag the stick to any H-gate position) — no longer forced sequential Q/E. You can skip gears, grab the wrong one, etc.

**Desktop / laptop (web):**
- Dedicated **keyboard** buttons for clutch and gears is fine, **plus** mouse: **click + drag the stick shifter** and click the pedals.
- (Keep a keyboard-only path so it's playable without a mouse.)

**Mobile (all touch):**
- **Touch-and-hold** the **accelerator** pedal; **touch-and-hold** the **clutch** pedal.
- **Touch-and-drag the stick shifter** to the exact gear you want (free H-pattern, not sequential).
- **Touch-and-drag the steering wheel** left/right to change lanes.
- **Small, transparent on-screen touch cues** to show the interactive zones without cluttering the view.

**Touches:** big input refactor — `drivingModel` gains a clutch state that gates gear changes and a free-gear-select model; cockpit rendering adds the pedal cluster (left) and a **draggable** shifter/wheel; `TouchDriveControls` becomes hold-pedals + drag-shifter + drag-wheel with translucent hit-zones. Open questions: stall/over-rev behavior when clutch is mis-timed, whether brake is analog, how the draggable shifter maps to the 6 gates, and desktop stick-drag vs. keyboard parity.

---

## 6. Music — cruising vs. duel intensity

- **Cruising:** **trance / eurodance** bed for open-road driving.
- **Duel:** a **faster eurodance beat** that kicks in for duels — energy in the spirit of **Tokyo Xtreme Racer Zero (PS2)** and **Top Gear 2 (SNES)**.
- All **original compositions** (feel-inspired only, never copied). Fits the vision's "distinct musical intensity per context" (menus / garage / cruise / duel).
- **Cruise theme implemented.** `NightVelocityMusic` is an original 148 BPM euro-trance/J-rock procedural loop and shares the existing `M` / touch AUDIO mode. A future pass can still add a duel arrangement and a state machine to cross-fade cruise ↔ encounter ↔ duel, plus stem ducking under engine/impact SFX.

---

## 7. Rear-view mirror follow-ups

- A first **rear-view mirror** is now integrated in the cockpit so cars **approaching from behind are readable before they pass**.
- Becomes genuinely **tactical** with the rest of this list: watch who's **drafting you**, spot a **rival closing** in a duel, and check the lane behind **before** committing to a (now ~1s, signalled) lane change.
- Shows the same rival **name labels** and the yaw sprites, just rendered small into a mirror inset (rear-facing, so mostly the front 3/4 of the chasing car). The sedan, truck, and Shirokage generators now provide front-facing `0°`/`4°` pairs for this purpose.
- Already noted in `LONG_TERM_VISION.md` as part of the traffic phase; repeated here because drafting/duels make it a **core readability tool**, not just polish.
- **Touches:** future passes should extend the existing mirror render region to rivals/remote players, add name labels, and tune whether side mirrors are also needed. Open questions: single center mirror vs. three mirrors, how much it costs to render a richer second view, and how it reads on a small mobile screen.

## Rough sequencing thought (not a commitment)
Drafting/speed-exchange and the duel bar are the two that turn "avoid traffic" into a *game*, and they depend on each other (draft to stay close → bar → pass). The clutch + free-shift + pedals + draggable touch controls is the other big pillar (the vision's step 3). Rival names/labels, challenge prompts, and duel alignment are prerequisites for formal duels. Lane-change timing/signaling and the music split are smaller supporting pieces. We'll order it properly in the dedicated planning session.
