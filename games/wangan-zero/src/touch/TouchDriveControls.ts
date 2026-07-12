import type { InputManager } from "@playloom/engine-input";

interface TouchButton {
  readonly label: string;
  readonly key: string;
  readonly mode: "hold" | "tap";
  readonly tone: "amber" | "cyan" | "neutral";
}

const BUTTONS: readonly TouchButton[] = [
  { label: "GEAR −", key: "q", mode: "tap", tone: "neutral" },
  { label: "GEAR +", key: "e", mode: "tap", tone: "amber" },
  { label: "START", key: "enter", mode: "tap", tone: "neutral" },
  { label: "RESTART", key: "r", mode: "tap", tone: "neutral" },
  { label: "AUDIO", key: "m", mode: "tap", tone: "neutral" }
];

export class TouchDriveControls {
  constructor(
    private readonly input: InputManager,
    private readonly root: HTMLElement
  ) {}

  attach(): void {
    const panel = document.createElement("div");
    panel.className = "artery-touch-panel";
    panel.setAttribute("aria-label", "Touch driving controls");

    for (const definition of BUTTONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "artery-touch-button";
      button.dataset.tone = definition.tone;
      button.textContent = definition.label;

      if (definition.mode === "tap") {
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          this.input.tapVirtualKey(definition.key);
          button.classList.add("is-active");
        });
        button.addEventListener("pointerup", () => button.classList.remove("is-active"));
        button.addEventListener("pointercancel", () => button.classList.remove("is-active"));
      } else {
        const release = (): void => {
          this.input.setVirtualKeyDown(definition.key, false);
          button.classList.remove("is-active");
        };
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          button.setPointerCapture(event.pointerId);
          this.input.setVirtualKeyDown(definition.key, true);
          button.classList.add("is-active");
        });
        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
        button.addEventListener("lostpointercapture", release);
      }

      panel.appendChild(button);
    }

    this.root.appendChild(panel);
  }
}
