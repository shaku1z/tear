import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("game-reference exporter source boundary", () => {
  it("loads pure authored references instead of runtime CONFIG", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/export-game-reference.mjs"), "utf8");
    expect(source).toContain("/src/gameplay/weapon-tuning.ts");
    expect(source).toContain("/src/gameplay/run/difficulty-catalog.ts");
    expect(source).not.toContain("configModule");
    expect(source).not.toContain("CONFIG");
    expect(source).not.toContain("/src/config/game-config.ts");
  });
});
