/**
 * Every stored-data envelope migration in `src/persistence` (profile, settings,
 * replay, and any added later under the same `migrate<Name>Envelope` name):
 * - never throws, whatever it is given;
 * - is idempotent: migrating its own output, or that output read back from
 *   storage text, gives the same envelope and reports nothing to migrate.
 */
import { describe, expect, it } from "vitest";

import { migrateAudioSettings } from "../../src/persistence/audio-settings";
import * as persistence from "../../src/persistence";
import type { MigrationResult } from "../../src/persistence/result";
import { anyJson, anyValue, recordLike } from "./property-arbitraries";
import { checkProperty, fc } from "./property-harness";

type EnvelopeMigration = (input: unknown, nowMs?: number) => MigrationResult<Record<string, unknown>>;

// Read as `unknown` values: the predicate names the migrations, and no other export's type has to fit one.
const EXPORTS: [string, unknown][] = Object.entries(persistence);
const MIGRATIONS = EXPORTS.filter((entry): entry is [string, EnvelopeMigration] =>
  /^migrate\w+Envelope$/u.test(entry[0]),
).map(([name, migrate]) => {
  const empty = migrate({ schema: "probe" }, 0);
  if (!empty.ok) throw new Error(`${name} must accept an empty legacy record`);
  // The envelope's own fields, the legacy alias `data` and the legacy replay version `v`.
  const fields = [...Object.keys(empty.value), "data", "v"];
  const current = Number(empty.value.schemaVersion);
  // Versions from 0 to one past the current one, so every version path (and the refusal of a newer one) is met.
  const envelope = fc
    .tuple(
      recordLike(fields),
      fc.oneof(fc.constant(empty.value.schema), anyJson),
      fc.oneof(fc.integer({ min: 0, max: current + 1 }), anyJson),
    )
    .map(([fieldsOf, schema, schemaVersion]) => ({ ...fieldsOf, schema, schemaVersion }));
  return { name, migrate, envelope };
});

describe("stored-data envelope migrations", () => {
  it("finds the migrations it checks", () => {
    expect(MIGRATIONS.map((entry) => entry.name).sort()).toEqual(
      expect.arrayContaining(["migrateProfileEnvelope", "migrateReplayEnvelope", "migrateSettingsEnvelope"]),
    );
  });

  describe.each(MIGRATIONS)("$name", ({ migrate, envelope }) => {
    it("never throws on any value", () => {
      checkProperty(
        fc.property(fc.oneof(anyValue, anyJson, envelope), fc.nat(), (input, nowMs) => {
          const result = migrate(input, nowMs);
          expect(typeof result.ok).toBe("boolean");
        }),
      );
    });

    it("is idempotent, also through storage text", () => {
      checkProperty(
        fc.property(fc.oneof(anyJson, envelope), fc.nat(), fc.nat(), (input, nowMs, laterMs) => {
          const first = migrate(input, nowMs);
          if (!first.ok) return;
          const again = migrate(first.value, laterMs);
          expect(again).toEqual({ ok: true, migratedFrom: null, value: first.value });
          // Storage keeps text, so the stored copy is compared as text (JSON writes -0 as 0).
          const text = JSON.stringify(first.value);
          const stored = migrate(JSON.parse(text) as unknown, laterMs);
          expect(stored.ok && stored.migratedFrom).toBe(null);
          expect(stored.ok && JSON.stringify(stored.value)).toBe(text);
        }),
      );
    });
  });
});

describe("migrateAudioSettings", () => {
  it("never throws and is idempotent", () => {
    checkProperty(
      fc.property(fc.oneof(anyValue, anyJson, recordLike(Object.keys(migrateAudioSettings({})))), (input) => {
        const first = migrateAudioSettings(input);
        expect(migrateAudioSettings(first)).toEqual(first);
        const text = JSON.stringify(first);
        expect(JSON.stringify(migrateAudioSettings(JSON.parse(text) as unknown))).toBe(text);
      }),
    );
  });
});
