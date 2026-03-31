# Start Here

`README.md` is now the single-file startup brief for this repository. If you only read one file before starting, read that one.

## Fast setup
1. `npm install`
2. `npm run dev`

## Create a new game
1. `npm run new-game -- <game-id> --set-default`
2. Implement scenes in `games/<game-id>/src/scenes`
3. Generate assets/audio as needed:
   - `npm run asset:gen -- svg <game-id> <asset-id>`
   - `npm run asset:gen -- sprite <game-id> <asset-id>`
   - `npm run asset:gen -- sfx <game-id> <asset-id>`
   - `npm run asset:gen -- music-loop <game-id> <asset-id>`

## Required checks
1. `npm run validate`
2. `npm run test`
3. `npm run smoke`

## Read next
1. `README.md`
2. `AGENTS.md`
3. `docs/AI_WORKFLOW.md`
4. `docs/ENGINE_APIS.md`
