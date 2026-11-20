import { secondsOf } from "./boss-fight";
import type { BossPlayerId } from "./boss-player";
import { sliceOf } from "./boss-report";
import { enemyScenario, playEnemy, type EnemyRequest, type EnemyResult } from "./enemy-play";
import { groups, median, sum, table } from "./report-text";

export interface EnemyReportRequest {
  readonly enemies: readonly EnemyRequest["enemy"][];
  readonly counts: readonly number[];
  readonly difficulties: readonly EnemyRequest["difficulty"][];
  readonly weapons: readonly EnemyRequest["weapon"][];
  readonly seeds: readonly string[];
  readonly players: readonly BossPlayerId[];
  readonly maxTicks: number;
}

export function enemyRequests(request: EnemyReportRequest): readonly EnemyRequest[] {
  return request.difficulties.flatMap((difficulty) =>
    request.weapons.flatMap((weapon) =>
      request.players.flatMap((player) =>
        request.counts.flatMap((count) =>
          request.enemies.flatMap((enemy) =>
            request.seeds.map((seed) => ({
              enemy,
              count,
              difficulty,
              weapon,
              seed,
              player,
              maxTicks: request.maxTicks,
            })),
          ),
        ),
      ),
    ),
  );
}

/**
 * The meetings a request asks for, each admitted by the game's own check: a mistyped enemy, count, weapon,
 * difficulty or player is refused here, by name, before any meeting is played.
 */
export function admitEnemyReport(request: EnemyReportRequest): readonly EnemyRequest[] {
  const requests = enemyRequests(request);
  for (const meeting of requests) enemyScenario(meeting);
  return requests;
}

/** Plays the meetings asked for, or one worker's share of them (`sliceOf`). */
export function playEnemyReport(
  request: EnemyReportRequest,
  share?: Readonly<{ index: number; of: number }>,
): readonly EnemyResult[] {
  const requests = admitEnemyReport(request);
  const own = share === undefined ? requests : sliceOf(requests, share.index, share.of);
  return own.map((meeting) => playEnemy(meeting));
}

const seconds = (ticks: number | undefined): string => (ticks === undefined ? "-" : secondsOf(ticks).toFixed(1));
const middle = (values: readonly number[], digits = 0): string => median(values)?.toFixed(digits) ?? "-";
const ended = (meetings: readonly EnemyResult[], end: EnemyResult["end"]): readonly EnemyResult[] =>
  meetings.filter((meeting) => meeting.end === end);

/** Damage by what it is attributed to, a meeting, largest first. */
function sources(meetings: readonly EnemyResult[]): string {
  const damage = new Map<string, number>();
  for (const meeting of meetings)
    for (const [source, hits] of Object.entries(meeting.hitsBy))
      damage.set(source, (damage.get(source) ?? 0) + hits.damage);
  return [...damage]
    .sort(([first, left], [second, right]) => right - left || first.localeCompare(second))
    .map(([source, amount]) => `${source} ${(amount / meetings.length).toFixed(0)}`)
    .join(", ");
}

/** Kinds that were in play beside the one asked for, a meeting: what the enemy called. */
function others(enemy: string, meetings: readonly EnemyResult[]): string {
  const kinds = new Map<string, number>();
  for (const meeting of meetings)
    for (const [kind, count] of Object.entries(meeting.inPlay))
      if (kind !== enemy) kinds.set(kind, (kinds.get(kind) ?? 0) + count);
  return [...kinds].map(([kind, count]) => `${kind} ${(count / meetings.length).toFixed(1)}`).join(", ") || "-";
}

const HEAD = [
  "enemy",
  "cleared",
  "player fell",
  "stalled",
  "time limit",
  "clear s",
  "health",
  "health left",
  "taken",
  "hits",
  "also in play (a meeting)",
  "damage a meeting by source (attributed)",
];

function enemyRow(enemy: string, meetings: readonly EnemyResult[]): readonly string[] {
  const cleared = ended(meetings, "cleared");
  const of = `/${String(meetings.length)}`;
  const left = sum(meetings.map((meeting) => meeting.enemyHealthLeft));
  const whole = sum(meetings.map((meeting) => meeting.enemyHealth));
  return [
    enemy,
    `${String(cleared.length)}${of}`,
    `${String(ended(meetings, "player defeated").length)}${of}`,
    `${String(ended(meetings, "stalled").length)}${of}`,
    `${String(ended(meetings, "time limit").length)}${of}`,
    seconds(median(cleared.map((meeting) => meeting.ticks))),
    middle(meetings.map((meeting) => meeting.enemyHealth)),
    whole === 0 ? "-" : `${((100 * left) / whole).toFixed(0)}%`,
    middle(meetings.map((meeting) => meeting.damageTaken)),
    middle(meetings.map((meeting) => meeting.hitsTaken)),
    others(enemy, meetings),
    sources(meetings),
  ];
}

const NOTES =
  "Each meeting is in the Playground, the game's own empty arena, with enemies of one kind put in play by the " +
  "game's own spawner, which chooses where they arrive. The enemies are at wave 1 strength and the player has no " +
  "upgrades, so the rows compare the kinds with each other; they are not what a kind costs late in a run " +
  '(`pnpm playtest waves` shows that).\nNumbers are medians over the seeds; "health left" is the share of the ' +
  "enemies' health standing at the end, over every meeting. Damage is attributed as in the waves report: to a " +
  'shot on the player at that tick, else to an enemy touching the player, else to "unmarked". ' +
  '"stalled" is a meeting the player gave up: it pauses when no health has changed on either side for 15 seconds.\n';

/** One table per difficulty, weapon, player and count, a row per enemy kind. */
export function formatEnemyReport(results: readonly EnemyResult[]): string {
  const blocks = groups(
    results,
    (meeting) => `${meeting.difficulty}|${meeting.weapon}|${meeting.player}|${String(meeting.count)}`,
  ).map((block) => {
    const first = block[0];
    if (first === undefined) return "";
    const seeds = new Set(block.map((meeting) => meeting.seed)).size;
    return (
      `${String(first.count)} of a kind  difficulty ${first.difficulty}  weapon ${first.weapon}  player ${first.player}` +
      `  ${String(seeds)} ${seeds === 1 ? "seed" : "seeds"}  limit ${seconds(first.maxTicks)} s\n` +
      table([HEAD, ...groups(block, (meeting) => meeting.enemy).map((same) => enemyRow(same[0]?.enemy ?? "", same))])
    );
  });
  const broken = ended(results, "broken");
  return (
    NOTES +
    (broken.length === 0
      ? ""
      : `\nBROKEN: ${broken.map((meeting) => `${meeting.enemy} seed ${meeting.seed} (${meeting.reason ?? "no reason"})`).join("; ")}\n`) +
    `\n${blocks.join("\n\n")}\n`
  );
}
