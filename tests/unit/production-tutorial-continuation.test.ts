import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CONFIG } from "../../src/config/game-config";
import { TUTORIAL_LESSON_IDS, type TutorialSessionCheckpoint } from "../../src/gameplay/training/tutorial-controller";
import { createTutorialArena } from "../../src/gameplay/training/tutorial-arenas";
import { projectCanonicalGameplayState } from "../../src/gameplay/runtime/canonical-state";
import { stableVerificationHash } from "../../src/replay/hash";
import { captureProductionReplayCheckpoint, createProductionGhostReplayComposition } from "../../src/tearbench/production-replay-composition";
import { createProductionHeadlessEnvironment, type ProductionHeadlessCheckpoint, type ProductionTutorialHandoffArtifact } from "../../src/tearbench/production-headless-environment";
import type { TearScenarioV1, TearSnapshotV1 } from "../../src/tearbench/contracts";
import { firstProductionC27AHashDivergence, replayProductionC27ATrace, type ProductionC27ATrace } from "../../src/tearbench/production-c27a-matrix";
import { ProductionHeadlessAcademyIntake } from "../../src/tearbench/production-headless-academy-intake";

const scenario: TearScenarioV1 = {
  format: "tear-contract", kind: "scenario", schemaVersion: 1, id: "retained-tutorial", version: 1,
  description: "Constructed retained tutorial boundary continuation", seed: "retained-tutorial-seed",
  stateClass: "recorded-canonical", executionClass: "engineering",
  start: { mode: "tutorial", difficulty: "normal", weapon: "sword" }, maxTicks: 1000,
  assertions: ["runtime.finite-state"], tags: ["tutorial", "continuation"],
};
const composition = () => createProductionGhostReplayComposition({ seed: scenario.seed, mode: "tutorial", weaponId: "sword", difficulty: "normal" });
type Source = ReturnType<ReturnType<typeof composition>["create"]>;
function boundary(source: Source, change: Partial<TutorialSessionCheckpoint>) {
  const saved = source.replay.tutorial.captureSession(); if (saved === undefined) throw new Error("source tutorial missing");
  source.replay.tutorial.restoreSession({ ...saved, courseSessionId: "retained-issued-course", pendingArena: null, ...change });
}
function capture(source: Source) { return captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "tutorial-boundary"); }
function restore(source: Source) { return composition().create(JSON.parse(JSON.stringify(capture(source).snapshot)) as TearSnapshotV1); }

describe("production tutorial reconstructed-byte continuation", () => {
  it("restores the inter-wave breath and the installed mixed encounter through the same production owner", () => {
    const source = composition().create(undefined);
    boundary(source, { lessonId: "field-test", reached: [...TUTORIAL_LESSON_IDS.slice(0, 13)],
      completed: [...TUTORIAL_LESSON_IDS.slice(0, 12)], fieldEncounter: "breath", interWaveRemaining: 2 / 120 });
    const restored = restore(source);
    expect(restored.replay.world.state.enemies()).toHaveLength(0);
    for (let tick = 0; tick < 4; tick++) {
      expect(restored.simulation.advanceOne([]).state).toEqual(source.simulation.advanceOne([]).state);
    }
    expect(restored.replay.tutorial.captureSession()).toMatchObject({ version: 2, curriculumVersion: 2, fieldEncounter: "mixed", interWaveRemaining: 0 });
    expect(restored.replay.world.state.enemies().map((enemy) => [enemy.kind, enemy.tutDummy === true])).toEqual([["charger", true], ["ranged", false]]);
    const mixed = restore(source);
    expect(mixed.replay.world.state.enemies()).toHaveLength(2);
    for (let tick = 0; tick < 180; tick++) {
      expect(mixed.simulation.advanceOne([]).state).toEqual(source.simulation.advanceOne([]).state);
    }
    expect(mixed.replay.tutorial.n.launch ?? 0).toBe(0);
    expect(mixed.replay.tutorial.doneT).toBe(0);
  });
  it.skipIf(process.env.TEAR_TUTORIAL_CONTINUATION_TRACE === undefined)("matches an explicitly supplied actual live Field Test trace through READY", () => {
    const path = process.env.TEAR_TUTORIAL_CONTINUATION_TRACE;
    if (path === undefined) throw new Error("actual live tutorial trace path is required");
    const trace = JSON.parse(readFileSync(path, "utf8")) as ProductionC27ATrace;
    expect(trace.originInput).toBeDefined();
    expect(trace.hashes.length).toBeGreaterThan(0);
    const replay = replayProductionC27ATrace(trace);
    const divergence = firstProductionC27AHashDivergence(trace, replay);
    if (divergence !== null) {
      expect(replay.hashes.find((entry) => entry.tick === divergence.tick)?.state,
        `first divergent canonical fields at tick ${String(divergence.tick)}`)
        .toEqual(trace.hashes.find((entry) => entry.tick === divergence.tick)?.state);
    }
    expect(divergence).toBeNull();
  });
  it("continues lesson delay into the next real arena without reinstalling the retained arena, and excludes display state", () => {
    const source = composition().create(undefined);
    boundary(source, { counters: { moveL: 60, moveR: 60 }, completed: ["move"], completionDelay: 0.02 });
    source.replay.stage.platforms.push({ x: 99, y: 200, w: 123, h: 24, oneway: true });
    const restored = restore(source), retained = structuredClone(source.replay.stage.platforms);
    expect(restored.replay.stage.platforms).toEqual(retained);
    expect(restored.replay.tutorial.captureSession()).toEqual(source.replay.tutorial.captureSession());
    const beforeDisplay = stableVerificationHash(source.semanticProjection());
    source.replay.tutorial.showHelp();
    source.replay.tutorial.restorePresentation({ version: 1, ghostTime: 91, anchorX: 4, evidencePulse: true, coachIdle: 3, coachDemoTime: 2, helpVisible: true });
    expect(stableVerificationHash(source.semanticProjection())).toBe(beforeDisplay);
    for (let tick = 1; tick <= 4; tick += 1) {
      expect(restored.simulation.advanceOne([]).state).toEqual(source.simulation.advanceOne([]).state);
      if (tick < 3) expect(restored.replay.stage.platforms).toEqual(retained);
    }
    expect(restored.replay.tutorial.session()).toMatchObject({ lessonId: "jump", phase: "course" });
    expect(restored.replay.stage.platforms).toEqual(createTutorialArena("vertical-gate", CONFIG.view.w, CONFIG.view.h, CONFIG.world.groundY));
    expect(restored.replay.world.lifecycle.phase).toBe("training-active");
    const ordinary = createProductionGhostReplayComposition({ seed: "ordinary-unchanged" }).create(undefined);
    const state = ordinary.semanticProjection();
    expect(state).not.toHaveProperty("tutorial");
    expect(projectCanonicalGameplayState(state.tick, state.input, ordinary.replay.world.state.run(), ordinary.replay.world.state.player() as never,
      ordinary.replay.world.state.blade() as never, [], ordinary.replay.world.context.environment.snapshot())).toEqual(state);
  });

  it("resumes an installed mid-encounter recovery window and receives real collision marks through the live tutorial owner", () => {
    const source = composition().create(undefined);
    boundary(source, { version: 1, lessonId: "field-test", reached: [...TUTORIAL_LESSON_IDS.slice(0, 13)], completed: [...TUTORIAL_LESSON_IDS.slice(0, 12)],
      counters: { evade: 1, strike: 0, punish: 0 }, chargeRecoveryWindow: 0.7, chargeCommitAwayX: -1, previousPlayerX: source.replay.world.state.player()?.x ?? null });
    source.replay.stage.platforms = createTutorialArena("field-floor", CONFIG.view.w, CONFIG.view.h, CONFIG.world.groundY);
    const enemy = source.waveReward.spawnTutorial("charger", 2);
    const player = source.replay.world.state.player(); if (player === undefined) throw new Error("fixture player missing");
    // Construct a real coach in the held blade's sweep, with retained recovery evidence.
    Object.assign(enemy, { x: player.x + 45, y: player.y - 25, hp: 1000, maxHp: 1000, contactDmg: 0, atk: "recover", stun: 10 });
    const restored = restore(source);
    const before = restored.replay.tutorial.captureSession();
    expect(before).toMatchObject({ courseSessionId: "retained-issued-course", chargeRecoveryWindow: 0.7, counters: { evade: 1, punish: 0 } });
    for (let tick = 1; tick <= 30 && (source.replay.tutorial.n.punish ?? 0) === 0; tick += 1) {
      const actions = tick === 1 ? [{ kind: "command" as const, id: 1, tick, command: { type: "aim" as const, turn: 0, magnitude: 1000 } },
        { kind: "command" as const, id: 2, tick, command: { type: "weapon" as const, intent: "primary" as const, phase: "pressed" as const } }] : [];
      expect(restored.simulation.advanceOne(actions).state).toEqual(source.simulation.advanceOne(actions).state);
    }
    expect(source.combat.outward).toContain("logWeapon:heldHit");
    expect(source.replay.world.state.enemies()[0]?.hp).toBeLessThan(1000);
    expect(restored.replay.tutorial.captureSession()).toMatchObject({ counters: { strike: 1, punish: 1 }, completionDelay: 1.1 });
    expect(restored.replay.stage.platforms).toEqual(source.replay.stage.platforms);
    const missing = structuredClone(capture(source).snapshot);
    const runtime = (missing.state["tear.world.v1"] as Record<string, unknown>).runtime as Record<string, unknown>;
    delete runtime.tutorialSession;
    expect(() => composition().create(missing)).toThrow(/requires retained tutorial behavior/);
  });

  it("finishes READY once without persistence, then awaits a supplied next episode before initializing paused normal baseline practice", () => {
    const source = composition().create(undefined);
    boundary(source, { lessonId: "ready", reached: [...TUTORIAL_LESSON_IDS], completed: [...TUTORIAL_LESSON_IDS.slice(0, -1)], endingTime: 1.59 });
    const captured = capture(source), environment = createProductionHeadlessEnvironment(); environment.reset(scenario);
    const initial = environment.captureCheckpoint();
    const value = { ...initial, snapshot: captured.snapshot, input: { ...captured.input, aimMagnitude: captured.input.aimMagnitude ?? 1000 },
      checkpoint: { ...initial.checkpoint, semanticHash: captured.semanticHash } };
    const delivery = { nextSequence: value.delivery.nextSequence, pendingEvents: value.delivery.pendingEvents };
    const checkpoint: ProductionHeadlessCheckpoint = { ...value, delivery: { ...delivery, hash: stableVerificationHash({ ...value, delivery }) } };
    environment.restoreCheckpoint(checkpoint);
    environment.step([]); const completed = environment.step([]);
    expect(completed.terminated).toBe(true); expect(completed.truncated).toBe(false);
    expect(completed.artifact).toMatchObject({ format: "tearbench-production-tutorial-handoff" });
    expect((completed.artifact as ProductionTutorialHandoffArtifact).tutorialHandoff).toEqual({ status: "awaiting-next-run", courseSessionId: "retained-issued-course" });
    expect(completed.events?.some((event) => event.type === "run.completed")).toBe(false);
    const intake = new ProductionHeadlessAcademyIntake(1);
    expect(() => intake.offer({ episodeId: "tutorial-handoff", tick: completed.observation.tick, artifact: completed.artifact })).toThrow(/invalid production terminal artifact/);
    expect(intake.snapshot().accepted).toBe(0);
    const saved = environment.captureCheckpoint();
    expect((saved.snapshot.state["tear.world.v1"] as Record<string, unknown>).runtime).toMatchObject({ lifecycle: { phase: "training-active", outcome: null },
      tutorialSession: { phase: "free-practice", active: false, completionAwarded: true, courseSessionId: "retained-issued-course" } });
    expect(() => environment.step([])).toThrow(/awaiting/);
    expect(() => environment.continueTutorialPractice({ ...scenario, seed: "future-invalid", start: { mode: "playground", difficulty: "hard", weapon: "sword" } })).toThrow(/normal/);
    expect(environment.captureCheckpoint()).toEqual(saved);
    const practiceState = environment.continueTutorialPractice({ ...scenario, id: "external-practice", seed: "fresh-host-supplied-practice", start: { mode: "playground", difficulty: "normal", weapon: "sword" } });
    expect(practiceState).not.toHaveProperty("tutorial");
    const practice = environment.captureCheckpoint();
    expect(practice.snapshot.state["tear.run.v1"]).toMatchObject({ mode: "playground", difficulty: "normal", wave: 1, mods: { owned: {}, tier: {} } });
    expect(practice.snapshot.state["tear.ui.v1"]).toMatchObject({ screen: "paused" });
    expect((practice.snapshot.state["tear.world.v1"] as Record<string, unknown>).runtime).toMatchObject({ tutorialSession: {
      courseSessionId: "retained-issued-course", phase: "free-practice", completionAwarded: true,
    } });
    expect(() => environment.step([])).toThrow(/paused/);
    expect(environment.step([{ type: "pause" }]).observation.tick).toBe(1);
    expect(environment.tutorialHandoff()).toBeNull();
    // Detached completion reaches the same source guard and exposes only nonpersistent intent.
    source.simulation.advanceOne([]); source.simulation.advanceOne([]); source.replay.tutorial.update(1);
    expect(source.replay.tutorialOutward.filter((intent) => intent === "complete-course:retained-issued-course")).toHaveLength(1);
    environment.dispose();
  });
});
