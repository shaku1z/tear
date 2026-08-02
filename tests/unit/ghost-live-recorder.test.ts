import { describe, expect, it } from "vitest";

import {
  GhostLiveRecorder,
  GhostLocalVault,
  GhostStreamingRecorder,
  createMemoryGhostVaultBackend,
  type GhostVaultBackend,
} from "../../src/ghost";

describe("Ghost V3 live recorder sidecar", () => {
  it("buffers live observations until durable storage opens, then finalizes an independent capsule", async () => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    let release: (() => void) | undefined;
    const recorder = new GhostLiveRecorder({
      createVault: async () => new Promise<GhostLocalVault>((resolve) => { release = () => { resolve(vault); }; }),
      now: () => "2026-07-28T00:00:01.000Z",
      chunkEntries: 1,
      maxPendingWrites: 1,
    });
    recorder.start({ sessionId: "live-sidecar", createdAt: "2026-07-28T00:00:00.000Z", provenance: { seed: "7" } });
    recorder.record("commands", 3, { command: { type: "dash" } });
    release?.();
    const manifest = await recorder.finish({ outcome: "defeat", finalTick: 3 });

    expect(manifest).toMatchObject({ id: "live-sidecar", status: "complete" });
    expect(manifest?.chunks).toHaveLength(3);
    const commandChunk = manifest?.chunks[1];
    if (commandChunk === undefined) throw new Error("missing command chunk");
    expect(await vault.readChunk(commandChunk)).toEqual([
      { kind: "commands", tick: 3, value: { command: { type: "dash" } } },
    ]);
    expect(recorder.active).toBe(false);
    expect(recorder.failure).toBeNull();
  });

  it("releases a stopped session immediately so a replacement run cannot lose its recorder", async () => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const recorder = new GhostLiveRecorder({
      createVault: () => Promise.resolve(vault),
      now: () => "2026-07-28T00:00:01.000Z",
      chunkEntries: 1,
      maxPendingWrites: 1,
    });
    recorder.start({ sessionId: "replaced-run", createdAt: "2026-07-28T00:00:00.000Z", provenance: {} });
    recorder.record("commands", 1, { command: { type: "move", x: 1_000 } });
    const first = recorder.finish({ outcome: "interrupted" });

    expect(recorder.active).toBe(false);
    recorder.start({ sessionId: "replacement-run", createdAt: "2026-07-28T00:00:01.000Z", provenance: {} });
    recorder.record("commands", 2, { command: { type: "jump", phase: "pressed" } });
    const second = recorder.finish({ outcome: "complete" });

    const [firstManifest, secondManifest] = await Promise.all([first, second]);
    expect(firstManifest).toMatchObject({ id: "replaced-run", status: "complete" });
    expect(secondManifest).toMatchObject({ id: "replacement-run", status: "complete" });
    expect(await vault.getManifest("replaced-run")).toMatchObject({ status: "complete" });
    expect(await vault.getManifest("replacement-run")).toMatchObject({ status: "complete" });
    expect(recorder.lastManifest).toMatchObject({ id: "replacement-run" });
  });

  it("recovers a previous interrupted capsule before opening the next live sidecar", async () => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const interrupted = new GhostStreamingRecorder({
      sessionId: "interrupted-before-live", createdAt: "2026-07-28T00:00:00.000Z", chunkEntries: 1, maxPendingWrites: 1, vault,
    });
    await interrupted.start();
    await interrupted.append({ kind: "commands", tick: 1, value: { kind: "command", id: 1, tick: 1, command: { type: "jump" } } });

    const recorder = new GhostLiveRecorder({ createVault: () => Promise.resolve(vault), now: () => "2026-07-28T00:00:02.000Z" });
    recorder.start({ sessionId: "live-after-recovery", createdAt: "2026-07-28T00:00:01.000Z", provenance: {} });
    const manifest = await recorder.finish({ outcome: "complete" });

    expect(await vault.getManifest("interrupted-before-live")).toMatchObject({ status: "recovered" });
    expect(manifest).toMatchObject({ id: "live-after-recovery", status: "complete" });
  });

  it("derives real capture cadence and write pressure from the selected recording profile", () => {
    const recorder = new GhostLiveRecorder({
      createVault: () => Promise.resolve(new GhostLocalVault(createMemoryGhostVaultBackend())),
      now: () => "2026-07-28T00:00:00.000Z", recordingProfile: "forensic-qa",
    });
    expect(recorder.keyframeIntervalTicks).toBe(60);
    expect(recorder.maxStagingEntries).toBeGreaterThan(0);
  });

  it("bounds asynchronous startup staging and converts exhaustion into an explicit incomplete recording", async () => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    let release: (() => void) | undefined;
    const recorder = new GhostLiveRecorder({
      createVault: async () => new Promise<GhostLocalVault>((resolve) => { release = () => { resolve(vault); }; }),
      now: () => "2026-07-30T00:00:01.000Z", chunkEntries: 1, maxPendingWrites: 1, maxStagingEntries: 2,
    });
    recorder.start({ sessionId: "bounded-staging", createdAt: "2026-07-30T00:00:00.000Z", provenance: {} });
    recorder.record("commands", 1, { command: { type: "jump", phase: "pressed" } });
    recorder.record("rng", 2, { state: "would-overflow" });
    expect(recorder.failure).toContain("staging capacity exceeded");
    release?.();

    await expect(recorder.finish({ outcome: "interrupted" })).resolves.toBeNull();
    expect(recorder.failure).toContain("staging capacity exceeded");
    expect(await vault.getManifest("bounded-staging")).toMatchObject({ status: "recording" });
    expect(await vault.recoverIncompleteSessions()).toMatchObject([
      { id: "bounded-staging", status: "recovered" },
    ]);
  });

  it("contains asynchronous worker failure, preserves the incomplete journal, and never returns a false completion", async () => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const recorder = new GhostLiveRecorder({
      createVault: () => Promise.resolve(vault),
      now: () => "2026-07-30T00:00:01.000Z",
      chunkEntries: 1,
      maxPendingWrites: 1,
      worker: { encode: () => Promise.reject(new Error("encoder unavailable")) },
    });
    recorder.start({ sessionId: "failed-sidecar", createdAt: "2026-07-30T00:00:00.000Z", provenance: {} });
    recorder.record("commands", 1, { command: { type: "jump", phase: "pressed" } });

    await expect(recorder.finish({ outcome: "interrupted" })).resolves.toBeNull();
    expect(recorder.active).toBe(false);
    expect(recorder.failure).toContain("encoder unavailable");
    expect(await vault.getManifest("failed-sidecar")).toMatchObject({ status: "recording" });
    expect(await vault.recoverIncompleteSessions()).toMatchObject([
      { id: "failed-sidecar", status: "recovered" },
    ]);
  });

  it("contains storage quota failure and leaves the capsule explicitly recoverable instead of complete", async () => {
    const memory = createMemoryGhostVaultBackend();
    const quotaBackend: GhostVaultBackend = {
      ...memory,
      commit: async (operations) => {
        if (operations.some((operation) => operation.store === "chunks")) throw new Error("storage quota exceeded");
        await memory.commit(operations);
      },
      commitWhileJournalMatches: async (sessionId, leaseId, operations) => {
        if (operations.some((operation) => operation.store === "chunks")) throw new Error("storage quota exceeded");
        await memory.commitWhileJournalMatches(sessionId, leaseId, operations);
      },
    };
    const vault = new GhostLocalVault(quotaBackend);
    const recorder = new GhostLiveRecorder({
      createVault: () => Promise.resolve(vault),
      now: () => "2026-07-30T00:00:01.000Z",
      chunkEntries: 1,
      maxPendingWrites: 1,
    });
    recorder.start({ sessionId: "quota-sidecar", createdAt: "2026-07-30T00:00:00.000Z", provenance: {} });
    recorder.record("commands", 1, { command: { type: "dash" } });

    await expect(recorder.finish({ outcome: "interrupted" })).resolves.toBeNull();
    expect(recorder.failure).toContain("storage quota exceeded");
    expect(await vault.getManifest("quota-sidecar")).toMatchObject({ status: "recording" });
  });

  it("retains a browser quota error name when the platform supplies no message", async () => {
    const memory = createMemoryGhostVaultBackend();
    const quotaBackend: GhostVaultBackend = {
      ...memory,
      commit: async (operations) => {
        if (operations.some((operation) => operation.store === "chunks")) throw new DOMException("", "QuotaExceededError");
        await memory.commit(operations);
      },
      commitWhileJournalMatches: async (sessionId, leaseId, operations) => {
        if (operations.some((operation) => operation.store === "chunks")) throw new DOMException("", "QuotaExceededError");
        await memory.commitWhileJournalMatches(sessionId, leaseId, operations);
      },
    };
    const recorder = new GhostLiveRecorder({
      createVault: () => Promise.resolve(new GhostLocalVault(quotaBackend)),
      now: () => "2026-07-30T00:00:01.000Z",
      chunkEntries: 1,
      maxPendingWrites: 1,
    });
    recorder.start({ sessionId: "named-quota-sidecar", createdAt: "2026-07-30T00:00:00.000Z", provenance: {} });
    recorder.record("commands", 1, { command: { type: "dash" } });

    await expect(recorder.finish({ outcome: "interrupted" })).resolves.toBeNull();
    expect(recorder.failure).toContain("QuotaExceededError");
  });
});
