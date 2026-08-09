import { describe, expect, it, vi } from "vitest";
import { LivePlayerWatchController, type PlayerWatchPort } from "../../src/app/live-player-watch-controller";

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
    await controller.refresh(); controller.start(); controller.advance(); controller.pause(); controller.resume(); controller.stop();
    expect(target.started).toHaveBeenCalledOnce(); expect(target.pushed).toHaveBeenCalledWith({ type: "move", x: 1, y: 0 });
    expect((target.authority.mock.calls as unknown as readonly (readonly [unknown])[]).map(([value]) => value)).toEqual([true, false, true, false]);
    expect(controller.snapshot()).toMatchObject({ status: "stopped", decisions: 1 });
  });
  it("refuses non-artifact output instead of selecting a scripted fallback", async () => {
    const target = port(), runtime = { decide: vi.fn(() => Object.freeze({ source: "scripted-fallback", actions: Object.freeze([{ type: "move", x: 1, y: 0 }]) })) };
    const controller = new LivePlayerWatchController(undefined, target, () => Promise.resolve(runtime as unknown as never));
    await controller.refresh(); controller.start(); controller.advance();
    expect(target.pushed).not.toHaveBeenCalled(); expect(controller.snapshot().status).toBe("unavailable");
  });
});
