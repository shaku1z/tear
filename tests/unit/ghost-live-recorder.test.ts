import { describe, expect, it } from "vitest";

import { GhostLiveRecorder, GhostLocalVault, GhostStreamingRecorder, createMemoryGhostVaultBackend } from "../../src/ghost";

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
  });
});
