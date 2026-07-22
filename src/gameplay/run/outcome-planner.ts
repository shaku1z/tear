import type { RunDifficulty, RunMode, RunWaveLogEntry } from "./session";

export type OutcomeWaveLogEntry = RunWaveLogEntry;

export interface OutcomeRunState {
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
}

export function snapshotOutcomeRun(
  run: Omit<OutcomeRunState, "damagedThisRun"> & Readonly<{ _dmgThisRun?: boolean }>,
): OutcomeRunState {
  return Object.freeze({
    mode: run.mode, diff: run.diff, wave: run.wave, score: run.score, runTime: run.runTime,
    waveTime: run.waveTime, waveKills: run.waveKills, wavePeak: run.wavePeak,
    waveLog: run.waveLog, weaponId: run.weaponId, damagedThisRun: Boolean(run._dmgThisRun),
  });
}

export interface RecordingLoadoutEntry { readonly id: string; readonly tier: number; readonly count: number }

export interface RecordingSummary {
  readonly mode: RunMode;
  readonly diff: RunDifficulty;
  readonly wave: number;
  readonly score: number;
  readonly time: number;
  readonly won: boolean;
  readonly kills: number;
  readonly peak: number;
  readonly name: string;
  readonly stage: number;
  readonly weapon: string;
  readonly loadout: readonly Readonly<{ id: string; tier: number; n: number }>[];
  readonly authoritativeTick: number;
  readonly authoritativeStateHash: string;
}

export function buildRecordingSummary(
  run: OutcomeRunState,
  options: Readonly<{
    won: boolean;
    displayName: string;
    stageIndex: number;
    loadout: readonly RecordingLoadoutEntry[];
    authoritativeTick?: number;
    authoritativeStateHash?: string;
  }>,
): RecordingSummary {
  return Object.freeze({
    mode: run.mode,
    diff: run.diff,
    wave: run.wave,
    score: run.score,
    time: Math.round(run.runTime),
    won: options.won,
    kills: run.waveLog.reduce((sum, entry) => sum + (entry.kills || 0), 0),
    peak: run.waveLog.reduce((highest, entry) => Math.max(highest, entry.peak || 1), 1),
    name: options.displayName,
    stage: options.stageIndex,
    weapon: run.weaponId,
    loadout: Object.freeze(options.loadout.map((entry) => Object.freeze({ id: entry.id, tier: entry.tier, n: entry.count }))),
    authoritativeTick: options.authoritativeTick ?? 0,
    authoritativeStateHash: options.authoritativeStateHash ?? "",
  });
}

export function appendDefeatWave(
  waveLog: readonly OutcomeWaveLogEntry[],
  waveActive: boolean,
  run: Pick<OutcomeRunState, "wave" | "waveTime" | "waveKills" | "wavePeak">,
): readonly OutcomeWaveLogEntry[] {
  if (!waveActive) return Object.freeze([...waveLog]);
  return Object.freeze([...waveLog, Object.freeze({
    wave: run.wave,
    time: run.waveTime,
    kills: run.waveKills,
    peak: run.wavePeak,
    died: true,
  })]);
}

export interface PreparedVictory { readonly isNew: boolean; readonly earned: number; readonly coins: number }

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

export function planVictoryProgression(input: Readonly<{
  run: OutcomeRunState;
  campaign: boolean;
  achievementTracking: boolean;
  earned: number;
  economy: Readonly<Record<string, unknown>>;
}>): readonly VictoryProgressionIntent[] {
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
    { type: "cloud-log", payload: Object.freeze({
      mode: run.mode, diff: run.diff, wave: run.wave, score: run.score,
      time: Math.round(run.runTime), peak: run.wavePeak, won: true, campaign: input.campaign,
      ...input.economy,
    }) },
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
}

export function buildRunResult(
  run: OutcomeRunState,
  options: Readonly<{
    best: Readonly<{ wave: number; score: number; time: number }>;
    prepared: PreparedVictory;
    victory: boolean;
    campaign?: boolean;
  }>,
): RunResultInfo {
  return Object.freeze({
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
