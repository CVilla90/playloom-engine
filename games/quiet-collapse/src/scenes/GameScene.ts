import { SeededRng, clamp, type Scene } from "@playloom/engine-core";
import { SynthAudio } from "@playloom/engine-audio";
import { ActionMap, createMenuActionBindings } from "@playloom/engine-input";
import { drawBar, drawPanel, drawTextBlock } from "@playloom/engine-renderer-canvas";
import type { AppServices } from "../context";
import {
  CHANNEL_LABELS,
  CHAPTERS,
  DOCTRINE_OPTIONS,
  GAME_MANIFEST,
  SHIP_METER_COLORS,
  SHIP_METER_KEYS,
  SHIP_METER_LABELS,
  createFreshRun,
  type DoctrineChoice,
  type EndingSummary,
  type FragmentQuality,
  type FragmentRecord,
  type LocationDefinition,
  type RunState
} from "../data";
import { clearRunState, hasRunState, loadRunState, saveRunState } from "../save";

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  depth: number;
  phase: number;
}

interface ScanChannelState {
  tune: number;
  target: number;
  locked: boolean;
  phase: number;
  speed: number;
}

interface ScanState {
  location: LocationDefinition;
  timeLeft: number;
  channels: ScanChannelState[];
  selectedIndex: number;
  errors: number;
}

interface ScanOutcome {
  location: LocationDefinition;
  quality: FragmentQuality;
  score: number;
  lockedCount: number;
  truthGain: number;
  fragment: FragmentRecord;
  summary: string;
}

type SceneMode = "title" | "choose" | "scan" | "doctrine" | "ending";

const PANEL_GAP = 14;
const LEFT_PANEL_WIDTH = 278;
const RIGHT_PANEL_WIDTH = 314;
const EDGE = 16;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pushLog(run: RunState, text: string): void {
  run.logEntries = [text, ...run.logEntries].slice(0, 8);
  run.lastStatus = text;
}

function applyCorruption(text: string, quality: FragmentQuality): string {
  if (quality === "clean") return text;

  const words = text.split(" ");
  const stride = quality === "partial" ? 5 : 3;
  const token = quality === "partial" ? "[...]" : "void";

  return words
    .map((word, index) => {
      if (index > 0 && index % stride === 0) {
        return token;
      }
      return word;
    })
    .join(" ");
}

function createStars(width: number, height: number): Star[] {
  const rng = new SeededRng(0x51f15eed);
  const stars: Star[] = [];
  for (let i = 0; i < 132; i += 1) {
    stars.push({
      x: rng.range(0, width),
      y: rng.range(0, height),
      size: rng.range(0.7, 2.4),
      speed: rng.range(4, 18),
      depth: rng.range(0.35, 1),
      phase: rng.range(0, Math.PI * 2)
    });
  }
  return stars;
}

function latestFragment(run: RunState | null): FragmentRecord | null {
  if (!run) return null;
  return run.fragments[0] ?? null;
}

function dominantDoctrine(run: RunState): DoctrineChoice {
  let best: DoctrineChoice = "archive";
  let bestValue = -1;
  for (const option of DOCTRINE_OPTIONS) {
    const value = run.doctrineCounts[option.id];
    if (value > bestValue) {
      bestValue = value;
      best = option.id;
    }
  }
  return best;
}

function buildEnding(run: RunState): EndingSummary {
  if (run.stats.fuel <= 0) {
    return {
      id: "fuel-empty",
      title: "Starved Between Nodes",
      body:
        "The Eidolon runs dry before the void can become witness. Your last charts still point toward Talassa, but the ship drifts in the old dark with evidence intact and delivery unfinished.",
      accent: "#87d8ff"
    };
  }

  if (run.stats.hull <= 0) {
    return {
      id: "hull-failure",
      title: "Hull Gone Quiet",
      body:
        "Microfractures become a verdict. The Eidolon sheds pressure and memory together, leaving only your last transmission headings and a route that now has no pilot.",
      accent: "#f2a46f"
    };
  }

  if (run.stats.focus <= 0) {
    return {
      id: "focus-collapse",
      title: "Another Fragment",
      body:
        "The recordings outlive the mind that made them. By the end you can no longer tell signal drift from interior echo, and the archive inherits your uncertainty whole.",
      accent: "#b1f5c0"
    };
  }

  if (run.stats.trace >= 100 && run.stats.truth >= 10) {
    return {
      id: "interdicted-beacon",
      title: "Interdicted Beacon",
      body:
        "The Silence finds the Eidolon by the shape of its courage. Interception comes late enough that at least one burst leaves the ship before the channel closes around you.",
      accent: "#ff7f98"
    };
  }

  if (run.stats.trace >= 100) {
    return {
      id: "taken-into-silence",
      title: "Taken Into Silence",
      body:
        "The watchers arrive before the evidence hardens. You are boxed in by perfect trajectories and folded into the same caution that buried the truth before you found it.",
      accent: "#ff7f98"
    };
  }

  const doctrine = dominantDoctrine(run);
  if (run.stats.truth >= 12 && run.doctrineCounts.broadcast >= 2) {
    return {
      id: "beacon-in-the-void",
      title: "Beacon In The Void",
      body:
        "You reach Talassa and refuse the comfort of silence. The universe still thins toward its colder geometry, but your packets leave behind a trail of witnesses who cannot claim they were not told.",
      accent: "#ffe18c"
    };
  }

  if (run.stats.truth >= 11 && doctrine === "archive") {
    return {
      id: "witness-at-talassa",
      title: "Witness At Talassa",
      body:
        "At the center of the void you stop searching for salvation and begin preserving shape. The archive you carry is not a weapon, only a window, but it remains open long enough for the next mind to look through.",
      accent: "#c9f2ff"
    };
  }

  if (doctrine === "suppress" && run.doctrineCounts.suppress >= 3) {
    return {
      id: "custodian-of-silence",
      title: "Custodian Of Silence",
      body:
        "Talassa confirms everything, and still you close the channel. Survival becomes ritual. The truth remains with you, intact and ungiven, until the void has no use for witnesses at all.",
      accent: "#d9d9d9"
    };
  }

  return {
    id: "last-observer",
    title: "The Last Observer",
    body:
      "You survive to watch the sky grow spare. The truth is incomplete, the endings are imperfect, and yet the record exists: one ship, one witness, one route into the purest form of the void.",
    accent: "#d6d7ff"
  };
}

export class GameScene implements Scene {
  private readonly actions: ActionMap;
  private readonly audio = new SynthAudio();
  private readonly stars: Star[];

  private run: RunState | null = null;
  private mode: SceneMode = "title";
  private titleSelection = 0;
  private chooseSelection = 0;
  private doctrineSelection = 0;
  private scan: ScanState | null = null;
  private outcome: ScanOutcome | null = null;
  private ending: EndingSummary | null = null;
  private clock = 0;
  private helpVisible = true;
  private audioEnabled = true;
  private statusText = "";
  private statusTimer = 0;

  private readonly unlockAudio = (): void => {
    if (this.audioEnabled) {
      this.audio.unlock();
    }
  };

  constructor(private readonly services: AppServices) {
    this.actions = new ActionMap(this.services.input, {
      ...createMenuActionBindings(),
      tune_left: ["a", "arrowleft"],
      tune_right: ["d", "arrowright"],
      tune_up: ["w", "arrowup"],
      tune_down: ["s", "arrowdown"],
      scan_lock: [" "],
      scan_resolve: ["enter"],
      toggle_help: ["h"],
      toggle_audio: ["m"],
      continue_run: ["c"],
      new_run: ["n"]
    });
    this.stars = createStars(this.services.renderer.width, this.services.renderer.height);
  }

  onEnter(): void {
    window.addEventListener("keydown", this.unlockAudio);
  }

  onExit(): void {
    window.removeEventListener("keydown", this.unlockAudio);
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.statusTimer > 0) {
      this.statusTimer = Math.max(0, this.statusTimer - dt);
    }

    if (this.actions.wasPressed("toggle_help")) {
      this.helpVisible = !this.helpVisible;
    }

    if (this.actions.wasPressed("toggle_audio")) {
      this.audioEnabled = !this.audioEnabled;
      this.audio.setEnabled(this.audioEnabled);
      if (this.audioEnabled) {
        this.audio.unlock();
      }
      this.setStatus(this.audioEnabled ? "Audio restored." : "Audio muted.");
    }

    switch (this.mode) {
      case "title":
        this.updateTitle();
        break;
      case "choose":
        this.updateChoose();
        break;
      case "scan":
        this.updateScan(dt);
        break;
      case "doctrine":
        this.updateDoctrine();
        break;
      case "ending":
        this.updateEnding();
        break;
    }
  }

  render(_alpha: number): void {
    this.renderBackground();
    this.renderSidePanels();
    this.renderCenterPanel();

    if (this.helpVisible) {
      this.renderHelpOverlay();
    }

    if (this.statusTimer > 0) {
      this.renderStatus();
    }
  }

  private updateTitle(): void {
    const options = hasRunState() ? ["Continue saved run", "Begin new run"] : ["Begin voyage"];

    if (this.actions.wasPressed("menu_prev")) {
      this.titleSelection = (this.titleSelection + options.length - 1) % options.length;
      this.audio.beep(640, 0.04, "sine");
    }
    if (this.actions.wasPressed("menu_next")) {
      this.titleSelection = (this.titleSelection + 1) % options.length;
      this.audio.beep(700, 0.04, "sine");
    }

    if (hasRunState() && this.actions.wasPressed("continue_run")) {
      this.continueRun();
      return;
    }

    if (this.actions.wasPressed("new_run")) {
      this.startNewRun();
      return;
    }

    if (!this.actions.wasPressed("menu_confirm")) return;

    if (hasRunState() && this.titleSelection === 0) {
      this.continueRun();
      return;
    }

    this.startNewRun();
  }

  private updateChoose(): void {
    const chapter = this.currentChapter();
    if (!this.run || !chapter) return;

    const count = chapter.locations.length;
    if (this.actions.wasPressed("menu_prev")) {
      this.chooseSelection = (this.chooseSelection + count - 1) % count;
      this.audio.beep(640, 0.04, "sine");
    }
    if (this.actions.wasPressed("menu_next")) {
      this.chooseSelection = (this.chooseSelection + 1) % count;
      this.audio.beep(700, 0.04, "sine");
    }
    if (this.actions.wasPressed("menu_back")) {
      this.returnToTitle();
      return;
    }

    if (!this.actions.wasPressed("menu_confirm")) return;

    const location = chapter.locations[this.chooseSelection];
    if (!location) return;

    this.run.stats.fuel = clamp(this.run.stats.fuel - location.risk.fuel, 0, 100);
    this.run.stats.trace = clamp(this.run.stats.trace + 1, 0, 100);
    this.run.route.push(location.shortLabel);
    pushLog(this.run, `Jump committed to ${location.title}. Burned ${location.risk.fuel} fuel.`);
    this.audio.whoosh();

    if (this.checkForEnding()) {
      return;
    }

    this.startScan(location);
  }

  private updateScan(dt: number): void {
    if (!this.run || !this.scan) return;

    this.scan.timeLeft = Math.max(0, this.scan.timeLeft - dt);

    if (this.actions.wasPressed("tune_left")) {
      this.scan.selectedIndex = (this.scan.selectedIndex + this.scan.channels.length - 1) % this.scan.channels.length;
      this.audio.beep(620, 0.03, "sine");
    }
    if (this.actions.wasPressed("tune_right")) {
      this.scan.selectedIndex = (this.scan.selectedIndex + 1) % this.scan.channels.length;
      this.audio.beep(680, 0.03, "sine");
    }

    for (let i = 0; i < this.scan.channels.length; i += 1) {
      const channel = this.scan.channels[i];
      if (!channel || channel.locked) continue;
      const drift =
        Math.sin(this.clock * channel.speed + channel.phase) *
        (this.scan.location.risk.drift * 0.82 + (i === this.scan.selectedIndex ? 0.7 : 0)) *
        dt *
        3.6;
      const flutter = Math.sin(this.clock * 11.5 + channel.phase * 1.7) * dt * 1.4;
      channel.tune = clamp(channel.tune + drift + flutter, 0, 100);
    }

    const selected = this.scan.channels[this.scan.selectedIndex];
    if (selected && !selected.locked) {
      if (this.actions.isDown("tune_up")) {
        selected.tune = clamp(selected.tune + 48 * dt, 0, 100);
      }
      if (this.actions.isDown("tune_down")) {
        selected.tune = clamp(selected.tune - 48 * dt, 0, 100);
      }
    }

    if (this.actions.wasPressed("scan_lock")) {
      this.tryLockChannel();
      if (this.mode !== "scan") {
        return;
      }
    }

    if (this.actions.wasPressed("scan_resolve")) {
      this.resolveScan();
      return;
    }

    if (this.scan.timeLeft <= 0) {
      this.resolveScan();
    }
  }

  private updateDoctrine(): void {
    if (!this.run || !this.outcome) return;

    if (this.actions.wasPressed("menu_prev")) {
      this.doctrineSelection = (this.doctrineSelection + DOCTRINE_OPTIONS.length - 1) % DOCTRINE_OPTIONS.length;
      this.audio.beep(640, 0.04, "sine");
    }
    if (this.actions.wasPressed("menu_next")) {
      this.doctrineSelection = (this.doctrineSelection + 1) % DOCTRINE_OPTIONS.length;
      this.audio.beep(700, 0.04, "sine");
    }

    if (!this.actions.wasPressed("menu_confirm")) return;

    const option = DOCTRINE_OPTIONS[this.doctrineSelection];
    if (!option) return;

    this.run.doctrineCounts[option.id] += 1;
    this.run.stats.trace = clamp(this.run.stats.trace + option.traceDelta, 0, 100);
    this.run.stats.focus = clamp(this.run.stats.focus + option.focusDelta, 0, 100);
    const fragment = this.run.fragments[0];
    if (fragment) {
      fragment.doctrine = option.id;
    }

    pushLog(this.run, `${option.label} chosen at ${this.outcome.location.shortLabel}.`);
    this.setStatus(`${option.label} packet queued.`, 1.6);
    this.audio.beep(option.id === "broadcast" ? 760 : option.id === "archive" ? 690 : 540, 0.08, "triangle");

    if (this.checkForEnding()) {
      return;
    }

    const isFinalChapter = this.run.chapterIndex >= CHAPTERS.length - 1;
    if (isFinalChapter) {
      this.enterEnding(buildEnding(this.run));
      return;
    }

    this.run.chapterIndex += 1;
    this.outcome = null;
    this.enterChooseMode();
  }

  private updateEnding(): void {
    if (this.actions.wasPressed("menu_confirm") || this.actions.wasPressed("menu_back") || this.actions.wasPressed("new_run")) {
      this.returnToTitle();
    }
  }

  private startNewRun(): void {
    clearRunState();
    this.run = createFreshRun((Date.now() ^ 0x51f15eed) >>> 0);
    this.ending = null;
    this.outcome = null;
    this.scan = null;
    this.chooseSelection = 0;
    this.titleSelection = 0;
    this.doctrineSelection = 1;
    pushLog(this.run, "The Eidolon leaves the cluster with Narhex behind and Talassa ahead.");
    this.enterChooseMode();
    this.audio.whoosh();
  }

  private continueRun(): void {
    const saved = loadRunState();
    if (!saved) {
      this.setStatus("No saved run was found.");
      return;
    }
    this.run = saved;
    this.ending = null;
    this.outcome = null;
    this.scan = null;
    this.chooseSelection = 0;
    this.enterChooseMode(false);
    this.audio.beep(720, 0.08, "sine");
  }

  private enterChooseMode(resetSelection = true): void {
    if (!this.run) return;
    this.mode = "choose";
    this.scan = null;
    this.outcome = null;
    if (resetSelection) {
      this.chooseSelection = 0;
    }
    saveRunState(this.run);
    this.setStatus(this.run.lastStatus);
  }

  private startScan(location: LocationDefinition): void {
    if (!this.run) return;
    const seed = this.run.runSeed ^ hashString(location.id) ^ this.run.chapterIndex;
    const rng = new SeededRng(seed);
    this.scan = {
      location,
      timeLeft: Math.max(8.5, 15 - location.risk.drift * 0.4),
      selectedIndex: 0,
      errors: 0,
      channels: location.targets.map((target) => ({
        tune: clamp(target + rng.range(-22, 22), 0, 100),
        target,
        locked: false,
        phase: rng.range(0, Math.PI * 2),
        speed: rng.range(0.9, 1.8)
      }))
    };
    this.mode = "scan";
    this.setStatus(`Scan window open at ${location.shortLabel}.`);
  }

  private tryLockChannel(): void {
    if (!this.run || !this.scan) return;
    const channel = this.scan.channels[this.scan.selectedIndex];
    if (!channel || channel.locked) {
      this.setStatus("Selected band is already stabilized.", 1);
      return;
    }

    const delta = Math.abs(channel.tune - channel.target);
    if (delta <= 7) {
      channel.locked = true;
      this.setStatus(`${CHANNEL_LABELS[this.scan.selectedIndex]} band locked.`, 1);
      this.audio.beep(780 - this.scan.selectedIndex * 60, 0.06, "sine");
      if (this.scan.channels.every((entry) => entry.locked)) {
        this.resolveScan();
      }
      return;
    }

    this.scan.errors += 1;
    this.run.stats.focus = clamp(this.run.stats.focus - 2, 0, 100);
    this.run.stats.trace = clamp(this.run.stats.trace + 1, 0, 100);
    this.scan.timeLeft = Math.max(1, this.scan.timeLeft - 0.75);
    this.audio.impact();
    this.setStatus("Off-band. Narrow the signal.", 1.1);
    this.checkForEnding();
  }

  private resolveScan(): void {
    if (!this.run || !this.scan) return;

    const lockedCount = this.scan.channels.filter((channel) => channel.locked).length;
    const closeness =
      this.scan.channels.reduce((sum, channel) => {
        return sum + Math.max(0, 1 - Math.abs(channel.tune - channel.target) / 28);
      }, 0) / this.scan.channels.length;

    const score = Math.round(lockedCount * 23 + closeness * 34 + this.scan.timeLeft * 2 - this.scan.errors * 4);
    const quality: FragmentQuality = score >= 82 ? "clean" : score >= 56 ? "partial" : "corrupted";
    const truthGain = Math.max(1, this.scan.location.truthReward + (quality === "clean" ? 1 : 0) - (quality === "corrupted" ? 1 : 0));
    const severity = quality === "clean" ? 0.45 : quality === "partial" ? 0.72 : 1.08;

    this.run.stats.hull = clamp(this.run.stats.hull - Math.round(this.scan.location.risk.hull * severity), 0, 100);
    this.run.stats.focus = clamp(
      this.run.stats.focus - Math.round(this.scan.location.risk.focus * severity) - this.scan.errors,
      0,
      100
    );
    this.run.stats.trace = clamp(
      this.run.stats.trace +
        Math.round(
          this.scan.location.risk.trace * (quality === "clean" ? 0.75 : quality === "partial" ? 1 : 1.2)
        ),
      0,
      100
    );
    this.run.stats.truth += truthGain;

    const fragment: FragmentRecord = {
      id: this.scan.location.id,
      title: this.scan.location.fragmentTitle,
      body: applyCorruption(this.scan.location.fragmentBody, quality),
      source: this.scan.location.title,
      quality,
      doctrine: null
    };
    this.run.fragments = [fragment, ...this.run.fragments.filter((entry) => entry.id !== fragment.id)];

    const summary =
      quality === "clean"
        ? `Signal coherence held. ${truthGain} truth packet recovered.`
        : quality === "partial"
          ? `Partial recovery. ${truthGain} truth packet assembled from noise.`
          : `Corrupted recovery. ${truthGain} damaged packet retained anyway.`;

    pushLog(this.run, `${this.scan.location.shortLabel}: ${summary}`);
    this.setStatus(summary, 1.8);

    if (this.checkForEnding()) {
      return;
    }

    this.outcome = {
      location: this.scan.location,
      quality,
      score,
      lockedCount,
      truthGain,
      fragment,
      summary
    };
    this.scan = null;
    this.mode = "doctrine";
    this.doctrineSelection = quality === "corrupted" ? 1 : 0;
  }

  private checkForEnding(): boolean {
    if (!this.run) return false;
    if (this.run.stats.fuel <= 0 || this.run.stats.hull <= 0 || this.run.stats.focus <= 0 || this.run.stats.trace >= 100) {
      this.enterEnding(buildEnding(this.run));
      return true;
    }
    return false;
  }

  private enterEnding(summary: EndingSummary): void {
    this.ending = summary;
    this.mode = "ending";
    this.scan = null;
    this.outcome = null;
    clearRunState();
    if (summary.id.includes("beacon") || summary.id.includes("witness")) {
      this.audio.beep(860, 0.12, "sine");
      this.audio.beep(980, 0.18, "sine");
    } else {
      this.audio.gameOver();
    }
  }

  private returnToTitle(): void {
    this.mode = "title";
    this.run = null;
    this.scan = null;
    this.outcome = null;
    this.ending = null;
    this.titleSelection = 0;
    this.chooseSelection = 0;
    this.doctrineSelection = 0;
    this.setStatus(hasRunState() ? "Saved route standing by." : "Awaiting a new route.", 1.2);
  }

  private currentChapter() {
    return this.run ? CHAPTERS[this.run.chapterIndex] ?? null : null;
  }

  private setStatus(text: string, duration = 1.5): void {
    this.statusText = text;
    this.statusTimer = duration;
  }

  private renderBackground(): void {
    const { renderer } = this.services;
    const { ctx } = renderer;
    const gradient = ctx.createLinearGradient(0, 0, renderer.width, renderer.height);
    gradient.addColorStop(0, "#050914");
    gradient.addColorStop(0.45, "#0c1322");
    gradient.addColorStop(1, "#040608");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, renderer.width, renderer.height);

    for (const star of this.stars) {
      const x = (star.x - this.clock * star.speed * star.depth + renderer.width + 24) % (renderer.width + 24);
      const y = star.y + Math.sin(this.clock * 0.5 + star.phase) * star.depth * 6;
      const alpha = 0.18 + (0.5 + 0.5 * Math.sin(this.clock * 1.6 + star.phase)) * 0.48 * star.depth;
      renderer.circle(x - 12, y, star.size, `rgba(220,235,255,${alpha.toFixed(3)})`);
    }

    ctx.save();
    ctx.strokeStyle = "rgba(120, 180, 255, 0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(
        renderer.width * 0.72,
        renderer.height * 0.2,
        84 + i * 34 + Math.sin(this.clock * (0.4 + i * 0.07)) * 4,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderSidePanels(): void {
    const { renderer } = this.services;
    const leftX = EDGE;
    const rightX = renderer.width - RIGHT_PANEL_WIDTH - EDGE;
    const panelHeight = renderer.height - EDGE * 2;

    drawPanel(renderer, leftX, EDGE, LEFT_PANEL_WIDTH, panelHeight, this.run ? "Voyage" : "Premise");
    drawPanel(renderer, rightX, EDGE, RIGHT_PANEL_WIDTH, 290, this.run ? "Ship Systems" : "Controls");
    drawPanel(renderer, rightX, EDGE + 304, RIGHT_PANEL_WIDTH, panelHeight - 304, this.run ? "Archive" : "What This Is");

    if (!this.run) {
      this.renderTitleSidePanels(leftX, rightX);
      return;
    }

    this.renderVoyagePanel(leftX);
    this.renderStatsPanel(rightX);
    this.renderArchivePanel(rightX);
  }

  private renderTitleSidePanels(leftX: number, rightX: number): void {
    const { renderer } = this.services;
    drawTextBlock(
      renderer,
      "A lone survey ship flees from a truth too large to fight. Every jump trades certainty for damage. Every fragment names a universe that is quietly untying itself.",
      leftX + 16,
      EDGE + 46,
      LEFT_PANEL_WIDTH - 32,
      24,
      { color: "#d9e7ff", font: "18px Palatino Linotype" }
    );

    renderer.text("Run pillars", leftX + 16, EDGE + 212, {
      color: "#f4deb2",
      font: "bold 18px Trebuchet MS"
    });
    const pillars = [
      "Choose routes across hostile witness sites.",
      "Tune scans under drift and time pressure.",
      "Decide whether to broadcast, archive, or suppress the truth."
    ];
    let y = EDGE + 244;
    for (const line of pillars) {
      drawTextBlock(renderer, line, leftX + 28, y, LEFT_PANEL_WIDTH - 44, 22, {
        color: "#c8d8ef",
        font: "16px Trebuchet MS"
      });
      renderer.circle(leftX + 16, y - 7, 3, "#7fd4ff");
      y += 56;
    }

    drawTextBlock(
      renderer,
      "Enter or Space confirms. Arrow keys move. H toggles the help card. M toggles audio. C resumes a saved run. N starts over.",
      rightX + 16,
      EDGE + 46,
      RIGHT_PANEL_WIDTH - 32,
      24,
      { color: "#dce8f5", font: "18px Trebuchet MS" }
    );

    drawTextBlock(
      renderer,
      "This first build is a complete vertical slice. It is small by design: one ship, five jumps, multiple endings, no wasted ornament.",
      rightX + 16,
      EDGE + 352,
      RIGHT_PANEL_WIDTH - 32,
      24,
      { color: "#dce8f5", font: "18px Palatino Linotype" }
    );
  }

  private renderVoyagePanel(leftX: number): void {
    const { renderer } = this.services;
    const run = this.run;
    if (!run) return;

    let lastNodeY = 0;
    for (let i = 0; i < CHAPTERS.length; i += 1) {
      const chapter = CHAPTERS[i];
      if (!chapter) continue;
      const nodeY = EDGE + 54 + i * 88;
      const isPast = i < run.chapterIndex;
      const isCurrent = i === run.chapterIndex && this.mode !== "title" && this.mode !== "ending";
      const color = isPast ? "#f5d58d" : isCurrent ? "#7fd4ff" : "rgba(255,255,255,0.22)";
      if (i > 0) {
        renderer.line(leftX + 24, lastNodeY + 12, leftX + 24, nodeY - 12, "rgba(255,255,255,0.12)", 2);
      }
      renderer.circle(leftX + 24, nodeY, 8, color);
      renderer.text(chapter.label, leftX + 42, nodeY + 5, {
        color: isCurrent ? "#f6efe0" : "#d0dbeb",
        font: isCurrent ? "bold 16px Trebuchet MS" : "15px Trebuchet MS"
      });
      lastNodeY = nodeY;
    }

    renderer.text("Route", leftX + 16, EDGE + 514, {
      color: "#f4deb2",
      font: "bold 17px Trebuchet MS"
    });
    if (run.route.length === 0) {
      renderer.text("No jumps committed yet.", leftX + 16, EDGE + 540, {
        color: "#bfcfe5",
        font: "15px Trebuchet MS"
      });
    } else {
      let routeY = EDGE + 542;
      for (const entry of run.route.slice(-5)) {
        renderer.text(`- ${entry}`, leftX + 16, routeY, {
          color: "#dce8f5",
          font: "15px Trebuchet MS"
        });
        routeY += 24;
      }
    }

    renderer.text("Doctrine tally", leftX + 16, EDGE + 660, {
      color: "#f4deb2",
      font: "bold 17px Trebuchet MS"
    });
    let tallyY = EDGE + 688;
    for (const option of DOCTRINE_OPTIONS) {
      renderer.text(`${option.label}: ${run.doctrineCounts[option.id]}`, leftX + 16, tallyY, {
        color: "#dce8f5",
        font: "15px Trebuchet MS"
      });
      tallyY += 22;
    }
  }

  private renderStatsPanel(rightX: number): void {
    const { renderer } = this.services;
    const run = this.run;
    if (!run) return;

    let y = EDGE + 48;
    for (const key of SHIP_METER_KEYS) {
      renderer.text(SHIP_METER_LABELS[key], rightX + 16, y, {
        color: "#f1e4c0",
        font: "15px Trebuchet MS"
      });
      drawBar(renderer, rightX + 16, y + 10, RIGHT_PANEL_WIDTH - 32, 16, run.stats[key], 100, SHIP_METER_COLORS[key]);
      renderer.text(`${Math.round(run.stats[key])}`, rightX + RIGHT_PANEL_WIDTH - 44, y, {
        color: "#dce8f5",
        font: "14px Trebuchet MS",
        align: "right"
      });
      y += 52;
    }

    renderer.text(`Truth packets: ${run.stats.truth}`, rightX + 16, EDGE + 254, {
      color: "#fff1c0",
      font: "bold 17px Trebuchet MS"
    });
    renderer.text(`Audio ${this.audioEnabled ? "on" : "off"} | Help ${this.helpVisible ? "on" : "off"}`, rightX + 16, EDGE + 278, {
      color: "#b7cbe3",
      font: "14px Trebuchet MS"
    });
  }

  private renderArchivePanel(rightX: number): void {
    const { renderer } = this.services;
    const run = this.run;
    if (!run) return;

    const fragment = latestFragment(run);
    let y = EDGE + 338;

    if (fragment) {
      renderer.text(fragment.title, rightX + 16, y, {
        color: fragment.quality === "clean" ? "#fce8b1" : fragment.quality === "partial" ? "#d4e9ff" : "#ffb6c7",
        font: "bold 17px Palatino Linotype"
      });
      y += 24;
      renderer.text(`${fragment.source} | ${fragment.quality}`, rightX + 16, y, {
        color: "#b8cadf",
        font: "14px Trebuchet MS"
      });
      y += 24;
      const bodyLines = drawTextBlock(renderer, fragment.body, rightX + 16, y, RIGHT_PANEL_WIDTH - 32, 22, {
        color: "#dfe8f5",
        font: "16px Palatino Linotype"
      });
      y += bodyLines * 22 + 20;
    } else {
      drawTextBlock(renderer, "No fragments stabilized yet. The route is still only fear and theory.", rightX + 16, y, RIGHT_PANEL_WIDTH - 32, 22, {
        color: "#dfe8f5",
        font: "16px Palatino Linotype"
      });
      y += 84;
    }

    renderer.text("Recent log", rightX + 16, y, {
      color: "#f4deb2",
      font: "bold 16px Trebuchet MS"
    });
    y += 28;

    for (const entry of run.logEntries.slice(0, 4)) {
      const lines = drawTextBlock(renderer, entry, rightX + 16, y, RIGHT_PANEL_WIDTH - 32, 20, {
        color: "#c9d6e8",
        font: "14px Trebuchet MS"
      });
      y += lines * 20 + 10;
    }
  }

  private renderCenterPanel(): void {
    const { renderer } = this.services;
    const centerX = EDGE + LEFT_PANEL_WIDTH + PANEL_GAP;
    const centerWidth = renderer.width - LEFT_PANEL_WIDTH - RIGHT_PANEL_WIDTH - PANEL_GAP * 2 - EDGE * 2;
    const centerHeight = renderer.height - EDGE * 2;

    const title =
      this.mode === "title"
        ? "The Eidolon"
        : this.mode === "choose"
          ? this.currentChapter()?.label ?? GAME_MANIFEST.name
          : this.mode === "scan"
            ? this.scan?.location.title ?? "Scan Console"
            : this.mode === "doctrine"
              ? "Transmission Doctrine"
              : this.ending?.title ?? "Outcome";

    drawPanel(renderer, centerX, EDGE, centerWidth, centerHeight, title);

    switch (this.mode) {
      case "title":
        this.renderTitleCenter(centerX, centerWidth);
        break;
      case "choose":
        this.renderChooseCenter(centerX, centerWidth);
        break;
      case "scan":
        this.renderScanCenter(centerX, centerWidth);
        break;
      case "doctrine":
        this.renderDoctrineCenter(centerX, centerWidth);
        break;
      case "ending":
        this.renderEndingCenter(centerX, centerWidth);
        break;
    }
  }

  private renderTitleCenter(centerX: number, centerWidth: number): void {
    const { renderer } = this.services;
    const center = centerX + centerWidth * 0.5;
    renderer.text(GAME_MANIFEST.name, center, EDGE + 118, {
      align: "center",
      color: "#f9e9c3",
      font: "bold 50px Palatino Linotype"
    });
    renderer.text("A playable cosmic-horror route through evidence, dread, and the void.", center, EDGE + 154, {
      align: "center",
      color: "#bfd6f0",
      font: "20px Trebuchet MS"
    });

    drawTextBlock(
      renderer,
      "Narhex has already vanished. Aboard the Eidolon, you chase the pattern through border forums, abandoned observatories, monastic warnings, and the deep black of Talassa. You cannot stop the correction. You can only decide what to do with the truth before it reaches its purest shape.",
      centerX + 92,
      EDGE + 224,
      centerWidth - 184,
      30,
      { color: "#e3ebf7", font: "24px Palatino Linotype", align: "left" }
    );

    const options = hasRunState() ? ["Continue saved run", "Begin new run"] : ["Begin voyage"];
    const optionY = EDGE + 492;
    for (let i = 0; i < options.length; i += 1) {
      const selected = i === this.titleSelection;
      const width = 340;
      const x = center - width * 0.5;
      const y = optionY + i * 82;
      renderer.rect(x, y, width, 56, selected ? "rgba(36,68,102,0.76)" : "rgba(17,26,40,0.66)");
      renderer.strokeRect(x, y, width, 56, selected ? "#9fdcff" : "rgba(255,255,255,0.2)", selected ? 2.4 : 1.4);
      renderer.text(options[i] ?? "", center, y + 35, {
        align: "center",
        color: selected ? "#fff4cf" : "#d5e4f6",
        font: selected ? "bold 22px Trebuchet MS" : "20px Trebuchet MS"
      });
    }

    renderer.text("Enter confirms. C continues. N starts fresh.", center, EDGE + 678, {
      align: "center",
      color: "#b4c4da",
      font: "16px Trebuchet MS"
    });
  }

  private renderChooseCenter(centerX: number, centerWidth: number): void {
    const { renderer } = this.services;
    const chapter = this.currentChapter();
    if (!chapter) return;

    drawTextBlock(renderer, chapter.briefing, centerX + 20, EDGE + 54, centerWidth - 40, 26, {
      color: "#dce8f5",
      font: "20px Palatino Linotype"
    });

    const cardCount = chapter.locations.length;
    const cardGap = 18;
    const cardWidth = (centerWidth - 40 - cardGap * (cardCount - 1)) / Math.max(1, cardCount);
    const cardY = EDGE + 158;

    for (let i = 0; i < cardCount; i += 1) {
      const location = chapter.locations[i];
      if (!location) continue;
      const x = centerX + 20 + i * (cardWidth + cardGap);
      const selected = i === this.chooseSelection;
      renderer.rect(x, cardY, cardWidth, 520, selected ? "rgba(23,40,62,0.88)" : "rgba(12,18,28,0.7)");
      renderer.strokeRect(x, cardY, cardWidth, 520, selected ? "#89d8ff" : "rgba(255,255,255,0.16)", selected ? 2.6 : 1.4);

      renderer.text(location.title, x + 16, cardY + 34, {
        color: selected ? "#fff0c2" : "#dce8f5",
        font: selected ? "bold 24px Palatino Linotype" : "bold 22px Palatino Linotype"
      });
      renderer.text(location.region, x + 16, cardY + 60, {
        color: "#b7c9df",
        font: "14px Trebuchet MS"
      });

      const summaryLines = drawTextBlock(renderer, location.summary, x + 16, cardY + 96, cardWidth - 32, 22, {
        color: "#d5e4f3",
        font: "16px Trebuchet MS"
      });

      const baseY = cardY + 118 + summaryLines * 22 + 18;
      renderer.text(`Burn ${location.risk.fuel} fuel`, x + 16, baseY, {
        color: "#9bdcff",
        font: "15px Trebuchet MS"
      });
      renderer.text(`Hull risk ${location.risk.hull}`, x + 16, baseY + 28, {
        color: "#f2b684",
        font: "15px Trebuchet MS"
      });
      renderer.text(`Focus risk ${location.risk.focus}`, x + 16, baseY + 56, {
        color: "#c2f0cd",
        font: "15px Trebuchet MS"
      });
      renderer.text(`Trace risk ${location.risk.trace}`, x + 16, baseY + 84, {
        color: "#ff9fb0",
        font: "15px Trebuchet MS"
      });
      renderer.text(`Truth yield ${location.truthReward}`, x + 16, baseY + 112, {
        color: "#fff0c2",
        font: "15px Trebuchet MS"
      });

      renderer.text("Signal targets", x + 16, baseY + 162, {
        color: "#f4deb2",
        font: "bold 15px Trebuchet MS"
      });
      for (let band = 0; band < location.targets.length; band += 1) {
        const target = location.targets[band];
        if (typeof target !== "number") continue;
        const trackY = baseY + 188 + band * 44;
        renderer.text(CHANNEL_LABELS[band] ?? `Band ${band + 1}`, x + 16, trackY + 12, {
          color: "#cad8eb",
          font: "14px Trebuchet MS"
        });
        renderer.rect(x + 84, trackY, cardWidth - 108, 12, "rgba(255,255,255,0.08)");
        renderer.rect(x + 84 + ((cardWidth - 108) * clamp((target - 5) / 100, 0, 1)), trackY - 2, 18, 16, "rgba(127,212,255,0.42)");
        renderer.strokeRect(x + 84, trackY, cardWidth - 108, 12, "rgba(255,255,255,0.2)");
      }
    }

    renderer.text("Left and right choose a destination. Enter commits the jump. Esc returns to title.", centerX + 20, EDGE + 708, {
      color: "#bfd3e9",
      font: "16px Trebuchet MS"
    });
  }

  private renderScanCenter(centerX: number, centerWidth: number): void {
    const { renderer } = this.services;
    const scan = this.scan;
    if (!scan) return;

    drawTextBlock(renderer, scan.location.arrivalText, centerX + 20, EDGE + 54, centerWidth - 260, 24, {
      color: "#dce8f5",
      font: "18px Palatino Linotype"
    });

    renderer.text(`Window ${scan.timeLeft.toFixed(1)}s`, centerX + centerWidth - 26, EDGE + 58, {
      align: "right",
      color: "#fff0c2",
      font: "bold 20px Trebuchet MS"
    });

    const orbX = centerX + centerWidth - 132;
    const orbY = EDGE + 170;
    const { ctx } = renderer;
    ctx.save();
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(127, 212, 255, ${0.14 - i * 0.02})`;
      ctx.lineWidth = 2;
      ctx.arc(orbX, orbY, 28 + i * 22 + Math.sin(this.clock * (1 + i * 0.1)) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    renderer.circle(orbX, orbY, 12, "rgba(250,236,174,0.72)");

    let trackY = EDGE + 262;
    for (let i = 0; i < scan.channels.length; i += 1) {
      const channel = scan.channels[i];
      if (!channel) continue;
      this.renderScanTrack(centerX + 20, trackY, centerWidth - 40, i, channel, i === scan.selectedIndex);
      trackY += 122;
    }

    renderer.text(`Errors: ${scan.errors}`, centerX + 20, EDGE + 660, {
      color: "#ffb8c5",
      font: "16px Trebuchet MS"
    });
    renderer.text("Left and right switch bands. Up and down tune. Space locks a band. Enter resolves early.", centerX + 20, EDGE + 708, {
      color: "#bfd3e9",
      font: "16px Trebuchet MS"
    });
  }

  private renderScanTrack(
    x: number,
    y: number,
    width: number,
    index: number,
    channel: ScanChannelState,
    selected: boolean
  ): void {
    const { renderer } = this.services;
    const label = CHANNEL_LABELS[index] ?? `Band ${index + 1}`;
    renderer.text(label, x, y - 10, {
      color: selected ? "#fff0c2" : "#dce8f5",
      font: selected ? "bold 18px Trebuchet MS" : "16px Trebuchet MS"
    });
    renderer.rect(x, y, width, 24, "rgba(255,255,255,0.08)");
    const targetX = x + width * clamp((channel.target - 5) / 100, 0, 1);
    renderer.rect(targetX, y - 3, 28, 30, "rgba(127,212,255,0.32)");
    const tuneX = x + width * clamp(channel.tune / 100, 0, 1);
    renderer.line(tuneX, y - 8, tuneX, y + 32, channel.locked ? "#b8ffb9" : selected ? "#fff0c2" : "#f2a46f", 3);
    renderer.strokeRect(x, y, width, 24, selected ? "#8edaff" : "rgba(255,255,255,0.22)", selected ? 2 : 1.2);
    renderer.text(`${Math.round(channel.tune)} / ${channel.target}`, x + width - 4, y - 10, {
      align: "right",
      color: channel.locked ? "#b8ffb9" : "#c8d6e8",
      font: "15px Trebuchet MS"
    });
    if (channel.locked) {
      renderer.text("LOCKED", x + width - 4, y + 50, {
        align: "right",
        color: "#b8ffb9",
        font: "bold 14px Trebuchet MS"
      });
    }
  }

  private renderDoctrineCenter(centerX: number, centerWidth: number): void {
    const { renderer } = this.services;
    const outcome = this.outcome;
    if (!outcome) return;

    renderer.text(outcome.fragment.title, centerX + 20, EDGE + 62, {
      color: outcome.quality === "clean" ? "#fff0c2" : outcome.quality === "partial" ? "#d5e7ff" : "#ffb6c7",
      font: "bold 28px Palatino Linotype"
    });
    renderer.text(`${outcome.location.title} | score ${outcome.score} | locks ${outcome.lockedCount}/3`, centerX + 20, EDGE + 92, {
      color: "#bfd2e8",
      font: "16px Trebuchet MS"
    });
    renderer.text(outcome.summary, centerX + 20, EDGE + 122, {
      color: "#f2e3bc",
      font: "18px Trebuchet MS"
    });

    drawTextBlock(renderer, outcome.fragment.body, centerX + 20, EDGE + 170, centerWidth - 40, 28, {
      color: "#dfe8f5",
      font: "22px Palatino Linotype"
    });

    const cardWidth = (centerWidth - 40 - 24 * 2) / 3;
    const cardY = EDGE + 474;
    for (let i = 0; i < DOCTRINE_OPTIONS.length; i += 1) {
      const option = DOCTRINE_OPTIONS[i];
      if (!option) continue;
      const x = centerX + 20 + i * (cardWidth + 24);
      const selected = i === this.doctrineSelection;
      renderer.rect(x, cardY, cardWidth, 194, selected ? "rgba(28,46,70,0.86)" : "rgba(14,22,34,0.72)");
      renderer.strokeRect(x, cardY, cardWidth, 194, selected ? "#8fd8ff" : "rgba(255,255,255,0.18)", selected ? 2.4 : 1.4);
      renderer.text(option.label, x + 16, cardY + 30, {
        color: selected ? "#fff0c2" : "#dce8f5",
        font: selected ? "bold 22px Trebuchet MS" : "bold 20px Trebuchet MS"
      });
      drawTextBlock(renderer, option.summary, x + 16, cardY + 62, cardWidth - 32, 22, {
        color: "#cfdeef",
        font: "15px Trebuchet MS"
      });
      renderer.text(`Trace ${option.traceDelta >= 0 ? "+" : ""}${option.traceDelta}`, x + 16, cardY + 154, {
        color: "#ffb1bf",
        font: "14px Trebuchet MS"
      });
      renderer.text(`Focus ${option.focusDelta >= 0 ? "+" : ""}${option.focusDelta}`, x + 16, cardY + 176, {
        color: "#bff0cb",
        font: "14px Trebuchet MS"
      });
    }

    renderer.text("Choose how this truth leaves the ship.", centerX + 20, EDGE + 710, {
      color: "#bfd3e9",
      font: "16px Trebuchet MS"
    });
  }

  private renderEndingCenter(centerX: number, centerWidth: number): void {
    const { renderer } = this.services;
    const run = this.run;
    const ending = this.ending;
    if (!run || !ending) return;

    renderer.text(ending.title, centerX + centerWidth * 0.5, EDGE + 116, {
      align: "center",
      color: ending.accent,
      font: "bold 44px Palatino Linotype"
    });

    drawTextBlock(renderer, ending.body, centerX + 96, EDGE + 182, centerWidth - 192, 30, {
      color: "#e3ebf7",
      font: "24px Palatino Linotype"
    });

    renderer.text(`Truth ${run.stats.truth} | Trace ${Math.round(run.stats.trace)} | Focus ${Math.round(run.stats.focus)}`, centerX + centerWidth * 0.5, EDGE + 394, {
      align: "center",
      color: "#dce8f5",
      font: "18px Trebuchet MS"
    });
    renderer.text(`Dominant doctrine: ${dominantDoctrine(run)}`, centerX + centerWidth * 0.5, EDGE + 426, {
      align: "center",
      color: "#f2e3bc",
      font: "18px Trebuchet MS"
    });

    renderer.text("Route taken", centerX + 20, EDGE + 492, {
      color: "#f4deb2",
      font: "bold 18px Trebuchet MS"
    });
    const routeText = run.route.length > 0 ? run.route.join(" -> ") : "No route survived to record.";
    drawTextBlock(renderer, routeText, centerX + 20, EDGE + 520, centerWidth - 40, 24, {
      color: "#dce8f5",
      font: "17px Trebuchet MS"
    });

    renderer.text("Enter returns to title.", centerX + centerWidth * 0.5, EDGE + 704, {
      align: "center",
      color: "#b9cee4",
      font: "17px Trebuchet MS"
    });
  }

  private renderHelpOverlay(): void {
    const { renderer } = this.services;
    const width = 470;
    const height = 116;
    const x = renderer.width * 0.5 - width * 0.5;
    const y = renderer.height - height - 18;
    drawPanel(renderer, x, y, width, height, "Controls");

    const lines =
      this.mode === "title"
        ? "Left and right select. Enter confirms. C continues. N starts new. M mutes."
        : this.mode === "choose"
          ? "Left and right choose the next route. Enter commits. Esc returns to title."
          : this.mode === "scan"
            ? "Left and right switch bands. Up and down tune. Space locks. Enter resolves."
            : this.mode === "doctrine"
              ? "Left and right choose what to do with the packet. Enter confirms."
              : "Enter returns to title. H hides this card.";

    drawTextBlock(renderer, lines, x + 16, y + 42, width - 32, 22, {
      color: "#dce8f5",
      font: "15px Trebuchet MS"
    });
  }

  private renderStatus(): void {
    const { renderer } = this.services;
    const alpha = Math.min(1, this.statusTimer / 0.4);
    const width = Math.max(260, this.statusText.length * 9.2);
    const x = renderer.width * 0.5 - width * 0.5;
    const y = EDGE + 10;
    renderer.rect(x, y, width, 34, `rgba(10,16,26,${(0.6 * alpha).toFixed(3)})`);
    renderer.strokeRect(x, y, width, 34, `rgba(245,226,171,${(0.85 * alpha).toFixed(3)})`, 1.6);
    renderer.text(this.statusText, renderer.width * 0.5, y + 22, {
      align: "center",
      color: "#f9e9c3",
      font: "15px Trebuchet MS"
    });
  }
}
