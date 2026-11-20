import { secondsOf } from "./boss-fight";
import type { BossPlayerId } from "./boss-player";
import { sliceOf } from "./boss-report";
import { groups, median, table } from "./report-text";
import { playRun, runScenario, type RunRequest, type RunResult, type RunWave } from "./run-play";

export interface RunReportRequest {
  readonly modes: readonly string[];
  readonly difficulties: readonly RunRequest["difficulty"][];
  readonly weapons: readonly RunRequest["weapon"][];
  readonly seeds: readonly string[];
  readonly players: readonly BossPlayerId[];
  readonly maxTicks: number;
}

export function runRequests(request: RunReportRequest): readonly RunRequest[] {
  return request.modes.flatMap((mode) =>
    request.difficulties.flatMap((difficulty) =>
      request.players.flatMap((player) =>
        request.weapons.flatMap((weapon) =>
          request.seeds.map((seed) => ({ mode, difficulty, weapon, seed, player, maxTicks: request.maxTicks })),
        ),
      ),
    ),
  );
}

/**
 * The runs a request asks for, each admitted by the game's own check: a mistyped mode, weapon, difficulty or
 * player is refused here, by name, before any run is played.
 */
export function admitRunReport(request: RunReportRequest): readonly RunRequest[] {
  const requests = runRequests(request);
  for (const run of requests) runScenario(run);
  return requests;
}

/** Plays the runs asked for, or one worker's share of them (`sliceOf`). */
export function playRunReport(
  request: RunReportRequest,
  share?: Readonly<{ index: number; of: number }>,
): readonly RunResult[] {
  const requests = admitRunReport(request);
  const own = share === undefined ? requests : sliceOf(requests, share.index, share.of);
  return own.map((run) => playRun(run));
}

const seconds = (ticks: number | undefined): string => (ticks === undefined ? "-" : secondsOf(ticks).toFixed(1));
const middle = (values: readonly number[]): string => median(values)?.toFixed(0) ?? "-";

/** Where the runs ended: each wave a run ended in with how many did, lowest wave first. */
function endings(runs: readonly RunResult[]): string {
  const ended = runs.filter((run) => run.end !== "won");
  return groups(
    [...ended].sort((first, second) => first.endWave - second.endWave),
    (run) => String(run.endWave),
  )
    .map((same) => `wave ${String(same[0]?.endWave ?? 0)} x${String(same.length)}`)
    .join(", ");
}

function weaponRow(runs: readonly RunResult[]): readonly string[] {
  const picks = runs.map((run) => Object.values(run.upgrades).reduce((total, count) => total + count, 0));
  return [
    runs[0]?.weapon ?? "",
    `${String(runs.filter((run) => run.end === "won").length)}/${String(runs.length)}`,
    middle(runs.map((run) => run.endWave)),
    `${String(Math.min(...runs.map((run) => run.endWave)))} to ${String(Math.max(...runs.map((run) => run.endWave)))}`,
    seconds(median(runs.map((run) => run.ticks))),
    middle(picks),
    endings(runs) || "-",
  ];
}

function waveRow(runs: number, waves: readonly RunWave[]): readonly string[] {
  const cleared = waves.filter((wave) => wave.cleared);
  return [
    String(waves[0]?.wave ?? ""),
    `${String(waves.length)}/${String(runs)}`,
    `${String(cleared.length)}/${String(waves.length)}`,
    seconds(median(cleared.map((wave) => wave.ticks))),
    middle(waves.map((wave) => wave.damageTaken)),
    middle(waves.map((wave) => wave.hitsTaken)),
    middle(waves.map((wave) => wave.healthAtStart)),
    middle(cleared.map((wave) => wave.healthAtEnd)),
  ];
}

const NOTES =
  "Each run starts at wave 1 and is played as a player's run goes: the scripted player drafts from what the " +
  "game offers after each wave and skips each story chapter.\nA run ends where the scripted player is " +
  "defeated, so these tables show how far that player gets and what each wave costs it, not how far a person " +
  "gets. Numbers are medians over the runs that reached the wave. Clear time is the game's own, from its wave " +
  "log. Health cost is the health lost in the wave, whatever was won back.\n";

/**
 * One block per mode, difficulty and player: a row per weapon with where its runs ended, then a row per wave
 * over every weapon and seed.
 */
export function formatRunReport(results: readonly RunResult[]): string {
  const blocks = groups(results, (run) => `${run.mode}|${run.difficulty}|${run.player}`).map((block) => {
    const first = block[0];
    if (first === undefined) return "";
    const seeds = new Set(block.map((run) => run.seed)).size;
    const byWave = groups(
      block.flatMap((run) => run.waves),
      (wave) => String(wave.wave),
    );
    return (
      `${first.mode}  difficulty ${first.difficulty}  player ${first.player}` +
      `  ${String(seeds)} ${seeds === 1 ? "seed" : "seeds"}\n` +
      table([
        ["weapon", "won", "end wave", "range", "run s", "upgrades", "runs ended in"],
        ...groups(block, (run) => run.weapon).map(weaponRow),
      ]) +
      "\n" +
      table([
        ["wave", "reached", "cleared", "clear s", "health cost", "hits", "health in", "health out"],
        ...byWave.map((waves) => waveRow(block.length, waves)),
      ])
    );
  });
  const broken = results.filter((run) => run.end === "broken");
  const limited = results.filter((run) => run.end === "time limit").length;
  return (
    NOTES +
    (broken.length === 0
      ? ""
      : `\nBROKEN: ${broken
          .map((run) => `${run.mode} ${run.difficulty} ${run.weapon} seed ${run.seed} (${run.reason ?? "no reason"})`)
          .join("; ")}\n`) +
    (limited === 0 ? "" : `\n${String(limited)} of ${String(results.length)} runs were stopped by the time limit.\n`) +
    `\n${blocks.join("\n\n")}\n`
  );
}
