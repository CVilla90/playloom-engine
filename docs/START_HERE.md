# Start Here

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
1. `AGENTS.md`
2. `docs/AI_WORKFLOW.md`
3. `docs/ENGINE_APIS.md`
