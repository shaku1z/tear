import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_METRICS,
  buildOperationalDashboard,
  createPreservationManifest,
  resolvePreservedRuntime,
  selectDiffAwareEvidence,
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

});
