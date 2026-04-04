import type { InputManager } from "@playloom/engine-input";
import { BootScene } from "../scenes/BootScene";
import { GameScene } from "../scenes/GameScene";

type TouchControlMode = "hidden" | "boot" | "flight";

interface TouchButtonSpec {
  readonly label: string;
  readonly key: string;
  readonly hold?: boolean;
  readonly tone?: "gold" | "cyan" | "ember";
  readonly wide?: boolean;
}

const BOOT_BUTTONS: readonly TouchButtonSpec[] = [
  { label: "NEW", key: "n", tone: "gold", wide: true },
  { label: "CONT", key: "c", tone: "cyan", wide: true },
  { label: "SAVE 1", key: "1" },
  { label: "SAVE 2", key: "2" },
  { label: "SAVE 3", key: "3" }
] as const;

const UTILITY_BUTTONS: readonly TouchButtonSpec[] = [
  { label: "MAP", key: "m" },
  { label: "LOG", key: "l" },
  { label: "MSG", key: "p" },
  { label: "RST", key: "r", tone: "ember" },
  { label: "AUD", key: "v" }
] as const;

const FLIGHT_BUTTONS: readonly TouchButtonSpec[] = [
  { label: "LEFT", key: "a" },
  { label: "THR / UP", key: "w", hold: true, tone: "cyan" },
  { label: "RIGHT", key: "d" },
  { label: "BACK", key: "escape", tone: "ember" },
  { label: "BRK / DN", key: "s", hold: true, tone: "gold" },
  { label: "OK", key: "enter", tone: "cyan" }
] as const;

export class TouchConsoleControls {
  private readonly root = document.createElement("div");
  private readonly note = document.createElement("div");
  private readonly deck = document.createElement("div");
  private readonly utilityGroup = document.createElement("div");
  private readonly primaryGroup = document.createElement("div");
  private mode: TouchControlMode = "hidden";
  private attached = false;

  private readonly onResize = (): void => {
    this.root.classList.toggle("is-visible", this.shouldRender());
  };

  constructor(
    private readonly input: InputManager,
    private readonly mount: HTMLElement
  ) {
    this.root.className = "courier-touch-panel";
    this.note.className = "courier-touch-panel__note";
    this.note.textContent = "Touch deck active. Keyboard remains supported.";
    this.deck.className = "courier-touch-panel__deck";
    this.utilityGroup.className = "courier-touch-panel__group courier-touch-panel__group--utility";
    this.primaryGroup.className = "courier-touch-panel__group courier-touch-panel__group--primary";
    this.root.append(this.note, this.deck);
    this.deck.append(this.utilityGroup, this.primaryGroup);
  }

  attach(): void {
    if (this.attached) {
      return;
    }
    this.attached = true;
    this.mount.appendChild(this.root);
    window.addEventListener("resize", this.onResize);
    this.onResize();
  }

  detach(): void {
    if (!this.attached) {
      return;
    }
    this.attached = false;
    window.removeEventListener("resize", this.onResize);
    this.input.clearVirtualKeys();
    this.root.remove();
  }

  syncScene(scene: unknown): void {
    const nextMode = scene instanceof BootScene
      ? "boot"
      : scene instanceof GameScene
        ? "flight"
        : "hidden";

    this.root.classList.toggle("is-visible", this.shouldRender());
    if (nextMode === this.mode) {
      return;
    }

    this.mode = nextMode;
    this.utilityGroup.replaceChildren();
    this.primaryGroup.replaceChildren();

    if (nextMode === "boot") {
      this.root.setAttribute("data-mode", "boot");
      for (const spec of BOOT_BUTTONS) {
        this.primaryGroup.appendChild(this.createButton(spec));
      }
      return;
    }

    if (nextMode === "flight") {
      this.root.setAttribute("data-mode", "flight");
      for (const spec of UTILITY_BUTTONS) {
        this.utilityGroup.appendChild(this.createButton(spec));
      }
      for (const spec of FLIGHT_BUTTONS) {
        this.primaryGroup.appendChild(this.createButton(spec));
      }
      return;
    }

    this.root.setAttribute("data-mode", "hidden");
  }

  private shouldRender(): boolean {
    return navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 920;
  }

  private createButton(spec: TouchButtonSpec): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "courier-touch-button";
    if (spec.wide) {
      button.classList.add("is-wide");
    }
    if (spec.hold) {
      button.classList.add("is-hold");
    }
    button.setAttribute("data-tone", spec.tone ?? "gold");
    button.textContent = spec.label;

    if (spec.hold) {
      let activePointerId: number | null = null;

      const release = (): void => {
        if (activePointerId === null) {
          return;
        }
        activePointerId = null;
        button.classList.remove("is-active");
        this.input.setVirtualKeyDown(spec.key, false);
      };

      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        activePointerId = event.pointerId;
        button.classList.add("is-active");
        this.input.setVirtualKeyDown(spec.key, true);
        try {
          button.setPointerCapture(event.pointerId);
        } catch {}
      });
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("lostpointercapture", release);
      button.addEventListener("pointerleave", (event) => {
        if (event.pointerType !== "mouse") {
          release();
        }
      });
      return button;
    }

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.classList.add("is-active");
      this.input.tapVirtualKey(spec.key);
    });
    const clearActive = (): void => button.classList.remove("is-active");
    button.addEventListener("pointerup", clearActive);
    button.addEventListener("pointercancel", clearActive);
    button.addEventListener("pointerleave", clearActive);
    return button;
  }
}
