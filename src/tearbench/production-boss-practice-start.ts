import type {
  BossPhasePracticeState,
  PracticeBossId,
  PracticeBossPhase,
} from "../gameplay/training/boss-phase-practice-runtime";
import type { PracticeBossState } from "../gameplay/training/practice-boss-catalog";
import type { ProductionReplayWorld } from "./production-world-factory";

/**
 * Starts Playground boss practice at a chosen phase in a fresh tutorial episode, the way the Playground's boss list
 * starts a phase the player has already met. The tutorial and the game's phase-practice runtime then bring the boss
 * to that phase through its own transitions; nothing here edits health or state. Returns a reader of the practice's
 * lifecycle: "active" once the boss is in the chosen phase and ready to fight.
 */
export function beginProductionBossPractice(
  replay: Pick<ProductionReplayWorld, "tutorial" | "world">,
  tick: number,
  bossId: PracticeBossId,
  phase: PracticeBossPhase,
): () => BossPhasePracticeState["lifecycle"] | null {
  const run = replay.world.state.run();
  if (tick !== 0 || run?.mode !== "tutorial" || run.weaponId !== "sword" || run.diff !== "normal")
    throw new RangeError("boss practice starts only a fresh tutorial episode with Sword on Normal");
  const encounterId = `boss-practice:1:${bossId}:${String(phase)}:${String(run.runSeed)}`;
  // The selection a profile holds for a phase the player has met. The runtime fields are the runtime's own opening
  // values; the practice runtime replaces them (and the seed) when it begins the encounter.
  const known: PracticeBossState = {
    bossId,
    phase,
    knowledge: "encountered-phase",
    defeated: false,
    runtime: {
      version: 1,
      bossId,
      phase,
      seed: String(run.runSeed),
      generation: 1,
      encounterId,
      lifecycle: "preparing",
      setupStage: "opening",
      enteredPhase: 1,
      entryStage: "opening",
      pendingPhase: null,
    },
  };
  replay.tutorial.openPractice(1);
  if (!replay.tutorial.selectBoss(`${bossId}:${String(phase)}`, known))
    throw new RangeError(`the Playground refused boss practice for ${bossId} phase ${String(phase)}`);
  return () => replay.tutorial.session().bossPractice?.runtime.lifecycle ?? null;
}
