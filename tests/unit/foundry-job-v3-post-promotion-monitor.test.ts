import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { stableVerificationHash } from "../../src/replay/hash";
import { createTearFoundryJobV2, createTearFoundryV3PostPromotionTerminalReceipt, TearFoundryV3PostPromotionMonitor, TearPolicyDecisionJournal } from "../../src/agents";

const h = (letter: string) => letter.repeat(16);
async function fixture() {
  const backend = createMemoryGhostVaultBackend(), artifactId = "c36-active-v3", artifactHash = h("a"), activationDraft = { format: "tear-policy-activation" as const, schemaVersion: 1 as const, revision: 1, artifactId, artifactHash, activatedAt: "2026-08-08T00:00:00.000Z" }, activation = Object.freeze({ ...activationDraft, activationHash: stableVerificationHash(activationDraft) });
  const job = createTearFoundryJobV2({ id: "post-promotion", createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized", inputs: { champion: { id: "baseline", artifactHash: h("c") }, corpusRecordHashes: [h("d")], evaluationPlanHash: h("e"), rewardDefinitionHash: h("f"), invariantSetHash: h("1"), budgetHash: h("2"), stopConditionsHash: h("3"), evaluationProtocol: { version: 1, id: "frozen", thresholds: { minimumRewardGain: 0, requireCompletionRateNotLower: true, maxTicksPerCase: 4, maxAbsoluteRewardPerCase: 100 } } } });
  const protocol = job.inputs.evaluationProtocol; if (protocol === undefined) throw new Error("fixture protocol missing");
  const approvalDraft = { format: "tear-foundry-v3-promotion-approval" as const, schemaVersion: 1 as const, job: { id: job.id, jobHash: job.jobHash, protocolHash: protocol.protocolHash, stopConditionsHash: job.inputs.stopConditionsHash }, bridge: { bridgeHash: h("4"), decisionReceiptHash: h("5"), monitoringReceiptHash: h("6"), evaluationResultHash: h("7") }, candidate: { id: artifactId, artifactHash, adapterHash: h("8"), actionVocabularyHash: h("9"), offlinePlanHash: h("0"), offlineTrainingHash: h("a"), onlinePlanHash: h("b"), onlineCheckpointHash: h("c"), evaluationHash: h("d") }, conditions: { currentMonitoringHead: true, monitoringReadyDecision: true, evidenceRetained: true, heldCustody: true, completedPassedV3: true, inactiveCandidateOnly: true, approverFree: true }, approvedAt: "2026-08-08T00:00:00.000Z" }, approval = Object.freeze({ ...approvalDraft, approvalHash: stableVerificationHash(approvalDraft) });
  const approvalHash = approval.approvalHash;
  const promotionDraft = { format: "tear-foundry-v3-promotion-receipt" as const, schemaVersion: 1 as const, approvalHash, artifactId, artifactHash, activationHash: activation.activationHash, revision: 1, promotedAt: "2026-08-08T00:00:00.000Z" }, promotion = Object.freeze({ ...promotionDraft, receiptHash: stableVerificationHash(promotionDraft) });
  await backend.put("analysis", "policy-active:v1", JSON.stringify(activation)); await backend.put("analysis", `foundry-job:v1:${job.id}`, JSON.stringify(job)); await backend.put("analysis", `foundry-job-v3-promotion-approval:v1:${approvalHash}`, JSON.stringify(approval)); await backend.put("analysis", `foundry-job-v3-promotion-receipt:v1:${approvalHash}`, JSON.stringify(promotion));
  const journal = new TearPolicyDecisionJournal(backend); journal.begin("watch-policy:v1:production-c30", 4);
  const trace = Object.freeze({ tick: 1, profile: "competent" as const, objective: "survive" as const, maneuver: "track" as const, confidence: 0.75, recovery: false, observationClass: "privileged-diagnostic" as const, critic: Object.freeze(["safe"] as const) });
  journal.append({ tick: 1, receipt: { artifactId, artifactHash, activationHash: activation.activationHash, observationHash: h("e"), source: "artifact" }, actions: [{ type: "move", x: 1_000, y: 0 }], trace }); await journal.flush(); const persisted = await journal.read("watch-policy:v1:production-c30"); if (persisted === undefined) throw new Error("fixture journal missing");
  const terminal = createTearFoundryV3PostPromotionTerminalReceipt({ journalId: persisted.id, journalHash: persisted.journalHash, terminal: { status: "completed", tick: 2 } }); return { backend, terminal, activation, journal: persisted };
}

describe("C36 post-promotion aggregate monitoring", () => {
  it("retains only exact active V3 Watch aggregate evidence and freezes the promotion policy", async () => {
    const f = await fixture(), result = await new TearFoundryV3PostPromotionMonitor(f.backend).retain(f.terminal, "2026-08-08T00:01:00.000Z");
    expect(result.classification).toBe("observation"); expect(result.evidence).toMatchObject({ decisionCount: 1, artifactDecisionCount: 1, journalHash: f.journal.journalHash }); expect(result.policy.regressionPolicy).toBe("classify-only-no-rollback"); expect(JSON.stringify(result)).not.toContain('"actions"');
  });
  it("refuses changed active heads, terminal/journal mismatch, corrupt evidence, and non-complete terminal observation", async () => {
    const changed = await fixture(); await changed.backend.put("analysis", "policy-active:v1", JSON.stringify({ ...changed.activation, artifactHash: h("f") })); await expect(new TearFoundryV3PostPromotionMonitor(changed.backend).retain(changed.terminal, "2026-08-08T00:01:00.000Z")).rejects.toThrow(/active|promotion|activation/u);
    const mismatch = await fixture(); await expect(new TearFoundryV3PostPromotionMonitor(mismatch.backend).retain({ ...mismatch.terminal, journalHash: h("0") }, "2026-08-08T00:01:00.000Z")).rejects.toThrow(/integrity|journal/u);
    const corrupt = await fixture(); await corrupt.backend.put("analysis", "policy-decision-journal:v1:watch-policy:v1:production-c30", "corrupt"); await expect(new TearFoundryV3PostPromotionMonitor(corrupt.backend).retain(corrupt.terminal, "2026-08-08T00:01:00.000Z")).rejects.toThrow(/journal/u);
    const failed = await fixture(), terminal = createTearFoundryV3PostPromotionTerminalReceipt({ journalId: failed.journal.id, journalHash: failed.journal.journalHash, terminal: { status: "failed", tick: 2, reasonHash: h("f") } }); expect((await new TearFoundryV3PostPromotionMonitor(failed.backend).retain(terminal, "2026-08-08T00:01:00.000Z")).classification).toBe("threshold-breach");
  });
});
