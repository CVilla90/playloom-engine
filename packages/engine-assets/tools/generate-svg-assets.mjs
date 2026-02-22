import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(__dirname, "..", "..", "..");
const gameId = process.argv[2] ?? "embervault";
const gameRoot = join(workspaceRoot, "games", gameId);

const targets = {
  icons: join(gameRoot, "assets", "icons"),
  characters: join(gameRoot, "assets", "characters"),
  ui: join(gameRoot, "assets", "ui")
};

for (const path of Object.values(targets)) {
  await mkdir(path, { recursive: true });
}

const files = [
  {
    path: join(targets.icons, "scrap.svg"),
    content: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#f1e6c9"/>
      <stop offset="100%" stop-color="#9f9072"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="10" fill="#26231d"/>
  <path d="M10 41 L20 18 L36 14 L53 25 L48 47 L26 52 Z" fill="url(#g)" stroke="#605641" stroke-width="3"/>
  <circle cx="23" cy="30" r="3" fill="#6c634f"/>
  <circle cx="38" cy="35" r="2.8" fill="#6c634f"/>
</svg>`
  },
  {
    path: join(targets.icons, "stone.svg"),
    content: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#b3bac7"/>
      <stop offset="100%" stop-color="#6d7380"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="10" fill="#21242d"/>
  <path d="M11 42 L16 22 L30 12 L49 19 L54 35 L44 50 L25 52 Z" fill="url(#g)" stroke="#505765" stroke-width="3"/>
  <path d="M21 28 L34 22 L44 28 L38 40 L24 42 Z" fill="#7f8795" opacity="0.7"/>
</svg>`
  },
  {
    path: join(targets.icons, "metal.svg"),
    content: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#d3f1ff"/>
      <stop offset="100%" stop-color="#79b4c8"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="10" fill="#15232a"/>
  <path d="M32 10 L46 18 L54 32 L46 46 L32 54 L18 46 L10 32 L18 18 Z" fill="url(#g)" stroke="#557a87" stroke-width="3"/>
  <circle cx="32" cy="32" r="8" fill="#5f8e9f"/>
  <circle cx="32" cy="32" r="3" fill="#dcf4ff"/>
</svg>`
  },
  {
    path: join(targets.icons, "wood.svg"),
    content: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="10" fill="#2a1c13"/>
  <rect x="11" y="23" width="42" height="19" rx="8" fill="#a56f45" stroke="#6f4a2f" stroke-width="3"/>
  <circle cx="20" cy="32.5" r="6.5" fill="#d5a170" stroke="#845636" stroke-width="2"/>
  <circle cx="20" cy="32.5" r="3" fill="none" stroke="#845636" stroke-width="2"/>
  <path d="M30 28 L48 28 M30 37 L48 37" stroke="#7c4f31" stroke-width="2"/>
</svg>`
  },
  {
    path: join(targets.characters, "human.svg"),
    content: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <circle cx="48" cy="19" r="12" fill="#f6d8b6"/>
  <path d="M34 35 L62 35 L67 64 L29 64 Z" fill="#6ca4d9"/>
  <rect x="36" y="64" width="10" height="23" rx="5" fill="#5d4a3e"/>
  <rect x="50" y="64" width="10" height="23" rx="5" fill="#5d4a3e"/>
  <rect x="22" y="39" width="11" height="28" rx="5" fill="#f6d8b6"/>
  <rect x="63" y="39" width="11" height="28" rx="5" fill="#f6d8b6"/>
</svg>`
  },
  {
    path: join(targets.characters, "robot.svg"),
    content: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <rect x="31" y="12" width="34" height="24" rx="5" fill="#9fc3d6" stroke="#4d7084" stroke-width="3"/>
  <circle cx="43" cy="24" r="4" fill="#102332"/>
  <circle cx="53" cy="24" r="4" fill="#102332"/>
  <rect x="24" y="36" width="48" height="34" rx="6" fill="#6f96ab" stroke="#46697a" stroke-width="3"/>
  <rect x="15" y="40" width="9" height="23" rx="4" fill="#88acbd"/>
  <rect x="72" y="40" width="9" height="23" rx="4" fill="#88acbd"/>
  <rect x="32" y="70" width="11" height="17" rx="3" fill="#5b7d8f"/>
  <rect x="53" y="70" width="11" height="17" rx="3" fill="#5b7d8f"/>
</svg>`
  },
  {
    path: join(targets.characters, "animal.svg"),
    content: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <path d="M16 53 L28 35 L58 35 L73 45 L81 63 L71 70 L24 70 Z" fill="#c98f59" stroke="#7f542f" stroke-width="3"/>
  <path d="M58 35 L70 24 L82 33 L73 45 Z" fill="#c98f59" stroke="#7f542f" stroke-width="3"/>
  <circle cx="77" cy="35" r="2" fill="#20150f"/>
  <rect x="27" y="70" width="8" height="16" rx="3" fill="#7f542f"/>
  <rect x="40" y="70" width="8" height="16" rx="3" fill="#7f542f"/>
  <rect x="54" y="70" width="8" height="16" rx="3" fill="#7f542f"/>
  <rect x="66" y="70" width="8" height="16" rx="3" fill="#7f542f"/>
</svg>`
  },
  {
    path: join(targets.ui, "panel.svg"),
    content: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180">
  <defs>
    <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#221b20"/>
      <stop offset="100%" stop-color="#0f1017"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="296" height="176" rx="14" fill="url(#bg)" stroke="#f1d6a3" stroke-width="4"/>
  <rect x="10" y="10" width="280" height="160" rx="10" fill="none" stroke="#7f6948" stroke-width="2"/>
</svg>`
  }
];

for (const file of files) {
  await writeFile(file.path, file.content, "utf8");
}

console.log(`Generated ${files.length} asset files for game '${gameId}'.`);
