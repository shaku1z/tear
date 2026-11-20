import { describe, expect, it, vi } from "vitest";
import { betterGauntletClear, mergeGauntletBests, normalizeGauntletBests } from "../../src/domain/gauntlet-records";
import { migrateProfileEnvelope, PROFILE_ENVELOPE_VERSION } from "../../src/persistence/profile-envelope";
import {
  CURRENT_RULESET_VERSION,
  RULESET_STEPS,
  SIX_BIOME_PALE_PREVIEW_V4_RULESET_VERSION,
  SIX_BIOME_PALE_PREVIEW_V5_RULESET_VERSION,
  SIX_BIOME_PALE_PREVIEW_V6_RULESET_VERSION,
  SIX_BIOME_PALE_PREVIEW_V7_RULESET_VERSION,
  SIX_BIOME_PALE_PREVIEW_V8_RULESET_VERSION,
  SIX_BIOME_PALE_PREVIEW_V10_RULESET_VERSION,
  SIX_BIOME_PALE_PREVIEW_V11_RULESET_VERSION,
  SIX_BIOME_PALE_PREVIEW_V9_RULESET_VERSION,
  UNKNOWN_RULESET_REFUSAL,
  rulesetRefusal,
} from "../../src/gameplay/run/ruleset-version";
import { ReplayLibraryController, recordingRefusal } from "../../src/app/library/replay-library-controller";
import { refuseGhostTheater } from "../../src/ghost/theater-open-result";
import { createProfileStore } from "../../src/persistence/profile-store";

describe("Gauntlet personal bests", () => {
  it("ranks the faster clear first and breaks a tie by fewer hits", () => {
    expect(betterGauntletClear({ ticks: 100, hits: 9 }, { ticks: 101, hits: 0 })).toBe(true);
    expect(betterGauntletClear({ ticks: 100, hits: 2 }, { ticks: 100, hits: 3 })).toBe(true);
    expect(betterGauntletClear({ ticks: 100, hits: 3 }, { ticks: 100, hits: 3 })).toBe(false);
    expect(betterGauntletClear({ ticks: 100, hits: 3 }, null)).toBe(true);
  });

  it("drops malformed stored entries", () => {
    expect(
      normalizeGauntletBests({
        normal: { ticks: 5000, hits: 2 },
        hard: { ticks: -1, hits: 0 },
        extreme: { ticks: 0, hits: 0 },
        easy: "fast",
        oneHit: { ticks: 1.5, hits: 0 },
      }),
    ).toEqual({ normal: { ticks: 5000, hits: 2 } });
    expect(normalizeGauntletBests([1, 2])).toEqual({});
    expect(normalizeGauntletBests(null)).toEqual({});
  });

  it("merges two devices to the better clear per difficulty, in either order, idempotently", () => {
    const left = { normal: { ticks: 900, hits: 1 }, hard: { ticks: 2000, hits: 4 } };
    const right = { normal: { ticks: 800, hits: 6 }, extreme: { ticks: 3000, hits: 0 } };
    const merged = mergeGauntletBests(left, right);
    expect(merged).toEqual({
      normal: { ticks: 800, hits: 6 },
      hard: { ticks: 2000, hits: 4 },
      extreme: { ticks: 3000, hits: 0 },
    });
    expect(mergeGauntletBests(right, left)).toEqual(merged);
    expect(mergeGauntletBests(merged, merged)).toEqual(merged);
  });
});

describe("Gauntlet bests in the profile", () => {
  it("needs no envelope version: a save without bests migrates unchanged, unknown fields kept", () => {
    const result = migrateProfileEnvelope({
      schema: "tear.profile",
      schemaVersion: PROFILE_ENVELOPE_VERSION,
      profile: { shards: 3, unknownFuture: "kept" },
    });
    expect(result).toMatchObject({
      ok: true,
      migratedFrom: null,
      value: { profile: { shards: 3, unknownFuture: "kept" } },
    });
    if (result.ok) expect(result.value.profile).not.toHaveProperty("gauntletBest");
  });

  it("re-validates bests a save carries", () => {
    const result = migrateProfileEnvelope({
      schema: "tear.profile",
      schemaVersion: PROFILE_ENVELOPE_VERSION,
      profile: { gauntletBest: { normal: { ticks: 7000, hits: 1 }, hard: { ticks: "x" } } },
    });
    expect(result).toMatchObject({
      ok: true,
      migratedFrom: null,
      value: { profile: { gauntletBest: { normal: { ticks: 7000, hits: 1 } } } },
    });
  });

  it("keeps a clear only when it beats the best, and merges a remote profile's best", () => {
    const values = new Map<string, string>();
    const profile = createProfileStore({
      store: {
        get: (key: string) => values.get(key) ?? null,
        set: (key: string, value: string) => void values.set(key, value),
      },
      now: () => 1,
      writerId: () => "unit",
      getAchievements: () => undefined,
      getMeta: () => undefined,
    });
    profile.load();
    expect(profile.gauntletBest("normal")).toBeNull();
    expect(profile.recordGauntletClear("normal", { ticks: 9000, hits: 3 })).toBe(true);
    expect(profile.recordGauntletClear("normal", { ticks: 9500, hits: 0 })).toBe(false);
    expect(profile.recordGauntletClear("normal", { ticks: 9000, hits: 2 })).toBe(true);
    profile.merge({ gauntletBest: { normal: { ticks: 8000, hits: 5 }, hard: { ticks: 12000, hits: 1 } } });
    expect(profile.gauntletBest("normal")).toEqual({ ticks: 8000, hits: 5 });
    expect(profile.gauntletBest("hard")).toEqual({ ticks: 12000, hits: 1 });
    // The best is saved with the profile, so it survives a reload.
    expect(JSON.stringify([...values.values()])).toContain("gauntletBest");
  });
});

describe("ruleset steps", () => {
  it("lists every ruleset once, oldest first, ending at the current one, each with what changed", () => {
    const versions = RULESET_STEPS.map((step) => step.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.at(-1)).toBe(CURRENT_RULESET_VERSION);
    expect(versions.at(-2)).toBe(SIX_BIOME_PALE_PREVIEW_V11_RULESET_VERSION);
    for (const step of RULESET_STEPS) expect(step.change.length).toBeGreaterThan(0);
  });

  it("admits only the current ruleset, in every mode, and names the first change an older recording missed", () => {
    expect(rulesetRefusal(CURRENT_RULESET_VERSION)).toBeNull();
    expect(rulesetRefusal(SIX_BIOME_PALE_PREVIEW_V11_RULESET_VERSION)).toBe(
      "recorded before Verdant's waves were written",
    );
    expect(rulesetRefusal(SIX_BIOME_PALE_PREVIEW_V10_RULESET_VERSION)).toBe(
      "recorded before Rootbinders began snaring with a warning",
    );
    expect(rulesetRefusal(SIX_BIOME_PALE_PREVIEW_V9_RULESET_VERSION)).toBe(
      "recorded before Rootbinders began rooting their allies",
    );
    expect(rulesetRefusal(SIX_BIOME_PALE_PREVIEW_V8_RULESET_VERSION)).toBe(
      "recorded before a run's first wave began with a grace",
    );
    expect(rulesetRefusal(SIX_BIOME_PALE_PREVIEW_V7_RULESET_VERSION)).toBe(
      "recorded before Bloom Wells began lifting from the floor",
    );
    expect(rulesetRefusal(SIX_BIOME_PALE_PREVIEW_V6_RULESET_VERSION)).toBe(
      "recorded before a boss's body stopped hurting outside its moves",
    );
    expect(rulesetRefusal(SIX_BIOME_PALE_PREVIEW_V5_RULESET_VERSION)).toBe(
      "recorded before the Gauntlet became a run of trials",
    );
    expect(rulesetRefusal(SIX_BIOME_PALE_PREVIEW_V4_RULESET_VERSION)).toBe(
      "recorded before each repeat of a boss strike got its own warning",
    );
    expect(rulesetRefusal("legacy-replay-v2")).toBe(UNKNOWN_RULESET_REFUSAL);
    // A recording that names no ruleset is left to the older admission paths.
    expect(rulesetRefusal(undefined)).toBeNull();
  });

  it("refuses an older capsule of any mode from the Vault list and Theater with the named change", () => {
    const old = (mode: string) => ({ mode, provenance: { rulesetVersion: SIX_BIOME_PALE_PREVIEW_V5_RULESET_VERSION } });
    const current = (mode: string) => ({ mode, provenance: { rulesetVersion: CURRENT_RULESET_VERSION } });
    const reason = "recorded before the Gauntlet became a run of trials";
    expect(recordingRefusal(old("endless"))).toBe(reason);
    expect(recordingRefusal(old("gauntlet"))).toBe(reason);
    expect(recordingRefusal(current("gauntlet"))).toBeNull();

    const enterReplay = vi.fn(() => true),
      message = vi.fn();
    const controller = new ReplayLibraryController({
      vault: {
        index: () => [],
        get: (id: string) => (id === "old-gauntlet" ? old("gauntlet") : current("endless")),
        setShareId: vi.fn(),
      },
      cloud: { hasLeaderboards: () => false, loadGhost: vi.fn(), loadReplay: vi.fn(), publishReplay: vi.fn() },
      enterReplay,
      setProfileMessage: message,
      setLeaderboardMessage: vi.fn(),
    });
    controller.watch("current-endless");
    expect(enterReplay).toHaveBeenCalledTimes(1);
    controller.watch("old-gauntlet");
    expect(enterReplay).toHaveBeenCalledTimes(1);
    expect(message).toHaveBeenLastCalledWith(`replay unavailable — ${reason}`);

    expect(refuseGhostTheater("ruleset-retired", "root", 0, reason).detail).toBe(
      "This replay was recorded before the Gauntlet became a run of trials.",
    );
  });
});
