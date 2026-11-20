import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";

import { BossArenaRules, SourceVoidController, createBossArena } from "../../src/gameplay/training/arena-rules";
import { PlaygroundController, trainingPlatforms } from "../../src/gameplay/training/playground-controller";
import { TUTORIAL_ARENAS } from "../../src/gameplay/training/tutorial-arenas";
import { TUTORIAL_LESSONS, TutorialController } from "../../src/gameplay/training/tutorial-controller";
import { parseTutorialSessionCheckpoint } from "../../src/gameplay/training/tutorial-session-checkpoint";

const neutralTutorialFrame = {
  dt: 0,
  skipPressed: false,
  movingLeft: false,
  movingRight: false,
  viewportWidth: 1600,
  player: { onGround: true, vy: 0, dashTimer: 0, x: 800, facing: 1 },
  bladeState: "held",
  enemies: [],
};
function startTutorial() {
  const controller = new TutorialController(CONFIG);
  controller.start(1600);
  controller.update(neutralTutorialFrame);
  return controller;
}

describe("tutorial controller", () => {
  it("keeps annex authority, ordered activation and older checkpoint meaning distinct", () => {
    const controller = startTutorial();
    expect(controller.selectAnnex("sword")).toBe(false);
    controller.openPractice(1600, 1);
    const historical = controller.captureSession();
    expect(controller.selectAnnex("sword")).toBe(true);
    controller.weaponEffect("sword", "reversal");
    controller.mark("launch");
    controller.update(neutralTutorialFrame);
    expect(controller.session().progress).toEqual([0, 2]);
    controller.weaponEffect("hammer", "reversal");
    controller.weaponEffect("sword", "launch");
    controller.update(neutralTutorialFrame);
    expect(controller.session().progress).toEqual([0, 2]);
    controller.weaponEffect("sword", "reversal");
    controller.weaponEffect("sword", "launch");
    controller.update(neutralTutorialFrame);
    expect(controller.session().progress).toEqual([1, 2]);
    controller.showHelp();
    expect(controller.demonstrate()).toBe(false);
    const saved = controller.captureSession();
    expect(() => parseTutorialSessionCheckpoint({ ...saved, phase: "free-practice", active: false })).toThrow();
    expect(() =>
      parseTutorialSessionCheckpoint({
        ...saved,
        annex: { id: "sword", weaponId: "hammer", progress: 1, pendingEvidence: false },
      }),
    ).toThrow();
    expect(() => parseTutorialSessionCheckpoint({ ...saved, practiceOrigin: undefined })).toThrow();
    controller.weaponEffect("sword", "launch");
    controller.update(neutralTutorialFrame);
    const completion = controller.update({ ...neutralTutorialFrame, dt: 1.2 });
    expect(completion).toContainEqual({ type: "begin-practice" });
    expect(completion.some((intent) => intent.type === "complete-course" || intent.type === "achievement-check")).toBe(
      false,
    );
    controller.restoreSession(historical);
    expect(controller.captureSession()).toEqual(historical);
    expect(controller.session().annex).toBeUndefined();
  });
  it("opens only explicitly eligible practice without inventing course history or completion credit", () => {
    const controller = new TutorialController(CONFIG),
      before = controller.captureSession();
    expect(controller.openPractice(1600, 0)).toBe(false);
    expect(controller.captureSession()).toEqual(before);
    expect(controller.openPractice(1600, 1)).toBe(true);
    expect(controller.captureSession()).toMatchObject({
      version: 3,
      courseSessionId: "",
      completed: [],
      completionAwarded: false,
      practiceOrigin: { kind: "durable-profile-completion", tutorialDone: 1 },
    });
    expect(controller.session().lessons.filter((lesson) => lesson.canPractice)).toHaveLength(13);
    expect(controller.selectLesson("ready")).toBe(false);
    expect(controller.selectLesson("move")).toBe(true);
    controller.update(neutralTutorialFrame);
    controller.counters = { moveL: 60, moveR: 60 };
    controller.update(neutralTutorialFrame);
    const saved = controller.captureSession(),
      restored = new TutorialController(CONFIG);
    restored.restoreSession(JSON.parse(JSON.stringify(saved)) as unknown);
    expect(restored.captureSession()).toEqual(saved);
    const completion = restored.update({ ...neutralTutorialFrame, dt: 1.2 });
    expect(completion).toContainEqual({ type: "begin-practice" });
    expect(completion.some((intent) => intent.type === "complete-course" || intent.type === "achievement-check")).toBe(
      false,
    );
    expect(restored.session()).toMatchObject({ phase: "free-practice", practiceOnly: true, courseCompleted: false });
    expect(() => {
      restored.restoreSession({ ...saved, practiceOrigin: undefined });
    }).toThrow();
    expect(() => {
      restored.restoreSession({ ...saved, version: 2 });
    }).toThrow();
  });
  it("teaches two Field Test waves with fresh transfer evidence and retains historical checkpoint rules", () => {
    const controller = startTutorial();
    controller.restoreSession({
      ...controller.captureSession(),
      lessonId: "field-test",
      reached: ["move", "field-test"],
      pendingArena: null,
    });
    controller.mark("launch");
    controller.mark("airHit");
    controller.mark("parry");
    controller.mark("evade");
    controller.mark("punish");
    controller.update(neutralTutorialFrame);
    expect(controller.session().instruction).toContain("INTER-WAVE");
    expect(controller.completionDelay).toBe(0);
    controller.mark("launch");
    controller.mark("airHit");
    controller.mark("deflect");
    expect(controller.counters.launch ?? 0).toBe(0);
    const saved = controller.captureSession(),
      restored = new TutorialController(CONFIG);
    restored.restoreSession(saved);
    expect(restored.captureSession()).toEqual(saved);
    const activate = { ...neutralTutorialFrame, dt: 1.25 };
    expect(restored.update(activate)).toEqual(controller.update(activate));
    expect(controller.step()).toMatchObject({ dummyCount: 1, ranged: true });
    for (let hit = 0; hit < 6; hit++) controller.mark("strike");
    controller.mark("airHit");
    controller.mark("deflect");
    controller.update(neutralTutorialFrame);
    expect(controller.completionDelay).toBe(0);
    expect(controller.counters.airHit ?? 0).toBe(0);
    controller.mark("updraft");
    controller.mark("airHit");
    controller.update(neutralTutorialFrame);
    expect(controller.counters.airHit ?? 0).toBe(0);
    controller.mark("airHit");
    controller.update(neutralTutorialFrame);
    expect(controller.completionDelay).toBe(1.1);

    const historical = { ...saved, version: 1 } as Record<string, unknown>;
    delete historical.curriculumVersion;
    delete historical.fieldEncounter;
    delete historical.interWaveRemaining;
    historical.counters = { evade: 1, punish: 1 };
    restored.restoreSession(historical);
    expect(restored.captureSession()).toEqual(historical);
    restored.update(neutralTutorialFrame);
    expect(restored.completionDelay).toBe(1.1);
    expect(restored.captureSession().version).toBe(1);
    expect(restored.restart()).toBe(true);
    expect(restored.captureSession().version).toBe(1);
  });
  it("restarts only reached exercises, clears delayed evidence, and restores exact continuation without reinstalling rooms", () => {
    const controller = startTutorial();
    controller.counters = { moveL: 60, moveR: 60 };
    controller.update(neutralTutorialFrame);
    expect(controller.completionDelay).toBeGreaterThan(0);
    const unchanged = controller.captureSession();
    expect(controller.selectLesson("field-test")).toBe(false);
    expect(controller.captureSession()).toEqual(unchanged);
    expect(controller.restart()).toBe(true);
    expect(controller.counters.moveL ?? 0).toBe(0);
    expect(controller.completionDelay).toBe(0);
    expect(
      controller.update({
        ...neutralTutorialFrame,
        player: { ...neutralTutorialFrame.player, dashTimer: 1 },
        bladeState: "returning",
      }),
    ).toEqual([{ type: "reset-training-space" }, { type: "install-arena", arena: "runway" }]);
    expect(controller.counters.dash ?? 0).toBe(0);
    controller.showHelp();
    controller.demonstrate();
    const saved = controller.captureSession(),
      display = controller.capturePresentation(),
      restored = new TutorialController(CONFIG);
    expect(saved.counters).toEqual(controller.counters);
    restored.restoreSession(saved);
    restored.restorePresentation(display);
    expect(restored.captureSession()).toEqual(saved);
    expect(restored.capturePresentation()).toEqual(display);
    expect(restored.update(neutralTutorialFrame)).toEqual(controller.update(neutralTutorialFrame));
    expect(restored.update(neutralTutorialFrame)).not.toContainEqual({ type: "reset-training-space" });
    expect(() => {
      restored.restoreSession({ ...saved, completionDelay: NaN });
    }).toThrow();
    controller.stop();
    expect(() => parseTutorialSessionCheckpoint(controller.captureSession())).not.toThrow();
    restored.restoreSession(undefined);
    expect(restored.session().phase).toBe("inactive");
  });

  it("retains earned technique history and completion guard while revisiting completed exercises", () => {
    const controller = startTutorial();
    while (!controller.step().final) {
      controller.counters = {
        moveL: 60,
        moveR: 60,
        jump: 3,
        dash: 3,
        strike: 6,
        launch: 3,
        airHit: 3,
        slam: 2,
        superslam: 2,
        updraft: 2,
        throwHit: 2,
        recall: 2,
        parry: 2,
        evade: 1,
        punish: 1,
      };
      controller.update(neutralTutorialFrame);
      controller.update({ ...neutralTutorialFrame, dt: 1.2 });
      controller.update(neutralTutorialFrame);
    }
    const completion = controller.update({ ...neutralTutorialFrame, dt: 2 });
    expect(completion.filter((intent) => intent.type === "complete-course")).toHaveLength(1);
    expect(controller.session().lessons.filter((lesson) => lesson.completed)).toHaveLength(14);
    expect(controller.selectLesson("ready")).toBe(false);
    expect(controller.selectLesson("move")).toBe(true);
    controller.update(neutralTutorialFrame);
    controller.counters = { moveL: 60, moveR: 60 };
    controller.update(neutralTutorialFrame);
    const saved = controller.captureSession(),
      restored = new TutorialController(CONFIG);
    restored.restoreSession(saved);
    const revisited = restored.update({ ...neutralTutorialFrame, dt: 1.2 });
    expect(revisited).toContainEqual({ type: "begin-practice" });
    expect(revisited.some((intent) => intent.type === "complete-course" || intent.type === "achievement-check")).toBe(
      false,
    );
    expect(restored.session()).toMatchObject({ phase: "free-practice", courseCompleted: true });
    expect(() => parseTutorialSessionCheckpoint(restored.captureSession())).not.toThrow();
  });

  it("credits observed movement from any authoritative input device", () => {
    const controller = startTutorial();
    const snapshot = {
      dt: 1 / 60,
      skipPressed: false,
      movingLeft: false,
      movingRight: false,
      viewportWidth: 1600,
      player: { onGround: true, vy: 0, dashTimer: 0, x: 800, facing: 1 },
      bladeState: "held",
      enemies: [],
    };
    controller.update(snapshot);
    for (let tick = 0; tick < 60; tick += 1) {
      snapshot.player.x -= 2;
      controller.update(snapshot);
    }
    for (let tick = 0; tick < 60; tick += 1) {
      snapshot.player.x += 2;
      controller.update(snapshot);
    }
    expect(controller.counters.moveL).toBeGreaterThanOrEqual(60);
    expect(controller.counters.moveR).toBeGreaterThanOrEqual(60);
    expect(controller.completionDelay).toBeGreaterThan(0);
  });

  it("preserves lesson order, thresholds, and delayed progression", () => {
    const controller = startTutorial();
    expect(TUTORIAL_LESSONS.map((lesson) => lesson.title)).toEqual([
      "MOVE",
      "JUMP",
      "DASH",
      "CUT",
      "LAUNCH",
      "JUGGLE",
      "SLAM",
      "POWER SLAM",
      "UPDRAFT",
      "THROW",
      "PARRY",
      "READ THE CHARGE",
      "FIELD TEST",
      "READY",
    ]);
    controller.counters.moveL = 60;
    controller.counters.moveR = 60;
    const snapshot = {
      dt: 0.1,
      skipPressed: false,
      movingLeft: false,
      movingRight: false,
      viewportWidth: 1600,
      player: { onGround: true, vy: 0, dashTimer: 0, x: 800, facing: 1 },
      bladeState: "held",
      enemies: [],
    };
    expect(controller.update(snapshot)).toEqual(expect.arrayContaining([{ type: "sound", cue: "rankup" }]));
    expect(controller.completionDelay).toBe(1.1);
    controller.update({ ...snapshot, dt: 1.11 });
    controller.update(neutralTutorialFrame);
    expect(controller.step().title).toBe("JUMP");
  });

  it("requires launch and power slam after their lesson actually begins", () => {
    const controller = startTutorial();
    const snapshot = {
      dt: 0.1,
      skipPressed: false,
      movingLeft: false,
      movingRight: false,
      viewportWidth: 1600,
      player: { onGround: true, vy: 0, dashTimer: 0, x: 800, facing: 1 },
      bladeState: "held",
      enemies: [],
    };

    controller.lessonIndex = 3;
    controller.counters.strike = 6;
    controller.counters.launch = 3;
    controller.update(snapshot);
    controller.update({ ...snapshot, dt: 1.11 });
    controller.update(neutralTutorialFrame);
    expect(controller.step().title).toBe("LAUNCH");
    expect(controller.counters.launch).toBe(0);
    expect(controller.completionDelay).toBeLessThanOrEqual(0);
    expect(controller.update(snapshot)).not.toContainEqual({ type: "sound", cue: "rankup" });

    controller.lessonIndex = 6;
    controller.completionDelay = 0;
    controller.counters.slam = 2;
    controller.counters.superslam = 2;
    controller.update(snapshot);
    controller.update({ ...snapshot, dt: 1.11 });
    controller.update(neutralTutorialFrame);
    expect(controller.step().title).toBe("POWER SLAM");
    expect(controller.counters.superslam).toBe(0);
    expect(controller.completionDelay).toBeLessThanOrEqual(0);
    expect(controller.update(snapshot)).not.toContainEqual({ type: "sound", cue: "rankup" });
  });

  it("clears objective evidence at the next block boundary", () => {
    const controller = startTutorial();
    const snapshot = {
      dt: 0,
      skipPressed: false,
      movingLeft: false,
      movingRight: false,
      viewportWidth: 1600,
      player: { onGround: true, vy: 0, dashTimer: 0, x: 800, facing: 1 },
      bladeState: "held",
      enemies: [],
    };
    controller.counters.moveL = 60;
    controller.counters.moveR = 60;
    controller.update(snapshot);
    controller.update({ ...snapshot, dt: 1.2 });
    controller.update(neutralTutorialFrame);
    controller.counters.jump = 3;
    controller.update(snapshot);
    controller.update({ ...snapshot, dt: 1.2 });
    controller.update(neutralTutorialFrame);
    controller.counters.dash = 3;
    controller.update(snapshot);
    controller.update({ ...snapshot, dt: 1.2 });
    controller.update(neutralTutorialFrame);
    controller.counters.strike = 6;
    controller.update(snapshot);
    controller.update({ ...snapshot, dt: 1.2 });
    controller.update(neutralTutorialFrame);
    controller.mark("launch");
    controller.mark("launch");
    controller.mark("launch");
    controller.update(snapshot);
    controller.update({ ...snapshot, dt: 1.2 });
    controller.update(neutralTutorialFrame);
    expect(controller.step().title).toBe("JUGGLE");
    expect(controller.counters.launch).toBe(0);
    expect(controller.counters.airHit).toBe(0);
    expect(controller.step().complete(controller.counters)).toBe(false);
  });

  it("produces a deterministic renderer-neutral ghost snapshot", () => {
    const left = new TutorialController(CONFIG),
      right = new TutorialController(CONFIG);
    left.start(1600);
    right.start(1600);
    left.update(neutralTutorialFrame);
    right.update(neutralTutorialFrame);
    const snapshot = {
      dt: 7,
      skipPressed: false,
      movingLeft: false,
      movingRight: false,
      viewportWidth: 1600,
      player: { onGround: true, vy: 0, dashTimer: 0, x: 800, facing: 1 },
      bladeState: "held",
      enemies: [],
    };
    left.update(snapshot);
    right.update(snapshot);
    // Current curriculum demonstrations are explicit and finite (d1077fb0):
    // idling alone never starts one, the DEMONSTRATE action does.
    expect(left.ghostSnapshot(800).visible).toBe(false);
    expect(left.demonstrate()).toBe(true);
    expect(right.demonstrate()).toBe(true);
    left.ghostTime = 1.25;
    right.ghostTime = 1.25;
    expect(left.ghostSnapshot(800)).toEqual(right.ghostSnapshot(800));
    expect(left.ghostSnapshot(800)).toMatchObject({
      visible: true,
      demonstrating: true,
      lesson: "MOVE",
      actor: { y: 775 },
    });
  });

  it("only auto-demonstrates historical v1 courses after the player has had room to attempt the current block", () => {
    const snapshot = {
      dt: 1,
      skipPressed: false,
      movingLeft: false,
      movingRight: false,
      viewportWidth: 1600,
      player: { onGround: true, vy: 0, dashTimer: 0, x: 800, facing: 1 },
      bladeState: "held",
      enemies: [],
    };
    // The current curriculum replaced the idle auto-demonstration with
    // explicit, finite gold demonstrations (d1077fb0, bb323a50).
    const current = startTutorial();
    for (let tick = 0; tick < 12; tick += 1) current.update(snapshot);
    expect(current.ghostSnapshot(800)).toMatchObject({ visible: false, demonstrating: false });
    expect(current.demonstrate()).toBe(true);
    expect(current.ghostSnapshot(800)).toMatchObject({ visible: true, demonstrating: true });

    // A restored v1 course keeps its historical seven-second idle threshold.
    const historical = { ...startTutorial().captureSession(), version: 1 } as Record<string, unknown>;
    delete historical.curriculumVersion;
    delete historical.fieldEncounter;
    delete historical.interWaveRemaining;
    const controller = new TutorialController(CONFIG);
    controller.restoreSession(historical);
    expect(controller.captureSession().version).toBe(1);
    for (let tick = 0; tick < 6; tick += 1) controller.update(snapshot);
    expect(controller.ghostSnapshot(800).visible).toBe(false);
    controller.update(snapshot);
    expect(controller.ghostSnapshot(800)).toMatchObject({ visible: true, demonstrating: true });
  });

  it("credits an updraft only when a fresh production launch occurs while rising", () => {
    const controller = startTutorial();
    controller.lessonIndex = 8;
    const snapshot = {
      dt: 0,
      skipPressed: false,
      movingLeft: false,
      movingRight: false,
      viewportWidth: 1600,
      player: { onGround: false, vy: -400, dashTimer: 0, x: 800, facing: 1 },
      bladeState: "held",
      bladeTipVY: -500,
      enemies: [],
    };
    controller.mark("launch");
    controller.update(snapshot);
    expect(controller.counters.updraft).toBe(1);
    controller.update({ ...snapshot, player: { ...snapshot.player, vy: 0 } });
    expect(controller.counters.updraft).toBe(1);
  });

  it("credits an evade and punish only inside a live charger's readable windows", () => {
    const controller = startTutorial();
    controller.lessonIndex = 12;
    const snapshot = {
      dt: 0.1,
      skipPressed: false,
      movingLeft: false,
      movingRight: false,
      viewportWidth: 1600,
      player: { onGround: true, vy: 0, dashTimer: 0.12, dashX: -1, x: 800, facing: 1 },
      bladeState: "held",
      enemies: [
        {
          id: "coach",
          kind: "charger",
          dead: false,
          tutorialDummy: false,
          hp: 100,
          maxHp: 100,
          x: 1040,
          y: 760,
          attack: "commit",
        },
      ],
    };
    controller.update(snapshot);
    expect(controller.counters.evade).toBe(1);
    controller.mark("strike");
    const coach = snapshot.enemies[0];
    if (coach === undefined) throw new Error("tutorial coach fixture missing");
    controller.update({
      ...snapshot,
      player: { ...snapshot.player, dashTimer: 0 },
      enemies: [{ ...coach, attack: "recover" }],
    });
    expect(controller.captureSession()).toMatchObject({ fieldEncounter: "breath", counters: {} });
  });

  it("does not turn an ordinary dash or cut into enemy-language credit", () => {
    const controller = startTutorial();
    controller.lessonIndex = 12;
    const snapshot = {
      dt: 0.1,
      skipPressed: false,
      movingLeft: false,
      movingRight: false,
      viewportWidth: 1600,
      player: { onGround: true, vy: 0, dashTimer: 0.12, x: 800, facing: 1 },
      bladeState: "held",
      enemies: [],
    };
    controller.update(snapshot);
    controller.mark("strike");
    controller.update({ ...snapshot, player: { ...snapshot.player, dashTimer: 0 } });
    expect(controller.counters.evade ?? 0).toBe(0);
    expect(controller.counters.punish ?? 0).toBe(0);
  });

  it("teaches Field Test as a readable evade, then punish route", () => {
    const controller = startTutorial();
    controller.lessonIndex = 12;
    const committed = {
      dt: 0.1,
      skipPressed: false,
      movingLeft: false,
      movingRight: false,
      viewportWidth: 1600,
      player: { onGround: true, vy: 0, dashTimer: 0.12, dashX: -1, x: 800, facing: 1 },
      bladeState: "held",
      enemies: [
        {
          id: "coach",
          kind: "charger",
          dead: false,
          tutorialDummy: false,
          hp: 100,
          maxHp: 100,
          x: 1040,
          y: 760,
          attack: "commit",
        },
      ],
    };
    controller.update(committed);
    expect(controller.step().instruction?.(controller.counters)).toContain("STEP 2");
    controller.mark("strike");
    const coach = committed.enemies[0];
    if (coach === undefined) throw new Error("field-test coach fixture missing");
    controller.update({
      ...committed,
      player: { ...committed.player, dashTimer: 0 },
      enemies: [{ ...coach, attack: "recover" }],
    });

    expect(controller.session().instruction).toContain("INTER-WAVE");
    expect(controller.session().progress).toEqual([2, 5]);
    expect(controller.completionDelay).toBe(0);
    expect(controller.step().progress(controller.counters)).toEqual([2, 5]);
  });

  it("recovers an unreachable thrown blade without granting throw credit", () => {
    const controller = startTutorial();
    controller.lessonIndex = 9;
    const snapshot = {
      dt: 1.21,
      skipPressed: false,
      movingLeft: false,
      movingRight: false,
      viewportWidth: 1600,
      player: { onGround: true, vy: 0, dashTimer: 0, x: 800, facing: 1 },
      bladeState: "embedded",
      enemies: [],
    };
    expect(controller.update(snapshot)).toContainEqual({ type: "recover-blade" });
    expect(controller.counters.throwHit ?? 0).toBe(0);
  });

  it("recovers a tutorial dummy that has drifted out of the playable lesson", () => {
    const controller = startTutorial();
    controller.lessonIndex = 3;
    const intents = controller.update({
      dt: 1 / 60,
      skipPressed: false,
      movingLeft: false,
      movingRight: false,
      viewportWidth: 1600,
      player: { onGround: true, vy: 0, dashTimer: 0, x: 400, facing: 1 },
      bladeState: "held",
      enemies: [
        { id: "dummy", kind: "charger", dead: false, tutorialDummy: true, hp: 80, maxHp: 100, x: 1200, y: 750 },
      ],
    });
    expect(intents).toContainEqual({ type: "reset-dummy", enemyId: "dummy", x: 580 });
  });

  it("awards tutorial completion exactly once before entering the practice arena", () => {
    const controller = startTutorial();
    controller.lessonIndex = TUTORIAL_LESSONS.length - 1;
    const snapshot = {
      dt: 5.1,
      skipPressed: false,
      movingLeft: false,
      movingRight: false,
      viewportWidth: 1600,
      player: { onGround: true, vy: 0, dashTimer: 0, x: 800, facing: 1 },
      bladeState: "held",
      enemies: [],
    };
    const completion = controller.update(snapshot);
    expect(completion.filter((intent) => intent.type === "complete-course")).toEqual([
      { type: "complete-course", courseSessionId: "tutorial" },
    ]);
    expect(completion).toContainEqual({ type: "begin-practice" });
    expect(completion).not.toContainEqual({ type: "navigate", screen: "menu" });
    expect(controller.update(snapshot)).toEqual([]);
  });
});

describe("playground controller", () => {
  it("cycles training and five campaign arenas exactly", () => {
    const controller = new PlaygroundController();
    expect(controller.nextArena(5)).toEqual([{ type: "wipe" }, { type: "select-arena", arena: 0 }]);
    for (let index = 0; index < 4; index++) controller.nextArena(5);
    expect(controller.nextArena(5)).toEqual([{ type: "wipe" }, { type: "select-arena", arena: -1 }]);
    expect(trainingPlatforms(1600, 900, 800)).toHaveLength(3);
  });

  it("emits hotkey spawn intents in the legacy order", () => {
    const controller = new PlaygroundController({ hpMultiplier: 3, count: 5 });
    const intents = controller.update(
      {
        pressed: new Set(["Digit1", "KeyH"]),
        viewportWidth: 1600,
        player: { x: 800, y: 700, facing: 1, hp: 5, maxHp: 100, oneHit: false },
        run: { difficulty: "normal", difficultyDamage: 1, bossIndex: 0, bossOrder: ["warden"] },
        enemies: [],
      },
      { charger: "red", perfect: "cyan" },
    );
    expect(intents[0]).toEqual({ type: "spawn", kind: "charger", count: 5, hpScale: 3 });
    expect(intents).toContainEqual({ type: "heal-player" });
    expect(controller.labAction({ id: "dash", owned: 1, tier: 1, tierCount: 2 })).toEqual({
      type: "tier-up",
      upgradeId: "dash",
    });
    expect(controller.labAction({ id: "unique", owned: 1, tier: 0, unique: true })).toBeNull();
  });
});

describe("arena rules", () => {
  it("preserves authored boss layouts and the minimum-route invariant", () => {
    const platforms = [...(createBossArena("warden", 1600, 900, 800, 0.4) ?? [])];
    expect(platforms.map((platform) => [platform.x, platform.y, platform.w])).toEqual([
      [0, 800, 1600],
      [150, 430, 240],
      [1210, 430, 240],
      [680, 555, 240],
    ]);
    const elevated = platforms[1];
    if (!elevated) throw new Error("Missing Warden platform");
    elevated.arenaFractureRequest = { reason: "impact", color: "red" };
    const state = { platforms, broken: [] };
    const rules = new BossArenaRules(
      {
        reformWarn: 0.4,
        reformClearMargin: 20,
        minElevatedActive: 1,
        crackWarn: 0.2,
        standBeforeWarn: 1,
        stressDrainDelay: 0.3,
        stressDrainRate: 1,
        brokenDuration: 1,
      },
      { boss: "black", armoredShield: "blue" },
    );
    rules.update(state, 0.01, null, [], false);
    expect(elevated.arenaState).toBe("warning");
    rules.update(state, 0.21, null, [], false);
    expect(elevated.arenaState).toBe("broken");
    expect(state.platforms.filter((platform) => platform.oneway)).toHaveLength(2);
  });

  it("creates identical Source streams for the same seed", () => {
    const config = {
      voidSpawnBehind: 200,
      voidSpawnAhead: 400,
      voidChunkWidthMin: 500,
      voidChunkWidthMax: 620,
      voidPlatformWidthMin: 170,
      voidPlatformWidthMax: 260,
      voidLowerMin: 560,
      voidLowerMax: 680,
      voidUpperMin: 300,
      voidUpperMax: 450,
      voidLaneClearance: 90,
      voidTransferMin: 120,
      voidTransferMax: 260,
      scrollSpeed: 120,
      scrollSpeedMax: 260,
      thawSpeedMult: 1.35,
      voidFirePeriod: 3,
      voidFireArm: 0.8,
      voidFireHot: 1,
      voidCageH: 120,
      voidCageHalfW: 55,
      descentArrival: 0.8,
      descentIngressBelow: 180,
      voidTransferGrace: 0.4,
      voidCamZoom: 0.82,
      voidRecycleMargin: 120,
      scrollRamp: 4,
      voidWispCooldown: 4,
      arrivalFxStep: 0.07,
      crackWarn: 0.6,
      descentDissolve: 1,
      descentLift: 1,
      descentReveal: 1,
      voidCrumbleStand: 0.5,
      voidFallDamage: 20,
      voidSlowDuration: 1,
    };
    const controller = new SourceVoidController(
      config,
      { width: 1600, height: 900, groundY: 800 },
      { jumpSpeed: 900, gravity: 2400, moveSpeed: 500, dashSpeed: 1100, dashDuration: 0.18 },
      { dialogueDuck: 0.4, unmakeMix: 0.3, releaseMix: 0.5, revealMix: 0.8 },
    );
    const player = () => ({
      x: 800,
      y: 300,
      vx: 0,
      vy: 0,
      hw: 20,
      hh: 30,
      onGround: true,
      iframe: 0,
      voidSlowT: 0,
      voidTransferT: 0,
      voidLane: null,
      supportPlatform: null,
      voidMajorWindow: false,
    });
    const first = controller.start(
      { id: "source", x: 900, y: 300, color: "purple" },
      "fixed-seed",
      player(),
      true,
    ).state;
    const second = controller.start(
      { id: "source", x: 900, y: 300, color: "purple" },
      "fixed-seed",
      player(),
      true,
    ).state;
    expect(first.chunks.map((chunk) => [chunk.id, chunk.motif, chunk.platforms.map((platform) => platform.y)])).toEqual(
      second.chunks.map((chunk) => [chunk.id, chunk.motif, chunk.platforms.map((platform) => platform.y)]),
    );

    const hazardPlayer = { ...player(), hazardT: 0, hazardDmgMult: 1 };
    const collapsing = first.platforms[0];
    if (!collapsing) throw new Error("Missing void platform");
    collapsing.voidType = "crumble";
    collapsing.touchT = 0.01;
    hazardPlayer.x = collapsing.x + collapsing.w / 2;
    hazardPlayer.y = collapsing.y - hazardPlayer.hh;
    const collapseIntents = controller.updateHazards(first, 0.02, hazardPlayer, 0);
    expect(collapseIntents).toContainEqual({ type: "remove-surface-projectiles", platformId: collapsing.platformId });
    expect(first.platforms).not.toContain(collapsing);

    hazardPlayer.y = 1000;
    first.rescueCooldown = 0;
    const rescueIntents = controller.updateHazards(first, 0, hazardPlayer, 0);
    expect(rescueIntents.some((intent) => intent.type === "rescue-player" && intent.damage === 20)).toBe(true);
    expect(first.rescueCooldown).toBe(0.8);
  });

  it("accepts a pending arena exactly when a lesson uses it: the checkpoint reader checks the arena table, not the lessons", () => {
    const lessonArenas = new Set(TUTORIAL_LESSONS.map((lesson) => lesson.arena));
    expect(lessonArenas).toEqual(new Set(TUTORIAL_ARENAS.map((arena) => arena.id)));
  });
});
