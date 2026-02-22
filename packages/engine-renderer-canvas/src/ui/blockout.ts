import type { Renderer2D } from "../Renderer2D";

export interface FloorStyle {
  base: string;
  topEdge: string;
  bottomEdge: string;
  bolt: string;
}

export interface CeilingStyle {
  base: string;
  topEdge: string;
  bottomEdge: string;
  rib: string;
}

export interface StairStyle {
  frame: string;
  frameStroke: string;
  rail: string;
  railShadow: string;
  tread: string;
  treadShadow: string;
}

export interface ZoneDebugRect {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  color?: string;
}

const defaultFloorStyle: FloorStyle = {
  base: "#23324a",
  topEdge: "#3d5577",
  bottomEdge: "#16243a",
  bolt: "#6f8caf"
};

const defaultCeilingStyle: CeilingStyle = {
  base: "#0b1224",
  topEdge: "#1f2f4a",
  bottomEdge: "#16243b",
  rib: "#26395b"
};

const defaultStairStyle: StairStyle = {
  frame: "#18283e",
  frameStroke: "#4c6f98",
  rail: "#90b2d9",
  railShadow: "#4b6c93",
  tread: "#a8c7ea",
  treadShadow: "#3d597e"
};

export function drawIndustrialFloorSegment(
  renderer: Renderer2D,
  x: number,
  y: number,
  width: number,
  height: number,
  style: Partial<FloorStyle> = {}
): void {
  if (width <= 0 || height <= 0) return;
  const colors = { ...defaultFloorStyle, ...style };
  renderer.rect(x, y, width, height, colors.base);
  renderer.rect(x, y, width, Math.min(3, height), colors.topEdge);
  renderer.rect(x, y + Math.max(0, height - 3), width, Math.min(3, height), colors.bottomEdge);
  for (let boltX = x + 18; boltX < x + width - 8; boltX += 56) {
    renderer.circle(boltX, y + height * 0.5, 2, colors.bolt);
  }
}

export function drawIndustrialCeilingSegment(
  renderer: Renderer2D,
  x: number,
  y: number,
  width: number,
  height: number,
  style: Partial<CeilingStyle> = {}
): void {
  if (width <= 0 || height <= 0) return;
  const colors = { ...defaultCeilingStyle, ...style };
  renderer.rect(x, y, width, height, colors.base);
  renderer.rect(x, y, width, Math.min(2, height), colors.topEdge);
  renderer.rect(x, y + Math.max(0, height - 3), width, Math.min(2, height), colors.bottomEdge);
  for (let ribX = x + 16; ribX < x + width; ribX += 44) {
    renderer.line(ribX, y + 2, ribX, y + Math.max(2, height - 2), colors.rib, 1);
  }
}

export function drawIndustrialStairFlight(
  renderer: Renderer2D,
  x: number,
  y: number,
  width: number,
  height: number,
  direction: -1 | 1,
  style: Partial<StairStyle> = {}
): void {
  const colors = { ...defaultStairStyle, ...style };
  renderer.rect(x, y, width, height, colors.frame);
  renderer.strokeRect(x, y, width, height, colors.frameStroke, 1.5);

  const topY = y + 8;
  const bottomY = y + height - 7;
  const railStartX = direction > 0 ? x + 22 : x + width - 22;
  const railEndX = railStartX + direction * 58;

  renderer.line(railStartX, bottomY - 3, railEndX, topY + 8, colors.rail, 3);
  renderer.line(
    railStartX + direction * 16,
    bottomY - 3,
    railEndX + direction * 16,
    topY + 8,
    colors.railShadow,
    2
  );

  const steps = 10;
  for (let i = 0; i < steps; i += 1) {
    const progress = i / (steps - 1);
    const treadY = bottomY - progress * (height - 22);
    const treadX = railStartX + direction * progress * 58;
    renderer.rect(treadX - 13, treadY - 2, 26, 4, colors.tread);
    renderer.rect(treadX - 13, treadY + 2, 26, 2, colors.treadShadow);
  }
}

export function drawZoneOverlay(renderer: Renderer2D, zones: readonly ZoneDebugRect[]): void {
  const { ctx } = renderer;
  ctx.save();
  for (const zone of zones) {
    const color = zone.color ?? "rgba(96, 182, 255, 0.24)";
    renderer.rect(zone.x, zone.y, zone.width, zone.height, color);
    renderer.strokeRect(zone.x, zone.y, zone.width, zone.height, "rgba(142, 214, 255, 0.92)", 1);
    if (zone.label) {
      renderer.text(zone.label, zone.x + 6, zone.y + 16, {
        color: "#d9f2ff",
        font: "12px Trebuchet MS"
      });
    }
  }
  ctx.restore();
}
