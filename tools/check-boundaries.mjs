import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";

const root = process.cwd();
const scanRoots = [join(root, "packages"), join(root, "games")];
const codeExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);

function isCodeFile(path) {
  return codeExtensions.has(extname(path));
}

function classifyFile(path) {
  const rel = relative(root, path);
  const parts = rel.split(/[\\/]/);
  if (parts[0] === "packages") return { scope: "package", rel, gameId: null };
  if (parts[0] === "games") return { scope: "game", rel, gameId: parts[1] ?? null };
  return { scope: "other", rel, gameId: null };
}

async function walkFiles(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
      continue;
    }
    if (entry.isFile() && isCodeFile(full)) {
      files.push(full);
    }
  }
  return files;
}

function extractImports(source) {
  const specs = [];
  const importExportRe = /\b(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["'`]([^"'`]+)["'`]/g;
  const dynamicRe = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

  for (const re of [importExportRe, dynamicRe]) {
    let match;
    while ((match = re.exec(source)) !== null) {
      specs.push(match[1]);
    }
  }
  return specs;
}

function inGamesPath(path) {
  return normalize(path).includes(`${sep}games${sep}`);
}

function errorForImport(filePath, specifier, info) {
  const fileDir = dirname(filePath);

  if (info.scope === "package") {
    if (specifier.startsWith(".")) {
      const resolved = resolve(fileDir, specifier);
      if (inGamesPath(resolved)) {
        return "packages/* cannot import from games/* via relative paths";
      }
    }
    if (
      specifier.startsWith("games/") ||
      specifier.startsWith("@game/") ||
      specifier.startsWith("@playloom/game-") ||
      specifier.includes("/games/")
    ) {
      return "packages/* cannot import game modules";
    }
  }

  if (info.scope === "game") {
    if (specifier.startsWith(".")) {
      const resolved = resolve(fileDir, specifier);
      const relToRoot = relative(root, resolved);
      const parts = relToRoot.split(/[\\/]/);
      if (parts[0] === "games" && parts[1] && parts[1] !== info.gameId) {
        return "games/* cannot import another game directly";
      }
    }
    if (specifier.startsWith("@playloom/game-")) {
      return "games/* cannot import another game package";
    }
  }

  return null;
}

async function main() {
  const files = [];
  for (const scanRoot of scanRoots) {
    files.push(...(await walkFiles(scanRoot)));
  }

  const failures = [];
  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    const imports = extractImports(source);
    const info = classifyFile(filePath);
    for (const specifier of imports) {
      const reason = errorForImport(filePath, specifier, info);
      if (reason) {
        failures.push({
          file: relative(root, filePath),
          specifier,
          reason
        });
      }
    }
  }

  if (failures.length > 0) {
    console.error("Boundary check failed:");
    for (const failure of failures) {
      console.error(`- ${failure.file} imports '${failure.specifier}': ${failure.reason}`);
    }
    process.exit(1);
  }

  console.log(`Boundary check passed (${files.length} files scanned).`);
}

main().catch((error) => {
  console.error(`Boundary checker error: ${error.message}`);
  process.exit(1);
});
