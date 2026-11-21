import type { RunDifficulty, RunMode } from "./session";
import type { WeaponId } from "../weapon-selection";

/**
 * Everything a run's start depends on besides the code: the player's picks and the saved progress the
 * start reads. The live game resolves it once, from the session, the profile and META; a replay reads it
 * from its record. The run start reads only this, so the same choices start the same world in live play
 * and in a detached world.
 *
 * Settings are not here: they act on the device (pointer sensitivity, pad dead zones) before input
 * becomes an action, so the simulation never reads them.
 */
export interface RunStartChoices {
  readonly mode: RunMode;
  readonly difficulty: RunDifficulty;
  /** The selected weapon, already migrated to the current weapon set. */
  readonly weapon: WeaponId;
  /** Boss-only runs: the boss picked to fight first, or "shuffle". */
  readonly boss: string;
  /** The run seed: a non-zero unsigned 32-bit integer. Every random stream of the run derives from it. */
  readonly runSeed: number;
  /** META ranks the run starts with, by shop id. Empty when the run starts from the baseline loadout. */
  readonly metaRanks: Readonly<Record<string, number>>;
  /** Variant ids the player has discovered, which Endless and Gauntlet may roll. */
  readonly variantDiscovery: readonly string[];
  /** Achievement ids already earned when the run starts; the run awards only new ones. */
  readonly achievementSnapshot: readonly string[];
  /** Whether the blade wears the restored trail reward. */
  readonly restoredTrail: boolean;
}

/** True for a run seed the run start accepts: a non-zero unsigned 32-bit integer. */
export function isRunSeed(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 0xffff_ffff;
}
