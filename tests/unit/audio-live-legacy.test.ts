import { describe, expect, it } from "vitest";
import { LegacyAudioSettingsStore } from "../../src/audio/legacy-live-audio";

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length(): number { return this.#values.size; }
  clear(): void { this.#values.clear(); }
  getItem(key: string): string | null { return this.#values.get(key) ?? null; }
  key(index: number): string | null { return [...this.#values.keys()][index] ?? null; }
  removeItem(key: string): void { this.#values.delete(key); }
  setItem(key: string, value: string): void { this.#values.set(key, value); }
}

describe("legacy live audio settings", () => {
  it("migrates the original volume and music fields", () => {
    const storage = new MemoryStorage();
    storage.setItem("tear_settings", JSON.stringify({ vol: 0.8, music: false, sens: 1.4 }));

    const settings = new LegacyAudioSettingsStore(storage).load();

    expect(settings.masterVolume).toBe(0.8);
    expect(settings.musicMuted).toBe(true);
    expect(settings.sfxMuted).toBe(false);
  });

  it("persists independent buses without removing non-audio settings", () => {
    const storage = new MemoryStorage();
    storage.setItem("tear_settings", JSON.stringify({ sens: 1.4, controls: "desktop" }));
    const store = new LegacyAudioSettingsStore(storage);

    store.save({
      masterVolume: 0.7,
      musicVolume: 0.3,
      sfxVolume: 0.9,
      interfaceVolume: 0.4,
      masterMuted: false,
      musicMuted: true,
      sfxMuted: false,
      interfaceMuted: true,
    });

    const persisted = JSON.parse(storage.getItem("tear_settings") ?? "{}") as Record<string, unknown>;
    expect(persisted).toMatchObject({
      sens: 1.4,
      controls: "desktop",
      vol: 0.7,
      music: false,
      musicVolume: 0.3,
      sfxVolume: 0.9,
      interfaceVolume: 0.4,
      interfaceMuted: true,
      audioSchemaVersion: 2,
    });
  });
});
