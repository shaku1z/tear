import { secondsOf, type BossFightResult, type BossPhaseResult } from "./boss-fight";
import { noTellDamage } from "./boss-report";

/** How the fights of one boss, difficulty, phase and player went, over every weapon and seed played. */
export interface BossSummaryRow {
  readonly boss: string;
  readonly difficulty: string;
  readonly phase: number;
  readonly player: string;
  /** Fights that reached this phase. */
  readonly fights: number;
  /** Of those, the fights in which the player cleared it. */
  readonly cleared: number;
  /** The middle clear time, in seconds; absent when no fight cleared the phase. */
  readonly clearSeconds?: number;
  /** Per fight, on average. */
  readonly damageTaken: number;
  readonly hitsTaken: number;
  readonly hitsLanded: number;
  /** Share of the damage taken that no declared tell warned of, from 0 to 1. */
  readonly noTellShare: number;
  /** Over all the time played in this phase. */
  readonly bossPixelsPerSecond: number;
  /** Share of that time the boss reported itself open, from 0 to 1. */
  readonly openShare: number;
}

interface Played {
  readonly fight: BossFightResult;
  readonly phase: BossPhaseResult;
  readonly cleared: boolean;
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

/**
 * One row per boss, difficulty, phase and player: bosses, difficulties and players in the order the fights were
 * asked for, and a boss's phases in their own order.
 */
export function summariseBossFights(fights: readonly BossFightResult[]): readonly BossSummaryRow[] {
  const groups = new Map<string, Played[]>();
  for (const fight of fights)
    fight.phases.forEach((phase, index) => {
      const key = JSON.stringify([fight.boss, fight.difficulty, phase.phase, fight.player]);
      const cleared = index < fight.phases.length - 1 || fight.end === "boss defeated";
      groups.set(key, [...(groups.get(key) ?? []), { fight, phase, cleared }]);
    });
  const place = (pick: (fight: BossFightResult) => string): ((fight: BossFightResult) => number) => {
    const order = [...new Set(fights.map(pick))];
    return (fight) => order.indexOf(pick(fight));
  };
  const boss = place((fight) => fight.boss);
  const difficulty = place((fight) => fight.difficulty);
  const player = place((fight) => fight.player);
  const rank = ({ fight, phase }: Played): readonly number[] => [
    boss(fight),
    difficulty(fight),
    phase.phase,
    player(fight),
  ];
  const ordered = [...groups.values()].sort((left, right) => {
    const [a, b] = [left[0], right[0]];
    if (a === undefined || b === undefined) return 0;
    const other = rank(b);
    return rank(a).reduce((found, value, index) => (found !== 0 ? found : value - (other[index] ?? 0)), 0);
  });
  return ordered.map((played) => {
    const first = played[0];
    if (first === undefined) throw new Error("a summary group is never empty");
    const phases = played.map((entry) => entry.phase);
    const ticks = sum(phases.map((phase) => phase.ticks));
    const taken = sum(phases.map((phase) => phase.damageTaken));
    const clearSeconds = median(played.filter((entry) => entry.cleared).map((entry) => secondsOf(entry.phase.ticks)));
    return {
      boss: first.fight.boss,
      difficulty: first.fight.difficulty,
      phase: first.phase.phase,
      player: first.fight.player,
      fights: played.length,
      cleared: played.filter((entry) => entry.cleared).length,
      ...(clearSeconds === undefined ? {} : { clearSeconds }),
      damageTaken: taken / played.length,
      hitsTaken: sum(phases.map((phase) => phase.hitsTaken)) / played.length,
      hitsLanded: sum(phases.map((phase) => phase.hitsLanded)) / played.length,
      noTellShare: taken === 0 ? 0 : sum(phases.map(noTellDamage)) / taken,
      bossPixelsPerSecond: ticks === 0 ? 0 : sum(phases.map((phase) => phase.bossTravel)) / secondsOf(ticks),
      openShare: ticks === 0 ? 0 : sum(phases.map((phase) => phase.exposedTicks)) / ticks,
    };
  });
}

const ROMAN = ["", "I", "II", "III"];
const percent = (share: number): string => `${(100 * share).toFixed(0)}%`;

function table(rows: readonly (readonly string[])[]): string {
  const widths = rows[0]?.map((_, column) => Math.max(...rows.map((row) => row[column]?.length ?? 0))) ?? [];
  return rows
    .map((row) =>
      row
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

/** The summary: what was played, any fight that broke, and one table per boss and difficulty. */
export function formatBossSummary(fights: readonly BossFightResult[]): string {
  const unique = (pick: (fight: BossFightResult) => string): string => [...new Set(fights.map(pick))].join(", ");
  const broken = fights.filter((fight) => fight.end === "broken");
  const head =
    `Summary of ${String(fights.length)} fights. Weapons: ${unique((fight) => fight.weapon)}. ` +
    `Seeds: ${unique((fight) => fight.seed)}. A row pools every weapon and seed.` +
    broken
      .map(
        (fight) =>
          `\nbroken: ${fight.boss} ${fight.difficulty} ${fight.weapon} seed ${fight.seed} ${fight.player}` +
          (fight.reason === undefined ? "" : ` (${fight.reason})`),
      )
      .join("");
  const rows = summariseBossFights(fights);
  const sections = [...new Set(rows.map((row) => `${row.boss}  difficulty ${row.difficulty}`))].map((title) => {
    const own = rows.filter((row) => `${row.boss}  difficulty ${row.difficulty}` === title);
    const lines = [
      ["phase", "player", "cleared", "clear s", "taken", "no tell", "hits", "landed", "boss px/s", "open"],
      ...own.map((row) => [
        ROMAN[row.phase] ?? String(row.phase),
        row.player,
        `${String(row.cleared)} of ${String(row.fights)}`,
        row.clearSeconds === undefined ? "-" : row.clearSeconds.toFixed(1),
        row.damageTaken.toFixed(0),
        percent(row.noTellShare),
        row.hitsTaken.toFixed(1),
        row.hitsLanded.toFixed(1),
        row.bossPixelsPerSecond.toFixed(0),
        percent(row.openShare),
      ]),
    ];
    return `== ${title} ==\n${table(lines)}`;
  });
  const notes =
    'How to read the summary. "cleared" is the fights in which the player got through the phase, of those that ' +
    'reached it; "clear s" is the middle time of those. "taken", "hits" (on the player) and "landed" (ticks in which ' +
    "the boss lost health, whatever took it: a boss can lose health to a player who presses nothing) are per fight. " +
    '"no tell" is the share of the damage taken that no declared tell warned of. "boss px/s" ' +
    'and "open" (the share of the time the boss reported itself open) are over all the time played in the phase. ' +
    "The pressure players (no-dodge, still, walker) stop after 60 s of a phase and are not there to clear it.";
  return `${head}\n\n${sections.join("\n\n")}\n\n${notes}\n`;
}
