import { describe, expect, it } from "vitest";
import {
  AssetManifestError,
  createAssetCatalog,
  resolveAssetUrl,
  validateAssetManifest
} from "./AssetCatalog";

describe("AssetCatalog", () => {
  const manifest = {
    gameId: "demo",
    assets: [
      {
        id: "icon-core",
        kind: "image" as const,
        path: "generated/icons/icon-core.svg",
        license: "generated-in-repo",
        source: "tool"
      },
      {
        id: "sfx-hit",
        kind: "audio" as const,
        path: "generated/audio/sfx-hit.wav",
        license: "generated-in-repo",
        source: "tool"
      }
    ]
  };

  it("validates and indexes entries", () => {
    expect(() => validateAssetManifest(manifest)).not.toThrow();
    const catalog = createAssetCatalog(manifest, "https://example.com/games/demo/assets/asset.manifest.json");

    expect(catalog.byId("icon-core")?.kind).toBe("image");
    expect(catalog.list("audio")).toHaveLength(1);
    expect(catalog.resolve("sfx-hit")).toBe("https://example.com/games/demo/assets/generated/audio/sfx-hit.wav");
  });

  it("throws on missing required asset", () => {
    const catalog = createAssetCatalog(manifest, "https://example.com/games/demo/assets/asset.manifest.json");
    expect(() => catalog.require("missing-id")).toThrow(AssetManifestError);
  });

  it("resolves asset paths against manifest url", () => {
    const url = resolveAssetUrl("https://example.com/a/b/asset.manifest.json", "sprites/hero.svg");
    expect(url).toBe("https://example.com/a/b/sprites/hero.svg");
  });
});
