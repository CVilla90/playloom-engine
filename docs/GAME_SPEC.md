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
3. `assetsManifest` is required for license tracking.
4. `save.key` must remain game-specific and must not be shared in engine.
5. Run `npm run validate:manifests` after every manifest edit.
6. For runtime asset resolution, use `@playloom/engine-assets` catalog APIs.
