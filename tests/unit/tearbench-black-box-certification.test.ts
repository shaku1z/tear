import { describe, expect, it } from "vitest";

import {
  NORMAL_ADVENTURE_BLACK_BOX_TARGET,
  createBlackBoxCertificationAttempt,
  createBlackBoxCertificationReport,
  oneSidedWilsonLowerBound95,
  type BlackBoxAttemptOutcome,
} from "../../src/tearbench/black-box-certification";

function attempt(id: string, outcome: BlackBoxAttemptOutcome, retryOf?: string) {
  return createBlackBoxCertificationAttempt({
    id,
    recordedAt: "2026-07-28T00:00:00.000Z",
    buildId: "standalone-production-build",
    policyId: "normal-adventure-policy-v1",
    executionClass: "black-box",
    observationClass: "pixel-only",
    physicalInput: "keyboard-mouse",
    outcome,
    artifacts: {
      inputTrace: `artifacts/${id}.input.json`,
      observationTrace: `artifacts/${id}.pixels.json`,
      finalScreenshot: `artifacts/${id}.png`,
    },
    ...(retryOf === undefined ? {} : { role: "diagnostic-retry" as const, diagnosticRetryOf: retryOf }),
  });
}

describe("C25 black-box certification statistics", () => {
  it("declares the Normal target as 50 physical pixel-only attempts at a one-sided 95% 90% bound", () => {
    expect(NORMAL_ADVENTURE_BLACK_BOX_TARGET).toMatchObject({
      label: "Normal Adventure", requiredAttempts: 50, requiredWilsonLowerBound: 0.9, confidence: 0.95,
    });
    expect(oneSidedWilsonLowerBound95(49, 50)).toBeGreaterThanOrEqual(0.9);
    expect(oneSidedWilsonLowerBound95(48, 50)).toBeLessThan(0.9);
  });

  it("passes 49/50 but fails 48/50 by the declared lower confidence bound", () => {
    const pass = createBlackBoxCertificationReport({
      attempts: Array.from({ length: 50 }, (_, index) => attempt(`pass-${String(index)}`, index === 49 ? "failure" : "success")),
    });
    const fail = createBlackBoxCertificationReport({
      attempts: Array.from({ length: 50 }, (_, index) => attempt(`fail-${String(index)}`, index >= 48 ? "failure" : "success")),
    });
    expect(pass).toMatchObject({ disposition: "pass", certified: true, denominator: 50, successes: 49 });
    expect(fail).toMatchObject({ disposition: "fail", certified: false, denominator: 50, successes: 48 });
  });

  it("is incomplete below the declared denominator and does not accept engineering or structured evidence", () => {
    const report = createBlackBoxCertificationReport({ attempts: [attempt("first", "success")] });
    expect(report.disposition).toBe("incomplete");
    expect(() => createBlackBoxCertificationAttempt({
      ...attempt("source", "success"),
      id: "invalid", executionClass: "engineering", observationClass: "structured-state",
    })).toThrow(/black-box execution/u);
    expect(() => createBlackBoxCertificationAttempt({
      ...attempt("invalid-input", "success"), id: "invalid-input", physicalInput: "programmatic" as never,
    })).toThrow(/physical player-valid/u);
  });

  it("keeps an original failed attempt in the denominator when a diagnostic retry succeeds", () => {
    const original = attempt("original", "failure");
    const retry = attempt("retry", "success", original.id);
    const report = createBlackBoxCertificationReport({ attempts: [original], diagnosticRetries: [retry] });
    expect(report).toMatchObject({ denominator: 1, successes: 0, failures: 1, diagnosticRetries: [expect.objectContaining({ outcome: "success" })] });
    expect(report.disposition).toBe("incomplete");
  });

  it("copies and freezes evidence and rejects diagnostic retries without a primary original", () => {
    const source = {
      inputTrace: "input", observationTrace: "pixels", finalScreenshot: "final",
    };
    const frozen = createBlackBoxCertificationAttempt({
      id: "immutable", recordedAt: "2026-07-28", buildId: "build", policyId: "policy",
      executionClass: "black-box", observationClass: "pixel-only", physicalInput: "touch", outcome: "success", artifacts: source,
    });
    source.inputTrace = "mutated";
    expect(frozen.artifacts.inputTrace).toBe("input");
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.artifacts)).toBe(true);
    expect(() => createBlackBoxCertificationReport({ attempts: [], diagnosticRetries: [attempt("orphan", "success", "missing")] }))
      .toThrow(/original primary/u);
  });
});
