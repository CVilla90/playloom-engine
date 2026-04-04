export class InputManager {
  private readonly physicalDown = new Set<string>();
  private readonly physicalPressed = new Set<string>();
  private readonly virtualDown = new Set<string>();
  private readonly virtualPressed = new Set<string>();
  private readonly tappedVirtualKeys = new Set<string>();

  constructor(target: EventTarget = window) {
    target.addEventListener("keydown", (event) => {
      const key = this.eventKey(event);
      if (!key) {
        return;
      }
      if (!this.physicalDown.has(key)) {
        this.physicalPressed.add(key);
      }
      this.physicalDown.add(key);
    });

    target.addEventListener("keyup", (event) => {
      const key = this.eventKey(event);
      if (!key) {
        return;
      }
      this.physicalDown.delete(key);
    });

    target.addEventListener("blur", () => {
      this.physicalDown.clear();
      this.physicalPressed.clear();
      this.clearVirtualKeys();
    });
  }

  isDown(...keys: string[]): boolean {
    return keys.some((key) => {
      const normalized = key.toLowerCase();
      return this.physicalDown.has(normalized) || this.virtualDown.has(normalized);
    });
  }

  wasPressed(...keys: string[]): boolean {
    return keys.some((key) => {
      const normalized = key.toLowerCase();
      return this.physicalPressed.has(normalized) || this.virtualPressed.has(normalized);
    });
  }

  setVirtualKeyDown(key: string, isDown: boolean): void {
    const normalized = key.toLowerCase();
    if (isDown) {
      if (!this.virtualDown.has(normalized)) {
        this.virtualPressed.add(normalized);
      }
      this.virtualDown.add(normalized);
      this.tappedVirtualKeys.delete(normalized);
      return;
    }

    this.virtualDown.delete(normalized);
    this.tappedVirtualKeys.delete(normalized);
  }

  tapVirtualKey(key: string): void {
    const normalized = key.toLowerCase();
    this.virtualDown.add(normalized);
    this.virtualPressed.add(normalized);
    this.tappedVirtualKeys.add(normalized);
  }

  clearVirtualKeys(): void {
    this.virtualDown.clear();
    this.virtualPressed.clear();
    this.tappedVirtualKeys.clear();
  }

  endFrame(): void {
    this.physicalPressed.clear();
    this.virtualPressed.clear();
    for (const key of this.tappedVirtualKeys) {
      this.virtualDown.delete(key);
    }
    this.tappedVirtualKeys.clear();
  }

  private eventKey(event: Event): string | null {
    const key = (event as KeyboardEvent).key;
    return typeof key === "string" && key.length > 0 ? key.toLowerCase() : null;
  }
}
