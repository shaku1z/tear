import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..", "..");
const readJson = (relativePath: string): unknown => JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));

describe("C40 Sword Reversal/Threadcut/catch seek evidence registry", () => {
  it("names the narrow non-certifying browser proof", () => {
    const catalog = readJson("src/tearbench/canonical-scenarios.json") as readonly Record<string, unknown>[];
    expect(catalog.find((entry) => entry.id === "sword-reversal-threadcut-catch-seek")).toMatchObject({
      maxTicks: 720, testFiles: ["tests/unit/c40-sword-evidence-registry.test.ts"],
      evidence: { command: "pnpm build:test:standalone && node tests/browser-c40-sword-crosscut-ghost-seek.js", executionClass: "engineering", certification: "non-certifying" },
    });
  });
  it("routes only Sword transport and V3 seek proof without fabricated graveyard coverage", () => {
    const routes = readJson("src/tearbench/evidence-routes.json") as readonly Record<string, unknown>[];
    expect(routes.find((entry) => entry.id === "sword-reversal-threadcut-replay")).toMatchObject({ scenarios: ["sword-reversal-threadcut-catch-seek"], graveyardCases: [], journeyCheckpoint: "sword-reversal-threadcut-catch-seek-engineering-proof", baseComparison: "not-run-by-this-scenario", interactionMatrices: ["browser"] });
  });
  it("does not turn this engineering proof into a generated C40 completion rule", () => {
    const catalog = readJson("docs/tearbench-ghost3-evidence-catalog.json") as { rules: readonly Record<string, unknown>[] };
    expect(catalog.rules.find((entry) => entry.id === "EVID-C40-SWORD-SEAM-CROSSCUT-SEEK")).toBeUndefined();
  });
});
