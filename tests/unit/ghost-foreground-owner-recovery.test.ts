import { describe, expect, it } from "vitest";
import { GhostForegroundOwnerRecovery } from "../../src/ghost/foreground-owner-recovery";
import { createMemoryGhostVaultBackend, GhostLocalVault, GhostStreamingRecorder, GHOST_VAULT_STORES,
  ghostCapsuleProtectionKey, parseGhostCapsuleManifest, type GhostVaultBackend } from "../../src/ghost/capsule-vault";
import { ghostSha256 } from "../../src/ghost/cloud-publication";

async function source(id = "cloud-owner-capsule", legacy = false) {
  const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
  const recorder = new GhostStreamingRecorder({ sessionId: id, createdAt: "2026-08-09T00:00:00.000Z", vault, chunkEntries: 1, maxPendingWrites: 1 });
  await recorder.start(); await recorder.append({ kind: "commands", tick: 1, value: { type: "move", x: 1 } }); await recorder.finalize("2026-08-09T00:00:01.000Z");
  const manifest = await vault.getManifest(id); if (manifest === undefined) throw new Error("fixture missing");
  let encoded = await vault.exportCapsule(manifest.id);
  if (legacy) {
    const old = JSON.parse(encoded) as { manifest: Record<string, unknown> };
    old.manifest.schemaVersion = 1; delete old.manifest.contract; delete old.manifest.integrity;
    encoded = JSON.stringify(old);
  }
  const canonical = parseGhostCapsuleManifest((JSON.parse(encoded) as { manifest: unknown }).manifest);
  const bytes = new TextEncoder().encode(encoded), hash = await ghostSha256(bytes);
  return { manifest: canonical, encoded, bytes, row: { capsule_id: canonical.id, build_id: "tear-local-capsule", schema_version: canonical.schemaVersion, byte_length: bytes.byteLength, content_hash: hash, result_hash: canonical.rootIntegrity, status: "finalized", active_verdict_id: "verdict-1", verdict_json: JSON.stringify({ status: "verified", moderation: "cleared", capsuleId: canonical.id, buildId: "tear-local-capsule", contentHash: hash, resultHash: canonical.rootIntegrity }) } };
}

async function storedState(backend: GhostVaultBackend) {
  return Object.fromEntries(await Promise.all(GHOST_VAULT_STORES.map(async (store) => [store,
    await Promise.all((await backend.keys(store)).slice().sort().map(async (key) => [key, await backend.get(store, key)] as const))] as const)));
}
describe("foreground Ghost owner recovery", () => {
  it.each(["id", "schema", "root"] as const)("rejects a valid SHA-matching object with mismatched %s authority before any Vault write", async (mismatch) => {
    const f = await source(), retained = await source("retained-local-capsule");
    const backend = createMemoryGhostVaultBackend(), vault = new GhostLocalVault(backend);
    await vault.importCapsule(retained.encoded);
    await backend.put("analysis", ghostCapsuleProtectionKey(retained.manifest.id), JSON.stringify({
      format: "ghost-capsule-protection", schemaVersion: 1, capsuleId: retained.manifest.id,
      rootIntegrity: retained.manifest.rootIntegrity, owners: ["cloud-recovery-control"],
    }));
    const before = await storedState(backend);
    const row = { ...f.row, ...(mismatch === "id" ? { capsule_id: "different-cloud-id" }
      : mismatch === "schema" ? { schema_version: 1 } : { result_hash: "different-cloud-root" }) };
    row.verdict_json = JSON.stringify({ status: "verified", moderation: "cleared", capsuleId: row.capsule_id,
      buildId: row.build_id, contentHash: row.content_hash, resultHash: row.result_hash });
    const recovery = new GhostForegroundOwnerRecovery({ endpoint: "https://publication.test", vault,
      bearer: { acquireAuthorization: () => Promise.resolve({ authorization: "Bearer fresh" }) },
      fetch: (url) => Promise.resolve((url instanceof Request ? url.url : new Request(url).url).includes("?scope=own") ? Response.json({ capsules: [row] }) : new Response(f.bytes)) });
    await expect(recovery.recoverOnce(row.capsule_id)).rejects.toThrow(/manifest.*cloud custody/u);
    expect(await storedState(backend)).toEqual(before);
  });
  it.each([false, true])("uses fresh action bearers, binds catalog custody, and imports one complete object (legacy=%s)", async (legacy) => {
    const f = await source("cloud-owner-capsule", legacy), destination = new GhostLocalVault(createMemoryGhostVaultBackend()); let tokens = 0, objects = 0;
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
