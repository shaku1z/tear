import { describe, expect, it, vi } from "vitest";

const indexedDbBackendMock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../../src/ghost/indexeddb-vault-backend", () => ({
  createIndexedDbGhostVaultBackend: indexedDbBackendMock.create,
}));

import { GhostLiveRecorder, createBrowserGhostLiveRecorder } from "../../src/ghost/live-recorder";
import { GhostLocalVault, createMemoryGhostVaultBackend, type GhostVaultBackend } from "../../src/ghost/capsule-vault";
import { GhostStreamingRecorder } from "../../src/ghost/streaming-recorder";

describe("Ghost V3 live recorder sidecar", () => {
  it("binds pending drains to their original session and never adopts its late storage failure into a replacement", async () => {
    const base = createMemoryGhostVaultBackend();
    let release: (() => void) | undefined;
    const vault = new GhostLocalVault({
      ...base,
      async commitWhileJournalMatches(...args) {
        if (
          args[0] === "original" &&
          args[2].some((write) => write.store === "manifests" && write.value?.includes('"status":"complete"'))
        ) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          throw new Error("original terminal storage refused");
        }
        return base.commitWhileJournalMatches(...args);
      },
    });
    const recorder = new GhostLiveRecorder({
      createVault: () => Promise.resolve(vault),
      now: () => "2026-10-19T00:00:01Z",
    });
    recorder.start({ sessionId: "original", createdAt: "2026-10-19T00:00:00Z", provenance: {} });
    const finishing = recorder.finish();
    await vi.waitFor(() => {
      expect(release).toBeTypeOf("function");
    });
    let oldFailure: unknown,
      newFailure: unknown,
      drained = false;
    const oldDrain = recorder.drain().catch((error: unknown) => {
      oldFailure = error;
    });
    recorder.start({ sessionId: "replacement", createdAt: "2026-10-19T00:00:01Z", provenance: {} });
    recorder.record("commands", 1, { action: "retained-tail" });
    const newDrain = recorder
      .drain()
      .then(() => {
        drained = true;
      })
      .catch((error: unknown) => {
        newFailure = error;
      });
    try {
      await vi.waitFor(() => {
        expect(drained).toBe(true);
      });
    } finally {
      release?.();
      await finishing;
      await oldDrain;
      await newDrain;
      await recorder.finish();
    }
    expect(oldFailure).toBeInstanceOf(Error);
    expect(String(oldFailure)).toContain("original terminal storage refused");
    expect(newFailure).toBeUndefined();
    expect((await vault.getManifest("original"))?.status).toBe("recording");
    expect(await base.get("journals", "original")).toEqual(expect.any(String));
    expect((await vault.getManifest("replacement"))?.status).toBe("complete");
    expect(recorder.failure).toBeNull();
  });
  it("buffers live observations until durable storage opens, then finalizes an independent capsule", async () => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    let release: (() => void) | undefined;
    const recorder = new GhostLiveRecorder({
      createVault: async () =>
        new Promise<GhostLocalVault>((resolve) => {
          release = () => {
            resolve(vault);
          };
        }),
      now: () => "2026-07-28T00:00:01.000Z",
      chunkEntries: 1,
      maxPendingWrites: 1,
    });
    recorder.start({ sessionId: "live-sidecar", createdAt: "2026-07-28T00:00:00.000Z", provenance: { seed: "7" } });
    expect(recorder.activeSessionId).toBe("live-sidecar");
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
    expect(() => recorder.activeSessionId).toThrow(/no active session/u);
    expect(recorder.failure).toBeNull();
  });

  it("seals every entry when a run is stopped while its last entry is still being written", async () => {
    // A stop (the test bridge's terminate, or quitting) records its event and finishes in one call, at any
    // moment relative to the write queue. Every moment must seal the event and the result.
    for (let yields = 0; yields <= 12; yields += 1) {
      const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
      const recorder = new GhostLiveRecorder({
        createVault: () => Promise.resolve(vault),
        now: () => "2026-11-18T00:00:01.000Z",
      });
      recorder.start({ sessionId: "stopped", createdAt: "2026-11-18T00:00:00.000Z", provenance: {} });
      await recorder.drain();
      recorder.record("events", 1, { type: "earlier" });
      for (let turn = 0; turn < yields; turn += 1) await Promise.resolve();
      recorder.record("events", 2, { type: "run.abandoned" });
      const manifest = await recorder.finish({ abandoned: "stopped" });

      expect(recorder.failure, `after ${String(yields)} queue turns`).toBeNull();
      expect(manifest?.status, `after ${String(yields)} queue turns`).toBe("complete");
      const sealed = (await Promise.all((manifest?.chunks ?? []).map((chunk) => vault.readChunk(chunk)))).flat();
      expect(sealed).toContainEqual({ kind: "events", tick: 2, value: { type: "run.abandoned" } });
      expect(sealed).toContainEqual({ kind: "results", tick: 2, value: { abandoned: "stopped" } });
    }
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
      sessionId: "interrupted-before-live",
      createdAt: "2026-07-28T00:00:00.000Z",
      chunkEntries: 1,
      maxPendingWrites: 1,
      vault,
    });
    await interrupted.start();
    await interrupted.append({
      kind: "commands",
      tick: 1,
      value: { kind: "command", id: 1, tick: 1, command: { type: "jump" } },
    });

    const recorder = new GhostLiveRecorder({
      createVault: () => Promise.resolve(vault),
      now: () => "2026-07-28T00:00:02.000Z",
    });
    recorder.start({ sessionId: "live-after-recovery", createdAt: "2026-07-28T00:00:01.000Z", provenance: {} });
    const manifest = await recorder.finish({ outcome: "complete" });

    expect(await vault.getManifest("interrupted-before-live")).toMatchObject({ status: "recovered" });
    expect(manifest).toMatchObject({ id: "live-after-recovery", status: "complete" });
  });

  it("derives real capture cadence and write pressure from the selected recording profile", () => {
    const recorder = new GhostLiveRecorder({
      createVault: () => Promise.resolve(new GhostLocalVault(createMemoryGhostVaultBackend())),
      now: () => "2026-07-28T00:00:00.000Z",
      recordingProfile: "forensic-qa",
    });
    expect(recorder.keyframeIntervalTicks).toBe(60);
    expect(recorder.maxStagingEntries).toBeGreaterThan(0);
  });

  it("bounds asynchronous startup staging and converts exhaustion into an explicit incomplete recording", async () => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    let release: (() => void) | undefined;
    const recorder = new GhostLiveRecorder({
      createVault: async () =>
        new Promise<GhostLocalVault>((resolve) => {
          release = () => {
            resolve(vault);
          };
        }),
      now: () => "2026-07-30T00:00:01.000Z",
      chunkEntries: 1,
      maxPendingWrites: 1,
      maxStagingEntries: 2,
    });
    recorder.start({ sessionId: "bounded-staging", createdAt: "2026-07-30T00:00:00.000Z", provenance: {} });
    recorder.record("commands", 1, { command: { type: "jump", phase: "pressed" } });
    recorder.record("rng", 2, { state: "would-overflow" });
    expect(recorder.failure).toContain("staging capacity exceeded");
    release?.();

    await expect(recorder.finish({ outcome: "interrupted" })).resolves.toBeNull();
    expect(recorder.failure).toContain("staging capacity exceeded");
    expect(await vault.getManifest("bounded-staging")).toMatchObject({ status: "recording" });
    expect(await vault.recoverIncompleteSessions()).toMatchObject([{ id: "bounded-staging", status: "recovered" }]);
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
    expect(await vault.recoverIncompleteSessions()).toMatchObject([{ id: "failed-sidecar", status: "recovered" }]);
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
        if (operations.some((operation) => operation.store === "chunks"))
          throw new DOMException("", "QuotaExceededError");
        await memory.commit(operations);
      },
      commitWhileJournalMatches: async (sessionId, leaseId, operations) => {
        if (operations.some((operation) => operation.store === "chunks"))
          throw new DOMException("", "QuotaExceededError");
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

  it("passes recording epoch and manifest guards and leaves durable state untouched on rejection", async () => {
    const memory = createMemoryGhostVaultBackend();
    let sawGuards = false;
    const guardedBackend: GhostVaultBackend = {
      ...memory,
      commitWhileJournalMatches: async (sessionId, leaseId, operations, guards = []) => {
        if (operations.some((operation) => operation.store === "chunks")) {
          sawGuards =
            guards.some((guard) => guard.store === "indexes") && guards.some((guard) => guard.store === "manifests");
          throw new Error("forced guarded recording rejection");
        }
        await memory.commitWhileJournalMatches(sessionId, leaseId, operations, guards);
      },
    };
    const vault = new GhostLocalVault(guardedBackend);
    const recorder = new GhostStreamingRecorder({
      sessionId: "guarded-recording",
      createdAt: "2026-08-10T00:00:00.000Z",
      chunkEntries: 1,
      maxPendingWrites: 1,
      vault,
    });
    await recorder.start();
    const before = await vault.getManifest("guarded-recording");
    const epochBefore = await memory.get("indexes", "ghost-manifest-mutation-epoch:v1");
    await expect(recorder.append({ kind: "commands", tick: 1, value: { action: "jump" } })).rejects.toThrow(
      /forced guarded recording rejection/u,
    );
    expect(sawGuards).toBe(true);
    expect(await vault.getManifest("guarded-recording")).toEqual(before);
    expect(await memory.get("indexes", "ghost-manifest-mutation-epoch:v1")).toBe(epochBefore);
    expect(await memory.keys("chunks")).toEqual([]);
  });

  it("forwards browser-adapter guarded commits while preserving successful interception", async () => {
    const memory = createMemoryGhostVaultBackend();
    indexedDbBackendMock.create.mockResolvedValue(memory);
    let intercepted = 0;
    const interceptionKinds: string[] = [];
    const recorder = createBrowserGhostLiveRecorder({} as IDBFactory, {
      beforeCommit: (operations) => {
        intercepted += 1;
        if (operations.some((operation) => operation.store === "chunks")) interceptionKinds.push("chunk");
        else if (operations.some((operation) => operation.store === "journals" && operation.value !== undefined)) {
          interceptionKinds.push("open");
        }
      },
      chunkEntries: 1,
      maxPendingWrites: 1,
    });
    if (recorder === null) throw new Error("browser recorder did not initialize");
    recorder.start({ sessionId: "browser-guard-success", createdAt: "2026-08-10T00:00:00.000Z", provenance: {} });
    recorder.record("commands", 1, { action: "jump" });
    const manifest = await recorder.finish({ outcome: "complete" });
    expect(manifest).toMatchObject({ id: "browser-guard-success", status: "complete" });
    expect(intercepted).toBeGreaterThan(0);
    expect(interceptionKinds[0]).toBe("open");
    expect(interceptionKinds).toContain("chunk");
    expect(await new GhostLocalVault(memory).getManifest("browser-guard-success")).toMatchObject({
      status: "complete",
    });
  });

  it("forwards guards through the browser adapter and retains durable state on injected rejection", async () => {
    const memory = createMemoryGhostVaultBackend();
    let chunkInterceptions = 0;
    const seenGuardCounts: number[] = [];
    let rejectGuardedChunk = false;
    let signalBootstrap: (() => void) | undefined;
    const bootstrapCommitted = new Promise<void>((resolve) => {
      signalBootstrap = resolve;
    });
    const originalCommitWhile = memory.commitWhileJournalMatches.bind(memory);
    const guardedMemory: GhostVaultBackend = {
      ...memory,
      commitWhileJournalMatches: async (sessionId, leaseId, operations, guards = []) => {
        seenGuardCounts.push(guards.length);
        if (rejectGuardedChunk && operations.some((operation) => operation.key === "browser-guard-failure:chunk:1")) {
          rejectGuardedChunk = false;
          if (guards.length > 0) return Promise.reject(new Error("Vault conditional write no longer matches"));
        }
        await originalCommitWhile(sessionId, leaseId, operations, guards);
        if (
          operations.some(
            (operation) => operation.store === "chunks" && operation.key === "browser-guard-failure:chunk:0",
          )
        ) {
          signalBootstrap?.();
        }
      },
    };
    indexedDbBackendMock.create.mockResolvedValue(guardedMemory);
    const recorder = createBrowserGhostLiveRecorder({} as IDBFactory, {
      beforeCommit: (operations) => {
        if (!operations.some((operation) => operation.key === "browser-guard-failure:chunk:1")) return;
        chunkInterceptions += 1;
        // This is an injected backend conflict, not evidence of a real race.
        // It occurs only when the actual browser wrapper forwards its guards.
        rejectGuardedChunk = true;
      },
      chunkEntries: 1,
      maxPendingWrites: 1,
    });
    if (recorder === null) throw new Error("browser recorder did not initialize");
    recorder.start({ sessionId: "browser-guard-failure", createdAt: "2026-08-10T00:00:00.000Z", provenance: {} });
    await bootstrapCommitted;
    const vault = new GhostLocalVault(memory);
    const beforeRaw = await memory.get("manifests", "browser-guard-failure");
    const before = await vault.getManifest("browser-guard-failure");
    const chunksBefore = await memory.keys("chunks");
    const epochBefore = await memory.get("indexes", "ghost-manifest-mutation-epoch:v1");
    if (beforeRaw === undefined || before === undefined) throw new Error("browser guard fixture did not open");
    recorder.record("commands", 1, { action: "jump" });
    const finished = await recorder.finish({ outcome: "interrupted" });
    expect(finished).toBeNull();
    expect(chunkInterceptions).toBeGreaterThan(0);
    expect(seenGuardCounts.every((count) => count > 0)).toBe(true);
    expect(recorder.failure).toMatch(/conditional write|no longer matches/u);
    expect(await vault.getManifest("browser-guard-failure")).toEqual(before);
    expect(await memory.get("indexes", "ghost-manifest-mutation-epoch:v1")).toBe(epochBefore);
    expect(await memory.keys("chunks")).toEqual(chunksBefore);
    expect(await memory.get("manifests", "browser-guard-failure")).toBe(beforeRaw);
  });
});

describe("Ghost V3 live recorder on slow storage", () => {
  // Measured on Playwright's headless shell (nightly 44570058568): each IndexedDB write transaction took
  // about 250 ms, and a player walking into enemies sealed about 8 chunks a second.
  const WRITE_MS = 250,
    TICKS_PER_SECOND = 60,
    SECONDS = 15;

  /** A fighting player's stream: a command every tick and a burst of 3 events every 15 ticks, about 8 chunks/s. */
  function recordFight(recorder: GhostLiveRecorder, tick: number): void {
    recorder.record("commands", tick, { command: { type: "move", tick } });
    if (tick % 15 === 0) for (let hit = 0; hit < 3; hit += 1) recorder.record("events", tick, { hit, tick });
  }

  async function record(writeMs: number) {
    const base = createMemoryGhostVaultBackend();
    let writes = 0;
    const slow = <T>(commit: () => Promise<T>): Promise<T> => {
      writes += 1;
      return new Promise<void>((resolve) => setTimeout(resolve, writeMs)).then(commit);
    };
    const vault = new GhostLocalVault({
      ...base,
      commitIfMatches: (...args) => slow(() => base.commitIfMatches(...args)),
      commitWhileJournalMatches: (...args) => slow(() => base.commitWhileJournalMatches(...args)),
    });
    const recorder = new GhostLiveRecorder({
      createVault: () => Promise.resolve(vault),
      now: () => "2026-11-19T00:00:01.000Z",
      recordingProfile: "forensic-qa",
    });
    recorder.start({ sessionId: "slow-storage", createdAt: "2026-11-19T00:00:00.000Z", provenance: {} });
    for (let tick = 0; tick < SECONDS * TICKS_PER_SECOND; tick += 1) {
      recordFight(recorder, tick);
      await vi.advanceTimersByTimeAsync(1000 / TICKS_PER_SECOND);
    }
    const finishing = recorder.finish({ outcome: "defeat" });
    await vi.runAllTimersAsync();
    return { manifest: await finishing, failure: recorder.failure, writes };
  }

  it("keeps every chunk, in recording order, when each write takes 250 ms", async () => {
    vi.useFakeTimers();
    try {
      const instant = await record(0);
      const slow = await record(WRITE_MS);
      expect(slow.failure).toBeNull();
      expect(slow.manifest?.status).toBe("complete");
      // The same chunks as on instant storage: same ids, order, ticks and bytes.
      const chunks = (manifest: typeof slow.manifest) =>
        manifest?.chunks.map(({ id, sequence, kind, fromTick, toTick, checksum }) => ({
          id,
          sequence,
          kind,
          fromTick,
          toTick,
          checksum,
        }));
      expect(chunks(slow.manifest)).toEqual(chunks(instant.manifest));
      expect(slow.manifest?.chunks.map(({ sequence }) => sequence)).toEqual(
        slow.manifest?.chunks.map((_, index) => index),
      );
      // About 8 chunks a second were sealed; far fewer writes carried them.
      expect(slow.manifest?.chunks.length).toBeGreaterThan(7 * SECONDS);
      expect(slow.writes).toBeLessThan(slow.manifest?.chunks.length ?? 0);
    } finally {
      vi.useRealTimers();
    }
  });
});
