import { describe, expect, it } from "vitest";
import { AFFIXES } from "../../src/gameplay/affixes";
import {
  assertNoPreviewContent,
  assertWikiCoverage,
  measureAffix,
  type WikiCatalogKey,
  type WikiDataV1,
} from "../../src/game-reference/wiki-data";

const affix = (id: string) => {
  const found = AFFIXES.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`missing affix ${id}`);
  return found;
};

describe("wiki data projection", () => {
  it("measures affix effects by applying the real affix", () => {
    expect(measureAffix(affix("tank"), "charger")).toEqual([
      { stat: "maxHp", kind: "multiply", value: 1.8 },
      { stat: "weight", kind: "multiply", value: 1.7 },
    ]);
    expect(measureAffix(affix("volley"), "ranged")).toEqual([{ stat: "volley", kind: "set", value: 3 }]);
    expect(measureAffix(affix("warded"), "charger")).toEqual([{ stat: "shield", kind: "share-of-max-hp", value: 0.6 }]);
  });

  it("rejects a document that mentions preview-only content", () => {
    const document = { enemies: [{ id: "rimehound" }] } as unknown as WikiDataV1;
    expect(() => {
      assertNoPreviewContent(document, ["rimehound"]);
    }).toThrow(/preview content: rimehound/u);
    expect(() => {
      assertNoPreviewContent(document, ["white-hart"]);
    }).not.toThrow();
  });

  it("fails when the game defines an entity the document does not describe", () => {
    const document = {
      weapons: [{ id: "sword" }],
      upgrades: [],
      enemies: [{ id: "charger" }],
      affixes: [],
      bosses: [],
      stages: [],
      modes: [],
      achievements: [],
      shop: { items: [] },
    } as unknown as WikiDataV1;
    const catalog = (enemies: readonly string[]): Record<WikiCatalogKey, readonly string[]> => ({
      weapons: ["sword"],
      upgrades: [],
      enemies,
      affixes: [],
      bosses: [],
      stages: [],
      modes: [],
      achievements: [],
      shop: [],
    });
    expect(() => {
      assertWikiCoverage(document, catalog(["charger", "rootbinder"]), []);
    }).toThrow("missing game content: enemies/rootbinder");
    expect(() => {
      assertWikiCoverage(document, catalog(["charger", "rimehound"]), ["rimehound"]);
    }).not.toThrow();
  });
});
