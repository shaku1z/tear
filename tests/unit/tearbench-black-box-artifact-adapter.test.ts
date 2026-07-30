import { describe, expect, it } from "vitest";

import {
  BLACK_BOX_ARTIFACT_INTEGRITY_ALGORITHM,
  createBlackBoxArtifactCertificationReport,
  createBlackBoxAttemptArtifact,
  importBlackBoxAttemptArtifact,
  type BlackBoxAttemptArtifactDraft,
} from "../../src/tearbench/black-box-artifact-adapter";

function draft(id: string, overrides: Partial<BlackBoxAttemptArtifactDraft> = {}): BlackBoxAttemptArtifactDraft {
  return {
    format: "tearbench-class-c-attempt-artifact", schemaVersion: 1,
    id, recordedAt: "2026-07-28T00:00:00.000Z", buildId: "standalone-production", policyId: "visual-v1",
    executionClass: "black-box", observationClass: "pixel-only", physicalInput: "keyboard-mouse",
    kind: "terminal-trace", terminal: "victory",
    journey: { mode: "adventure", difficulty: "normal", startedAtMenu: true, returnedToMenu: true },
    artifacts: {
      inputTrace: { path: `artifacts/${id}.input.json`, sha256: "a".repeat(64) },
      observationTrace: { path: `artifacts/${id}.pixels.json`, sha256: "b".repeat(64) },
      finalScreenshot: { path: `artifacts/${id}.png`, sha256: "c".repeat(64) },
    },
    ...overrides,
  };
}

describe("C25 Class-C artifact adapter", () => {
  it("classifies only an integrity-bound complete Normal Adventure menu-to-menu terminal trace as success", () => {
    const artifact = createBlackBoxAttemptArtifact(draft("victory"));
    const imported = importBlackBoxAttemptArtifact(artifact);
    expect(imported).toMatchObject({ accepted: true, attempt: { outcome: "success", executionClass: "black-box", observationClass: "pixel-only" } });
    if (imported.accepted) expect(imported.attempt.artifacts.inputTrace).toContain("#sha256=");
  });

  it("represents a partial smoke as incomplete even if it carries a victory-shaped terminal field", () => {
    const artifact = createBlackBoxAttemptArtifact(draft("partial", { kind: "partial-smoke", terminal: "victory" }));
    const imported = importBlackBoxAttemptArtifact(artifact);
    expect(imported).toMatchObject({ accepted: true, attempt: { outcome: "incomplete" } });
    const report = createBlackBoxArtifactCertificationReport({ artifacts: [artifact] });
    expect(report).toMatchObject({ artifactReportKind: "all-attempts-incomplete", certification: { disposition: "incomplete", successes: 0, incompleteAttempts: 1, certified: false } });
  });

  it("keeps every partial smoke incomplete even when its producer labels a failure-looking terminal", () => {
    const artifact = createBlackBoxAttemptArtifact(draft("partial-failure", { kind: "partial-smoke", terminal: "failure" }));
    expect(importBlackBoxAttemptArtifact(artifact)).toMatchObject({ accepted: true, attempt: { outcome: "incomplete" } });
  });

  it("retains failed and incomplete accepted launches in their certification denominator", () => {
    const failure = createBlackBoxAttemptArtifact(draft("failure", { terminal: "failure" }));
    const incomplete = createBlackBoxAttemptArtifact(draft("incomplete", { terminal: "incomplete" }));
    const report = createBlackBoxArtifactCertificationReport({ artifacts: [failure, incomplete] });
    expect(report.certification).toMatchObject({ denominator: 2, successes: 0, failures: 1, incompleteAttempts: 1, disposition: "incomplete" });
    expect(report.artifactReportKind).toBe("mixed-evidence");
  });

  it("does not promote a terminal victory that did not complete the required menu-to-menu journey", () => {
    const artifact = createBlackBoxAttemptArtifact(draft("not-returned", {
      journey: { mode: "adventure", difficulty: "normal", startedAtMenu: true, returnedToMenu: false },
    }));
    const imported = importBlackBoxAttemptArtifact(artifact);
    expect(imported).toMatchObject({ accepted: true, attempt: { outcome: "incomplete" } });
  });

  it("rejects raw browser smoke, non-Class-C evidence, and missing or tampered integrity", () => {
    expect(importBlackBoxAttemptArtifact({ format: "tear-class-c-production-smoke", certified: false })).toMatchObject({ accepted: false });
    const artifact = createBlackBoxAttemptArtifact(draft("protected"));
    const nonBlackBox = importBlackBoxAttemptArtifact({ ...artifact, executionClass: "engineering" });
    const missingIntegrity = importBlackBoxAttemptArtifact({ ...artifact, integrity: undefined });
    const tampered = importBlackBoxAttemptArtifact({ ...artifact, policyId: "tampered" });
    expect(nonBlackBox.accepted).toBe(false);
    expect(missingIntegrity.accepted).toBe(false);
    expect(tampered.accepted).toBe(false);
    if (!nonBlackBox.accepted) expect(nonBlackBox.reasons).toContain("artifact must declare black-box execution");
    if (!missingIntegrity.accepted) expect(missingIntegrity.reasons).toContain("artifact integrity is missing or unsupported");
    if (!tampered.accepted) expect(tampered.reasons).toContain("artifact integrity contentHash does not match its evidence payload");
    expect(artifact.integrity.algorithm).toBe(BLACK_BOX_ARTIFACT_INTEGRITY_ALGORITHM);
  });
});
