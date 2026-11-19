import type { BossPhasePracticeActor } from "../training/boss-phase-practice-runtime";
import type { BossRitualActor, BossRitualCue } from "./boss-ritual-controller";
import { isObject } from "../../domain/records";

/** The behavior-bearing authored cue contract, shared by fresh launch and portable binding. */
const cues: Readonly<
  Record<
    string,
    Readonly<{
      bossId: string;
      phase: 2 | 3;
      pose: string;
      line: string;
      sfx: string;
      speaker?: string;
      anchor: string;
      after?: "throwShield";
      crownFall?: boolean;
      firstVertical?: boolean;
      brief?: boolean;
    }>
  >
> = {
  "warden-unchained": {
    bossId: "warden",
    phase: 2,
    pose: "wardenRule",
    line: "THE RULES ARE ALL THAT REMAIN.",
    sfx: "wardenLockdown",
    anchor: "lower-left",
  },
  "warden-nothing-left": {
    bossId: "warden",
    phase: 3,
    pose: "wardenBreak",
    line: "THERE IS NOTHING LEFT TO GUARD.",
    sfx: "wardenLockdown",
    anchor: "lower-left",
    brief: true,
  },
  "colossus-breach": {
    bossId: "colossus",
    phase: 2,
    pose: "colossusContainment",
    line: "OUTER CONTAINMENT FAILED.",
    speaker: "FOUNDRY WARNING",
    sfx: "colossusServo",
    anchor: "upper-left",
    after: "throwShield",
  },
  "colossus-meltdown": {
    bossId: "colossus",
    phase: 3,
    pose: "colossusCore",
    line: "CORE CONTAINMENT: LOST.",
    speaker: "FOUNDRY WARNING",
    sfx: "colossusServo",
    anchor: "upper-left",
  },
  "aldric-crownfall": {
    bossId: "aldric",
    phase: 3,
    pose: "aldricCrownfall",
    line: "A THRONE IS ONLY WOOD.",
    sfx: "aldricIgnite",
    anchor: "lower-right",
    crownFall: true,
  },
  "aldric-witnessed": {
    bossId: "aldric",
    phase: 3,
    pose: "aldricFeral",
    line: "A KING NEEDS NO THRONE.",
    sfx: "aldricIgnite",
    anchor: "lower-right",
    brief: true,
    firstVertical: true,
  },
  "aldric-angered": {
    bossId: "aldric",
    phase: 3,
    pose: "aldricFeral",
    line: "YOU CHOSE THE BEAST.",
    sfx: "aldricIgnite",
    anchor: "lower-right",
    brief: true,
    firstVertical: true,
  },
  "rootbound-garden-remembers": {
    bossId: "rootbound",
    phase: 2,
    pose: "rootboundGraft",
    line: "STAY. EVERYONE ELSE STAYED.",
    sfx: "slam",
    anchor: "lower-left",
  },
  "rootbound-nothing-here-dies": {
    bossId: "rootbound",
    phase: 3,
    pose: "rootboundRegrowth",
    line: "THE GARDEN WILL REMEMBER YOU.",
    sfx: "boom",
    anchor: "lower-left",
  },
  "source-true-form": {
    bossId: "source",
    phase: 3,
    pose: "sourceTrue",
    line: "EVERY BLADE RETURNS TO ME.",
    sfx: "sourceCross",
    anchor: "depth-center",
  },
};
export function canonicalBossRitualCue(owner: BossRitualActor, cue: BossRitualCue): BossRitualCue {
  const expected = cues[cue.id];
  const status: unknown =
    "practicePhaseEntry" in owner && typeof owner.practicePhaseEntry === "function"
      ? (owner as BossRitualActor & BossPhasePracticeActor).practicePhaseEntry()
      : null;
  if (
    (cue.id === "aldric-witnessed" && Reflect.get(owner, "witnessEarned") !== true) ||
    (cue.id === "aldric-angered" && Reflect.get(owner, "anger") !== true)
  )
    throw new RangeError("Ritual cue does not match the earned Aldric branch");
  if (
    !expected ||
    cue.pose !== owner.cinematicPose ||
    !isObject(status) ||
    !("phase" in status) ||
    status.phase !== expected.phase ||
    expected.bossId !== owner.bossId ||
    cue.pose !== expected.pose ||
    cue.after !== expected.after ||
    Boolean(cue.crownFall) !== Boolean(expected.crownFall) ||
    Boolean(cue.firstVertical) !== Boolean(expected.firstVertical) ||
    Boolean(cue.brief) !== Boolean(expected.brief) ||
    cue.line !== expected.line ||
    cue.sfx !== expected.sfx ||
    cue.speaker !== (expected.speaker ?? owner.bossName) ||
    cue.anchor !== expected.anchor ||
    cue.maxWidth !== undefined
  )
    throw new RangeError("Ritual cue differs from its authored boss transition");
  return { ...cue, pose: expected.pose, line: expected.line };
}
