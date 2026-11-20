import type { EnemyKind } from "./content-director";

/**
 * One wave of a stage as it is written: the enemies the wave always has and the order they arrive in.
 * The planner fills the rest of the wave from the stage pool, between `first` and `last`.
 */
export interface WaveScriptRow {
  /** What the wave asks of the player, in one line. For the people who tune it; the game does not read it. */
  readonly purpose: string;
  /** Spawned before anything else, in this order. */
  readonly first: readonly EnemyKind[];
  /** Spawned after the fill, in this order. */
  readonly last?: readonly EnemyKind[];
}

/** A stage's waves, one row per local wave from the first. A local wave without a row is not scripted. */
export interface StageWaveScript {
  readonly localWaves: readonly WaveScriptRow[];
}

/** The scripted enemies of one wave, split at the place the fill goes. Both are empty for an unscripted wave. */
export interface ScriptedWave {
  readonly first: readonly EnemyKind[];
  readonly last: readonly EnemyKind[];
}

const UNSCRIPTED: ScriptedWave = Object.freeze({ first: Object.freeze([]), last: Object.freeze([]) });

/** What a stage's script says about a local wave; nothing for a stage without a script or a wave without a row. */
export function scriptedWave(script: StageWaveScript | undefined, localWave: number): ScriptedWave {
  const row = script?.localWaves[localWave - 1];
  return row === undefined ? UNSCRIPTED : { first: row.first, last: row.last ?? UNSCRIPTED.last };
}
