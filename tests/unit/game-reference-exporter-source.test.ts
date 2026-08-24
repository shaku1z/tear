import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("game-reference exporter source boundary", () => {
  it("loads pure authored references instead of runtime CONFIG", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/export-game-reference.mjs"), "utf8");
    const directLoads = [...source.matchAll(/ssrLoadModule\(["']([^"']+)["']\)/gu)].map((match) => match[1]);
    expect(directLoads).toEqual([
      "/src/game-reference/game-reference.ts",
      "/src/gameplay/weapons.ts",
      "/src/gameplay/upgrades.ts",
      "/src/gameplay/progression/achievement-catalog.ts",
      "/src/gameplay/run/content-director.ts",
      "/src/gameplay/variants.ts",
      "/src/gameplay/affixes.ts",
      "/src/gameplay/run/boss-definitions.ts",
      "/src/gameplay/stages.ts",
      "/src/gameplay/run/mode-catalog.ts",
      "/src/gameplay/weapon-tuning.ts",
      "/src/gameplay/run/difficulty-catalog.ts",
    ]);
    expect(source).not.toContain("configModule");
    expect(source).not.toContain("CONFIG");
    expect(source).not.toContain("/src/config/game-config.ts");
  });
});
