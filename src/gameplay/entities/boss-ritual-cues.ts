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
      brief?: boolean;
    }>
  >
> = {
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
};
export function canonicalBossRitualCue(owner: BossRitualActor, cue: BossRitualCue): BossRitualCue {
  const expected = cues[cue.id];
  const status: unknown =
    "practicePhaseEntry" in owner && typeof owner.practicePhaseEntry === "function"
      ? (owner as BossRitualActor & BossPhasePracticeActor).practicePhaseEntry()
      : null;
  if (
    !expected ||
    cue.pose !== owner.cinematicPose ||
    !isObject(status) ||
    !("phase" in status) ||
    status.phase !== expected.phase ||
    expected.bossId !== owner.bossId ||
    cue.pose !== expected.pose ||
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
