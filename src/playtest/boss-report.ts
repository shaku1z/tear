import { AUTHORED_BOSS_ROSTER } from "../gameplay/run/content-director";
import { isPracticeBossId } from "../gameplay/training/boss-phase-practice-runtime";
import { BOSS_PLAYER_IDS, TELL_AVOIDANCE, type BossPlayerId } from "./boss-player";
import {
  bossFightScenario,
  playBossFight,
  secondsOf,
  BODY_HIT,
  UNMARKED_HIT,
  type BossFightRequest,
  type BossFightResult,
  type BossPhaseResult,
} from "./boss-fight";

export interface BossReportRequest {
  readonly bosses: readonly BossFightRequest["boss"][];
  readonly difficulty: BossFightRequest["difficulty"];
  readonly weapons: readonly BossFightRequest["weapon"][];
  readonly seeds: readonly string[];
  readonly players: readonly BossPlayerId[];
  /** Chosen start phases, through the game's boss practice. Absent: every fight starts at Phase I in boss-only mode. */
  readonly phases?: readonly number[];
  readonly maxTicks: number;
}

/** The bosses reported when none is named: every boss the game defines, in its order. */
export const REPORT_BOSSES: readonly BossFightRequest["boss"][] = Object.freeze(
  AUTHORED_BOSS_ROSTER.map(({ id }) => id),
);
/** With chosen start phases: every boss the game's boss practice accepts. */
export const PRACTICE_REPORT_BOSSES = Object.freeze(REPORT_BOSSES.filter(isPracticeBossId));

/** The players reported when none is named: every one. */
export const REPORT_PLAYERS: readonly BossPlayerId[] = BOSS_PLAYER_IDS;

const ROMAN = ["", "I", "II", "III"];

export function bossFightRequests(request: BossReportRequest): readonly BossFightRequest[] {
  return request.bosses.flatMap((boss) =>
    request.weapons.flatMap((weapon) =>
      request.seeds.flatMap((seed) =>
        (request.phases ?? [undefined]).flatMap((phase) =>
          request.players.map((player) => ({
            boss,
            weapon,
            seed,
            player,
            difficulty: request.difficulty,
            ...(phase === undefined ? {} : { phase }),
            maxTicks: request.maxTicks,
          })),
        ),
      ),
    ),
  );
}

export function playBossReport(request: BossReportRequest): readonly BossFightResult[] {
  const requests = bossFightRequests(request);
  // Every fight is admitted before the first is played, so a mistyped id costs no playing time.
  for (const fight of requests) bossFightScenario(fight);
  return requests.map(playBossFight);
}

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

function hitsText(phase: BossPhaseResult): string {
  const entries = Object.entries(phase.hitsBy).sort(
    ([leftName, left], [rightName, right]) => right.damage - left.damage || leftName.localeCompare(rightName),
  );
  if (entries.length === 0) return "none";
  return entries.map(([name, hit]) => `${name} ${String(hit.hits)}x (${hit.damage.toFixed(0)})`).join(", ");
}

/** Damage the player took that no declared tell warned of: body contact and unmarked hits. */
export function noTellDamage(phase: BossPhaseResult): number {
  return (phase.hitsBy[BODY_HIT]?.damage ?? 0) + (phase.hitsBy[UNMARKED_HIT]?.damage ?? 0);
}

/** One line per phase that had something to cut: what was planted, what the player cut, how long it stood. */
function objectsText(fight: BossFightResult): string {
  return fight.phases
    .filter((phase) => Object.keys(phase.objects).length > 0)
    .map((phase) => {
      const names = Object.entries(phase.objects).sort(([left], [right]) => left.localeCompare(right));
      const parts = names.map(
        ([name, count]) =>
          `${name} cut ${String(count.cut)} of ${String(count.placed)} (stood ${secondsOf(count.standingTicks).toFixed(1)} s)`,
      );
      return `\nto cut in phase ${ROMAN[phase.phase] ?? String(phase.phase)}: ${parts.join(", ")}`;
    })
    .join("");
}

function phaseEnd(fight: BossFightResult, index: number): string {
  if (index < fight.phases.length - 1) return "phase cleared";
  return fight.end;
}

function fightText(fight: BossFightResult): string {
  const head =
    `${fight.boss}  difficulty ${fight.difficulty}  weapon ${fight.weapon}  seed ${fight.seed}  player ${fight.player}` +
    (fight.phase === undefined
      ? ""
      : `
start: phase ${ROMAN[fight.phase] ?? String(fight.phase)} through the game's boss practice, ` +
        `reached in ${secondsOf(fight.setupTicks).toFixed(1)} s before the fight`) +
    `\nresult: ${fight.end} after ${secondsOf(fight.ticks).toFixed(1)} s` +
    (fight.bossMaxHp > 0 ? `, boss health left ${((100 * fight.bossHpLeft) / fight.bossMaxHp).toFixed(0)}%` : "") +
    (fight.reason === undefined ? "" : ` (${fight.reason})`) +
    (fight.killingHit === undefined
      ? ""
      : `\nkilling hit: ${fight.killingHit.damage.toFixed(0)} damage attributed to ${fight.killingHit.source}` +
        `, while the boss was in "${fight.killingHit.bossDoing}"`) +
    (fight.limitedTellData
      ? "\nlimited tell data: this boss declares no tells, so the player could only back off from its windup. Not a fair fight."
      : "");
  if (fight.phases.length === 0) return head;
  const rows = [
    [
      "phase",
      "time s",
      "ended",
      "dealt",
      "healed",
      "taken",
      "no tell",
      "hits",
      "exposed s",
      "moves that hit the player (attributed)",
    ],
    ...fight.phases.map((phase, index) => [
      ROMAN[phase.phase] ?? String(phase.phase),
      secondsOf(phase.ticks).toFixed(1),
      phaseEnd(fight, index),
      phase.damageDealt.toFixed(0),
      phase.bossHealed.toFixed(0),
      phase.damageTaken.toFixed(0),
      noTellDamage(phase).toFixed(0),
      String(phase.hitsTaken),
      secondsOf(phase.exposedTicks).toFixed(1),
      hitsText(phase),
    ]),
  ];
  return `${head}\n${table(rows)}${objectsText(fight)}`;
}

/** Damage taken across the fights, and how much of it no declared tell warned of. */
export function noTellTotals(fights: readonly BossFightResult[]): Readonly<{ taken: number; noTell: number }> {
  let taken = 0;
  let noTell = 0;
  for (const fight of fights)
    for (const phase of fight.phases) {
      taken += phase.damageTaken;
      noTell += noTellDamage(phase);
    }
  return { taken, noTell };
}

export function formatBossReport(fights: readonly BossFightResult[]): string {
  const bosses = [...new Set(fights.map((fight) => fight.boss))];
  const sections = bosses.map((boss) => {
    const own = fights.filter((fight) => fight.boss === boss);
    const { taken, noTell } = noTellTotals(own);
    const share = taken === 0 ? 0 : (100 * noTell) / taken;
    return (
      `== ${boss} ==\n` +
      own.map(fightText).join("\n\n") +
      `\n\n${boss}: damage with no tell ${noTell.toFixed(0)} of ${taken.toFixed(0)} taken (${share.toFixed(0)}%), over ${String(own.length)} fights.`
    );
  });
  const notes =
    "How to read this. Each fight is the real game played headless from a boss-only start; the same seed gives the " +
    "same table. A phase is reached by play, so a phase the player never reached has no row, unless the fight " +
    "started at a chosen phase: then the game's own boss practice (the Playground's, Sword on Normal only) brought " +
    "the boss there through its own transitions and the time before it is not counted. Damage sources are " +
    'attributed from the tells the boss declares, not reported by the game: "unmarked" is damage with no active ' +
    'tell on the player and no body contact. The "no tell" column is body contact plus unmarked: damage nothing warned of. The "avoids-tells" player leaves a warned area ' +
    `${String(TELL_AVOIDANCE.reactTicks)} ticks before it lands and dashes at ${String(TELL_AVOIDANCE.dashTicks)} ticks ` +
    `(120 ticks a second), keeping ${String(TELL_AVOIDANCE.marginPixels)} px clear. The "cuts-objects" player is ` +
    "the same player, and it also goes to whatever stands on the stage for a weapon to cut (Grafts, cage walls, " +
    'roots) and cuts it before it returns to the boss. "To cut" lines count those: a thing that left without ' +
    "being cut (the boss took it back, the phase ended) counts as placed only. Every player is weaker than a person.";
  return `${sections.join("\n\n")}\n\n${notes}\n`;
}
