import type { EnemyPreset } from "../affixes";
import type { RandomSource } from "../../domain/random";
import {
  bossName,
  PUBLISHED_ENEMY_IDENTITY_IDS,
  pickEnemyKind,
  pickMiniBoss,
  shuffledBossRoster,
  type BossId,
  type CampaignPoolEntry,
  type EnemyKind,
  type MiniBossId,
} from "./content-director";
import { bossStageOwner } from "./boss-definitions";
import type { RunMode } from "./session";
import type { StageId } from "../stages";
import { campaignStageCurve } from "./campaign-stage-curve";
import { eligibleCompositionPool, emptyCompositionBudgetState, recordCompositionKind } from "./composition-budget";
import { describeWave, openingGrace } from "./wave-rules";
import { scriptedWave } from "./wave-script";
import { GAUNTLET_RULES, gauntletEnemyScale, gauntletRound, gauntletWave } from "./gauntlet-trials";

export interface WaveTuning {
  readonly firstWaveCount: number;
  readonly countPerWave: number;
  readonly hpScalePerWave: number;
  readonly stageHpStep: number;
  readonly inStageHp: number;
  readonly stageDmgStep: number;
  readonly inStageDmg: number;
  readonly stageCountStep: number;
}

export interface WaveStage {
  readonly id: StageId;
  readonly name: string;
  readonly boss: BossId;
  readonly pool: readonly CampaignPoolEntry[];
}

export interface WaveSpawnSpec {
  readonly type: EnemyKind | "boss" | "miniboss";
  readonly bossId?: MiniBossId;
  readonly hpScale?: number;
  readonly dmgScale?: number;
  readonly preset?: EnemyPreset;
  /** Arrives without affixes: the spawn step skips its affix roll. Set on the enemies a wave script lists. */
  readonly plain?: true;
}

export interface WavePlanningState {
  readonly mode: RunMode;
  readonly wave: number;
  readonly diffHp: number;
  readonly diffCount: number;
  readonly bossOrder: readonly BossId[];
  readonly bossIdx: number;
  readonly bossesBeaten: number;
  readonly curBoss: BossId | null;
  readonly currentStageIndex: number;
  readonly biomeIdx: number | null;
  readonly pendingBossOutro: unknown;
}

export interface PlannedWaveState extends WavePlanningState {
  readonly isBossWave: boolean;
  readonly stage: number | null;
  readonly horde: boolean;
  readonly miniBoss: MiniBossId | null;
  readonly waveTag: string;
  readonly curBoss: BossId | null;
  readonly spawnQueue: readonly WaveSpawnSpec[];
  readonly waveKinds: readonly EnemyKind[];
}

export type WavePlanIntent =
  | Readonly<{ type: "begin-wipe" }>
  | Readonly<{ type: "load-stage"; stageIndex: number }>
  | Readonly<{ type: "set-stage-banner"; duration: number; name: string }>
  | Readonly<{ type: "begin-campaign-chapter"; stageIndex: number; priorBossOutro: unknown }>
  | Readonly<{ type: "ghost-wave"; wave: number; marker: "start" | "boss" }>
  | Readonly<{ type: "prepare-wave"; wave: number; boss: boolean; deferred: boolean }>
  | Readonly<{ type: "activate-wave" }>
  | Readonly<{ type: "show-wave-banner" }>
  | Readonly<{ type: "play-wave-sfx" }>;

export interface PlanNextWaveOptions {
  readonly state: WavePlanningState;
  readonly tuning: WaveTuning;
  readonly stages: readonly WaveStage[];
  /** Authored homes available only to an explicitly selected engineering boss launch. */
  readonly bossOnlyStages?: readonly WaveStage[];
  readonly presets: readonly EnemyPreset[];
  readonly random: RandomSource;
  readonly configuredWaves?: number;
  readonly bossOnly?: boolean;
  readonly chapterFlowActive?: boolean;
  readonly startDelay: number;
  readonly currentMultiplier: number;
}

export interface PlannedWave {
  readonly state: PlannedWaveState;
  readonly spawnTimer: number | null;
  readonly waveTime: number | null;
  readonly waveKills: number | null;
  readonly wavePeak: number | null;
  /** Seconds of opening grace this wave has once it is live (see `openingGrace`). */
  readonly grace: number;
  readonly activationDeferred: boolean;
  readonly intents: readonly WavePlanIntent[];
}

export function stageAt(stages: readonly WaveStage[], index: number): WaveStage {
  if (stages.length === 0) throw new RangeError("at least one stage is required");
  const stage = stages[((index % stages.length) + stages.length) % stages.length];
  if (stage === undefined) throw new RangeError("stage index escaped configured stages");
  return stage;
}

function nextBossOrder(state: WavePlanningState, random: RandomSource): readonly [readonly BossId[], number] {
  return state.bossIdx >= state.bossOrder.length ? [shuffledBossRoster(random), 0] : [state.bossOrder, state.bossIdx];
}

function regularWaveQueue(
  state: WavePlanningState,
  wave: number,
  stageIndex: number | null,
  horde: boolean,
  miniBoss: MiniBossId | null,
  options: PlanNextWaveOptions,
): readonly WaveSpawnSpec[] {
  const tuning = options.tuning;
  const trial = state.mode === "gauntlet" ? gauntletWave(wave) : null;
  const round = trial?.round == null ? null : gauntletRound(trial.round);
  const localWave =
    round !== null ? round.localWave : state.mode === "endless" ? ((wave - 1) % 5) + 1 : ((wave - 1) % 10) + 1;
  let count: number;
  let hpScale: number;
  let dmgScale = 1;
  if (trial !== null && round !== null) {
    // A Gauntlet round: the stage pool at the round's local wave, scaled by the trial index only.
    const scale = gauntletEnemyScale(trial.trial);
    count = tuning.firstWaveCount + Math.floor((localWave - 1) * tuning.countPerWave) + round.extraEnemies;
    hpScale = (1 + (localWave - 1) * tuning.hpScalePerWave) * scale.health;
    dmgScale = scale.damage;
  } else if (state.mode === "campaign") {
    if (stageIndex === null) throw new Error("campaign wave is missing its stage curve identity");
    const curve = campaignStageCurve(stageAt(options.stages, stageIndex).id);
    count = tuning.firstWaveCount + Math.floor((localWave - 1) * tuning.countPerWave) + curve.countAdd;
    hpScale = curve.health * (1 + (localWave - 1) * tuning.inStageHp);
    dmgScale = curve.damage * (1 + (localWave - 1) * tuning.inStageDmg);
  } else {
    count = tuning.firstWaveCount + Math.floor((wave - 1) * tuning.countPerWave);
    hpScale = 1 + (wave - 1) * tuning.hpScalePerWave;
    if (state.mode === "endless") {
      count += Math.floor(Math.max(0, wave - 8) * 0.4);
      if (miniBoss !== null) count = Math.floor(count * 0.5);
      if (horde) {
        count = Math.round(count * 1.8);
        hpScale *= 0.6;
        dmgScale = 0.9;
      }
    }
  }
  hpScale *= state.diffHp || 1;
  count = Math.max(1, Math.round(count * (state.diffCount || 1)));

  const queue: WaveSpawnSpec[] = [];
  if (miniBoss !== null) queue.push({ type: "miniboss", bossId: miniBoss });
  const stageOwnsPool = state.mode === "campaign" || state.mode === "endless" || state.mode === "gauntlet";
  const contentStage = stageOwnsPool && stageIndex !== null ? stageAt(options.stages, stageIndex) : null;
  const contentCurve = contentStage === null ? undefined : campaignStageCurve(contentStage.id);
  const composition = contentCurve?.composition;
  // The stage's written wave: these arrive first and last, plain, and the pool fills the places between.
  const scripted = scriptedWave(contentCurve?.waves, localWave);
  const plain = (kind: EnemyKind): WaveSpawnSpec => ({ type: kind, hpScale, dmgScale, plain: true });
  const sandboxPool: readonly CampaignPoolEntry[] | null =
    state.mode === "sandbox" ? PUBLISHED_ENEMY_IDENTITY_IDS.map((kind) => ({ kind, weight: 1, unlockWave: 1 })) : null;
  const authoredPool = contentStage?.pool ?? sandboxPool;
  const unlockedAuthoredPool = authoredPool?.filter((entry) => localWave >= entry.unlockWave) ?? null;
  const availableAuthoredPool =
    authoredPool === null
      ? null
      : unlockedAuthoredPool !== null && unlockedAuthoredPool.length > 0
        ? unlockedAuthoredPool
        : authoredPool;
  let compositionState = emptyCompositionBudgetState();
  // The scripted enemies are counted before the fill, so the fill stays inside what the budget has left.
  if (composition !== undefined)
    for (const kind of [...scripted.first, ...scripted.last])
      compositionState = recordCompositionKind(composition, compositionState, kind);
  queue.push(...scripted.first.map(plain));
  const fill = Math.max(0, count - scripted.first.length - scripted.last.length);
  for (let index = 0; index < fill; index += 1) {
    const eligiblePool =
      contentStage === null || composition === undefined
        ? availableAuthoredPool
        : eligibleCompositionPool(availableAuthoredPool ?? [], composition, localWave, compositionState);
    if (contentStage !== null && (eligiblePool?.length ?? 0) === 0) {
      throw new RangeError(`${contentStage.id} composition budget excludes every available enemy`);
    }
    const stageTypes = eligiblePool?.map((entry) => entry.kind) ?? null;
    if (round === null && wave >= 4 && options.random.next() < 0.15) {
      const candidates =
        stageTypes === null
          ? options.presets
          : options.presets.filter((preset) => stageTypes.includes(preset.type as EnemyKind));
      if (candidates.length > 0) {
        const preset = candidates[Math.floor(options.random.next() * candidates.length)];
        if (preset !== undefined) {
          queue.push({ type: preset.type as EnemyKind, hpScale, dmgScale, preset });
          if (composition !== undefined)
            compositionState = recordCompositionKind(composition, compositionState, preset.type as EnemyKind);
          continue;
        }
      }
    }
    const contentWave = state.mode === "sandbox" ? 99 : wave;
    const kind =
      eligiblePool === null
        ? pickEnemyKind(contentWave, options.random)
        : pickEnemyKind(contentWave, options.random, eligiblePool, localWave);
    queue.push({ type: kind, hpScale, dmgScale });
    if (composition !== undefined) compositionState = recordCompositionKind(composition, compositionState, kind);
  }
  queue.push(...scripted.last.map(plain));
  // Gatekeepers: the round's elites, each a stage enemy with exactly one affix.
  for (let index = 0; index < (round?.gatekeepers ?? 0); index += 1) {
    const eligible =
      contentStage === null || composition === undefined
        ? availableAuthoredPool
        : eligibleCompositionPool(availableAuthoredPool ?? [], composition, localWave, compositionState);
    const kind =
      eligible === null || eligible.length === 0
        ? pickEnemyKind(wave, options.random)
        : pickEnemyKind(wave, options.random, eligible, localWave);
    queue.push({ type: kind, hpScale, dmgScale, preset: { type: kind, affixes: [GAUNTLET_RULES.gatekeeperAffix] } });
    if (composition !== undefined) compositionState = recordCompositionKind(composition, compositionState, kind);
  }
  return queue;
}

/**
 * One Gauntlet wave: the trial's boss from the run's trial order, its home stage, and on the
 * trial's first wave the stage load and the trial card.
 */
function planGauntletTrialWave(
  wave: number,
  bossOrder: readonly BossId[],
  stages: readonly WaveStage[],
  intents: WavePlanIntent[],
): Readonly<{ curBoss: BossId; stage: number; bossIdx: number; boss: boolean; opensTrial: boolean }> {
  const trial = gauntletWave(wave);
  const curBoss = bossOrder[trial.trial];
  if (curBoss === undefined) throw new Error(`the Gauntlet has no trial ${String(trial.trial + 1)}`);
  const stage = stages.findIndex((candidate) => candidate.boss === curBoss);
  if (stage < 0) throw new Error(`${curBoss} has no home stage in the Gauntlet`);
  if (trial.opensTrial) {
    if (wave > 1) intents.push({ type: "begin-wipe" });
    intents.push(
      { type: "load-stage", stageIndex: stage },
      { type: "set-stage-banner", duration: GAUNTLET_RULES.trialCardSeconds, name: stageAt(stages, stage).name },
    );
  }
  return { curBoss, stage, bossIdx: trial.trial + 1, boss: trial.boss, opensTrial: trial.opensTrial };
}

export function planNextWave(options: PlanNextWaveOptions): PlannedWave {
  const prior = options.state;
  const wave = prior.wave + 1;
  const description = describeWave({
    mode: prior.mode,
    wave,
    ...(options.configuredWaves === undefined ? {} : { configuredWaves: options.configuredWaves }),
    ...(options.bossOnly === undefined ? {} : { bossOnly: options.bossOnly }),
  });
  const intents: WavePlanIntent[] = [];
  let stage: number | null = null;
  let biomeIdx = prior.biomeIdx;
  let horde = false;
  let miniBoss: MiniBossId | null = null;
  let waveTag = "";
  let bossOrder = prior.bossOrder;
  let bossIdx = prior.bossIdx;
  let curBoss: BossId | null = prior.curBoss;

  if (prior.mode === "campaign") {
    stage = description.campaignStage;
    if (stage === null) throw new Error("campaign wave is missing its stage");
    if (wave === 1 || stage !== prior.currentStageIndex) {
      if (wave > 1) intents.push({ type: "begin-wipe" });
      const selectedStage = stageAt(options.stages, stage);
      intents.push(
        { type: "load-stage", stageIndex: stage },
        { type: "set-stage-banner", duration: 0, name: selectedStage.name },
        { type: "begin-campaign-chapter", stageIndex: stage, priorBossOutro: prior.pendingBossOutro },
      );
      biomeIdx = stage;
    }
  } else if (prior.mode === "gauntlet") {
    const trial = planGauntletTrialWave(wave, bossOrder, options.stages, intents);
    ({ curBoss, stage } = trial);
    if (trial.opensTrial) biomeIdx = trial.stage;
    if (trial.boss) {
      bossIdx = trial.bossIdx;
      waveTag = bossName(trial.curBoss);
    }
  } else if (prior.mode === "endless") {
    const nextBiome = description.endlessBiome;
    if (nextBiome === null) throw new Error("endless-like wave is missing its biome");
    stage = nextBiome;
    if (wave === 1 || nextBiome !== prior.biomeIdx) {
      if (wave > 1) intents.push({ type: "begin-wipe" });
      const selectedStage = stageAt(options.stages, nextBiome);
      intents.push(
        { type: "load-stage", stageIndex: nextBiome },
        { type: "set-stage-banner", duration: 2.6, name: selectedStage.name },
      );
      biomeIdx = nextBiome;
    }
    if (description.bossWave) {
      [bossOrder, bossIdx] = nextBossOrder(prior, options.random);
      curBoss = bossOrder[bossIdx] ?? null;
      if (curBoss === null) throw new Error("boss roster must not be empty");
      bossIdx += 1;
      waveTag = bossName(curBoss);
    } else if (description.miniBossWave) {
      miniBoss = pickMiniBoss(options.random);
      waveTag = `MINI-BOSS  ·  ${bossName(miniBoss)}`;
    } else if (description.hordeWave) {
      horde = true;
      waveTag = "⚠  HORDE";
    }
  }

  if (prior.mode === "bossonly") {
    [bossOrder, bossIdx] = nextBossOrder(prior, options.random);
    curBoss = bossOrder[bossIdx] ?? null;
    if (curBoss === null) throw new Error("boss roster must not be empty");
    bossIdx += 1;
    const home = bossStageOwner(curBoss);
    const homeBiome = (options.bossOnlyStages ?? options.stages).findIndex((candidate) => candidate.boss === home);
    stage = homeBiome < 0 ? 0 : homeBiome;
    if (wave > 1) intents.push({ type: "begin-wipe" });
    intents.push(
      { type: "load-stage", stageIndex: stage },
      { type: "set-stage-banner", duration: 2.4, name: bossName(curBoss) || "BOSS" },
    );
  }

  const spawnQueue = description.bossWave
    ? [{ type: "boss" } as const]
    : regularWaveQueue(prior, wave, stage, horde, miniBoss, options);
  const attackKinds = new Set<EnemyKind>(["charger", "ranged", "flyer", "bomber", "armored"]);
  const waveKinds = [
    ...new Set(
      spawnQueue
        .map((spec) => spec.type)
        .filter((type): type is EnemyKind => type !== "boss" && type !== "miniboss" && attackKinds.has(type)),
    ),
  ];
  const deferred = prior.mode === "campaign" && Boolean(options.chapterFlowActive);
  intents.push({ type: "ghost-wave", wave, marker: description.bossWave ? "boss" : "start" });
  intents.push({ type: "prepare-wave", wave, boss: description.bossWave, deferred });
  if (!deferred) intents.push({ type: "activate-wave" }, { type: "show-wave-banner" }, { type: "play-wave-sfx" });

  return {
    state: {
      ...prior,
      wave,
      bossOrder: [...bossOrder],
      bossIdx,
      currentStageIndex: stage ?? prior.currentStageIndex,
      biomeIdx,
      pendingBossOutro:
        prior.mode === "campaign" && intents.some((intent) => intent.type === "begin-campaign-chapter")
          ? null
          : prior.pendingBossOutro,
      isBossWave: description.bossWave,
      stage,
      horde,
      miniBoss,
      waveTag,
      curBoss,
      spawnQueue,
      waveKinds,
    },
    spawnTimer: deferred ? null : options.startDelay,
    waveTime: deferred ? null : 0,
    waveKills: deferred ? null : 0,
    wavePeak: deferred ? null : options.currentMultiplier,
    grace: openingGrace({ wave, followsStory: deferred, bossWave: description.bossWave }),
    activationDeferred: deferred,
    intents,
  };
}

export function activatePreparedWave(
  startDelay: number,
  currentMultiplier: number,
): Readonly<{
  spawnTimer: number;
  waveTime: 0;
  waveKills: 0;
  wavePeak: number;
  intents: readonly WavePlanIntent[];
}> {
  if (!Number.isFinite(startDelay) || startDelay < 0)
    throw new RangeError("startDelay must be finite and non-negative");
  if (!Number.isFinite(currentMultiplier) || currentMultiplier < 0)
    throw new RangeError("currentMultiplier must be finite and non-negative");
  return Object.freeze({
    spawnTimer: startDelay,
    waveTime: 0,
    waveKills: 0,
    wavePeak: currentMultiplier,
    intents: Object.freeze([
      { type: "activate-wave" as const },
      { type: "show-wave-banner" as const },
      { type: "play-wave-sfx" as const },
    ]),
  });
}
