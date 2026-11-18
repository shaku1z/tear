import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMusicCatalog } from "../../src/audio/music/catalog";
import { acquireCondition } from "../../src/domain/cosmetics";
import type { UnlockCondition } from "../../src/domain/unlock-condition";
import { ACHIEVEMENT_CATALOG } from "../../src/gameplay/progression/achievement-catalog";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";
import { isBossDefinitionId } from "../../src/gameplay/run/boss-definitions";
import { AUTHORED_STAGES } from "../../src/gameplay/stages";

/** Every condition in the shipped data names something that exists, so a typo is a failing test, not a locked reward. */
function leaves(condition: UnlockCondition): UnlockCondition[] {
  return condition.type === "all" ? condition.of.flatMap(leaves) : [condition];
}

const musicIndex = JSON.parse(readFileSync("public/audio/music.json", "utf8")) as { catalog: unknown };
const music = parseMusicCatalog(musicIndex.catalog);

const sources: readonly (readonly [string, UnlockCondition])[] = [
  ...music.works.flatMap((work) =>
    work.unlock.type === "unreadable" ? [] : [[`music work ${work.id}`, work.unlock] as const],
  ),
  ...COSMETIC_CATALOG.collections.map((collection) => [`collection ${collection.id}`, collection.unlock] as const),
  ...COSMETIC_CATALOG.items.flatMap((item) => (item.unlock ? [[`item ${item.id}`, item.unlock] as const] : [])),
  // An item granted by an achievement or a boss names it in `acquire`; the same reference rules apply.
  ...COSMETIC_CATALOG.items.flatMap((item) =>
    item.acquire.flatMap((entry) => {
      const condition = acquireCondition(entry);
      return condition ? [[`item ${item.id} acquire`, condition] as const] : [];
    }),
  ),
];

describe("conditions in the shipped data", () => {
  it("are all readable by this build in the committed music catalog", () => {
    expect(music.problems).toEqual([]);
    expect(music.works.filter((work) => work.unlock.type === "unreadable")).toEqual([]);
  });

  it("covers music, collections, items and the grants items are acquired by", () => {
    expect(music.works.length).toBeGreaterThan(0);
    expect(sources.length).toBeGreaterThan(music.works.length);
    expect(sources.some(([where]) => where.endsWith(" acquire"))).toBe(true);
  });

  it("name a registered boss, a real stage and an existing achievement", () => {
    const stageNames = new Set(AUTHORED_STAGES.map((stage) => stage.name));
    const achievementIds = new Set(ACHIEVEMENT_CATALOG.map((entry) => entry.id));
    for (const [where, condition] of sources) {
      for (const leaf of leaves(condition)) {
        if (leaf.type === "boss-defeat") expect(isBossDefinitionId(leaf.bossId), `${where}: ${leaf.bossId}`).toBe(true);
        if (leaf.type === "biome-enter") expect(stageNames.has(leaf.biome), `${where}: ${leaf.biome}`).toBe(true);
        if (leaf.type === "achievement") expect(achievementIds.has(leaf.id), `${where}: ${leaf.id}`).toBe(true);
      }
    }
  });
});
