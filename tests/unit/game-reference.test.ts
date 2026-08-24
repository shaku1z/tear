import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { canonicalStringify } from "../../src/replay/hash";
import {
  assertCurrentSourceSha,
  assertCleanSourceIdentity,
  assertValidGameReferenceV1,
  buildGameReferenceV1,
  encodeGameReferenceV1,
  type GameReferenceV1,
} from "../../src/game-reference/game-reference";
import { WEAPONS, type WeaponDefinition } from "../../src/gameplay/weapons";

const tuningByWeapon = Object.fromEntries(Object.entries(CONFIG.weapons).map(([id, tuning]) => [id, Object.fromEntries(Object.entries(tuning))]));
const firstWeapon = WEAPONS.at(0);
if (firstWeapon === undefined) throw new Error("Final Five source is empty");

function reference(sourceSha = "a".repeat(40), weapons: readonly WeaponDefinition[] = WEAPONS): GameReferenceV1 {
  return buildGameReferenceV1({
    repository: "shaku1z/tear",
    sourceSha,
    terminologyVersion: "g4-terminology-v1",
    weapons,
    tuningByWeapon,
  });
}

function assertJsonSafe(value: unknown, path = "$"): void {
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") throw new Error(`${path} is not JSON-safe`);
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${path} is not finite`);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => { assertJsonSafe(entry, `${path}[${String(index)}]`); });
  } else if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => { assertJsonSafe(entry, `${path}.${key}`); });
  }
}

describe("game-reference.v1", () => {
  it("projects the canonical Final Five and explicitly defers unsupported collections", () => {
    const result = reference();

    expect(result.format).toBe("game-reference.v1");
    expect(result.schemaVersion).toBe(1);
    expect(result.source).toEqual({ repository: "shaku1z/tear", sha: "a".repeat(40) });
    expect(result.roster.activeWeaponIds).toEqual(["sword", "hammer", "greatsword", "chainblade", "riftlock"]);
    expect(result.roster.retiredWeaponIds).toEqual(["spear", "ringblade"]);
    expect(result.collections.weapons.items.map((weapon) => weapon.id)).toEqual(result.roster.activeWeaponIds);
    expect(result.collections.weapons.items.every((weapon) => weapon.mechanics.length > 0)).toBe(true);
    expect(result.collections.weapons.items.find((weapon) => weapon.id === "riftlock")?.tuning.chambers).toBe(4);
    expect(result.deferredCollections.map((entry) => entry.id)).toEqual([
      "upgrades", "enemies", "bosses", "stages", "modes", "achievements", "public-tuning",
    ]);
  });

  it("is deterministic even when the typed source definitions arrive in another order", () => {
    const first = encodeGameReferenceV1(reference());
    const reordered = encodeGameReferenceV1(reference("a".repeat(40), WEAPONS.slice().reverse()));
    expect(reordered).toBe(first);
  });

  it("contains no callbacks, browser objects, undefined values, or non-finite numbers", () => {
    const result = reference();
    expect(() => { assertJsonSafe(result); }).not.toThrow();
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(() => encodeGameReferenceV1(result)).not.toThrow();
  });

  it("rejects duplicate, retired, and incomplete rosters before exporting", () => {
    const duplicate = [...WEAPONS.slice(0, -1), firstWeapon];
    expect(() => reference("a".repeat(40), duplicate)).toThrow(/exactly|duplicate/u);

    const retired = { ...firstWeapon, id: "spear" } as unknown as WeaponDefinition;
    expect(() => reference("a".repeat(40), [retired, ...WEAPONS.slice(1)])).toThrow(/retired/u);

    const incomplete = WEAPONS.slice(0, -1);
    expect(() => reference("a".repeat(40), incomplete)).toThrow(/exactly|missing/u);
  });

  it("rejects stale or abbreviated source generations", () => {
    const result = reference();
    expect(() => { assertCurrentSourceSha(result, "b".repeat(40)); }).toThrow(/stale game reference/u);
    expect(() => { assertCurrentSourceSha(result, "a".repeat(7)); }).toThrow(/full 40-character/u);
    expect(() => reference("a".repeat(7))).toThrow(/full 40-character/u);
  });

  it("binds the contract to the canonical game repository", () => {
    expect(() => buildGameReferenceV1({
      repository: "shaku1z/tear-wiki",
      sourceSha: "a".repeat(40),
      terminologyVersion: "g4-terminology-v1",
      weapons: WEAPONS,
      tuningByWeapon,
    })).toThrow(/repository must be shaku1z\/tear/u);
  });

  it("requires a clean source tree and an exact HEAD SHA for export", () => {
    const sha = "a".repeat(40);
    expect(assertCleanSourceIdentity({ headSha: sha, requestedSha: sha, status: "" })).toBe(sha);
    expect(() => assertCleanSourceIdentity({ headSha: sha, requestedSha: sha, status: " M src/gameplay/weapons.ts" })).toThrow(/clean worktree/u);
    expect(() => assertCleanSourceIdentity({ headSha: sha, requestedSha: "b".repeat(40), status: "" })).toThrow(/equal HEAD/u);
  });

  it("rejects a runtime callback accidentally entering the projected mechanics", () => {
    const unsafe = { ...firstWeapon, mechanics: [(() => undefined) as unknown as string] } as unknown as WeaponDefinition;
    expect(() => reference("a".repeat(40), [unsafe, ...WEAPONS.slice(1)])).toThrow(/non-empty string/u);
  });

  it("validates every imported weapon field instead of trusting IDs alone", () => {
    const malformed = structuredClone(reference()) as unknown as { collections: { weapons: { items: Record<string, unknown>[] } } };
    const weapon = malformed.collections.weapons.items.at(0);
    if (weapon === undefined) throw new Error("missing weapon fixture");
    weapon.ratings = {};
    expect(() => { assertValidGameReferenceV1(malformed); }).toThrow(/ratings/u);

    const malformedMechanics = structuredClone(reference()) as unknown as { collections: { weapons: { items: Record<string, unknown>[] } } };
    const mechanicsWeapon = malformedMechanics.collections.weapons.items.at(0);
    if (mechanicsWeapon === undefined) throw new Error("missing weapon fixture");
    mechanicsWeapon.mechanics = [];
    expect(() => { assertValidGameReferenceV1(malformedMechanics); }).toThrow(/mechanics/u);

    const malformedTuning = structuredClone(reference()) as unknown as { collections: { weapons: { items: Record<string, unknown>[] } } };
    const tuningWeapon = malformedTuning.collections.weapons.items.at(0);
    if (tuningWeapon === undefined) throw new Error("missing weapon fixture");
    tuningWeapon.tuning = {};
    expect(() => { assertValidGameReferenceV1(malformedTuning); }).toThrow(/tuning/u);
  });

  it("binds imported provenance and terminology to their supported values", () => {
    const wrongRepository = structuredClone(reference()) as unknown as { source: { repository: string } };
    wrongRepository.source.repository = "shaku1z/tear-wiki";
    expect(() => { assertValidGameReferenceV1(wrongRepository); }).toThrow(/source repository/u);

    const wrongTerminology = structuredClone(reference()) as unknown as { terminologyVersion: string };
    wrongTerminology.terminologyVersion = "unsupported-terminology-v9";
    expect(() => { assertValidGameReferenceV1(wrongTerminology); }).toThrow(/terminologyVersion/u);
  });

  it("rejects duplicate or unknown deferred collection IDs", () => {
    const duplicate = structuredClone(reference()) as unknown as { deferredCollections: { id: string }[] };
    const first = duplicate.deferredCollections.at(0);
    const second = duplicate.deferredCollections.at(1);
    if (first === undefined || second === undefined) throw new Error("missing deferred fixture");
    second.id = first.id;
    expect(() => { assertValidGameReferenceV1(duplicate); }).toThrow(/duplicated/u);

    const unknown = structuredClone(reference()) as unknown as { deferredCollections: { id: string }[] };
    const last = unknown.deferredCollections.at(-1);
    if (last === undefined) throw new Error("missing deferred fixture");
    last.id = "future-collection";
    expect(() => { assertValidGameReferenceV1(unknown); }).toThrow(/not canonical/u);
  });

  it("does not let canonical JSON silently drop unsafe values", () => {
    expect(() => canonicalStringify({ dropped: undefined })).toThrow(/undefined/u);
    expect(() => canonicalStringify({ callback: () => undefined })).toThrow(/canonical JSON/u);
  });

  it("fails closed when an imported artifact activates a retired ID", () => {
    const imported = structuredClone(reference()) as unknown as { roster: { activeWeaponIds: string[] } };
    imported.roster.activeWeaponIds[0] = "spear";
    expect(() => { assertValidGameReferenceV1(imported); }).toThrow(/retired|missing canonical/u);
  });
});
