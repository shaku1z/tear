import { describe, expect, it, vi } from "vitest";
import { GhostLocalVault, GhostStreamingRecorder, createMemoryGhostVaultBackend, GHOST_VAULT_STORES, reviseGhostCapsuleManifest, type GhostVaultBackend, type GhostVaultWrite, type TearGhostManifest } from "../../src/ghost/capsule-vault";
import { GhostCapsuleReader } from "../../src/ghost/capsule-reader";
import { GhostColdRestore, GhostColdRestoreError } from "../../src/ghost/cold-restore";
import { ghostColdRestoreJobKey, ghostColdRestoreResultKey, prepareGhostColdRestoreCompletion, readGhostColdRestoreCompletion } from "../../src/ghost/cold-restore-job";
import { prepareGhostCapsuleArchive } from "../../src/ghost/capsule-archive";
import type { GhostColdRestoreCompletion } from "../../src/ghost/cold-restore-job";
import { encodeGhostChunkPayload } from "../../src/ghost/capsule-codec";
import { stableVerificationHash } from "../../src/replay/hash";
import { ghostRootIntegrity } from "../../src/ghost/capsule-vault";

const now = () => "2026-10-19T00:00:02Z";
async function fixture(id = "cold-source") {
  const vault = new GhostLocalVault(createMemoryGhostVaultBackend()), recorder = new GhostStreamingRecorder({ sessionId: id, createdAt: "2026-10-19T00:00:00Z", chunkEntries: 1, maxPendingWrites: 2, vault });
  await recorder.start(); await recorder.append({ kind: "commands", tick: 1, value: { action: "jump" } }); await recorder.finalize("2026-10-19T00:00:01Z");
  return new TextEncoder().encode(await vault.exportCapsule(id));
}
async function snapshot(backend: GhostVaultBackend) {
  return Promise.all(GHOST_VAULT_STORES.map(async (store) => [store, await Promise.all((await backend.keys(store)).map(async (key) => [key, await backend.get(store, key)]))]));
}
function final(writes: readonly GhostVaultWrite[]) { return writes.some((write) => write.key.startsWith("ghost-cold-restore:result:")); }

describe("explicit durable normal cold restore", () => {
  it("imports original bytes and completes its job/result in one epoch-fenced CAS, then resolves exact retry without writes", async () => {
    const bytes = await fixture(), base = createMemoryGhostVaultBackend(); let commits = 0;
    const backend: GhostVaultBackend = { ...base, async commitIfMatches(guards, writes) {
      if (final(writes)) { commits++; expect(writes.some((write) => write.store === "manifests")).toBe(true); expect(writes.some((write) => write.key === ghostColdRestoreJobKey("job"))).toBe(true);
        expect(guards.some((guard) => guard.key === "ghost-manifest-mutation-epoch:v1")).toBe(true); expect(guards.some((guard) => guard.key === "manifest:cold-source")).toBe(true); expect(guards.some((guard) => guard.key.startsWith("ghost-capsule-protection:"))).toBe(true); }
      return base.commitIfMatches(guards, writes);
    } };
    const vault = new GhostLocalVault(backend), service = new GhostColdRestore(vault, { now });
    await service.select("job", bytes); const result = await service.restore("job", bytes);
    expect(result.kind).toBe("imported"); expect(commits).toBe(1); expect((await service.read("job"))?.state).toBe("complete");
    expect(JSON.parse(await vault.exportCapsule("cold-source"))).toEqual(JSON.parse(new TextDecoder().decode(bytes)));
    expect((await new GhostCapsuleReader(vault).read("cold-source")).tracks.commands).toHaveLength(1);
    const before = await snapshot(base); expect(await new GhostColdRestore(vault, { now }).restore("job", bytes)).toEqual(result); expect(await snapshot(base)).toEqual(before);
  });

  it("validates initially existing exact custody without rewriting any custody slot", async () => {
    const bytes = await fixture(), base = createMemoryGhostVaultBackend(), vault = new GhostLocalVault(base);
    await vault.importCapsule(new TextDecoder().decode(bytes));
    const backend: GhostVaultBackend = { ...base, async commitIfMatches(guards, writes) { if (final(writes)) expect(writes.every((write) => write.store === "analysis" || write.key === "ghost-manifest-mutation-epoch:v1")).toBe(true); return base.commitIfMatches(guards, writes); } };
    const service = new GhostColdRestore(new GhostLocalVault(backend), { now }); await service.select("job", bytes);
    expect((await service.restore("job", bytes)).kind).toBe("existing-exact");
  });

  it("rejects malformed input, different valid reselection, raised limits and unavailable crypto without custody/completion writes", async () => {
    const bytes = await fixture(), base = createMemoryGhostVaultBackend(), service = new GhostColdRestore(new GhostLocalVault(base), { now });
    const empty = await snapshot(base);
    await expect(service.select("bad", new TextEncoder().encode("{}"))).rejects.toMatchObject({ code: "invalid-archive" }); expect(await snapshot(base)).toEqual(empty);
    await expect(service.select("bad", bytes, { maxEncodedBytes: 1 })).rejects.toMatchObject({ code: "limits" }); expect(await snapshot(base)).toEqual(empty);
    vi.stubGlobal("crypto", undefined);
    try { await expect(service.select("bad", bytes)).rejects.toMatchObject({ code: "unavailable" }); } finally { vi.unstubAllGlobals(); }
    expect(await snapshot(base)).toEqual(empty);
    await service.select("job", bytes); const ready = await snapshot(base);
    await expect(new GhostColdRestore(new GhostLocalVault(base), { now }).restore("job", await fixture("different-source"))).rejects.toMatchObject({ code: "input-mismatch" }); expect(await snapshot(base)).toEqual(ready);
  });

  it.each(["manifest", "index", "chunk", "protection", "result"])("refuses final-CAS %s drift instead of adopting a new baseline", async (kind) => {
    const bytes = await fixture(), root = JSON.parse(new TextDecoder().decode(bytes)) as { manifest: TearGhostManifest; chunks: Record<string, string> }, base = createMemoryGhostVaultBackend(); let raced = false;
    const first = root.manifest.chunks[0]; if (first === undefined) throw new Error("missing fixture chunk");
    const backend: GhostVaultBackend = { ...base, async commitIfMatches(guards, writes) {
      if (final(writes) && !raced) { raced = true;
        if (kind === "manifest") await base.put("manifests", root.manifest.id, JSON.stringify(root.manifest));
        if (kind === "index") await base.put("indexes", `manifest:${root.manifest.id}`, "foreign-index");
        if (kind === "chunk") await base.put("chunks", first.id, root.chunks[first.id] ?? "");
        if (kind === "protection") await base.put("analysis", `ghost-capsule-protection:v1:${root.manifest.id}`, JSON.stringify({ format: "ghost-capsule-protection", schemaVersion: 1, capsuleId: root.manifest.id, rootIntegrity: root.manifest.rootIntegrity, owners: ["other-owner"] }));
        if (kind === "result") await base.put("analysis", ghostColdRestoreResultKey("job"), "foreign-result");
      } return base.commitIfMatches(guards, writes);
    } };
    const service = new GhostColdRestore(new GhostLocalVault(backend), { now }); await service.select("job", bytes);
    await expect(service.restore("job", bytes)).rejects.toMatchObject({ code: "commit-indeterminate" });
    expect((await service.read("job"))?.state).not.toBe("complete");
    expect(await base.get("analysis", ghostColdRestoreResultKey("job"))).toBe(kind === "result" ? "foreign-result" : undefined);
    if (kind !== "manifest") expect(await base.keys("manifests")).toEqual([]);
    if (kind !== "chunk") expect(await base.keys("chunks")).toEqual([]);
  });

  it("replans epoch-only contention without changing initial destination/job guards", async () => {
    const bytes = await fixture(), base = createMemoryGhostVaultBackend(); let attempts = 0; const jobs: string[] = [];
    const backend: GhostVaultBackend = { ...base, async commitIfMatches(guards, writes) { if (final(writes)) { attempts++; jobs.push(guards.find((guard) => guard.key === ghostColdRestoreJobKey("job"))?.expected ?? "");
      if (attempts === 1) await base.put("indexes", "ghost-manifest-mutation-epoch:v1", "1"); } return base.commitIfMatches(guards, writes); } };
    const service = new GhostColdRestore(new GhostLocalVault(backend), { now }); await service.select("job", bytes); await service.restore("job", bytes);
    expect(attempts).toBe(2); expect(jobs[0]).toBe(jobs[1]);
  });

  it.each(["cancel", "new-lease"])("refuses a stale writer when %s wins at the final boundary", async (kind) => {
    const bytes = await fixture(), base = createMemoryGhostVaultBackend(); let raced = false;
    const backend: GhostVaultBackend = { ...base, async commitIfMatches(guards, writes) { if (final(writes) && !raced) { raced = true; const job = await service.read("job"); if (job === undefined) throw new Error("missing job");
      if (kind === "cancel") await service.cancel("job", job.revision); else await base.put("analysis", ghostColdRestoreJobKey("job"), JSON.stringify({ ...job, revision: job.revision + 1, lease: "new-owner" })); }
      return base.commitIfMatches(guards, writes); } };
    const service = new GhostColdRestore(new GhostLocalVault(backend), { now }); await service.select("job", bytes);
    await expect(service.restore("job", bytes)).rejects.toMatchObject({ code: kind === "cancel" ? "cancelled" : "conflict" });
    expect(await base.keys("manifests")).toEqual([]); expect(await base.get("analysis", ghostColdRestoreResultKey("job"))).toBeUndefined();
  });

  it("cancel after committed completion does not undo custody; cancelled intent never revives", async () => {
    const bytes = await fixture(), vault = new GhostLocalVault(createMemoryGhostVaultBackend()), service = new GhostColdRestore(vault, { now });
    const job = await service.select("cancelled", bytes); await service.cancel(job.id, job.revision);
    await expect(service.restore(job.id, bytes)).rejects.toMatchObject({ code: "cancelled" });
    await service.select("committed", bytes); await service.restore("committed", bytes); const before = await snapshot(vault.backend());
    expect((await service.cancel("committed", 0)).state).toBe("complete"); expect(await snapshot(vault.backend())).toEqual(before);
  });

  it.each(["before", "after", "after-resolution-drift"])("resolves response loss %s without adopting or rewriting unrelated custody", async (when) => {
    const bytes = await fixture(), root = JSON.parse(new TextDecoder().decode(bytes)) as { manifest: TearGhostManifest }, first = root.manifest.chunks[0]; if (first === undefined) throw new Error("missing chunk");
    const base = createMemoryGhostVaultBackend(); let lost = false;
    const backend: GhostVaultBackend = { ...base, async commitIfMatches(guards, writes) {
      if (when === "after-resolution-drift" && lost && writes.length === 0 && guards.some((guard) => guard.key === ghostColdRestoreResultKey("job"))) await base.put("chunks", first.id, "changed-at-joint-fence");
      if (final(writes) && !lost) { lost = true; if (when !== "before") await base.commitIfMatches(guards, writes); throw new Error("response lost"); }
      return base.commitIfMatches(guards, writes);
    } };
    const service = new GhostColdRestore(new GhostLocalVault(backend), { now }); await service.select("job", bytes);
    if (when === "after") { expect((await service.restore("job", bytes)).kind).toBe("imported"); expect((await service.read("job"))?.state).toBe("complete"); }
    else if (when === "before") { await expect(service.restore("job", bytes)).rejects.toMatchObject({ code: "conflict" }); expect(await base.keys("manifests")).toEqual([]); expect((await service.read("job"))?.state).toBe("failed"); await service.restore("job", bytes); }
    else { await expect(service.restore("job", bytes)).rejects.toMatchObject({ code: "commit-indeterminate" }); expect((await service.read("job"))?.state).toBe("complete"); expect(await base.get("chunks", first.id)).toBe("changed-at-joint-fence"); }
  });

  it.each(["read failure", "malformed metadata"])("retains committed custody and returns typed uncertainty after response loss then resolution %s", async (failure) => {
    const bytes = await fixture(), base = createMemoryGhostVaultBackend(); let committed = false, readFailed = false, writesAfterCommit = 0;
    const backend: GhostVaultBackend = { ...base,
      get(store, key) {
        if (committed && !readFailed && store === "analysis" && key === ghostColdRestoreJobKey("job")) {
          readFailed = true;
          if (failure === "read failure") return Promise.reject(new Error("postcommit backend read unavailable"));
          return Promise.resolve("{malformed-resolution-metadata");
        }
        return base.get(store, key);
      },
      async commitIfMatches(guards, writes) {
        if (committed) writesAfterCommit += writes.length;
        if (final(writes) && !committed) { await base.commitIfMatches(guards, writes); committed = true; throw new Error("committed import response lost"); }
        return base.commitIfMatches(guards, writes);
      },
    };
    const vault = new GhostLocalVault(backend), service = new GhostColdRestore(vault, { now }); await service.select("job", bytes);
    const error = await service.restore("job", bytes).then(() => undefined, (reason: unknown) => reason);
    const jobRaw = await base.get("analysis", ghostColdRestoreJobKey("job")), resultRaw = await base.get("analysis", ghostColdRestoreResultKey("job"));
    expect(jobRaw).toBeDefined(); expect(resultRaw).toBeDefined(); expect(JSON.parse(jobRaw ?? "null")).toMatchObject({ state: "complete" });
    expect(await base.keys("manifests")).toEqual(["cold-source"]); expect(await base.keys("chunks")).not.toHaveLength(0);
    expect(JSON.parse(await vault.exportCapsule("cold-source"))).toEqual(JSON.parse(new TextDecoder().decode(bytes)));
    expect(writesAfterCommit).toBe(0); expect(readFailed).toBe(true);
    const observed = { code: error instanceof GhostColdRestoreError ? error.code : null, writesAfterCommit };
    expect(observed, JSON.stringify(observed)).toEqual({ code: "commit-indeterminate", writesAfterCommit: 0 });
  });

  it.each(["logical", "physical"])("preserves all existing custody under %s quota failure with an exact-file retry", async (kind) => {
    const bytes = await fixture(), base = createMemoryGhostVaultBackend(); let fail = true;
    const backend: GhostVaultBackend = { ...base, async commitIfMatches(guards, writes) { if (kind === "physical" && final(writes) && fail) { fail = false; throw new DOMException("full", "QuotaExceededError"); } return base.commitIfMatches(guards, writes); } };
    const service = new GhostColdRestore(new GhostLocalVault(backend), { now }); await service.select("job", bytes, kind === "logical" ? { maxLogicalReferencedChunkBytes: 1 } : {});
    await expect(service.restore("job", bytes)).rejects.toMatchObject({ code: `${kind}-quota` }); expect(await base.keys("manifests")).toEqual([]); expect(await base.keys("chunks")).toEqual([]);
    expect(await base.get("analysis", ghostColdRestoreResultKey("job"))).toBeUndefined(); expect((await service.read("job"))?.failure).toBe(`${kind}-quota`);
    if (kind === "physical") expect((await new GhostColdRestore(new GhostLocalVault(backend), { now }).restore("job", bytes)).kind).toBe("imported");
  });

  it("keeps owned completion rows immutable, refuses forged tokens and foreign Vault instances sharing a backend", async () => {
    const bytes = await fixture(), base = createMemoryGhostVaultBackend(), a = new GhostLocalVault(base), b = new GhostLocalVault(base), service = new GhostColdRestore(a, { now });
    const job = await service.select("job", bytes), active = { ...job, revision: 1, state: "restoring", lease: "owner" }, raw = JSON.stringify(active); await base.put("analysis", ghostColdRestoreJobKey(job.id), raw);
    const archive = await prepareGhostCapsuleArchive(bytes), plan = await a.prepareCapsuleImport(archive), completion = await prepareGhostColdRestoreCompletion(raw, now()), rows = readGhostColdRestoreCompletion(completion);
    const before = await snapshot(base);
    expect(Reflect.set(rows.writes[0] ?? {}, "key", "unrelated-analysis")).toBe(false); expect(Reflect.set(rows.guards[0] ?? {}, "key", "unrelated-analysis")).toBe(false);
    await expect(a.commitCapsuleImport(plan, {} as GhostColdRestoreCompletion)).rejects.toThrow(/completion/);
    await expect(b.commitCapsuleImport(plan, completion)).rejects.toThrow(/match/); expect(await snapshot(base)).toEqual(before);
    await a.commitCapsuleImport(plan, completion); expect((await service.read("job"))?.state).toBe("complete"); expect(await base.get("analysis", "unrelated-analysis")).toBeUndefined();
  });

  it("rejects metadata stored under the wrong job key before read/cancel/restore can mutate any store", async () => {
    const bytes = await fixture(), base = createMemoryGhostVaultBackend(), service = new GhostColdRestore(new GhostLocalVault(base), { now });
    await service.select("original", bytes); const raw = await base.get("analysis", ghostColdRestoreJobKey("original")); if (raw === undefined) throw new Error("missing metadata");
    await base.put("analysis", ghostColdRestoreJobKey("wrong"), raw); const before = await snapshot(base);
    await expect(service.read("wrong")).rejects.toMatchObject({ code: "conflict" }); await expect(service.cancel("wrong", 0)).rejects.toMatchObject({ code: "conflict" }); await expect(service.restore("wrong", bytes)).rejects.toMatchObject({ code: "conflict" });
    expect(await snapshot(base)).toEqual(before);
  });

  it.each(["cancelled-state-array", "baseline-kind-array", "slot-store-array", "schema-string"])("refuses persisted %s rather than coercing metadata or reviving an intent", async (kind) => {
    const bytes = await fixture(), base = createMemoryGhostVaultBackend(), service = new GhostColdRestore(new GhostLocalVault(base), { now });
    const job = await service.select("job", bytes); if (kind === "cancelled-state-array") await service.cancel("job", job.revision);
    const raw = await base.get("analysis", ghostColdRestoreJobKey("job")); if (raw === undefined) throw new Error("missing job");
    const data = JSON.parse(raw) as { state: unknown; baseline: { kind: unknown; slots: { store: unknown }[] }; binding: { schemaVersion: unknown } };
    if (kind === "cancelled-state-array") data.state = ["cancelled"];
    if (kind === "baseline-kind-array") data.baseline.kind = ["imported"];
    if (kind === "slot-store-array" && data.baseline.slots[0]) data.baseline.slots[0].store = ["manifests"];
    if (kind === "schema-string") data.binding.schemaVersion = "2";
    await base.put("analysis", ghostColdRestoreJobKey("job"), JSON.stringify(data)); const before = await snapshot(base);
    await expect(service.restore("job", bytes)).rejects.toMatchObject({ code: "conflict" }); expect(await snapshot(base)).toEqual(before);
  });

  it("refuses checksum/size-correct unreadable archives without creating any intent, custody or completion", async () => {
    const bytes = await fixture(), root = JSON.parse(new TextDecoder().decode(bytes)) as { manifest: TearGhostManifest; chunks: Record<string, string> };
    const first = root.manifest.chunks[0]; if (first === undefined) throw new Error("missing chunk");
    const encoded = encodeGhostChunkPayload({ readableJsonButNotAnEntryArray: true });
    const chunks = root.manifest.chunks.map((entry) => entry.id === first.id ? { ...entry, encoding: encoded.encoding, compressedBytes: encoded.compressedBytes, uncompressedBytes: encoded.uncompressedBytes, checksum: stableVerificationHash(encoded.encoded) } : entry);
    root.manifest = reviseGhostCapsuleManifest(root.manifest, { chunks, rootIntegrity: ghostRootIntegrity(chunks) }); root.chunks[first.id] = encoded.encoded;
    const base = createMemoryGhostVaultBackend(), service = new GhostColdRestore(new GhostLocalVault(base), { now }), before = await snapshot(base);
    await expect(service.select("bad", new TextEncoder().encode(JSON.stringify(root)))).rejects.toMatchObject({ code: "invalid-archive" }); expect(await snapshot(base)).toEqual(before);
  });

  it("reload/reselection preserves initial absence and refuses later identical foreign custody without adoption", async () => {
    const bytes = await fixture(), base = createMemoryGhostVaultBackend();
    await new GhostColdRestore(new GhostLocalVault(base), { now }).select("job", bytes);
    await new GhostLocalVault(base).importCapsule(new TextDecoder().decode(bytes)); const before = await snapshot(base);
    const reloaded = new GhostColdRestore(new GhostLocalVault(base), { now }); expect((await reloaded.read("job"))?.state).toBe("ready");
    await expect(reloaded.restore("job", bytes)).rejects.toMatchObject({ code: "conflict" }); expect(await snapshot(base)).toEqual(before);
  });

  it.each(["missing chunk", "corrupt chunk", "orphan index"])("does not heal %s while claiming exact existing custody", async (kind) => {
    const bytes = await fixture(), base = createMemoryGhostVaultBackend(), vault = new GhostLocalVault(base), root = JSON.parse(new TextDecoder().decode(bytes)) as { manifest: TearGhostManifest };
    const first = root.manifest.chunks[0]; if (first === undefined) throw new Error("missing chunk");
    if (kind === "orphan index") await base.put("indexes", `manifest:${root.manifest.id}`, "orphan");
    else { await vault.importCapsule(new TextDecoder().decode(bytes)); if (kind === "missing chunk") await base.remove("chunks", first.id); else await base.put("chunks", first.id, "corrupt"); }
    const before = await snapshot(base); await expect(new GhostColdRestore(vault, { now }).select("job", bytes)).rejects.toMatchObject({ code: "conflict" }); expect(await snapshot(base)).toEqual(before);
  });

  it("distinguishes historical completion from currently missing custody without healing or adopting", async () => {
    const bytes = await fixture(), base = createMemoryGhostVaultBackend(), service = new GhostColdRestore(new GhostLocalVault(base), { now });
    await service.select("job", bytes); await service.restore("job", bytes); await base.remove("manifests", "cold-source");
    const before = await snapshot(base); expect((await service.read("job"))?.state).toBe("complete");
    await expect(service.restore("job", bytes)).rejects.toMatchObject({ code: "commit-indeterminate" }); expect(await snapshot(base)).toEqual(before);
  });

  it.each(["before", "after"])("keeps claim response-loss %s custody-free and requires explicit matching reselection", async (when) => {
    const bytes = await fixture(), base = createMemoryGhostVaultBackend(); let lost = false, finalCommits = 0;
    const backend: GhostVaultBackend = { ...base, async commitIfMatches(guards, writes) {
      if (final(writes)) finalCommits++;
      if (!lost && writes.length === 1 && writes[0]?.key === ghostColdRestoreJobKey("job") && writes[0].value?.includes('"state":"restoring"')) {
        lost = true; if (when === "after") await base.commitIfMatches(guards, writes); throw new Error("claim response lost");
      }
      return base.commitIfMatches(guards, writes);
    } };
    const service = new GhostColdRestore(new GhostLocalVault(backend), { now }); await service.select("job", bytes);
    await expect(service.restore("job", bytes)).rejects.toMatchObject({ code: "commit-indeterminate" }); expect(finalCommits).toBe(0); expect(await base.keys("manifests")).toEqual([]);
    const resumed = new GhostColdRestore(new GhostLocalVault(backend), { now }); expect((await resumed.read("job"))?.state).toBe(when === "before" ? "ready" : "restoring");
    await resumed.restore("job", bytes); expect(finalCommits).toBe(1);
  });

  it("charges shared referenced chunks once and charges matching orphan bytes when they become referenced", async () => {
    const bytes = await fixture(), root = JSON.parse(new TextDecoder().decode(bytes)) as { manifest: TearGhostManifest; chunks: Record<string, string> };
    const size = root.manifest.chunks.reduce((sum, entry) => sum + entry.compressedBytes, 0), base = createMemoryGhostVaultBackend(), vault = new GhostLocalVault(base), service = new GhostColdRestore(vault, { now });
    await service.select("first", bytes, { maxLogicalReferencedChunkBytes: size }); await service.restore("first", bytes);
    const chunkKeys = await base.keys("chunks"), second = new TextEncoder().encode(JSON.stringify({ ...root, manifest: reviseGhostCapsuleManifest(root.manifest, { id: "shared-child" }) }));
    await service.select("second", second, { maxLogicalReferencedChunkBytes: size }); await service.restore("second", second); expect(await base.keys("chunks")).toEqual(chunkKeys); expect(await base.keys("manifests")).toHaveLength(2);
    const orphan = createMemoryGhostVaultBackend(); for (const [key, value] of Object.entries(root.chunks)) await orphan.put("chunks", key, value);
    const retry = new GhostColdRestore(new GhostLocalVault(orphan), { now }); await retry.select("orphan", bytes, { maxLogicalReferencedChunkBytes: 1 });
    await expect(retry.restore("orphan", bytes)).rejects.toMatchObject({ code: "logical-quota" }); expect(await orphan.keys("manifests")).toEqual([]); expect(await orphan.keys("chunks")).toEqual(chunkKeys);
  });
});
