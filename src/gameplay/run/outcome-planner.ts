import type { BeatRunBinding } from "./beat-run";
import type { SeedRaceRun } from "./seed-locked-draft";
import type { RunDifficulty, RunMode, RunWaveLogEntry } from "./session";
import type { GhostRunAssistance } from "./ghost-assistance";
import type { GauntletClear } from "../../domain/gauntlet-records";
import type { LeaderboardRef } from "../../domain/leaderboards";

/** How far a Gauntlet run got: trials cleared, the boss of the trial it ended in, ticks and hits. */
export interface GauntletProgress {
  readonly trialsCleared: number;
  readonly trialCount: number;
  /** The boss of the trial the run reached (the last one on a clear). */
  readonly boss: string;
  readonly ticks: number;
  readonly hits: number;
}

export interface GauntletResult extends GauntletProgress {
  readonly cleared: boolean;
  /** The personal best on this difficulty after this run. */
  readonly best: GauntletClear | null;
  readonly newBest: boolean;
}

export function gauntletRunCleared(progress: GauntletProgress | undefined): boolean {
  return progress !== undefined && progress.trialCount > 0 && progress.trialsCleared >= progress.trialCount;
}

/** A run's entry on one leaderboard: the board and what it records there. */
export interface RunLeaderboardEntry {
  readonly board: LeaderboardRef;
  readonly entry: Readonly<{ score: number; wave: number; time: number }>;
  /** The board whose published replay the run's kept record names as its share; exactly one entry per run. */
  readonly keptShare: boolean;
}

/**
 * The boards a finished run enters: its mode's score board, and on a Gauntlet clear the fastest-clear
 * board with the clear's simulation ticks as its score (trials cleared in the wave column).
 */
export function runLeaderboardEntries(run: OutcomeRunState): readonly RunLeaderboardEntry[] {
  const entries: RunLeaderboardEntry[] = [
    {
      board: { kind: "score", mode: run.mode, difficulty: run.diff },
      entry: { score: run.score, wave: run.wave, time: run.runTime },
      keptShare: true,
    },
  ];
  if (run.gauntlet !== undefined && gauntletRunCleared(run.gauntlet))
    entries.push({
      board: { kind: "gauntlet-clear", mode: run.mode, difficulty: run.diff },
      entry: { score: run.gauntlet.ticks, wave: run.gauntlet.trialsCleared, time: run.runTime },
      keptShare: false,
    });
  return Object.freeze(entries);
}

export type OutcomeWaveLogEntry = RunWaveLogEntry;

export interface OutcomeRunState {
  readonly ghostAssistance?: GhostRunAssistance;
  readonly beatThisRun?: BeatRunBinding;
  readonly seedRace?: SeedRaceRun;
  readonly mode: RunMode;
  readonly diff: RunDifficulty;
  readonly wave: number;
  readonly score: number;
  readonly runTime: number;
  readonly waveTime: number;
  readonly waveKills: number;
  readonly wavePeak: number;
  readonly waveLog: readonly OutcomeWaveLogEntry[];
  readonly weaponId: string;
  readonly damagedThisRun: boolean;
  readonly gauntlet?: GauntletProgress;
}

type OutcomeRunSource = Omit<OutcomeRunState, "damagedThisRun" | "gauntlet"> &
  Readonly<{
    _dmgThisRun?: boolean;
    runTicks?: number;
    hitsTaken?: number;
    bossesBeaten?: number;
    bossOrder?: readonly string[];
  }>;

function gauntletProgress(run: OutcomeRunSource): GauntletProgress | undefined {
  if (run.mode !== "gauntlet") return undefined;
  const order = run.bossOrder ?? [];
  const trialsCleared = Math.min(order.length, run.bossesBeaten ?? 0);
  return Object.freeze({
    trialsCleared,
    trialCount: order.length,
    boss: order[Math.min(trialsCleared, order.length - 1)] ?? "",
    ticks: run.runTicks ?? 0,
    hits: run.hitsTaken ?? 0,
  });
}

export function snapshotOutcomeRun(run: OutcomeRunSource): OutcomeRunState {
  const gauntlet = gauntletProgress(run);
  return Object.freeze({
    ...(gauntlet === undefined ? {} : { gauntlet }),
    ...(run.ghostAssistance === undefined ? {} : { ghostAssistance: run.ghostAssistance }),
    ...(run.beatThisRun === undefined ? {} : { beatThisRun: run.beatThisRun }),
    ...(run.seedRace === undefined ? {} : { seedRace: run.seedRace }),
    mode: run.mode,
    diff: run.diff,
    wave: run.wave,
    score: run.score,
    runTime: run.runTime,
    waveTime: run.waveTime,
    waveKills: run.waveKills,
    wavePeak: run.wavePeak,
    waveLog: run.waveLog,
    weaponId: run.weaponId,
    damagedThisRun: Boolean(run._dmgThisRun),
  });
}

export function appendDefeatWave(
  waveLog: readonly OutcomeWaveLogEntry[],
  waveActive: boolean,
  run: Pick<OutcomeRunState, "wave" | "waveTime" | "waveKills" | "wavePeak">,
): readonly OutcomeWaveLogEntry[] {
  if (!waveActive) return Object.freeze([...waveLog]);
  return Object.freeze([
    ...waveLog,
    Object.freeze({
      wave: run.wave,
      time: run.waveTime,
      kills: run.waveKills,
      peak: run.wavePeak,
      died: true,
    }),
  ]);
}

export interface PreparedVictory {
  readonly isNew: boolean;
  readonly earned: number;
  readonly coins: number;
  /** A cleared Gauntlet beat the personal best on its difficulty. */
  readonly gauntletNewBest?: boolean;
}

export type VictoryProgressionIntent =
  | Readonly<{ type: "profile-add"; stat: string; value: number }>
  | Readonly<{ type: "profile-max"; stat: string; value: number }>
  | Readonly<{ type: "daily-bump"; challenge: string; value: number }>
  | Readonly<{ type: "mark-weapon-win"; weaponId: string }>
  | Readonly<{ type: "set-profile-reward"; reward: "restoredBladeTrail" | "campaignEmblem" }>
  | Readonly<{ type: "mark-adventure-difficulty"; difficulty: RunDifficulty }>
  | Readonly<{ type: "achievement-check" }>
  | Readonly<{ type: "cloud-log"; payload: Readonly<Record<string, unknown>> }>
  | Readonly<{ type: "finish-recording"; won: true }>;

export function planVictoryProgression(
  input: Readonly<{
    run: OutcomeRunState;
    campaign: boolean;
    achievementTracking: boolean;
    earned: number;
    economy: Readonly<Record<string, unknown>>;
  }>,
): readonly VictoryProgressionIntent[] {
  if (!input.achievementTracking) return Object.freeze([]);
  const run = input.run;
  const intents: VictoryProgressionIntent[] = [
    { type: "profile-add", stat: "runs", value: 1 },
    { type: "daily-bump", challenge: "runs", value: 1 },
    { type: "mark-weapon-win", weaponId: run.weaponId || "sword" },
  ];
  if (input.campaign) {
    intents.push(
      { type: "profile-add", stat: "campaignClears", value: 1 },
      { type: "set-profile-reward", reward: "restoredBladeTrail" },
      { type: "set-profile-reward", reward: "campaignEmblem" },
    );
    if (run.diff === "hard") intents.push({ type: "profile-max", stat: "clearAdvHard", value: 1 });
    if (run.diff === "extreme") intents.push({ type: "profile-max", stat: "clearAdvExtreme", value: 1 });
    if (!run.damagedThisRun) intents.push({ type: "profile-max", stat: "clearAdvNoHit", value: 1 });
    if (run.runTime < 900) intents.push({ type: "profile-max", stat: "speedrunUnder15", value: 1 });
    intents.push({ type: "mark-adventure-difficulty", difficulty: run.diff });
  }
  intents.push(
    { type: "achievement-check" },
    {
      type: "cloud-log",
      payload: Object.freeze({
        mode: run.mode,
        diff: run.diff,
        wave: run.wave,
        score: run.score,
        time: Math.round(run.runTime),
        peak: run.wavePeak,
        won: true,
        campaign: input.campaign,
        ...input.economy,
      }),
    },
    { type: "finish-recording", won: true },
  );
  return Object.freeze(intents);
}

export interface RunResultInfo {
  readonly wave: number;
  readonly score: number;
  readonly time: number;
  readonly log: readonly OutcomeWaveLogEntry[];
  readonly best: Readonly<{ wave: number; score: number; time: number }>;
  readonly isNew: boolean;
  readonly earned: number;
  readonly coins: number;
  readonly win?: true;
  readonly campaign?: boolean;
  readonly diff?: RunDifficulty;
  readonly gauntlet?: GauntletResult;
}

export function buildRunResult(
  run: OutcomeRunState,
  options: Readonly<{
    best: Readonly<{ wave: number; score: number; time: number }>;
    prepared: PreparedVictory;
    victory: boolean;
    campaign?: boolean;
    gauntletBest?: GauntletClear | null;
  }>,
): RunResultInfo {
  const gauntlet = run.gauntlet;
  return Object.freeze({
    ...(gauntlet === undefined
      ? {}
      : {
          gauntlet: Object.freeze({
            ...gauntlet,
            cleared: gauntletRunCleared(gauntlet),
            best: options.gauntletBest ?? null,
            newBest: options.prepared.gauntletNewBest === true,
          }),
        }),
    wave: run.wave,
    score: run.score,
    time: run.runTime,
    log: Object.freeze([...run.waveLog]),
    best: Object.freeze({ ...options.best }),
    isNew: options.prepared.isNew,
    earned: options.prepared.earned,
    coins: options.prepared.coins,
    ...(options.victory ? { win: true as const, campaign: Boolean(options.campaign), diff: run.diff } : {}),
  });
}

export interface PendingFinaleRecord extends RunResultInfo {
  readonly mode: RunMode;
  readonly diff: RunDifficulty;
  readonly weapon: string;
}

export function buildPendingFinale(
  run: OutcomeRunState,
  best: Readonly<{ wave: number; score: number; time: number }>,
  prepared: PreparedVictory,
): PendingFinaleRecord {
  return Object.freeze({
    ...buildRunResult(run, { best, prepared, victory: false }),
    mode: run.mode,
    diff: run.diff,
    weapon: run.weaponId,
  });
}
