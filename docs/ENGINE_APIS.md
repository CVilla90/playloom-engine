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

Movement and zone primitives:

1. `ZoneMap`
2. `PlatformerController`
3. `createPlatformerState(initialMode?)`
4. `defaultPlatformerProfile()`

Example:

```ts
import {
  PlatformerController,
  ZoneMap,
  createPlatformerState
} from "@playloom/engine-core";

const controller = new PlatformerController();
const state = createPlatformerState("grounded");
const zones = new ZoneMap([
  { id: "stairs-a", type: "climb", x: 240, y: 120, width: 96, height: 220 }
]);

const result = controller.step({
  dt: 1 / 60,
  input: { moveX: 1, moveY: 0, jumpPressed: false },
  body: { x: 10, y: 40, width: 32, height: 48, vx: 0, vy: 0 },
  state,
  isInClimbZone: (body) =>
    zones.firstRect({ x: body.x, y: body.y, width: body.width, height: body.height }, ["climb"]) !== null
});
```

## `@playloom/engine-input`

Reusable action mapping:

1. `ActionMap`
2. `createPlatformerActionBindings()`
3. `createCharacterLabActionBindings()`
4. `createMenuActionBindings()`
5. `createActionMapForInputManager(input, bindings?)`

Example:

```ts
import {
  ActionMap,
  createCharacterLabActionBindings,
  createPlatformerActionBindings
} from "@playloom/engine-input";

const actions = new ActionMap(input, createPlatformerActionBindings());
const moveX = actions.axis("move_left", "move_right");
const jumpPressed = actions.wasPressed("jump");

const characterLab = createCharacterLabActionBindings();
const chooseFirst = characterLab.character_select_1;

const menu = createMenuActionBindings();
const confirmPressed = new ActionMap(input, menu).wasPressed("menu_confirm");
```

## `@playloom/engine-audio`

Bus-oriented runtime audio control:

1. `AudioMixer`

Example:

```ts
import { AudioMixer } from "@playloom/engine-audio";

const mixer = new AudioMixer();
mixer.setVolume("music", 0.7);
mixer.setMuted("master", false);
mixer.apply(ambientAudioElement, "music", 0.35);
mixer.playOneShot("/sfx/jump.wav", 0.2);
```

## `@playloom/engine-renderer-canvas`

Blockout + debug drawing helpers:

1. `drawIndustrialFloorSegment(renderer, x, y, width, height, style?)`
2. `drawIndustrialCeilingSegment(renderer, x, y, width, height, style?)`
3. `drawIndustrialStairFlight(renderer, x, y, width, height, direction, style?)`
4. `drawZoneOverlay(renderer, zones)`
5. `wrapTextLines(text, maxWidth, measureText)` for reusable text layout
6. `drawTextBlock(renderer, text, x, y, maxWidth, lineHeight, options?)`
7. `composeTintedSpriteFrame(context, options)` for layered runtime sprite recoloring
