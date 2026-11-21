import { describe, expect, it, vi } from "vitest";

import { AuthoritativeStepController, DeferredCanonicalState } from "../../src/gameplay/runtime/authoritative-step";
import { AuthoritativeInputState } from "../../src/gameplay/runtime/authoritative-input";
import {
  captureCanonicalGameplayState,
  projectCanonicalGameplayState,
  type RuntimeEnemyState,
} from "../../src/gameplay/runtime/canonical-state";
import type { TutorialSessionCheckpoint } from "../../src/gameplay/training/tutorial-session-checkpoint";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { stableVerificationHash } from "../../src/domain/hash";

describe("deferred canonical state", () => {
  it("projects at most once, only when read, and shares the result", () => {
    const project = vi.fn(() => Object.freeze({ value: 1 }));
    const deferred = new DeferredCanonicalState(project);
    expect(project).not.toHaveBeenCalled();
    const first = deferred.state;
    expect(deferred.state).toBe(first);
    expect(project).toHaveBeenCalledOnce();
  });

  it("retries a failed projection on the next read instead of caching a partial value", () => {
    let attempts = 0;
    const deferred = new DeferredCanonicalState(() => {
      attempts += 1;
      if (attempts === 1) throw new Error("projection failed");
      return attempts;
    });
    expect(() => deferred.state).toThrow("projection failed");
    expect(deferred.state).toBe(2);
    expect(deferred.state).toBe(2);
  });
});

describe("authoritative step pipeline", () => {
  it("runs actions, world step, after-world step and capture in that order, projecting lazily", () => {
    const order: string[] = [];
    const project = vi.fn(() => Object.freeze({ projected: true }));
    const controller = new AuthoritativeStepController({
      applyActions: () => {
        order.push("actions");
      },
      step: () => {
        order.push("step");
      },
      afterWorldStep: (tick) => {
        order.push(`after:${String(tick)}`);
      },
      snapshot: (tick) => {
        order.push(`capture:${String(tick)}`);
        return new DeferredCanonicalState(project);
      },
    });
    const result = controller.execute(1, 1 / 120, []);
    expect(order).toEqual(["actions", "step", "after:1", "capture:1"]);
    expect(project).not.toHaveBeenCalled();
    expect(result.stateHash).toBe(stableVerificationHash({ projected: true }));
    expect(result.state).toBe(controller.lastResult?.state);
    expect(project).toHaveBeenCalledOnce();
  });

  it("still accepts an eagerly built state", () => {
    const state = Object.freeze({ tick: 3 });
    const controller = new AuthoritativeStepController({
      applyActions: () => undefined,
      step: () => undefined,
      snapshot: () => state,
    });
    const result = controller.execute(3, 1 / 120, []);
    expect(result.state).toBe(state);
    expect(result.stateHash).toBe(stableVerificationHash(state));
  });
});

describe("canonical gameplay capture", () => {
  function liveWorld() {
    const environment = createEnvironmentRuntime({ stageId: "test", worldId: "capture" });
    environment.addField({
      kind: "bloom-well",
      geometry: { x: 10, y: 20, radius: 30 },
      state: "active",
      stateTick: 0,
      timer: 0.5,
      ownerId: null,
      schedule: null,
      eligibility: { player: true, enemies: true, bosses: false },
      force: null,
      cleanupReason: null,
    });
    const input = new AuthoritativeInputState();
    const run = { mode: "tutorial", wave: 2, score: 40, runTime: 1.23456, runSeed: 7 };
    const player = { x: 1.5, y: 2.25, vx: 3, vy: -4, hp: 99.5 };
    const blade = { state: "held", x: 5, y: 6, vx: 0, vy: 0 };
    const hart = {
      _gid: 2,
      kind: "white-hart",
      hp: 500,
      dead: false,
      x: 400,
      y: 300,
      vx: 1,
      vy: 0,
      state: "windup",
      routeTelegraph: Object.freeze([Object.freeze({ x: 1, y: 2 })]),
      candidateRoutes: Object.freeze([]),
    };
    const hound = {
      _gid: 1,
      kind: "rimehound",
      hp: 60,
      dead: false,
      x: 200,
      y: 300,
      vx: -2,
      vy: 0,
      atk: "flank",
      atkT: 0.25,
    };
    const tutorial = {
      version: 1,
      phase: "lesson-active",
      lessonId: "move",
      counters: { moveL: 1 },
      reached: ["move"],
    } as unknown as TutorialSessionCheckpoint;
    return { environment, input, run, player, blade, enemies: [hart, hound] as RuntimeEnemyState[], tutorial };
  }

  it("equals the eager projection at capture time after every live source changes", () => {
    const world = liveWorld();
    const rows = world.enemies.map((enemy) => ({ ...enemy }));
    const eager = projectCanonicalGameplayState(
      4,
      world.input.snapshot(),
      world.run,
      world.player,
      world.blade,
      rows,
      world.environment.snapshot(),
      world.tutorial,
    );
    const deferred = captureCanonicalGameplayState(
      4,
      world.input.snapshot(),
      world.run,
      world.player,
      world.blade,
      world.enemies.map((enemy) => ({ ...enemy })),
      world.environment.snapshot(),
      world.tutorial,
    );

    Object.assign(world.run, { wave: 9, score: 1_000, runTime: 50, mode: "endless" });
    Object.assign(world.player, { x: -1, hp: 1 });
    Object.assign(world.blade, { state: "thrown", x: 900 });
    Object.assign(world.enemies[0] ?? {}, { hp: 1, routeTelegraph: Object.freeze([]) });
    const fieldId = world.environment.fields()[0]?.id ?? "";
    world.environment.updateField(fieldId, { timer: 9, state: "expired" });
    world.input.beginTick(5, []);

    expect(stableVerificationHash(deferred.state)).toBe(stableVerificationHash(eager));
    expect(deferred.state).toEqual(eager);
  });
});
