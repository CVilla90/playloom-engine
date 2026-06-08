# Game Spec (AI-First)

## File
Each game should provide `games/<game-id>/game.manifest.json`.

## Minimum Shape
```json
{
  "id": "embervault",
  "name": "Embervault Descent",
  "entry": "src/main.ts",
  "render": {
    "width": 1360,
    "height": 540,
    "targetFps": 60
  },
  "features": ["save", "audio", "deterministic-rng"],
  "assetsManifest": "assets/asset.manifest.json",
  "save": {
    "key": "embervault-descent.save.v1",
    "version": 1
  }
}
```

## Notes
1. `id` must be unique and filesystem-safe.
2. `entry` must point to the boot module.
3. `serverEntry` is optional and must point to a Node server entry inside the same game folder.
4. `assetsManifest` is required for license tracking.
5. `save.key` must remain game-specific and must not be shared in engine.
6. Run `npm run validate:manifests` after every manifest edit.
7. For runtime asset resolution, use `@playloom/engine-assets` catalog APIs.

Optional server bundle field:

```json
{
  "serverEntry": "src/multiplayer/server/server-entry.ts"
}
```
