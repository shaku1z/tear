import { describe, expect, it } from "vitest";
import { LiveFoundryScreenController } from "../../src/app/live-foundry-screen";
import { TearFoundryJobVault, createTearFoundryJob, transitionTearFoundryJob } from "../../src/agents";
import { createMemoryGhostVaultBackend } from "../../src/ghost";

const inputs = Object.freeze({ champion: { id: "local", artifactHash: "a".repeat(16) }, corpusRecordHashes: ["b".repeat(16)], evaluationPlanHash: "c".repeat(16), rewardDefinitionHash: "d".repeat(16), invariantSetHash: "e".repeat(16), budgetHash: "f".repeat(16), stopConditionsHash: "1".repeat(16) });

describe("C36 live Foundry recovery screen controller", () => {
  it("projects validated local job heads as hashes/counts and legal manual state only", async () => {
    const backend = createMemoryGhostVaultBackend(), vault = new TearFoundryJobVault(backend);
    const created = createTearFoundryJob({ id: "private-job-id", createdAt: "2026-08-08T00:00:00.000Z", reason: "authorized", inputs });
    await vault.persist(transitionTearFoundryJob(created, "collecting", "2026-08-08T00:01:00.000Z", "held custody"));
    const view = await new LiveFoundryScreenController(backend).refresh();
    expect(view).toMatchObject({ id: "foundry", status: "ready", automation: "unavailable", jobs: [{ phase: "collecting", nextManualPhase: "collecting", resumable: true, eventCount: 2 }] });
    expect(JSON.stringify(view)).not.toContain("private-job-id");
    expect(JSON.stringify(view)).not.toContain("held custody");
  });

  it("fails closed when browser persistence is unavailable", async () => {
    await expect(new LiveFoundryScreenController(undefined).refresh()).resolves.toEqual({ id: "foundry", status: "unavailable", subtitle: "Foundry storage is unavailable in this runtime", automation: "unavailable", jobs: [], schedules: [] });
  });
});
