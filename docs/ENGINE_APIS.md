# Engine APIs (New Reusable Modules)

## `@playloom/engine-assets`

Runtime manifest and catalog helpers:

1. `validateAssetManifest(input)`
2. `loadAssetManifestFromUrl(manifestUrl, fetcher?)`
3. `createAssetCatalog(manifest, manifestUrl)`
4. `loadAssetCatalogFromUrl(manifestUrl, fetcher?)`
5. `resolveAssetUrl(manifestUrl, assetPath)`

Example:

```ts
import { loadAssetCatalogFromUrl } from "@playloom/engine-assets";

const catalog = await loadAssetCatalogFromUrl("/games/embervault/assets/asset.manifest.json");
const iconUrl = catalog.resolve("icon_scrap");
const iconImage = await catalog.preloadImage("icon_scrap");
```

## `@playloom/engine-core`

Generic local JSON save/load helper:

1. `createLocalJsonStore<T>({ key, validate?, storage? })`

Example:

```ts
import { createLocalJsonStore } from "@playloom/engine-core";

interface MySave {
  score: number;
}

const store = createLocalJsonStore<MySave>({
  key: "my-game.save.v1",
  validate: (value): value is MySave =>
    typeof value === "object" && value !== null && "score" in value
});

store.save({ score: 42 });
const data = store.load();
```
