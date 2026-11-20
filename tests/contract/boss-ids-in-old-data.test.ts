// The generic stand-in Boss is gone: placing a boss now throws for any id that is not a boss definition
// (src/gameplay/run/boss-placement.ts). This file proves, from the storage two production releases wrote,
// that nothing a player has can still carry such an id: no save, no replay, no practice encounter and no
// Playground selection.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { BOSS_DEFINITIONS, isBossDefinitionId } from "../../src/gameplay/run/boss-definitions";
import { AUTHORED_BOSS_ROSTER } from "../../src/gameplay/run/content-director";
import { isTearWorldEntityFactoryId } from "../../src/gameplay/runtime/tear-world-entity-construction";
import { isPracticeBossId } from "../../src/gameplay/training/boss-phase-practice-runtime";
import { practiceBossCatalog } from "../../src/gameplay/training/practice-boss-catalog";
import { validateLiveCodecPayload } from "../../src/gameplay/snapshot/validation";

const RELEASES = join(import.meta.dirname, "..", "fixtures", "releases");

interface ExportedStorage {
  readonly localStorage: Readonly<Record<string, string>>;
  readonly indexedDB: Readonly<
    Record<string, { readonly stores: Readonly<Record<string, readonly { value: string }[]>> }>
  >;
}

interface StoredWorlds {
  readonly runs: Readonly<Record<string, unknown>>[];
  readonly factoryIds: string[];
}

/** Every value a release stored, with JSON strings and gzipped Ghost capsule chunks opened. */
function opened(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (text.startsWith("{") || text.startsWith("[")) return JSON.parse(text) as unknown;
  if (text.startsWith("H4sI")) return JSON.parse(gunzipSync(Buffer.from(text, "base64")).toString("utf8")) as unknown;
  return value;
}

/** The run records and entity factory ids in every world a release stored (replay keyframes included). */
function storedWorlds(storage: ExportedStorage): StoredWorlds {
  const found: StoredWorlds = { runs: [], factoryIds: [] };
  const walk = (raw: unknown): void => {
    const value = opened(raw);
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "tear.run.v1" && typeof child === "object" && child !== null)
        found.runs.push(child as Readonly<Record<string, unknown>>);
      if (key === "factoryId" && typeof child === "string") found.factoryIds.push(child);
      walk(child);
    }
  };
  walk(storage.localStorage);
  for (const database of Object.values(storage.indexedDB))
    for (const rows of Object.values(database.stores)) for (const row of rows) walk(row.value);
  return found;
}

const bossIssues = (run: unknown) =>
  validateLiveCodecPayload("tear.run.v1", run).filter((issue) =>
    /^\$\.(curBoss|miniBoss|bossOrder|spawnQueue\[\d+\]\.bossId)$/.test(issue.path),
  );

const releases = readdirSync(RELEASES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("boss ids in old data", () => {
  it("reads the previous and the current production release", () => {
    expect(releases).toEqual(expect.arrayContaining(["2026-08-30-9e7d6a70", "2026-11-13-84761549"]));
  });

  for (const release of releases) {
    const storage = JSON.parse(readFileSync(join(RELEASES, release, "storage.json"), "utf8")) as ExportedStorage;
    const worlds = storedWorlds(storage);

    describe(release, () => {
      it("names only boss definitions in every stored run, saves and replays alike", () => {
        expect(worlds.runs.length, "the release stored no run to check").toBeGreaterThan(0);
        for (const run of worlds.runs) expect(bossIssues(run)).toEqual([]);
      });

      it("builds every stored enemy from a factory this build still has", () => {
        expect(worlds.factoryIds.length, "the release stored no enemy to check").toBeGreaterThan(0);
        expect(worlds.factoryIds.filter((id) => !isTearWorldEntityFactoryId(id))).toEqual([]);
      });

      it("refuses the same stored run once it names a boss that is not defined", () => {
        const run = worlds.runs[0];
        for (const stray of [{ curBoss: "boss" }, { bossOrder: ["warden", "boss"] }, { miniBoss: "mirror" }])
          expect(bossIssues({ ...run, ...stray }), JSON.stringify(stray)).toHaveLength(1);
        expect(bossIssues({ ...run, spawnQueue: [{ type: "miniboss", bossId: "boss" }] })).toHaveLength(1);
      });
    });
  }

  it("refuses an enemy built by the removed generic Boss factory", () => {
    expect(isTearWorldEntityFactoryId("boss")).toBe(false);
  });

  it("offers practice only for boss definitions, whatever a saved profile counts", () => {
    // A profile that counts every encounter, including ones for ids that are not bosses.
    const entries = practiceBossCatalog(() => 1);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter((entry) => !isBossDefinitionId(entry.bossId))).toEqual([]);
    expect(isPracticeBossId("boss")).toBe(false);
  });

  it("lets the Playground summon only boss definitions", () => {
    // The Playground's SUMMON A BOSS choices are this roster (training-host-runtime.ts).
    expect(AUTHORED_BOSS_ROSTER.map((boss) => boss.id)).toEqual(BOSS_DEFINITIONS.map((boss) => boss.id));
  });
});
