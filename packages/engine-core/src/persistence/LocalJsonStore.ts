export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SaveValidator<T> = (value: unknown) => value is T;

export interface LocalJsonStoreOptions<T> {
  key: string;
  storage?: StorageLike | null;
  validate?: SaveValidator<T>;
}

export interface LocalJsonStore<T> {
  load(): T | null;
  save(value: T): void;
  clear(): void;
  exists(): boolean;
}

function defaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage ?? null;
}

export function createLocalJsonStore<T>(options: LocalJsonStoreOptions<T>): LocalJsonStore<T> {
  const storage = options.storage ?? defaultStorage();
  const validate = options.validate;

  return {
    load(): T | null {
      if (!storage) return null;
      try {
        const raw = storage.getItem(options.key);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (validate && !validate(parsed)) {
          return null;
        }
        return parsed as T;
      } catch {
        return null;
      }
    },

    save(value: T): void {
      if (!storage) return;
      storage.setItem(options.key, JSON.stringify(value));
    },

    clear(): void {
      if (!storage) return;
      storage.removeItem(options.key);
    },

    exists(): boolean {
      if (!storage) return false;
      return storage.getItem(options.key) !== null;
    }
  };
}
