import { createLocalJsonStore } from "@playloom/engine-core";
import {
  GAME_MANIFEST,
  type DoctrineChoice,
  type FragmentQuality,
  type FragmentRecord,
  type RunState,
  type ShipStats
} from "./data";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDoctrineChoice(value: unknown): value is DoctrineChoice {
  return value === "broadcast" || value === "archive" || value === "suppress";
}

function isFragmentQuality(value: unknown): value is FragmentQuality {
  return value === "clean" || value === "partial" || value === "corrupted";
}

function isShipStats(value: unknown): value is ShipStats {
  if (!isObject(value)) return false;
  return (
    typeof value.fuel === "number" &&
    typeof value.hull === "number" &&
    typeof value.focus === "number" &&
    typeof value.trace === "number" &&
    typeof value.truth === "number"
  );
}

function isFragmentRecord(value: unknown): value is FragmentRecord {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.source === "string" &&
    isFragmentQuality(value.quality) &&
    (value.doctrine === null || isDoctrineChoice(value.doctrine))
  );
}

function isRunState(value: unknown): value is RunState {
  if (!isObject(value)) return false;
  if (value.version !== 1) return false;
  if (
    typeof value.runSeed !== "number" ||
    typeof value.chapterIndex !== "number" ||
    !Number.isInteger(value.chapterIndex) ||
    value.chapterIndex < 0
  ) {
    return false;
  }
  if (!isShipStats(value.stats)) return false;
  if (!isObject(value.doctrineCounts)) return false;
  if (
    typeof value.doctrineCounts.broadcast !== "number" ||
    typeof value.doctrineCounts.archive !== "number" ||
    typeof value.doctrineCounts.suppress !== "number"
  ) {
    return false;
  }
  if (!Array.isArray(value.route) || value.route.some((entry) => typeof entry !== "string")) return false;
  if (!Array.isArray(value.fragments) || value.fragments.some((entry) => !isFragmentRecord(entry))) return false;
  if (!Array.isArray(value.logEntries) || value.logEntries.some((entry) => typeof entry !== "string")) return false;
  return typeof value.lastStatus === "string";
}

const store = createLocalJsonStore<RunState>({
  key: GAME_MANIFEST.saveKey,
  validate: isRunState
});

export function loadRunState(): RunState | null {
  return store.load();
}

export function saveRunState(run: RunState): void {
  store.save(run);
}

export function clearRunState(): void {
  store.clear();
}

export function hasRunState(): boolean {
  return store.exists();
}
