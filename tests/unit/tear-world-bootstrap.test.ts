import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { createTearWorldBootstrap } from "../../src/gameplay/runtime/tear-world-bootstrap";

describe("Tear world bootstrap", () => {
  it("constructs independent configuration, clock, and named RNG services from data-only bases", () => {
    const first = createTearWorldBootstrap(CONFIG);
    const second = createTearWorldBootstrap(CONFIG);

    first.configuration.value.world.gravity = 1234;
    first.clock.sim = 3;
    first.random.streams.reset("same-seed");
    second.random.streams.reset("same-seed");

    expect(first.configuration).not.toBe(second.configuration);
    expect(first.configuration.value).not.toBe(second.configuration.value);
    expect(second.configuration.value.world.gravity).toBe(CONFIG.world.gravity);
    first.configuration.resetToBase();
    expect(first.configuration.value.world.gravity).toBe(CONFIG.world.gravity);
    expect(first.clock).not.toBe(second.clock);
    expect(second.clock.sim).toBe(0);
    expect(first.random).not.toBe(second.random);
    expect(first.random.streams.stream("enemy-ai").next())
      .toBe(second.random.streams.stream("enemy-ai").next());
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("retains run-lifecycle authority over RNG reset timing", () => {
    const world = createTearWorldBootstrap(CONFIG);
    const reference = createTearWorldBootstrap(CONFIG);
    expect(world.random.streams.snapshot()).toEqual(reference.random.streams.snapshot());
    world.random.streams.reset("run-a");
    const seeded = world.random.streams.stream("combat").next();
    world.random.streams.reset("run-a");

    expect(world.random.streams.stream("combat").next()).toBe(seeded);
  });
});
