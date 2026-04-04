import { createLocalJsonStore } from "@playloom/engine-core";
import {
  cargoCapacityFromParts,
  cargoManifestFromEntries,
  cargoUsedCapacity,
  isCargoManifestEntry,
  type CargoManifestEntry
} from "./economyData";
import type { RadioTransmission } from "./questData";
import { GAME_MANIFEST } from "./types";

export const MANUAL_SAVE_SLOTS = ["slot1", "slot2", "slot3"] as const;

export type ManualSaveSlotId = (typeof MANUAL_SAVE_SLOTS)[number];
export type SaveSlotId = "autosave" | ManualSaveSlotId;

export interface CourierSaveData {
  readonly version: 1;
  readonly slot: SaveSlotId;
  readonly savedAt: string;
  readonly progression: {
    readonly syncUnlocked: boolean;
    readonly completedQuestIds: readonly string[];
    readonly activeQuestId: string | null;
    readonly activeQuestTitle: string | null;
    readonly completedStepCount: number;
    readonly stepHoldProgress: number;
    readonly activeQuestComplete: boolean;
    readonly statusLabel: string;
  };
  readonly world: {
    readonly locationId: string;
    readonly locationName: string;
    readonly trackedDestinationId: string | null;
    readonly wakeOriginId?: string | null;
    readonly discoveredContactIds: readonly string[];
    readonly marketPulse?: number;
    readonly singularityThresholdSsi?: number;
  };
  readonly pilot: {
    readonly credits: number;
    readonly upgradeIds: readonly string[];
    readonly cargoManifest?: readonly CargoManifestEntry[];
    readonly hullIntegrity?: number;
  };
  readonly comms: {
    readonly transmissions: readonly RadioTransmission[];
  };
}

export type CourierSavePayload = Omit<CourierSaveData, "version" | "slot" | "savedAt">;

export interface SaveSlotSummary {
  readonly slot: SaveSlotId;
  readonly label: string;
  readonly save: CourierSaveData | null;
  readonly hasSave: boolean;
  readonly savedAtLabel: string;
  readonly questLine: string;
  readonly detailLine: string;
}

export interface SaveArchiveSummary {
  readonly hasAnySave: boolean;
  readonly resumeSlot: SaveSlotId | null;
  readonly resumeSummary: SaveSlotSummary | null;
  readonly autosave: SaveSlotSummary;
  readonly manualSlots: readonly SaveSlotSummary[];
}

interface SaveArchive {
  readonly version: 1;
  readonly resumeSlot: SaveSlotId | null;
  readonly autosave: CourierSaveData | null;
  readonly manualSlots: Record<ManualSaveSlotId, CourierSaveData | null>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isCargoManifestEntryArray(value: unknown): value is CargoManifestEntry[] {
  return Array.isArray(value) && value.every((entry) => isCargoManifestEntry(entry));
}

function isRadioTransmission(value: unknown): value is RadioTransmission {
  if (!isObject(value)) return false;
  return (
    typeof value.sender === "string" &&
    typeof value.channel === "string" &&
    typeof value.subject === "string" &&
    typeof value.body === "string" &&
    typeof value.accent === "string"
  );
}

function isSaveSlotId(value: unknown): value is SaveSlotId {
  return value === "autosave" || MANUAL_SAVE_SLOTS.includes(value as ManualSaveSlotId);
}

function isManualSlotMap(value: unknown): value is Record<ManualSaveSlotId, CourierSaveData | null> {
  if (!isObject(value)) return false;
  return MANUAL_SAVE_SLOTS.every((slot) => value[slot] === null || isCourierSaveData(value[slot]));
}

function isCourierSaveData(value: unknown): value is CourierSaveData {
  if (!isObject(value)) return false;
  if (value.version !== 1) return false;
  if (!isSaveSlotId(value.slot)) return false;
  if (typeof value.savedAt !== "string" || value.savedAt.length === 0) return false;
  if (!isObject(value.progression) || !isObject(value.world) || !isObject(value.pilot) || !isObject(value.comms)) {
    return false;
  }

  if (
    typeof value.progression.syncUnlocked !== "boolean" ||
    !isStringArray(value.progression.completedQuestIds) ||
    (value.progression.activeQuestId !== null && typeof value.progression.activeQuestId !== "string") ||
    (value.progression.activeQuestTitle !== null && typeof value.progression.activeQuestTitle !== "string") ||
    typeof value.progression.completedStepCount !== "number" ||
    typeof value.progression.stepHoldProgress !== "number" ||
    typeof value.progression.activeQuestComplete !== "boolean" ||
    typeof value.progression.statusLabel !== "string"
  ) {
    return false;
  }

  if (
    typeof value.world.locationId !== "string" ||
    typeof value.world.locationName !== "string" ||
    (value.world.trackedDestinationId !== null && typeof value.world.trackedDestinationId !== "string") ||
    (value.world.wakeOriginId !== undefined && value.world.wakeOriginId !== null && typeof value.world.wakeOriginId !== "string") ||
    !isStringArray(value.world.discoveredContactIds) ||
    (value.world.marketPulse !== undefined && typeof value.world.marketPulse !== "number") ||
    (value.world.singularityThresholdSsi !== undefined && typeof value.world.singularityThresholdSsi !== "number")
  ) {
    return false;
  }

  if (
    typeof value.pilot.credits !== "number" ||
    !isStringArray(value.pilot.upgradeIds) ||
    (value.pilot.cargoManifest !== undefined && !isCargoManifestEntryArray(value.pilot.cargoManifest)) ||
    (value.pilot.hullIntegrity !== undefined && typeof value.pilot.hullIntegrity !== "number")
  ) {
    return false;
  }

  return (
    Array.isArray(value.comms.transmissions) &&
    value.comms.transmissions.every((entry) => isRadioTransmission(entry))
  );
}

function isSaveArchive(value: unknown): value is SaveArchive {
  if (!isObject(value)) return false;
  if (value.version !== 1) return false;
  if (value.resumeSlot !== null && !isSaveSlotId(value.resumeSlot)) return false;
  if (value.autosave !== null && !isCourierSaveData(value.autosave)) return false;
  return isManualSlotMap(value.manualSlots);
}

function createEmptyArchive(): SaveArchive {
  return {
    version: 1,
    resumeSlot: null,
    autosave: null,
    manualSlots: {
      slot1: null,
      slot2: null,
      slot3: null
    }
  };
}

const archiveStore = createLocalJsonStore<SaveArchive>({
  key: GAME_MANIFEST.saveKey,
  validate: isSaveArchive
});

function loadArchive(): SaveArchive {
  return archiveStore.load() ?? createEmptyArchive();
}

function writeArchive(archive: SaveArchive): void {
  archiveStore.save(archive);
}

function getArchiveSlot(archive: SaveArchive, slot: SaveSlotId | null): CourierSaveData | null {
  if (!slot) {
    return null;
  }
  return slot === "autosave" ? archive.autosave : archive.manualSlots[slot];
}

function allSaves(archive: SaveArchive): CourierSaveData[] {
  const entries: CourierSaveData[] = [];
  if (archive.autosave) {
    entries.push(archive.autosave);
  }
  for (const slot of MANUAL_SAVE_SLOTS) {
    const save = archive.manualSlots[slot];
    if (save) {
      entries.push(save);
    }
  }
  return entries;
}

function mostRecentSave(archive: SaveArchive): CourierSaveData | null {
  const saves = allSaves(archive);
  if (saves.length === 0) {
    return null;
  }
  return saves.reduce((latest, candidate) => {
    if (!latest) {
      return candidate;
    }
    return Date.parse(candidate.savedAt) > Date.parse(latest.savedAt) ? candidate : latest;
  }, saves[0] ?? null);
}

function slotLabel(slot: SaveSlotId): string {
  switch (slot) {
    case "autosave":
      return "AUTOSAVE";
    case "slot1":
      return "SAVE 1";
    case "slot2":
      return "SAVE 2";
    case "slot3":
      return "SAVE 3";
  }
}

function formatSavedAt(iso: string): string {
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.valueOf())) {
    return "SYNC TIME UNKNOWN";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(stamp).toUpperCase();
}

function summarizeSlot(slot: SaveSlotId, save: CourierSaveData | null): SaveSlotSummary {
  if (!save) {
    return {
      slot,
      label: slotLabel(slot),
      save: null,
      hasSave: false,
      savedAtLabel: "EMPTY",
      questLine: "No registry sync recorded.",
      detailLine: "Open the ledger after sync unlock to write here."
    };
  }

  const questTitle = save.progression.activeQuestTitle ?? "Free Drift";
  const cargoUsed = cargoUsedCapacity(cargoManifestFromEntries(save.pilot.cargoManifest));
  const cargoCapacity = cargoCapacityFromParts(save.pilot.upgradeIds);
  return {
    slot,
    label: slotLabel(slot),
    save,
    hasSave: true,
    savedAtLabel: formatSavedAt(save.savedAt),
    questLine: `${questTitle} // ${save.progression.statusLabel}`,
    detailLine: `${save.world.locationName} // ${save.pilot.credits} CR // ${cargoUsed}/${cargoCapacity} HOLD`
  };
}

export function getSaveArchiveSummary(): SaveArchiveSummary {
  const archive = loadArchive();
  const preferred = getArchiveSlot(archive, archive.resumeSlot) ?? mostRecentSave(archive);
  return {
    hasAnySave: preferred !== null,
    resumeSlot: preferred?.slot ?? null,
    resumeSummary: preferred ? summarizeSlot(preferred.slot, preferred) : null,
    autosave: summarizeSlot("autosave", archive.autosave),
    manualSlots: MANUAL_SAVE_SLOTS.map((slot) => summarizeSlot(slot, archive.manualSlots[slot]))
  };
}

export function loadSaveSlot(slot: SaveSlotId): CourierSaveData | null {
  return getArchiveSlot(loadArchive(), slot);
}

export function loadResumeSave(): CourierSaveData | null {
  const archive = loadArchive();
  return getArchiveSlot(archive, archive.resumeSlot) ?? mostRecentSave(archive);
}

export function writeSaveSlot(slot: SaveSlotId, payload: CourierSavePayload): CourierSaveData {
  const archive = loadArchive();
  const nextSave: CourierSaveData = {
    ...payload,
    version: 1,
    slot,
    savedAt: new Date().toISOString()
  };
  const nextArchive: SaveArchive = slot === "autosave"
    ? {
        ...archive,
        resumeSlot: slot,
        autosave: nextSave
      }
    : {
        ...archive,
        resumeSlot: slot,
        manualSlots: {
          ...archive.manualSlots,
          [slot]: nextSave
        }
      };
  writeArchive(nextArchive);
  return nextSave;
}

export function rememberResumeSlot(slot: SaveSlotId): void {
  const archive = loadArchive();
  if (!getArchiveSlot(archive, slot)) {
    return;
  }
  writeArchive({
    ...archive,
    resumeSlot: slot
  });
}

export function hasAnySavedFlight(): boolean {
  return getSaveArchiveSummary().hasAnySave;
}
