import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..", "..");
const readJson = (relativePath: string): unknown => JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));

describe("C40 Source void hazard seek evidence registry", () => {
  it("names the narrow browser proof and its non-retained engineering artifact", () => {
    const catalog = readJson("src/tearbench/canonical-scenarios.json") as readonly Record<string, unknown>[];
    const scenario = catalog.find((entry) => entry.id === "source-void-hazard-seek");
    expect(scenario).toMatchObject({
      id: "source-void-hazard-seek",
      maxTicks: 720,
      testFiles: ["tests/unit/c40-source-void-evidence-registry.test.ts"],
      evidence: {
        command: "pnpm build:test:standalone && node tests/browser-c40-source-void-ghost-seek.js",
        executionClass: "engineering",
        certification: "non-certifying",
      },
    });
    expect(String((scenario?.evidence as Record<string, unknown>).artifact)).toMatch(/verified Ghost V3 capsule.*three fresh production-world seek receipts/iu);
    expect(String((scenario?.evidence as Record<string, unknown>).artifactRetention)).toMatch(/does not retain a checked-in release artifact/iu);
  });

  it("routes Source handoff changes to the evidence without broad matrices or fabricated graveyard coverage", () => {
    const routes = readJson("src/tearbench/evidence-routes.json") as readonly Record<string, unknown>[];
    const route = routes.find((entry) => entry.id === "source-void-replay");
    expect(route).toEqual({
      id: "source-void-replay",
      prefixes: ["src/gameplay/campaign/source-void-", "src/app/live-source-void-", "src/tearbench/canonical-scenarios.json", "src/tearbench/evidence-routes.json", "tests/browser-c40-source-void-ghost-seek.js", "tests/browser-c40-state-forge-source-void.js", "tests/unit/c40-source-void-evidence-registry.test.ts"],
      scenarios: ["source-void-hazard-seek"],
      graveyardCases: [],
      journeyCheckpoint: "source-void-hazard-seek-engineering-proof",
      baseComparison: "not-run-by-this-scenario",
      interactionMatrices: ["browser"],
    });
  });

  it("does not create an ungenerated C40 completion mapping", () => {
    const catalog = readJson("docs/tearbench-ghost3-evidence-catalog.json") as { rules: readonly Record<string, unknown>[] };
    const rule = catalog.rules.find((entry) => entry.id === "EVID-C40-SOURCE-VOID-HAZARD-SEEK");
    expect(rule).toBeUndefined();
  });
});
