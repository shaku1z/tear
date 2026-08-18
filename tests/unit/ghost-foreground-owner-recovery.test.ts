import { describe, expect, it } from "vitest";
import { GhostForegroundOwnerRecovery } from "../../src/ghost/foreground-owner-recovery";
import { createMemoryGhostVaultBackend, GhostLocalVault, GhostStreamingRecorder } from "../../src/ghost/capsule-vault";
import { ghostSha256 } from "../../src/ghost/cloud-publication";

async function source() {
  const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
  const recorder = new GhostStreamingRecorder({ sessionId: "cloud-owner-capsule", createdAt: "2026-08-09T00:00:00.000Z", vault, chunkEntries: 1, maxPendingWrites: 1 });
  await recorder.start(); await recorder.append({ kind: "commands", tick: 1, value: { type: "move", x: 1 } }); await recorder.finalize("2026-08-09T00:00:01.000Z");
  const manifest = await vault.getManifest("cloud-owner-capsule"); if (manifest === undefined) throw new Error("fixture missing");
  const encoded = await vault.exportCapsule(manifest.id), bytes = new TextEncoder().encode(encoded), hash = await ghostSha256(bytes);
  return { manifest, encoded, bytes, row: { capsule_id: manifest.id, build_id: "tear-local-capsule", schema_version: manifest.schemaVersion, byte_length: bytes.byteLength, content_hash: hash, result_hash: manifest.rootIntegrity, status: "finalized", active_verdict_id: "verdict-1", verdict_json: JSON.stringify({ status: "verified", moderation: "cleared", capsuleId: manifest.id, buildId: "tear-local-capsule", contentHash: hash, resultHash: manifest.rootIntegrity }) } };
}
describe("foreground Ghost owner recovery", () => {
  it("uses fresh action bearers, binds verified-cleared catalog custody, and imports one complete object only", async () => {
    const f = await source(), destination = new GhostLocalVault(createMemoryGhostVaultBackend()); let tokens = 0, objects = 0;
    const recovery = new GhostForegroundOwnerRecovery({ endpoint: "https://publication.test/", vault: destination, bearer: { acquireAuthorization() { tokens += 1; return Promise.resolve({ authorization: `Bearer fresh-${String(tokens)}` }); } }, fetch: (input) => { const request = input instanceof Request ? input : new Request(input); if (request.url.endsWith("/v1/capsules?scope=own")) return Promise.resolve(Response.json({ capsules: [f.row] })); objects += 1; expect(new URL(request.url).pathname).toBe(`/v1/capsules/${f.manifest.id}/object`); return Promise.resolve(new Response(f.bytes, { status: 200 })); } });
    await expect(recovery.recoverOnce(f.manifest.id)).resolves.toMatchObject({ status: "recovered", manifest: { rootIntegrity: f.manifest.rootIntegrity } }); expect(tokens).toBe(2); expect(objects).toBe(1);
    await expect(recovery.recoverOnce(f.manifest.id)).resolves.toMatchObject({ status: "already-recovered" }); await expect(recovery.recoverOnce("not-owned")).resolves.toEqual({ status: "absent" });
  });
  it("rejects ranges, altered metadata/bytes, and local custody conflicts without accepting remote bytes", async () => {
    const f = await source();
    for (const input of [{ response: new Response(f.bytes, { status: 206, headers: { "content-range": "bytes 0-1/2" } }), row: f.row }, { response: new Response(Uint8Array.of(1, 2), { status: 200 }), row: f.row }, { response: new Response(f.bytes, { status: 200 }), row: { ...f.row, verdict_json: JSON.stringify({ status: "verified", moderation: "held" }) } }]) {
      const vault = new GhostLocalVault(createMemoryGhostVaultBackend()), recovery = new GhostForegroundOwnerRecovery({ endpoint: "https://publication.test", vault, bearer: { acquireAuthorization() { return Promise.resolve({ authorization: "Bearer fresh" }); } }, fetch: (url) => Promise.resolve((url instanceof Request ? url.url : new Request(url).url).includes("?scope=own") ? Response.json({ capsules: [input.row] }) : input.response) });
      await expect(recovery.recoverOnce(f.manifest.id)).rejects.toThrow(); expect(await vault.getManifest(f.manifest.id)).toBeUndefined();
    }
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend()); await vault.importCapsule(f.encoded);
    const conflict = { ...f.row, result_hash: "different" }; conflict.verdict_json = JSON.stringify({ status: "verified", moderation: "cleared", capsuleId: f.manifest.id, buildId: "tear-local-capsule", contentHash: conflict.content_hash, resultHash: "different" });
    const recovery = new GhostForegroundOwnerRecovery({ endpoint: "https://publication.test", vault, bearer: { acquireAuthorization() { return Promise.resolve({ authorization: "Bearer fresh" }); } }, fetch: () => Promise.resolve(Response.json({ capsules: [conflict] })) });
    await expect(recovery.recoverOnce(f.manifest.id)).rejects.toThrow(/conflicts/u);
  });
});
