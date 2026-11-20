import { secondsOf } from "./boss-fight";
import type { BossPlayerId } from "./boss-player";
import { sliceOf } from "./boss-report";
import { groups, median, sum, table } from "./report-text";
import { playWave, stageWaves, waveScenario, type WaveBuild, type WaveRequest, type WaveResult } from "./wave-play";

export interface WaveReportRequest {
  readonly stages: readonly string[];
  /** Chosen waves; absent: every wave of each stage before its boss wave. */
  readonly waves?: readonly number[];
  readonly difficulties: readonly WaveRequest["difficulty"][];
  readonly weapons: readonly WaveRequest["weapon"][];
  readonly seeds: readonly string[];
  readonly players: readonly BossPlayerId[];
  readonly builds: readonly WaveBuild[];
  readonly maxTicks: number;
}

/** The players a wave report uses when none is named: the scripted one, and the one that cuts what stands. */
export const WAVE_REPORT_PLAYERS: readonly BossPlayerId[] = Object.freeze(["scripted", "cuts-objects"]);

export function waveRequests(request: WaveReportRequest): readonly WaveRequest[] {
  return request.stages.flatMap((stage) =>
    request.difficulties.flatMap((difficulty) =>
      request.weapons.flatMap((weapon) =>
        request.builds.flatMap((build) =>
          request.players.flatMap((player) =>
            (request.waves ?? stageWaves(stage)).flatMap((wave) =>
              request.seeds.map((seed) => ({
                stage,
                wave,
                difficulty,
                weapon,
                seed,
                player,
                build,
                maxTicks: request.maxTicks,
              })),
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * The waves a request asks for, each admitted by the game's own check: a mistyped stage, wave, weapon,
 * difficulty, player or build is refused here, by name, before any wave is played.
 */
export function admitWaveReport(request: WaveReportRequest): readonly WaveRequest[] {
  const requests = waveRequests(request);
  for (const wave of requests) waveScenario(wave);
  return requests;
}

/** Plays the waves asked for, or one worker's share of them (`sliceOf`). */
export function playWaveReport(
  request: WaveReportRequest,
  share?: Readonly<{ index: number; of: number }>,
): readonly WaveResult[] {
  const requests = admitWaveReport(request);
  const own = share === undefined ? requests : sliceOf(requests, share.index, share.of);
  return own.map((wave) => playWave(wave));
}

const seconds = (ticks: number | undefined): string => (ticks === undefined ? "-" : secondsOf(ticks).toFixed(1));
const middle = (values: readonly number[], digits = 0): string => median(values)?.toFixed(digits) ?? "-";
const total = (runs: readonly WaveResult[], read: (run: WaveResult) => number): number => sum(runs.map(read));

/** Damage by what it is attributed to, summed over the runs, largest first. */
function sources(runs: readonly WaveResult[]): string {
  const damage = new Map<string, number>();
  for (const run of runs)
    for (const [source, hits] of Object.entries(run.hitsBy))
      damage.set(source, (damage.get(source) ?? 0) + hits.damage);
  return [...damage]
    .sort(([first, left], [second, right]) => right - left || first.localeCompare(second))
    .map(([source, amount]) => `${source} ${(amount / runs.length).toFixed(0)}`)
    .join(", ");
}

function binderText(runs: readonly WaveResult[]): string {
  const binders = runs.flatMap((run) => run.roots.rootbinders);
  if (binders.length === 0) return "-";
  const killed = binders.filter((binder) => binder.killTicks !== null);
  const planted = killed.filter((binder) => binder.diedPlanted).length;
  return (
    `${String(killed.length)}/${String(binders.length)} killed` +
    (killed.length === 0
      ? ""
      : ` in ${seconds(median(killed.map((binder) => binder.killTicks ?? 0)))} s, ${String(planted)} planted`)
  );
}

const HEAD = [
  "wave",
  "cleared",
  "clear s",
  "grace s",
  "enemies",
  "elites",
  "taken",
  "snares marked/caught/cut",
  "held s",
  "roots grown/cut",
  "uproots",
  "Rootbinders",
  "damage a run by source (attributed)",
];

function waveRow(wave: number, runs: readonly WaveResult[]): readonly string[] {
  const cleared = runs.filter((run) => run.end === "cleared");
  const roots = (read: (count: WaveResult["roots"]) => number): string => String(total(runs, (run) => read(run.roots)));
  return [
    String(wave),
    `${String(cleared.length)}/${String(runs.length)}`,
    seconds(median(cleared.map((run) => run.clearTicks ?? run.ticks))),
    seconds(median(runs.map((run) => run.graceTicks))),
    middle(runs.map((run) => run.spawned.length)),
    middle(runs.map((run) => run.elites)),
    middle(runs.map((run) => run.damageTaken)),
    `${roots((count) => count.snaresMarked)}/${roots((count) => count.snaresCaught)}/${roots((count) => count.snaresCut)}`,
    seconds(total(runs, (run) => run.roots.heldTicks)),
    `${roots((count) => count.rootsGrown)}/${roots((count) => count.rootsCut)}`,
    roots((count) => count.uproots),
    binderText(runs),
    sources(runs),
  ];
}

/** One run in a line: how it ended, where the player fell, and the wave as it arrived. */
function runLine(run: WaveResult): string {
  const arrived = groups(run.spawned, (enemy) => enemy.kind)
    .map((same) => `${String(same.length)} ${same[0]?.kind ?? ""}`)
    .join(", ");
  const order = run.spawned.map((enemy) => (enemy.affixes.length > 0 ? `${enemy.kind}*` : enemy.kind)).join(" ");
  return (
    `  wave ${String(run.wave)} seed ${run.seed}: ${run.end} after ${seconds(run.ticks)} s` +
    (run.reason === undefined ? "" : ` (${run.reason})`) +
    (run.diedAt === undefined ? "" : ` at x ${String(run.diedAt.x)}, y ${String(run.diedAt.y)}`) +
    `; ${String(run.kills)} of ${String(run.spawned.length)} killed; ${arrived}\n    arrived in order: ${order}`
  );
}

const NOTES =
  "Each wave is opened directly: the game's own wave planner starts it on its stage. " +
  'With the "drafted" build the player arrives with one upgrade for each wave before, picked from the game\'s ' +
  "draft by the watch player's scoring; tier-ups and anything bought are not part of it, so a real run arrives " +
  "stronger.\nNumbers are medians over the seeds, except the root and snare counts, which are totals. Damage " +
  "is attributed: the game does not record what hit the player, so a loss of health goes to a shot on the " +
  'player at that tick ("ranged shot": a shot a ranged enemy owns), else to an enemy touching the player, ' +
  'else to "unmarked". "*" marks an enemy that arrived with affixes.\n';

/** One table per stage, difficulty, weapon, build and player, a row per wave; `runs` adds a line for every run. */
export function formatWaveReport(results: readonly WaveResult[], runs = false): string {
  const blocks = groups(
    results,
    (run) => `${run.stage}|${run.difficulty}|${run.weapon}|${run.build}|${run.player}`,
  ).map((block) => {
    const first = block[0];
    if (first === undefined) return "";
    const byWave = groups(block, (run) => String(run.wave));
    const seeds = new Set(block.map((run) => run.seed)).size;
    return (
      `${first.stage}  difficulty ${first.difficulty}  weapon ${first.weapon}  build ${first.build}` +
      `  player ${first.player}  ${String(seeds)} ${seeds === 1 ? "seed" : "seeds"}` +
      `  upgrades ${middle(block.map((run) => run.upgrades))}\n` +
      table([HEAD, ...byWave.map((same) => waveRow(same[0]?.wave ?? 0, same))]) +
      (runs ? `\n${block.map(runLine).join("\n")}` : "")
    );
  });
  const broken = results.filter((run) => run.end === "broken");
  return (
    NOTES +
    (broken.length === 0
      ? ""
      : `\nBROKEN: ${broken.map((run) => `wave ${String(run.wave)} seed ${run.seed} (${run.reason ?? "no reason"})`).join("; ")}\n`) +
    `\n${blocks.join("\n\n")}\n`
  );
}
