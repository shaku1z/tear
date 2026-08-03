import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { TearPolicyDecisionJournal } from "../../src/agents";

const receipt = Object.freeze({ artifactId: "active-table", artifactHash: "0123456789abcdef", observationHash: "fedcba9876543210", source: "artifact" as const });
function trace(tick: number) {
  return Object.freeze({ tick, profile: "competent" as const, objective: "survive" as const, maneuver: "track" as const,
    confidence: 0.75, recovery: false, observationClass: "privileged-diagnostic" as const, critic: Object.freeze(["safe"] as const) });
}

describe("C32 policy decision journal", () => {
  it("persists canonical artifact decision receipts as a bounded integrity-checked Ghost Vault analysis journal", async () => {
    const backend = createMemoryGhostVaultBackend(), journal = new TearPolicyDecisionJournal(backend);
    journal.begin("watch-policy:v1:test", 2);
    journal.append({ tick: 10, receipt, actions: [{ type: "move", x: 1_000, y: 0 }], trace: trace(10) });
    journal.append({ tick: 11, receipt, actions: [{ type: "jump", phase: "pressed" }], trace: trace(11) });
    journal.append({ tick: 12, receipt, actions: [{ type: "dash", x: 0, y: -1_000 }], trace: trace(12) });
    await journal.flush();

    expect(journal.snapshot()).toMatchObject({ id: "watch-policy:v1:test", committed: 2, dropped: 1, pending: 0 });
    const persisted = await journal.read("watch-policy:v1:test");
    expect(persisted).toMatchObject({ format: "tear-policy-decision-journal", schemaVersion: 1, droppedEntries: 1, nextSequence: 4 });
    expect(persisted?.entries.map((entry) => entry.sequence)).toEqual([2, 3]);
    expect(persisted?.entries[1]?.previousEntryHash).toBe(persisted?.entries[0]?.entryHash);
    expect(persisted?.entries[1]?.actionHash).toMatch(/^[a-f0-9]{16}$/u);
  });

  it("quarantines malformed persisted journal bytes and starts a new bounded record", async () => {
    const backend = createMemoryGhostVaultBackend(), journal = new TearPolicyDecisionJournal(backend);
    await backend.put("analysis", "policy-decision-journal:v1:bad", "not-json");
    journal.begin("bad", 2);
    journal.append({ tick: 1, receipt, actions: [{ type: "confirm" }], trace: trace(1) });
    await journal.flush();

    expect((await journal.read("bad"))?.entries).toHaveLength(1);
    expect((await backend.keys("quarantine")).some((key) => key.startsWith("policy-decision-journal-quarantine:v1:bad:"))).toBe(true);
  });
});
