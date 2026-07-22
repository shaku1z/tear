import type { KeyValueStorage } from "./contracts";

export interface SyncStringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    get(key) { return Promise.resolve(values.get(key) ?? null); },
    set(key, value) { values.set(key, value); return Promise.resolve(); },
    remove(key) { values.delete(key); return Promise.resolve(); },
  };
}

/** Storage failures (privacy mode, quota, disabled cookies) degrade to in-memory storage. */
export function createSafeStorage(storage?: SyncStringStorage, prefix = ""): KeyValueStorage {
  const memory = createMemoryStorage();
  const keyFor = (key: string) => `${prefix}${key}`;
  return {
    async get(key) {
      try {
        const value = storage?.getItem(keyFor(key));
        return value ?? await memory.get(key);
      } catch {
        return memory.get(key);
      }
    },
    async set(key, value) {
      await memory.set(key, value);
      try { storage?.setItem(keyFor(key), value); } catch { /* memory remains usable */ }
    },
    async remove(key) {
      await memory.remove(key);
      try { storage?.removeItem(keyFor(key)); } catch { /* memory remains usable */ }
    },
  };
}
