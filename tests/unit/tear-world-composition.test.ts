import { describe, expect, it } from "vitest";

import { createTearWorldComposition } from "../../src/gameplay/runtime/tear-world-composition";

describe("Tear world composition", () => {
  it("joins supplied ports with one owned lifecycle and transient record", () => {
    const state = { id: "state" };
    const entities = { id: "entities" };
    const services = { id: "services" };
    const cinema = { id: "cinema" };

    const world = createTearWorldComposition({ state, entities, services, cinema });

    expect(world.state).toBe(state);
    expect(world.entities).toBe(entities);
    expect(world.context.services).toBe(services);
    expect(world.context.cinema).toBe(cinema);
    expect(world.context.lifecycle).toBe(world.lifecycle);
    expect(world.context.transient.impact).toEqual({ hitStop: 0, slowMotion: 0, shake: 0 });
    expect(Object.isFrozen(world)).toBe(true);
  });

  it("does not share lifecycle or transient records between worlds", () => {
    const first = createTearWorldComposition({ state: {}, entities: {}, services: {}, cinema: {} });
    const second = createTearWorldComposition({ state: {}, entities: {}, services: {}, cinema: {} });

    first.context.transient.impact.shake = 4;
    first.lifecycle.start("first");

    expect(second.context.transient.impact.shake).toBe(0);
    expect(second.lifecycle.phase).toBe("idle");
  });
});
