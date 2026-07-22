import { describe, expect, it } from "vitest";
import { resolveEnvelopeConflict } from "../../src/persistence/conflicts";
import { migrateProfileEnvelope, mutableProfileWorkingCopy } from "../../src/persistence/profile-envelope";
import { migrateReplayEnvelope } from "../../src/persistence/replay-envelope";
import { migrateSettingsEnvelope } from "../../src/persistence/settings-envelope";

describe("versioned persistence envelopes", () => {
  it("migrates legacy settings with safe defaults and preserves unknown values", () => {
    const result = migrateSettingsEnvelope({ vol: 0.75, music: false, colorBlindMode: "protanopia" }, 100);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migratedFrom).toBe("legacy");
    expect(result.value.audio.masterVolume).toBe(0.75);
    expect(result.value.audio.musicMuted).toBe(true);
    expect(result.value.audio.interfaceVolume).toBe(1);
    expect(result.value.values.colorBlindMode).toBe("protanopia");
  });

  it("rejects future settings, profile, and replay versions", () => {
    expect(migrateSettingsEnvelope({ schema: "tear.settings", schemaVersion: 99 }).ok).toBe(false);
    expect(migrateProfileEnvelope({ schema: "tear.profile", schemaVersion: 99 }).ok).toBe(false);
    expect(migrateReplayEnvelope({ schema: "tear.replay", schemaVersion: 99 }).ok).toBe(false);
  });

  it("retains current-envelope extension data through validation", () => {
    const result = migrateSettingsEnvelope({
      schema: "tear.settings",
      schemaVersion: 2,
      values: {},
      extensions: { experimental: { enabled: true } },
      futureTopLevel: "kept",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.extensions).toEqual({
      experimental: { enabled: true },
      futureTopLevel: "kept",
    });
  });

  it("wraps a legacy profile without dropping nested or unknown fields", () => {
    const result = migrateProfileEnvelope({ shards: 12, futureFeature: { enabled: true } }, 500);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.profile).toEqual({ shards: 12, futureFeature: { enabled: true } });
    expect(result.value.writerId).toBe("legacy");
    expect(result.value.updatedAtMs).toBe(500);
  });

  it("creates a mutable legacy copy without thawing the canonical envelope", () => {
    const result = migrateProfileEnvelope({ modes: {}, stats: { wins: 1 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const working = mutableProfileWorkingCopy(result.value);
    const modes = working.modes as Record<string, boolean>;
    modes.endless = true;
    expect(modes.endless).toBe(true);
    expect(result.value.profile.modes).toEqual({});
    expect(Object.isFrozen(result.value.profile.modes)).toBe(true);
  });

  it("wraps v2 recordings with explicit deterministic compatibility metadata", () => {
    const result = migrateReplayEnvelope({ v: 2, px: [1, 2], unknownEvent: { type: "future" } }, 700);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.schemaVersion).toBe(3);
    expect(result.value.rulesetVersion).toBe("legacy-replay-v2");
    expect(result.value.recording.unknownEvent).toEqual({ type: "future" });
  });

  it("keeps conflict selection deterministic and outside migrations", () => {
    const local = { revision: 4, updatedAtMs: 20, writerId: "local", value: "a" };
    const remote = { revision: 5, updatedAtMs: 10, writerId: "remote", value: "b" };
    expect(resolveEnvelopeConflict(local, remote)).toMatchObject({ winner: remote, source: "remote", reason: "higher-revision" });
  });
});
