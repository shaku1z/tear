import { describe, expect, it } from "vitest";

import { migrateProfileEnvelope, PROFILE_ENVELOPE_VERSION } from "../../src/persistence/profile-envelope";

const verdantStats = Object.freeze({
  verdantEntered: 1,
  bloomWellsActivated: 4,
  rootLinksSevered: 7,
  graftsDestroyed: 3,
  rootboundKills: 2,
  rootboundNoHitKills: 1,
  regrowthFullInterrupts: 1,
  regrowthPartialInterrupts: 1,
});

describe("Verdant profile envelope compatibility", () => {
  it("keeps the current profile schema because source-owned statistics need no structural migration", () => {
    const result = migrateProfileEnvelope({
      schema: "tear.profile",
      schemaVersion: PROFILE_ENVELOPE_VERSION,
      revision: 12,
      updatedAtMs: 100,
      writerId: "unit",
      profile: { stats: verdantStats, ach: { boss_rootbound: 1, rootbound_regrowth: 1 } },
      extensions: { future: { retained: true } },
    });
    expect(result).toMatchObject({
      ok: true,
      migratedFrom: null,
      value: {
        schemaVersion: 2,
        profile: { stats: verdantStats, ach: { boss_rootbound: 1, rootbound_regrowth: 1 } },
        extensions: { future: { retained: true } },
      },
    });
  });

  it("preserves Verdant statistics in legacy data without publishing a new schema", () => {
    const result = migrateProfileEnvelope({ stats: verdantStats, unknownFutureValue: "kept" }, 500);
    expect(result).toMatchObject({
      ok: true,
      migratedFrom: "legacy",
      value: { schemaVersion: 2, profile: { stats: verdantStats, unknownFutureValue: "kept" } },
    });
  });
});
