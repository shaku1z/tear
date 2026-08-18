import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..", "..");
const readJson = (relativePath: string): unknown => JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));

describe("C40 Hammer terrain Meteor/catch seek evidence registry", () => {
  it("names the narrow non-certifying browser proof", () => {
    const catalog = readJson("src/tearbench/canonical-scenarios.json") as readonly Record<string, unknown>[];
    expect(catalog.find((entry) => entry.id === "hammer-meteor-terrain-catch-seek")).toMatchObject({
      maxTicks: 720,
      testFiles: ["tests/unit/c40-hammer-evidence-registry.test.ts"],
      evidence: {
        command: "pnpm build:test:standalone && node tests/browser-c40-hammer-meteor-ghost-seek.js",
        executionClass: "engineering", certification: "non-certifying",
      },
    });
  });

  it("routes only Hammer terrain transport and V3 seek proof without fabricated graveyard coverage", () => {
    const routes = readJson("src/tearbench/evidence-routes.json") as readonly Record<string, unknown>[];
    expect(routes.find((entry) => entry.id === "hammer-meteor-terrain-replay")).toMatchObject({
      scenarios: ["hammer-meteor-terrain-catch-seek"], graveyardCases: [],
      journeyCheckpoint: "hammer-meteor-terrain-catch-seek-engineering-proof",
      baseComparison: "not-run-by-this-scenario", interactionMatrices: ["browser"],
    });
  });

  it("does not turn this engineering proof into a generated C40 completion rule", () => {
    const catalog = readJson("docs/tearbench-ghost3-evidence-catalog.json") as { rules: readonly Record<string, unknown>[] };
    expect(catalog.rules.find((entry) => entry.id === "EVID-C40-HAMMER-METEOR-SEEK")).toBeUndefined();
  });
});
