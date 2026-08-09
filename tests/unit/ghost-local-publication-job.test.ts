import { describe, expect, it } from "vitest";
import { GhostLocalPublicationJobs, GhostStreamingRecorder, GhostLocalVault, createMemoryGhostVaultBackend, reviseGhostCapsuleManifest } from "../../src/ghost";

const consent = Object.freeze({ format: "tear-academy-consent" as const, schemaVersion: 1 as const, revision: "publication-1", decidedAt: "2026-08-09T00:00:00.000Z", localRecording: "granted" as const, cloudPublication: "granted" as const, analytics: "denied" as const, modelTraining: "no-training" as const });
async function fixture() {
  const backend = createMemoryGhostVaultBackend(), vault = new GhostLocalVault(backend), capsuleId = "publishable-capsule";
  const recorder = new GhostStreamingRecorder({ sessionId: capsuleId, createdAt: "2026-08-09T00:00:00.000Z", vault, chunkEntries: 1, maxPendingWrites: 1 });
  await recorder.start(); await recorder.append({ kind: "commands", tick: 1, value: { command: "move" } }); await recorder.finalize("2026-08-09T00:00:01.000Z");
  return { backend, vault, jobs: new GhostLocalPublicationJobs(vault), capsuleId };
}
function input(capsuleId: string) { return { capsuleId, createdAt: "2026-08-09T00:01:00.000Z", partBytes: 8, custody: { consent, privacy: "pseudonymous" as const, visibility: "unlisted" as const, eligibility: Object.freeze({ resumed: false, modded: false, coached: false, ghostAssisted: false, bot: false, debug: false, stateForge: false }), decidedAt: "2026-08-09T00:00:30.000Z" } }; }

describe("C38 local immutable publication jobs", () => {
  it("binds a complete healthy Vault export and is idempotent without persisting raw export or identity", async () => {
    const f = await fixture(), first = await f.jobs.enqueue(input(f.capsuleId)), retry = await f.jobs.enqueue(input(f.capsuleId));
    expect(retry).toEqual(first); expect(first.status).toBe("queued"); expect(first.transfer.parts.length).toBeGreaterThan(1);
    const stored = await f.backend.get("uploadJobs", `ghost-publication-job:v1:${first.id}`);
    expect(stored).not.toContain("commands"); expect(stored).not.toContain("bearer"); expect(stored).not.toContain("uid");
  });

  it("rejects incomplete, quarantined, malformed, and non-granted custody sources", async () => {
    const f = await fixture(); const manifest = await f.vault.getManifest(f.capsuleId); if (manifest === undefined) throw new Error("fixture missing");
    await f.backend.put("manifests", f.capsuleId, JSON.stringify(reviseGhostCapsuleManifest(manifest, { status: "quarantined" })));
    await expect(f.jobs.enqueue(input(f.capsuleId))).rejects.toThrow(/complete healthy/u);
    await f.backend.put("manifests", f.capsuleId, "not-json"); await expect(f.jobs.enqueue(input(f.capsuleId))).rejects.toThrow();
    const g = await fixture(); await expect(g.jobs.enqueue({ ...input(g.capsuleId), custody: { ...input(g.capsuleId).custody, consent: { ...consent, cloudPublication: "revoked" } } })).rejects.toThrow(/custody/u);
  });

  it("cancels, without removing local source evidence, when the source or custody bytes change", async () => {
    const f = await fixture(), job = await f.jobs.enqueue(input(f.capsuleId)); const manifest = await f.vault.getManifest(f.capsuleId); if (manifest === undefined) throw new Error("fixture missing");
    await f.backend.put("manifests", f.capsuleId, JSON.stringify(reviseGhostCapsuleManifest(manifest, { completedAt: "2026-08-09T00:00:02.000Z" })));
    expect((await f.jobs.read(job.id))?.cancellationReason).toBe("source-or-custody-changed"); expect(await f.vault.getManifest(f.capsuleId)).toBeDefined();
    const g = await fixture(), other = await g.jobs.enqueue(input(g.capsuleId)); const raw = await g.backend.get("analysis", `ghost-publication-custody:v1:${g.capsuleId}`); if (raw === undefined) throw new Error("missing custody");
    await g.backend.put("analysis", `ghost-publication-custody:v1:${g.capsuleId}`, raw.replace("publication-1", "publication-2"));
    expect((await g.jobs.read(other.id))?.cancellationReason).toBe("source-or-custody-changed");
  });

  it("supports explicit local cancellation only", async () => {
    const f = await fixture(), job = await f.jobs.enqueue(input(f.capsuleId));
    expect((await f.jobs.cancel(job.id)).cancellationReason).toBe("cancelled-by-player");
    expect((await f.jobs.read(job.id))?.status).toBe("cancelled");
  });
});
