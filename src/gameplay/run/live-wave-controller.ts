import type { RandomSource } from "../../domain/random";
import type { EnemyPreset } from "../affixes";
import type { BossId, CampaignPoolEntry, EnemyKind, MiniBossId } from "./content-director";
import type { RunDifficulty, RunMode } from "./session";
import { scheduleWaveSpawn, type SpawnTuning } from "./spawn-scheduler";
import {
  activatePreparedWave,
  planNextWave,
  type WavePlanIntent,
  type WaveSpawnSpec,
  type WaveStage,
  type WaveTuning,
} from "./wave-planner";
import {
  planWaveClear,
  type PendingWaveReward,
  type WaveClearIntent,
  type WaveLogEntry,
} from "./wave-clear-planner";

export interface LiveWaveStageSource {
  readonly name: string;
  readonly boss: BossId;
  readonly pool?: readonly (CampaignPoolEntry | readonly [EnemyKind, number, number?])[];
}

export interface LiveWaveRun {
  mode: RunMode;
  diff: RunDifficulty;
  wave: number;
  diffHp: number;
  diffCount: number;
  bossOrder?: BossId[];
  bossIdx?: number;
  bossesBeaten?: number;
  curBoss?: BossId | null;
  isBossWave?: boolean;
  stage?: number | null;
  horde?: boolean;
  miniBoss?: MiniBossId | null;
  waveTag?: string;
  spawnQueue: WaveSpawnSpec[];
  spawnTimer: number;
  waveKinds?: EnemyKind[];
  pendingBossOutro: unknown;
  _biomeIdx?: number;
  waveTime: number;
  waveKills: number;
  wavePeak: number;
  mult: number;
  runTime: number;
  clearTimer: number;
  waveLog: WaveLogEntry[];
  _dmgThisWave: boolean;
  _dmgThisStage: boolean;
  mods: { owned: Readonly<Record<string, unknown>>; waveHeal?: number };
}

export interface LiveWaveTuning extends WaveTuning, SpawnTuning {
  readonly startDelay: number;
  readonly healEachWave: number;
  readonly waveClearPause: number;
}

export interface LiveWavePort {
  readonly run: () => LiveWaveRun | null;
  readonly tuning: () => LiveWaveTuning;
  readonly stages: readonly LiveWaveStageSource[];
  readonly presets: readonly EnemyPreset[];
  readonly random: RandomSource;
  readonly modeDefinition: (mode: RunMode) => Readonly<{ waves?: number; bossOnly?: boolean }>;
  readonly currentStage: () => Readonly<{ index: number; accent: string }>;
  readonly stageHasChapter: (index: number) => boolean;
  readonly chapterFlowActive: () => boolean;
  readonly lifecycle: Readonly<{
    hasPreparedWave: () => boolean;
    isWaveActive: () => boolean;
    pendingReward: () => PendingWaveReward;
  }>;
  readonly executePlanIntents: (intents: readonly WavePlanIntent[]) => void;
  readonly executeClearIntents: (intents: readonly WaveClearIntent[]) => void;
  readonly spawn: (spec: WaveSpawnSpec) => void;
  readonly enemyCount: () => number;
  readonly loreBusy: () => boolean;
  readonly achievementTracking: () => boolean;
  readonly playerOneHit: () => boolean;
  readonly availableTierUpCount: () => number;
}

function normalizeStages(stages: readonly LiveWaveStageSource[]): readonly WaveStage[] {
  return stages.map((stage) => ({
    name: stage.name,
    boss: stage.boss,
    pool: (stage.pool ?? []).map((entry) => {
      if (!isLegacyPoolTuple(entry)) return entry;
      return { kind: entry[0], weight: entry[1], unlockWave: entry[2] ?? 1 };
    }),
  }));
}

function isLegacyPoolTuple(
  entry: CampaignPoolEntry | readonly [EnemyKind, number, number?],
): entry is readonly [EnemyKind, number, number?] {
  return Array.isArray(entry);
}

export class LiveWaveController {
  readonly #port: LiveWavePort;
  readonly #stages: readonly WaveStage[];

  constructor(port: LiveWavePort) {
    this.#port = port;
    this.#stages = normalizeStages(port.stages);
  }

  startNextWave(): void {
    const run = this.#requireRun();
    const stage = this.#port.currentStage();
    const nextWave = run.wave + 1;
    const nextCampaignStage = run.mode === "campaign" ? Math.floor((nextWave - 1) / 10) : null;
    const startsCampaignChapter = nextCampaignStage !== null
      && (nextWave === 1 || nextCampaignStage !== stage.index)
      && this.#port.stageHasChapter(nextCampaignStage);
    const mode = this.#port.modeDefinition(run.mode);
    const tuning = this.#port.tuning();
    const plan = planNextWave({
      state: {
        mode: run.mode,
        wave: run.wave,
        diffHp: run.diffHp,
        diffCount: run.diffCount,
        bossOrder: run.bossOrder ?? [],
        bossIdx: run.bossIdx ?? 0,
        bossesBeaten: run.bossesBeaten ?? 0,
        curBoss: run.curBoss ?? null,
        currentStageIndex: stage.index,
        biomeIdx: run._biomeIdx ?? null,
        pendingBossOutro: run.pendingBossOutro,
      },
      tuning,
      stages: this.#stages,
      presets: this.#port.presets,
      random: this.#port.random,
      configuredWaves: mode.waves ?? 0,
      bossOnly: Boolean(mode.bossOnly),
      chapterFlowActive: this.#port.chapterFlowActive() || startsCampaignChapter,
      startDelay: tuning.startDelay,
      currentMultiplier: run.mult,
    });
    const next = plan.state;
    Object.assign(run, {
      wave: next.wave,
      bossOrder: [...next.bossOrder],
      bossIdx: next.bossIdx,
      bossesBeaten: next.bossesBeaten,
      curBoss: next.curBoss,
      isBossWave: next.isBossWave,
      stage: next.stage,
      horde: next.horde,
      miniBoss: next.miniBoss,
      waveTag: next.waveTag,
      spawnQueue: [...next.spawnQueue],
      waveKinds: [...next.waveKinds],
      pendingBossOutro: next.pendingBossOutro,
    });
    if (next.biomeIdx !== null) run._biomeIdx = next.biomeIdx;
    if (plan.spawnTimer !== null) run.spawnTimer = plan.spawnTimer;
    if (plan.waveTime !== null) run.waveTime = plan.waveTime;
    if (plan.waveKills !== null) run.waveKills = plan.waveKills;
    if (plan.wavePeak !== null) run.wavePeak = plan.wavePeak;
    this.#port.executePlanIntents(plan.intents);
  }

  activatePreparedWave(): void {
    const run = this.#port.run();
    if (run === null || !this.#port.lifecycle.hasPreparedWave()) return;
    const activation = activatePreparedWave(this.#port.tuning().startDelay, run.mult);
    run.spawnTimer = activation.spawnTimer;
    run.waveTime = activation.waveTime;
    run.waveKills = activation.waveKills;
    run.wavePeak = activation.wavePeak;
    this.#port.executePlanIntents(activation.intents);
  }

  update(dt: number): void {
    const run = this.#requireRun();
    const tuning = this.#port.tuning();
    const scheduled = scheduleWaveSpawn({
      state: {
        mode: run.mode,
        wave: run.wave,
        horde: Boolean(run.horde),
        spawnQueue: run.spawnQueue,
        spawnTimer: run.spawnTimer,
      },
      tuning,
      enemyCount: this.#port.enemyCount(),
      loreBusy: this.#port.loreBusy(),
      dt,
    });
    run.spawnQueue = [...scheduled.state.spawnQueue];
    run.spawnTimer = scheduled.state.spawnTimer;
    if (scheduled.spawned !== null) this.#port.spawn(scheduled.spawned);

    const stage = this.#port.currentStage();
    const cleared = planWaveClear({
      state: {
        mode: run.mode,
        diff: run.diff,
        wave: run.wave,
        isBossWave: Boolean(run.isBossWave),
        horde: Boolean(run.horde),
        waveTime: run.waveTime,
        waveKills: run.waveKills,
        wavePeak: run.wavePeak,
        runTime: run.runTime,
        bossesBeaten: run.bossesBeaten ?? 0,
        damagedThisWave: run._dmgThisWave,
        damagedThisStage: run._dmgThisStage,
        clearTimer: run.clearTimer,
        pendingReward: this.#port.lifecycle.pendingReward(),
        waveLog: run.waveLog,
      },
      dt,
      waveLifecycleActive: this.#port.lifecycle.isWaveActive(),
      spawnQueueLength: run.spawnQueue.length,
      enemyCount: this.#port.enemyCount(),
      achievementTracking: this.#port.achievementTracking(),
      playerOneHit: this.#port.playerOneHit(),
      ownedAbilityCount: Object.values(run.mods.owned).filter(Boolean).length,
      stageIndex: stage.index,
      stageCount: this.#stages.length,
      currentStageAccent: stage.accent,
      healEachWave: tuning.healEachWave,
      waveHealBonus: run.mods.waveHeal ?? 0,
      waveClearPause: tuning.waveClearPause,
      availableTierUpCount: this.#port.availableTierUpCount(),
    });
    run.clearTimer = cleared.state.clearTimer;
    run.waveLog = [...cleared.state.waveLog];
    run.bossesBeaten = cleared.state.bossesBeaten;
    run._dmgThisWave = cleared.state.damagedThisWave;
    run._dmgThisStage = cleared.state.damagedThisStage;
    this.#port.executeClearIntents(cleared.intents);
  }

  #requireRun(): LiveWaveRun {
    const run = this.#port.run();
    if (run === null) throw new Error("wave lifecycle requires an active run");
    return run;
  }
}
