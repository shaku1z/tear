import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import type { SaveProblem } from "../../src/domain/save-problems";
import { createMetaProgression } from "../../src/gameplay/progression/meta";
import { createProfileStore } from "../../src/persistence/profile-store";
import {
  blankProfileEnvelopeText,
  PROFILE_ENVELOPE_KEY,
  PROFILE_MIRROR_KEY,
  readStoredProfile,
  storedRevision,
} from "../../src/persistence/saved-profile";
import { createSaveNotice, SAVE_NOTICE_ID, SAVE_PROBLEM_TEXT } from "../../src/platform/browser-save-notice";
import { createLegacyPlatformCompatibility } from "../../src/platform/legacy-compat";
import type { SyncStringStorage } from "../../src/platform/storage";
import { fakePage } from "./fake-page";

function stored(initial: Readonly<Record<string, string>> = {}) {
  const values = new Map(Object.entries(initial));
  return { get: (key: string) => values.get(key) ?? null, values };
}
const future = JSON.stringify({ schema: "tear.profile", schemaVersion: 99, profile: { shards: 999 } });
const healthy = JSON.stringify({ shards: 4, modes: {}, stats: {}, ach: {}, seen: {} });

describe("reading the stored profile", () => {
  it("reports nothing for a new player and for a readable save", () => {
    expect(readStoredProfile(stored(), null, 1).problem).toBeNull();
    const saved = stored({ [PROFILE_MIRROR_KEY]: healthy });
    expect(readStoredProfile(saved, null, 1)).toMatchObject({ problem: null, writable: true });
  });

  it("reports an envelope it cannot read, and does not let it be overwritten", () => {
    const result = readStoredProfile(stored({ [PROFILE_ENVELOPE_KEY]: "{" }), null, 1);
    expect(result).toMatchObject({ problem: "profile-unreadable", writable: false });
  });

  it("tells an envelope from a newer build apart from a damaged one, and still reads the plain copy", () => {
    const result = readStoredProfile(
      stored({ [PROFILE_ENVELOPE_KEY]: future, [PROFILE_MIRROR_KEY]: healthy }),
      null,
      1,
    );
    expect(result).toMatchObject({ problem: "profile-newer-version", writable: false });
    expect(result.raw?.shards).toBe(4);
  });

  it("reports a damaged plain copy even when there is no envelope", () => {
    expect(readStoredProfile(stored({ [PROFILE_MIRROR_KEY]: "not-json" }), null, 1).problem).toBe("profile-unreadable");
  });

  it("keeps the first problem when both copies are bad", () => {
    const saved = stored({ [PROFILE_ENVELOPE_KEY]: future, [PROFILE_MIRROR_KEY]: "not-json" });
    expect(readStoredProfile(saved, null, 1).problem).toBe("profile-newer-version");
  });
});

describe("a blank profile envelope", () => {
  it("is a readable envelope of a profile with nothing earned, one revision on", () => {
    const text = blankProfileEnvelopeText(5, "browser", 7);
    expect(text).not.toBeNull();
    expect(storedRevision(text)).toBe(8);
    const result = readStoredProfile(stored({ [PROFILE_ENVELOPE_KEY]: text ?? "" }), null, 5);
    expect(result).toMatchObject({ problem: null, writable: true });
    expect(result.raw).toMatchObject({ shards: 0, stats: {}, ach: {}, created: 5 });
  });

  it("reads the revision of what it replaces, and 0 for anything it cannot read", () => {
    expect(storedRevision(null)).toBe(0);
    expect(storedRevision("{")).toBe(0);
    expect(storedRevision(JSON.stringify({ revision: 3.5 }))).toBe(0);
  });
});

describe("the stores report what they cannot read", () => {
  const profileProblems = (initial: Readonly<Record<string, string>>): SaveProblem[] => {
    const problems: SaveProblem[] = [];
    const saved = stored(initial);
    createProfileStore({
      store: { get: saved.get, set: () => undefined },
      getAchievements: () => undefined,
      getMeta: () => undefined,
      writerId: () => "test",
      reportProblem: (problem) => problems.push(problem),
    }).load();
    return problems;
  };

  it("tells the profile's problem once per load, and nothing for a new player", () => {
    expect(profileProblems({})).toEqual([]);
    expect(profileProblems({ [PROFILE_ENVELOPE_KEY]: "{", [PROFILE_MIRROR_KEY]: "not-json" })).toEqual([
      "profile-unreadable",
    ]);
    expect(profileProblems({ [PROFILE_ENVELOPE_KEY]: future })).toEqual(["profile-newer-version"]);
  });

  it("tells the coins and upgrades' problem, and nothing when they are fine or missing", () => {
    const metaProblems = (text: string | null): SaveProblem[] => {
      const problems: SaveProblem[] = [];
      createMetaProgression({
        store: { get: () => text, set: () => undefined },
        reportProblem: (problem) => problems.push(problem),
      } as unknown as Parameters<typeof createMetaProgression>[0]).META.load();
      return problems;
    };
    expect(metaProblems("{")).toEqual(["meta-unreadable"]);
    expect(metaProblems(null)).toEqual([]);
    expect(metaProblems(JSON.stringify({ lifetimeEarned: 3 }))).toEqual([]);
  });
});

describe("the platform store reports a write that has nowhere to go", () => {
  const compat = (storage: SyncStringStorage | undefined) => {
    const problems: SaveProblem[] = [];
    const platform = createLegacyPlatformCompatibility({
      target: "standalone",
      ...(storage === undefined ? {} : { storage }),
      reportProblem: (problem) => problems.push(problem),
    });
    return { store: platform.CG.store, problems };
  };
  const working = (): SyncStringStorage => {
    const values = new Map<string, string>();
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
      removeItem: (key) => void values.delete(key),
    };
  };

  it("is quiet while the browser keeps the data", async () => {
    const { store, problems } = compat(working());
    store.set("k", "v");
    expect((await store.acknowledged?.update("k", () => "w"))?.status).toBe("committed");
    expect(problems).toEqual([]);
  });

  it("reports a browser that throws on write, for a plain write and an acknowledged one", async () => {
    const refusing: SyncStringStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
    };
    const plain = compat(refusing);
    plain.store.set("k", "v");
    expect(plain.problems).toEqual(["storage-unavailable"]);
    expect(plain.store.get("k")).toBe("v"); // the game still plays from memory
    const acknowledged = compat(refusing);
    expect((await acknowledged.store.acknowledged?.update("k", () => "w"))?.status).toBe("unknown");
    expect(acknowledged.problems).toContain("storage-unavailable");
  });
});

describe("the save notice", () => {
  const dialog = (page: ReturnType<typeof fakePage>) => page.body.find((element) => element.id === SAVE_NOTICE_ID);
  const press = (page: ReturnType<typeof fakePage>): void =>
    page.body.find((element) => element.tag === "button")?.listeners.get("click")?.();

  it("has a sentence for every problem, and each says what to do", () => {
    for (const text of Object.values(SAVE_PROBLEM_TEXT)) expect(text.length).toBeGreaterThan(40);
    expect(SAVE_PROBLEM_TEXT["profile-unreadable"]).toContain("Settings > General > RESET PROGRESS");
    expect(SAVE_PROBLEM_TEXT["storage-unavailable"]).toContain("lost when the page closes");
  });

  it("shows nothing until something goes wrong, then tells it in plain words", () => {
    const page = fakePage();
    const notice = createSaveNotice(page.document);
    expect(dialog(page)).toBeUndefined();
    notice.report("profile-unreadable");
    expect(dialog(page)?.texts()).toContain(SAVE_PROBLEM_TEXT["profile-unreadable"]);
    expect(dialog(page)?.attributes.get("role")).toBe("dialog");
  });

  it("tells each problem once: the same one again opens nothing, even after OK", () => {
    const page = fakePage();
    const notice = createSaveNotice(page.document);
    notice.report("storage-unavailable");
    notice.report("storage-unavailable");
    expect(page.body.children).toHaveLength(1);
    press(page);
    expect(dialog(page)).toBeUndefined();
    notice.report("storage-unavailable");
    expect(dialog(page)).toBeUndefined();
  });

  it("lists a second problem that arrives while it is open in the same dialog, and after OK only the new one", () => {
    const page = fakePage();
    const notice = createSaveNotice(page.document);
    notice.report("profile-unreadable");
    notice.report("meta-unreadable");
    expect(page.body.children).toHaveLength(1);
    expect(dialog(page)?.texts()).toEqual(
      expect.arrayContaining([SAVE_PROBLEM_TEXT["profile-unreadable"], SAVE_PROBLEM_TEXT["meta-unreadable"]]),
    );
    press(page);
    notice.report("storage-unavailable");
    const texts = dialog(page)?.texts() ?? [];
    expect(texts).toContain(SAVE_PROBLEM_TEXT["storage-unavailable"]);
    expect(texts).not.toContain(SAVE_PROBLEM_TEXT["profile-unreadable"]);
  });
});
