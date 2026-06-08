import type { InputManager } from "@playloom/engine-input";

interface TouchButtonConfig {
  readonly label: string;
  readonly key: string;
  readonly mode: "hold" | "tap";
  readonly title: string;
}

const STYLE_ID = "zacaton-depths-touch-controls";

export class DiveTouchControls {
  private readonly root = document.createElement("div");

  constructor(private readonly input: InputManager) {
    this.installStyles();
    this.root.className = "zacaton-touch";
    this.root.setAttribute("aria-label", "Touch controls");
    this.root.innerHTML = "";
    this.buildPad();
    this.buildActions();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  private buildPad(): void {
    const pad = document.createElement("div");
    pad.className = "zacaton-touch__pad";
    this.addButton(pad, { label: "UP", key: "arrowup", mode: "hold", title: "Swim up" }, "zacaton-touch__up");
    this.addButton(pad, { label: "LEFT", key: "arrowleft", mode: "hold", title: "Swim left" }, "zacaton-touch__left");
    this.addButton(pad, { label: "DOWN", key: "arrowdown", mode: "hold", title: "Swim down" }, "zacaton-touch__down");
    this.addButton(pad, { label: "RIGHT", key: "arrowright", mode: "hold", title: "Swim right" }, "zacaton-touch__right");
    this.root.appendChild(pad);
  }

  private buildActions(): void {
    const actions = document.createElement("div");
    actions.className = "zacaton-touch__actions";
    const buttons: readonly TouchButtonConfig[] = [
      { label: "DIVE", key: "enter", mode: "tap", title: "Start, confirm, or return to base" },
      { label: "BACK", key: "escape", mode: "tap", title: "Back or decline surface return" },
      { label: "LIGHT", key: "f", mode: "tap", title: "Toggle flashlight" },
      { label: "DROP", key: "q", mode: "tap", title: "Drop the emptiest tank" },
      { label: "LINE", key: "l", mode: "tap", title: "Deploy lifeline" },
      { label: "HOME", key: "h", mode: "hold", title: "Follow lifeline home" },
      { label: "JOB", key: "c", mode: "tap", title: "Open contracts at base or cache/recover tank during a dive" },
      { label: "SITE", key: "t", mode: "tap", title: "Open dive site selection at base" },
      { label: "SHOP", key: "s", mode: "tap", title: "Open shop from base" },
      { label: "MUSIC", key: "m", mode: "tap", title: "Toggle music ambience" },
      { label: "SFX", key: "v", mode: "tap", title: "Toggle sound effects" }
    ];
    for (const config of buttons) {
      this.addButton(actions, config);
    }
    this.root.appendChild(actions);
  }

  private addButton(parent: HTMLElement, config: TouchButtonConfig, className?: string): void {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `zacaton-touch__button${className ? ` ${className}` : ""}`;
    button.textContent = config.label;
    button.title = config.title;
    button.setAttribute("aria-label", config.title);

    const press = (event: PointerEvent): void => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      if (config.mode === "hold") {
        this.input.setVirtualKeyDown(config.key, true);
        return;
      }
      this.input.tapVirtualKey(config.key);
    };
    const release = (event: PointerEvent): void => {
      event.preventDefault();
      if (config.mode === "hold") {
        this.input.setVirtualKeyDown(config.key, false);
      }
      if (button.hasPointerCapture(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
    };

    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", () => {
      if (config.mode === "hold") {
        this.input.setVirtualKeyDown(config.key, false);
      }
    });
    parent.appendChild(button);
  }

  private installStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .zacaton-touch {
        position: fixed;
        inset: auto 14px 14px 14px;
        z-index: 20;
        display: none;
        pointer-events: none;
        justify-content: space-between;
        align-items: flex-end;
        gap: 12px;
        font-family: Aptos, Segoe UI, sans-serif;
      }

      .zacaton-touch__pad,
      .zacaton-touch__actions {
        pointer-events: auto;
      }

      .zacaton-touch__pad {
        display: grid;
        grid-template-columns: repeat(3, 58px);
        grid-template-rows: repeat(3, 54px);
        gap: 6px;
      }

      .zacaton-touch__actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(70px, 1fr));
        gap: 8px;
        max-width: 168px;
      }

      .zacaton-touch__button {
        min-width: 54px;
        min-height: 50px;
        border: 1px solid rgba(126, 223, 231, 0.44);
        border-radius: 8px;
        background: rgba(4, 14, 18, 0.76);
        color: #dffaff;
        font: 700 11px Aptos, Segoe UI, sans-serif;
        letter-spacing: 0;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }

      .zacaton-touch__button:active {
        background: rgba(36, 114, 124, 0.82);
        border-color: rgba(164, 245, 242, 0.86);
      }

      .zacaton-touch__up {
        grid-column: 2;
        grid-row: 1;
      }

      .zacaton-touch__left {
        grid-column: 1;
        grid-row: 2;
      }

      .zacaton-touch__down {
        grid-column: 2;
        grid-row: 2;
      }

      .zacaton-touch__right {
        grid-column: 3;
        grid-row: 2;
      }

      @media (pointer: coarse), (max-width: 920px) {
        .zacaton-touch {
          display: flex;
        }
      }

      @media (max-width: 620px) {
        .zacaton-touch {
          inset: auto 8px 8px 8px;
        }

        .zacaton-touch__pad {
          grid-template-columns: repeat(3, 50px);
          grid-template-rows: repeat(3, 48px);
        }

        .zacaton-touch__actions {
          grid-template-columns: repeat(2, minmax(62px, 1fr));
          max-width: 146px;
          gap: 6px;
        }

        .zacaton-touch__button {
          min-height: 42px;
          font-size: 10px;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
