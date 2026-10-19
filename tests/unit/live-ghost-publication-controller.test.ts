import { afterEach, describe, expect, it, vi } from "vitest";
import type { GhostVaultBackend, GhostVaultStore } from "../../src/ghost";

let activeBackend: GhostVaultBackend | undefined;
let factoryQueue: Promise<GhostVaultBackend>[] = [];
vi.mock("../../src/ghost", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../src/ghost");
  return { ...actual, createIndexedDbGhostVaultBackend: () => {
    const queued = factoryQueue.shift(); if (queued !== undefined) return queued;
    if (activeBackend === undefined) return Promise.reject(new Error("test backend is unavailable"));
    return Promise.resolve(activeBackend);
  } };
});

import { GhostLocalPublicationConsentLedger, GhostLocalVault, GhostStreamingRecorder, createMemoryGhostVaultBackend } from "../../src/ghost";
import { LiveGhostPublicationController } from "../../src/app/live-ghost-publication-controller";
import type { GhostPublicationRuntime } from "../../src/platform/ghost-publication-runtime";

const capsuleId = "controller-capsule";
const runtime: GhostPublicationRuntime = Object.freeze({ available: true, endpoint: "https://publication.test", acquireAuthorization: () => Promise.resolve({ authorization: "Bearer test" }) });

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } { let resolve!: (value: T) => void; const promise = new Promise<T>((next) => { resolve = next; }); return { promise, resolve }; }
async function seed(backend: GhostVaultBackend, id: string): Promise<void> {
  const vault = new GhostLocalVault(backend), recorder = new GhostStreamingRecorder({ sessionId: id, createdAt: "2026-08-09T00:00:00.000Z", vault, chunkEntries: 1, maxPendingWrites: 1 });
  await recorder.start(); await recorder.append({ kind: "commands", tick: 1, value: { command: "move" } }); await recorder.finalize("2026-08-09T00:00:01.000Z");
}
async function fixture(id = capsuleId): Promise<{ readonly backend: GhostVaultBackend; readonly factory: IDBFactory }> {
  const backend = createMemoryGhostVaultBackend(); activeBackend = backend;
  await seed(backend, id);
  return { backend, factory: {} as IDBFactory };
}

describe("LiveGhostPublicationController durable C38 lifecycle", () => {
  afterEach(() => { vi.unstubAllGlobals(); factoryQueue = []; activeBackend = undefined; });

  it("reopens the same durable job without creating another consent revision or custody", async () => {
    const f = await fixture(); const actor = "signed-in-player";
    const first = new LiveGhostPublicationController(f.factory, runtime, () => actor);
    await first.open(capsuleId); await first.grant();
    const ledger = new GhostLocalPublicationConsentLedger(f.backend), consent = await ledger.read({ subject: actor, isAnonymous: false });
    const jobs = await f.backend.keys("uploadJobs"), custodyBefore = await f.backend.get("analysis", `ghost-publication-custody:v1:${capsuleId}`);
    expect(jobs).toHaveLength(1); expect(consent.revision).toBe(1); expect(custodyBefore).toBeDefined();

    const second = new LiveGhostPublicationController(f.factory, runtime, () => actor);
    await second.open(capsuleId);
    expect(second.snapshot()).toMatchObject({ status: "queued", capsuleId, canGrant: false, canRun: true, canCancel: true, attempts: 0 });
    expect(await ledger.read({ subject: actor, isAnonymous: false })).toEqual(consent);
    expect(await f.backend.keys("uploadJobs")).toEqual(jobs);
    expect(await f.backend.get("analysis", `ghost-publication-custody:v1:${capsuleId}`)).toBe(custodyBefore);
  });

  it("fails closed on an account change before any network action", async () => {
    const f = await fixture(); let actor = "signed-in-player";
    const controller = new LiveGhostPublicationController(f.factory, runtime, () => actor);
    await controller.open(capsuleId); await controller.grant(); actor = "different-player";
    const fetch = vi.fn(() => Promise.reject(new Error("network must not be reached"))); vi.stubGlobal("fetch", fetch);
    await controller.runOnce(); await controller.cancel();
    expect(fetch).not.toHaveBeenCalled(); expect(controller.snapshot().status).toBe("unavailable");
    vi.unstubAllGlobals();
  });

  it.each(["account", "capsule"] as const)("does not send a pending bearer after the reviewed %s changes", async (change) => {
    const f = await fixture(); await seed(f.backend, "newer-capsule"); let actor = "signed-in-player";
    const started = deferred<boolean>(), authorization = deferred<Readonly<{ authorization: string }>>();
    const pendingRuntime: GhostPublicationRuntime = { ...runtime, acquireAuthorization() { started.resolve(true); return authorization.promise; } };
    const controller = new LiveGhostPublicationController(f.factory, pendingRuntime, () => actor);
    await controller.open(capsuleId); await controller.grant();
    const jobKeys = await f.backend.keys("uploadJobs"), jobKey = jobKeys[0] ?? "", jobBefore = await f.backend.get("uploadJobs", jobKey);
    const custodyBefore = await f.backend.get("analysis", `ghost-publication-custody:v1:${capsuleId}`);
    const ledger = new GhostLocalPublicationConsentLedger(f.backend), consentBefore = await ledger.read({ subject: actor, isAnonymous: false });
    const fetch = vi.fn(() => Promise.resolve(Response.json({ error: "unauthorized" }, { status: 401 }))); vi.stubGlobal("fetch", fetch);
    const run = controller.runOnce(); await started.promise;
    if (change === "account") actor = "different-player";
    await controller.open(change === "account" ? capsuleId : "newer-capsule"); const newerView = controller.snapshot();
    authorization.resolve({ authorization: "Bearer pending" }); await run;
    expect(fetch).not.toHaveBeenCalled(); expect(controller.snapshot()).toBe(newerView);
    expect(await f.backend.keys("uploadJobs")).toEqual(jobKeys); expect(await f.backend.get("uploadJobs", jobKey)).toBe(jobBefore);
    expect(await f.backend.get("analysis", `ghost-publication-custody:v1:${capsuleId}`)).toBe(custodyBefore);
    expect(await ledger.read({ subject: "signed-in-player", isAnonymous: false })).toEqual(consentBefore);
    const jobId = (JSON.parse(jobBefore ?? "{}") as { id: string }).id;
    expect(JSON.parse(await f.backend.get("analysis", `ghost-publication-transport:v1:${jobId}`) ?? "{}")).not.toHaveProperty("terminal");
  });

  it("keeps a newer cancellation authoritative when an older upload token resolves", async () => {
    const f = await fixture(), started = deferred<boolean>(), authorization = deferred<Readonly<{ authorization: string }>>(); let acquisitions = 0;
    const pendingRuntime: GhostPublicationRuntime = { ...runtime, acquireAuthorization() { acquisitions += 1; if (acquisitions > 1) return Promise.reject(new Error("firebase-token-unavailable")); started.resolve(true); return authorization.promise; } };
    const controller = new LiveGhostPublicationController(f.factory, pendingRuntime, () => "signed-in-player"); await controller.open(capsuleId); await controller.grant();
    const fetch = vi.fn(() => Promise.resolve(Response.json({ error: "unauthorized" }, { status: 401 }))); vi.stubGlobal("fetch", fetch);
    const run = controller.runOnce(); await started.promise; await controller.cancel(); const cancelledView = controller.snapshot();
    expect(cancelledView).toMatchObject({ status: "terminal", terminal: "cancelled" });
    authorization.resolve({ authorization: "Bearer pending" }); await run;
    expect(fetch).not.toHaveBeenCalled(); expect(controller.snapshot()).toBe(cancelledView);
    const jobKey = (await f.backend.keys("uploadJobs"))[0] ?? "", job = JSON.parse(await f.backend.get("uploadJobs", jobKey) ?? "{}") as { id: string; status: string };
    expect(job.status).toBe("cancelled");
    expect(JSON.parse(await f.backend.get("analysis", `ghost-publication-transport:v1:${job.id}`) ?? "{}")).toMatchObject({ terminal: "cancelled" });
  });

  it.each(["account", "cancel", "cancel-after-body", "other-controller-cancel"] as const)("does not commit an older successful response after %s", async (change) => {
    const f = await fixture(); let actor = "signed-in-player";
    const controller = new LiveGhostPublicationController(f.factory, runtime, () => actor); await controller.open(capsuleId); await controller.grant();
    const started = deferred<boolean>(), response = deferred<Response>(), responseBody = deferred<unknown>();
    const fetch = vi.fn((url: string) => {
      if (url.endsWith("/abort")) return Promise.resolve(Response.json({ capsuleId, status: "deleted" }));
      if (change === "cancel-after-body") {
        const pending = Response.json({}); vi.spyOn(pending, "json").mockImplementation(() => { started.resolve(true); return responseBody.promise; }); return Promise.resolve(pending);
      }
      started.resolve(true); return response.promise;
    }); vi.stubGlobal("fetch", fetch);
    const run = controller.runOnce(); await started.promise;
    if (change === "account") { actor = "different-player"; await controller.open(capsuleId); }
    else if (change === "other-controller-cancel") { const other = new LiveGhostPublicationController(f.factory, runtime, () => actor); await other.open(capsuleId); await other.cancel(); }
    else await controller.cancel();
    const newerView = controller.snapshot(), requestCount = fetch.mock.calls.length;
    const success = { capsuleId, uploadId: "immutable-upload", status: change === "other-controller-cancel" ? "uploading" : "finalized" };
    if (change === "cancel-after-body") responseBody.resolve(success); else response.resolve(Response.json(success));
    await run;
    expect(fetch).toHaveBeenCalledTimes(requestCount);
    if (change === "other-controller-cancel") expect(controller.snapshot()).toMatchObject({ terminal: "cancelled" }); else expect(controller.snapshot()).toBe(newerView);
    const jobKey = (await f.backend.keys("uploadJobs"))[0] ?? "", job = JSON.parse(await f.backend.get("uploadJobs", jobKey) ?? "{}") as { id: string; status: string };
    const transport = await f.backend.get("analysis", `ghost-publication-transport:v1:${job.id}`);
    if (change === "account") { expect(job.status).toBe("queued"); expect(transport).toBeUndefined(); }
    else { expect(job.status).toBe("cancelled"); expect(JSON.parse(transport ?? "{}")).toMatchObject({ terminal: "cancelled" }); }
  });

  it("stops another controller's upload while its durable cancellation awaits remote abort", async () => {
    const f = await fixture(), controller = new LiveGhostPublicationController(f.factory, runtime, () => "signed-in-player"); await controller.open(capsuleId); await controller.grant();
    const started = deferred<boolean>(), abortStarted = deferred<boolean>(), response = deferred<Response>(), abortResponse = deferred<Response>();
    const fetch = vi.fn((url: string) => { if (url.endsWith("/abort")) { abortStarted.resolve(true); return abortResponse.promise; } started.resolve(true); return response.promise; }); vi.stubGlobal("fetch", fetch);
    const run = controller.runOnce(); await started.promise;
    const other = new LiveGhostPublicationController(f.factory, runtime, () => "signed-in-player"); await other.open(capsuleId); const cancel = other.cancel(); await abortStarted.promise;
    const requestCount = fetch.mock.calls.length; response.resolve(Response.json({ capsuleId, uploadId: "immutable-upload", status: "uploading" })); await run;
    abortResponse.resolve(Response.json({ capsuleId, status: "deleted" })); await cancel;
    expect(fetch).toHaveBeenCalledTimes(requestCount); expect(controller.snapshot()).toMatchObject({ terminal: "cancelled" }); expect(other.snapshot()).toMatchObject({ terminal: "cancelled" });
  });

  it("does not send a pending bearer after exact publication consent is withdrawn", async () => {
    const f = await fixture(), actor = "signed-in-player", started = deferred<boolean>(), authorization = deferred<Readonly<{ authorization: string }>>();
    const pendingRuntime: GhostPublicationRuntime = { ...runtime, acquireAuthorization() { started.resolve(true); return authorization.promise; } };
    const controller = new LiveGhostPublicationController(f.factory, pendingRuntime, () => actor); await controller.open(capsuleId); await controller.grant();
    const fetch = vi.fn(() => Promise.resolve(Response.json({ error: "unauthorized" }, { status: 401 }))); vi.stubGlobal("fetch", fetch);
    const run = controller.runOnce(); await started.promise;
    const ledger = new GhostLocalPublicationConsentLedger(f.backend); await ledger.decide({ subject: actor, isAnonymous: false }, { revision: 2, cloudPublication: "revoked", decidedAt: "2026-10-19T04:00:00.000Z" });
    authorization.resolve({ authorization: "Bearer pending" }); await run;
    expect(fetch).not.toHaveBeenCalled(); expect(controller.snapshot()).toMatchObject({ terminal: "cancelled" });
    const jobKey = (await f.backend.keys("uploadJobs"))[0] ?? ""; expect(JSON.parse(await f.backend.get("uploadJobs", jobKey) ?? "{}")).toMatchObject({ status: "cancelled", cancellationReason: "source-or-custody-changed" });
    await controller.open(capsuleId); expect(controller.snapshot()).toMatchObject({ status: "ready", canGrant: true }); expect(controller.snapshot().canRun).toBeUndefined();
    expect(await ledger.read({ subject: actor, isAnonymous: false })).toMatchObject({ revision: 2, cloudPublication: "revoked" });
  });

  it("does not revive a queued job after its exact consent revision is withdrawn", async () => {
    const f = await fixture(); const actor = "signed-in-player", first = new LiveGhostPublicationController(f.factory, runtime, () => actor);
    await first.open(capsuleId); await first.grant();
    const ledger = new GhostLocalPublicationConsentLedger(f.backend);
    await ledger.decide({ subject: actor, isAnonymous: false }, { revision: 2, cloudPublication: "revoked", decidedAt: "2026-08-09T00:02:00.000Z" });
    const reopened = new LiveGhostPublicationController(f.factory, runtime, () => actor); await reopened.open(capsuleId);
    expect(reopened.snapshot()).toMatchObject({ status: "ready", canGrant: true }); expect(reopened.snapshot().canRun).toBeUndefined();
    const raw = await f.backend.get("uploadJobs", (await f.backend.keys("uploadJobs"))[0] ?? "");
    expect(raw).toContain('"status":"cancelled"'); expect((await ledger.read({ subject: actor, isAnonymous: false })).revision).toBe(2);
  });

  it("keeps the newest open result authoritative when an older open resolves later", async () => {
    const f = await fixture("capsule-a"); await seed(f.backend, "capsule-b"); const a = deferred<GhostVaultBackend>(), b = deferred<GhostVaultBackend>(); factoryQueue = [a.promise, b.promise];
    const controller = new LiveGhostPublicationController(f.factory, runtime, () => "signed-in-player"); const openA = controller.open("capsule-a"), openB = controller.open("capsule-b"); b.resolve(f.backend); await openB; a.resolve(f.backend); await openA;
    expect(controller.snapshot()).toMatchObject({ status: "ready", capsuleId: "capsule-b", canGrant: true }); expect((await f.backend.keys("uploadJobs"))).toHaveLength(0);
  });

  it("does not let a pending grant for capsule A assign custody or consent to capsule B", async () => {
    const f = await fixture("capsule-a"); await seed(f.backend, "capsule-b"); const controller = new LiveGhostPublicationController(f.factory, runtime, () => "signed-in-player"); await controller.open("capsule-a");
    const gate = deferred<GhostVaultBackend>(); factoryQueue = [gate.promise, Promise.resolve(f.backend)]; const grant = controller.grant(); const openB = controller.open("capsule-b"); await openB; gate.resolve(f.backend); await grant;
    const consent = await new GhostLocalPublicationConsentLedger(f.backend).read({ subject: "signed-in-player", isAnonymous: false }); expect(consent.revision).toBe(0); expect(controller.snapshot()).toMatchObject({ status: "ready", capsuleId: "capsule-b", canGrant: true }); expect(await f.backend.keys("uploadJobs")).toHaveLength(0);
  });

  it("pins pending local reads to the initiating account", async () => {
    const f = await fixture(); let actor = "signed-in-player"; const controller = new LiveGhostPublicationController(f.factory, runtime, () => actor); await controller.open(capsuleId);
    const gate = deferred<boolean>(), base = f.backend; activeBackend = Object.freeze({ ...base, async get(store: GhostVaultStore, key: string) { if (store === "analysis" && key.startsWith("ghost-publication-consent:")) await gate.promise; return base.get(store, key); } });
    const grant = controller.grant(); actor = "different-player"; gate.resolve(true); await grant;
    expect((await new GhostLocalPublicationConsentLedger(base).read({ subject: "signed-in-player", isAnonymous: false })).revision).toBe(0); expect(await base.keys("uploadJobs")).toHaveLength(0);
  });

  it("does not repaint a newer capsule when an authorized transport finishes later", async () => {
    const f = await fixture("capsule-a"); await seed(f.backend, "capsule-b"); const actor = "signed-in-player"; const controller = new LiveGhostPublicationController(f.factory, runtime, () => actor); await controller.open("capsule-a"); await controller.grant();
    const started = deferred<boolean>(), response = deferred<Response>(); const fetch = vi.fn(() => { started.resolve(true); return response.promise; }); vi.stubGlobal("fetch", fetch);
    const run = controller.runOnce(); await started.promise; await controller.open("capsule-b"); response.resolve(Response.json({ error: "unauthorized" }, { status: 401 })); await run;
    expect(controller.snapshot()).toMatchObject({ status: "ready", capsuleId: "capsule-b", canGrant: true }); vi.unstubAllGlobals();
  });
});
