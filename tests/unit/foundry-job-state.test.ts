import { describe, expect, it } from "vitest";

import { createMemoryGhostVaultBackend } from "../../src/ghost";
import {
  TearFoundryJobVault,
  createTearFoundryJob,
  parseTearFoundryJob,
  reportTearFoundryJob,
  transitionTearFoundryJob,
} from "../../src/agents";

const hashes = Object.freeze({ artifact: "1111111111111111", corpus: "2222222222222222", evaluation: "3333333333333333",
  reward: "4444444444444444", invariants: "5555555555555555", budget: "6666666666666666", stops: "7777777777777777" });
function job() {
  return createTearFoundryJob({ id: "foundry-job-a", createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized scheduled learning",
    inputs: { champion: { id: "champion-a", artifactHash: hashes.artifact }, corpusRecordHashes: [hashes.corpus],
      evaluationPlanHash: hashes.evaluation, rewardDefinitionHash: hashes.reward, invariantSetHash: hashes.invariants,
      budgetHash: hashes.budget, stopConditionsHash: hashes.stops } });
}

describe("C36 Foundry job ledger", () => {
  it("advances only the immutable unattended workflow and reports a safe restart point", () => {
    const created = job();
    const collecting = transitionTearFoundryJob(created, "collecting", "2026-08-08T00:01:00.000Z", "intake window opened");
    const curating = transitionTearFoundryJob(collecting, "curating", "2026-08-08T00:02:00.000Z", "intake sealed");
    expect(() => transitionTearFoundryJob(curating, "monitoring", "2026-08-08T00:03:00.000Z", "skip frozen work")).toThrow(/illegal/u);
    expect(reportTearFoundryJob(curating)).toMatchObject({ phase: "curating", nextPhase: "curating", resumable: true });
    const rejected = transitionTearFoundryJob(curating, "rejected", "2026-08-08T00:03:00.000Z", "no eligible corpus");
    expect(reportTearFoundryJob(rejected)).toMatchObject({ phase: "rejected", nextPhase: null, resumable: false });
    expect(() => transitionTearFoundryJob(rejected, "training", "2026-08-08T00:04:00.000Z", "retry")).toThrow(/illegal/u);
  });

  it("fails closed on altered frozen inputs or event history", () => {
    const original = job();
    const first = original.events.at(0);
    if (first === undefined) throw new Error("fixture has no Foundry event");
    expect(() => parseTearFoundryJob({ ...original, inputs: { ...original.inputs, rewardDefinitionHash: hashes.stops } })).toThrow(/integrity/u);
    expect(() => parseTearFoundryJob({ ...original, events: [{ ...first, reason: "altered" }] })).toThrow(/history|integrity/u);
  });

  it("persists idempotently, quarantines corrupt restart bytes, and never fabricates a next phase", async () => {
    const backend = createMemoryGhostVaultBackend(), vault = new TearFoundryJobVault(backend), original = job();
    await expect(vault.persist(original)).resolves.toMatchObject({ jobHash: original.jobHash });
    await expect(vault.persist(original)).resolves.toMatchObject({ jobHash: original.jobHash });
    await expect(vault.get(original.id)).resolves.toMatchObject({ phase: "created" });
    await backend.put("analysis", "foundry-job:v1:broken", "{not json");
    await expect(vault.get("broken")).resolves.toBeUndefined();
    expect(await backend.get("quarantine", "foundry-job:v1:broken")).toContain("foundry-job-quarantine");
  });
});
