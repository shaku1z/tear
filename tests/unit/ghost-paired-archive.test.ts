import { describe, expect, it, vi } from "vitest";
import {
  GhostLocalVault,
  createMemoryGhostVaultBackend,
  GHOST_VAULT_STORES,
  type GhostVaultBackend,
} from "../../src/ghost/capsule-vault";
import { GhostStreamingRecorder } from "../../src/ghost/streaming-recorder";
import { prepareGhostPortableArchive, ghostPortableArchiveData } from "../../src/ghost/capsule-paired-archive";
import { prepareCompleteGhostCapsuleArchive, prepareGhostCapsuleArchive } from "../../src/ghost/capsule-archive";
import { GhostColdRestore } from "../../src/ghost/cold-restore";
import { GhostCapsuleReader } from "../../src/ghost/capsule-reader";
import { createGhostAuthoritativeReceipt } from "../../src/ghost/authoritative-receipt";
import { reviseGhostCapsuleManifest, ghostRootIntegrity, type TearGhostManifest } from "../../src/ghost/capsule-vault";
import { stableVerificationHash } from "../../src/domain/hash";
import {
  captureProductionReplayCheckpoint,
  createProductionGhostReplayComposition,
} from "../../src/tearbench/production-replay-composition";
import { createGhostColdRestoreBrowserPort } from "../../src/ghost/browser-cold-restore";
import { createGhostVaultLibraryController } from "../../src/app/library/ghost-vault-library-controller";
import { prepareGhostCapsuleProtection } from "../../src/ghost/capsule-protection";

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const stores = async (b: GhostVaultBackend) =>
  Promise.all(
    GHOST_VAULT_STORES.map(async (s) => [
      s,
      await Promise.all((await b.keys(s)).map(async (k) => [k, await b.get(s, k)])),
    ]),
  );
// Constructed linkage/transport fixture, not a natural Campaign or scored-prefix playback claim.
async function fixture() {
  const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
  const source = createProductionGhostReplayComposition({ seed: "portable-pair", mode: "campaign" }).create(undefined);
  source.replay.world.context.cinema.complete();
  source.replay.finale.runtime.start();
  source.simulation.advanceOne([]);
  const checkpoint = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "pair-origin");
  const tick = checkpoint.snapshot.tick,
    cursor = { version: 1 as const, ordinal: 0, sequence: 0 },
    context = { fixture: "constructed-linkage" };
  const receipt = createGhostAuthoritativeReceipt(tick, checkpoint.semanticHash, checkpoint.input, {
    version: 1,
    cursor,
  });
  const parent = new GhostStreamingRecorder({
    sessionId: "pair-parent",
    createdAt: "2026-10-20T00:00:00Z",
    vault,
    chunkEntries: 1,
    maxPendingWrites: 1,
    provenance: { replayContext: context },
  });
  await parent.start();
  await parent.append({ kind: "keyframes", tick, value: checkpoint.snapshot });
  await parent.append({ kind: "results", tick, value: receipt });
  await parent.append({ kind: "events", tick, value: { type: "run.completed", tick, payload: { runId: "pair-run" } } });
  const manifest = await parent.finalize("2026-10-20T00:00:01Z");
  const declaration = {
    format: "tearghost-finale-companion",
    version: 1,
    parentId: manifest.id,
    sourceSessionId: manifest.id,
    sourceRunId: "pair-run",
    parentContextHash: stableVerificationHash(context),
    origin: {
      tick,
      snapshotId: checkpoint.snapshot.id,
      exactHash: checkpoint.snapshot.hashes.exact,
      input: receipt.input,
      cursor,
      inherited: [],
    },
  };
  const provenance = { replayContext: context, finaleCompanion: declaration };
  const child = new GhostStreamingRecorder({
    sessionId: "pair-finale",
    createdAt: "2026-10-20T00:00:02Z",
    vault,
    chunkEntries: 1,
    maxPendingWrites: 1,
    provenance,
  });
  await child.start();
  await child.append({ kind: "keyframes", tick, value: checkpoint.snapshot });
  await child.append({
    kind: "events",
    tick,
    value: {
      id: "finale-open-pair-finale",
      type: "system.checkpoint",
      tick,
      sequence: 0,
      phase: "post-simulation-commit",
      payload: { boundary: "v3-finale-sidecar-opened", provenance },
    },
  });
  await child.append({
    kind: "results",
    tick,
    value: {
      format: "tearghost-finale-parent",
      version: 1,
      parentId: manifest.id,
      manifestHash: stableVerificationHash(manifest),
      rootIntegrity: manifest.rootIntegrity,
      originHash: stableVerificationHash(declaration),
    },
  });
  await child.append({
    kind: "results",
    tick,
    value: {
      format: "tearghost-finale-frame",
      version: 1,
      tick,
      cursor,
      stateHash: checkpoint.semanticHash,
      completed: true,
    },
  });
  await child.finalize("2026-10-20T00:00:03Z");
  const bytes = encode({
    format: "tearghost-linked-archive",
    version: 1,
    parent: await vault.exportCapsule(manifest.id),
    companion: await vault.exportCapsule("pair-finale"),
  });
  return { vault, bytes };
}

describe("linked parent/finale portable archive", () => {
  it("retains the existing single format and demonstrates why a lone companion cannot reopen its absent parent", async () => {
    const f = await fixture(),
      single = await prepareCompleteGhostCapsuleArchive(f.vault, "pair-finale"),
      target = new GhostLocalVault(createMemoryGhostVaultBackend());
    expect((await prepareGhostCapsuleArchive(single.bytes)).binding.protocol).toBe("ghost-normal-archive-v1");
    const service = new GhostColdRestore(target);
    await service.select("single", single.bytes);
    await service.restore("single", single.bytes);
    expect(await target.getManifest("pair-parent")).toBeUndefined();
    await expect(new GhostCapsuleReader(target).read("pair-parent")).rejects.toThrow(/does not exist/);
  });
  it("preserves exact member strings and imports both with one completion transaction, then exact retry writes nothing", async () => {
    const f = await fixture(),
      root = JSON.parse(text(f.bytes)) as { parent: string; companion: string };
    expect(root.parent).toBe(await f.vault.exportCapsule("pair-parent"));
    expect(root.companion).toBe(await f.vault.exportCapsule("pair-finale"));
    const base = createMemoryGhostVaultBackend(),
      commits: string[][] = [];
    const backend: GhostVaultBackend = {
      ...base,
      async commitIfMatches(guards, writes) {
        if (writes.some((w) => w.store === "manifests")) commits.push(writes.map((w) => w.key));
        await base.commitIfMatches(guards, writes);
      },
    };
    const target = new GhostLocalVault(backend),
      service = new GhostColdRestore(target),
      job = await service.select("pair", f.bytes);
    expect(job.schemaVersion).toBe(2);
    expect(await base.keys("manifests")).toEqual([]);
    await service.restore("pair", f.bytes);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toEqual(
      expect.arrayContaining([
        "pair-parent",
        "pair-finale",
        "ghost-cold-restore:job:v1:pair",
        "ghost-cold-restore:result:v1:pair",
      ]),
    );
    const reader = new GhostCapsuleReader(target);
    expect((await reader.read("pair-finale")).manifest.id).toBe("pair-finale");
    expect((await reader.read("pair-parent")).manifest.id).toBe("pair-parent");
    const before = await stores(base);
    await service.restore("pair", f.bytes);
    expect(await stores(base)).toEqual(before);
    expect(await target.exportCapsule("pair-parent")).toBe(root.parent);
    expect(await target.exportCapsule("pair-finale")).toBe(root.companion);
  });
  it.each(["pair-parent", "pair-finale"])("supports exact existing %s and preserves its local hold", async (id) => {
    const f = await fixture(),
      target = new GhostLocalVault(createMemoryGhostVaultBackend());
    const single = await prepareCompleteGhostCapsuleArchive(f.vault, id),
      first = new GhostColdRestore(target);
    await first.select("first", single.bytes);
    await first.restore("first", single.bytes);
    const manifest = await target.getManifest(id);
    if (!manifest) throw new Error("missing fixture");
    const hold = await prepareGhostCapsuleProtection(target.backend(), id, manifest.rootIntegrity, "career-local");
    await target.backend().commitIfMatches(hold.guards, hold.writes);
    const raw = await target.backend().get("analysis", `ghost-capsule-protection:v1:${id}`);
    await first.select("both", f.bytes);
    await first.restore("both", f.bytes);
    expect(await target.backend().get("analysis", `ghost-capsule-protection:v1:${id}`)).toBe(raw);
    expect([...(await target.backend().keys("manifests"))].sort()).toEqual(["pair-finale", "pair-parent"]);
  });
  it.each(["wrong-link", "missing-member", "corrupt-member", "future-version", "swapped"])(
    "refuses %s before creating a restore intent",
    async (kind) => {
      const f = await fixture(),
        root = JSON.parse(text(f.bytes)) as Record<string, unknown>,
        target = new GhostLocalVault(createMemoryGhostVaultBackend());
      if (kind === "missing-member") delete root.companion;
      if (kind === "future-version") root.version = 2;
      if (kind === "swapped") [root.parent, root.companion] = [root.companion, root.parent];
      if (kind === "corrupt-member") root.companion = String(root.companion).slice(1);
      if (kind === "wrong-link") root.companion = root.parent;
      const before = await stores(target.backend());
      await expect(new GhostColdRestore(target).select("bad", encode(root))).rejects.toThrow();
      expect(await stores(target.backend())).toEqual(before);
    },
  );
  it("applies aggregate chunk/decoded/entry limits and lower-only policy to the pair", async () => {
    const f = await fixture(),
      prepared = await prepareGhostPortableArchive(f.bytes),
      data = ghostPortableArchiveData(prepared);
    const chunks = data.members.map((m) => m.manifest.chunks.length),
      entries = data.members.map((m) => m.totalEntries),
      decoded = data.members.map((m) => m.manifest.chunks.reduce((n, c) => n + c.uncompressedBytes, 0));
    for (const limits of [
      { maxChunks: Math.max(...chunks) },
      { maxEntriesTotal: Math.max(...entries) },
      { maxDecodedTotalBytes: Math.max(...decoded) },
      { maxEncodedBytes: f.bytes.length - 1 },
      { maxEncodedBytes: 999_999_999 },
    ])
      await expect(prepareGhostPortableArchive(f.bytes, limits)).rejects.toThrow();
  });
  it("deduplicates identical shared chunks and refuses a same-ID collision before intent writes", async () => {
    const f = await fixture(),
      root = JSON.parse(text(f.bytes)) as { parent: string; companion: string; format: string; version: number };
    const parent = JSON.parse(root.parent) as { manifest: TearGhostManifest; chunks: Record<string, string> },
      child = JSON.parse(root.companion) as typeof parent;
    const a = parent.manifest.chunks.find((c) => c.kind === "keyframes"),
      b = child.manifest.chunks.find((c) => c.kind === "keyframes");
    if (!a || !b) throw new Error("keyframe fixture missing");
    expect(parent.chunks[a.id]).toBe(child.chunks[b.id]);
    const chunks = child.manifest.chunks.map((c) => (c.id === b.id ? { ...c, id: a.id } : c));
    child.manifest = reviseGhostCapsuleManifest(child.manifest, { chunks, rootIntegrity: ghostRootIntegrity(chunks) });
    child.chunks[a.id] = child.chunks[b.id] ?? "";
    Reflect.deleteProperty(child.chunks, b.id);
    root.companion = JSON.stringify(child);
    const target = new GhostLocalVault(createMemoryGhostVaultBackend()),
      service = new GhostColdRestore(target),
      bytes = encode(root);
    await service.select("shared", bytes);
    await service.restore("shared", bytes);
    expect((await target.backend().keys("chunks")).length).toBe(
      parent.manifest.chunks.length + child.manifest.chunks.length - 1,
    );
    // A different parent chunk ID is valid in each member independently, but collides in joint custody.
    const nonKeyframe = parent.manifest.chunks.find((c) => c.kind === "events");
    if (!nonKeyframe) throw new Error("event fixture missing");
    const collisionChunks = child.manifest.chunks.map((c) => (c.id === a.id ? { ...c, id: nonKeyframe.id } : c));
    child.manifest = reviseGhostCapsuleManifest(child.manifest, {
      chunks: collisionChunks,
      rootIntegrity: ghostRootIntegrity(collisionChunks),
    });
    child.chunks[nonKeyframe.id] = child.chunks[a.id] ?? "";
    Reflect.deleteProperty(child.chunks, a.id);
    root.companion = JSON.stringify(child);
    const before = await stores(target.backend());
    await expect(service.select("collision", encode(root))).rejects.toMatchObject({ code: "invalid-archive" });
    expect(await stores(target.backend())).toEqual(before);
  });
  it("refuses changed reselection and logical quota without eviction or partial import", async () => {
    const f = await fixture(),
      target = new GhostLocalVault(createMemoryGhostVaultBackend()),
      service = new GhostColdRestore(target);
    await service.select("quota", f.bytes, { maxLogicalReferencedChunkBytes: 1 });
    await expect(service.restore("quota", f.bytes)).rejects.toMatchObject({ code: "logical-quota" });
    expect(await target.backend().keys("manifests")).toEqual([]);
    expect(await target.backend().keys("chunks")).toEqual([]);
    const before = await stores(target.backend());
    await expect(service.restore("quota", new TextEncoder().encode(text(f.bytes) + " "))).rejects.toMatchObject({
      code: "input-mismatch",
    });
    expect(await stores(target.backend())).toEqual(before);
  });
  it("rejects foreign-Vault plans and malformed pair metadata", async () => {
    const f = await fixture(),
      bytes = f.bytes,
      archive = await prepareGhostPortableArchive(bytes),
      target = new GhostLocalVault(createMemoryGhostVaultBackend());
    const job = await new GhostColdRestore(target).select("foreign", bytes);
    const { prepareGhostColdRestoreCompletion, ghostColdRestoreRevision } =
      await import("../../src/ghost/cold-restore-job");
    const plan = await target.prepareCapsuleImport(archive),
      completion = await prepareGhostColdRestoreCompletion(
        JSON.stringify(
          ghostColdRestoreRevision(job, { state: "restoring", lease: "owned", resultHash: null, failure: null }, "now"),
        ),
        "then",
      );
    await expect(new GhostLocalVault(target.backend()).commitCapsuleImport(plan, completion)).rejects.toThrow(
      /owned completion/,
    );
    const malformed = { ...job, schemaVersion: 1 };
    await target.backend().put("analysis", "ghost-cold-restore:job:v1:foreign", JSON.stringify(malformed));
    const before = await stores(target.backend());
    await expect(new GhostColdRestore(target).restore("foreign", bytes)).rejects.toMatchObject({ code: "conflict" });
    expect(await stores(target.backend())).toEqual(before);
  });
  it.each(["cancel", "quota", "protection-drift", "response-loss", "unreadable-resolution"])(
    "retains joint transaction guarantees under %s",
    async (kind) => {
      const f = await fixture(),
        base = createMemoryGhostVaultBackend();
      let armed = false,
        lost = false,
        commits = 0;
      const backend: GhostVaultBackend = {
        ...base,
        async get(store, key) {
          if (lost && kind === "unreadable-resolution" && key === "ghost-cold-restore:job:v1:race")
            throw new Error("read unavailable");
          return base.get(store, key);
        },
        async commitIfMatches(guards, writes) {
          if (armed && writes.some((w) => w.store === "manifests")) {
            armed = false;
            if (kind === "cancel") {
              const active = await service.read("race");
              if (!active) throw new Error("missing active");
              await service.cancel(active.id, active.revision);
            }
            if (kind === "quota") throw new DOMException("full", "QuotaExceededError");
            if (kind === "protection-drift")
              await base.put("analysis", "ghost-capsule-protection:v1:pair-parent", "changed");
            await base.commitIfMatches(guards, writes);
            commits++;
            if (kind === "response-loss" || kind === "unreadable-resolution") {
              lost = true;
              throw new Error("lost response");
            }
            return;
          }
          await base.commitIfMatches(guards, writes);
        },
      };
      const service = new GhostColdRestore(new GhostLocalVault(backend));
      await service.select("race", f.bytes);
      armed = true;
      if (kind === "response-loss") expect((await service.restore("race", f.bytes)).kind).toBe("imported");
      else
        await expect(service.restore("race", f.bytes)).rejects.toMatchObject({
          code: kind === "cancel" ? "cancelled" : kind === "quota" ? "physical-quota" : "commit-indeterminate",
        });
      expect((await base.keys("manifests")).length).toBe(
        kind === "response-loss" || kind === "unreadable-resolution" ? 2 : 0,
      );
      expect(commits).toBe(kind === "response-loss" || kind === "unreadable-resolution" ? 1 : 0);
    },
  );
  it.runIf(Boolean(process.env.TEAR_LINKED_PAIR_SOURCE))(
    "optional external original encoded pair validates and jointly restores without rewriting its source file",
    async () => {
      const { readFileSync } = await import("node:fs");
      const path = process.env.TEAR_LINKED_PAIR_SOURCE;
      if (!path) throw new Error("missing explicit source");
      const before = readFileSync(path),
        root = JSON.parse(before.toString("utf8")) as Record<
          string,
          { manifestText: string; chunks: Record<string, string> }
        >;
      const members = Object.values(root);
      if (members.length !== 2) throw new Error("expected two retained source recordings");
      const strings = members.map((m) => `{"manifest":${m.manifestText},"chunks":${JSON.stringify(m.chunks)}}`);
      const parent = strings.find(
          (s) => (JSON.parse(s) as { manifest: TearGhostManifest }).manifest.provenance?.finaleCompanion === undefined,
        ),
        companion = strings.find(
          (s) => (JSON.parse(s) as { manifest: TearGhostManifest }).manifest.provenance?.finaleCompanion !== undefined,
        );
      const bytes = encode({ format: "tearghost-linked-archive", version: 1, parent, companion });
      const target = new GhostLocalVault(createMemoryGhostVaultBackend()),
        service = new GhostColdRestore(target);
      await service.select("actual-pair", bytes);
      await service.restore("actual-pair", bytes);
      for (const m of members) {
        const manifest = JSON.parse(m.manifestText) as TearGhostManifest;
        expect(await target.getManifest(manifest.id)).toEqual(manifest);
        for (const [id, value] of Object.entries(m.chunks))
          expect(await target.backend().get("chunks", id)).toBe(value);
      }
      expect(readFileSync(path)).toEqual(before);
    },
  );
  it("imports a linked file through the controller: RESTORE BOTH preview and explicit restore after reselection", async () => {
    const f = await fixture(),
      target = new GhostLocalVault(createMemoryGhostVaultBackend());
    const download = { bytes: f.bytes },
      port = createGhostColdRestoreBrowserPort(target),
      files = { pick: vi.fn(), download: vi.fn() };
    let selected: ((file: { size: number; arrayBuffer(): Promise<ArrayBuffer> }) => void) | undefined;
    files.pick.mockImplementation((callback: typeof selected) => {
      selected = callback;
      return () => undefined;
    });
    const controller = createGhostVaultLibraryController({
      files,
      restore: port,
      newIntent: () => "ui-pair",
      inspect: () =>
        Promise.resolve({
          manifests: [],
          maintenance: {
            schemaVersion: 1,
            checkedAt: "now",
            maximumBytes: 0,
            evictedCapsuleIds: [],
            integrity: [],
            rebuiltIndexes: 0,
          },
        }),
      repair: vi.fn(),
    });
    controller.pickArchive();
    selected?.({
      size: download.bytes.length,
      arrayBuffer: () => Promise.resolve(Uint8Array.from(download.bytes).buffer),
    });
    await vi.waitFor(() => {
      expect(controller.snapshot().archive?.status).toBe("ready");
    });
    expect(controller.snapshot().archive?.pairedCapsuleIds).toEqual(["pair-parent", "pair-finale"]);
    expect(controller.snapshot().archive?.detail).toContain("RESTORE BOTH");
    expect(await target.backend().keys("manifests")).toEqual([]);
    controller.cancelArchive();
    controller.pickArchive("ui-pair");
    selected?.({
      size: download.bytes.length,
      arrayBuffer: () => Promise.resolve(Uint8Array.from(download.bytes).buffer),
    });
    await vi.waitFor(() => {
      expect(controller.snapshot().archive?.status).toBe("ready");
    });
    const job = controller.snapshot().archive;
    if (!job?.jobId || job.revision === undefined) throw new Error("missing preview");
    // Keep refresh independent of this minimal file controller fixture.
    controller.restoreArchive(job.jobId, job.revision);
    await vi.waitFor(() => expect(target.backend().keys("manifests")).resolves.toHaveLength(2));
    controller.dispose();
  });
});
