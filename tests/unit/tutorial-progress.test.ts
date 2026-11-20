import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import {
  mergeTutorialProgress,
  normalizeTutorialProgress,
  storedTutorialProgress,
  withTutorialLesson,
} from "../../src/domain/tutorial-progress";
import { TutorialController } from "../../src/gameplay/training/tutorial-controller";
import {
  COUNTED_TUTORIAL_LESSON_IDS as COUNTED,
  nextTutorialLesson,
} from "../../src/gameplay/training/tutorial-lesson-ids";
import { migrateProfileEnvelope, PROFILE_ENVELOPE_VERSION } from "../../src/persistence/profile-envelope";
import { createProfileStore } from "../../src/persistence/profile-store";

const frame = {
  dt: 0,
  skipPressed: false,
  movingLeft: false,
  movingRight: false,
  viewportWidth: 1600,
  player: { onGround: true, vy: 0, dashTimer: 0, x: 800, facing: 1 },
  bladeState: "held",
  enemies: [],
};

function memoryProfile() {
  const values = new Map<string, string>();
  const profile = createProfileStore({
    store: {
      get: (key: string) => values.get(key) ?? null,
      set: (key: string, value: string) => void values.set(key, value),
    },
    now: () => 1,
    writerId: () => "unit",
    getAchievements: () => undefined,
    getMeta: () => undefined,
  });
  profile.load();
  return { profile, values };
}

describe("tutorial progress kept between sessions", () => {
  it("reads stored progress strictly, and merges devices by union in any order", () => {
    expect(normalizeTutorialProgress(undefined)).toEqual({ lessons: [], skipped: false });
    expect(normalizeTutorialProgress({ lessons: { jump: true, move: true, dash: "yes" }, skipped: 1 })).toEqual({
      lessons: ["jump", "move"],
      skipped: false,
    });
    const left = normalizeTutorialProgress({ lessons: { move: true } }),
      right = normalizeTutorialProgress({ lessons: { jump: true }, skipped: true });
    expect(mergeTutorialProgress(left, right)).toEqual({ lessons: ["jump", "move"], skipped: true });
    expect(mergeTutorialProgress(right, left)).toEqual(mergeTutorialProgress(left, right));
    expect(mergeTutorialProgress(left, left)).toEqual(left);
    expect(normalizeTutorialProgress(storedTutorialProgress(withTutorialLesson(left, "dash")))).toEqual({
      lessons: ["dash", "move"],
      skipped: false,
    });
  });

  it("saves each finished lesson and a skip at once, and merges a remote profile's progress", () => {
    const { profile, values } = memoryProfile();
    expect(profile.tutorialProgress()).toEqual({ lessons: [], skipped: false });
    profile.recordTutorialLesson("move");
    profile.recordTutorialLesson("jump");
    profile.recordTutorialLesson("move");
    expect(profile.tutorialProgress().lessons).toEqual(["jump", "move"]);
    expect(JSON.stringify([...values.values()])).toContain("tutorialProgress");
    profile.merge({ tutorialProgress: { lessons: { dash: true } } });
    expect(profile.tutorialProgress()).toEqual({ lessons: ["dash", "jump", "move"], skipped: false });
    profile.skipTutorial();
    expect(profile.tutorialProgress().skipped).toBe(true);
  });

  it("carries the optional field through the envelope, re-validated, without a version", () => {
    const result = migrateProfileEnvelope({
      schema: "tear.profile",
      schemaVersion: PROFILE_ENVELOPE_VERSION,
      profile: { tutorialProgress: { lessons: { move: true, jump: false }, skipped: true } },
    });
    expect(result).toMatchObject({
      ok: true,
      migratedFrom: null,
      value: { profile: { tutorialProgress: { lessons: { move: true }, skipped: true } } },
    });
  });
});

describe("a course starts after the lessons the profile kept", () => {
  it("numbers where PLAY continues over the counted lessons", () => {
    expect(nextTutorialLesson([])).toEqual({ next: 1, count: 13 });
    expect(nextTutorialLesson(["move", "jump", "dash", "launch"])).toEqual({ next: 4, count: 13 });
    expect(nextTutorialLesson(COUNTED)).toEqual({ next: 14, count: 13 });
  });

  it("opens at the first unfinished lesson with the kept ones done, and reports each lesson it finishes", () => {
    const controller = new TutorialController(CONFIG);
    controller.start(1600, "course", ["move"]);
    controller.update(frame);
    const session = controller.session();
    expect(session.lessonId).toBe("jump");
    expect(session.lessons.find((lesson) => lesson.id === "move")?.completed).toBe(true);
    for (let jump = 0; jump < 3; jump += 1) controller.mark("jump");
    expect(controller.update(frame)).toContainEqual({ type: "lesson-complete", lessonId: "jump" });
  });

  it("starts at the first lesson with nothing kept, as before", () => {
    const controller = new TutorialController(CONFIG);
    controller.start(1600, "course");
    expect(controller.session().lessonId).toBe("move");
    expect(controller.session().lessons.filter((lesson) => lesson.completed)).toEqual([]);
  });

  it("finishes the course from the closing step when every lesson was kept", () => {
    const controller = new TutorialController(CONFIG);
    controller.start(1600, "course-id", COUNTED);
    controller.update(frame);
    expect(controller.session().lessonId).toBe("ready");
    expect(controller.update({ ...frame, dt: 2 })).toContainEqual({
      type: "complete-course",
      courseSessionId: "course-id",
    });
  });
});
