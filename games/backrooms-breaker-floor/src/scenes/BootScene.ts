import type { Scene } from "@playloom/engine-core";
import { drawTextBlock } from "@playloom/engine-renderer-canvas";
import { loadTitleAssets, type TitleAssets } from "../assets";
import type { AppServices } from "../context";
import { validatePlayerName } from "../multiplayer/roomModel";
import { formatPublicRoomStatus, type PublicRoomSnapshot } from "../multiplayer/publicRoomTypes";
import { GAME_MANIFEST } from "../types";

const FONT_KICKER = '600 13px "Aptos", "Segoe UI", sans-serif';
const FONT_TITLE = '700 44px "Bahnschrift", "Segoe UI", sans-serif';
const FONT_SUBTITLE = '16px "Aptos", "Segoe UI", sans-serif';
const FONT_BODY = '15px "Aptos", "Segoe UI", sans-serif';
const FONT_CHIP = '600 12px "Bahnschrift", "Aptos", sans-serif';
const FONT_BUTTON = '700 17px "Bahnschrift", "Aptos", sans-serif';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ChipTheme {
  fill: string;
  stroke: string;
  text: string;
}

const WARM_CHIP: ChipTheme = {
  fill: "rgba(88, 73, 30, 0.28)",
  stroke: "rgba(246, 224, 145, 0.34)",
  text: "#f4e7b8"
};

const COOL_CHIP: ChipTheme = {
  fill: "rgba(39, 83, 91, 0.28)",
  stroke: "rgba(138, 228, 238, 0.34)",
  text: "#d9faff"
};

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string | CanvasGradient
): void {
  ctx.save();
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.restore();
}

function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  strokeStyle: string | CanvasGradient,
  lineWidth: number
): void {
  ctx.save();
  roundedRectPath(ctx, x, y, width, height, radius);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

function drawChip(
  ctx: CanvasRenderingContext2D,
  renderer: AppServices["renderer"],
  label: string,
  x: number,
  y: number,
  theme: ChipTheme
): number {
  ctx.save();
  ctx.font = FONT_CHIP;
  const width = Math.ceil(ctx.measureText(label).width) + 28;
  ctx.restore();

  fillRoundedRect(ctx, x, y, width, 28, 14, theme.fill);
  strokeRoundedRect(ctx, x, y, width, 28, 14, theme.stroke, 1);
  renderer.text(label, x + 14, y + 19, {
    color: theme.text,
    font: FONT_CHIP
  });
  return width;
}

function formatClock(ms: number | null): string {
  if (ms === null) {
    return "--:--";
  }

  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export class BootScene implements Scene {
  private elapsed = 0;
  private titleAssets: TitleAssets | null = null;
  private joinFeedback = "Enter a unique name and join the live public room.";
  private joinFeedbackTone: "neutral" | "error" = "neutral";
  private startingGame = false;
  private joinOverlay: HTMLDivElement | null = null;
  private joinPanel: HTMLDivElement | null = null;
  private joinForm: HTMLFormElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private joinButton: HTMLButtonElement | null = null;
  private roomStatusLabel: HTMLDivElement | null = null;
  private roomHintLabel: HTMLDivElement | null = null;
  private readonly handleJoinSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    this.attemptJoin();
  };
  private readonly handleNameInput = (): void => {
    const validation = validatePlayerName(this.nameInput?.value ?? "");
    this.joinFeedback = validation.ok
      ? "Join until the final 90 seconds. Locked rounds remain visible from the front screen."
      : validation.reason ?? "Enter a valid name.";
    this.joinFeedbackTone = validation.ok ? "neutral" : "error";
    this.services.room.setPreferredName(this.nameInput?.value ?? "");
    this.syncJoinOverlay();
  };

  constructor(
    private readonly services: AppServices,
    private readonly startGame: () => void
  ) {
    void loadTitleAssets()
      .then((assets) => {
        this.titleAssets = assets;
      })
      .catch(() => undefined);
  }

  onEnter(): void {
    this.startingGame = false;
    this.createJoinOverlay();
    this.syncJoinOverlay();
  }

  onExit(): void {
    this.startingGame = false;
    this.destroyJoinOverlay();
  }

  update(dt: number): void {
    this.elapsed += dt;
    const snapshot = this.services.room.getSnapshot();
    if (!this.startingGame && snapshot.localPlayerJoined) {
      this.startingGame = true;
      this.startGame();
      return;
    }

    if (!snapshot.joinRequestPending && snapshot.joinError) {
      this.joinFeedback = snapshot.joinError;
      this.joinFeedbackTone = "error";
    }
    this.syncJoinOverlay();
  }

  private shellBox(): Box {
    const { renderer } = this.services;
    return {
      x: 42,
      y: 34,
      width: renderer.width - 84,
      height: renderer.height - 68
    };
  }

  private leftCardBox(shell: Box): Box {
    return {
      x: shell.x + 28,
      y: shell.y + 38,
      width: 256,
      height: shell.height - 76
    };
  }

  private rightColumnX(leftCard: Box): number {
    return leftCard.x + leftCard.width + 36;
  }

  private insetBox(box: Box, insetX: number, insetY = insetX): Box {
    return {
      x: box.x + insetX,
      y: box.y + insetY,
      width: box.width - insetX * 2,
      height: box.height - insetY * 2
    };
  }

  private rightColumnBox(shell: Box): Box {
    const leftCard = this.leftCardBox(shell);
    const x = this.rightColumnX(leftCard);
    return {
      x,
      y: shell.y + 34,
      width: shell.x + shell.width - x - 34,
      height: shell.height - 68
    };
  }

  private entryPanelBox(): Box {
    const shell = this.shellBox();
    const rightColumn = this.rightColumnBox(shell);
    return {
      x: rightColumn.x,
      y: shell.y + 286,
      width: rightColumn.width,
      height: 140
    };
  }

  private createJoinOverlay(): void {
    if (this.joinOverlay) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.width = `${this.services.renderer.width}px`;
    overlay.style.height = `${this.services.renderer.height}px`;
    overlay.style.pointerEvents = "none";
    overlay.style.transformOrigin = "top left";

    const panel = document.createElement("div");
    panel.style.position = "absolute";
    panel.style.padding = "0";
    panel.style.background = "transparent";
    panel.style.border = "none";
    panel.style.boxShadow = "none";
    panel.style.pointerEvents = "auto";
    panel.style.display = "grid";
    panel.style.rowGap = "6px";
    panel.style.alignContent = "start";
    panel.style.boxSizing = "border-box";
    overlay.appendChild(panel);

    const label = document.createElement("div");
    label.textContent = "PUBLIC ROOM";
    label.style.color = "#f4e39f";
    label.style.font = FONT_KICKER;
    label.style.letterSpacing = "0.06em";
    panel.appendChild(label);

    const form = document.createElement("form");
    form.style.display = "grid";
    form.style.gridTemplateColumns = "minmax(0, 1fr) 198px";
    form.style.gap = "10px";
    form.addEventListener("submit", this.handleJoinSubmit);

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 18;
    input.placeholder = "Enter your name";
    input.value = this.services.room.getPreferredName();
    input.autocomplete = "off";
    input.spellcheck = false;
    input.style.height = "42px";
    input.style.borderRadius = "12px";
    input.style.border = "1px solid rgba(255, 255, 255, 0.10)";
    input.style.padding = "0 14px";
    input.style.background = "rgba(19, 24, 28, 0.92)";
    input.style.color = "#f6efcf";
    input.style.font = '600 15px "Aptos", "Segoe UI", sans-serif';
    input.addEventListener("input", this.handleNameInput);
    form.appendChild(input);

    const joinButton = document.createElement("button");
    joinButton.type = "submit";
    joinButton.textContent = "Join Public Room";
    joinButton.style.height = "42px";
    joinButton.style.borderRadius = "12px";
    joinButton.style.border = "1px solid rgba(245, 223, 148, 0.48)";
    joinButton.style.background = "linear-gradient(180deg, rgba(47,54,60,0.98), rgba(17,22,26,0.98))";
    joinButton.style.color = "#f6efcf";
    joinButton.style.font = FONT_BUTTON;
    joinButton.style.cursor = "pointer";
    form.appendChild(joinButton);

    panel.appendChild(form);

    const roomStatus = document.createElement("div");
    roomStatus.style.color = "#d8f7fb";
    roomStatus.style.font = '600 13px "Bahnschrift", "Aptos", sans-serif';
    panel.appendChild(roomStatus);

    const hint = document.createElement("div");
    hint.style.minHeight = "18px";
    hint.style.color = "#c9d1d4";
    hint.style.font = '13px "Aptos", "Segoe UI", sans-serif';
    hint.style.lineHeight = "1.3";
    panel.appendChild(hint);

    this.services.uiRoot.appendChild(overlay);
    this.joinOverlay = overlay;
    this.joinPanel = panel;
    this.joinForm = form;
    this.nameInput = input;
    this.joinButton = joinButton;
    this.roomStatusLabel = roomStatus;
    this.roomHintLabel = hint;
    this.syncJoinOverlayLayout();
  }

  private destroyJoinOverlay(): void {
    this.joinForm?.removeEventListener("submit", this.handleJoinSubmit);
    this.nameInput?.removeEventListener("input", this.handleNameInput);
    this.joinOverlay?.remove();
    this.joinOverlay = null;
    this.joinPanel = null;
    this.joinForm = null;
    this.nameInput = null;
    this.joinButton = null;
    this.roomStatusLabel = null;
    this.roomHintLabel = null;
  }

  private attemptJoin(): void {
    const result = this.services.room.join(this.nameInput?.value ?? "");
    if (!result.ok) {
      this.joinFeedback = result.reason ?? "Could not join the room.";
      this.joinFeedbackTone = "error";
      this.syncJoinOverlay();
      return;
    }

    this.joinFeedback = "Joining live room...";
    this.joinFeedbackTone = "neutral";
    this.syncJoinOverlay();
  }

  private syncJoinOverlay(): void {
    this.syncJoinOverlayLayout();
    const snapshot = this.services.room.getSnapshot();
    const validation = validatePlayerName(this.nameInput?.value ?? this.services.room.getPreferredName());
    if (this.joinButton) {
      const joinEnabled =
        snapshot.transportState === "connected"
        && !snapshot.joinRequestPending
        && snapshot.isJoinable
        && validation.ok;
      this.joinButton.disabled = !joinEnabled;
      this.joinButton.textContent = snapshot.joinRequestPending
        ? "Joining..."
        : snapshot.transportState !== "connected"
          ? "Connecting..."
          : snapshot.isJoinable
            ? "Join Public Room"
            : "Wait For Next Round";
      this.joinButton.style.opacity = this.joinButton.disabled ? "0.56" : "1";
      this.joinButton.style.cursor = this.joinButton.disabled ? "not-allowed" : "pointer";
    }

    if (this.roomStatusLabel) {
      this.roomStatusLabel.textContent = this.overlayStatusText(snapshot);
      this.roomStatusLabel.style.color = snapshot.isJoinable ? "#d8f7fb" : "#ffccad";
    }

    if (this.roomHintLabel) {
      const toneColor =
        this.joinFeedbackTone === "error"
          ? "#ffb6a2"
          : snapshot.isJoinable
            ? "#c9d1d4"
            : "#f0d8a0";
      this.roomHintLabel.textContent = this.joinFeedbackTone === "error" ? this.joinFeedback : this.overlayHintText(snapshot);
      this.roomHintLabel.style.color = toneColor;
    }
  }

  private syncJoinOverlayLayout(): void {
    if (!this.joinOverlay || !this.joinPanel) {
      return;
    }

    const { renderer, uiRoot } = this.services;
    const bounds = uiRoot.getBoundingClientRect();
    const scaleX = bounds.width > 0 ? bounds.width / renderer.width : 1;
    const scaleY = bounds.height > 0 ? bounds.height / renderer.height : 1;
    const box = this.insetBox(this.entryPanelBox(), 20, 16);

    this.joinOverlay.style.width = `${renderer.width}px`;
    this.joinOverlay.style.height = `${renderer.height}px`;
    this.joinOverlay.style.transform = `scale(${scaleX}, ${scaleY})`;

    this.joinPanel.style.left = `${box.x}px`;
    this.joinPanel.style.top = `${box.y}px`;
    this.joinPanel.style.width = `${box.width}px`;
    this.joinPanel.style.height = `${box.height}px`;
  }

  private overlayStatusText(snapshot: PublicRoomSnapshot): string {
    if (snapshot.transportState !== "connected") {
      return "Connecting to public room server...";
    }

    const phaseLabel = formatPublicRoomStatus(snapshot.phase);
    const playersLabel = `${snapshot.players.length}/${snapshot.capacity}`;
    const joinLabel = snapshot.isJoinable
      ? snapshot.phase === "waiting"
        ? "Join open"
        : `Join ${formatClock(snapshot.joinTimeRemainingMs)}`
      : "Join closed";
    const roundLabel = snapshot.roundStartedAt === null ? "Round idle" : `Round ${formatClock(snapshot.roundTimeRemainingMs)}`;
    return `${phaseLabel} · ${playersLabel} players · ${joinLabel} · ${roundLabel}`;
  }

  private overlayHintText(snapshot: PublicRoomSnapshot): string {
    if (snapshot.joinRequestPending) {
      return "Joining live room...";
    }

    if (snapshot.joinError) {
      return snapshot.joinError;
    }

    if (snapshot.transportState !== "connected") {
      return snapshot.transportError ?? "Connecting to the public room server.";
    }

    if (!snapshot.isJoinable) {
      return snapshot.waitReason ?? "Current round is not joinable.";
    }

    const validation = validatePlayerName(this.nameInput?.value ?? "");
    if (!validation.ok) {
      return validation.reason ?? "Enter a valid name.";
    }

    return "Unique names only. Late joins stay open until the final 90 seconds of a round.";
  }
  render(_alpha: number): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const gradient = ctx.createLinearGradient(0, 0, renderer.width, renderer.height);
    gradient.addColorStop(0, "#1d1a11");
    gradient.addColorStop(0.44, "#0d0e10");
    gradient.addColorStop(1, "#050607");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    const glowLeft = ctx.createRadialGradient(174, 132, 0, 174, 132, 280);
    glowLeft.addColorStop(0, "rgba(246, 216, 128, 0.17)");
    glowLeft.addColorStop(1, "rgba(246, 216, 128, 0)");
    ctx.fillStyle = glowLeft;
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    const glowRight = ctx.createRadialGradient(renderer.width - 126, 100, 0, renderer.width - 126, 100, 248);
    glowRight.addColorStop(0, "rgba(117, 219, 232, 0.12)");
    glowRight.addColorStop(1, "rgba(117, 219, 232, 0)");
    ctx.fillStyle = glowRight;
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 9; i += 1) {
      const y = 58 + i * 54 + Math.sin(this.elapsed * 0.7 + i) * 4;
      renderer.rect(24, y, renderer.width - 48, 1, "rgba(245, 231, 176, 0.28)");
    }
    for (let i = 0; i < 5; i += 1) {
      const x = 86 + i * 178;
      renderer.rect(x, 28, 1, renderer.height - 56, "rgba(120, 212, 222, 0.18)");
    }
    ctx.restore();

    const shell = this.shellBox();
    fillRoundedRect(ctx, shell.x, shell.y, shell.width, shell.height, 26, "rgba(5, 8, 10, 0.84)");
    strokeRoundedRect(ctx, shell.x, shell.y, shell.width, shell.height, 26, "rgba(246, 225, 156, 0.28)", 1.5);
    strokeRoundedRect(ctx, shell.x + 12, shell.y + 12, shell.width - 24, shell.height - 24, 20, "rgba(255, 255, 255, 0.05)", 1);

    renderer.rect(shell.x + 28, shell.y + 24, 112, 3, "rgba(242, 220, 141, 0.78)");
    renderer.rect(shell.x + 152, shell.y + 24, 28, 3, "rgba(125, 220, 232, 0.6)");
    renderer.rect(shell.x + shell.width - 164, shell.y + 24, 92, 3, "rgba(242, 220, 141, 0.36)");

    const leftCard = this.leftCardBox(shell);
    fillRoundedRect(ctx, leftCard.x, leftCard.y, leftCard.width, leftCard.height, 24, "rgba(12, 15, 18, 0.92)");
    strokeRoundedRect(ctx, leftCard.x, leftCard.y, leftCard.width, leftCard.height, 24, "rgba(245, 223, 148, 0.18)", 1);

    renderer.text("SECTOR 04 / LIVE BUILD", leftCard.x + 20, leftCard.y + 30, {
      color: "#f4e39f",
      font: FONT_KICKER
    });

    const iconWell: Box = { x: leftCard.x + 20, y: leftCard.y + 46, width: leftCard.width - 40, height: 186 };
    fillRoundedRect(ctx, iconWell.x, iconWell.y, iconWell.width, iconWell.height, 18, "rgba(5, 7, 9, 0.94)");
    strokeRoundedRect(ctx, iconWell.x, iconWell.y, iconWell.width, iconWell.height, 18, "rgba(255, 255, 255, 0.06)", 1);

    const scanY = iconWell.y + 26 + ((this.elapsed * 42) % (iconWell.height - 52));
    renderer.rect(iconWell.x + 16, scanY, iconWell.width - 32, 2, "rgba(245, 223, 148, 0.12)");

    const iconSize = 160;
    const iconX = iconWell.x + (iconWell.width - iconSize) * 0.5;
    const iconY = iconWell.y + 13 + Math.sin(this.elapsed * 1.6) * 5;
    renderer.circle(iconWell.x + iconWell.width * 0.5, iconWell.y + 96, 62, "rgba(243, 214, 121, 0.08)");
    if (this.titleAssets) {
      renderer.drawImage(this.titleAssets.breakerFloorIcon, iconX, iconY, iconSize, iconSize);
    } else {
      this.renderFallbackIcon(iconWell);
    }

    renderer.text("Hazmat runner / public breaker floor", leftCard.x + 20, leftCard.y + 258, {
      color: "#8ddde9",
      font: FONT_KICKER
    });

    const leftChipsY = leftCard.y + 286;
    let leftChipX = leftCard.x + 20;
    leftChipX += drawChip(ctx, renderer, "Touch-ready", leftChipX, leftChipsY, COOL_CHIP) + 8;
    drawChip(ctx, renderer, "PVP / PVE live", leftChipX, leftChipsY, WARM_CHIP);

    const rightColumn = this.rightColumnBox(shell);
    const rightX = rightColumn.x;
    renderer.text("BACKROOMS ESCAPE / POWER RESTORATION", rightX, shell.y + 68, {
      color: "#94d9e5",
      font: FONT_KICKER
    });

    renderer.text(GAME_MANIFEST.name, rightX, shell.y + 116, {
      color: "#f5efd0",
      font: FONT_TITLE
    });
    renderer.rect(rightX, shell.y + 132, 138, 3, "rgba(242, 220, 141, 0.72)");
    renderer.rect(rightX + 152, shell.y + 132, 54, 3, "rgba(125, 220, 232, 0.42)");

    const subtitleLines = drawTextBlock(
      renderer,
      "Recover the relays, restore the breakers, and cross a touch-ready Backrooms floor built around visibility and pressure.",
      rightX,
      shell.y + 162,
      rightColumn.width,
      22,
      {
        color: "#d2d8db",
        font: FONT_SUBTITLE
      }
    );

    let chipX = rightX;
    const chipY = shell.y + 184 + subtitleLines * 22;
    chipX += drawChip(ctx, renderer, "Public room", chipX, chipY, COOL_CHIP) + 10;
    chipX += drawChip(ctx, renderer, "3 relays", chipX, chipY, WARM_CHIP) + 10;
    drawChip(ctx, renderer, "PVP enabled", chipX, chipY, WARM_CHIP);

    const entryPanel = this.entryPanelBox();
    fillRoundedRect(ctx, entryPanel.x, entryPanel.y, entryPanel.width, entryPanel.height, 18, "rgba(10, 13, 16, 0.9)");
    strokeRoundedRect(ctx, entryPanel.x, entryPanel.y, entryPanel.width, entryPanel.height, 18, "rgba(245, 223, 148, 0.18)", 1);

    drawTextBlock(
      renderer,
      "Single live room. Late joins stay open until the last 90 seconds. Locked rounds remain visible until the cycle resets.",
      rightX,
      entryPanel.y + entryPanel.height + 18,
      rightColumn.width,
      18,
      {
        color: "#89979d",
        font: '13px "Aptos", "Segoe UI", sans-serif'
      }
    );

  }

  private renderFallbackIcon(iconWell: Box): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const centerX = iconWell.x + iconWell.width * 0.5;
    const centerY = iconWell.y + iconWell.height * 0.5;

    const glow = ctx.createRadialGradient(centerX, centerY - 16, 6, centerX, centerY - 16, 84);
    glow.addColorStop(0, "rgba(245, 223, 148, 0.46)");
    glow.addColorStop(1, "rgba(245, 223, 148, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(iconWell.x, iconWell.y, iconWell.width, iconWell.height);

    fillRoundedRect(ctx, centerX - 46, centerY - 12, 92, 104, 42, "rgba(223, 191, 90, 0.92)");
    fillRoundedRect(ctx, centerX - 34, centerY - 2, 68, 44, 20, "rgba(192, 229, 238, 0.92)");
    renderer.line(centerX + 30, centerY + 26, centerX + 76, centerY + 52, "rgba(245, 223, 148, 0.8)", 8);
    renderer.circle(centerX + 86, centerY + 58, 12, "rgba(212, 239, 246, 0.28)");
  }
}
