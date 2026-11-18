/**
 * The asset manifest (config/asset-manifest.json) must name every asset the game draws, once, by an id in the
 * shared asset id format. These tests hold the shipped manifest to the game's registries and check that the
 * validator names each kind of mistake, so the next enemy, boss or stage object without a row fails here.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import RAW_MANIFEST from "../../config/asset-manifest.json";
import {
  ASSET_MANIFEST,
  bossMoveChecklist,
  readManifest,
  sheetAssets,
  sheetScenes,
} from "../../scripts/asset-sheets/manifest";
import { ROOTBOUND_MOVES } from "../../src/gameplay/entities/enemy-types/rootbound-moves";
import { BOSS_DEFINITIONS } from "../../src/gameplay/run/boss-definitions";
import { VARIANTS } from "../../src/gameplay/variants";

const repository = path.resolve(import.meta.dirname, "../..");
const { manifest, problems } = ASSET_MANIFEST;
const scenes = sheetScenes(manifest);
const assets = sheetAssets(manifest);

interface EditableManifest {
  assets: Record<string, unknown>[];
  categories: Record<string, unknown>[];
}
/** The validator's problems for the shipped manifest with one change. */
function changed(edit: (copy: EditableManifest) => void): string[] {
  const copy: EditableManifest = structuredClone(RAW_MANIFEST);
  edit(copy);
  return readManifest(copy).problems;
}

describe("asset manifest", () => {
  it("covers every registry entry once, with valid unique ids", () => {
    expect(problems).toEqual([]);
  });

  it("uses the shared asset id format (lower case, digits and underscores)", () => {
    expect(manifest.idPattern.source).toBe("^[a-z0-9_]{1,64}$");
  });

  it("names drawing files that exist, for every asset", () => {
    for (const asset of assets) {
      expect(asset.sources.length, `sources of ${asset.id}`).toBeGreaterThan(0);
      for (const file of asset.sources)
        expect(existsSync(path.join(repository, file)), `${asset.id}: ${file}`).toBe(true);
    }
  });

  it("gives every enemy variant its own asset and scene, and every boss a scene per phase", () => {
    for (const [kind, variants] of Object.entries(VARIANTS))
      for (const variant of variants)
        expect(
          assets.some((asset) => asset.subject === kind && asset.name.startsWith(variant.name)),
          `${kind} ${variant.id}`,
        ).toBe(true);
    for (const boss of BOSS_DEFINITIONS)
      expect(scenes.filter((scene) => scene.setup.kind === "boss" && scene.setup.bossId === boss.id)).toHaveLength(3);
    expect(new Set(scenes.map((scene) => scene.id)).size).toBe(scenes.length);
  });

  it("asks a complete run for every move of a boss whose moves are data", () => {
    const rootbound = bossMoveChecklist(manifest).find((entry) => entry.asset === "boss_rootbound");
    expect(rootbound?.moves.map((move) => move.id)).toEqual(ROOTBOUND_MOVES.attacks.map((attack) => attack.id));
  });
});

describe("asset manifest validator", () => {
  it("names a registry entry with no row", () => {
    const found = changed((copy) => {
      copy.assets = copy.assets.filter((row) => row.id !== "enemy_charger");
    });
    expect(found).toContain('enemies: "charger" has no row; add one to the manifest');
  });

  it("names a row that draws nothing the game has", () => {
    const found = changed((copy) => {
      copy.assets.push({ id: "enemy_ghost", category: "enemies", subject: "ghost" });
    });
    expect(found).toContain('enemies: "ghost" is not in the game\'s registry');
  });

  it("names a repeated id, a malformed id and an unknown category", () => {
    const found = changed((copy) => {
      copy.assets.push({ id: "enemy_charger", category: "weapons", subject: "sword" });
      copy.assets.push({ id: "Bad-Id", category: "cosmetics", subject: "x" });
    });
    expect(found).toContain("asset id enemy_charger is used more than once");
    expect(found).toContain("asset id Bad-Id does not match ^[a-z0-9_]{1,64}$");
    expect(found).toContain("asset Bad-Id: unknown category cosmetics");
  });

  it("names an unknown stager, an unknown ally and a bad budget", () => {
    const found = changed((copy) => {
      const enemies = copy.categories.find((category) => category.id === "enemies");
      if (enemies !== undefined) enemies.stager = "dance";
      const priest = copy.assets.find((row) => row.id === "enemy_priest");
      if (priest !== undefined) {
        priest.allies = ["dragon"];
        priest.budget = { pngBytes: -1, gifBytes: 1 };
      }
    });
    expect(found).toContain('category enemies: unknown stager "dance"');
    expect(found).toContain("asset enemy_priest: unknown ally dragon");
    expect(found).toContain("asset enemy_priest.budget.pngBytes must be a positive number");
    expect(found).toContain("asset enemy_priest: unknown budget gifBytes");
  });
});
