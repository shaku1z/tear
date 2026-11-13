import { describe, expect, it, vi } from "vitest";
import { createLiveWatchAgentHost } from "../../src/agents/live-watch-agent-host";
import type { LiveTearRuntimeEnvironmentContext } from "../../src/tearbench/live-runtime-contracts";
import { GhostLiveRecorder } from "../../src/ghost/live-recorder";
import { GhostLocalVault, createMemoryGhostVaultBackend } from "../../src/ghost/capsule-vault";
import type { TearC32CanonicalActivePolicyRuntime } from "../../src/agents/c32-canonical-active-policy-runtime";
import type { CanonicalGameplayState } from "../../src/gameplay/runtime/canonical-state";
import type { TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";
import {
  advanceFactorizedReturnContext,
  beginFactorizedReturnContext,
  requireFactorizedReturnFrontier,
  type FactorizedReturnContext,
  type FactorizedReturnTransition,
} from "../../src/agents/c34-causal-action-features";

// These cases exercise the Watch scheduling/recorder boundary, not combat policy quality.
vi.mock("../../src/agents/hierarchical-policy-adapter", () => ({
  TearLiveHierarchicalPolicy: class {
    decide() {
      return { actions: [], trace: { maneuver: "observe" } };
    }
  },
}));
vi.mock("../../src/tearbench/live-runtime-environment", () => ({
  projectLiveTearObservation: () => ({ run: { wave: 1 }, entities: [], player: { hp: 100 } }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}
function fixture(delayWrite = false, capture = true, canonicalRuntime?: TearC32CanonicalActivePolicyRuntime) {
  const backend = createMemoryGhostVaultBackend(),
    write = deferred<undefined>();
  let writeBlocked = false;
  const vault = new GhostLocalVault({
      ...backend,
      async commitWhileJournalMatches(...args) {
        if (delayWrite && !writeBlocked && args[2].some((entry) => entry.store === "chunks")) {
          writeBlocked = true;
          await write.promise;
        }
        return backend.commitWhileJournalMatches(...args);
      },
    }),
    opening = deferred<GhostLocalVault>();
  const recorder = new GhostLiveRecorder({ createVault: () => opening.promise, now: () => "2026-10-19T00:00:01Z" });
  let screen = "menu",
    tick = 0,
    entries = 0;
  const run = {
    runSeed: 121,
    wave: 1,
    weaponLog: [],
    weaponStats: { heldHits: 0, trueCuts: 0, throws: 0, throwHits: 0, perfectParries: 0 },
  };
  let listener: ((event: TearGameplayEvent) => void) | undefined,
    ordinal = 0;
  const nativeStart = () => {
    tick = 0;
    screen = "playing";
    listener?.({
      kind: "run",
      tick: 0,
      transition: "started",
      runId: `unit-run-${String(++ordinal)}`,
      mode: "endless",
      difficulty: "normal",
      weaponId: "sword",
      wave: 1,
      score: 0,
      runTimeSeconds: 0,
    });
  };
  const canonical = (): CanonicalGameplayState => ({
    tick,
    input: { tick, moveX: 0, moveY: 0, aimTurn: 0, primaryHeld: false },
    run: { mode: "endless", wave: 1, seed: run.runSeed, score: 0, time: tick },
    player: { x: 0, y: 0, vx: 0, vy: 0, hp: 100_000 },
    blade: { state: "held", x: 1_000, y: 0, vx: 0, vy: 0 },
    enemies: [],
  });
  const drain = vi.fn(() => recorder.drain());
  const context = {
    screen: () => screen,
    subscribeEngineEvent: (next: typeof listener) => {
      listener = next;
      return () => undefined;
    },
    canonicalGameplayState: canonical,
    canonicalOriginState: () => (tick === 0 && screen === "playing" ? canonical() : null),
    availableGameActions: () => ["weapon"],
    drainConsumedActions: () => [],
    state: { run: () => run, player: () => ({ hp: 100 }), enemies: () => [], blade: () => undefined },
    authoritative: () => ({ tick }),
    progression: () => ({ wallet: 0, lifetimeEarned: 0, levels: {}, shop: [] }),
    setSemanticInputAuthority: vi.fn(),
    stopFrameLoop: vi.fn(),
    startFrameLoop: vi.fn(),
    render: vi.fn(),
    choiceIds: () => [],
    setRunSeed: vi.fn(),
    skipCinematic: vi.fn(),
    pushAction: vi.fn(),
    activateControl: (action: { type: string; to?: string }) => {
      if (action.type === "navigate") screen = action.to ?? screen;
      if (action.type === "setup.start") {
        nativeStart();
        if (capture)
          recorder.start({ sessionId: "cooperative-watch", createdAt: "2026-10-19T00:00:00Z", provenance: {} });
      }
      return true;
    },
    advanceApplicationFrame: (delta: number) => {
      expect(delta).toBe(canonicalRuntime?.requiresCausalContext === true ? 1 / 120 : 1 / 60);
      tick += canonicalRuntime?.requiresCausalContext === true ? 1 : 2;
      for (let index = 0; capture && index < 3; index++) recorder.record("commands", tick, { ordinal: ++entries });
    },
    drainRecording: drain,
  } as unknown as LiveTearRuntimeEnvironmentContext;
  const api = createLiveWatchAgentHost(context, undefined, undefined, canonicalRuntime);
  const start = () => {
    api.start({ mode: "campaign", difficulty: "normal", weapon: "riftlock", seed: 121 });
    while (screen === "setup") api.run(1);
  };
  return {
    api,
    recorder,
    vault,
    opening,
    drain,
    start,
    write,
    nativeStart,
    writeBlocked: () => writeBlocked,
    tick: () => tick,
    menu: () => {
      screen = "menu";
    },
  };
}

describe("cooperative Watch recording", () => {
  it("starts new causal context only at a genuine next native run boundary", () => {
    let context: FactorizedReturnContext | undefined, runId: string | undefined;
    const begins = vi.fn((state: CanonicalGameplayState, id: string) => {
      context = beginFactorizedReturnContext(state);
      runId = id;
    });
    const runtime = {
      requiresCausalContext: true,
      clearCausalContext: vi.fn(() => {
        context = undefined;
        runId = undefined;
      }),
      beginCausalOrigin: begins,
      decide: (state: CanonicalGameplayState) => {
        if (!context) throw new Error("missing native origin");
        requireFactorizedReturnFrontier(context, state);
        return { actions: [], source: "artifact", stateHash: "1".repeat(16), factorizedVersion: 4 };
      },
      observeCommitted: (transition: FactorizedReturnTransition, id: string) => {
        if (!context || id !== runId) throw new Error("wrong run");
        context = advanceFactorizedReturnContext(context, transition);
      },
    } as unknown as TearC32CanonicalActivePolicyRuntime;
    const f = fixture(false, false, runtime);
    f.start();
    f.api.run(2);
    expect(f.tick()).toBe(2);
    expect(begins.mock.calls.map((call) => call[1])).toEqual(["unit-run-1"]);
    f.nativeStart();
    f.api.run(1);
    expect(f.tick()).toBe(1);
    expect(begins.mock.calls.map((call) => [call[0].tick, call[1]])).toEqual([
      [0, "unit-run-1"],
      [0, "unit-run-2"],
    ]);
  });
  it("reproduces synchronous startup overload and retains all ordered entries cooperatively without partial chunk seals", async () => {
    const overloaded = fixture();
    overloaded.start();
    overloaded.api.run(200);
    expect(overloaded.recorder.failure).toContain("staging capacity exceeded (576 entries)");
    overloaded.opening.resolve(overloaded.vault);
    await expect(overloaded.recorder.drain()).rejects.toThrow("staging capacity exceeded");
    expect(await overloaded.recorder.finish()).toBeNull();

    const f = fixture(true);
    f.start();
    const advancing = f.api.runAsync(200);
    expect(f.tick()).toBe(0);
    expect(() => f.api.run(1)).toThrow("already in progress");
    await expect(f.api.runAsync(1)).rejects.toThrow("already in progress");
    f.opening.resolve(f.vault);
    await vi.waitFor(() => {
      expect(f.writeBlocked()).toBe(true);
    });
    expect(f.tick()).toBe(2);
    f.write.resolve(undefined);
    await advancing;
    expect(f.tick()).toBe(400);
    expect(f.recorder.failure).toBeNull();
    expect(f.recorder.maxStagingEntries).toBe(576);
    expect((await f.vault.getManifest("cooperative-watch"))?.chunks).toHaveLength(7); // bootstrap + six full 96-entry command chunks; the partial tail remains unsealed.
    const manifest = await f.recorder.finish({ outcome: "constructed-unit-terminal" });
    expect(manifest?.status).toBe("complete");
    expect(manifest?.chunks).toHaveLength(9);
    const entries = (
      await Promise.all(
        (manifest?.chunks.filter((chunk) => chunk.kind === "commands") ?? []).map((chunk) => f.vault.readChunk(chunk)),
      )
    ).flat();
    expect(entries.map((entry) => (entry as { value: { ordinal: number } }).value.ordinal)).toEqual(
      Array.from({ length: 600 }, (_, index) => index + 1),
    );
  });

  it("cancels a pending owner immediately and cannot apply its late IO failure to a replacement owner", async () => {
    const f = fixture(),
      first = deferred<undefined>(),
      second = deferred<undefined>();
    f.start();
    f.drain.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const old = f.api.runAsync(5);
    f.api.pause();
    f.api.resume();
    const next = f.api.runAsync(1);
    expect((await old).status).toBe("running");
    expect(() => f.api.run(1)).toThrow("already in progress");
    first.reject(new Error("stale quota failure"));
    await Promise.resolve();
    expect(f.api.snapshot().terminalReason).toBeUndefined();
    f.api.stop();
    expect((await next).status).toBe("stopped");
    second.resolve(undefined);
    expect(f.tick()).toBe(0);
    f.opening.resolve(f.vault);
    await f.recorder.finish();
  });

  it("services a queued native-task Pause when recording drain resolves immediately", async () => {
    const f = fixture(false, false);
    f.start();
    const paused = new Promise<void>((resolve) => {
      setTimeout(() => {
        f.api.pause();
        resolve();
      }, 0);
    });
    const result = await f.api.runAsync(200);
    await paused;
    expect(result.status).toBe("paused");
    expect(f.tick()).toBeGreaterThan(0);
    expect(f.tick()).toBeLessThan(400);
  });

  it("makes genuine storage failure visible and advances no frame after refusal", async () => {
    const f = fixture();
    f.start();
    const advancing = f.api.runAsync(20);
    f.opening.reject(new Error("actual storage refused"));
    const failed = await advancing;
    expect(failed.status).toBe("failed");
    expect(failed.terminalReason).toContain("actual storage refused");
    expect(f.tick()).toBe(0);
    expect(f.recorder.failure).toContain("actual storage refused");
    expect(await f.recorder.finish()).toBeNull();
  });
});
