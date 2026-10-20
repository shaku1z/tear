import { describe, expect, it, vi } from "vitest";
import { createLiveWatchAgentHost } from "../../src/agents/live-watch-agent-host";
import type { LiveTearRuntimeEnvironmentContext } from "../../src/tearbench/live-runtime-contracts";
import { GhostLiveRecorder } from "../../src/ghost/live-recorder";
import { GhostLocalVault, createMemoryGhostVaultBackend } from "../../src/ghost/capsule-vault";

// These cases exercise the Watch scheduling/recorder boundary, not combat policy quality.
vi.mock("../../src/agents/hierarchical-policy-adapter", () => ({ TearLiveHierarchicalPolicy: class {
  decide() { return { actions: [], trace: { maneuver: "observe" } }; }
} }));
vi.mock("../../src/tearbench/live-runtime-environment", () => ({ projectLiveTearObservation: () => ({ run: { wave: 1 }, entities: [], player: { hp: 100 } }) }));

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, refuse) => { resolve = accept; reject = refuse; });
  return { promise, resolve, reject };
}
function fixture(delayWrite = false, capture = true) {
  const backend = createMemoryGhostVaultBackend(), write = deferred<undefined>(); let writeBlocked = false;
  const vault = new GhostLocalVault({ ...backend, async commitWhileJournalMatches(...args) {
    if (delayWrite && !writeBlocked && args[2].some((entry) => entry.store === "chunks")) { writeBlocked = true; await write.promise; }
    return backend.commitWhileJournalMatches(...args);
  } }), opening = deferred<GhostLocalVault>();
  const recorder = new GhostLiveRecorder({ createVault: () => opening.promise, now: () => "2026-10-19T00:00:01Z" });
  let screen = "menu", tick = 0, entries = 0;
  const run = { runSeed: 121, wave: 1, weaponLog: [], weaponStats: { heldHits: 0, trueCuts: 0, throws: 0, throwHits: 0, perfectParries: 0 } };
  const drain = vi.fn(() => recorder.drain());
  const context = {
    screen: () => screen, subscribeEngineEvent: () => () => undefined,
    state: { run: () => run, player: () => ({ hp: 100 }), enemies: () => [], blade: () => undefined },
    authoritative: () => ({ tick }), progression: () => ({ wallet: 0, lifetimeEarned: 0, levels: {}, shop: [] }),
    setSemanticInputAuthority: vi.fn(), stopFrameLoop: vi.fn(), startFrameLoop: vi.fn(), render: vi.fn(),
    choiceIds: () => [], setRunSeed: vi.fn(), skipCinematic: vi.fn(), pushAction: vi.fn(),
    activateControl: (action: { type: string; to?: string }) => {
      if (action.type === "navigate") screen = action.to ?? screen;
      if (action.type === "setup.start") {
        screen = "playing"; if (capture) recorder.start({ sessionId: "cooperative-watch", createdAt: "2026-10-19T00:00:00Z", provenance: {} });
      }
      return true;
    },
    advanceApplicationFrame: (delta: number) => {
      expect(delta).toBe(1 / 60); tick += 2;
      for (let index = 0; capture && index < 3; index++) recorder.record("commands", tick, { ordinal: ++entries });
    }, drainRecording: drain,
  } as unknown as LiveTearRuntimeEnvironmentContext;
  const api = createLiveWatchAgentHost(context);
  const start = () => { api.start({ mode: "campaign", difficulty: "normal", weapon: "riftlock", seed: 121 }); while (screen === "setup") api.run(1); };
  return { api, recorder, vault, opening, drain, start, write, writeBlocked: () => writeBlocked, tick: () => tick, menu: () => { screen = "menu"; } };
}

describe("cooperative Watch recording", () => {
  it("reproduces synchronous startup overload and retains all ordered entries cooperatively without partial chunk seals", async () => {
    const overloaded = fixture(); overloaded.start(); overloaded.api.run(200);
    expect(overloaded.recorder.failure).toContain("staging capacity exceeded (576 entries)");
    overloaded.opening.resolve(overloaded.vault); await expect(overloaded.recorder.drain()).rejects.toThrow("staging capacity exceeded");
    expect(await overloaded.recorder.finish()).toBeNull();

    const f = fixture(true); f.start(); const advancing = f.api.runAsync(200);
    expect(f.tick()).toBe(0); expect(() => f.api.run(1)).toThrow("already in progress");
    await expect(f.api.runAsync(1)).rejects.toThrow("already in progress");
    f.opening.resolve(f.vault); await vi.waitFor(() => { expect(f.writeBlocked()).toBe(true); });
    expect(f.tick()).toBe(2); f.write.resolve(undefined); await advancing;
    expect(f.tick()).toBe(400); expect(f.recorder.failure).toBeNull(); expect(f.recorder.maxStagingEntries).toBe(576);
    expect((await f.vault.getManifest("cooperative-watch"))?.chunks).toHaveLength(7); // bootstrap + six full 96-entry command chunks; the partial tail remains unsealed.
    const manifest = await f.recorder.finish({ outcome: "constructed-unit-terminal" });
    expect(manifest?.status).toBe("complete"); expect(manifest?.chunks).toHaveLength(9);
    const entries = (await Promise.all((manifest?.chunks.filter((chunk) => chunk.kind === "commands") ?? []).map((chunk) => f.vault.readChunk(chunk)))).flat();
    expect(entries.map((entry) => (entry as { value: { ordinal: number } }).value.ordinal)).toEqual(Array.from({ length: 600 }, (_, index) => index + 1));
  });

  it("cancels a pending owner immediately and cannot apply its late IO failure to a replacement owner", async () => {
    const f = fixture(), first = deferred<undefined>(), second = deferred<undefined>(); f.start();
    f.drain.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const old = f.api.runAsync(5); f.api.pause(); f.api.resume(); const next = f.api.runAsync(1);
    expect((await old).status).toBe("running"); expect(() => f.api.run(1)).toThrow("already in progress");
    first.reject(new Error("stale quota failure")); await Promise.resolve(); expect(f.api.snapshot().terminalReason).toBeUndefined();
    f.api.stop(); expect((await next).status).toBe("stopped"); second.resolve(undefined); expect(f.tick()).toBe(0);
    f.opening.resolve(f.vault); await f.recorder.finish();
  });

  it("services a queued native-task Pause when recording drain resolves immediately", async () => {
    const f = fixture(false, false); f.start();
    const paused = new Promise<void>((resolve) => { setTimeout(() => { f.api.pause(); resolve(); }, 0); });
    const result = await f.api.runAsync(200); await paused;
    expect(result.status).toBe("paused"); expect(f.tick()).toBeGreaterThan(0); expect(f.tick()).toBeLessThan(400);
  });

  it("makes genuine storage failure visible and advances no frame after refusal", async () => {
    const f = fixture(); f.start(); const advancing = f.api.runAsync(20);
    f.opening.reject(new Error("actual storage refused"));
    const failed = await advancing; expect(failed.status).toBe("failed"); expect(failed.terminalReason).toContain("actual storage refused");
    expect(f.tick()).toBe(0); expect(f.recorder.failure).toContain("actual storage refused");
    expect(await f.recorder.finish()).toBeNull();
  });
});
