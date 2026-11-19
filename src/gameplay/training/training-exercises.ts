import type { PromptAction } from "../../domain/prompt-vocabulary";
import type { WeaponId } from "../weapon-selection";
import type { TutorialLessonId, TutorialSessionView } from "./tutorial-controller";
import { drillMovesLine, TUTORIAL_WEAPON_ANNEXES } from "./tutorial-weapon-annexes";

/**
 * What the Tutorial and Practice say about each exercise: a short goal, one line on
 * why it matters in a real run, and the controls it uses (semantic prompt actions,
 * worded per device by `src/domain/prompt-vocabulary.ts`). The rules that count
 * progress stay in `tutorial-controller.ts`; this module only teaches.
 *
 * Coverage is enforced by the types: a new lesson id or weapon does not compile until
 * it has its entry here, and enemies and bosses are taught from their catalog entry,
 * so new content arrives with its goal, its controls and its coach prompts.
 */
export interface ExerciseTeaching {
  /** Imperative, at most about ten words; what to do now. */
  readonly goal: string;
  /** One line: what this does for you in a real run. */
  readonly why: string;
  readonly controls: readonly PromptAction[];
  /** The lesson rewrites its instruction per beat; show the live instruction as the goal. */
  readonly stepped?: boolean;
}

export const LESSON_TEACHING: Readonly<Record<TutorialLessonId, ExerciseTeaching>> = Object.freeze({
  move: {
    goal: "Run left for a second, then right for a second.",
    why: "Moving is your first defense.",
    controls: ["move"],
  },
  jump: {
    goal: "Jump three times.",
    why: "Height opens routes and air attacks.",
    controls: ["jump"],
  },
  dash: {
    goal: "Dash three times.",
    why: "A dash carries you through danger. Steer it as you go.",
    controls: ["dash"],
  },
  cut: {
    goal: "Land six cuts on the dummy.",
    why: "Speed is damage: the faster the swing, the harder the hit.",
    controls: ["swing"],
  },
  launch: {
    goal: "Swing up fast to launch the dummy three times.",
    why: "A launched enemy cannot fight back while it is in the air.",
    controls: ["swing-up"],
  },
  juggle: {
    goal: "Launch it, then hit it three more times in the air.",
    why: "Keep an enemy airborne and it stays helpless.",
    controls: ["swing-up", "swing"],
  },
  slam: {
    goal: "Get above the dummy and swing down through it twice.",
    why: "Height becomes force: a slam hits harder than a cut.",
    controls: ["jump", "swing-down"],
  },
  "power-slam": {
    goal: "Dash down, then slam through the dummy twice.",
    why: "The faster you fall, the harder the slam.",
    controls: ["dash-down", "swing-down"],
  },
  updraft: {
    goal: "Jump, then swing up while rising, twice.",
    why: "A rising launch carries you up with the enemy.",
    controls: ["jump", "swing-up"],
  },
  throw: {
    goal: "Hit the dummy with two throws and recall the blade twice.",
    why: "Throws reach far targets; recall brings the blade back to you.",
    controls: ["throw", "recall"],
  },
  parry: {
    goal: "Swing fast through incoming shots to send two back.",
    why: "A returned shot hits the enemy that fired it.",
    controls: ["swing"],
  },
  "read-the-charge": {
    goal: "When the Charger lunges, dash clear.",
    why: "Big attacks have a tell. Dodge the commitment.",
    controls: ["dash"],
  },
  "field-test": {
    goal: "Dodge the Charger, then strike it while it recovers.",
    why: "Dodge, then punish: the rhythm of every fight.",
    controls: ["dash", "swing"],
    stepped: true,
  },
  ready: {
    goal: "Training complete.",
    why: "Speed is damage. Keep moving.",
    controls: [],
  },
});

/**
 * Weapon practice: the moves the drill trains, in order, named by the weapon's own definition, and
 * the controls the drill prompts. The step's own instruction says how to land each move.
 */
export const WEAPON_TEACHING: Readonly<Record<WeaponId, Readonly<{ why: string; controls: readonly PromptAction[] }>>> =
  Object.freeze(
    Object.fromEntries(
      TUTORIAL_WEAPON_ANNEXES.map((annex) => [
        annex.id,
        { why: drillMovesLine(annex, "sequence"), controls: annex.controls },
      ]),
    ) as Record<WeaponId, Readonly<{ why: string; controls: readonly PromptAction[] }>>,
  );

/** Opponent practice is taught from the opponent itself: survive and win with every tool. */
const OPPONENT_CONTROLS: readonly PromptAction[] = ["swing", "dash", "throw"];

export type TrainingExerciseKind = "lesson" | "weapon" | "enemy" | "boss";

export interface TrainingExercise extends ExerciseTeaching {
  /** Stable while the same exercise runs; changes when the player switches exercise. */
  readonly key: string;
  readonly kind: TrainingExerciseKind;
  readonly title: string;
  /** Short context line above the title ("LESSON 4 OF 13", "BOSS PRACTICE · NO REWARDS"). */
  readonly context: string;
  /** The course's closing hand-off: no goal, no prompts. */
  readonly final: boolean;
}

/** Lessons counted in "LESSON n OF m": the closing hand-off is not a lesson. */
export function countedLessons(session: Pick<TutorialSessionView, "lessons">): number {
  return session.lessons.filter((lesson) => lesson.id !== "ready").length;
}

/**
 * The exercise on screen, from the live session and the live step text. `liveGoal` is
 * the runtime's current instruction, used where the step itself changes mid-exercise
 * (weapon practice steps, FIELD TEST's two beats, opponent practice).
 */
export function trainingExercise(
  session: Pick<TutorialSessionView, "lessonId" | "lessons" | "practiceOnly"> &
    Readonly<{
      annex?: Readonly<{ id: string; weaponId: WeaponId; progress: number }> | undefined;
      enemyPractice?: Readonly<{ id: string }> | undefined;
      bossPractice?: Readonly<{ bossId: string; phase: number }> | undefined;
    }>,
  live: Readonly<{ title: string; goal: string; final: boolean }>,
): TrainingExercise {
  if (session.bossPractice)
    return {
      key: `boss:${session.bossPractice.bossId}:${String(session.bossPractice.phase)}`,
      kind: "boss",
      title: live.title,
      context: "BOSS PRACTICE · NO REWARDS",
      goal: live.goal,
      why: "Learn this phase's attacks before you meet it in a run.",
      controls: OPPONENT_CONTROLS,
      final: false,
    };
  if (session.enemyPractice)
    return {
      key: `enemy:${session.enemyPractice.id}`,
      kind: "enemy",
      title: live.title,
      context: "ENEMY PRACTICE · NO REWARDS",
      goal: live.goal,
      why: "Learn how it moves and when it is open.",
      controls: OPPONENT_CONTROLS,
      final: false,
    };
  if (session.annex) {
    const weapon = WEAPON_TEACHING[session.annex.weaponId];
    return {
      key: `weapon:${session.annex.id}:${String(session.annex.progress)}`,
      kind: "weapon",
      title: live.title,
      context: "WEAPON PRACTICE · NO REWARDS",
      goal: live.goal,
      why: weapon.why,
      controls: weapon.controls,
      final: false,
    };
  }
  const teaching = LESSON_TEACHING[session.lessonId];
  const index = session.lessons.findIndex((lesson) => lesson.id === session.lessonId);
  const total = countedLessons(session);
  return {
    key: `lesson:${session.lessonId}`,
    kind: "lesson",
    title: live.title,
    context: live.final
      ? "TRAINING COMPLETE"
      : session.practiceOnly === true
        ? "PRACTICE · NO REWARDS"
        : `LESSON ${String(index + 1)} OF ${String(total)}`,
    goal: teaching.stepped === true ? live.goal : teaching.goal,
    why: teaching.why,
    controls: teaching.controls,
    final: live.final,
  };
}
