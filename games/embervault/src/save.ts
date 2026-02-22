import { createLocalJsonStore } from "@playloom/engine-core";
import type { CharacterId, RunSnapshot } from "./types";

const SAVE_KEY = "embervault-descent.save.v1";
export const TUTORIAL_KEY = "embervault-descent.tutorial-seen.v1";

export interface GameSave {
  version: 1;
  savedAt: string;
  characterId: CharacterId;
  snapshot: RunSnapshot;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isGameSave(value: unknown): value is GameSave {
  if (!isObject(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.savedAt !== "string" || value.savedAt.length === 0) return false;
  if (typeof value.characterId !== "string" || value.characterId.length === 0) return false;
  if (!("snapshot" in value) || !value.snapshot) return false;
  return true;
}

const saveStore = createLocalJsonStore<GameSave>({
  key: SAVE_KEY,
  validate: isGameSave
});

export function loadSave(): GameSave | null {
  return saveStore.load();
}

export function writeSave(save: GameSave): void {
  saveStore.save(save);
}

export function clearSave(): void {
  saveStore.clear();
}

export function isTutorialSeen(): boolean {
  return localStorage.getItem(TUTORIAL_KEY) === "1";
}

export function markTutorialSeen(): void {
  localStorage.setItem(TUTORIAL_KEY, "1");
}
