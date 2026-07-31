import { describe, expect, it } from "vitest";

import {
  createTearWorldContext,
  createTearWorldState,
  type TearWorldServices,
} from "../../src/gameplay/runtime/tear-world-context";
import { createTearWorldTransientState } from "../../src/gameplay/runtime/tear-world-transient-state";

interface Run { readonly id: string; }
interface Actor { readonly id: string; }
interface BossMarker { readonly id: string; }

describe("Tear world context", () => {
  it("owns mutable per-world collections without crossing state between worlds", () => {
    const firstEnemy = { id: "first-enemy" };
    const initialEnemies = [firstEnemy];
    const first = createTearWorldState<Run, Actor, Actor, Actor, Actor, Actor, Actor, Actor, BossMarker, BossMarker>({
      run: { id: "one" }, player: { id: "one-player" }, blade: { id: "one-blade" }, enemies: initialEnemies,
    });
    const second = createTearWorldState<Run, Actor, Actor, Actor, Actor, Actor, Actor, Actor, BossMarker, BossMarker>();

    initialEnemies.push({ id: "external" });
    first.enemies().push({ id: "world-only" });
    first.setProjectiles([{ id: "projectile" }]);
    first.setBossIntro({ id: "intro" });
    first.setBossBeat({ id: "beat" });

    expect(first.run()).toEqual({ id: "one" });
    expect(first.enemies()).toEqual([firstEnemy, { id: "world-only" }]);
    expect(first.projectiles()).toEqual([{ id: "projectile" }]);
    expect(first.bossIntro()).toEqual({ id: "intro" });
    expect(first.bossBeat()).toEqual({ id: "beat" });
    expect(second.enemies()).toEqual([]);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("preserves typed service delegation behind an immutable context", () => {
    const calls: string[] = [];
    const state = createTearWorldState<Run, Actor, Actor, Actor, Actor, Actor, Actor, Actor, BossMarker, BossMarker>();
    const services: TearWorldServices<{ readonly seed: string }, "spawn", { readonly id: string }> = {
      configuration: Object.freeze({ resetToBase: () => { calls.push("configuration"); } }),
      random: Object.freeze({
        resetRun: (seed) => { calls.push(`reset:${String(seed)}`); },
        stream: (name) => ({ id: `${name}-stream` }),
        snapshot: () => ({ seed: "before" }),
        restore: (snapshot) => { calls.push(`restore:${snapshot.seed}`); },
      }),
      clock: Object.freeze({
        seconds: () => 12,
        set: (seconds) => { calls.push(`set:${String(seconds)}`); },
        reset: () => { calls.push("clock"); },
        advance: (seconds) => { calls.push(`advance:${String(seconds)}`); },
      }),
      effects: Object.freeze({ resetWorld: () => { calls.push("effects"); }, count: () => 4 }),
      mirror: Object.freeze({ reset: () => { calls.push("mirror"); } }),
      bossFeedback: Object.freeze({ clear: () => { calls.push("boss-feedback"); } }),
    };
    const context = createTearWorldContext(state, { create: "entities" }, { phase: "ready" }, services,
      createTearWorldTransientState());

    context.services.configuration.resetToBase();
    context.services.random.resetRun("seed");
    context.services.random.restore(context.services.random.snapshot());
    context.services.clock.set(4); context.services.clock.advance(0.5); context.services.clock.reset();
    context.services.effects.resetWorld(); context.services.mirror.reset(); context.services.bossFeedback.clear();

    expect(context.services.random.stream("spawn")).toEqual({ id: "spawn-stream" });
    expect(context.services.clock.seconds()).toBe(12);
    expect(context.services.effects.count()).toBe(4);
    expect(calls).toEqual(["configuration", "reset:seed", "restore:before", "set:4", "advance:0.5", "clock", "effects", "mirror", "boss-feedback"]);
    expect(context.transient.impact).toEqual({ hitStop: 0, slowMotion: 0, shake: 0 });
    expect(Object.isFrozen(context)).toBe(true);
  });
});
