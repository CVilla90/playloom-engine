export type UpdateCallback = (dt: number) => void;
export type RenderCallback = (alpha: number) => void;

export class FixedLoop {
  private readonly stepMs: number;
  private readonly update: UpdateCallback;
  private readonly render: RenderCallback;
  private accumulator = 0;
  private lastTime = 0;
  private rafId: number | null = null;
  private running = false;

  constructor(stepHz: number, update: UpdateCallback, render: RenderCallback) {
    this.stepMs = 1000 / stepHz;
    this.update = update;
    this.render = render;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick = (time: number): void => {
    if (!this.running) return;

    let delta = time - this.lastTime;
    this.lastTime = time;

    if (delta > 250) {
      delta = 250;
    }

    this.accumulator += delta;

    while (this.accumulator >= this.stepMs) {
      this.update(this.stepMs / 1000);
      this.accumulator -= this.stepMs;
    }

    this.render(this.accumulator / this.stepMs);
    this.rafId = requestAnimationFrame(this.tick);
  };
}
