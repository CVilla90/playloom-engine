import { clamp } from "@playloom/engine-core";
import type { Renderer2D } from "../Renderer2D";
import type { TextOptions } from "../Renderer2D";

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

export function wrapTextLines(text: string, maxWidth: number, measureText: (value: string) => number): string[] {
  if (maxWidth <= 0) return [text];

  const paragraphs = text.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (trimmed.length === 0) {
      lines.push("");
      continue;
    }

    const words = trimmed.split(/\s+/);
    let current = words[0] ?? "";

    for (let i = 1; i < words.length; i += 1) {
      const word = words[i];
      if (!word) continue;
      const next = `${current} ${word}`;
      if (measureText(next) <= maxWidth || current.length === 0) {
        current = next;
      } else {
        lines.push(current);
        current = word;
      }
    }

    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

export function drawTextBlock(
  renderer: Renderer2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  options: TextOptions = {}
): number {
  const { ctx } = renderer;
  ctx.save();
  if (options.font) ctx.font = options.font;
  if (options.align) ctx.textAlign = options.align;
  if (options.baseline) ctx.textBaseline = options.baseline;

  const lines = wrapTextLines(text, maxWidth, (value) => ctx.measureText(value).width);

  ctx.restore();

  for (let i = 0; i < lines.length; i += 1) {
    renderer.text(lines[i] ?? "", x, y + i * lineHeight, options);
  }

  return lines.length;
}
