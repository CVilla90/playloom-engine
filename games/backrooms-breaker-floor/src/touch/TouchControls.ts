import type { Renderer2D } from "@playloom/engine-renderer-canvas";

interface Point {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class TouchControls {
  private movePointerId: number | null = null;
  private moveOrigin: Point = { x: 0, y: 0 };
  private moveDelta: Point = { x: 0, y: 0 };
  private readonly interactPointerIds = new Set<number>();
  private interactPressed = false;
  private sawTouchInput = false;

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse") {
      return;
    }

    this.sawTouchInput = true;
    const point = this.toCanvasPoint(event);
    if (!point) {
      return;
    }

    if (this.isMoveZone(point) && this.movePointerId === null) {
      this.movePointerId = event.pointerId;
      this.moveOrigin = point;
      this.moveDelta = { x: 0, y: 0 };
      this.tryCapture(event.pointerId);
      return;
    }

    if (this.isInteractZone(point)) {
      this.interactPointerIds.add(event.pointerId);
      this.interactPressed = true;
      this.tryCapture(event.pointerId);
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.movePointerId) {
      return;
    }

    const point = this.toCanvasPoint(event);
    if (!point) {
      return;
    }

    this.moveDelta = {
      x: point.x - this.moveOrigin.x,
      y: point.y - this.moveOrigin.y
    };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.movePointerId) {
      this.movePointerId = null;
      this.moveDelta = { x: 0, y: 0 };
    }

    this.interactPointerIds.delete(event.pointerId);
    this.tryRelease(event.pointerId);
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly width: number,
    private readonly height: number
  ) {}

  attach(): void {
    this.canvas.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    this.canvas.addEventListener("pointermove", this.onPointerMove, { passive: true });
    this.canvas.addEventListener("pointerup", this.onPointerUp, { passive: true });
    this.canvas.addEventListener("pointercancel", this.onPointerUp, { passive: true });
  }

  detach(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.movePointerId = null;
    this.moveDelta = { x: 0, y: 0 };
    this.interactPointerIds.clear();
    this.interactPressed = false;
  }

  axis(): Point {
    const maxRadius = 52;
    const length = Math.hypot(this.moveDelta.x, this.moveDelta.y);
    if (length <= 0.001) {
      return { x: 0, y: 0 };
    }

    const clampedLength = Math.min(length, maxRadius);
    return {
      x: (this.moveDelta.x / length) * (clampedLength / maxRadius),
      y: (this.moveDelta.y / length) * (clampedLength / maxRadius)
    };
  }

  consumeInteractPressed(): boolean {
    const pressed = this.interactPressed;
    this.interactPressed = false;
    return pressed;
  }

  shouldRender(): boolean {
    return this.sawTouchInput || navigator.maxTouchPoints > 0;
  }

  render(renderer: Renderer2D): void {
    if (!this.shouldRender()) {
      return;
    }

    const { ctx } = renderer;
    const moveCenter = this.currentMoveCenter();
    const moveAxis = this.axis();
    const knobDistance = 38;
    const knobX = moveCenter.x + moveAxis.x * knobDistance;
    const knobY = moveCenter.y + moveAxis.y * knobDistance;
    const interactCenter = this.interactCenter();
    const interactHeld = this.interactPointerIds.size > 0;

    ctx.save();
    ctx.globalAlpha = 0.9;
    renderer.circle(moveCenter.x, moveCenter.y, 58, "rgba(24, 30, 36, 0.34)");
    renderer.strokeRect(moveCenter.x - 58, moveCenter.y - 58, 116, 116, "rgba(220, 224, 195, 0.08)", 1);
    renderer.circle(knobX, knobY, 24, "rgba(233, 228, 181, 0.26)");
    renderer.strokeRect(interactCenter.x - 30, interactCenter.y - 30, 60, 60, "rgba(235, 218, 126, 0.12)", 1);
    renderer.circle(
      interactCenter.x,
      interactCenter.y,
      38,
      interactHeld ? "rgba(235, 218, 126, 0.45)" : "rgba(58, 49, 22, 0.42)"
    );
    renderer.text("MOVE", moveCenter.x, moveCenter.y + 86, {
      align: "center",
      color: "rgba(242, 234, 187, 0.86)",
      font: "bold 13px Trebuchet MS"
    });
    renderer.text("USE", interactCenter.x, interactCenter.y + 5, {
      align: "center",
      color: "#f7efbd",
      font: "bold 14px Trebuchet MS"
    });
    ctx.restore();
  }

  private currentMoveCenter(): Point {
    const defaultCenter = {
      x: 94,
      y: this.height - 92
    };
    if (this.movePointerId === null) {
      return defaultCenter;
    }

    return {
      x: clamp(this.moveOrigin.x, 82, this.width * 0.42),
      y: clamp(this.moveOrigin.y, this.height * 0.56, this.height - 82)
    };
  }

  private interactCenter(): Point {
    return {
      x: this.width - 92,
      y: this.height - 92
    };
  }

  private isMoveZone(point: Point): boolean {
    return point.x <= this.width * 0.45 && point.y >= this.height * 0.52;
  }

  private isInteractZone(point: Point): boolean {
    const center = this.interactCenter();
    return Math.hypot(point.x - center.x, point.y - center.y) <= 58 || (point.x >= this.width * 0.62 && point.y >= this.height * 0.5);
  }

  private toCanvasPoint(event: PointerEvent): Point | null {
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return null;
    }

    return {
      x: (event.clientX - bounds.left) * (this.width / bounds.width),
      y: (event.clientY - bounds.top) * (this.height / bounds.height)
    };
  }

  private tryCapture(pointerId: number): void {
    try {
      this.canvas.setPointerCapture(pointerId);
    } catch {}
  }

  private tryRelease(pointerId: number): void {
    try {
      if (this.canvas.hasPointerCapture(pointerId)) {
        this.canvas.releasePointerCapture(pointerId);
      }
    } catch {}
  }
}
