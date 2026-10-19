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
  paleEntered: 1,
  auroraTracksActivated: 9,
  bossKills: 7,
  bossNoHit: 1,
});

describe("Verdant/Pale profile envelope compatibility", () => {
  it("retains current profile statistics and extensions alongside versioned receipt support", () => {
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
        schemaVersion: PROFILE_ENVELOPE_VERSION,
        profile: { stats: verdantStats, ach: { boss_rootbound: 1, rootbound_regrowth: 1 } },
        extensions: { future: { retained: true } },
      },
    });
  });

  it("preserves Verdant/Pale statistics and unknown legacy data through current envelope migration", () => {
    const result = migrateProfileEnvelope({ stats: verdantStats, unknownFutureValue: "kept" }, 500);
    expect(result).toMatchObject({
      ok: true,
      migratedFrom: "legacy",
      value: { schemaVersion: PROFILE_ENVELOPE_VERSION, profile: { stats: verdantStats, unknownFutureValue: "kept" } },
    });
  });
});
