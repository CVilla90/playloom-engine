export interface Scene {
  onEnter?(): void;
  onExit?(): void;
  update(dt: number): void;
  render(alpha: number): void;
}

export class SceneManager {
  private current: Scene | null = null;

  setScene(scene: Scene): void {
    this.current?.onExit?.();
    this.current = scene;
    this.current.onEnter?.();
  }

  update(dt: number): void {
    this.current?.update(dt);
  }

  render(alpha: number): void {
    this.current?.render(alpha);
  }

  getCurrent(): Scene | null {
    return this.current;
  }
}
