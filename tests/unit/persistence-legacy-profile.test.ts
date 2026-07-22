import { describe, expect, it } from "vitest";
import { createLegacyProfile } from "../../src/persistence/legacy-profile";

function storage(initial: Readonly<Record<string, string>> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    store: {
      get: (key: string) => values.get(key) ?? null,
      set: (key: string, value: string) => { values.set(key, value); },
    },
  };
}

describe("legacy profile compatibility", () => {
  it("loads mutable nested state from a validated envelope", () => {
    const saved = storage({
      tear_profile_v2: JSON.stringify({
        schema: "tear.profile", schemaVersion: 2, revision: 1, updatedAtMs: 1, writerId: "test",
        profile: { modes: {}, stats: {}, ach: {}, seen: {} }, extensions: {},
      }),
    });
    const profile = createLegacyProfile({
      store: saved.store, getAchievements: () => undefined, getMeta: () => undefined, writerId: () => "test",
    });
    profile.load();
    profile.markMode("endless");
    expect(profile.data.modes.endless).toBe(true);
  });

  it("uses the raw mirror but never overwrites a future envelope", () => {
    const future = JSON.stringify({ schema: "tear.profile", schemaVersion: 99, profile: { shards: 999 } });
    const saved = storage({
      tear_profile_v2: future,
      tear_profile: JSON.stringify({ shards: 4, modes: {}, stats: {}, ach: {}, seen: {} }),
    });
    const profile = createLegacyProfile({
      store: saved.store, getAchievements: () => undefined, getMeta: () => undefined, writerId: () => "test",
    });
    expect(profile.load().shards).toBe(4);
    profile.addShards(2);
    expect(saved.values.get("tear_profile_v2")).toBe(future);
    expect(saved.values.get("tear_profile")).toContain('"shards":6');
  });

  it("defaults safely when both stored representations are corrupt", () => {
    const saved = storage({ tear_profile_v2: "{", tear_profile: "not-json" });
    const profile = createLegacyProfile({
      store: saved.store, getAchievements: () => undefined, getMeta: () => undefined, writerId: () => "test",
    });
    const data = profile.load();
    expect(data.shards).toBe(0);
    expect(data.modes).toEqual({});
    expect(() => { profile.markMode("campaign"); }).not.toThrow();
  });
});
