export class InputManager {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (!this.down.has(key)) {
        this.pressed.add(key);
      }
      this.down.add(key);
    });

    target.addEventListener("keyup", (event) => {
      this.down.delete(event.key.toLowerCase());
    });

    target.addEventListener("blur", () => {
      this.down.clear();
      this.pressed.clear();
    });
  }

  isDown(...keys: string[]): boolean {
    return keys.some((key) => this.down.has(key.toLowerCase()));
  }

  wasPressed(...keys: string[]): boolean {
    return keys.some((key) => this.pressed.has(key.toLowerCase()));
  }

  endFrame(): void {
    this.pressed.clear();
  }
}
