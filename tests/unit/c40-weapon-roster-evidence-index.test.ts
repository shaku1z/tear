import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..", "..");
const readJson = (relativePath: string): unknown => JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));

type RosterProof = Readonly<{
  weapon: string;
  actionFamily: string;
  scenarioId: string;
  routeId: string;
  command: string;
  receiptLabels: readonly string[];
}>;

describe("C40 weapon-roster engineering evidence index", () => {
  it("aggregates exactly the five named non-certifying action-family proofs", () => {
    const index = readJson("docs/tearbench-c40-weapon-roster-evidence-index.json") as {
      schemaVersion: number;
      kind: string;
      status: string;
      proofs: readonly RosterProof[];
    };
    expect(index).toMatchObject({
      schemaVersion: 1,
      kind: "tearbench-c40-weapon-roster-engineering-index",
      status: "engineering-non-certifying",
    });
    expect(index.proofs.map(({ weapon, actionFamily }) => `${weapon}:${actionFamily}`)).toEqual([
      "sword:reversal-threadcut",
      "hammer:meteor",
      "greatsword:wheelcut",
      "chainblade:hook-sling",
      "riftlock:loose-cannon",
    ]);
  });

  it("points every indexed proof at its canonical non-certifying scenario and narrow route", () => {
    const index = readJson("docs/tearbench-c40-weapon-roster-evidence-index.json") as { proofs: readonly RosterProof[] };
    const scenarios = readJson("src/tearbench/canonical-scenarios.json") as readonly Record<string, unknown>[];
    const routes = readJson("src/tearbench/evidence-routes.json") as readonly Record<string, unknown>[];
    for (const proof of index.proofs) {
      const scenario = scenarios.find((entry) => entry.id === proof.scenarioId);
      const route = routes.find((entry) => entry.id === proof.routeId);
      expect(scenario).toMatchObject({
        id: proof.scenarioId,
        evidence: { command: proof.command, executionClass: "engineering", certification: "non-certifying" },
      });
      expect(route).toMatchObject({
        id: proof.routeId,
        scenarios: [proof.scenarioId],
        graveyardCases: [],
        baseComparison: "not-run-by-this-scenario",
        interactionMatrices: ["browser"],
      });
      expect(proof.receiptLabels.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("does not overclaim C40 completion or create generated certification coverage", () => {
    const index = readJson("docs/tearbench-c40-weapon-roster-evidence-index.json") as { nonClaims: readonly string[] };
    const evidenceCatalog = readJson("docs/tearbench-ghost3-evidence-catalog.json") as { rules: readonly { id: string }[] };
    const dashboard = readFileSync(resolve(root, "docs/TEARBENCH_GHOST3_CAPABILITY_DASHBOARD.md"), "utf8");
    expect(index.nonClaims.join(" ")).toMatch(/not a C40 completion.*performance.*parity.*accessibility/iu);
    expect(index.nonClaims.join(" ")).toMatch(/does not add a generated evidence-catalog rule.*generated C40 dashboard/iu);
    expect(evidenceCatalog.rules.filter((rule) => rule.id.startsWith("EVID-C40-"))).toEqual([]);
    expect(dashboard).toContain("| C40 | 76 | 76 | 0 | 0 | 0 | 0 | 0 |");
  });
});
