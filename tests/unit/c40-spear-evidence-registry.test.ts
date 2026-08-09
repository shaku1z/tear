import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const root = resolve(import.meta.dirname, "..", "..");
const readJson = (path: string): unknown => JSON.parse(readFileSync(resolve(root, path), "utf8"));
describe("C40 Spear Anchor/Reel/catch seek evidence registry", () => {
  it("names the narrow non-certifying browser proof", () => {
    const catalog = readJson("src/tearbench/canonical-scenarios.json") as readonly Record<string, unknown>[];
    expect(catalog.find((entry) => entry.id === "spear-anchor-reel-catch-seek")).toMatchObject({ maxTicks: 720, testFiles: ["tests/unit/c40-spear-evidence-registry.test.ts"], evidence: { command: "pnpm build:test:standalone && node tests/browser-c40-spear-anchor-reel-ghost-seek.js", executionClass: "engineering", certification: "non-certifying" } });
  });
  it("routes only the Spear transport and V3 seek proof", () => {
    const routes = readJson("src/tearbench/evidence-routes.json") as readonly Record<string, unknown>[];
    expect(routes.find((entry) => entry.id === "spear-anchor-reel-replay")).toMatchObject({ scenarios: ["spear-anchor-reel-catch-seek"], graveyardCases: [], journeyCheckpoint: "spear-anchor-reel-catch-seek-engineering-proof", baseComparison: "not-run-by-this-scenario", interactionMatrices: ["browser"] });
  });
  it("does not turn this engineering proof into a generated C40 completion rule", () => {
    const catalog = readJson("docs/tearbench-ghost3-evidence-catalog.json") as { rules: readonly Record<string, unknown>[] };
    expect(catalog.rules.find((entry) => entry.id === "EVID-C40-SPEAR-ANCHOR-REEL-SEEK")).toBeUndefined();
  });
});
