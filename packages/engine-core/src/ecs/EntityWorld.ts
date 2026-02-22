import type { Renderer2D } from "@playloom/engine-renderer-canvas";

export interface Entity {
  id: string;
  active: boolean;
  update(dt: number): void;
  render(renderer: Renderer2D, alpha: number): void;
}

export class EntityWorld {
  private readonly entities: Entity[] = [];

  add(entity: Entity): void {
    this.entities.push(entity);
  }

  clear(): void {
    this.entities.length = 0;
  }

  update(dt: number): void {
    for (const entity of this.entities) {
      if (!entity.active) continue;
      entity.update(dt);
    }
    this.removeInactive();
  }

  render(renderer: Renderer2D, alpha: number): void {
    for (const entity of this.entities) {
      if (!entity.active) continue;
      entity.render(renderer, alpha);
    }
  }

  getEntities(): readonly Entity[] {
    return this.entities;
  }

  private removeInactive(): void {
    for (let i = this.entities.length - 1; i >= 0; i -= 1) {
      const entity = this.entities[i];
      if (entity && !entity.active) {
        this.entities.splice(i, 1);
      }
    }
  }
}
