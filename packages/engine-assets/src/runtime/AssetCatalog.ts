export type AssetKind = "image" | "audio" | "font" | "data";

export interface AssetManifestEntry {
  id: string;
  kind: AssetKind;
  path: string;
  license: string;
  source: string;
}

export interface AssetManifest {
  gameId: string;
  assets: AssetManifestEntry[];
}

export class AssetManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetManifestError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateAssetManifest(input: unknown): asserts input is AssetManifest {
  if (!isObject(input)) {
    throw new AssetManifestError("Manifest must be an object.");
  }
  if (typeof input.gameId !== "string" || input.gameId.trim().length === 0) {
    throw new AssetManifestError("Manifest gameId must be a non-empty string.");
  }
  if (!Array.isArray(input.assets)) {
    throw new AssetManifestError("Manifest assets must be an array.");
  }

  const ids = new Set<string>();
  for (let i = 0; i < input.assets.length; i += 1) {
    const entry = input.assets[i];
    if (!isObject(entry)) {
      throw new AssetManifestError(`assets[${i}] must be an object.`);
    }
    for (const key of ["id", "kind", "path", "license", "source"] as const) {
      const value = entry[key];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new AssetManifestError(`assets[${i}].${key} must be a non-empty string.`);
      }
    }
    const kind = entry.kind;
    const id = entry.id;
    if (typeof kind !== "string" || !["image", "audio", "font", "data"].includes(kind)) {
      throw new AssetManifestError(`assets[${i}].kind is invalid: ${String(kind)}`);
    }
    if (typeof id !== "string") {
      throw new AssetManifestError(`assets[${i}].id is invalid.`);
    }
    if (ids.has(id)) {
      throw new AssetManifestError(`Duplicate asset id: ${id}`);
    }
    ids.add(id);
  }
}

export function resolveAssetUrl(manifestUrl: string, assetPath: string): string {
  return new URL(assetPath, manifestUrl).toString();
}

export interface AssetCatalog {
  readonly manifest: AssetManifest;
  all(): readonly AssetManifestEntry[];
  list(kind: AssetKind): AssetManifestEntry[];
  byId(id: string): AssetManifestEntry | null;
  require(id: string): AssetManifestEntry;
  resolve(idOrEntry: string | AssetManifestEntry): string;
  preloadImage(idOrEntry: string | AssetManifestEntry): Promise<HTMLImageElement>;
  preloadAudio(idOrEntry: string | AssetManifestEntry): Promise<HTMLAudioElement>;
}

class RuntimeAssetCatalog implements AssetCatalog {
  private readonly idIndex = new Map<string, AssetManifestEntry>();

  constructor(
    public readonly manifest: AssetManifest,
    private readonly manifestUrl: string
  ) {
    for (const entry of manifest.assets) {
      this.idIndex.set(entry.id, entry);
    }
  }

  all(): readonly AssetManifestEntry[] {
    return this.manifest.assets;
  }

  list(kind: AssetKind): AssetManifestEntry[] {
    return this.manifest.assets.filter((entry) => entry.kind === kind);
  }

  byId(id: string): AssetManifestEntry | null {
    return this.idIndex.get(id) ?? null;
  }

  require(id: string): AssetManifestEntry {
    const entry = this.byId(id);
    if (!entry) {
      throw new AssetManifestError(`Asset id not found: ${id}`);
    }
    return entry;
  }

  resolve(idOrEntry: string | AssetManifestEntry): string {
    const entry = typeof idOrEntry === "string" ? this.require(idOrEntry) : idOrEntry;
    return resolveAssetUrl(this.manifestUrl, entry.path);
  }

  async preloadImage(idOrEntry: string | AssetManifestEntry): Promise<HTMLImageElement> {
    if (typeof window === "undefined" || typeof Image === "undefined") {
      throw new AssetManifestError("preloadImage requires a browser-like environment.");
    }
    const src = this.resolve(idOrEntry);
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new AssetManifestError(`Failed to load image: ${src}`));
      image.src = src;
    });
  }

  async preloadAudio(idOrEntry: string | AssetManifestEntry): Promise<HTMLAudioElement> {
    if (typeof window === "undefined" || typeof Audio === "undefined") {
      throw new AssetManifestError("preloadAudio requires a browser-like environment.");
    }
    const src = this.resolve(idOrEntry);
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = "auto";
      audio.oncanplaythrough = () => resolve(audio);
      audio.onerror = () => reject(new AssetManifestError(`Failed to load audio: ${src}`));
      audio.src = src;
      audio.load();
    });
  }
}

export function createAssetCatalog(manifest: AssetManifest, manifestUrl: string): AssetCatalog {
  validateAssetManifest(manifest);
  return new RuntimeAssetCatalog(manifest, manifestUrl);
}

export async function loadAssetManifestFromUrl(
  manifestUrl: string,
  fetcher: typeof fetch = fetch
): Promise<AssetManifest> {
  const response = await fetcher(manifestUrl);
  if (!response.ok) {
    throw new AssetManifestError(`Failed to fetch manifest (${response.status} ${response.statusText})`);
  }
  const parsed: unknown = await response.json();
  validateAssetManifest(parsed);
  return parsed;
}

export async function loadAssetCatalogFromUrl(
  manifestUrl: string,
  fetcher: typeof fetch = fetch
): Promise<AssetCatalog> {
  const manifest = await loadAssetManifestFromUrl(manifestUrl, fetcher);
  return createAssetCatalog(manifest, manifestUrl);
}
