import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME_ROOT = path.resolve(HERE, "..");
const MODEL_DIR = path.join(GAME_ROOT, "assets", "models");
const VARIANT_ID = process.argv
  .find((argument) => argument.startsWith("--variant="))
  ?.slice("--variant=".length) ?? "traffic";

const SHIROKAGE_SHARED = {
  wheelColor: "#c4c7c8",
  wheelDarkColor: "#20252a",
  tailColor: "#bd2634",
  headlightColor: "#eef4f2",
  classicLights: true,
  compactCoupe: true,
  sideAccent: true,
  twoDoor: true
};

const VARIANTS = {
  traffic: {
    label: "Generic traffic sedan",
    description: "Offline orthographic render from the reusable low-poly traffic-car model.",
    frameDirectory: "traffic-car-frames",
    frameSlug: "traffic-car-yaw",
    sheetSlug: "traffic-car-angle-sheet",
    modelSlug: "traffic-car-generic-low-poly",
    objComment: "# Wangan Zero generic civilian traffic sedan",
    materialComment: "# Wangan Zero generic traffic-car materials",
    bodyColor: "#29486f",
    bodyDarkColor: "#132943",
    wheelColor: "#69737f",
    wheelDarkColor: "#222a34",
    tailColor: "#d62230",
    headlightColor: "#ead99f"
  },
  shirokage: {
    label: "Project Shirokage",
    description: "Original compact 1980s-inspired coupe with a solid white-and-black finish.",
    frameDirectory: "shirokage-car-frames",
    frameSlug: "shirokage-yaw",
    sheetSlug: "shirokage-angle-sheet",
    modelSlug: "project-shirokage-low-poly",
    objComment: "# Wangan Zero Project Shirokage compact coupe",
    materialComment: "# Wangan Zero Project Shirokage materials",
    bodyColor: "#e4e2da",
    bodyDarkColor: "#0a0d11",
    ...SHIROKAGE_SHARED,
    codeName: "PROJECT SHIROKAGE"
  },
  "shirokage-red": {
    label: "Project Shirokage Red",
    description: "Original compact 1980s-inspired coupe with a red-and-black finish for rival use.",
    frameDirectory: "shirokage-red-car-frames",
    frameSlug: "shirokage-red-yaw",
    sheetSlug: "shirokage-red-angle-sheet",
    modelSlug: "project-shirokage-red-low-poly",
    objComment: "# Wangan Zero Project Shirokage red compact coupe",
    materialComment: "# Wangan Zero Project Shirokage red materials",
    bodyColor: "#cf1f2f",
    bodyDarkColor: "#0a0d11",
    ...SHIROKAGE_SHARED,
    codeName: "SHIROKAGE RED"
  },
  "aonami-gt": {
    label: "Aonami GT",
    description: "Original late-1990s-inspired grand tourer with a low teal body and solid graphite trim.",
    frameDirectory: "aonami-gt-car-frames",
    frameSlug: "aonami-gt-yaw",
    sheetSlug: "aonami-gt-angle-sheet",
    modelSlug: "aonami-gt-low-poly",
    objComment: "# Wangan Zero Aonami GT grand tourer",
    materialComment: "# Wangan Zero Aonami GT materials",
    bodyColor: "#167b83",
    bodyDarkColor: "#17242c",
    accentColor: "#26353d",
    wheelColor: "#c7c9c6",
    wheelDarkColor: "#30373c",
    tailColor: "#e12c3a",
    headlightColor: "#eaf5ee",
    classicLights: true,
    grandTourer: true,
    depthSortedAccent: true,
    codeName: "AONAMI GT"
  },
  "hibana-rs": {
    label: "Hibana RS",
    description: "Original compact liftback coupe with a bright ember-orange body and solid charcoal trim.",
    frameDirectory: "hibana-rs-car-frames",
    frameSlug: "hibana-rs-yaw",
    sheetSlug: "hibana-rs-angle-sheet",
    modelSlug: "hibana-rs-low-poly",
    objComment: "# Wangan Zero Hibana RS compact liftback coupe",
    materialComment: "# Wangan Zero Hibana RS materials",
    bodyColor: "#d65b2d",
    bodyDarkColor: "#1b242a",
    accentColor: "#333c42",
    wheelColor: "#d1ad65",
    wheelDarkColor: "#34383b",
    tailColor: "#ed2f3f",
    headlightColor: "#edf4e8",
    classicLights: true,
    sportCompact: true,
    depthSortedAccent: true,
    projectionScale: 180,
    codeName: "HIBANA RS"
  },
  "kagero-vx": {
    label: "Kagero VX",
    description: "Original cab-forward mid-engine wedge with a violet body and solid graphite aero trim.",
    frameDirectory: "kagero-vx-car-frames",
    frameSlug: "kagero-vx-yaw",
    sheetSlug: "kagero-vx-angle-sheet",
    modelSlug: "kagero-vx-low-poly",
    objComment: "# Wangan Zero Kagero VX mid-engine wedge",
    materialComment: "# Wangan Zero Kagero VX materials",
    bodyColor: "#78549e",
    bodyDarkColor: "#171d25",
    accentColor: "#303943",
    wheelColor: "#c5cdd1",
    wheelDarkColor: "#343a40",
    tailColor: "#e32e48",
    headlightColor: "#e9f5f1",
    classicLights: true,
    midEngine: true,
    depthSortedAccent: true,
    projectionScale: 185,
    codeName: "KAGERO VX"
  },
  "reimei-xr": {
    label: "Reimei XR",
    description: "Original front-mid-engine hero coupe with a long low nose, rear-set canopy, and broad cobalt shoulders.",
    frameDirectory: "reimei-xr-car-frames",
    frameSlug: "reimei-xr-yaw",
    sheetSlug: "reimei-xr-angle-sheet",
    modelSlug: "reimei-xr-low-poly",
    objComment: "# Wangan Zero Reimei XR front-mid-engine hero coupe",
    materialComment: "# Wangan Zero Reimei XR materials",
    bodyColor: "#315f9f",
    bodyDarkColor: "#111b2b",
    accentColor: "#d0a84e",
    wheelColor: "#d7c27d",
    wheelDarkColor: "#313946",
    tailColor: "#f02f4e",
    headlightColor: "#e8f6ff",
    classicLights: true,
    heroCoupe: true,
    depthSortedAccent: true,
    projectionScale: 178,
    codeName: "REIMEI XR"
  },
  truck: {
    label: "Kurohama container truck",
    description: "Simple solid traffic truck carrying a closed freight container.",
    frameDirectory: "traffic-truck-frames",
    frameSlug: "traffic-truck-yaw",
    sheetSlug: "traffic-truck-angle-sheet",
    modelSlug: "traffic-truck-container-low-poly",
    objComment: "# Wangan Zero generic container traffic truck",
    materialComment: "# Wangan Zero container traffic-truck materials",
    bodyColor: "#d2d0c7",
    bodyDarkColor: "#202831",
    wheelColor: "#7c858d",
    wheelDarkColor: "#252b31",
    tailColor: "#d62230",
    headlightColor: "#f2dfaa",
    truck: true,
    projectionScale: 165,
    sheetScale: 0.3,
    codeName: "CONTAINER TRAFFIC"
  }
};
const CAR = VARIANTS[VARIANT_ID];
if (!CAR) {
  throw new Error(`Unknown car variant "${VARIANT_ID}". Expected one of: ${Object.keys(VARIANTS).join(", ")}.`);
}
const FRAME_DIR = path.join(GAME_ROOT, "assets", CAR.frameDirectory);
const SOURCE_DIR = path.join(FRAME_DIR, "source");
const FRAME_WIDTH = 1024;
const FRAME_HEIGHT = 640;
const FRAME_ANGLES = [0, 4, 8, 16, 24, 36, 52, 70, 90];
const FRONT_FRAME_ANGLES = [0, 4];
const FRONT_FRAME_SLUG = CAR.frameSlug.replace("-yaw", "-front-yaw");
const FRONT_SHEET_SLUG = CAR.sheetSlug.replace("-angle-sheet", "-front-angle-sheet");
const SHEET_COLUMNS = 4;
const SHEET_CELL_WIDTH = 360;
const SHEET_CELL_HEIGHT = 300;
const SHEET_ROWS = Math.ceil(FRAME_ANGLES.length / SHEET_COLUMNS);
const SHEET_WIDTH = SHEET_COLUMNS * SHEET_CELL_WIDTH;
const SHEET_HEIGHT = SHEET_ROWS * SHEET_CELL_HEIGHT + 20;
const FRONT_SHEET_ROWS = Math.ceil(FRONT_FRAME_ANGLES.length / SHEET_COLUMNS);
const FRONT_SHEET_HEIGHT = FRONT_SHEET_ROWS * SHEET_CELL_HEIGHT + 20;
const CAMERA_PITCH_RADIANS = (5 * Math.PI) / 180;
const PROJECTION_SCALE = CAR.projectionScale ?? 175;
const PROJECTION_CENTER_X = FRAME_WIDTH / 2;
const PROJECTION_BASELINE_Y = 500;

const MATERIALS = {
  body: { color: CAR.bodyColor, roughness: 0.72 },
  bodyDark: { color: CAR.bodyDarkColor, roughness: 0.82 },
  trim: { color: "#09111c", roughness: 0.88 },
  glass: { color: "#07111e", roughness: 0.34 },
  tire: { color: "#05070a", roughness: 0.96 },
  wheel: { color: CAR.wheelColor, roughness: 0.64 },
  wheelDark: { color: CAR.wheelDarkColor, roughness: 0.78 },
  tail: { color: CAR.tailColor, roughness: 0.4, unlit: true },
  ...(CAR.classicLights
    ? { indicator: { color: "#e6922d", roughness: 0.4, unlit: true } }
    : {}),
  ...(CAR.sideAccent
    ? { accent: { color: CAR.accentColor ?? "#0a0d11", roughness: 0.9 } }
    : {}),
  ...(CAR.grandTourer
    ? { accent: { color: CAR.accentColor, roughness: 0.82 } }
    : {}),
  ...(CAR.sportCompact
    ? { accent: { color: CAR.accentColor, roughness: 0.84 } }
    : {}),
  ...(CAR.midEngine
    ? { accent: { color: CAR.accentColor, roughness: 0.8 } }
    : {}),
  ...(CAR.heroCoupe
    ? { accent: { color: CAR.accentColor, roughness: 0.76 } }
    : {}),
  ...(CAR.truck
    ? {
        container: { color: "#98452f", roughness: 0.86 },
        containerAccent: { color: "#56271f", roughness: 0.92 },
        indicator: { color: "#e6922d", roughness: 0.4, unlit: true }
      }
    : {}),
  reverse: { color: "#e5d4ad", roughness: 0.48, unlit: true },
  headlight: { color: CAR.headlightColor, roughness: 0.34, unlit: true },
  plate: { color: "#111923", roughness: 0.82 },
  exhaust: { color: "#3f4852", roughness: 0.78 }
};

const vertices = [];
const faces = [];

function addVertex(x, y, z) {
  vertices.push([x, y, z]);
  return vertices.length - 1;
}

function addFace(name, points, material) {
  faces.push({
    name,
    indices: points.map(([x, y, z]) => addVertex(x, y, z)),
    material
  });
}

function addIndexedMesh(name, points, meshFaces, material) {
  const base = vertices.length;
  for (const point of points) {
    addVertex(...point);
  }
  for (const face of meshFaces) {
    faces.push({
      name,
      indices: face.map((index) => base + index),
      material
    });
  }
}

function addBox(name, center, size, material) {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;
  const x0 = cx - sx / 2;
  const x1 = cx + sx / 2;
  const y0 = cy - sy / 2;
  const y1 = cy + sy / 2;
  const z0 = cz - sz / 2;
  const z1 = cz + sz / 2;
  addIndexedMesh(
    name,
    [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1]
    ],
    [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
      [0, 1, 5, 4],
      [3, 7, 6, 2]
    ],
    material
  );
}

function addRearPlane(name, centerX, centerY, width, height, z, material) {
  const x0 = centerX - width / 2;
  const x1 = centerX + width / 2;
  const y0 = centerY - height / 2;
  const y1 = centerY + height / 2;
  addFace(name, [[x0, y0, z], [x0, y1, z], [x1, y1, z], [x1, y0, z]], material);
}

function addFrontPlane(name, centerX, centerY, width, height, z, material) {
  const x0 = centerX - width / 2;
  const x1 = centerX + width / 2;
  const y0 = centerY - height / 2;
  const y1 = centerY + height / 2;
  addFace(name, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], material);
}

function addRearDisc(name, centerX, centerY, radius, z, material, segments = 12) {
  const points = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = -(index / segments) * Math.PI * 2;
    points.push([
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
      z
    ]);
  }
  addFace(name, points, material);
}

function addSideBand(name, side, y0, y1, z0, z1, material) {
  const rearX = side * 0.917;
  const frontX = side * 0.848;
  const points = side > 0
    ? [
        [rearX, y0, z0],
        [rearX, y1, z0],
        [frontX, y1, z1],
        [frontX, y0, z1]
      ]
    : [
        [frontX, y0, z1],
        [frontX, y1, z1],
        [rearX, y1, z0],
        [rearX, y0, z0]
      ];
  addFace(`${name}-${side}`, points, material);
}

function addFlatSidePanel(name, side, x, y0, y1, z0, z1, material) {
  const points = side > 0
    ? [
        [x, y0, z0],
        [x, y1, z0],
        [x, y1, z1],
        [x, y0, z1]
      ]
    : [
        [x, y0, z1],
        [x, y1, z1],
        [x, y1, z0],
        [x, y0, z0]
      ];
  addFace(`${name}-${side}`, points, material);
}

function addWheelArch(name, side, x, centerY, z, radius, topClampY, material, segments = 16) {
  // A flat disc just proud of the body side, drawn behind the wheel (layer 0
  // vs the wheel's layer 4) so the tire reads as sitting inside a dark wheel
  // well instead of being swallowed by the quarter panel.
  const points = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push([
      side * x,
      Math.min(centerY + Math.cos(angle) * radius, topClampY),
      z + Math.sin(angle) * radius
    ]);
  }
  addFace(`${name}-${side}`, side > 0 ? points : [...points].reverse(), material);
}

function addBladePanel(name, side, y0, y1, zRear, zFront, xRear, xFront, material) {
  // A side accent quad whose x can differ between its rear and front ends so
  // trim segments hug a tapering body instead of floating off the narrow end.
  const points = side > 0
    ? [
        [side * xRear, y0, zRear],
        [side * xRear, y1, zRear],
        [side * xFront, y1, zFront],
        [side * xFront, y0, zFront]
      ]
    : [
        [side * xFront, y0, zFront],
        [side * xFront, y1, zFront],
        [side * xRear, y1, zRear],
        [side * xRear, y0, zRear]
      ];
  addFace(`${name}-${side}`, points, material);
}

function addTaperedBody() {
  addIndexedMesh(
    "body-shell",
    [
      [-0.92, 0.32, -2.16],
      [0.92, 0.32, -2.16],
      [0.92, 0.96, -2.16],
      [-0.92, 0.96, -2.16],
      [-0.84, 0.32, 2.16],
      [0.84, 0.32, 2.16],
      [0.84, 0.88, 2.16],
      [-0.84, 0.88, 2.16]
    ],
    [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
      [0, 1, 5, 4],
      [3, 7, 6, 2]
    ],
    "body"
  );
}

function addCabin() {
  const compactCoupe = CAR.compactCoupe === true;
  addIndexedMesh(
    "cabin-shell",
    compactCoupe
      ? [
          [-0.78, 0.88, -1.58],
          [0.78, 0.88, -1.58],
          [-0.74, 0.88, 1.1],
          [0.74, 0.88, 1.1],
          [-0.62, 1.55, -1.05],
          [0.62, 1.55, -1.05],
          [-0.57, 1.52, 0.68],
          [0.57, 1.52, 0.68]
        ]
      : [
          [-0.78, 0.88, -1.2],
          [0.78, 0.88, -1.2],
          [-0.74, 0.88, 1.12],
          [0.74, 0.88, 1.12],
          [-0.63, 1.59, -0.78],
          [0.63, 1.59, -0.78],
          [-0.57, 1.55, 0.72],
          [0.57, 1.55, 0.72]
        ],
    [
      [0, 4, 5, 1],
      [2, 3, 7, 6],
      [0, 2, 6, 4],
      [1, 5, 7, 3],
      [4, 6, 7, 5]
    ],
    "body"
  );

  addFace(
    "rear-window",
    compactCoupe
      ? [
          [-0.66, 0.97, -1.591],
          [-0.51, 1.47, -1.061],
          [0.51, 1.47, -1.061],
          [0.66, 0.97, -1.591]
        ]
      : [
          [-0.66, 0.97, -1.211],
          [-0.52, 1.5, -0.79],
          [0.52, 1.5, -0.79],
          [0.66, 0.97, -1.211]
        ],
    "glass"
  );
  addFace(
    "front-windshield",
    compactCoupe
      ? [
          [-0.63, 0.97, 1.111],
          [0.63, 0.97, 1.111],
          [0.5, 1.44, 0.69],
          [-0.5, 1.44, 0.69]
        ]
      : [
          [-0.63, 0.97, 1.131],
          [0.63, 0.97, 1.131],
          [0.5, 1.47, 0.73],
          [-0.5, 1.47, 0.73]
        ],
    "glass"
  );

  for (const side of [-1, 1]) {
    const x = side * 0.785;
    const rearSidePoints = compactCoupe
      ? side > 0
        ? [
            [x, 0.98, -1.43],
            [x, 1.43, -0.98],
            [x, 1.43, -0.18],
            [x, 0.98, -0.18]
          ]
        : [
            [x, 0.98, -0.18],
            [x, 1.43, -0.18],
            [x, 1.43, -0.98],
            [x, 0.98, -1.43]
          ]
      : side > 0
        ? [
            [x, 0.98, -1.02],
            [x, 1.46, -0.7],
            [x, 1.46, -0.08],
            [x, 0.98, -0.08]
          ]
        : [
            [x, 0.98, -0.08],
            [x, 1.46, -0.08],
            [x, 1.46, -0.7],
            [x, 0.98, -1.02]
          ];
    addFace(`rear-side-window-${side}`, rearSidePoints, "glass");

    const frontSidePoints = compactCoupe
      ? side > 0
        ? [
            [x, 0.98, -0.08],
            [x, 1.43, -0.08],
            [side * 0.72, 1.41, 0.58],
            [side * 0.74, 0.98, 0.94]
          ]
        : [
            [x, 0.98, 0.94],
            [side * 0.72, 1.41, 0.58],
            [x, 1.43, -0.08],
            [x, 0.98, -0.08]
          ]
      : side > 0
        ? [
            [x, 0.98, 0.04],
            [x, 1.46, 0.04],
            [side * 0.72, 1.43, 0.62],
            [side * 0.74, 0.98, 0.96]
          ]
        : [
            [x, 0.98, 0.96],
            [side * 0.72, 1.43, 0.62],
            [x, 1.46, 0.04],
            [x, 0.98, 0.04]
          ];
    addFace(`front-side-window-${side}`, frontSidePoints, "glass");
  }
}

function addRearDetails() {
  addBox("rear-bumper", [0, 0.44, -2.22], [1.94, 0.18, 0.14], "bodyDark");
  addRearPlane("rear-trim", 0, 0.76, 1.44, 0.3, -2.296, "trim");
  if (CAR.classicLights) {
    addRearPlane("left-tail-housing", -0.57, 0.79, 0.52, 0.25, -2.302, "trim");
    addRearPlane("right-tail-housing", 0.57, 0.79, 0.52, 0.25, -2.302, "trim");
    addRearPlane("left-tail", -0.69, 0.79, 0.22, 0.15, -2.309, "tail");
    addRearPlane("right-tail", 0.69, 0.79, 0.22, 0.15, -2.309, "tail");
    addRearPlane("left-indicator", -0.52, 0.79, 0.1, 0.15, -2.31, "indicator");
    addRearPlane("right-indicator", 0.52, 0.79, 0.1, 0.15, -2.31, "indicator");
    addRearPlane("left-reverse", -0.39, 0.79, 0.12, 0.15, -2.311, "reverse");
    addRearPlane("right-reverse", 0.39, 0.79, 0.12, 0.15, -2.311, "reverse");
  } else {
    addRearPlane("left-tail", -0.57, 0.79, 0.48, 0.25, -2.302, "tail");
    addRearPlane("right-tail", 0.57, 0.79, 0.48, 0.25, -2.302, "tail");
    addRearPlane("left-reverse", -0.44, 0.73, 0.13, 0.09, -2.309, "reverse");
    addRearPlane("right-reverse", 0.44, 0.73, 0.13, 0.09, -2.309, "reverse");
  }
  addRearPlane("license-recess", 0, 0.68, 0.42, 0.18, -2.31, "plate");
  addBox("exhaust", [0.67, 0.25, -2.24], [0.18, 0.11, 0.18], "exhaust");
}

function addFrontDetails() {
  addBox("front-bumper", [0, 0.43, 2.22], [1.8, 0.18, 0.14], "bodyDark");
  addFrontPlane("left-headlight", -0.55, 0.76, 0.42, 0.2, 2.296, "headlight");
  addFrontPlane("right-headlight", 0.55, 0.76, 0.42, 0.2, 2.296, "headlight");
  addFrontPlane("front-grille", 0, 0.67, 0.52, 0.18, 2.3, "trim");
}

function addSideDetails() {
  for (const side of [-1, 1]) {
    const x = side * 0.926;
    addBox(`mirror-${side}`, [side * 0.94, 1.13, 0.62], [0.22, 0.13, 0.24], "bodyDark");
    if (!CAR.twoDoor) {
      addBox(`rear-handle-${side}`, [x, 1.02, -0.33], [0.035, 0.045, 0.24], "trim");
    }
    addBox(`front-handle-${side}`, [x, 1.02, 0.56], [0.035, 0.045, 0.24], "trim");
    if (CAR.sideAccent) {
      addSideBand("lower-black-accent", side, 0.47, 0.65, -1.98, 1.96, "accent");
    }
  }
}

function addWheel(name, side, z, options = {}) {
  const centerX = side * (options.centerX ?? 0.89);
  const centerY = options.centerY ?? 0.39;
  const radius = options.radius ?? 0.38;
  const thickness = options.thickness ?? 0.22;
  const hubRadius = options.hubRadius ?? 0.22;
  const centerRadius = options.centerRadius ?? 0.09;
  const segments = 12;
  const x0 = centerX - thickness / 2;
  const x1 = centerX + thickness / 2;
  const ring0 = [];
  const ring1 = [];

  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const y = centerY + Math.cos(angle) * radius;
    const wheelZ = z + Math.sin(angle) * radius;
    ring0.push(addVertex(x0, y, wheelZ));
    ring1.push(addVertex(x1, y, wheelZ));
  }

  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    faces.push({
      name: `${name}-tread`,
      indices: [ring0[index], ring0[next], ring1[next], ring1[index]],
      material: "tire"
    });
  }
  faces.push({ name: `${name}-cap-a`, indices: [...ring0].reverse(), material: "tire" });
  faces.push({ name: `${name}-cap-b`, indices: [...ring1], material: "tire" });

  const outerX = centerX + side * (thickness / 2 + 0.006);
  const hubPoints = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    hubPoints.push([
      outerX,
      centerY + Math.cos(angle) * hubRadius,
      z + Math.sin(angle) * hubRadius
    ]);
  }
  addFace(`${name}-hub`, side > 0 ? hubPoints : [...hubPoints].reverse(), "wheel");

  const centerPoints = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    centerPoints.push([
      outerX + side * 0.003,
      centerY + Math.cos(angle) * centerRadius,
      z + Math.sin(angle) * centerRadius
    ]);
  }
  addFace(`${name}-hub-center`, side > 0 ? centerPoints : [...centerPoints].reverse(), "wheelDark");
}

function addAonamiModel() {
  const bodyStations = [
    { z: -2.32, halfWidth: 0.98, topY: 0.91 },
    { z: -1.86, halfWidth: 0.97, topY: 0.9 },
    { z: -1, halfWidth: 0.95, topY: 0.89 },
    { z: 1.02, halfWidth: 0.92, topY: 0.85 },
    { z: 1.89, halfWidth: 0.91, topY: 0.83 },
    { z: 2.36, halfWidth: 0.9, topY: 0.82 }
  ];
  const bodyPoints = bodyStations.flatMap(({ z, halfWidth, topY }) => [
    [-halfWidth, 0.3, z],
    [halfWidth, 0.3, z],
    [halfWidth, topY, z],
    [-halfWidth, topY, z]
  ]);
  const bodyFaces = [
    [0, 3, 2, 1],
    [bodyPoints.length - 4, bodyPoints.length - 3, bodyPoints.length - 2, bodyPoints.length - 1]
  ];
  for (let index = 0; index < bodyStations.length - 1; index += 1) {
    const rear = index * 4;
    const front = rear + 4;
    bodyFaces.push(
      [rear, rear + 1, front + 1, front],
      [rear + 3, front + 3, front + 2, rear + 2],
      [rear, front, front + 3, rear + 3],
      [rear + 1, rear + 2, front + 2, front + 1]
    );
  }
  addIndexedMesh(
    "aonami-body-shell",
    bodyPoints,
    bodyFaces,
    "body"
  );

  addIndexedMesh(
    "aonami-fastback-cabin",
    [
      [-0.81, 0.88, -1.42],
      [0.81, 0.88, -1.42],
      [-0.76, 0.88, 1.08],
      [0.76, 0.88, 1.08],
      [-0.62, 1.48, -0.72],
      [0.62, 1.48, -0.72],
      [-0.58, 1.46, 0.58],
      [0.58, 1.46, 0.58]
    ],
    [
      [0, 4, 5, 1],
      [2, 3, 7, 6],
      [0, 2, 6, 4],
      [1, 5, 7, 3],
      [4, 6, 7, 5]
    ],
    "bodyDark"
  );

  addFace(
    "aonami-rear-window",
    [
      [-0.68, 0.96, -1.431],
      [-0.52, 1.4, -0.731],
      [0.52, 1.4, -0.731],
      [0.68, 0.96, -1.431]
    ],
    "glass"
  );
  addFace(
    "aonami-windshield",
    [
      [-0.65, 0.96, 1.091],
      [0.65, 0.96, 1.091],
      [0.51, 1.39, 0.591],
      [-0.51, 1.39, 0.591]
    ],
    "glass"
  );

  for (const side of [-1, 1]) {
    const rearSideWindow = side > 0
      ? [
          [side * 0.802, 0.96, -1.28],
          [side * 0.635, 1.39, -0.68],
          [side * 0.632, 1.39, -0.24],
          [side * 0.8, 0.96, -0.24]
        ]
      : [
          [side * 0.8, 0.96, -0.24],
          [side * 0.632, 1.39, -0.24],
          [side * 0.635, 1.39, -0.68],
          [side * 0.802, 0.96, -1.28]
        ];
    const frontSideWindow = side > 0
      ? [
          [side * 0.799, 0.96, -0.13],
          [side * 0.631, 1.39, -0.13],
          [side * 0.615, 1.37, 0.5],
          [side * 0.768, 0.96, 0.96]
        ]
      : [
          [side * 0.768, 0.96, 0.96],
          [side * 0.615, 1.37, 0.5],
          [side * 0.631, 1.39, -0.13],
          [side * 0.799, 0.96, -0.13]
        ];
    const bPillar = side > 0
      ? [
          [side * 0.806, 0.94, -0.24],
          [side * 0.638, 1.42, -0.24],
          [side * 0.637, 1.42, -0.13],
          [side * 0.805, 0.94, -0.13]
        ]
      : [
          [side * 0.805, 0.94, -0.13],
          [side * 0.637, 1.42, -0.13],
          [side * 0.638, 1.42, -0.24],
          [side * 0.806, 0.94, -0.24]
        ];
    addFace(`aonami-rear-side-window-${side}`, rearSideWindow, "glass");
    addFace(`aonami-front-side-window-${side}`, frontSideWindow, "glass");
    addFace(`aonami-b-pillar-${side}`, bPillar, "bodyDark");
    addFlatSidePanel("aonami-rear-side-skirt", side, side * 0.986, 0.42, 0.56, -2.04, -1.88, "accent");
    addFlatSidePanel("aonami-center-side-skirt", side, side * 0.986, 0.42, 0.56, -0.98, 1.01, "accent");
    addFlatSidePanel("aonami-front-side-skirt", side, side * 0.986, 0.42, 0.56, 1.9, 2.08, "accent");
    addFlatSidePanel("aonami-front-vent", side, side * 0.99, 0.61, 0.79, 1.68, 1.96, "trim");
    addBox(`aonami-mirror-${side}`, [side * 0.96, 1.09, 0.78], [0.22, 0.13, 0.27], "bodyDark");
    addBox(`aonami-door-handle-${side}`, [side * 0.992, 0.98, 0.2], [0.03, 0.045, 0.25], "trim");
  }

  addBox("aonami-rear-bumper", [0, 0.43, -2.39], [2.02, 0.2, 0.16], "bodyDark");
  addRearPlane("aonami-rear-garnish", 0, 0.74, 1.72, 0.3, -2.407, "trim");
  addRearPlane("aonami-left-tail", -0.67, 0.77, 0.34, 0.18, -2.414, "tail");
  addRearPlane("aonami-right-tail", 0.67, 0.77, 0.34, 0.18, -2.414, "tail");
  addRearPlane("aonami-left-indicator", -0.43, 0.77, 0.12, 0.18, -2.416, "indicator");
  addRearPlane("aonami-right-indicator", 0.43, 0.77, 0.12, 0.18, -2.416, "indicator");
  addRearPlane("aonami-left-reverse", -0.29, 0.77, 0.11, 0.18, -2.418, "reverse");
  addRearPlane("aonami-right-reverse", 0.29, 0.77, 0.11, 0.18, -2.418, "reverse");
  addRearPlane("aonami-rear-plate", 0, 0.54, 0.42, 0.17, -2.419, "plate");
  addBox("aonami-left-exhaust", [-0.65, 0.24, -2.4], [0.2, 0.11, 0.2], "exhaust");
  addBox("aonami-right-exhaust", [0.65, 0.24, -2.4], [0.2, 0.11, 0.2], "exhaust");

  addBox("aonami-front-bumper", [0, 0.42, 2.38], [1.72, 0.2, 0.12], "bodyDark");
  addFrontPlane("aonami-left-headlight-housing", -0.58, 0.74, 0.56, 0.23, 2.367, "trim");
  addFrontPlane("aonami-right-headlight-housing", 0.58, 0.74, 0.56, 0.23, 2.367, "trim");
  addFrontPlane("aonami-left-headlight", -0.62, 0.76, 0.38, 0.15, 2.373, "headlight");
  addFrontPlane("aonami-right-headlight", 0.62, 0.76, 0.38, 0.15, 2.373, "headlight");
  addFrontPlane("aonami-left-front-indicator", -0.34, 0.75, 0.09, 0.15, 2.375, "indicator");
  addFrontPlane("aonami-right-front-indicator", 0.34, 0.75, 0.09, 0.15, 2.375, "indicator");
  addFrontPlane("aonami-front-grille", 0, 0.55, 0.66, 0.17, 2.376, "trim");
  addBox("aonami-front-lip", [0, 0.27, 2.36], [1.68, 0.1, 0.12], "accent");

  addBox("aonami-wing-left-support", [-0.58, 1.03, -2.11], [0.1, 0.32, 0.12], "bodyDark");
  addBox("aonami-wing-right-support", [0.58, 1.03, -2.11], [0.1, 0.32, 0.12], "bodyDark");
  addBox("aonami-rear-wing", [0, 1.2, -2.16], [1.78, 0.1, 0.34], "bodyDark");

  for (const side of [-1, 1]) {
    addWheel(`aonami-rear-wheel-${side}`, side, -1.43, {
      centerX: 0.96,
      centerY: 0.42,
      radius: 0.41,
      thickness: 0.25,
      hubRadius: 0.25,
      centerRadius: 0.09
    });
    addWheel(`aonami-front-wheel-${side}`, side, 1.46, {
      centerX: 0.96,
      centerY: 0.42,
      radius: 0.41,
      thickness: 0.25,
      hubRadius: 0.25,
      centerRadius: 0.09
    });
  }
}

function addHibanaModel() {
  const bodyStations = [
    { z: -2.15, halfWidth: 0.94, topY: 0.96 },
    { z: -1.72, halfWidth: 0.95, topY: 0.94 },
    { z: -0.9, halfWidth: 0.94, topY: 0.91 },
    { z: 0.94, halfWidth: 0.92, topY: 0.85 },
    { z: 1.72, halfWidth: 0.89, topY: 0.78 },
    { z: 2.18, halfWidth: 0.84, topY: 0.72 }
  ];
  const bodyPoints = bodyStations.flatMap(({ z, halfWidth, topY }) => [
    [-halfWidth, 0.31, z],
    [halfWidth, 0.31, z],
    [halfWidth, topY, z],
    [-halfWidth, topY, z]
  ]);
  const bodyFaces = [
    [0, 3, 2, 1],
    [bodyPoints.length - 4, bodyPoints.length - 3, bodyPoints.length - 2, bodyPoints.length - 1]
  ];
  for (let index = 0; index < bodyStations.length - 1; index += 1) {
    const rear = index * 4;
    const front = rear + 4;
    bodyFaces.push(
      [rear, rear + 1, front + 1, front],
      [rear + 3, front + 3, front + 2, rear + 2],
      [rear, front, front + 3, rear + 3],
      [rear + 1, rear + 2, front + 2, front + 1]
    );
  }
  addIndexedMesh("hibana-body-shell", bodyPoints, bodyFaces, "body");

  addIndexedMesh(
    "hibana-liftback-cabin",
    [
      [-0.8, 0.89, -1.6],
      [0.8, 0.89, -1.6],
      [-0.74, 0.86, 0.92],
      [0.74, 0.86, 0.92],
      [-0.6, 1.5, -0.82],
      [0.6, 1.5, -0.82],
      [-0.56, 1.48, 0.42],
      [0.56, 1.48, 0.42]
    ],
    [
      [0, 4, 5, 1],
      [2, 3, 7, 6],
      [0, 2, 6, 4],
      [1, 5, 7, 3],
      [4, 6, 7, 5]
    ],
    "bodyDark"
  );

  addFace(
    "hibana-rear-window",
    [
      [-0.68, 0.97, -1.611],
      [-0.5, 1.42, -0.831],
      [0.5, 1.42, -0.831],
      [0.68, 0.97, -1.611]
    ],
    "glass"
  );
  addFace(
    "hibana-windshield",
    [
      [-0.63, 0.94, 0.931],
      [0.63, 0.94, 0.931],
      [0.49, 1.4, 0.431],
      [-0.49, 1.4, 0.431]
    ],
    "glass"
  );

  for (const side of [-1, 1]) {
    const rearSideWindow = side > 0
      ? [
          [side * 0.792, 0.97, -1.44],
          [side * 0.612, 1.41, -0.76],
          [side * 0.6, 1.41, -0.28],
          [side * 0.78, 0.96, -0.28]
        ]
      : [
          [side * 0.78, 0.96, -0.28],
          [side * 0.6, 1.41, -0.28],
          [side * 0.612, 1.41, -0.76],
          [side * 0.792, 0.97, -1.44]
        ];
    const frontSideWindow = side > 0
      ? [
          [side * 0.778, 0.96, -0.16],
          [side * 0.598, 1.41, -0.16],
          [side * 0.572, 1.39, 0.35],
          [side * 0.742, 0.94, 0.82]
        ]
      : [
          [side * 0.742, 0.94, 0.82],
          [side * 0.572, 1.39, 0.35],
          [side * 0.598, 1.41, -0.16],
          [side * 0.778, 0.96, -0.16]
        ];
    const bPillar = side > 0
      ? [
          [side * 0.786, 0.94, -0.28],
          [side * 0.608, 1.44, -0.28],
          [side * 0.606, 1.44, -0.16],
          [side * 0.784, 0.94, -0.16]
        ]
      : [
          [side * 0.784, 0.94, -0.16],
          [side * 0.606, 1.44, -0.16],
          [side * 0.608, 1.44, -0.28],
          [side * 0.786, 0.94, -0.28]
        ];
    addFace(`hibana-rear-side-window-${side}`, rearSideWindow, "glass");
    addFace(`hibana-front-side-window-${side}`, frontSideWindow, "glass");
    addFace(`hibana-b-pillar-${side}`, bPillar, "bodyDark");
    addFlatSidePanel("hibana-rear-side-skirt", side, side * 0.956, 0.43, 0.55, -1.98, -1.72, "accent");
    addFlatSidePanel("hibana-center-side-skirt", side, side * 0.956, 0.43, 0.55, -0.88, 0.91, "accent");
    addFlatSidePanel("hibana-front-side-skirt", side, side * 0.946, 0.43, 0.55, 1.74, 1.98, "accent");
    addBox(`hibana-mirror-${side}`, [side * 0.92, 1.08, 0.62], [0.2, 0.13, 0.24], "bodyDark");
    addBox(`hibana-door-handle-${side}`, [side * 0.952, 0.98, 0.1], [0.03, 0.045, 0.22], "trim");
  }

  addBox("hibana-rear-bumper", [0, 0.43, -2.19], [1.88, 0.19, 0.1], "bodyDark");
  addRearPlane("hibana-rear-garnish", 0, 0.77, 1.62, 0.38, -2.207, "trim");
  addRearDisc("hibana-left-outer-tail", -0.66, 0.79, 0.13, -2.216, "tail");
  addRearDisc("hibana-left-inner-tail", -0.39, 0.79, 0.12, -2.216, "tail");
  addRearDisc("hibana-right-inner-tail", 0.39, 0.79, 0.12, -2.216, "tail");
  addRearDisc("hibana-right-outer-tail", 0.66, 0.79, 0.13, -2.216, "tail");
  addRearPlane("hibana-left-reverse", -0.23, 0.78, 0.09, 0.15, -2.219, "reverse");
  addRearPlane("hibana-right-reverse", 0.23, 0.78, 0.09, 0.15, -2.219, "reverse");
  addRearPlane("hibana-rear-plate", 0, 0.52, 0.4, 0.16, -2.221, "plate");
  addBox("hibana-left-exhaust", [-0.58, 0.24, -2.2], [0.18, 0.1, 0.18], "exhaust");
  addBox("hibana-right-exhaust", [0.58, 0.24, -2.2], [0.18, 0.1, 0.18], "exhaust");

  addBox("hibana-front-bumper", [0, 0.41, 2.19], [1.58, 0.18, 0.1], "bodyDark");
  addFrontPlane("hibana-left-headlight-housing", -0.55, 0.68, 0.48, 0.21, 2.187, "trim");
  addFrontPlane("hibana-right-headlight-housing", 0.55, 0.68, 0.48, 0.21, 2.187, "trim");
  addFrontPlane("hibana-left-headlight", -0.58, 0.69, 0.34, 0.14, 2.194, "headlight");
  addFrontPlane("hibana-right-headlight", 0.58, 0.69, 0.34, 0.14, 2.194, "headlight");
  addFrontPlane("hibana-left-indicator", -0.32, 0.68, 0.09, 0.14, 2.196, "indicator");
  addFrontPlane("hibana-right-indicator", 0.32, 0.68, 0.09, 0.14, 2.196, "indicator");
  addFrontPlane("hibana-front-grille", 0, 0.48, 0.58, 0.16, 2.197, "trim");
  addBox("hibana-front-lip", [0, 0.27, 2.18], [1.52, 0.09, 0.1], "accent");

  for (const side of [-1, 1]) {
    addWheel(`hibana-rear-wheel-${side}`, side, -1.3, {
      centerX: 0.93,
      centerY: 0.4,
      radius: 0.39,
      thickness: 0.24,
      hubRadius: 0.235,
      centerRadius: 0.085
    });
    addWheel(`hibana-front-wheel-${side}`, side, 1.32, {
      centerX: 0.91,
      centerY: 0.4,
      radius: 0.39,
      thickness: 0.24,
      hubRadius: 0.235,
      centerRadius: 0.085
    });
  }
}

function addKageroModel() {
  const bodyStations = [
    { z: -2.36, halfWidth: 1.04, topY: 0.78 },
    { z: -1.9, halfWidth: 1.05, topY: 0.8 },
    { z: -1.03, halfWidth: 1.04, topY: 0.78 },
    { z: 0.66, halfWidth: 1, topY: 0.72 },
    { z: 1.52, halfWidth: 0.95, topY: 0.65 },
    { z: 2.22, halfWidth: 0.86, topY: 0.56 }
  ];
  const bodyPoints = bodyStations.flatMap(({ z, halfWidth, topY }) => [
    [-halfWidth, 0.29, z],
    [halfWidth, 0.29, z],
    [halfWidth, topY, z],
    [-halfWidth, topY, z]
  ]);
  const bodyFaces = [
    [0, 3, 2, 1],
    [bodyPoints.length - 4, bodyPoints.length - 3, bodyPoints.length - 2, bodyPoints.length - 1]
  ];
  for (let index = 0; index < bodyStations.length - 1; index += 1) {
    const rear = index * 4;
    const front = rear + 4;
    bodyFaces.push(
      [rear, rear + 1, front + 1, front],
      [rear + 3, front + 3, front + 2, rear + 2],
      [rear, front, front + 3, rear + 3],
      [rear + 1, rear + 2, front + 2, front + 1]
    );
  }
  addIndexedMesh("kagero-body-shell", bodyPoints, bodyFaces, "body");

  addIndexedMesh(
    "kagero-cab-forward-cabin",
    [
      [-0.83, 0.74, -0.82],
      [0.83, 0.74, -0.82],
      [-0.74, 0.65, 1.22],
      [0.74, 0.65, 1.22],
      [-0.63, 1.38, -0.12],
      [0.63, 1.38, -0.12],
      [-0.56, 1.35, 0.72],
      [0.56, 1.35, 0.72]
    ],
    [
      [0, 4, 5, 1],
      [2, 3, 7, 6],
      [0, 2, 6, 4],
      [1, 5, 7, 3],
      [4, 6, 7, 5]
    ],
    "bodyDark"
  );

  addFace(
    "kagero-rear-window",
    [
      [-0.71, 0.81, -0.831],
      [-0.53, 1.31, -0.131],
      [0.53, 1.31, -0.131],
      [0.71, 0.81, -0.831]
    ],
    "glass"
  );
  addFace(
    "kagero-windshield",
    [
      [-0.64, 0.72, 1.231],
      [0.64, 0.72, 1.231],
      [0.49, 1.28, 0.731],
      [-0.49, 1.28, 0.731]
    ],
    "glass"
  );

  for (const side of [-1, 1]) {
    const rearSideWindow = side > 0
      ? [
          [side * 0.822, 0.8, -0.7],
          [side * 0.642, 1.31, -0.08],
          [side * 0.624, 1.31, 0.18],
          [side * 0.8, 0.78, 0.18]
        ]
      : [
          [side * 0.8, 0.78, 0.18],
          [side * 0.624, 1.31, 0.18],
          [side * 0.642, 1.31, -0.08],
          [side * 0.822, 0.8, -0.7]
        ];
    const frontSideWindow = side > 0
      ? [
          [side * 0.794, 0.77, 0.3],
          [side * 0.62, 1.31, 0.3],
          [side * 0.574, 1.27, 0.67],
          [side * 0.748, 0.71, 1.08]
        ]
      : [
          [side * 0.748, 0.71, 1.08],
          [side * 0.574, 1.27, 0.67],
          [side * 0.62, 1.31, 0.3],
          [side * 0.794, 0.77, 0.3]
        ];
    const bPillar = side > 0
      ? [
          [side * 0.808, 0.76, 0.18],
          [side * 0.634, 1.34, 0.18],
          [side * 0.631, 1.34, 0.3],
          [side * 0.804, 0.75, 0.3]
        ]
      : [
          [side * 0.804, 0.75, 0.3],
          [side * 0.631, 1.34, 0.3],
          [side * 0.634, 1.34, 0.18],
          [side * 0.808, 0.76, 0.18]
        ];
    addFace(`kagero-rear-side-window-${side}`, rearSideWindow, "glass");
    addFace(`kagero-front-side-window-${side}`, frontSideWindow, "glass");
    addFace(`kagero-b-pillar-${side}`, bPillar, "bodyDark");
    addFlatSidePanel("kagero-side-intake", side, side * 1.056, 0.5, 0.75, -0.88, -0.4, "bodyDark");
    addFlatSidePanel("kagero-rear-side-skirt", side, side * 1.056, 0.4, 0.53, -2.12, -1.92, "accent");
    addFlatSidePanel("kagero-center-side-skirt", side, side * 1.046, 0.4, 0.53, -1.02, 0.94, "accent");
    addFlatSidePanel("kagero-front-side-skirt", side, side * 0.976, 0.4, 0.53, 1.86, 2.02, "accent");
    addBox(`kagero-mirror-${side}`, [side * 0.94, 0.99, 0.88], [0.22, 0.12, 0.25], "bodyDark");
    addBox(`kagero-door-handle-${side}`, [side * 1.012, 0.84, 0.44], [0.03, 0.04, 0.2], "trim");
  }

  addBox("kagero-left-engine-vent", [-0.43, 0.83, -1.48], [0.34, 0.06, 1.08], "bodyDark");
  addBox("kagero-right-engine-vent", [0.43, 0.83, -1.48], [0.34, 0.06, 1.08], "bodyDark");

  addBox("kagero-rear-bumper", [0, 0.4, -2.39], [1.94, 0.18, 0.1], "bodyDark");
  addRearPlane("kagero-rear-garnish", 0, 0.67, 1.8, 0.34, -2.417, "trim");
  for (const [index, x] of [-0.78, -0.64, -0.5, 0.5, 0.64, 0.78].entries()) {
    addRearPlane(`kagero-tail-bar-${index}`, x, 0.69, 0.08, 0.24, -2.425, "tail");
  }
  addRearPlane("kagero-left-reverse", -0.25, 0.68, 0.12, 0.13, -2.427, "reverse");
  addRearPlane("kagero-right-reverse", 0.25, 0.68, 0.12, 0.13, -2.427, "reverse");
  addRearPlane("kagero-rear-plate", 0, 0.43, 0.4, 0.15, -2.429, "plate");
  addBox("kagero-left-exhaust", [-0.18, 0.22, -2.4], [0.14, 0.1, 0.18], "exhaust");
  addBox("kagero-right-exhaust", [0.18, 0.22, -2.4], [0.14, 0.1, 0.18], "exhaust");

  addBox("kagero-front-bumper", [0, 0.37, 2.23], [1.56, 0.17, 0.1], "bodyDark");
  for (const [index, x] of [-0.69, -0.47, 0.47, 0.69].entries()) {
    addFrontPlane(`kagero-headlight-${index}`, x, 0.48, 0.18, 0.14, 2.227, "headlight");
  }
  addFrontPlane("kagero-left-indicator", -0.84, 0.47, 0.07, 0.14, 2.229, "indicator");
  addFrontPlane("kagero-right-indicator", 0.84, 0.47, 0.07, 0.14, 2.229, "indicator");
  addFrontPlane("kagero-front-intake", 0, 0.37, 0.54, 0.13, 2.23, "trim");
  addBox("kagero-front-lip", [0, 0.25, 2.21], [1.5, 0.08, 0.1], "accent");

  for (const side of [-1, 1]) {
    addWheel(`kagero-rear-wheel-${side}`, side, -1.48, {
      centerX: 1.02,
      centerY: 0.41,
      radius: 0.42,
      thickness: 0.25,
      hubRadius: 0.25,
      centerRadius: 0.09
    });
    addWheel(`kagero-front-wheel-${side}`, side, 1.4, {
      centerX: 0.93,
      centerY: 0.4,
      radius: 0.4,
      thickness: 0.24,
      hubRadius: 0.235,
      centerRadius: 0.085
    });
  }
}

function addReimeiModel() {
  // A long-nose, rear-cabin proportion that is intentionally unlike the
  // compact Shirokage/Hibana, winged Aonami, and cab-forward Kagero.
  // The loft keeps a level rear deck (the light bar recesses into it), a
  // gentle wedge instead of the old dragster taper, and body sides tall
  // enough that both axles tuck into painted wheel wells.
  const bodyStations = [
    { z: -2.38, halfWidth: 0.97, topY: 0.8 },
    { z: -2.02, halfWidth: 1.02, topY: 0.85 },
    { z: -1.55, halfWidth: 1.03, topY: 0.862 },
    { z: -0.42, halfWidth: 1, topY: 0.835 },
    { z: 0.66, halfWidth: 0.95, topY: 0.77 },
    { z: 1.6, halfWidth: 0.9, topY: 0.75 },
    { z: 2.18, halfWidth: 0.8, topY: 0.64 }
  ];
  const bodyPoints = bodyStations.flatMap(({ z, halfWidth, topY }) => [
    [-halfWidth, 0.25, z],
    [halfWidth, 0.25, z],
    [halfWidth, topY, z],
    [-halfWidth, topY, z]
  ]);
  const bodyFaces = [
    [0, 3, 2, 1],
    [bodyPoints.length - 4, bodyPoints.length - 3, bodyPoints.length - 2, bodyPoints.length - 1]
  ];
  for (let index = 0; index < bodyStations.length - 1; index += 1) {
    const rear = index * 4;
    const front = rear + 4;
    bodyFaces.push(
      [rear, rear + 1, front + 1, front],
      [rear + 3, front + 3, front + 2, rear + 2],
      [rear, front, front + 3, rear + 3],
      [rear + 1, rear + 2, front + 2, front + 1]
    );
  }
  addIndexedMesh("reimei-body-shell", bodyPoints, bodyFaces, "body");

  addIndexedMesh(
    "reimei-rear-set-canopy",
    [
      [-0.83, 0.87, -1.57],
      [0.83, 0.87, -1.57],
      [-0.72, 0.78, 0.62],
      [0.72, 0.78, 0.62],
      [-0.59, 1.43, -0.91],
      [0.59, 1.43, -0.91],
      [-0.53, 1.4, -0.08],
      [0.53, 1.4, -0.08]
    ],
    [
      [0, 4, 5, 1],
      [2, 3, 7, 6],
      [0, 2, 6, 4],
      [1, 5, 7, 3],
      [4, 6, 7, 5]
    ],
    "bodyDark"
  );

  addFace(
    "reimei-rear-window",
    [
      [-0.71, 0.93, -1.581],
      [-0.5, 1.36, -0.921],
      [0.5, 1.36, -0.921],
      [0.71, 0.93, -1.581]
    ],
    "glass"
  );
  addFace(
    "reimei-windshield",
    [
      [-0.61, 0.86, 0.631],
      [0.61, 0.86, 0.631],
      [0.47, 1.33, -0.069],
      [-0.47, 1.33, -0.069]
    ],
    "glass"
  );

  for (const side of [-1, 1]) {
    const rearSideWindow = side > 0
      ? [
          [side * 0.817, 0.94, -1.43],
          [side * 0.605, 1.36, -0.86],
          [side * 0.585, 1.36, -0.53],
          [side * 0.79, 0.9, -0.53]
        ]
      : [
          [side * 0.79, 0.9, -0.53],
          [side * 0.585, 1.36, -0.53],
          [side * 0.605, 1.36, -0.86],
          [side * 0.817, 0.94, -1.43]
        ];
    const frontSideWindow = side > 0
      ? [
          [side * 0.786, 0.89, -0.4],
          [side * 0.58, 1.36, -0.4],
          [side * 0.535, 1.32, -0.03],
          [side * 0.7, 0.83, 0.5]
        ]
      : [
          [side * 0.7, 0.83, 0.5],
          [side * 0.535, 1.32, -0.03],
          [side * 0.58, 1.36, -0.4],
          [side * 0.786, 0.89, -0.4]
        ];
    const bPillar = side > 0
      ? [
          [side * 0.795, 0.87, -0.53],
          [side * 0.594, 1.39, -0.53],
          [side * 0.59, 1.39, -0.4],
          [side * 0.792, 0.86, -0.4]
        ]
      : [
          [side * 0.792, 0.86, -0.4],
          [side * 0.59, 1.39, -0.4],
          [side * 0.594, 1.39, -0.53],
          [side * 0.795, 0.87, -0.53]
        ];
    addFace(`reimei-rear-side-window-${side}`, rearSideWindow, "glass");
    addFace(`reimei-front-side-window-${side}`, frontSideWindow, "glass");
    addFace(`reimei-b-pillar-${side}`, bPillar, "bodyDark");

    // One gold beltline blade ties the broad rear shoulder to the long nose.
    // It is split at the wheel openings, like real chrome side trim, so the
    // line never slices across the dark wheel wells.
    addBladePanel("reimei-rear-accent-blade", side, 0.46, 0.56, -2.34, -2.1, 1, 1.045, "accent");
    addBladePanel("reimei-door-accent-blade", side, 0.46, 0.56, -1.03, 0.92, 1.025, 0.955, "accent");
    addBladePanel("reimei-nose-accent-blade", side, 0.45, 0.55, 1.94, 2.03, 0.9, 0.845, "accent");
    addBox(`reimei-mirror-${side}`, [side * 0.87, 1, 0.28], [0.2, 0.11, 0.26], "bodyDark");
    addBox(`reimei-door-handle-${side}`, [side * 1, 0.68, -0.25], [0.03, 0.04, 0.22], "trim");
  }

  // Twin closed deck vents reinforce the rear-set engine/cabin mass without
  // introducing holes that could leak far-side geometry at steep yaw.
  addBox("reimei-left-deck-vent", [-0.6, 0.874, -1.8], [0.26, 0.05, 0.44], "bodyDark");
  addBox("reimei-right-deck-vent", [0.6, 0.874, -1.8], [0.26, 0.05, 0.44], "bodyDark");

  // Every rear fixture stays below the 0.8 deck line so the light bar reads
  // as recessed into the tail panel instead of floating above the trunk.
  addBox("reimei-rear-bumper", [0, 0.38, -2.43], [2, 0.17, 0.12], "bodyDark");
  addRearPlane("reimei-rear-garnish", 0, 0.7, 1.8, 0.185, -2.386, "trim");
  addRearPlane("reimei-left-tail-bar", -0.47, 0.715, 0.8, 0.115, -2.392, "tail");
  addRearPlane("reimei-right-tail-bar", 0.47, 0.715, 0.8, 0.115, -2.392, "tail");
  addRearPlane("reimei-tail-spine", 0, 0.7, 0.08, 0.18, -2.394, "accent");
  addRearPlane("reimei-left-reverse", -0.13, 0.545, 0.1, 0.09, -2.396, "reverse");
  addRearPlane("reimei-right-reverse", 0.13, 0.545, 0.1, 0.09, -2.396, "reverse");
  addRearPlane("reimei-rear-plate", 0, 0.42, 0.4, 0.15, -2.398, "plate");
  addBox("reimei-left-exhaust", [-0.26, 0.3, -2.44], [0.14, 0.09, 0.2], "exhaust");
  addBox("reimei-right-exhaust", [0.26, 0.3, -2.44], [0.14, 0.09, 0.2], "exhaust");

  addBox("reimei-front-bumper", [0, 0.36, 2.22], [1.62, 0.16, 0.12], "bodyDark");
  addFrontPlane("reimei-left-headlight-housing", -0.44, 0.5, 0.46, 0.16, 2.186, "trim");
  addFrontPlane("reimei-right-headlight-housing", 0.44, 0.5, 0.46, 0.16, 2.186, "trim");
  addFrontPlane("reimei-left-headlight", -0.46, 0.515, 0.34, 0.085, 2.192, "headlight");
  addFrontPlane("reimei-right-headlight", 0.46, 0.515, 0.34, 0.085, 2.192, "headlight");
  addFrontPlane("reimei-left-indicator", -0.7, 0.47, 0.08, 0.11, 2.192, "indicator");
  addFrontPlane("reimei-right-indicator", 0.7, 0.47, 0.08, 0.11, 2.192, "indicator");
  addFrontPlane("reimei-front-grille", 0, 0.36, 0.56, 0.11, 2.188, "trim");
  addBox("reimei-front-lip", [0, 0.245, 2.23], [1.5, 0.07, 0.1], "accent");

  // Staggered wheels sit inside dark painted wells: the arch disc is proud of
  // the quarter panel, the tire is proud of the arch, and every wheel top
  // stays below the local body line so nothing pokes through the hood.
  for (const side of [-1, 1]) {
    addWheelArch("reimei-rear-arch", side, 1.045, 0.4, -1.58, 0.44, 0.85, "bodyDark");
    addWheelArch("reimei-front-arch", side, 0.935, 0.36, 1.5, 0.37, 0.74, "bodyDark");
    addWheel(`reimei-rear-wheel-${side}`, side, -1.58, {
      centerX: 0.935,
      centerY: 0.38,
      radius: 0.38,
      thickness: 0.24,
      hubRadius: 0.23,
      centerRadius: 0.09
    });
    addWheel(`reimei-front-wheel-${side}`, side, 1.5, {
      centerX: 0.84,
      centerY: 0.33,
      radius: 0.33,
      thickness: 0.22,
      hubRadius: 0.2,
      centerRadius: 0.08
    });
  }
}

function addTruckModel() {
  addBox("truck-chassis", [0, 0.43, -0.15], [1.96, 0.24, 5.55], "bodyDark");
  addBox("container-bed", [0, 0.7, -1], [2.05, 0.22, 3.9], "bodyDark");
  addBox("freight-container", [0, 1.7, -1], [2, 1.8, 3.75], "container");
  addBox("truck-cab", [0, 1.25, 1.71], [1.88, 1.65, 1.66], "body");
  addBox("cab-roof", [0, 2.1, 1.71], [1.94, 0.12, 1.72], "bodyDark");
  addBox("rear-bumper", [0, 0.25, -3], [2.08, 0.18, 0.18], "bodyDark");
  addBox("front-bumper", [0, 0.42, 2.59], [1.96, 0.2, 0.18], "bodyDark");

  addFrontPlane("truck-windshield", 0, 1.62, 1.5, 0.65, 2.548, "glass");
  addFrontPlane("left-truck-headlight", -0.57, 0.75, 0.42, 0.2, 2.551, "headlight");
  addFrontPlane("right-truck-headlight", 0.57, 0.75, 0.42, 0.2, 2.551, "headlight");
  addFrontPlane("truck-grille", 0, 0.75, 0.55, 0.22, 2.553, "trim");

  addRearPlane("container-door-seam", 0, 1.7, 0.035, 1.62, -2.881, "containerAccent");
  addRearPlane("container-left-lock", -0.32, 1.7, 0.04, 1.4, -2.883, "wheel");
  addRearPlane("container-right-lock", 0.32, 1.7, 0.04, 1.4, -2.883, "wheel");
  addRearPlane("left-truck-tail", -0.74, 0.44, 0.3, 0.17, -3.096, "tail");
  addRearPlane("right-truck-tail", 0.74, 0.44, 0.3, 0.17, -3.096, "tail");
  addRearPlane("left-truck-reverse", -0.51, 0.44, 0.12, 0.13, -3.098, "reverse");
  addRearPlane("right-truck-reverse", 0.51, 0.44, 0.12, 0.13, -3.098, "reverse");
  addRearPlane("truck-plate", 0, 0.37, 0.42, 0.17, -3.1, "plate");

  for (const side of [-1, 1]) {
    const cabX = side * 0.951;
    const containerX = side * 1.011;
    addFlatSidePanel("cab-side-window", side, cabX, 1.35, 1.91, 1.08, 2.35, "glass");
    addBox(`truck-mirror-${side}`, [side * 1.06, 1.62, 2.18], [0.2, 0.2, 0.18], "bodyDark");
    addFlatSidePanel("container-top-rail", side, containerX, 2.5, 2.58, -2.75, 0.74, "containerAccent");
    addFlatSidePanel("container-bottom-rail", side, containerX, 0.82, 0.9, -2.75, 0.74, "containerAccent");
    for (const [index, z] of [-2.32, -1.7, -1.08, -0.46, 0.16].entries()) {
      addFlatSidePanel(
        `container-rib-${index}`,
        side,
        containerX,
        0.9,
        2.5,
        z - 0.025,
        z + 0.025,
        "containerAccent"
      );
    }
    for (const [index, z] of [-2.12, -1.4, 1.7].entries()) {
      addWheel(`truck-wheel-${side}-${index}`, side, z, {
        centerX: 0.96,
        centerY: 0.47,
        radius: 0.47,
        thickness: 0.28,
        hubRadius: 0.27,
        centerRadius: 0.11
      });
    }
  }
}

function buildModel() {
  if (CAR.truck) {
    addTruckModel();
    return;
  }
  if (CAR.grandTourer) {
    addAonamiModel();
    return;
  }
  if (CAR.sportCompact) {
    addHibanaModel();
    return;
  }
  if (CAR.midEngine) {
    addKageroModel();
    return;
  }
  if (CAR.heroCoupe) {
    addReimeiModel();
    return;
  }
  addTaperedBody();
  addCabin();
  addRearDetails();
  addFrontDetails();
  addSideDetails();
  for (const side of [-1, 1]) {
    addWheel(`rear-wheel-${side}`, side, -1.35);
    addWheel(`front-wheel-${side}`, side, 1.35);
  }
}

function vectorSubtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function normalize(vector) {
  const length = Math.hypot(...vector) || 1;
  return vector.map((value) => value / length);
}

function transformPoint(point, yawRadians) {
  const [x, y, z] = point;
  const cosYaw = Math.cos(yawRadians);
  const sinYaw = Math.sin(yawRadians);
  const yawX = x * cosYaw + z * sinYaw;
  const yawZ = -x * sinYaw + z * cosYaw;
  const cosPitch = Math.cos(CAMERA_PITCH_RADIANS);
  const sinPitch = Math.sin(CAMERA_PITCH_RADIANS);
  return [
    yawX,
    y * cosPitch + yawZ * sinPitch,
    yawZ * cosPitch - y * sinPitch
  ];
}

function projectPoint(point) {
  return [
    PROJECTION_CENTER_X + point[0] * PROJECTION_SCALE,
    PROJECTION_BASELINE_Y - point[1] * PROJECTION_SCALE
  ];
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function shadedColor(hex, shade) {
  const [r, g, b] = hexToRgb(hex);
  const lift = 5;
  return `rgb(${Math.round(r * shade + lift)},${Math.round(g * shade + lift)},${Math.round(b * shade + lift)})`;
}

function renderLayer(face, angleDegrees) {
  // Average-depth painting lets the hero coupe's long flank quad out-sort the
  // near-side wheel it physically sits behind, swallowing the tire's upper
  // quarter at three-quarter yaws. At side-on-enough angles the near (+x)
  // tire and arch stick proud of the flank and can never be occluded by it,
  // so they get explicit layers. Shallow angles keep layer 0 because there
  // the rear fascia must still hide the wheels through the body.
  if (
    CAR.heroCoupe
    && angleDegrees >= 12
    && angleDegrees <= 168
    && !face.name.includes("--1")
  ) {
    if (face.material === "tire") {
      return 4;
    }
    if (face.name.includes("-arch-")) {
      return 3;
    }
  }
  if (face.material === "accent") {
    return CAR.depthSortedAccent ? 0 : 1;
  }
  if (face.material === "containerAccent") {
    return 1;
  }
  if (face.material === "glass") {
    return 2;
  }
  if (
    face.name.startsWith("aonami-rear-wing")
    || face.name.startsWith("aonami-wing-")
  ) {
    return angleDegrees <= 90 ? 3 : 0;
  }
  if (face.material === "wheel" || face.material === "wheelDark") {
    return 4;
  }
  if (face.material === "trim") {
    return 5;
  }
  if (face.material === "tail" || face.material === "headlight") {
    return 6;
  }
  if (
    face.material === "indicator"
    || face.material === "reverse"
    || face.material === "plate"
  ) {
    return 7;
  }
  return 0;
}

function renderPolygons(angleDegrees) {
  const yaw = (angleDegrees * Math.PI) / 180;
  const light = normalize([-0.45, 0.78, -0.62]);
  const rendered = [];

  for (const face of faces) {
    const transformed = face.indices.map((index) => transformPoint(vertices[index], yaw));
    const edgeA = vectorSubtract(transformed[1], transformed[0]);
    const edgeB = vectorSubtract(transformed[2], transformed[0]);
    const normal = normalize(cross(edgeA, edgeB));
    if (normal[2] >= -0.008) {
      continue;
    }

    const material = MATERIALS[face.material];
    const diffuse = Math.max(0, normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2]);
    const shade = material.unlit ? 1 : 0.5 + diffuse * 0.5;
    const projected = transformed.map(projectPoint);
    const depth = transformed.reduce((sum, point) => sum + point[2], 0) / transformed.length;
    rendered.push({
      depth,
      fill: shadedColor(material.color, shade),
      layer: renderLayer(face, angleDegrees),
      points: projected,
      name: face.name
    });
  }

  rendered.sort((a, b) => a.layer - b.layer || b.depth - a.depth);
  return rendered;
}

function polygonMarkup(polygons, idPrefix = "") {
  return polygons
    .map((polygon, index) => {
      const points = polygon.points
        .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
        .join(" ");
      const strokeWidth = polygon.name.includes("window") ? 2.2 : 1.5;
      return `<polygon id="${idPrefix}face-${index}" points="${points}" fill="${polygon.fill}" stroke="#050a12" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`;
    })
    .join("\n");
}

function frontRenderAngle(angle) {
  return 180 - angle;
}

function frameSvg(angle, view = "rear") {
  const renderAngle = view === "front" ? frontRenderAngle(angle) : angle;
  const polygons = renderPolygons(renderAngle);
  if (view !== "front") {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_WIDTH}" height="${FRAME_HEIGHT}" viewBox="0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}">
  <title>${CAR.label} at ${angle} degrees yaw</title>
  <desc>${CAR.description}</desc>
  <g>
${polygonMarkup(polygons, `yaw-${String(angle).padStart(3, "0")}-`)}
  </g>
</svg>
`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_WIDTH}" height="${FRAME_HEIGHT}" viewBox="0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}">
  <title>${CAR.label} front view at ${angle} degrees yaw</title>
  <desc>${CAR.description} Rendered from the front view.</desc>
  <g>
${polygonMarkup(polygons, `front-yaw-${String(angle).padStart(3, "0")}-`)}
  </g>
</svg>
`;
}

function sheetSvg({ angles = FRAME_ANGLES, height = SHEET_HEIGHT, view = "rear" } = {}) {
  const sheetWidth = SHEET_WIDTH;
  const sheetHeight = height;
  const cellWidth = SHEET_CELL_WIDTH;
  const cellHeight = SHEET_CELL_HEIGHT;
  const scale = CAR.sheetScale ?? 0.34;
  const frameOffsetX = CAR.sheetScale
    ? (cellWidth - FRAME_WIDTH * scale) / 2
    : 7;
  const viewLabel = view === "front" ? "FRONT" : "YAW";
  const cells = angles.map((angle, index) => {
    const column = index % SHEET_COLUMNS;
    const row = Math.floor(index / SHEET_COLUMNS);
    const x = column * cellWidth;
    const y = row * cellHeight;
    return `
    <g transform="translate(${x} ${y})">
      <rect x="8" y="8" width="${cellWidth - 16}" height="${cellHeight - 16}" rx="12" fill="#0b111b" stroke="#26364a"/>
      <g transform="translate(${frameOffsetX.toFixed(2)} 28) scale(${scale})">
${polygonMarkup(renderPolygons(view === "front" ? frontRenderAngle(angle) : angle), view === "front" ? `sheet-front-${angle}-` : `sheet-${angle}-`)}
      </g>
      <text x="24" y="38" fill="#d7e2ed" font-family="Consolas, monospace" font-size="18" font-weight="700">${String(angle).padStart(2, "0")}° ${viewLabel}</text>
      ${CAR.codeName ? `<text x="${cellWidth - 24}" y="38" text-anchor="end" fill="#8291a2" font-family="Consolas, monospace" font-size="13">${CAR.codeName}</text>` : ""}
    </g>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}" viewBox="0 0 ${sheetWidth} ${sheetHeight}">
  <rect width="${sheetWidth}" height="${sheetHeight}" fill="#05080d"/>
  ${cells}
</svg>
`;
}

function writeObj() {
  const lines = [
    CAR.objComment,
    "# Procedurally authored low-poly source model",
    `mtllib ${CAR.modelSlug}.mtl`
  ];
  for (const [x, y, z] of vertices) {
    lines.push(`v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`);
  }

  let currentName = "";
  let currentMaterial = "";
  for (const face of faces) {
    if (face.name !== currentName) {
      lines.push(`g ${face.name}`);
      currentName = face.name;
    }
    if (face.material !== currentMaterial) {
      lines.push(`usemtl ${face.material}`);
      currentMaterial = face.material;
    }
    lines.push(`f ${face.indices.map((index) => index + 1).join(" ")}`);
  }
  writeFileSync(path.join(MODEL_DIR, `${CAR.modelSlug}.obj`), `${lines.join("\n")}\n`);
}

function writeMtl() {
  const lines = [CAR.materialComment];
  for (const [name, material] of Object.entries(MATERIALS)) {
    const [r, g, b] = hexToRgb(material.color).map((value) => (value / 255).toFixed(5));
    lines.push(
      "",
      `newmtl ${name}`,
      `Kd ${r} ${g} ${b}`,
      `Ks ${material.roughness < 0.5 ? "0.26000 0.26000 0.26000" : "0.08000 0.08000 0.08000"}`,
      `Ns ${Math.round((1 - material.roughness) * 180 + 8)}`
    );
  }
  writeFileSync(path.join(MODEL_DIR, `${CAR.modelSlug}.mtl`), `${lines.join("\n")}\n`);
}

function findChrome() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ];
  return candidates.find(existsSync);
}

function rasterize(chromePath, sourcePath, outputPath, width, height, transparent) {
  const profileName = path.basename(outputPath, path.extname(outputPath)).replace(/[^a-z0-9-]/gi, "-");
  const profilePath = path.join(process.env.TEMP ?? "C:\\tmp", `wangan-zero-${profileName}`);
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    "--force-device-scale-factor=1",
    `--user-data-dir=${profilePath}`,
    `--window-size=${width},${height}`,
    `--screenshot=${outputPath}`
  ];
  if (transparent) {
    args.push("--default-background-color=00000000");
  }
  args.push(`file:///${sourcePath.replaceAll("\\", "/")}`);
  const result = spawnSync(chromePath, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Chrome failed to rasterize ${sourcePath}:\n${result.stderr || result.stdout}`);
  }
}

function main() {
  mkdirSync(MODEL_DIR, { recursive: true });
  mkdirSync(FRAME_DIR, { recursive: true });
  mkdirSync(SOURCE_DIR, { recursive: true });
  buildModel();
  writeObj();
  writeMtl();

  for (const angle of FRAME_ANGLES) {
    const basename = `${CAR.frameSlug}-${String(angle).padStart(3, "0")}`;
    writeFileSync(path.join(SOURCE_DIR, `${basename}.svg`), frameSvg(angle));
  }
  for (const angle of FRONT_FRAME_ANGLES) {
    const basename = `${FRONT_FRAME_SLUG}-${String(angle).padStart(3, "0")}`;
    writeFileSync(path.join(SOURCE_DIR, `${basename}.svg`), frameSvg(angle, "front"));
  }
  const sheetSource = path.join(SOURCE_DIR, `${CAR.sheetSlug}.svg`);
  writeFileSync(sheetSource, sheetSvg());
  const frontSheetSource = path.join(SOURCE_DIR, `${FRONT_SHEET_SLUG}.svg`);
  writeFileSync(frontSheetSource, sheetSvg({
    angles: FRONT_FRAME_ANGLES,
    height: FRONT_SHEET_HEIGHT,
    view: "front"
  }));

  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error("Chrome or Edge is required to rasterize the generated SVG frames.");
  }

  for (const angle of FRAME_ANGLES) {
    const basename = `${CAR.frameSlug}-${String(angle).padStart(3, "0")}`;
    rasterize(
      chromePath,
      path.join(SOURCE_DIR, `${basename}.svg`),
      path.join(FRAME_DIR, `${basename}.png`),
      FRAME_WIDTH,
      FRAME_HEIGHT,
      true
    );
  }
  for (const angle of FRONT_FRAME_ANGLES) {
    const basename = `${FRONT_FRAME_SLUG}-${String(angle).padStart(3, "0")}`;
    rasterize(
      chromePath,
      path.join(SOURCE_DIR, `${basename}.svg`),
      path.join(FRAME_DIR, `${basename}.png`),
      FRAME_WIDTH,
      FRAME_HEIGHT,
      true
    );
  }
  rasterize(
    chromePath,
    sheetSource,
    path.join(FRAME_DIR, `${CAR.sheetSlug}.png`),
    SHEET_WIDTH,
    SHEET_HEIGHT,
    false
  );
  rasterize(
    chromePath,
    frontSheetSource,
    path.join(FRAME_DIR, `${FRONT_SHEET_SLUG}.png`),
    SHEET_WIDTH,
    FRONT_SHEET_HEIGHT,
    false
  );

  console.log(`Generated ${FRAME_ANGLES.length} rear and ${FRONT_FRAME_ANGLES.length} front ${CAR.label} transparent frames in ${FRAME_DIR}`);
  console.log(`Generated ${CAR.label} OBJ source model in ${MODEL_DIR}`);
}

main();
