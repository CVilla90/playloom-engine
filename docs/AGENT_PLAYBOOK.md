# Agent Playbook

## Fast Path
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
