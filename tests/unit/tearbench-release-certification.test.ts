import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  OPERATIONAL_METRICS,
  buildOperationalDashboard,
  createPreservationManifest,
  resolvePreservedRuntime,
  selectDiffAwareEvidence,
  TEAR_EVIDENCE_SELECTOR_AUTHORITY,
  type EvidenceSelection,
  type EvidenceRoute,
} from "../../src/tearbench/release-certification";

function preservation() {
  return createPreservationManifest({
    runtimes: [
      { buildId: "ghost-v3-launch", packageHash: "runtime-hash", verificationProfile: "command-state", playback: "exact", status: "supported" },
      { buildId: "ghost-v2-legacy", packageHash: "legacy-hash", verificationProfile: "visual", playback: "visual-only", status: "retired" },
    ],
    aliases: [{ alias: "current-ranked", targetId: "ghost-v3-launch" }],
    tombstones: [{ id: "removed-beta-id", reason: "invalid beta identity", replacementId: "ghost-v3-launch" }],
    migrations: [{ id: "v2-v3", fromVersion: 2, toVersion: 3, inputHash: "input", expectedHash: "output" }],
    goldenReplays: [
      { id: "launch-command", buildId: "ghost-v3-launch", capsuleRootHash: "root", expectedStatus: "verified" },
      { id: "legacy-visual", buildId: "ghost-v2-legacy", capsuleRootHash: "legacy-root", expectedStatus: "visual-only" },
    ],
  });
}

const routes: readonly EvidenceRoute[] = [{
  id: "combat",
  prefixes: ["src/gameplay/combat/", "src/gameplay/entities/"],
  scenarios: ["enemy-contact"],
  graveyardCases: ["planted-downstream-divergence"],
  journeyCheckpoint: "normal-adventure-wave",
  baseComparison: "oracle-ee5e931",
  interactionMatrices: ["input", "frame-rate"],
}, {
  id: "shared-runtime",
  prefixes: ["src/simulation/", "src/tearbench/"],
  scenarios: ["deterministic-render-rate"],
  graveyardCases: ["all-shared-runtime"],
  journeyCheckpoint: "menu-to-menu-smoke",
  baseComparison: "main-base",
  interactionMatrices: ["browser", "platform", "frame-rate"],
}];

function readStaticRoutes(path: string): EvidenceRoute[] {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("evidence route fixture must be an array");
  return parsed.map((value): EvidenceRoute => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("evidence route fixture entry must be an object");
    }
    const route = { ...(value as Record<string, unknown>) };
    delete route.scenarioSubjects;
    return route as unknown as EvidenceRoute;
  });
}

function commonSelection(selection: {
  changedFiles: readonly string[]; routes: readonly string[]; scenarios: readonly string[];
  graveyardCases: readonly string[]; journeyCheckpoints: readonly string[]; baseComparisons: readonly string[];
  interactionMatrices: readonly string[]; unrelatedUnitTestsAreGameplayEvidence: false;
}) {
  return {
    changedFiles: [...selection.changedFiles], routes: [...selection.routes], scenarios: [...selection.scenarios],
    graveyardCases: [...selection.graveyardCases], journeyCheckpoints: [...selection.journeyCheckpoints],
    baseComparisons: [...selection.baseComparisons], interactionMatrices: [...selection.interactionMatrices],
    unrelatedUnitTestsAreGameplayEvidence: selection.unrelatedUnitTestsAreGameplayEvidence,
  };
}

function executableProjection(changedFiles: readonly string[]) {
  const repositoryRoot = resolve(import.meta.dirname, "../..");
  const temporaryRoot = mkdtempSync(join(tmpdir(), "tearbench-selector-boundary-"));
  try {
    const fixtureRoutes = readStaticRoutes(resolve(repositoryRoot, "src/tearbench/evidence-routes.json"));
    const fixturePath = join(temporaryRoot, "routes.json");
    const artifactPath = join(temporaryRoot, "selection.json");
    writeFileSync(fixturePath, `${JSON.stringify(fixtureRoutes)}\n`, "utf8");
    execFileSync(process.execPath, [resolve(repositoryRoot, "scripts/tearbench.mjs"), "select",
      "--files", changedFiles.join(","), "--routes", fixturePath, "--artifact", artifactPath],
    { cwd: repositoryRoot, stdio: "pipe" });
    return JSON.parse(readFileSync(artifactPath, "utf8")) as EvidenceSelection;
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

describe("TearBench release certification", () => {
  it("preserves supported, retired, aliased, and tombstoned runtime identities honestly", () => {
    const manifest = preservation();
    expect(resolvePreservedRuntime(manifest, "current-ranked")).toMatchObject({ status: "supported", buildId: "ghost-v3-launch" });
    expect(resolvePreservedRuntime(manifest, "ghost-v2-legacy")).toMatchObject({ status: "retired", buildId: "ghost-v2-legacy" });
    expect(resolvePreservedRuntime(manifest, "removed-beta-id")).toMatchObject({ status: "tombstoned" });
    expect(resolvePreservedRuntime(manifest, "unknown")).toEqual({ status: "unsupported", reason: "historical runtime is not preserved" });
  });

  it("rejects alias cycles, ID reuse, and golden verification without a supported runtime", () => {
    expect(() => createPreservationManifest({
      runtimes: [],
      aliases: [{ alias: "a", targetId: "b" }, { alias: "b", targetId: "a" }],
      tombstones: [],
      migrations: [],
      goldenReplays: [],
    })).toThrow();
    expect(() => createPreservationManifest({
      runtimes: [{ buildId: "old", packageHash: "x", verificationProfile: "visual", playback: "visual-only", status: "retired" }],
      aliases: [],
      tombstones: [],
      migrations: [],
      goldenReplays: [{ id: "lie", buildId: "old", capsuleRootHash: "x", expectedStatus: "verified" }],
    })).toThrow("supported runtime");
  });

  it("builds complete operational health without hiding missing metrics", () => {
    expect(buildOperationalDashboard([]).status).toBe("incomplete");
    const dashboard = buildOperationalDashboard(OPERATIONAL_METRICS.map((name) => ({
      name,
      value: 1,
      warningBelow: 0,
      warningAbove: 2,
    })));
    expect(dashboard.status).toBe("healthy");
    expect(dashboard.cards).toHaveLength(8);
  });

  it("selects scenario, Graveyard, journey, comparison, and matrix evidence from a combat diff", () => {
    const selection = selectDiffAwareEvidence(["src\\gameplay\\combat\\kill-runtime.ts"], routes);
    expect(selection).toMatchObject({
      routes: ["combat"],
      scenarios: ["enemy-contact"],
      graveyardCases: ["planted-downstream-divergence"],
      journeyCheckpoints: ["normal-adventure-wave"],
      baseComparisons: ["oracle-ee5e931"],
      interactionMatrices: ["frame-rate", "input"],
      unrelatedUnitTestsAreGameplayEvidence: false,
    });
  });

  it.each([
    [["src/gameplay/combat/kill-runtime.ts", "src/unmapped/new-runtime-boundary.ts"]],
    [["docs/example.md", "src/unmapped/new-runtime-boundary.ts"]],
  ])("keeps the TS compatibility projection aligned with executable selector for %j", (changedFiles) => {
    const projection = selectDiffAwareEvidence(changedFiles, readStaticRoutes(
      resolve(import.meta.dirname, "../../src/tearbench/evidence-routes.json"),
    ));
    expect(commonSelection(projection)).toEqual(commonSelection(executableProjection(changedFiles)));
  });

  it("marks the TS API as a projection and keeps executable selector authority explicit", () => {
    expect(TEAR_EVIDENCE_SELECTOR_AUTHORITY).toBe("scripts/tearbench.mjs");
  });

});
