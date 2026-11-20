import { isRecord, requireRecord } from "../../domain/records";
import { validatePracticeBoss } from "./practice-boss-catalog";
import { validatePracticeEnemy } from "./practice-enemy-catalog";
import { TUTORIAL_ARENAS } from "./tutorial-arenas";
import type { TutorialController } from "./tutorial-controller";
import { TUTORIAL_LESSON_IDS, type TutorialLessonId } from "./tutorial-lesson-ids";
import { validateWeaponAnnex, weaponAnnexLesson } from "./tutorial-weapon-annexes";

/**
 * The checkpoint of a tutorial session and the one reader that accepts it. The reader is here, and not beside
 * the controller, so state restore can read a checkpoint without loading the whole tutorial.
 */

/** Seconds of breathing room between the waves of the field test. */
export const FIELD_BREATH_SECONDS = 1.25;

export type TutorialSessionCheckpoint = ReturnType<TutorialController["captureSession"]>;
export function parseTutorialSessionCheckpoint(value: unknown): TutorialSessionCheckpoint | undefined {
  if (value === undefined) return undefined;
  const data = requireRecord(value, "Invalid tutorial session");
  const ids = (entry: unknown): entry is TutorialLessonId[] =>
    Array.isArray(entry) &&
    new Set(entry as unknown[]).size === entry.length &&
    (entry as unknown[]).every((id) => TUTORIAL_LESSON_IDS.some((valid) => valid === id));
  if (
    (data.version !== 1 &&
      data.version !== 2 &&
      data.version !== 3 &&
      data.version !== 4 &&
      data.version !== 5 &&
      data.version !== 6 &&
      data.version !== 7) ||
    typeof data.courseSessionId !== "string" ||
    !["inactive", "course", "lesson-practice", "free-practice"].includes(String(data.phase)) ||
    typeof data.phase !== "string" ||
    !TUTORIAL_LESSON_IDS.includes(data.lessonId as TutorialLessonId) ||
    !ids(data.reached) ||
    !ids(data.completed) ||
    typeof data.active !== "boolean" ||
    typeof data.completionAwarded !== "boolean" ||
    typeof data.previousGrounded !== "boolean" ||
    typeof data.dashLatched !== "boolean" ||
    typeof data.previousBladeState !== "string" ||
    (data.pendingArena !== null && !TUTORIAL_ARENAS.some((arena) => arena.id === data.pendingArena))
  )
    throw new TypeError("Invalid tutorial session fields");
  for (const key of [
    "completionDelay",
    "endingTime",
    "observedLaunches",
    "observedStrikes",
    "risingCutWindow",
    "chargeCommitWindow",
    "chargeRecoveryWindow",
    "bladeAwayTime",
  ]) {
    if (typeof data[key] !== "number" || !Number.isFinite(data[key]) || data[key] < 0)
      throw new TypeError(`Invalid tutorial ${key}`);
  }
  for (const key of ["chargeCommitAwayX", "previousPlayerX"]) {
    if (key === "previousPlayerX" && data[key] === null) continue;
    if (typeof data[key] !== "number" || !Number.isFinite(data[key])) throw new TypeError(`Invalid tutorial ${key}`);
  }
  const marks = [
    "airHit",
    "dash",
    "deflect",
    "jump",
    "launch",
    "moveL",
    "moveR",
    "evade",
    "parry",
    "punish",
    "recall",
    "slam",
    "strike",
    "superslam",
    "throwHit",
    "updraft",
  ];
  if (
    !isRecord(data.counters) ||
    Object.entries(data.counters).some(
      ([key, number]) => !marks.includes(key) || typeof number !== "number" || !Number.isFinite(number) || number < 0,
    )
  )
    throw new TypeError("Invalid tutorial counters");
  const reached = data.reached,
    completed = data.completed;
  if (data.version === 7) {
    const allowed = [
      "version",
      "courseSessionId",
      "phase",
      "active",
      "lessonId",
      "reached",
      "completed",
      "completionAwarded",
      "counters",
      "pendingArena",
      "completionDelay",
      "endingTime",
      "observedLaunches",
      "observedStrikes",
      "risingCutWindow",
      "chargeCommitWindow",
      "chargeRecoveryWindow",
      "chargeCommitAwayX",
      "bladeAwayTime",
      "previousGrounded",
      "previousBladeState",
      "dashLatched",
      "previousPlayerX",
      "curriculumVersion",
      "fieldEncounter",
      "interWaveRemaining",
      "skipped",
    ];
    if (
      Object.keys(data).some((key) => !allowed.includes(key)) ||
      !ids(data.skipped) ||
      data.skipped.length === 0 ||
      data.skipped.includes("ready") ||
      data.courseSessionId === "" ||
      data.phase === "lesson-practice" ||
      data.skipped.some((id) => !reached.includes(id) || completed.includes(id)) ||
      data.completionAwarded ||
      completed.includes("ready") ||
      (data.phase === "free-practice" && data.lessonId !== "ready")
    )
      throw new RangeError("Invalid unfinished tutorial course");
  } else if (data.skipped !== undefined) throw new RangeError("Historical tutorial cannot contain skipped progress");
  if (data.version === 3 || data.version === 4 || data.version === 5 || data.version === 6) {
    const origin = data.practiceOrigin;
    if (
      !isRecord(origin) ||
      origin.kind !== "durable-profile-completion" ||
      !Number.isSafeInteger(origin.tutorialDone) ||
      Number(origin.tutorialDone) <= 0 ||
      data.courseSessionId !== "" ||
      data.completionAwarded ||
      data.phase === "course" ||
      data.lessonId === "ready" ||
      reached.includes("ready")
    )
      throw new RangeError("Invalid tutorial practice origin");
  }
  if (data.version === 4) {
    const annex = validateWeaponAnnex(data.annex),
      definition = weaponAnnexLesson(annex);
    if (
      data.lessonId !== "move" ||
      (data.completed as unknown[]).length !== 0 ||
      reached.length !== 13 ||
      Object.keys(data.counters).length !== 0 ||
      data.fieldEncounter !== "charger" ||
      data.endingTime !== 0 ||
      Number(data.completionDelay) > 1.1 ||
      (data.pendingArena !== null && (annex.progress !== 0 || annex.pendingEvidence)) ||
      (data.pendingArena !== null && data.pendingArena !== definition.arena) ||
      (data.phase === "free-practice" && (annex.progress !== 2 || data.completionDelay !== 0)) ||
      (data.active && annex.progress === 2 && data.completionDelay === 0) ||
      (data.completionDelay !== 0 && annex.progress !== 2)
    )
      throw new RangeError("Inconsistent tutorial weapon annex");
  } else if (data.annex !== undefined) throw new RangeError("Historical tutorial cannot contain a weapon annex");
  if (data.version === 5) {
    const enemy = validatePracticeEnemy(data.enemyPractice);
    if (
      data.lessonId !== "move" ||
      (data.completed as unknown[]).length !== 0 ||
      reached.length !== 13 ||
      Object.keys(data.counters).length !== 0 ||
      data.fieldEncounter !== "charger" ||
      data.endingTime !== 0 ||
      Number(data.completionDelay) > 1.1 ||
      (data.pendingArena !== null && (data.pendingArena !== "field-floor" || enemy.spawned)) ||
      (data.phase === "free-practice" && (!enemy.defeated || data.completionDelay !== 0)) ||
      (data.active && enemy.defeated && data.completionDelay === 0) ||
      (data.completionDelay !== 0 && !enemy.defeated)
    )
      throw new RangeError("Inconsistent practice enemy session");
  } else if (data.enemyPractice !== undefined)
    throw new RangeError("Historical tutorial cannot contain an enemy practice session");
  if (data.version === 6) {
    const boss = validatePracticeBoss(data.bossPractice);
    if (
      data.lessonId !== "move" ||
      data.completed.length !== 0 ||
      reached.length !== 13 ||
      Object.keys(data.counters).length !== 0 ||
      data.pendingArena !== null ||
      data.fieldEncounter !== "charger" ||
      data.endingTime !== 0 ||
      data.completionDelay !== 0 ||
      (data.phase === "free-practice") !== boss.defeated
    )
      throw new RangeError("Inconsistent boss practice session");
  } else if (data.bossPractice !== undefined) throw new RangeError("Historical tutorial cannot contain boss practice");
  if (
    data.active !== (data.phase === "course" || data.phase === "lesson-practice") ||
    (data.active &&
      (!data.reached.includes(data.lessonId as TutorialLessonId) ||
        (!data.courseSessionId &&
          data.version !== 3 &&
          data.version !== 4 &&
          data.version !== 5 &&
          data.version !== 6))) ||
    data.completed.some((id) => !reached.includes(id)) ||
    ((data.phase === "lesson-practice" || data.phase === "free-practice") &&
      !data.completionAwarded &&
      data.version !== 3 &&
      data.version !== 4 &&
      data.version !== 5 &&
      data.version !== 6 &&
      data.version !== 7)
  )
    throw new RangeError("Inconsistent tutorial session");
  if (
    data.version === 2 ||
    data.version === 3 ||
    data.version === 4 ||
    data.version === 5 ||
    data.version === 6 ||
    data.version === 7
  ) {
    if (
      data.curriculumVersion !== 2 ||
      (data.fieldEncounter !== "charger" && data.fieldEncounter !== "breath" && data.fieldEncounter !== "mixed") ||
      typeof data.interWaveRemaining !== "number" ||
      !Number.isFinite(data.interWaveRemaining) ||
      data.interWaveRemaining < 0 ||
      data.interWaveRemaining > FIELD_BREATH_SECONDS ||
      (data.fieldEncounter !== "charger" && data.lessonId !== "field-test") ||
      (data.fieldEncounter === "breath"
        ? data.interWaveRemaining <= 0 || data.completionDelay !== 0
        : data.interWaveRemaining !== 0)
    )
      throw new RangeError("Invalid tutorial encounter");
  }
  return structuredClone(value) as TutorialSessionCheckpoint;
}
