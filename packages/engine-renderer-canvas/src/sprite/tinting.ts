export interface SpriteTintLayer {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string | null;
  alpha?: number;
}

export interface SpriteComposeContext {
  canvas: {
    width: number;
    height: number;
  };
  clearRect(x: number, y: number, width: number, height: number): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
  save(): void;
  restore(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  imageSmoothingEnabled: boolean;
  globalCompositeOperation: GlobalCompositeOperation;
  globalAlpha: number;
  fillStyle: string | CanvasGradient | CanvasPattern;
}

export interface ComposeTintedSpriteFrameOptions {
  sourceImage: CanvasImageSource;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  tintLayers?: readonly SpriteTintLayer[];
  smoothing?: boolean;
}

export function composeTintedSpriteFrame(
  context: SpriteComposeContext,
  options: ComposeTintedSpriteFrameOptions
): { width: number; height: number } {
  const {
    sourceImage,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    outputWidth,
    outputHeight,
    tintLayers = [],
    smoothing = false
  } = options;

  if (context.canvas.width !== outputWidth || context.canvas.height !== outputHeight) {
    context.canvas.width = outputWidth;
    context.canvas.height = outputHeight;
  }

  context.clearRect(0, 0, outputWidth, outputHeight);
  context.imageSmoothingEnabled = smoothing;
  context.drawImage(
    sourceImage,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight
  );

  for (const layer of tintLayers) {
    if (!layer.color) continue;
    context.save();
    context.globalCompositeOperation = "source-atop";
    context.globalAlpha = layer.alpha ?? 0.55;
    context.fillStyle = layer.color;
    context.fillRect(layer.x, layer.y, layer.width, layer.height);
    context.restore();
  }

  return context.canvas;
}
