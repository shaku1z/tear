import { beforeAll, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { createLiveTutorialRuntime, type LiveTutorialRuntime } from "../../src/gameplay/training/live-tutorial-runtime";
import { TutorialController } from "../../src/gameplay/training/tutorial-controller";
import { loadShippingTutorialGold } from "../../src/gameplay/training/tutorial-gold-shipping";
import type { PracticeEnemyEntry } from "../../src/gameplay/training/practice-enemy-catalog";

beforeAll(async () => {
  await loadShippingTutorialGold();
});

/** The previous per-tick derivation: build the whole session view and checkpoint, then read a few fields. */
function legacySelection(controller: TutorialController) {
  const session = controller.session(),
    saved = controller.captureSession();
  return {
    lessonId: session.lessonId,
    curriculumVersion: saved.version === 1 ? 1 : 2,
    phase: session.phase,
    drill: Boolean(session.annex ?? session.enemyPractice ?? session.bossPractice),
    encounter: saved.version === 1 ? "charger" : saved.fieldEncounter,
    bossPractice: session.bossPractice,
    practiceOnly: session.practiceOnly === true,
  };
}

/** The previous coach-frame gate of `liveTutorialCoachFrame`. */
function legacyFrameEncounter(runtime: LiveTutorialRuntime) {
  const session = runtime.session();
  if ((!runtime.active && !session.coach?.visible) || session.annex || session.enemyPractice || session.bossPractice)
    return undefined;
  const saved = runtime.captureSession();
  return saved && "fieldEncounter" in saved ? saved.fieldEncounter : "charger";
}

const charger: PracticeEnemyEntry = {
  id: "charger",
  title: "CHARGER",
  knowledge: "confirmed-defeated",
  canPractice: true,
};
const enemyCatalog = (): readonly PracticeEnemyEntry[] => [charger];
/** A version-1 checkpoint carries none of the curriculum-2 fields. */
function versionOne(saved: unknown): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...(saved as Record<string, unknown>), version: 1 };
  for (const key of ["curriculumVersion", "fieldEncounter", "interWaveRemaining", "skipped"])
    Reflect.deleteProperty(copy, key);
  return copy;
}

function runtimeFixture() {
  const enemies: {
    kind: string;
    dead: boolean;
    tutDummy: boolean;
    hp: number;
    maxHp: number;
    stun: number;
    x: number;
    y: number;
    hh: number;
    contactDmg: number;
  }[] = [];
  return createLiveTutorialRuntime({
    config: CONFIG,
    viewportWidth: 1600,
    groundY: () => 700,
    skipPressed: () => false,
    movingLeft: () => false,
    movingRight: () => false,
    player: () => ({ onGround: true, vy: 0, dashTimer: 0, x: 400, facing: 1 }),
    bladeState: () => "held",
    weaponId: () => "sword",
    enemies: () => enemies,
    enemyCatalog,
    playSound: vi.fn(),
    spawn: vi.fn(() => {
      const enemy = {
        kind: "charger",
        dead: false,
        tutDummy: false,
        hp: 100,
        maxHp: 100,
        stun: 0,
        x: 0,
        y: 0,
        hh: 20,
        contactDmg: 5,
      };
      enemies.push(enemy);
      return enemy;
    }),
    installArena: vi.fn(),
    resetTrainingSpace: vi.fn(),
    beginPractice: vi.fn(),
    terminateRun: vi.fn(),
    navigate: vi.fn(),
    releasePointer: vi.fn(),
    addProfileStat: vi.fn(),
    checkAchievements: vi.fn(),
    drawGhost: vi.fn(),
  });
}

/** One scripted walk through course, demonstrations, skips, practice drills, a stop and a version-1 restore. */
function walk(
  target: {
    start(): void;
    mark(kind: "moveL" | "moveR" | "jump" | "dash" | "strike"): void;
    update(seconds: number): void;
    stop(): void;
    openPractice(done: number): void;
    selectLesson(id: string): void;
    selectAnnex(id: string): void;
    selectEnemy(): void;
    advanceUnfinished(): void;
    demonstrate(): void;
    restoreVersionOne(): void;
  },
  check: (label: string) => void,
): void {
  check("idle");
  target.start();
  check("course");
  for (let index = 0; index < 60; index += 1) {
    target.mark("moveL");
    target.mark("moveR");
  }
  target.update(0);
  check("move complete");
  target.update(1.2);
  check("jump");
  target.demonstrate();
  check("demonstrating");
  for (let tick = 0; tick < 30; tick += 1) {
    target.update(1 / 120);
    check(`demo tick ${String(tick)}`);
  }
  target.advanceUnfinished();
  check("skipped");
  target.restoreVersionOne();
  check("version 1");
  target.stop();
  check("stopped");
  target.openPractice(1);
  check("practice");
  target.selectLesson("move");
  check("lesson practice");
  target.selectAnnex("hammer");
  check("annex");
  target.selectEnemy();
  check("enemy practice");
  target.selectLesson("jump");
  check("back to lesson");
  target.stop();
  check("stopped again");
}

describe("tutorial coach selection", () => {
  it("equals the values the session view and checkpoint carried, in every phase", () => {
    const controller = new TutorialController(CONFIG);
    walk(
      {
        start: () => {
          controller.start(1600, "course");
        },
        mark: (kind) => {
          controller.mark(kind);
        },
        update: (seconds) => {
          controller.update({
            dt: seconds,
            skipPressed: false,
            movingLeft: false,
            movingRight: false,
            player: { onGround: true, vy: 0, dashTimer: 0, x: 400, facing: 1 },
            bladeState: "held",
            bladeTipVY: 0,
            viewportWidth: 1600,
            enemies: [],
          });
        },
        stop: () => {
          controller.stop();
        },
        openPractice: (done) => {
          controller.openPractice(1600, done);
        },
        selectLesson: (id) => {
          controller.selectLesson(id);
        },
        selectAnnex: (id) => {
          controller.selectAnnex(id);
        },
        selectEnemy: () => {
          controller.selectEnemy(charger);
        },
        advanceUnfinished: () => {
          controller.advanceUnfinished();
        },
        demonstrate: () => {
          controller.demonstrate();
        },
        restoreVersionOne: () => {
          controller.restoreSession(versionOne(controller.captureSession()));
          expect(controller.captureSession().version).toBe(1);
        },
      },
      (label) => {
        expect(controller.coachSelection(), label).toEqual(legacySelection(controller));
      },
    );
  });

  it("gates and labels coach frames exactly as the session-built gate did", () => {
    const runtime = runtimeFixture(),
      seen = new Set<string>();
    walk(
      {
        start: () => {
          runtime.start("course");
        },
        mark: (kind) => {
          runtime.mark(kind);
        },
        update: (seconds) => {
          runtime.update(seconds);
        },
        stop: () => {
          runtime.stop();
        },
        openPractice: (done) => {
          runtime.openPractice(done);
        },
        selectLesson: (id) => {
          runtime.selectLesson(id);
        },
        selectAnnex: (id) => {
          runtime.selectAnnex(id);
        },
        selectEnemy: () => {
          runtime.selectEnemy("charger");
        },
        advanceUnfinished: () => {
          runtime.advanceUnfinished();
        },
        demonstrate: () => {
          runtime.demonstrate();
        },
        restoreVersionOne: () => {
          runtime.restoreSession(versionOne(runtime.captureSession()));
        },
      },
      (label) => {
        const current = runtime.coachFrameEncounter(),
          legacy = legacyFrameEncounter(runtime);
        expect(current, label).toBe(legacy);
        seen.add(String(current));
      },
    );
    // The walk covers both an observed and an ungated phase.
    expect(seen).toEqual(new Set(["charger", "undefined"]));
  });
});
