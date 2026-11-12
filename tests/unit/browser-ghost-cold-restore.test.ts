import { describe, expect, it, vi } from "vitest";
import { createGhostColdRestoreBrowserPort, createBrowserGhostColdRestore } from "../../src/ghost/browser-cold-restore";
import { createMemoryGhostVaultBackend, GhostLocalVault, GhostStreamingRecorder, GHOST_VAULT_STORES, type GhostVaultBackend } from "../../src/ghost/capsule-vault";
import { GhostCapsuleReader } from "../../src/ghost/capsule-reader";
import { inspectBrowserGhostVaultReadOnly } from "../../src/ghost/browser-capsule-vault";
import { createIndexedDbGhostVaultBackend } from "../../src/ghost/indexeddb-vault-backend";
import { ghostColdRestoreJobKey } from "../../src/ghost/cold-restore-job";
import { createGhostVaultLibraryController } from "../../src/app/library/ghost-vault-library-controller";
import type { GhostArchiveFile } from "../../src/app/library/browser-ghost-archive-files";
vi.mock("../../src/ghost/indexeddb-vault-backend", () => ({ createIndexedDbGhostVaultBackend: vi.fn() }));

async function fixture(id = "browser-cold-source") {
  const vault = new GhostLocalVault(createMemoryGhostVaultBackend()), recorder = new GhostStreamingRecorder({ sessionId: id, createdAt: "2026-10-19T00:00:00Z", vault, chunkEntries: 1, maxPendingWrites: 1 });
  await recorder.start(); await recorder.append({ kind: "commands", tick: 1, value: { action: "jump" } }); await recorder.finalize("2026-10-19T00:00:01Z");
  return new TextEncoder().encode(await vault.exportCapsule(id));
}
const snapshot = async (backend: GhostVaultBackend) => Promise.all(GHOST_VAULT_STORES.map(async (store) => [store, await Promise.all((await backend.keys(store)).map(async (key) => [key, await backend.get(store, key)]))]));
describe("normal browser cold restore facade", () => {
  it("C39 review: fences the displayed job inside the core read instead of adopting another facade's claimed lease", async () => {
    const base = createMemoryGhostVaultBackend(); let reads = 0, phase = "setup", releaseA: (() => void) | undefined, releaseB: (() => void) | undefined;
    const backend: GhostVaultBackend = { ...base,
      async get(store, key) {
        if (phase === "A" && key === ghostColdRestoreJobKey("two-facades") && ++reads === 2) {
          phase = "B"; await new Promise<void>((resolve) => { releaseA = resolve; });
        }
        return base.get(store, key);
      },
      async commitIfMatches(guards, writes) {
        if (phase === "B" && writes.some((write) => write.key.startsWith("ghost-cold-restore:result:"))) {
          phase = "A-resume"; await new Promise<void>((resolve) => { releaseB = resolve; });
        }
        await base.commitIfMatches(guards, writes);
      },
    };
    const a = createGhostColdRestoreBrowserPort(new GhostLocalVault(backend)), b = createGhostColdRestoreBrowserPort(new GhostLocalVault(backend)), bytes = await fixture();
    const { job } = await a.select("two-facades", bytes); phase = "A";
    const aResult = a.restore(job, bytes).then(() => "fulfilled", (error: unknown) => error instanceof Error ? error.message : "rejected");
    await vi.waitFor(() => { expect(releaseA).toBeTypeOf("function"); });
    const bResult = b.restore(job, bytes).then(() => "fulfilled", (error: unknown) => error instanceof Error ? error.message : "rejected");
    await vi.waitFor(() => { expect(releaseB).toBeTypeOf("function"); });
    const bClaim = await base.get("analysis", ghostColdRestoreJobKey(job.id)); releaseA?.();
    const aOutcome = await aResult, afterA = await base.get("analysis", ghostColdRestoreJobKey(job.id));
    releaseB?.(); const bOutcome = await bResult;
    expect(aOutcome).toMatch(/revision|displayed/u); expect(bOutcome).toBe("fulfilled"); expect(afterA).toBe(bClaim);
    expect((await a.jobs())[0]?.state).toBe("complete");
  });

  it("C39 review: completion winning before captured-ready cancellation remains historical and immutable", async () => {
    const backend = createMemoryGhostVaultBackend(), a = createGhostColdRestoreBrowserPort(new GhostLocalVault(backend)), b = createGhostColdRestoreBrowserPort(new GhostLocalVault(backend)), bytes = await fixture();
    let choose: ((file: GhostArchiveFile) => void) | undefined;
    const controller = createGhostVaultLibraryController({ restore: a, newIntent: () => "completion-wins", files: { pick: (selected) => { choose = selected; return () => undefined; }, download: () => undefined },
      repair: () => Promise.reject(new Error("not requested")), inspect: () => Promise.resolve({ manifests: [], maintenance: { schemaVersion: 1, checkedAt: "now", maximumBytes: 0, evictedCapsuleIds: [], integrity: [], rebuiltIndexes: 0, libraries: { schemaVersion: 1, entries: [], rejectedEntryKeys: [] } } }) });
    controller.pickArchive(); choose?.({ size: bytes.byteLength, arrayBuffer: () => Promise.resolve(Uint8Array.from(bytes).buffer) });
    await vi.waitFor(() => { expect(controller.snapshot().archive?.status).toBe("ready"); });
    const ready = (await a.jobs())[0]; if (!ready) throw new Error("missing ready job"); await b.restore(ready, bytes);
    const before = await snapshot(backend); controller.cancelArchive(ready.id, ready.revision);
    await vi.waitFor(() => { expect(controller.snapshot().archive?.status).toBe("reselect-required"); });
    expect(controller.snapshot().archive?.detail).toMatch(/validate current custody/u); expect(await snapshot(backend)).toEqual(before);
    const historical = await a.cancel(ready); expect(historical.state).toBe("complete");
    await backend.put("analysis", ghostColdRestoreJobKey(ready.id), JSON.stringify({ ...historical, binding: { ...historical.binding, sha256: "f".repeat(64) } }));
    const tampered = await snapshot(backend); await expect(a.cancel(ready)).rejects.toThrow(/intent|revision/u); expect(await snapshot(backend)).toEqual(tampered);
  });

  it("C39 review: reserves same-facade attempt ownership before the first asynchronous read", async () => {
    const base = createMemoryGhostVaultBackend(); let pause = false, release: (() => void) | undefined;
    const backend: GhostVaultBackend = { ...base, async get(store, key) {
      if (pause && key === ghostColdRestoreJobKey("local-overlap")) { pause = false; await new Promise<void>((resolve) => { release = resolve; }); }
      return base.get(store, key);
    } };
    const port = createGhostColdRestoreBrowserPort(new GhostLocalVault(backend)), bytes = await fixture(), { job } = await port.select("local-overlap", bytes); pause = true;
    const first = port.restore(job, bytes).then(() => "fulfilled", (error: unknown) => error instanceof Error ? error.message : "rejected");
    await vi.waitFor(() => { expect(release).toBeTypeOf("function"); });
    const second = await port.restore(job, bytes).then(() => "fulfilled", (error: unknown) => error instanceof Error ? error.message : "rejected");
    release?.(); const firstOutcome = await first;
    expect(firstOutcome).toBe("fulfilled"); expect(second).toMatch(/already|overlap|active/u);
  });
  it("keeps preview and reload metadata separate from exact explicit restore, then validates historical custody", async () => {
    const bytes = await fixture(), backend = createMemoryGhostVaultBackend(), vault = new GhostLocalVault(backend), first = createGhostColdRestoreBrowserPort(vault);
    const selected = await first.select("owned-job", bytes); expect(selected.job.state).toBe("ready"); expect(await vault.getManifest("browser-cold-source")).toBeUndefined();
    const reloaded = createGhostColdRestoreBrowserPort(vault); expect(await reloaded.jobs()).toEqual([selected.job]);
    await expect(reloaded.reselect(selected.job.id, await fixture("unrelated"))).rejects.toThrow(/exact original/u);
    const resumed = await reloaded.reselect(selected.job.id, bytes); await reloaded.restore(resumed.job, bytes);
    expect((await new GhostCapsuleReader(vault).read("browser-cold-source")).manifest.status).toBe("complete");
    const historical = (await reloaded.jobs())[0]; if (!historical) throw new Error("missing history");
    const before = await snapshot(backend); await reloaded.restore(historical, bytes); expect(await snapshot(backend)).toEqual(before);
    const manifest = await vault.getManifest("browser-cold-source"); if (!manifest?.chunks[0]) throw new Error("missing chunk");
    await backend.remove("chunks", manifest.chunks[0].id);
    await expect(reloaded.restore(historical, bytes)).rejects.toThrow(/historical cold restore/u);
  });
  it("cancels the exact captured ready revision and rejects stale/foreign revisions", async () => {
    const backend = createMemoryGhostVaultBackend(), port = createGhostColdRestoreBrowserPort(new GhostLocalVault(backend)), bytes = await fixture();
    const { job } = await port.select("cancel-job", bytes); const cancelled = await port.cancel(job); expect(cancelled.state).toBe("cancelled");
    await expect(port.restore(job, bytes)).rejects.toThrow(/revision changed/u);
    await expect(port.cancel(job)).rejects.toThrow(/revision changed/u);
    expect(await backend.keys("manifests")).toEqual([]);
  });
  it("cancels only its own running successor lease at the actual final import boundary", async () => {
    const base = createMemoryGhostVaultBackend(); let release: (() => void) | undefined;
    const backend: GhostVaultBackend = { ...base, async commitIfMatches(guards, writes) {
      if (writes.some((write) => write.key.startsWith("ghost-cold-restore:result:"))) await new Promise<void>((resolve) => { release = resolve; });
      await base.commitIfMatches(guards, writes);
    } };
    const port = createGhostColdRestoreBrowserPort(new GhostLocalVault(backend)), bytes = await fixture(), { job } = await port.select("active-cancel", bytes);
    const pending = port.restore(job, bytes); const rejected = expect(pending).rejects.toThrow(/cancellation won/u);
    await vi.waitFor(() => { expect(release).toBeTypeOf("function"); }); expect((await port.cancel(job)).state).toBe("cancelled");
    release?.(); await rejected; expect(await base.keys("manifests")).toEqual([]);
    const other = createGhostColdRestoreBrowserPort(new GhostLocalVault(backend)); await expect(other.cancel(job)).rejects.toThrow(/revision changed/u);
  });
  it("inspects initial/populated custody without maintenance, eviction, repair, source protection or other writes", async () => {
    const backend = createMemoryGhostVaultBackend(), vault = new GhostLocalVault(backend);
    await vault.importCapsule(new TextDecoder().decode(await fixture()));
    await backend.put("indexes", "manifest:browser-cold-source", "foreign-index");
    await backend.put("settings", "preserve", "owned-settings");
    const manifest = await vault.getManifest("browser-cold-source"); if (!manifest?.chunks[0]) throw new Error("missing chunk");
    await backend.put("chunks", manifest.chunks[0].id, "corrupt-original");
    const inspected = { ...backend, put: vi.fn(backend.put.bind(backend)), remove: vi.fn(backend.remove.bind(backend)), commit: vi.fn(backend.commit.bind(backend)),
      commitIfMatches: vi.fn(backend.commitIfMatches.bind(backend)), commitWhileJournalMatches: vi.fn(backend.commitWhileJournalMatches.bind(backend)) };
    vi.mocked(createIndexedDbGhostVaultBackend).mockResolvedValue(inspected);
    const before = await snapshot(backend), catalog = await inspectBrowserGhostVaultReadOnly({} as IDBFactory);
    expect(catalog.manifests).toHaveLength(1); expect(catalog.maintenance.rebuiltIndexes).toBe(0); expect(catalog.maintenance.evictedCapsuleIds).toEqual([]);
    expect(catalog.maintenance.integrity[0]?.healthy).toBe(false);
    for (const method of [inspected.put, inspected.remove, inspected.commit, inspected.commitIfMatches, inspected.commitWhileJournalMatches]) expect(method).not.toHaveBeenCalled();
    expect(await snapshot(backend)).toEqual(before);
  });
  it("opens storage only when explicitly used and refuses corrupt durable metadata", async () => {
    vi.mocked(createIndexedDbGhostVaultBackend).mockClear(); const backend = createMemoryGhostVaultBackend(); vi.mocked(createIndexedDbGhostVaultBackend).mockResolvedValue(backend);
    const port = createBrowserGhostColdRestore({} as IDBFactory); expect(createIndexedDbGhostVaultBackend).not.toHaveBeenCalled();
    await backend.put("analysis", ghostColdRestoreJobKey("bad-job"), "malformed"); await expect(port.jobs()).rejects.toThrow();
    await expect(createBrowserGhostColdRestore(undefined).jobs()).rejects.toThrow(/unavailable/u);
  });
});
