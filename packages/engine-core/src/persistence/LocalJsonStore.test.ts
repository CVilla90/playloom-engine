import { describe, expect, it } from "vitest";
import { createLocalJsonStore, type StorageLike } from "./LocalJsonStore";

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe("createLocalJsonStore", () => {
  it("saves and loads typed values", () => {
    const storage = new MemoryStorage();
    const store = createLocalJsonStore<{ hp: number }>({
      key: "run",
      storage,
      validate: (value): value is { hp: number } =>
        typeof value === "object" && value !== null && "hp" in value
    });

    expect(store.exists()).toBe(false);
    store.save({ hp: 42 });
    expect(store.exists()).toBe(true);
    expect(store.load()).toEqual({ hp: 42 });
  });

  it("returns null on invalid data", () => {
    const storage = new MemoryStorage();
    storage.setItem("run", JSON.stringify({ broken: true }));

    const store = createLocalJsonStore<{ hp: number }>({
      key: "run",
      storage,
      validate: (value): value is { hp: number } =>
        typeof value === "object" && value !== null && "hp" in value
    });

    expect(store.load()).toBeNull();
  });
});
