import { access, readdir, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";

const root = process.cwd();
const gamesRoot = join(root, "games");

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path, errors, label) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    errors.push(`${label}: cannot read JSON (${error.message})`);
    return null;
  }
}

function validateGameManifest(manifest, gameId, gameDir, errors) {
  if (!isObject(manifest)) {
    errors.push(`${gameId}/game.manifest.json: root must be an object`);
    return;
  }

  if (manifest.id !== gameId) {
    errors.push(`${gameId}/game.manifest.json: id must equal folder name '${gameId}'`);
  }
  if (typeof manifest.name !== "string" || manifest.name.trim().length === 0) {
    errors.push(`${gameId}/game.manifest.json: name must be a non-empty string`);
  }
  if (typeof manifest.entry !== "string" || manifest.entry.trim().length === 0) {
    errors.push(`${gameId}/game.manifest.json: entry must be a non-empty string`);
  }
  if (!isObject(manifest.render)) {
    errors.push(`${gameId}/game.manifest.json: render must be an object`);
  } else {
    for (const key of ["width", "height", "targetFps"]) {
      const value = manifest.render[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        errors.push(`${gameId}/game.manifest.json: render.${key} must be a positive number`);
      }
    }
  }
  if (!Array.isArray(manifest.features) || manifest.features.some((item) => typeof item !== "string")) {
    errors.push(`${gameId}/game.manifest.json: features must be an array of strings`);
  }
  if (typeof manifest.assetsManifest !== "string" || manifest.assetsManifest.trim().length === 0) {
    errors.push(`${gameId}/game.manifest.json: assetsManifest must be a non-empty string`);
  }
  if (!isObject(manifest.save)) {
    errors.push(`${gameId}/game.manifest.json: save must be an object`);
  } else {
    if (typeof manifest.save.key !== "string" || manifest.save.key.trim().length === 0) {
      errors.push(`${gameId}/game.manifest.json: save.key must be a non-empty string`);
    }
    if (!Number.isInteger(manifest.save.version) || manifest.save.version < 1) {
      errors.push(`${gameId}/game.manifest.json: save.version must be an integer >= 1`);
    }
  }

  return {
    entryPath: typeof manifest.entry === "string" ? join(gameDir, manifest.entry) : null,
    assetsManifestPath: typeof manifest.assetsManifest === "string" ? join(gameDir, manifest.assetsManifest) : null
  };
}

function validateAssetManifest(manifest, gameId, assetManifestPath, errors) {
  if (!isObject(manifest)) {
    errors.push(`${gameId}/assets/asset.manifest.json: root must be an object`);
    return;
  }
  if (manifest.gameId !== gameId) {
    errors.push(`${gameId}/assets/asset.manifest.json: gameId must equal '${gameId}'`);
  }
  if (!Array.isArray(manifest.assets)) {
    errors.push(`${gameId}/assets/asset.manifest.json: assets must be an array`);
    return;
  }

  const seenIds = new Set();
  const allowedKinds = new Set(["image", "audio", "font", "data"]);
  const assetRoot = dirname(assetManifestPath);

  for (let i = 0; i < manifest.assets.length; i += 1) {
    const asset = manifest.assets[i];
    const label = `${gameId}/assets/asset.manifest.json assets[${i}]`;
    if (!isObject(asset)) {
      errors.push(`${label}: must be an object`);
      continue;
    }
    for (const key of ["id", "kind", "path", "license", "source"]) {
      if (typeof asset[key] !== "string" || asset[key].trim().length === 0) {
        errors.push(`${label}: ${key} must be a non-empty string`);
      }
    }
    if (typeof asset.id === "string") {
      if (seenIds.has(asset.id)) {
        errors.push(`${label}: duplicate id '${asset.id}'`);
      }
      seenIds.add(asset.id);
    }
    if (typeof asset.kind === "string" && !allowedKinds.has(asset.kind)) {
      errors.push(`${label}: kind '${asset.kind}' is not allowed`);
    }
    if (typeof asset.path === "string") {
      const resolved = resolve(assetRoot, asset.path);
      const rel = relative(assetRoot, resolved);
      if (normalize(rel).startsWith("..")) {
        errors.push(`${label}: path must stay inside assets folder`);
      }
    }
  }
}

async function main() {
  const entries = await readdir(gamesRoot, { withFileTypes: true });
  const gameDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

  if (gameDirs.length === 0) {
    console.log("No games found. Manifest validation skipped.");
    return;
  }

  const errors = [];
  let checkedGames = 0;

  for (const gameId of gameDirs) {
    const gameDir = join(gamesRoot, gameId);
    const gameManifestPath = join(gameDir, "game.manifest.json");
    const gameManifest = await readJson(gameManifestPath, errors, `${gameId}/game.manifest.json`);
    if (!gameManifest) continue;

    const pointers = validateGameManifest(gameManifest, gameId, gameDir, errors);
    checkedGames += 1;

    if (pointers?.entryPath && !(await pathExists(pointers.entryPath))) {
      errors.push(`${gameId}/game.manifest.json: entry file not found (${relative(root, pointers.entryPath)})`);
    }

    if (!pointers?.assetsManifestPath) {
      continue;
    }
    if (!(await pathExists(pointers.assetsManifestPath))) {
      errors.push(`${gameId}/game.manifest.json: assetsManifest file not found (${relative(root, pointers.assetsManifestPath)})`);
      continue;
    }

    const assetManifest = await readJson(
      pointers.assetsManifestPath,
      errors,
      `${gameId}/assets/asset.manifest.json`
    );
    if (!assetManifest) continue;

    validateAssetManifest(assetManifest, gameId, pointers.assetsManifestPath, errors);

    if (Array.isArray(assetManifest.assets)) {
      for (const asset of assetManifest.assets) {
        if (!asset || typeof asset.path !== "string") continue;
        const absolutePath = resolve(dirname(pointers.assetsManifestPath), asset.path);
        if (!(await pathExists(absolutePath))) {
          errors.push(
            `${gameId}/assets/asset.manifest.json: asset path missing (${relative(root, absolutePath)})`
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error("Manifest validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Manifest validation passed (${checkedGames} game manifests checked).`);
}

main().catch((error) => {
  console.error(`Manifest validator error: ${error.message}`);
  process.exit(1);
});
