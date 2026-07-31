import { describe, expect, it } from "vitest";

import {
  createLiveWorldContext,
  type LiveWorldContextDependencies,
} from "../../src/app/live-world-context";
import type { LiveGameHostState } from "../../src/app/live-game-host-state";

describe("live world context", () => {
  it("adapts live singleton services through narrow world ports", () => {
    const calls: string[] = [];
    const dependencies: LiveWorldContextDependencies = {
      CLOCK: { sim: 4 },
      GAME_RANDOM: { reset: (seed) => { calls.push(`reset:${String(seed)}`); } },
      GAME_RANDOM_STREAMS: {
        stream: (name) => ({ next: () => 0, name }),
        snapshot: () => ({ legacy: { state: 1 }, combat: { state: 2 }, "enemy-ai": { state: 3 }, spawn: { state: 4 }, draft: { state: 5 }, boss: { state: 6 }, world: { state: 7 }, cosmetic: { state: 8 } }),
        restore: () => { calls.push("restore"); },
      },
      FX: { reset: () => { calls.push("fx"); }, list: [{}, {}] },
      Backdrop: { resetFx: () => { calls.push("backdrop"); } },
      Mirror: { active: true, host: { id: "mirror" } },
      BOSSFX: { q: [1, 2] },
    };
    const context = createLiveWorldContext({
      dependencies, state: {} as LiveGameHostState, entities: {} as never,
      lifecycle: {} as never, restoreConfiguration: () => { calls.push("configuration"); },
    });

    context.services.configuration.resetToBase();
    context.services.random.resetRun(17); context.services.random.restore(context.services.random.snapshot());
    context.services.clock.advance(0.5); context.services.clock.set(9); context.services.clock.reset();
    context.services.effects.resetWorld(); context.services.mirror.reset(); context.services.bossFeedback.clear();

    expect(context.services.clock.seconds()).toBe(0);
    expect(context.services.effects.count()).toBe(2);
    expect(context.services.random.stream("spawn").next()).toBe(0);
    expect(dependencies.Mirror).toEqual({ active: false, host: null });
    expect(dependencies.BOSSFX.q).toEqual([]);
    expect(calls).toEqual(["configuration", "reset:17", "restore", "fx", "backdrop"]);
  });
});
