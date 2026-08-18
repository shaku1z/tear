import { describe, expect, it } from "vitest";
import { createMemoryGhostVaultBackend } from "../../src/ghost";
import { TearFoundrySuccessorExecutionBindingMaterialVault, createTearFoundrySuccessorExecutionBindingMaterial } from "../../src/agents";

const h = Object.freeze({ receipt: "1".repeat(16), source: "2".repeat(16), successor: "3".repeat(16), launch: "4".repeat(16) });
function material() { return createTearFoundrySuccessorExecutionBindingMaterial({ attemptReceiptHash: h.receipt, sourceJobHash: h.source, successor: { id: "job", jobHash: h.successor, phase: "training" }, payload: { kind: "offline-resume", launchHash: h.launch } }); }

describe("C36 receipt-bound successor execution material", () => {
  it("is idempotent only for the exact receipt, source/successor heads, phase, and payload", async () => {
    const backend = createMemoryGhostVaultBackend(), vault = new TearFoundrySuccessorExecutionBindingMaterialVault(backend), first = material();
    await expect(vault.persist(first)).resolves.toEqual(first); await expect(vault.persist(first)).resolves.toEqual(first);
    await expect(vault.persist(createTearFoundrySuccessorExecutionBindingMaterial({ attemptReceiptHash: h.receipt, sourceJobHash: h.source, successor: { id: "job", jobHash: h.successor, phase: "training" }, payload: { kind: "offline-resume", launchHash: "5".repeat(16) } }))).rejects.toThrow(/already differs/u);
  });

  it("rejects terminal or phase/payload-mismatched material and quarantines/replaces corrupt stored bytes", async () => {
    expect(() => createTearFoundrySuccessorExecutionBindingMaterial({ attemptReceiptHash: h.receipt, sourceJobHash: h.source, successor: { id: "job", jobHash: h.successor, phase: "failed" }, payload: { kind: "offline-resume", launchHash: h.launch } })).toThrow(/invalid/u);
    expect(() => createTearFoundrySuccessorExecutionBindingMaterial({ attemptReceiptHash: h.receipt, sourceJobHash: h.source, successor: { id: "job", jobHash: h.successor, phase: "training" }, payload: { kind: "none" } })).toThrow(/training/u);
    const backend = createMemoryGhostVaultBackend(), vault = new TearFoundrySuccessorExecutionBindingMaterialVault(backend), key = `foundry-job-successor-binding-material:v1:${h.receipt}`;
    await backend.put("analysis", key, "broken"); await expect(vault.persist(material())).resolves.toEqual(material()); expect(await backend.get("quarantine", key)).toBe("broken"); await expect(vault.get(h.receipt)).resolves.toEqual(material());
  });
});
