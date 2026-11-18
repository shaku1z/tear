import { TELL_AVOIDANCE, type BossPlayerId } from "./boss-player";
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
  readonly maxTicks: number;
}

/** The bosses reported when none is named: the ones the current work is about. */
export const DEFAULT_REPORT_BOSSES: readonly BossFightRequest["boss"][] = Object.freeze([
  "rootbound",
  "aldric",
  "white-hart",
]);

const ROMAN = ["", "I", "II", "III"];

export function bossFightRequests(request: BossReportRequest): readonly BossFightRequest[] {
  return request.bosses.flatMap((boss) =>
    request.weapons.flatMap((weapon) =>
      request.seeds.flatMap((seed) =>
        request.players.map((player) => ({
          boss,
          weapon,
          seed,
          player,
          difficulty: request.difficulty,
          maxTicks: request.maxTicks,
        })),
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

function phaseEnd(fight: BossFightResult, index: number): string {
  if (index < fight.phases.length - 1) return "phase cleared";
  return fight.end;
}

function fightText(fight: BossFightResult): string {
  const head =
    `${fight.boss}  difficulty ${fight.difficulty}  weapon ${fight.weapon}  seed ${fight.seed}  player ${fight.player}` +
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
  return `${head}\n${table(rows)}`;
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
    "same table. A phase is reached by play, so a phase the player never reached has no row. Damage sources are " +
    'attributed from the tells the boss declares, not reported by the game: "unmarked" is damage with no active ' +
    'tell on the player and no body contact. The "no tell" column is body contact plus unmarked: damage nothing warned of. The "avoids-tells" player leaves a warned area ' +
    `${String(TELL_AVOIDANCE.reactTicks)} ticks before it lands and dashes at ${String(TELL_AVOIDANCE.dashTicks)} ticks ` +
    `(120 ticks a second), keeping ${String(TELL_AVOIDANCE.marginPixels)} px clear. Both players are weaker than a person.`;
  return `${sections.join("\n\n")}\n\n${notes}\n`;
}
