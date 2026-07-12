import {
  CAR_COLOR_OPTIONS,
  PLAYER_NAME_MAX_LENGTH,
  validatePlayerProfile,
  type CarColorId,
  type PlayerProfile
} from "../multiplayer/playerProfile";
import type { WanganSessionClient } from "../multiplayer/WanganSessionClient";

function colorPicker(
  legend: string,
  selected: CarColorId,
  onSelect: (color: CarColorId) => void
): { fieldset: HTMLFieldSetElement; select: (color: CarColorId) => void } {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "wangan-color-fieldset";
  const label = document.createElement("legend");
  label.textContent = legend;
  fieldset.appendChild(label);
  const buttons = new Map<CarColorId, HTMLButtonElement>();
  const select = (color: CarColorId): void => {
    for (const [id, button] of buttons) {
      button.classList.toggle("is-selected", id === color);
      button.setAttribute("aria-pressed", String(id === color));
    }
  };
  for (const option of CAR_COLOR_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "wangan-color-choice";
    button.style.setProperty("--car-color", option.hex);
    button.setAttribute("aria-label", option.label);
    button.title = option.label;
    button.addEventListener("click", () => {
      select(option.id);
      onSelect(option.id);
    });
    buttons.set(option.id, button);
    fieldset.appendChild(button);
  }
  select(selected);
  return { fieldset, select };
}

export class JoinSessionModal {
  private readonly overlay = document.createElement("div");
  private readonly nameInput = document.createElement("input");
  private readonly status = document.createElement("p");
  private readonly error = document.createElement("p");
  private readonly joinButton = document.createElement("button");
  private mainColor: CarColorId;
  private accentColor: CarColorId;
  private openState = false;
  private readonly unsubscribe: () => void;

  constructor(
    parent: HTMLElement,
    private readonly session: WanganSessionClient,
    private readonly onJoined: (profile: PlayerProfile) => void
  ) {
    const saved = session.getSavedProfile();
    this.mainColor = saved.mainColor;
    this.accentColor = saved.accentColor;
    this.overlay.className = "wangan-join-overlay";
    this.overlay.hidden = true;
    this.overlay.setAttribute("role", "dialog");
    this.overlay.setAttribute("aria-modal", "true");
    this.overlay.setAttribute("aria-labelledby", "wangan-join-title");

    const modal = document.createElement("form");
    modal.className = "wangan-join-modal";
    modal.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submit();
    });
    const eyebrow = document.createElement("p");
    eyebrow.className = "wangan-join-eyebrow";
    eyebrow.textContent = "ONE GLOBAL LOBBY // REIMEI XR";
    const title = document.createElement("h1");
    title.id = "wangan-join-title";
    title.textContent = "Join session";
    const copy = document.createElement("p");
    copy.className = "wangan-join-copy";
    copy.textContent = "Choose the name above your car and your Reimei XR colors. You can enter the expressway at any time.";
    const nameLabel = document.createElement("label");
    nameLabel.className = "wangan-name-label";
    nameLabel.textContent = "Player name";
    this.nameInput.name = "player-name";
    this.nameInput.type = "text";
    this.nameInput.maxLength = PLAYER_NAME_MAX_LENGTH;
    this.nameInput.setAttribute("autocomplete", "nickname");
    this.nameInput.placeholder = "Night runner";
    this.nameInput.value = saved.name;
    nameLabel.appendChild(this.nameInput);

    const preview = document.createElement("div");
    preview.className = "wangan-car-color-preview";
    preview.innerHTML = '<span class="wangan-preview-main"></span><span class="wangan-preview-accent"></span><strong>REIMEI XR</strong>';
    const updatePreview = (): void => {
      const main = CAR_COLOR_OPTIONS.find((option) => option.id === this.mainColor)!;
      const accent = CAR_COLOR_OPTIONS.find((option) => option.id === this.accentColor)!;
      preview.style.setProperty("--main-color", main.hex);
      preview.style.setProperty("--accent-color", accent.hex);
    };
    const mainPicker = colorPicker("Main color", this.mainColor, (color) => {
      this.mainColor = color;
      updatePreview();
    });
    const accentPicker = colorPicker("Accent", this.accentColor, (color) => {
      this.accentColor = color;
      updatePreview();
    });
    updatePreview();

    this.status.className = "wangan-session-status";
    this.error.className = "wangan-join-error";
    this.error.setAttribute("aria-live", "polite");
    const actions = document.createElement("div");
    actions.className = "wangan-join-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "wangan-modal-cancel";
    cancel.textContent = "Back";
    cancel.addEventListener("click", () => this.close());
    this.joinButton.type = "submit";
    this.joinButton.className = "wangan-modal-join";
    this.joinButton.textContent = "Join session";
    actions.append(cancel, this.joinButton);
    modal.append(
      eyebrow, title, copy, nameLabel, preview,
      mainPicker.fieldset, accentPicker.fieldset,
      this.status, this.error, actions
    );
    this.overlay.appendChild(modal);
    parent.appendChild(this.overlay);
    this.overlay.addEventListener("pointerdown", (event) => {
      if (event.target === this.overlay) {
        this.close();
      }
    });
    // Typing a player name must never leak W/A/S/D/Q/E into the game's
    // window-level input listeners (it used to queue lane changes/shifts).
    this.overlay.addEventListener("keydown", (event) => event.stopPropagation());
    this.overlay.addEventListener("keyup", (event) => event.stopPropagation());
    this.unsubscribe = session.subscribe(() => this.refresh());
    this.refresh();
  }

  open(): void {
    this.openState = true;
    this.overlay.hidden = false;
    this.error.textContent = "";
    this.refresh();
    window.setTimeout(() => this.nameInput.focus(), 0);
  }

  close(): void {
    this.openState = false;
    this.overlay.hidden = true;
  }

  destroy(): void {
    this.unsubscribe();
    this.overlay.remove();
  }

  private refresh(): void {
    const state = this.session.getStatus();
    this.status.textContent = `${state.connectionMessage} · ${state.playerCount}/${state.capacity} drivers`;
    this.status.dataset.state = state.connection;
    this.joinButton.disabled = state.connection !== "connected";
    if (this.openState && state.connection === "connected") {
      this.joinButton.textContent = "Join session";
    }
  }

  private async submit(): Promise<void> {
    const validation = validatePlayerProfile({
      name: this.nameInput.value,
      mainColor: this.mainColor,
      accentColor: this.accentColor
    });
    if (!validation.ok || !validation.profile) {
      this.error.textContent = validation.reason;
      return;
    }
    this.error.textContent = "";
    this.joinButton.disabled = true;
    this.joinButton.textContent = "Joining…";
    try {
      await this.session.join(validation.profile);
      this.close();
      this.onJoined(validation.profile);
    } catch (error) {
      this.error.textContent = error instanceof Error ? error.message : "Could not join the session.";
    } finally {
      this.refresh();
    }
  }
}
