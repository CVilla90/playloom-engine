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
  private readonly usePointerIds = new Set<number>();
  private readonly primaryPointerIds = new Set<number>();
  private readonly utilityPointerIds = new Set<number>();
  private readonly menuPointerIds = new Set<number>();
  private usePressed = false;
  private primaryPressed = false;
  private utilityPressed = false;
  private menuPressed = false;
  private menuConfirming = false;
  private sawTouchInput = false;

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse") {
      return;
    }

    event.preventDefault();
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

    if (this.isPrimaryZone(point)) {
      this.primaryPointerIds.add(event.pointerId);
      this.primaryPressed = true;
      this.tryCapture(event.pointerId);
      return;
    }

    if (this.isUtilityZone(point)) {
      this.utilityPointerIds.add(event.pointerId);
      this.utilityPressed = true;
      this.tryCapture(event.pointerId);
      return;
    }

    if (this.isUseZone(point)) {
      this.usePointerIds.add(event.pointerId);
      this.usePressed = true;
      this.tryCapture(event.pointerId);
      return;
    }

    if (this.isMenuZone(point)) {
      this.menuPointerIds.add(event.pointerId);
      this.menuPressed = true;
      this.tryCapture(event.pointerId);
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType !== "mouse") {
      event.preventDefault();
    }

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
    if (event.pointerType !== "mouse") {
      event.preventDefault();
    }

    if (event.pointerId === this.movePointerId) {
      this.movePointerId = null;
      this.moveDelta = { x: 0, y: 0 };
    }

    this.usePointerIds.delete(event.pointerId);
    this.primaryPointerIds.delete(event.pointerId);
    this.utilityPointerIds.delete(event.pointerId);
    this.menuPointerIds.delete(event.pointerId);
    this.tryRelease(event.pointerId);
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly width: number,
    private readonly height: number
  ) {}

  attach(): void {
    this.canvas.addEventListener("pointerdown", this.onPointerDown, { passive: false });
    this.canvas.addEventListener("pointermove", this.onPointerMove, { passive: false });
    this.canvas.addEventListener("pointerup", this.onPointerUp, { passive: false });
    this.canvas.addEventListener("pointercancel", this.onPointerUp, { passive: false });
  }

  detach(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.movePointerId = null;
    this.moveDelta = { x: 0, y: 0 };
    this.usePointerIds.clear();
    this.primaryPointerIds.clear();
    this.utilityPointerIds.clear();
    this.menuPointerIds.clear();
    this.usePressed = false;
    this.primaryPressed = false;
    this.utilityPressed = false;
    this.menuPressed = false;
    this.menuConfirming = false;
  }

  axis(): Point {
    const length = Math.hypot(this.moveDelta.x, this.moveDelta.y);
    if (length <= 3) {
      return { x: 0, y: 0 };
    }

    return {
      x: this.moveDelta.x / length,
      y: this.moveDelta.y / length
    };
  }

  consumeUsePressed(): boolean {
    const pressed = this.usePressed;
    this.usePressed = false;
    return pressed;
  }

  consumePrimaryPressed(): boolean {
    const pressed = this.primaryPressed;
    this.primaryPressed = false;
    return pressed;
  }

  consumeUtilityPressed(): boolean {
    const pressed = this.utilityPressed;
    this.utilityPressed = false;
    return pressed;
  }

  consumeMenuPressed(): boolean {
    const pressed = this.menuPressed;
    this.menuPressed = false;
    return pressed;
  }

  setMenuConfirming(confirming: boolean): void {
    this.menuConfirming = confirming;
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
    const moveAxis = this.moveVisualAxis();
    const knobDistance = 38;
    const knobX = moveCenter.x + moveAxis.x * knobDistance;
    const knobY = moveCenter.y + moveAxis.y * knobDistance;
    const useCenter = this.useCenter();
    const primaryCenter = this.primaryCenter();
    const utilityCenter = this.utilityCenter();
    const menuButton = this.menuButtonRect();
    const useHeld = this.usePointerIds.size > 0;
    const primaryHeld = this.primaryPointerIds.size > 0;
    const utilityHeld = this.utilityPointerIds.size > 0;
    const menuHeld = this.menuPointerIds.size > 0;

    ctx.save();
    ctx.globalAlpha = 0.9;
    renderer.circle(moveCenter.x, moveCenter.y, 58, "rgba(24, 30, 36, 0.34)");
    renderer.strokeRect(moveCenter.x - 58, moveCenter.y - 58, 116, 116, "rgba(220, 224, 195, 0.08)", 1);
    renderer.circle(knobX, knobY, 24, "rgba(233, 228, 181, 0.26)");
    renderer.strokeRect(useCenter.x - 30, useCenter.y - 30, 60, 60, "rgba(235, 218, 126, 0.12)", 1);
    renderer.circle(
      useCenter.x,
      useCenter.y,
      38,
      useHeld ? "rgba(235, 218, 126, 0.45)" : "rgba(58, 49, 22, 0.42)"
    );
    renderer.strokeRect(primaryCenter.x - 28, primaryCenter.y - 28, 56, 56, "rgba(121, 219, 228, 0.12)", 1);
    renderer.circle(
      primaryCenter.x,
      primaryCenter.y,
      34,
      primaryHeld ? "rgba(121, 219, 228, 0.42)" : "rgba(22, 44, 48, 0.42)"
    );
    renderer.strokeRect(utilityCenter.x - 28, utilityCenter.y - 28, 56, 56, "rgba(146, 231, 171, 0.14)", 1);
    renderer.circle(
      utilityCenter.x,
      utilityCenter.y,
      34,
      utilityHeld ? "rgba(146, 231, 171, 0.42)" : "rgba(24, 49, 36, 0.42)"
    );
    renderer.rect(
      menuButton.x,
      menuButton.y,
      menuButton.width,
      menuButton.height,
      menuHeld
        ? "rgba(225, 139, 128, 0.54)"
        : this.menuConfirming
          ? "rgba(112, 42, 36, 0.7)"
          : "rgba(36, 20, 18, 0.58)"
    );
    renderer.strokeRect(
      menuButton.x,
      menuButton.y,
      menuButton.width,
      menuButton.height,
      this.menuConfirming ? "rgba(255, 190, 182, 0.92)" : "rgba(255, 200, 189, 0.36)",
      1
    );
    renderer.text("MOVE", moveCenter.x, moveCenter.y + 86, {
      align: "center",
      color: "rgba(242, 234, 187, 0.86)",
      font: "bold 13px Trebuchet MS"
    });
    renderer.text("USE", useCenter.x, useCenter.y + 5, {
      align: "center",
      color: "#f7efbd",
      font: "bold 14px Trebuchet MS"
    });
    renderer.text("ACT", primaryCenter.x, primaryCenter.y + 5, {
      align: "center",
      color: "#c6f8ff",
      font: "bold 14px Trebuchet MS"
    });
    renderer.text("UTIL", utilityCenter.x, utilityCenter.y + 5, {
      align: "center",
      color: "#d7ffe0",
      font: "bold 13px Trebuchet MS"
    });
    renderer.text(this.menuConfirming ? "SURE?" : "LOBBY", menuButton.x + menuButton.width * 0.5, menuButton.y + 21, {
      align: "center",
      color: this.menuConfirming ? "#ffe1d9" : "#ffd7cf",
      font: "bold 13px Trebuchet MS"
    });
    ctx.restore();
  }

  private moveVisualAxis(): Point {
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

  private useCenter(): Point {
    return {
      x: this.width - 92,
      y: this.height - 92
    };
  }

  private primaryCenter(): Point {
    return {
      x: this.width - 188,
      y: this.height - 154
    };
  }

  private utilityCenter(): Point {
    return {
      x: this.width - 92,
      y: Math.max(this.height - 236, this.height * 0.42)
    };
  }

  private isMoveZone(point: Point): boolean {
    return point.x <= this.width * 0.45 && point.y >= this.height * 0.52;
  }

  private isUseZone(point: Point): boolean {
    const center = this.useCenter();
    return Math.hypot(point.x - center.x, point.y - center.y) <= 58;
  }

  private isPrimaryZone(point: Point): boolean {
    const center = this.primaryCenter();
    return Math.hypot(point.x - center.x, point.y - center.y) <= 54;
  }

  private isUtilityZone(point: Point): boolean {
    const center = this.utilityCenter();
    return Math.hypot(point.x - center.x, point.y - center.y) <= 54;
  }

  private isMenuZone(point: Point): boolean {
    const button = this.menuButtonRect();
    return (
      point.x >= button.x &&
      point.x <= button.x + button.width &&
      point.y >= button.y &&
      point.y <= button.y + button.height
    );
  }

  private menuButtonRect(): { x: number; y: number; width: number; height: number } {
    return {
      x: this.width - 118,
      y: 74,
      width: 104,
      height: 32
    };
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
