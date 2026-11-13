import { describe, expect, it } from "vitest";
import { promptAvailable, promptLabel, type PromptDevice } from "../../src/domain/prompt-vocabulary";
import { TutorialController } from "../../src/gameplay/training/tutorial-controller";
import {
  LESSON_TEACHING,
  WEAPON_TEACHING,
  countedLessons,
  trainingExercise,
} from "../../src/gameplay/training/training-exercises";
import { CONFIG } from "../../src/config/game-config";

const DEVICES: readonly PromptDevice[] = ["keyboard", "touch", "gamepad"];
const pad = (binding: string) => binding.toUpperCase();
const teachings = [
  ...Object.entries(LESSON_TEACHING).map(([id, teaching]) => ({ id, ...teaching })),
  ...Object.entries(WEAPON_TEACHING).map(([id, teaching]) => ({ id, goal: "", ...teaching })),
];

describe("training exercise data", () => {
  it("teaches every lesson and weapon with a short goal, a reason and controls every device can show", () => {
    for (const teaching of teachings) {
      expect(teaching.why.trim(), teaching.id).not.toBe("");
      expect(teaching.why.length, teaching.id).toBeLessThanOrEqual(80);
      expect(teaching.goal.split(/\s+/).length, teaching.id).toBeLessThanOrEqual(12);
      for (const device of DEVICES)
        for (const action of teaching.controls) {
          expect(promptAvailable(action, device), `${teaching.id} ${action} on ${device}`).toBe(true);
          expect(promptLabel(action, device, pad), `${teaching.id} ${action} on ${device}`).not.toBe("");
        }
    }
    for (const [id, teaching] of Object.entries(LESSON_TEACHING))
      if (id !== "ready") {
        expect(teaching.goal.trim(), id).not.toBe("");
        expect(teaching.controls.length, id).toBeGreaterThan(0);
      }
  });

  it("covers every lesson the course runs and counts them without the closing hand-off", () => {
    const controller = new TutorialController(CONFIG);
    controller.start(1600);
    const session = controller.session();
    expect(session.lessons.map((lesson) => lesson.id).sort()).toEqual(Object.keys(LESSON_TEACHING).sort());
    expect(countedLessons(session)).toBe(session.lessons.length - 1);
    const first = trainingExercise(session, { title: "MOVE", goal: "live text", final: false });
    expect(first).toMatchObject({
      key: "lesson:move",
      kind: "lesson",
      context: `LESSON 1 OF ${String(countedLessons(session))}`,
      goal: LESSON_TEACHING.move.goal,
    });
  });

  it("names practice drills by what they are and never offers rewards", () => {
    const base = { lessonId: "move" as const, lessons: [], practiceOnly: true };
    const live = { title: "T", goal: "live", final: false };
    expect(trainingExercise({ ...base, bossPractice: { bossId: "rootbound", phase: 2 } }, live)).toMatchObject({
      kind: "boss",
      context: "BOSS PRACTICE · NO REWARDS",
      goal: "live",
    });
    expect(trainingExercise({ ...base, enemyPractice: { id: "charger" } }, live).context).toBe(
      "ENEMY PRACTICE · NO REWARDS",
    );
    expect(trainingExercise({ ...base, annex: { id: "hammer", weaponId: "hammer", progress: 1 } }, live)).toMatchObject(
      { kind: "weapon", key: "weapon:hammer:1", why: WEAPON_TEACHING.hammer.why },
    );
  });
});
