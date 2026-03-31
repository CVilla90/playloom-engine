import type { InputManager } from "./InputManager";

export interface InputLike {
  isDown(...keys: string[]): boolean;
  wasPressed(...keys: string[]): boolean;
}

export type ActionBindings = Record<string, readonly string[]>;

export class ActionMap {
  private bindings: ActionBindings;
  private readonly input: InputLike;

  constructor(input: InputLike, bindings: ActionBindings) {
    this.input = input;
    this.bindings = { ...bindings };
  }

  isDown(action: string): boolean {
    const keys = this.bindings[action] ?? [];
    if (keys.length === 0) return false;
    return this.input.isDown(...keys);
  }

  wasPressed(action: string): boolean {
    const keys = this.bindings[action] ?? [];
    if (keys.length === 0) return false;
    return this.input.wasPressed(...keys);
  }

  axis(negativeAction: string, positiveAction: string): number {
    return Number(this.isDown(positiveAction)) - Number(this.isDown(negativeAction));
  }

  bind(action: string, keys: readonly string[]): void {
    this.bindings = {
      ...this.bindings,
      [action]: [...keys]
    };
  }

  keysFor(action: string): readonly string[] {
    return this.bindings[action] ?? [];
  }

  allBindings(): Readonly<ActionBindings> {
    return this.bindings;
  }
}

export function createPlatformerActionBindings(): ActionBindings {
  return {
    move_left: ["a", "arrowleft"],
    move_right: ["d", "arrowright"],
    move_up: ["w", "arrowup"],
    move_down: ["s", "arrowdown"],
    jump: [" ", "x"],
    toggle_hud: ["h"],
    toggle_debug: ["f1"]
  };
}

export function createMenuActionBindings(): ActionBindings {
  return {
    menu_prev: ["a", "arrowleft", "w", "arrowup"],
    menu_next: ["d", "arrowright", "s", "arrowdown"],
    menu_confirm: ["enter", " "],
    menu_back: ["escape", "backspace"]
  };
}

export function createCharacterLabActionBindings(): ActionBindings {
  return {
    character_select_1: ["1"],
    character_select_2: ["2"],
    character_select_3: ["3"],
    character_select_4: ["4"],
    tint_head_prev: ["q"],
    tint_head_next: ["e"],
    tint_chest_prev: ["r"],
    tint_chest_next: ["t"],
    tint_legs_prev: ["y"],
    tint_legs_next: ["u"]
  };
}

export function createActionMapForInputManager(
  input: InputManager,
  bindings: ActionBindings = createPlatformerActionBindings()
): ActionMap {
  return new ActionMap(input, bindings);
}
