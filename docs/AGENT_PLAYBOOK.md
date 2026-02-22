# Agent Playbook

## Fast Path
0. Session startup read order:
   - `AGENTS.md`
   - `docs/ENGINE_APIS.md`
   - `games/<game-id>/docs/README.md` (after game selection)
1. Scaffold a game:
   - `npm run new-game -- <game-id>`
2. Validate structure and boundaries:
   - `npm run validate`
3. Run targeted engine tests:
   - `npm run test`
4. Run full safety checks:
   - `npm run smoke`

## Mandatory Rules
1. Put reusable systems in `packages/*`.
2. Put game-specific logic and content in `games/<game-id>/*`.
3. Every game must keep:
   - `game.manifest.json`
   - `assets/asset.manifest.json`
4. Never import from one game into another game.
5. Engine packages must never import from `games/*`.

## Common Commands
1. `npm run cli -- --help`
2. `npm run new-game -- orbital-miners --name "Orbital Miners"`
3. `npm run new-game -- orbital-miners --set-default`
4. `npm run assets:generate -- orbital-miners`
5. `npm run asset:gen -- svg orbital-miners icon-core --palette neon --size 96`
6. `npm run asset:gen -- sprite orbital-miners rover --frames 6 --size 48 --fps 10`
7. `npm run asset:gen -- sfx orbital-miners pickup --preset pickup --duration 0.35`
8. `npm run asset:gen -- music-loop orbital-miners base-loop --preset ambient --duration 8`

## AI-First Reuse Defaults
1. Use `ZoneMap` + `PlatformerController` for platform movement states.
2. Use `ActionMap` instead of hardcoded key checks in scenes.
3. Use `AudioMixer` for mute/volume and one-shot SFX control.
4. Use renderer blockout helpers for stage primitives before bespoke art polish.
5. Use `createCharacterLabActionBindings` for character select/customize controls.
6. Use `composeTintedSpriteFrame` for runtime color variants without duplicating sprite assets.
