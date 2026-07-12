export interface BurnoutSmokeSpriteState {
  readonly intensity: number;
  readonly elapsedSeconds: number;
  readonly sequence: number;
}

export interface BurnoutSmokeSpriteLayout {
  readonly leftWheelX: number;
  readonly rightWheelX: number;
  readonly groundY: number;
  readonly scale?: number;
}

/**
 * Draws the same rear-facing two-wheel smoke sprite for a cockpit mirror or a
 * future remote-player car. It owns no simulation state and changes no physics.
 */
export function drawBurnoutSmokeSprite(
  ctx: CanvasRenderingContext2D,
  state: BurnoutSmokeSpriteState,
  layout: BurnoutSmokeSpriteLayout
): void {
  if (state.intensity <= 0) {
    return;
  }
  const scale = layout.scale ?? 1;
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (const side of [-1, 1] as const) {
    const wheelX = side < 0 ? layout.leftWheelX : layout.rightWheelX;
    for (let index = 0; index < 7; index += 1) {
      const life =
        (state.elapsedSeconds * 1.55 + index * 0.137 + (side > 0 ? 0.07 : 0)) % 1;
      const random =
        Math.sin((state.sequence * 31 + index * 17 + side * 7) * 12.9898) *
        43758.5453;
      const jitter = random - Math.floor(random) - 0.5;
      const x = wheelX + (jitter * (5 + life * 17) - side * life * 5) * scale;
      const y = layout.groundY - (3 + life * (24 + Math.abs(jitter) * 24)) * scale;
      const radiusX = (4 + life * 13) * scale;
      const radiusY = (2.5 + life * 8) * scale;
      const alpha = state.intensity * (1 - life) * 0.34;

      ctx.beginPath();
      ctx.ellipse(x, y, radiusX, radiusY, jitter * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(210,219,225,${alpha.toFixed(3)})`;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(
        x - jitter * 3 * scale,
        y + scale,
        radiusX * 0.54,
        radiusY * 0.48,
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = `rgba(245,247,246,${(alpha * 0.52).toFixed(3)})`;
      ctx.fill();
    }
  }
  ctx.restore();
}
