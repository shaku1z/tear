import type { RandomSource } from "../../domain/random";
import type { BossId } from "./content-director";

/**
 * The Gauntlet's rules, in one table. A Gauntlet is one trial per boss the
 * Gauntlet may field (`bossIdsAvailableOn("gauntlet")`). Each trial plays two
 * rounds and then its boss, all in the boss's home stage. The first and last
 * bosses of the stage order open and close the run; the ones between are
 * shuffled from the run seed. Every number a trial uses is here.
 */
export interface GauntletRound {
  /** The stage pool's local wave the round draws from (enemy unlocks, composition, HP step). */
  readonly localWave: number;
  /** Enemies on top of the ordinary count for that local wave. */
  readonly extraEnemies: number;
  /** Elites with exactly one affix, added last. */
  readonly gatekeepers: number;
}

export const GAUNTLET_RULES = Object.freeze({
  rounds: Object.freeze<readonly GauntletRound[]>([
    Object.freeze({ localWave: 2, extraEnemies: 0, gatekeepers: 0 }),
    Object.freeze({ localWave: 4, extraEnemies: 2, gatekeepers: 1 }),
  ]),
  /** The one affix a gatekeeper carries; it applies to every enemy kind. */
  gatekeeperAffix: "warded",
  /** Share of missing health restored when a boss falls. Rounds restore nothing; one-hit runs never heal. */
  bossHealShare: 0.5,
  /** Per trial index n (0 for the first trial): enemy HP ×(1 + 0.15n), damage ×(1 + 0.07n). */
  enemyHealthPerTrial: 0.15,
  enemyDamagePerTrial: 0.07,
  /** Per trial index n: boss HP ×(1 + 0.12n), contact damage ×(1 + 0.05n). */
  bossHealthPerTrial: 0.12,
  bossContactPerTrial: 0.05,
  /** How long the card naming the trial, its boss and its stage stays up. */
  trialCardSeconds: 1.6,
});

/** Waves in one trial: its rounds, then its boss. */
export const GAUNTLET_WAVES_PER_TRIAL = GAUNTLET_RULES.rounds.length + 1;

export interface GauntletWave {
  /** Trial index, 0 for the first trial. */
  readonly trial: number;
  /** Round number from 1, or null on the boss wave. */
  readonly round: number | null;
  readonly boss: boolean;
  /** The first wave of a trial loads its stage and shows its card. */
  readonly opensTrial: boolean;
}

export function gauntletWave(wave: number): GauntletWave {
  if (!Number.isSafeInteger(wave) || wave < 1) throw new RangeError("wave must be a positive integer");
  const slot = (wave - 1) % GAUNTLET_WAVES_PER_TRIAL;
  const boss = slot === GAUNTLET_RULES.rounds.length;
  return Object.freeze({
    trial: Math.floor((wave - 1) / GAUNTLET_WAVES_PER_TRIAL),
    round: boss ? null : slot + 1,
    boss,
    opensTrial: slot === 0,
  });
}

export function gauntletRound(round: number): GauntletRound {
  const entry = GAUNTLET_RULES.rounds[round - 1];
  if (entry === undefined) throw new RangeError(`the Gauntlet has no round ${String(round)}`);
  return entry;
}

/**
 * The trial order: the roster's first boss opens, its last closes, and the
 * rest are shuffled with the run's random source (Fisher-Yates, as the boss roster is).
 */
export function gauntletTrialOrder(roster: readonly BossId[], random: RandomSource): BossId[] {
  if (roster.length === 0) throw new RangeError("the Gauntlet needs at least one boss");
  if (new Set(roster).size !== roster.length) throw new RangeError("the Gauntlet roster repeats a boss");
  const first = roster[0],
    last = roster.at(-1);
  if (roster.length <= 2 || first === undefined || last === undefined) return [...roster];
  const middle = roster.slice(1, -1);
  for (let index = middle.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random.next() * (index + 1));
    const current = middle[index];
    const swap = middle[target];
    if (current === undefined || swap === undefined) throw new RangeError("trial shuffle escaped the roster");
    middle[index] = swap;
    middle[target] = current;
  }
  return [first, ...middle, last];
}

export interface GauntletScale {
  readonly health: number;
  readonly damage: number;
}

export function gauntletEnemyScale(trial: number): GauntletScale {
  return Object.freeze({
    health: 1 + trial * GAUNTLET_RULES.enemyHealthPerTrial,
    damage: 1 + trial * GAUNTLET_RULES.enemyDamagePerTrial,
  });
}

export function gauntletBossScale(trial: number): GauntletScale {
  return Object.freeze({
    health: 1 + trial * GAUNTLET_RULES.bossHealthPerTrial,
    damage: 1 + trial * GAUNTLET_RULES.bossContactPerTrial,
  });
}

/** Health a boss clear restores: half of what is missing, none for one-hit runs. */
export function gauntletBossHeal(hp: number, maxHp: number, oneHit: boolean): number {
  if (oneHit) return 0;
  return Math.max(0, maxHp - hp) * GAUNTLET_RULES.bossHealShare;
}

/** The HUD label: "TRIAL 2/6 · ROUND 1/2" or "TRIAL 2/6 · BOSS". */
export function gauntletLabel(wave: number, trialCount: number): string {
  const position = gauntletWave(wave);
  const trial = `TRIAL ${String(position.trial + 1)}/${String(trialCount)}`;
  return position.round === null
    ? `${trial} · BOSS`
    : `${trial} · ROUND ${String(position.round)}/${String(GAUNTLET_RULES.rounds.length)}`;
}

/** The card shown as a trial begins. */
export function gauntletTrialCard(trial: number, trialCount: number): string {
  return `TRIAL ${String(trial + 1)}/${String(trialCount)}`;
}

/** The Gauntlet is cleared when every trial's boss has fallen. */
export function gauntletCleared(bossesBeaten: number, trialCount: number): boolean {
  return trialCount > 0 && bossesBeaten >= trialCount;
}
