import { describe, expect, it, vi } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { createLiveTutorialRuntime } from "../../src/gameplay/training/live-tutorial-runtime";
import { createLiveTutorialSessionActions } from "../../src/app/live-tutorial-session-actions";

describe("live tutorial runtime", () => {
  it("selects a durable-unlocked lesson after the real new-run reset without issuing completion or profile effects", () => {
    let selectedWeapon = "sword", selectedMode = "playground";
    const completeCourse = vi.fn(), addProfileStat = vi.fn(), checkAchievements = vi.fn(), installArena = vi.fn(), beginPractice = vi.fn();
    const runtime = createLiveTutorialRuntime({ config: CONFIG, viewportWidth: 1600, groundY: () => 800,
      skipPressed: () => false, movingLeft: () => false, movingRight: () => false,
      player: () => ({ onGround: true, vy: 0, dashTimer: 0, x: 320, facing: 1 }), bladeState: () => "held", weaponId: () => selectedWeapon, enemies: () => [],
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
    expect(completeCourse).not.toHaveBeenCalled(); expect(addProfileStat).not.toHaveBeenCalled();
  });
  it("owns tutorial state, spawning, stabilization and ghost presentation", () => {
    const enemies = [{ kind: "charger", dead: false, tutDummy: true, hp: 10, maxHp: 100,
      stun: 0, x: 0, y: 0, hh: 20, contactDmg: 5 }];
    const tutorialEnemy = enemies[0];
    if (tutorialEnemy === undefined) throw new Error("tutorial fixture missing enemy");
    const drawGhost = vi.fn();
    const runtime = createLiveTutorialRuntime({
      config: CONFIG, viewportWidth: 1600, groundY: () => 700, skipPressed: () => false,
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
