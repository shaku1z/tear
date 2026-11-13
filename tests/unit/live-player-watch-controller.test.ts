import { describe, expect, it, vi } from "vitest";
import { LivePlayerWatchController, type PlayerWatchPort } from "../../src/app/engineering/player-watch-controller";

const state = Object.freeze({ tick: 1 } as never);
function port(): PlayerWatchPort & { readonly pushed: ReturnType<typeof vi.fn>; readonly authority: ReturnType<typeof vi.fn>; readonly started: ReturnType<typeof vi.fn> } {
  const pushed = vi.fn(), authority = vi.fn(), started = vi.fn();
  return Object.freeze({ canonicalState: () => state, availableActions: () => ["move"] as const, pushAction: pushed, setSemanticAuthority: authority, startNormalRun: started, pushed, authority, started });
}
describe("normal player Watch controller", () => {
  it("is visibly unavailable when no validated local candidate can load", async () => {
    const controller = new LivePlayerWatchController(undefined, port(), () => Promise.resolve(undefined));
    await controller.refresh(); expect(controller.snapshot()).toMatchObject({ status: "unavailable", decisions: 0 });
  });
  it("uses only a loaded canonical decision and restores native authority on pause, resume, and stop", async () => {
    const target = port();
    const runtime = { decide: vi.fn(() => Object.freeze({ source: "artifact" as const, actions: Object.freeze([{ type: "move", x: 1, y: 0 }]) })) };
    const controller = new LivePlayerWatchController(undefined, target, () => Promise.resolve(runtime as unknown as never));
    await controller.refresh(); await controller.start(); controller.advance(); controller.pause(); controller.resume(); controller.stop();
    expect(target.started).toHaveBeenCalledOnce(); expect(target.pushed).toHaveBeenCalledWith({ type: "move", x: 1, y: 0 });
    expect((target.authority.mock.calls as unknown as readonly (readonly [unknown])[]).map(([value]) => value)).toEqual([true, false, true, false]);
    expect(controller.snapshot()).toMatchObject({ status: "stopped", decisions: 1 });
  });
  it("refuses non-artifact output instead of selecting a scripted fallback", async () => {
    const target = port(), runtime = { decide: vi.fn(() => Object.freeze({ source: "scripted-fallback", actions: Object.freeze([{ type: "move", x: 1, y: 0 }]) })) };
    const controller = new LivePlayerWatchController(undefined, target, () => Promise.resolve(runtime as unknown as never));
    await controller.refresh(); await controller.start(); controller.advance();
    expect(target.pushed).not.toHaveBeenCalled(); expect(controller.snapshot().status).toBe("unavailable");
  });
  it("hands actual decisions to one observation across pause and finalizes only at a terminal", async () => {
    const target = port(), observation = { begin: vi.fn(() => Promise.resolve()), record: vi.fn(),
      finish: vi.fn(() => Promise.resolve("Observation retained: stopped.")) };
    const runtime = { observation, decide: vi.fn(() => ({ source: "artifact" as const, stateHash: "1".repeat(16),
      artifactId: "candidate", artifactHash: "2".repeat(16), activationHash: "3".repeat(16), actions: [{ type: "move", x: 1, y: 0 }] })) };
    const controller = new LivePlayerWatchController(undefined, target, () => Promise.resolve(runtime as unknown as never));
    await controller.refresh(); await controller.start(); controller.advance(); controller.pause();
    expect(observation.begin).toHaveBeenCalledOnce();
    expect(observation.record).toHaveBeenCalledOnce();
    expect(observation.finish).not.toHaveBeenCalled();
    controller.resume(); controller.advance(); controller.stop(); controller.stop();
    await vi.waitFor(() => { expect(observation.finish).toHaveBeenCalledOnce(); });
    expect(controller.snapshot().detail).toContain("Observation retained");
    const run = { kind: "run" as const, runId: "normal-run", mode: "endless", difficulty: "normal", weaponId: "sword", wave: 1, score: 0, runTimeSeconds: 0, tick: 1 };
    const targetRun = port(); let naturalState = state;
    runtime.decide.mockClear();
    const natural = new LivePlayerWatchController(undefined, { ...targetRun, bindRunEvents: true, canonicalState: () => naturalState,
      startNormalRun: () => { natural.observeRunEvent({ ...run, transition: "started" }); } }, () => Promise.resolve(runtime as unknown as never));
    await natural.refresh(); await natural.start(); natural.advance();
    expect(runtime.decide).not.toHaveBeenCalled();
    naturalState = Object.freeze({ tick: 2 } as never); natural.advance();
    natural.observeRunEvent({ ...run, transition: "paused" });
    expect(observation.finish).toHaveBeenCalledTimes(1);
    natural.observeRunEvent({ ...run, transition: "defeated" }); natural.observeRunEvent({ ...run, transition: "defeated" });
    await vi.waitFor(() => { expect(observation.finish).toHaveBeenCalledTimes(2); });
    expect(observation.finish).toHaveBeenLastCalledWith({ status: "completed", tick: 1, reason: "defeated" });
    runtime.decide.mockClear();
    const bounded = new LivePlayerWatchController(undefined, port(), () => Promise.resolve(runtime as unknown as never));
    await bounded.refresh(); await bounded.start();
    for (let index = 0; index < 257; index++) bounded.advance();
    expect(runtime.decide).toHaveBeenCalledTimes(256);
    expect(observation.finish).toHaveBeenLastCalledWith({ status: "stopped", tick: 1, reason: "decision-limit" });

  });

});
