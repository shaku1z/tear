import { beforeAll, describe, expect, it, vi } from "vitest";
import { applyWeapon } from "../../src/gameplay/weapons";
import { CONFIG } from "../../src/config/game-config";
import { createLiveTutorialRuntime } from "../../src/gameplay/training/live-tutorial-runtime";
import { createLiveTrainingHandoff } from "../../src/app/live-training-handoff";
import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";
import { createProductionCombatSimulation } from "../../src/tearbench/production-combat-simulation";
import { createProductionWaveRewardRuntime } from "../../src/tearbench/production-wave-reward-runtime";
import { projectProductionReplayCanonicalState } from "../../src/tearbench/production-replay-composition";
import { createLiveTutorialSessionActions } from "../../src/app/live-tutorial-session-actions";
import { loadShippingTutorialGold } from "../../src/gameplay/training/tutorial-gold-shipping";

// The shipped corpus is an on-demand asset; training preflight loads it before any lesson.
beforeAll(async () => { await loadShippingTutorialGold(); });

describe("live tutorial runtime", () => {
  it("keeps the real Lab completion receipt before the deferred next-run reset and resumes canonical ticks", () => {
    const exercise = (deferred: boolean) => {
      const tasks: (() => void)[] = [];
      let request: () => void = () => { throw new Error("handoff not installed"); };
      const replay = createProductionReplayWorld({ seed: "lab-handoff", mode: "tutorial", weaponId: "sword", difficulty: "normal", tutorialHandoff: () => { request(); } });
      const core = createProductionCombatSimulation(replay, { snapshot: (tick, input) => projectProductionReplayCanonicalState(replay, tick, input) });
      const content = createProductionWaveRewardRuntime(replay);
      replay.bindTutorialSpawn(content.spawnTutorial); content.startNaturalOpening();
      replay.tutorial.openPractice(1); expect(replay.tutorial.selectLesson("move")).toBe(true);
      const sourceRun = replay.world.state.run(); if (sourceRun === null) throw new Error("Source run missing");
      let currentRun: { readonly mode: string } = sourceRun;
      let paused = false;
      const reset = vi.fn(() => { core.simulationRuntime.reset(); currentRun = { mode: "playground" }; });
      const handoff = createLiveTrainingHandoff({ run: () => currentRun, phase: () => replay.tutorial.session().phase,
        pause: () => { paused = true; }, releasePointer: vi.fn(), defer: (commit) => { tasks.push(commit); }, startPractice: reset });
      request = deferred ? () => { handoff.request("completion"); } : () => { paused = true; reset(); };
      for (let tick = 1; tick <= 1000 && replay.tutorial.active; tick++) {
        core.simulationRuntime.advanceOne([{ kind: "command", id: tick, tick,
          command: { type: "move", x: tick <= 160 ? -1000 : tick <= 320 ? 1000 : 0, y: 0 } }]);
      }
      expect(replay.tutorial.session().phase).toBe("free-practice");
      expect(paused).toBe(true);
      expect(replay.tutorial.n.moveL).toBeGreaterThanOrEqual(60);
      expect(replay.tutorial.n.moveR).toBeGreaterThanOrEqual(60);
      expect(replay.tutorialOutward.some((event) => event.startsWith("complete-course:"))).toBe(false);
      return { core, tasks, reset, handoff };
    };
    // The former synchronous constructor resets the same canonical controller inside execute.
    const old = exercise(false);
    expect(old.core.simulationRuntime.scheduler.tick).toBe(0);
    expect(old.core.simulationRuntime.lastResult?.tick).toBeGreaterThan(320);
    expect(() => old.core.simulationRuntime.advanceOne([])).toThrow(/ticks must increase/);
    const fixed = exercise(true);
    const receipt = fixed.core.simulationRuntime.lastResult;
    if (receipt === null) throw new Error("Terminal tutorial receipt missing");
    expect(receipt.tick).toBe(fixed.core.simulationRuntime.scheduler.tick);
    expect(receipt.stateHash).not.toBe("");
    expect(fixed.reset).not.toHaveBeenCalled();
    fixed.handoff.request("completion"); expect(fixed.tasks).toHaveLength(1);
    const commit = fixed.tasks[0]; if (commit === undefined) throw new Error("Deferred handoff missing");
    commit(); expect(fixed.reset).toHaveBeenCalledOnce();
    expect(fixed.core.simulationRuntime.lastResult).toBeNull();
    expect(fixed.core.simulationRuntime.scheduler.tick).toBe(0);
    for (let tick = 1; tick <= 20; tick++) expect(fixed.core.simulationRuntime.advanceOne([]).tick).toBe(tick);
    commit(); expect(fixed.reset).toHaveBeenCalledOnce();
    // Normal menu entry constructs its baseline synchronously, before openPractice establishes a phase.
    fixed.handoff.request(); expect(fixed.reset).toHaveBeenCalledTimes(2);
    expect(fixed.tasks).toHaveLength(1);
  });
  it("selects a durable-unlocked lesson after the real new-run reset without issuing completion or profile effects", () => {
    let selectedWeapon = "sword", selectedMode = "playground";
    const completeCourse = vi.fn(), addProfileStat = vi.fn(), checkAchievements = vi.fn(), installArena = vi.fn(), beginPractice = vi.fn();
    const runtime = createLiveTutorialRuntime({ config: CONFIG, viewportWidth: 1600, groundY: () => 800,
      skipPressed: () => false, movingLeft: () => false, movingRight: () => false,
      player: () => ({ onGround: true, vy: 0, dashTimer: 0, x: 320, facing: 1 }), bladeState: () => "held", weaponId: () => selectedWeapon, enemies: () => [],
      enemyCatalog: () => [{ id: "charger", title: "CHARGER", knowledge: "confirmed-defeated", canPractice: true }, { id: "ranged", title: "RANGED", knowledge: "unknown", canPractice: false }],
      spawn: () => { throw new Error("unexpected fixture spawn"); }, playSound: vi.fn(), installArena, resetTrainingSpace: vi.fn(),
      beginPractice, completeCourse, addProfileStat, checkAchievements, terminateRun: vi.fn(), navigate: vi.fn(), releasePointer: vi.fn(), drawGhost: vi.fn() });
    runtime.openPractice(1);
    const startLessonRun = vi.fn(() => { selectedMode = "tutorial"; runtime.start("unissued"); }), selectPracticeWeapon = vi.fn((id: string) => { selectedWeapon = id; });
    const actions = createLiveTutorialSessionActions({ tutorial: runtime, training: { ensureLoaded: () => Promise.resolve(), openPractice: () => false },
      screen: () => "paused", mode: () => selectedMode, startLessonRun, selectPracticeWeapon, resetFocus: vi.fn(), resume: vi.fn() });
    actions.dispatch("select", "missing"); expect(startLessonRun).not.toHaveBeenCalled();
    actions.dispatch("select", "launch");
    expect(selectPracticeWeapon).toHaveBeenCalledWith("sword"); expect(startLessonRun).toHaveBeenCalledOnce();
    expect(installArena).toHaveBeenLastCalledWith("launch-bay");
    expect(runtime.captureSession()).toMatchObject({ version: 3, phase: "lesson-practice", courseSessionId: "", completionAwarded: false,
      practiceOrigin: { kind: "durable-profile-completion", tutorialDone: 1 } });
    // Avoid unrelated dummy creation: the controller's entry is already real;
    // MOVE supplies a short complete practice branch with no combat fixture.
    runtime.selectLesson("move"); for (let tick = 0; tick < 60; tick++) { runtime.mark("moveL"); runtime.mark("moveR"); }
    runtime.update(0); runtime.update(1.2);
    expect(beginPractice).toHaveBeenCalledOnce(); expect(completeCourse).not.toHaveBeenCalled();
    expect(addProfileStat).not.toHaveBeenCalled(); expect(checkAchievements).not.toHaveBeenCalled();
    actions.dispatch("select-annex", "sword");
    runtime.weaponEffect("sword", "reversal");
    const retained = runtime.captureSession();
    expect(retained).toMatchObject({ version: 4, annex: { id: "sword", pendingEvidence: true } });
    expect(() => { runtime.validateSession(retained, "hammer"); }).toThrow(/annex weapon/);
    expect(runtime.captureSession()).toEqual(retained);
    actions.dispatch("select-annex", "missing"); expect(runtime.captureSession()).toEqual(retained);
    actions.dispatch("select-annex", "hammer"); expect(selectedWeapon).toBe("hammer");
    expect(runtime.captureSession()).toMatchObject({ version: 4, annex: { id: "hammer", progress: 0, pendingEvidence: false } });
    actions.dispatch("restart"); expect(runtime.session().progress).toEqual([0, 2]);
    actions.dispatch("select", "launch"); expect(selectedWeapon).toBe("sword");
    expect(runtime.captureSession()).toMatchObject({ version: 3, lessonId: "launch", completionAwarded: false });
    const baseline = runtime.captureSession();
    actions.dispatch("select-enemy", "ranged"); expect(runtime.captureSession()).toEqual(baseline);
    actions.dispatch("select-enemy", "charger");
    const attempt = runtime.captureSession();
    expect(attempt).toMatchObject({ version: 5, courseSessionId: "", completionAwarded: false, enemyPractice: { id: "charger", spawned: false, defeated: false } });
    expect(() => { runtime.validateSession(attempt, "hammer", []); }).toThrow(/baseline Sword/);
    expect(() => { runtime.validateSession(attempt, "sword", [{ kind: "ranged", hp: 1, maxHp: 1, stun: 0, x: 0, y: 0, hh: 20, contactDmg: 1 }]); }).toThrow(/actors/);
    expect(runtime.captureSession()).toEqual(attempt);
    actions.dispatch("restart"); expect(runtime.captureSession()).toEqual(attempt);
    expect(runtime.demonstrate()).toBe(false);
    expect(completeCourse).not.toHaveBeenCalled(); expect(addProfileStat).not.toHaveBeenCalled();
  });
  it("owns tutorial state, spawning, stabilization and ghost presentation", () => {
    const config = structuredClone(CONFIG); applyWeapon(config, "sword");
    const enemies = [{ kind: "charger", dead: false, tutDummy: true, hp: 10, maxHp: 100,
      stun: 0, x: 0, y: 0, hh: 20, contactDmg: 5 }];
    const tutorialEnemy = enemies[0];
    if (tutorialEnemy === undefined) throw new Error("tutorial fixture missing enemy");
    const drawGhost = vi.fn();
    const runtime = createLiveTutorialRuntime({
      config, viewportWidth: 1600, groundY: () => 700, skipPressed: () => false,
      movingLeft: () => false, movingRight: () => false,
      player: () => ({ onGround: true, vy: 0, dashTimer: 0, x: 400, facing: 1 }),
      bladeState: () => "held", enemies: () => enemies, playSound: vi.fn(),
      spawn: vi.fn(() => tutorialEnemy), installArena: vi.fn(), resetTrainingSpace: vi.fn(),
      beginPractice: vi.fn(),
      terminateRun: vi.fn(), navigate: vi.fn(), releasePointer: vi.fn(),
      addProfileStat: vi.fn(), checkAchievements: vi.fn(), drawGhost,
    });
    runtime.start();
    runtime.mark("moveL");
    runtime.update(1 / 60);
    expect(runtime.demonstrate()).toBe(true); // Explicit requests, never idle-loop scenery.
    runtime.drawGhost();

    expect(runtime.active).toBe(true);
    expect(runtime.idx).toBe(0);
    expect(runtime.n.moveL).toBe(1);
    expect(enemies[0]).toMatchObject({ stun: 1, hp: 100 });
    expect(drawGhost).toHaveBeenCalledOnce();
    expect(runtime.step().t).toBe("MOVE");
    expect(typeof runtime.step().d).toBe("string");
    runtime.stop();
    expect(runtime.captureSession()).toBeUndefined();
    expect(runtime.capturePresentation().goldCoach).toBeUndefined();
    runtime.restoreSession(undefined); runtime.restorePresentation(undefined);
    expect(runtime.session()).toMatchObject({ phase: "inactive", helpVisible: false });
    expect(runtime.capturePresentation()).toMatchObject({ ghostTime: 0, coachDemoTime: 0, anchorX: 0 });
  });

  it("spawns and configures a missing tutorial dummy", () => {
    const enemies: { kind: string; dead: boolean; tutDummy: boolean; hp: number; maxHp: number;
      stun: number; x: number; y: number; hh: number; affixCount?: number; contactDmg: number }[] = [];
    const spawned = { kind: "charger", dead: false, tutDummy: false, hp: 100, maxHp: 100,
      stun: 0, x: 0, y: 0, hh: 20, contactDmg: 5 };
    const spawn = vi.fn(() => { enemies.push(spawned); return spawned; });
    const runtime = createLiveTutorialRuntime({
      config: CONFIG, viewportWidth: 1600, groundY: () => 700, skipPressed: () => false,
      movingLeft: () => false, movingRight: () => false,
      player: () => ({ onGround: true, vy: 0, dashTimer: 0, x: 400, facing: 1 }),
      bladeState: () => "held", enemies: () => enemies, playSound: vi.fn(), spawn,
      installArena: vi.fn(), resetTrainingSpace: vi.fn(), beginPractice: vi.fn(), terminateRun: vi.fn(), navigate: vi.fn(), releasePointer: vi.fn(), addProfileStat: vi.fn(),
      checkAchievements: vi.fn(), drawGhost: vi.fn(),
    });
    runtime.start();
    for (let index = 0; index < 60; index++) { runtime.mark("moveL"); runtime.mark("moveR"); }
    runtime.update(0); runtime.update(1.2);
    runtime.mark("jump"); runtime.mark("jump"); runtime.mark("jump"); runtime.update(0); runtime.update(1.2);
    runtime.mark("dash"); runtime.mark("dash"); runtime.mark("dash"); runtime.update(0); runtime.update(1.2);
    runtime.update(0);
    expect(runtime.step().t).toBe("CUT");
    expect(spawn).toHaveBeenCalledWith("charger", 8);
    expect(spawned).toMatchObject({ tutDummy: true, affixCount: 0, contactDmg: 0, y: 680 });
  });

  it("grounds and recenters a carried dummy at combat lesson boundaries", () => {
    const enemy = { kind: "charger", dead: false, tutDummy: true, hp: 20, maxHp: 100,
      stun: 0, x: 900, y: 300, vx: 80, vy: -600, onGround: false, hitCd: 1, hh: 20,
      affixCount: 0, contactDmg: 0 };
    const runtime = createLiveTutorialRuntime({
      config: CONFIG, viewportWidth: 1600, groundY: () => 700, skipPressed: () => false,
      movingLeft: () => false, movingRight: () => false,
      player: () => ({ onGround: true, vy: 0, dashTimer: 0, x: 400, facing: 1 }),
      bladeState: () => "held", enemies: () => [enemy], playSound: vi.fn(),
      spawn: vi.fn(() => enemy), installArena: vi.fn(), resetTrainingSpace: vi.fn(), beginPractice: vi.fn(), terminateRun: vi.fn(), navigate: vi.fn(), releasePointer: vi.fn(),
      addProfileStat: vi.fn(), checkAchievements: vi.fn(), drawGhost: vi.fn(),
    });
    const advance = () => { runtime.update(0); runtime.update(1.2); };
    runtime.start();
    for (let index = 0; index < 60; index += 1) { runtime.mark("moveL"); runtime.mark("moveR"); }
    advance();
    runtime.mark("jump"); runtime.mark("jump"); runtime.mark("jump"); advance();
    runtime.mark("dash"); runtime.mark("dash"); runtime.mark("dash"); advance();
    Object.assign(enemy, { x: 900, y: 300, vx: 80, vy: -600, onGround: false, hitCd: 1, hp: 20 });
    for (let index = 0; index < 6; index += 1) runtime.mark("strike"); advance();

    expect(runtime.step().t).toBe("LAUNCH");
    expect(enemy).toMatchObject({ x: 580, y: 680, vx: 0, vy: 0, onGround: true, hitCd: 0, hp: 100 });
  });
});
