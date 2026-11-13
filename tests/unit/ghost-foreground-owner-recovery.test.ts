import { describe, expect, it, vi } from "vitest";
import { LiveGhostOwnerRecoveryController } from "../../src/app/replay/ghost-owner-recovery-controller";
import { createStandaloneGhostPublicationRuntime } from "../../src/platform/ghost-publication-runtime";
import { GhostForegroundOwnerRecovery } from "../../src/ghost/foreground-owner-recovery";
import {
  createMemoryGhostVaultBackend,
  GhostLocalVault,
  GhostStreamingRecorder,
  GHOST_VAULT_STORES,
  ghostCapsuleProtectionKey,
  parseGhostCapsuleManifest,
  type GhostVaultBackend,
} from "../../src/ghost/capsule-vault";
import { ghostSha256 } from "../../src/ghost/cloud-publication";

async function source(id = "cloud-owner-capsule", legacy = false) {
  const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
  const recorder = new GhostStreamingRecorder({
    sessionId: id,
    createdAt: "2026-08-09T00:00:00.000Z",
    vault,
    chunkEntries: 1,
    maxPendingWrites: 1,
  });
  await recorder.start();
  await recorder.append({ kind: "commands", tick: 1, value: { type: "move", x: 1 } });
  await recorder.finalize("2026-08-09T00:00:01.000Z");
  const manifest = await vault.getManifest(id);
  if (manifest === undefined) throw new Error("fixture missing");
  let encoded = await vault.exportCapsule(manifest.id);
  if (legacy) {
    const old = JSON.parse(encoded) as { manifest: Record<string, unknown> };
    old.manifest.schemaVersion = 1;
    delete old.manifest.contract;
    delete old.manifest.integrity;
    encoded = JSON.stringify(old);
  }
  const canonical = parseGhostCapsuleManifest((JSON.parse(encoded) as { manifest: unknown }).manifest);
  const bytes = new TextEncoder().encode(encoded),
    hash = await ghostSha256(bytes);
  return {
    manifest: canonical,
    encoded,
    bytes,
    row: {
      capsule_id: canonical.id,
      build_id: "tear-local-capsule",
      schema_version: canonical.schemaVersion,
      byte_length: bytes.byteLength,
      content_hash: hash,
      result_hash: canonical.rootIntegrity,
      status: "finalized",
      active_verdict_id: "verdict-1",
      verdict_json: JSON.stringify({
        status: "verified",
        moderation: "cleared",
        capsuleId: canonical.id,
        buildId: "tear-local-capsule",
        contentHash: hash,
        resultHash: canonical.rootIntegrity,
      }),
    },
  };
}

async function storedState(backend: GhostVaultBackend) {
  return Object.fromEntries(
    await Promise.all(
      GHOST_VAULT_STORES.map(
        async (store) =>
          [
            store,
            await Promise.all(
              (await backend.keys(store))
                .slice()
                .sort()
                .map(async (key) => [key, await backend.get(store, key)] as const),
            ),
          ] as const,
      ),
    ),
  );
}
describe("foreground Ghost owner recovery", () => {
  it("wires explicit owner catalog and recovery to the real service and Vault without navigation or automatic work", async () => {
    const f = await source(),
      backend = createMemoryGhostVaultBackend(),
      vault = new GhostLocalVault(backend),
      recovered = vi.fn();
    let tokens = 0,
      objects = 0;
    const fetcher = vi.fn<typeof fetch>((url) => {
      if ((url instanceof Request ? url.url : new Request(url).url).includes("?scope=own"))
        return Promise.resolve(Response.json({ capsules: [f.row] }));
      objects++;
      return Promise.resolve(new Response(f.bytes));
    });
    const runtime = createStandaloneGhostPublicationRuntime({
      target: "standalone",
      endpoint: "https://publication.test",
      loadBearer: () =>
        Promise.resolve({
          acquireAuthorization: () => {
            tokens++;
            return Promise.resolve({ authorization: "Bearer unit-action" });
          },
        }),
    });
    const controller = new LiveGhostOwnerRecoveryController({
      runtime,
      currentActor: () => "unit-owner",
      openVault: () => Promise.resolve(vault),
      fetch: fetcher,
      recovered,
    });
    const before = await storedState(backend);
    expect(controller.snapshot()).toMatchObject({ status: "idle", canLoad: true, catalogVisible: false, entries: [] });
    controller.snapshot();
    controller.close();
    expect(fetcher).not.toHaveBeenCalled();
    expect(tokens).toBe(0);
    expect(await storedState(backend)).toEqual(before);
    await controller.loadOwn();
    expect(controller.snapshot()).toMatchObject({
      status: "ready",
      catalogVisible: true,
      entries: [{ capsuleId: f.manifest.id }],
    });
    expect(await storedState(backend)).toEqual(before);
    expect(await controller.recover(f.manifest.id)).toMatchObject({
      operationId: 2,
      status: "recovered",
      superseded: false,
    });
    expect(await vault.getManifest(f.manifest.id)).toEqual(f.manifest);
    expect(recovered).toHaveBeenCalledOnce();
    const stored = await storedState(backend);
    expect(await controller.recover(f.manifest.id)).toMatchObject({
      operationId: 3,
      status: "already-recovered",
      superseded: false,
    });
    expect(await storedState(backend)).toEqual(stored);
    expect(objects).toBe(1);
    expect(tokens).toBe(4);
    expect(controller.snapshot().entries[0]?.localStatus).toBe("already-recovered");
    controller.close();
    expect(controller.snapshot().entries).toEqual([]);
  });

  it("refuses pending credentials after A→B→A, body-time account changes, and preserves a committed original operation", async () => {
    const f = await source(),
      backend = createMemoryGhostVaultBackend(),
      vault = new GhostLocalVault(backend);
    let actor = "account-A",
      tokenReady: (() => void) | undefined,
      resolveToken: ((value: { authorization: string }) => void) | undefined;
    const tokenStarted = new Promise<void>((resolve) => {
      tokenReady = resolve;
    });
    let deferredToken = true;
    const runtime = createStandaloneGhostPublicationRuntime({
      target: "standalone",
      endpoint: "https://publication.test",
      loadBearer: () =>
        Promise.resolve({
          acquireAuthorization: () =>
            deferredToken
              ? new Promise((resolve) => {
                  resolveToken = resolve;
                  tokenReady?.();
                })
              : Promise.resolve({ authorization: "Bearer unit-current" }),
        }),
    });
    let bodyReady: (() => void) | undefined,
      resolveBody: ((value: ArrayBuffer) => void) | undefined,
      deferredBody = false;
    const bodyStarted = new Promise<void>((resolve) => {
      bodyReady = resolve;
    });
    const fetcher = vi.fn<typeof fetch>((url) => {
      if ((url instanceof Request ? url.url : new Request(url).url).includes("?scope=own"))
        return Promise.resolve(Response.json({ capsules: [f.row] }));
      const response = new Response(f.bytes);
      if (deferredBody)
        vi.spyOn(response, "arrayBuffer").mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveBody = resolve;
              bodyReady?.();
            }),
        );
      return Promise.resolve(response);
    });
    const recovered = vi.fn(),
      controller = new LiveGhostOwnerRecoveryController({
        runtime,
        currentActor: () => actor,
        openVault: () => Promise.resolve(vault),
        fetch: fetcher,
        recovered,
      });
    const before = await storedState(backend),
      pending = controller.loadOwn();
    await tokenStarted;
    actor = "account-B";
    controller.accountChanged();
    actor = "account-A";
    controller.accountChanged();
    if (resolveToken === undefined) throw new Error("token control not reached");
    resolveToken({ authorization: "Bearer superseded" });
    await pending;
    expect(fetcher).not.toHaveBeenCalled();
    expect(await storedState(backend)).toEqual(before);
    deferredToken = false;
    await controller.loadOwn();
    deferredBody = true;
    const bodyPending = controller.recover(f.manifest.id);
    await bodyStarted;
    actor = "account-B";
    controller.accountChanged();
    if (resolveBody === undefined) throw new Error("body control not reached");
    resolveBody(Uint8Array.from(f.bytes).buffer);
    await bodyPending;
    expect(await storedState(backend)).toEqual(before);
    expect(controller.snapshot().entries).toEqual([]);
    expect(recovered).not.toHaveBeenCalled();
    deferredBody = false;
    actor = "account-A";
    controller.accountChanged();
    await controller.loadOwn();
    const importOriginal = vault.importCapsule.bind(vault);
    vi.spyOn(vault, "importCapsule").mockImplementation(async (...args) => {
      const manifest = await importOriginal(...args);
      actor = "account-B";
      controller.accountChanged();
      return manifest;
    });
    const committed = await controller.recover(f.manifest.id);
    expect(committed).toMatchObject({
      operationId: 5,
      capsuleId: f.manifest.id,
      status: "recovered",
      superseded: true,
    });
    expect(await vault.getManifest(f.manifest.id)).toEqual(f.manifest);
    expect(controller.snapshot().entries).toEqual([]);
    expect(recovered).not.toHaveBeenCalled();
  });
  it.each(["id", "schema", "root"] as const)(
    "rejects a valid SHA-matching object with mismatched %s authority before any Vault write",
    async (mismatch) => {
      const f = await source(),
        retained = await source("retained-local-capsule");
      const backend = createMemoryGhostVaultBackend(),
        vault = new GhostLocalVault(backend);
      await vault.importCapsule(retained.encoded);
      await backend.put(
        "analysis",
        ghostCapsuleProtectionKey(retained.manifest.id),
        JSON.stringify({
          format: "ghost-capsule-protection",
          schemaVersion: 1,
          capsuleId: retained.manifest.id,
          rootIntegrity: retained.manifest.rootIntegrity,
          owners: ["cloud-recovery-control"],
        }),
      );
      const before = await storedState(backend);
      const row = {
        ...f.row,
        ...(mismatch === "id"
          ? { capsule_id: "different-cloud-id" }
          : mismatch === "schema"
            ? { schema_version: 1 }
            : { result_hash: "different-cloud-root" }),
      };
      row.verdict_json = JSON.stringify({
        status: "verified",
        moderation: "cleared",
        capsuleId: row.capsule_id,
        buildId: row.build_id,
        contentHash: row.content_hash,
        resultHash: row.result_hash,
      });
      const recovery = new GhostForegroundOwnerRecovery({
        endpoint: "https://publication.test",
        vault,
        bearer: { acquireAuthorization: () => Promise.resolve({ authorization: "Bearer fresh" }) },
        fetch: (url) =>
          Promise.resolve(
            (url instanceof Request ? url.url : new Request(url).url).includes("?scope=own")
              ? Response.json({ capsules: [row] })
              : new Response(f.bytes),
          ),
      });
      await expect(recovery.recoverOnce(row.capsule_id)).rejects.toThrow(/manifest.*cloud custody/u);
      expect(await storedState(backend)).toEqual(before);
    },
  );
  it.each([false, true])(
    "uses fresh action bearers, binds catalog custody, and imports one complete object (legacy=%s)",
    async (legacy) => {
      const f = await source("cloud-owner-capsule", legacy),
        destination = new GhostLocalVault(createMemoryGhostVaultBackend());
      let tokens = 0,
        objects = 0;
      const recovery = new GhostForegroundOwnerRecovery({
        endpoint: "https://publication.test/",
        vault: destination,
        bearer: {
          acquireAuthorization() {
            tokens += 1;
            return Promise.resolve({ authorization: `Bearer fresh-${String(tokens)}` });
          },
        },
        fetch: (input) => {
          const request = input instanceof Request ? input : new Request(input);
          if (request.url.endsWith("/v1/capsules?scope=own"))
            return Promise.resolve(Response.json({ capsules: [f.row] }));
          objects += 1;
          expect(new URL(request.url).pathname).toBe(`/v1/capsules/${f.manifest.id}/object`);
          return Promise.resolve(new Response(f.bytes, { status: 200 }));
        },
      });
      await expect(recovery.recoverOnce(f.manifest.id)).resolves.toMatchObject({
        status: "recovered",
        manifest: { rootIntegrity: f.manifest.rootIntegrity },
      });
      expect(tokens).toBe(2);
      expect(objects).toBe(1);
      await expect(recovery.recoverOnce(f.manifest.id)).resolves.toMatchObject({ status: "already-recovered" });
      await expect(recovery.recoverOnce("not-owned")).resolves.toEqual({ status: "absent" });
    },
  );
  it("rejects ranges, altered metadata/bytes, and local custody conflicts without accepting remote bytes", async () => {
    const f = await source();
    for (const input of [
      { response: new Response(f.bytes, { status: 206, headers: { "content-range": "bytes 0-1/2" } }), row: f.row },
      { response: new Response(Uint8Array.of(1, 2), { status: 200 }), row: f.row },
      {
        response: new Response(f.bytes, { status: 200 }),
        row: { ...f.row, verdict_json: JSON.stringify({ status: "verified", moderation: "held" }) },
      },
    ]) {
      const vault = new GhostLocalVault(createMemoryGhostVaultBackend()),
        recovery = new GhostForegroundOwnerRecovery({
          endpoint: "https://publication.test",
          vault,
          bearer: {
            acquireAuthorization() {
              return Promise.resolve({ authorization: "Bearer fresh" });
            },
          },
          fetch: (url) =>
            Promise.resolve(
              (url instanceof Request ? url.url : new Request(url).url).includes("?scope=own")
                ? Response.json({ capsules: [input.row] })
                : input.response,
            ),
        });
      await expect(recovery.recoverOnce(f.manifest.id)).rejects.toThrow();
      expect(await vault.getManifest(f.manifest.id)).toBeUndefined();
    }
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    await vault.importCapsule(f.encoded);
    const conflict = { ...f.row, result_hash: "different" };
    conflict.verdict_json = JSON.stringify({
      status: "verified",
      moderation: "cleared",
      capsuleId: f.manifest.id,
      buildId: "tear-local-capsule",
      contentHash: conflict.content_hash,
      resultHash: "different",
    });
    const recovery = new GhostForegroundOwnerRecovery({
      endpoint: "https://publication.test",
      vault,
      bearer: {
        acquireAuthorization() {
          return Promise.resolve({ authorization: "Bearer fresh" });
        },
      },
      fetch: () => Promise.resolve(Response.json({ capsules: [conflict] })),
    });
    await expect(recovery.recoverOnce(f.manifest.id)).rejects.toThrow(/conflicts/u);
  });
});
