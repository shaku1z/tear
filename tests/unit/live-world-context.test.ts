import { describe, expect, it } from "vitest";

import { createLiveWorldServices, type LiveWorldContextDependencies } from "../../src/app/world/world-context";
import { createTearWorldConfiguration } from "../../src/gameplay/runtime/tear-world-configuration";
import type { GameRuntimeDependencies } from "../../src/app/shell/game-runtime-dependencies";
import { createCosmeticEmissionRandom } from "../../src/domain/cosmetic-emission-random";

describe("live world context", () => {
  it("adapts live singleton services through narrow world ports", () => {
    const calls: string[] = [];
    const entropy = createCosmeticEmissionRandom(),
      next = entropy.next;
    const dependencies: LiveWorldContextDependencies = {
      CLOCK: { sim: 4 },
      GAME_RANDOM: {
        reset: (seed) => {
          calls.push(`reset:${String(seed)}`);
        },
      },
      cosmeticEmissionRandom: {
        resetRun: (seed) => {
          calls.push(`cosmetic:${String(seed)}`);
          entropy.resetRun(seed);
        },
      },
      GAME_RANDOM_STREAMS: {
        stream: (name) => ({ next: () => 0, name }),
        snapshot: () => ({
          legacy: { state: 1 },
          combat: { state: 2 },
          "enemy-ai": { state: 3 },
          spawn: { state: 4 },
          draft: { state: 5 },
          boss: { state: 6 },
          world: { state: 7 },
          cosmetic: { state: 8 },
        }),
        restore: () => {
          calls.push("restore");
        },
      },
      FX: {
        reset: () => {
          calls.push("fx");
        },
        list: [{}, {}],
      },
      Backdrop: {
        resetFx: () => {
          calls.push("backdrop");
        },
      },
      Mirror: { active: true, host: { id: "mirror" } },
      BOSSFX: { q: [1, 2] },
    };
    const services = createLiveWorldServices({
      dependencies,
      configuration: createTearWorldConfiguration({} as GameRuntimeDependencies["CONFIG"]),
    });

    services.configuration.resetToBase();
    services.random.resetRun(17);
    entropy.next();
    const afterRunStart = entropy.snapshot();
    services.random.restore(services.random.snapshot());
    services.clock.advance(0.5);
    services.clock.set(9);
    services.clock.reset();
    services.effects.resetWorld();
    services.mirror.reset();
    services.bossFeedback.clear();

    expect(services.clock.seconds()).toBe(0);
    expect(services.effects.count()).toBe(2);
    expect(services.random.stream("spawn").next()).toBe(0);
    expect(Object.isFrozen(services)).toBe(true);
    expect(dependencies.Mirror).toEqual({ active: false, host: null });
    expect(dependencies.BOSSFX.q).toEqual([]);
    expect(calls).toEqual(["reset:17", "cosmetic:17", "restore", "fx", "backdrop"]);
    expect(entropy.next).toBe(next);
    expect(entropy.snapshot()).toEqual(afterRunStart);
  });
});
