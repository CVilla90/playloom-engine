export interface TextOptions {
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  color?: string;
  font?: string;
}

export class Renderer2D {
  constructor(public readonly ctx: CanvasRenderingContext2D, public readonly width: number, public readonly height: number) {}

  clear(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  rect(x: number, y: number, width: number, height: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, width, height);
  }

  strokeRect(x: number, y: number, width: number, height: number, color: string, lineWidth = 1): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.strokeRect(x, y, width, height);
  }

  circle(x: number, y: number, radius: number, color: string): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  text(value: string, x: number, y: number, options: TextOptions = {}): void {
    this.ctx.save();
    if (options.font) this.ctx.font = options.font;
    if (options.align) this.ctx.textAlign = options.align;
    if (options.baseline) this.ctx.textBaseline = options.baseline;
    this.ctx.fillStyle = options.color ?? "#ffffff";
    this.ctx.fillText(value, x, y);
    this.ctx.restore();
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width = 1): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.stroke();
  }

  drawImage(image: CanvasImageSource, x: number, y: number, width: number, height: number): void {
    this.ctx.drawImage(image, x, y, width, height);
  }
}
