import type { RunDifficulty, RunMode } from "./session";

export interface WaveLogEntry {
  readonly wave: number | "BOSS";
  readonly time: number;
  readonly kills: number;
  readonly peak: number;
}

export type PendingWaveReward = "boss" | "draft" | null;

export interface WaveClearState {
  readonly mode: RunMode;
  readonly diff: RunDifficulty;
  readonly wave: number;
  readonly isBossWave: boolean;
  readonly horde: boolean;
  readonly waveTime: number;
  readonly waveKills: number;
  readonly wavePeak: number;
  readonly runTime: number;
  readonly bossesBeaten: number;
  readonly damagedThisWave: boolean;
  readonly damagedThisStage: boolean;
  readonly clearTimer: number;
  readonly pendingReward: PendingWaveReward;
  readonly waveLog: readonly WaveLogEntry[];
}

export interface WaveClearInput {
  readonly state: WaveClearState;
  readonly dt: number;
  readonly waveLifecycleActive: boolean;
  readonly spawnQueueLength: number;
  readonly enemyCount: number;
  readonly achievementTracking: boolean;
  readonly playerOneHit: boolean;
  readonly ownedAbilityCount: number;
  readonly stageIndex: number;
  readonly stageCount: number;
  readonly currentStageAccent: string;
  readonly healEachWave: number;
  readonly waveHealBonus: number;
  readonly waveClearPause: number;
  readonly availableTierUpCount: number;
}

export type WaveClearIntent =
  | Readonly<{ type: "clear-wave-lifecycle" }>
  | Readonly<{ type: "backdrop-bloom"; color: string; strength: number; duration: number }>
  | Readonly<{ type: "ghost-wave"; wave: number; marker: "clear" }>
  | Readonly<{ type: "profile-max"; stat: string; value: number }>
  | Readonly<{ type: "profile-add"; stat: string; value: number }>
  | Readonly<{ type: "daily-bump"; challenge: string; value: number; operation?: "max" }>
  | Readonly<{ type: "horde-cleared"; waveTime: number }>
  | Readonly<{ type: "achievement-check" }>
  | Readonly<{ type: "stage-done" }>
  | Readonly<{ type: "heal-player"; amount: number }>
  | Readonly<{ type: "prepare-reward"; reward: Exclude<PendingWaveReward, null> }>
  | Readonly<{ type: "start-adventure-finale" }>
  | Readonly<{ type: "win-run" }>
  | Readonly<{ type: "exit-pointer-lock" }>
  | Readonly<{ type: "open-tier-up" }>
  | Readonly<{ type: "open-draft" }>;

export interface WaveClearResult {
  readonly state: WaveClearState;
  readonly intents: readonly WaveClearIntent[];
  readonly terminal: boolean;
}

function achievementIntents(input: WaveClearInput): WaveClearIntent[] {
  if (!input.achievementTracking) return [];
  const state = input.state;
  const intents: WaveClearIntent[] = [
    { type: "profile-max", stat: "bestWave", value: state.wave },
    { type: "profile-max", stat: "longestRun", value: Math.floor(state.runTime) },
    { type: "daily-bump", challenge: "wave", value: state.wave, operation: "max" },
  ];
  if (input.playerOneHit) intents.push({ type: "profile-max", stat: "oneHitWave", value: state.wave });
  if (!state.damagedThisWave) {
    intents.push(
      { type: "profile-add", stat: "noHitWaves", value: 1 },
      { type: "daily-bump", challenge: "nohit", value: 1 },
    );
  }
  intents.push({ type: "profile-max", stat: "abilitiesInRun", value: input.ownedAbilityCount });
  if (state.mode === "endless") {
    intents.push({ type: "profile-max", stat: "bestWaveEndless", value: state.wave });
    if (state.diff === "hard" && state.wave >= 50) intents.push({ type: "profile-max", stat: "wave50Hard", value: 1 });
    if (state.diff === "extreme" && state.wave >= 100) intents.push({ type: "profile-max", stat: "wave100Extreme", value: 1 });
    if (state.horde) intents.push({ type: "horde-cleared", waveTime: state.waveTime });
  }
  intents.push({ type: "achievement-check" });
  return intents;
}

function resolveTimer(
  state: WaveClearState,
  input: WaveClearInput,
  intents: WaveClearIntent[],
): WaveClearState {
  if (state.clearTimer <= 0) return state;
  const clearTimer = state.clearTimer - input.dt;
  if (clearTimer > 0) return { ...state, clearTimer };
  intents.push({ type: "exit-pointer-lock" });
  if (state.pendingReward === "boss" && input.availableTierUpCount > 0) intents.push({ type: "open-tier-up" });
  else intents.push({ type: "open-draft" });
  return { ...state, clearTimer: -1 };
}

export function planWaveClear(input: WaveClearInput): WaveClearResult {
  if (!Number.isFinite(input.dt) || input.dt < 0) throw new RangeError("dt must be finite and non-negative");
  let state = input.state;
  const intents: WaveClearIntent[] = [];
  const cleared = input.waveLifecycleActive && input.spawnQueueLength === 0 && input.enemyCount === 0;
  if (cleared) {
    const entry: WaveLogEntry = {
      wave: state.isBossWave ? "BOSS" : state.wave,
      time: state.waveTime,
      kills: state.waveKills,
      peak: state.wavePeak,
    };
    intents.push(
      { type: "clear-wave-lifecycle" },
      { type: "backdrop-bloom", color: input.currentStageAccent, strength: 0.14, duration: 0.8 },
      { type: "ghost-wave", wave: state.wave, marker: "clear" },
      ...achievementIntents(input),
    );
    state = { ...state, waveLog: [...state.waveLog, entry], damagedThisWave: false };

    if (state.isBossWave) {
      if (state.mode === "campaign" && input.stageIndex >= input.stageCount - 1) {
        intents.push({ type: "start-adventure-finale" });
        return { state, intents, terminal: true };
      }
      if (state.mode === "campaign" || state.mode === "bossonly" || state.mode === "gauntlet") {
        if (!input.playerOneHit) intents.push({ type: "heal-player", amount: input.healEachWave * 2 + input.waveHealBonus });
        if (state.mode === "bossonly" || state.mode === "gauntlet") state = { ...state, bossesBeaten: state.bossesBeaten + 1 };
        if (state.mode === "campaign" && input.achievementTracking) {
          intents.push({ type: "profile-add", stat: "stageClears", value: 1 });
          if (!state.damagedThisStage) intents.push({ type: "profile-add", stat: "noHitStages", value: 1 });
          intents.push({ type: "stage-done" }, { type: "achievement-check" });
          state = { ...state, damagedThisStage: false };
        }
        intents.push({ type: "prepare-reward", reward: "boss" });
        state = { ...state, pendingReward: "boss", clearTimer: input.waveClearPause * 1.6 };
      } else {
        intents.push({ type: "win-run" });
        return { state, intents, terminal: true };
      }
    } else {
      if (!input.playerOneHit) intents.push({ type: "heal-player", amount: input.healEachWave + input.waveHealBonus });
      intents.push({ type: "prepare-reward", reward: "draft" });
      state = { ...state, pendingReward: "draft", clearTimer: input.waveClearPause };
    }
  }
  state = resolveTimer(state, input, intents);
  return { state, intents, terminal: false };
}
