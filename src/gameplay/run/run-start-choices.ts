import type { RunDifficulty, RunMode } from "./session";
import { migrateWeaponSelection, type WeaponId } from "../weapon-selection";
import type { CinematicPreference } from "../campaign/cinematic-preference";

/**
 * Everything a run's start depends on besides the code: the player's picks and the saved progress the
 * start reads. The live game resolves it once, from the session, the profile, META and the settings; a
 * replay reads it from its record. The run start reads only this, so the same choices start the same
 * world in live play and in a detached world.
 *
 * Settings that act on the device (pointer sensitivity, pad dead zones) are not here: they shape input
 * before it becomes an action, so the simulation never reads them. The cinematics preference is here
 * because it decides whether a chapter holds a stage's first wave.
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
  /** The cinematics setting for the whole run; a change made during the run applies from the next one. */
  readonly cinematics: CinematicPreference;
  /** Adventure chapters already played this session, by stage index; a retry skips their cinematic. */
  readonly playedChapters: readonly number[];
}

/** True for a run seed the run start accepts: a non-zero unsigned 32-bit integer. */
export function isRunSeed(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 0xffff_ffff;
}

/**
 * The one conversion from a scenario's seed text to a run seed (FNV-1a, never zero). Tests, TearBench
 * scenarios and playtests name their seeds; a run, its record and its replay only ever hold the number.
 */
export function scenarioRunSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 1;
}

/** The saved progress and settings a start reads, as a scenario or a record states them. */
export type SavedRunStart = Partial<
  Pick<
    RunStartChoices,
    "metaRanks" | "variantDiscovery" | "achievementSnapshot" | "restoredTrail" | "cinematics" | "playedChapters"
  >
>;

/** What a scenario states about its start; everything else is a new player's start. */
export interface ScenarioRunStart {
  readonly runSeed: number;
  readonly mode?: string;
  readonly weaponId?: string;
  readonly difficulty?: RunDifficulty;
  readonly firstBoss?: string;
  readonly saved?: SavedRunStart;
}

/** The start choices of a scenario: its own fields, and a new player's for the rest. */
export function scenarioRunStartChoices(scenario: ScenarioRunStart): RunStartChoices {
  if (!isRunSeed(scenario.runSeed)) throw new RangeError("a run seed is a non-zero unsigned 32-bit integer");
  const saved = scenario.saved ?? {};
  return Object.freeze({
    mode: (scenario.mode ?? "endless") as RunMode,
    difficulty: scenario.difficulty ?? "normal",
    weapon: migrateWeaponSelection(scenario.weaponId ?? "sword"),
    boss: scenario.firstBoss ?? "shuffle",
    runSeed: scenario.runSeed,
    metaRanks: Object.freeze({ ...saved.metaRanks }),
    variantDiscovery: Object.freeze([...(saved.variantDiscovery ?? [])]),
    achievementSnapshot: Object.freeze([...(saved.achievementSnapshot ?? [])]),
    restoredTrail: saved.restoredTrail ?? false,
    cinematics: saved.cinematics ?? "full",
    playedChapters: Object.freeze([...(saved.playedChapters ?? [])]),
  });
}
