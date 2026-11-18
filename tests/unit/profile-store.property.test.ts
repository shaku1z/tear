/**
 * The live profile store (`createProfileStore`), whatever its two storage
 * slots hold (the envelope and the legacy mirror):
 * - loading never throws;
 * - saving and loading again keeps every loaded field, and doing it a second
 *   time changes nothing;
 * - an envelope the store could not read is never overwritten.
 */
import { describe, expect, it } from "vitest";

import { migrateProfileEnvelope, PROFILE_ENVELOPE_VERSION } from "../../src/persistence/profile-envelope";
import { createProfileStore } from "../../src/persistence/profile-store";
import { anyJson, anyStoredText, recordLike } from "./property-arbitraries";
import { checkProperty, fc } from "./property-harness";

function openStore(values: Map<string, string>) {
  return createProfileStore({
    store: { get: (key) => values.get(key) ?? null, set: (key, value) => values.set(key, value) },
    now: () => 1_000,
    getAchievements: () => undefined,
    getMeta: () => undefined,
    writerId: () => "property",
  });
}

const blank = openStore(new Map());
const SLOTS = Object.freeze({ envelope: blank.ENVELOPE_KEY, legacy: blank.KEY });
// The fields a fresh profile has, and the optional ones the store reads and merges.
const PROFILE_FIELDS = [
  ...Object.keys(blank.load()),
  "username",
  "usernameSetAt",
  "pendingFinale",
  "rewards",
  "weaponsWon",
  "advDiffs",
  "tutorialCompletion",
  "achievementOutbox",
];

const profileLike = recordLike(PROFILE_FIELDS);
const envelopeLike = fc
  .tuple(
    recordLike(["revision", "updatedAtMs", "writerId", "extensions", "data"]),
    fc.oneof(profileLike, anyJson),
    fc.oneof(fc.integer({ min: 0, max: PROFILE_ENVELOPE_VERSION + 1 }), anyJson),
  )
  .map(([fields, profile, schemaVersion]) => ({ ...fields, schema: "tear.profile", schemaVersion, profile }));

/** What one storage slot holds: nothing, any text, or a stored profile or envelope. */
const slot = fc.option(
  fc.oneof(
    anyStoredText,
    profileLike.map((value) => JSON.stringify(value)),
    envelopeLike.map((value) => JSON.stringify(value)),
  ),
  { nil: undefined },
);
const storage = fc.record({ envelope: slot, legacy: slot });
type StoredSlots = Readonly<{ envelope: string | undefined; legacy: string | undefined }>;

/** A fresh storage map per run, so the store never writes into the generated (reported) input. */
function fill(slots: StoredSlots): Map<string, string> {
  const values = new Map<string, string>();
  if (slots.envelope !== undefined) values.set(SLOTS.envelope, slots.envelope);
  if (slots.legacy !== undefined) values.set(SLOTS.legacy, slots.legacy);
  return values;
}

describe("profile store", () => {
  it("loads whatever storage holds without throwing", () => {
    checkProperty(
      fc.property(storage, (slots) => {
        const data = openStore(fill(slots)).load();
        expect(typeof data).toBe("object");
      }),
    );
  });

  it("saving then loading keeps everything that was loaded, and a second time changes nothing", () => {
    checkProperty(
      fc.property(storage, (slots) => {
        const values = fill(slots);
        const first = openStore(values);
        // Compared as stored text: JSON writes -0 as 0.
        const loaded = JSON.parse(JSON.stringify(first.load())) as Record<string, unknown>;
        first.save();
        const second = openStore(values);
        const reloaded = JSON.parse(JSON.stringify(second.load())) as Record<string, unknown>;
        // A reload may add a default the migration owns (the empty cosmetics ledger); it never drops or changes a field.
        for (const [field, value] of Object.entries(loaded)) {
          expect(JSON.stringify(reloaded[field]), field).toBe(JSON.stringify(value));
        }
        second.save();
        expect(JSON.stringify(openStore(values).load())).toBe(JSON.stringify(reloaded));
      }),
    );
  });

  it("never overwrites an envelope it could not read", () => {
    checkProperty(
      fc.property(storage, (slots) => {
        const values = fill(slots);
        const before = slots.envelope;
        const store = openStore(values);
        store.load();
        store.save();
        if (before !== undefined && !readable(before)) expect(values.get(SLOTS.envelope)).toBe(before);
      }),
    );
  });
});

/** False for damaged text or an envelope the migration refuses (for example one a newer build wrote). */
function readable(text: string): boolean {
  if (text === "") return true; // an empty slot holds nothing to keep
  try {
    return migrateProfileEnvelope(JSON.parse(text) as unknown).ok;
  } catch {
    return false;
  }
}
