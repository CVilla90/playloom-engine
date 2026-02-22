import { clamp } from "@playloom/engine-core";
import type { Renderer2D } from "../Renderer2D";

export function drawPanel(renderer: Renderer2D, x: number, y: number, width: number, height: number, title?: string): void {
  renderer.rect(x, y, width, height, "rgba(16, 18, 24, 0.74)");
  renderer.strokeRect(x, y, width, height, "rgba(245, 226, 171, 0.85)", 2);
  if (title) {
    renderer.text(title, x + 10, y + 22, { color: "#f9e9c3", font: "bold 16px Trebuchet MS" });
  }
}

export function drawBar(
  renderer: Renderer2D,
  x: number,
  y: number,
  width: number,
  height: number,
  value: number,
  max: number,
  color: string,
  bg = "rgba(255,255,255,0.14)"
): void {
  renderer.rect(x, y, width, height, bg);
  renderer.rect(x, y, width * clamp(value / max, 0, 1), height, color);
  renderer.strokeRect(x, y, width, height, "rgba(255,255,255,0.45)", 1);
}
