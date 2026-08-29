import { stableVerificationHash } from "../replay/hash";
import type { TearSnapshotV1 } from "./contracts";
import type {
  TearProgressionEvent,
  TearSynthesizedProgression,
} from "./progression-ledger";
import { reconstructProgression, synthesizeProgression } from "./progression-ledger";
import type { TearProgressionReplayResult } from "./progression-replay";
import { BOSS_FACTORY_IDS, type TearBossId } from "./registries";
import { bossPhaseAttackAvailable } from "../gameplay/run/boss-definitions";
import { STAGES } from "../gameplay/stages";
import {
  DECLARED_ONE_FRAME_BOUNDARIES,
  type TearOneFrameBoundaryDefinition,
} from "./state-forge-factories";

type MutableRecord = Record<string, unknown>;

export const TEAR_BOSS_PHASES = Object.freeze([1, 2, 3] as const);
export type TearBossPhase = typeof TEAR_BOSS_PHASES[number];

export interface StateForgeBossPhaseLaunch {
  readonly id: string;
  readonly kind: "boss-phase";
  readonly boss: TearBossId;
  readonly phase: TearBossPhase;
  readonly attack: "opening-commit" | "unavailable";
  readonly attackFrame: 0;
}

/** The only HP value admitted by the surgical boss-finisher exit. */
export const STATE_FORGE_BOSS_FINISHER_HP = 1 as const;

export interface StateForgeBossFinisherLaunch {
  readonly id: string;
  readonly kind: "boss-finisher";
  readonly boss: TearBossId;
  readonly remainingHp: typeof STATE_FORGE_BOSS_FINISHER_HP;
}

export interface StateForgeBoundaryLaunch {
  readonly id: string;
  readonly kind: "one-frame-boundary";
  readonly boundary: TearOneFrameBoundaryDefinition["id"];
  readonly position: "before" | "at" | "after";
  readonly ticks: number;
}

export type StateForgeExitLaunch = StateForgeBossPhaseLaunch | StateForgeBossFinisherLaunch
  | StateForgeBoundaryLaunch;

export interface Wave99HammerExitCertificate {
  readonly id: "hard-endless-wave-99-hammer";
  readonly legal: true;
  readonly targetWave: 99;
  readonly weapon: "hammer";
  readonly earnedPickCount: 99;
  readonly selectedPickCount: 99;
  readonly mutationCount: 99;
  readonly rewardCount: 99;
  readonly progressionHash: string;
  readonly configurationHash: string;
  readonly snapshotId: "wave99-start";
  readonly ghostSeed: string;
  readonly metrics: TearSynthesizedProgression["statistics"];
  readonly liveReplay?: TearProgressionReplayResult;
}

function mutableRecord(value: unknown, label: string): MutableRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as MutableRecord;
}

function eventsOfType<TType extends TearProgressionEvent["type"]>(
  progression: TearSynthesizedProgression,
  type: TType,
): readonly Extract<TearProgressionEvent, { type: TType }>[] {
  return progression.ledger.events.filter(
    (event): event is Extract<TearProgressionEvent, { type: TType }> => event.type === type,
  );
}

/**
 * Produces the auditable exit-gate certificate for the canonical long-run
 * State Forge target. A certificate is issued only when every completed wave
 * earned, selected, mutated, and rewarded exactly once.
 */
export function certifyWave99HammerProgression(
  progression: TearSynthesizedProgression,
  snapshotId = "wave99-start",
  ghostSeed = "990099",
): Wave99HammerExitCertificate {
  if (!progression.reachable || progression.ledger.targetWave !== 99) {
    throw new TypeError("wave-99 progression must be reachable and target exactly wave 99");
  }
  reconstructProgression(progression.ledger);
  const earnedPickCount = eventsOfType(progression, "draft.earned").length
    + eventsOfType(progression, "tier.earned").length;
  const selectedPickCount = eventsOfType(progression, "draft.selected").length
    + eventsOfType(progression, "tier.selected").length;
  const mutationCount = eventsOfType(progression, "configuration.mutated").length;
  const rewardCount = eventsOfType(progression, "reward.granted").length;
  if ([earnedPickCount, selectedPickCount, mutationCount, rewardCount].some((count) => count !== 99)) {
    throw new TypeError(
      `wave-99 ledger requires 99 earned/selected/mutated/rewarded picks; got `
      + `${String(earnedPickCount)}/${String(selectedPickCount)}/${String(mutationCount)}/${String(rewardCount)}`,
    );
  }
  if (snapshotId !== "wave99-start") throw new TypeError("canonical wave-99 snapshot id must be wave99-start");
  return Object.freeze({
    id: "hard-endless-wave-99-hammer",
    legal: true,
    targetWave: 99,
    weapon: "hammer",
    earnedPickCount: 99,
    selectedPickCount: 99,
    mutationCount: 99,
    rewardCount: 99,
    progressionHash: progression.ledger.progressionHash,
    configurationHash: progression.configurationHash,
    snapshotId,
    ghostSeed,
    metrics: progression.statistics,
  });
}

export function createCanonicalWave99HammerProgression(): TearSynthesizedProgression {
  return synthesizeProgression({
    mode: "endless",
    difficulty: "hard",
    weapon: "hammer",
    targetWave: 99,
    policy: "archetype",
    selections: Object.freeze([
      Object.freeze({ id: "keen_edge", tier: 5 }),
      Object.freeze({ id: "bloodrite", tier: 3 }),
      Object.freeze({ id: "air_dash", tier: 1 }),
    ]),
  });
}

export function createCanonicalWave99HammerCertificate(): Wave99HammerExitCertificate {
  return certifyWave99HammerProgression(createCanonicalWave99HammerProgression());
}

export function createWave99HistoricalRunState(certificate: Wave99HammerExitCertificate): Readonly<{
  runTime: number;
  waveLog: readonly Readonly<{ wave: number; time: number; kills: number; peak: number }>[];
  currentWaveKills: number;
}> {
  const completedWaves = 98;
  const baseKills = Math.floor(certificate.metrics.kills / 99);
  let allocatedKills = 0;
  const waveSeconds = certificate.metrics.elapsedTicks / 120 / 99;
  const waveLog = Object.freeze(Array.from({ length: completedWaves }, (_, index) => {
    const kills = baseKills + (index < certificate.metrics.kills % 99 ? 1 : 0);
    allocatedKills += kills;
    return Object.freeze({
      wave: index + 1,
      time: waveSeconds,
      kills,
      peak: Math.min(10, 2 + Math.floor(index / 10)),
    });
  }));
  return Object.freeze({
    runTime: certificate.metrics.elapsedTicks / 120,
    waveLog,
    currentWaveKills: certificate.metrics.kills - allocatedKills,
  });
}

export function createBossPhaseLaunchMatrix(): readonly StateForgeBossPhaseLaunch[] {
  return Object.freeze(BOSS_FACTORY_IDS.flatMap((boss) => TEAR_BOSS_PHASES.map((phase) => Object.freeze({
    id: `boss-${boss}-phase-${String(phase)}`,
    kind: "boss-phase" as const,
    boss,
    phase,
    attack: bossPhaseAttackAvailable(boss, phase) ? "opening-commit" as const : "unavailable" as const,
    attackFrame: 0 as const,
  }))));
}

export function createOneFrameBoundaryLaunchMatrix(): readonly StateForgeBoundaryLaunch[] {
  return Object.freeze(DECLARED_ONE_FRAME_BOUNDARIES.flatMap((boundary) =>
    (["before", "at", "after"] as const).map((position) => Object.freeze({
      id: `${boundary.id}-${position}`,
      kind: "one-frame-boundary" as const,
      boundary: boundary.id,
      position,
      ticks: boundary[position],
    }))));
}

function patchBoss(snapshot: TearSnapshotV1, launch: StateForgeBossPhaseLaunch): void {
  const bosses = snapshot.state["tear.boss.v1"];
  if (!Array.isArray(bosses) || bosses.length !== 1) {
    throw new TypeError(`${launch.id} requires one live boss in the source snapshot`);
  }
  const boss = mutableRecord(bosses[0], "boss codec");
  if (boss.factoryId !== launch.boss) {
    throw new TypeError(`${launch.id} source boss is ${String(boss.factoryId)}`);
  }
  boss.phase = launch.phase;
  boss.phaseMarker = launch.phase;
  boss.atk = launch.attack;
  boss.atkT = launch.attackFrame / 120;
  const maxHp = typeof boss.maxHp === "number" ? boss.maxHp : 1;
  boss.hp = maxHp * ({ 1: 0.9, 2: 0.5, 3: 0.15 } as const)[launch.phase];
}

function patchBossFinisher(snapshot: TearSnapshotV1, launch: StateForgeBossFinisherLaunch): void {
  const remainingHp: unknown = launch.remainingHp;
  if (remainingHp !== STATE_FORGE_BOSS_FINISHER_HP) {
    throw new TypeError(`${launch.id} remaining HP must be exactly ${String(STATE_FORGE_BOSS_FINISHER_HP)}`);
  }
  const bosses = snapshot.state["tear.boss.v1"];
  if (!Array.isArray(bosses) || bosses.length !== 1) {
    throw new TypeError(`${launch.id} requires exactly one matching live boss in the source snapshot`);
  }
  const boss = mutableRecord(bosses[0], "boss codec");
  if (boss.factoryId !== launch.boss) {
    throw new TypeError(`${launch.id} source boss is ${String(boss.factoryId)}`);
  }
  if (boss.dead === true || boss.dying === true || boss.mode === "downed"
    || typeof boss.hp !== "number" || !(boss.hp > 0)) {
    throw new TypeError(`${launch.id} requires ${launch.boss} to be live`);
  }
  if (typeof boss.maxHp !== "number" || !Number.isFinite(boss.maxHp)
    || boss.maxHp < STATE_FORGE_BOSS_FINISHER_HP) {
    throw new TypeError(`${launch.id} source boss maximum HP is invalid`);
  }
  const run = mutableRecord(snapshot.state["tear.run.v1"], "run codec");
  const world = mutableRecord(snapshot.state["tear.world.v1"], "world codec");
  const runtime = mutableRecord(world.runtime, "world runtime");
  const lifecycle = mutableRecord(runtime.lifecycle, "run lifecycle");
  const cinema = mutableRecord(snapshot.state["tear.cinematic.v1"], "cinematic codec");
  const ui = mutableRecord(snapshot.state["tear.ui.v1"], "ui codec");
  if (lifecycle.phase !== "wave-active" || lifecycle.bossWave !== true || lifecycle.reward !== null
    || ui.screen !== "playing" || cinema.active !== false
    || !Array.isArray(run.spawnQueue) || run.spawnQueue.length !== 0) {
    throw new TypeError(`${launch.id} requires an active, unobstructed production boss frontier`);
  }
  const finalStageIndex = STAGES.length - 1;
  if (launch.boss === "source" && (run.mode !== "campaign" || run.wave !== 60 || run.stage !== finalStageIndex
    || run._biomeIdx !== finalStageIndex || run.chapterState !== "WAVE_LIVE" || lifecycle.wave !== 60)) {
    throw new TypeError(`${launch.id} requires the final campaign Source frontier`);
  }
  if (typeof boss.hpDisplay !== "number" || !Number.isFinite(boss.hpDisplay)) {
    throw new TypeError(`${launch.id} source boss displayed HP is invalid`);
  }
  // Preserve the production-constructed actor and its codec identity. Only
  // the explicitly declared surgical-valid health pair is changed.
  boss.hp = launch.remainingHp;
  boss.hpDisplay = launch.remainingHp;
}

function patchBoundary(snapshot: TearSnapshotV1, launch: StateForgeBoundaryLaunch): void {
  const seconds = launch.ticks / 120;
  const player = mutableRecord(snapshot.state["tear.player.v1"], "player codec");
  const blade = mutableRecord(snapshot.state["tear.blade.v1"], "blade codec");
  const run = mutableRecord(snapshot.state["tear.run.v1"], "run codec");
  const enemies = snapshot.state["tear.enemy.v1"];
  const bosses = snapshot.state["tear.boss.v1"];
  switch (launch.boundary) {
    case "hit-threshold": blade.vx = 240 + launch.ticks; blade.vy = 0; break;
    case "perfect-parry": blade.vx = 780 + launch.ticks; blade.vy = 0; break;
    case "deflect": blade.vx = 520 + launch.ticks; blade.vy = 0; break;
    case "slam": blade.vx = 0; blade.vy = 620 + launch.ticks; break;
    case "power-slam": blade.vx = 0; blade.vy = 1_050 + launch.ticks; break;
    case "launch": blade.vx = 0; blade.vy = -520 - launch.ticks; break;
    case "recall-distance":
      blade.state = "returning";
      blade.x = Number(player.x) + 180 + launch.ticks;
      break;
    case "overlap": {
      if (!Array.isArray(enemies) || enemies.length === 0) throw new TypeError("overlap boundary requires an enemy");
      const enemy = mutableRecord(enemies[0], "enemy codec");
      enemy.x = Number(player.x) + Number(player.hw) + Number(enemy.hw) + launch.ticks;
      enemy.y = player.y;
      break;
    }
    case "boss-hp": {
      if (!Array.isArray(bosses) || bosses.length === 0) {
        throw new TypeError("boss-hp boundary requires a boss source snapshot");
      }
      const boss = mutableRecord(bosses[0], "boss codec");
      const phaseMarks = Array.isArray(boss.phaseMarks) ? boss.phaseMarks : [0.5];
      boss.hp = Number(boss.maxHp) * Number(phaseMarks[0] ?? 0.5) + launch.ticks;
      break;
    }
    case "cooldown": player.dashCd = seconds; break;
    case "iframe": player.iframe = seconds; break;
    case "shield":
      player.shield = Math.max(0, launch.ticks);
      player.stateForgeShieldBoundary = launch.position;
      break;
    case "style":
      run.style = 3 + launch.ticks / 100;
      run.stateForgeStyleBoundary = launch.position;
      break;
  }
}

/** Creates a detached, restore-ready snapshot; the captured input is untouched. */
export function forgeExitLaunchSnapshot(
  source: TearSnapshotV1,
  launch: StateForgeExitLaunch,
): TearSnapshotV1 {
  const forged = structuredClone(source);
  (forged as { id: string }).id = launch.id;
  (forged as { stateClass: TearSnapshotV1["stateClass"] }).stateClass = "surgical-valid";
  (forged as { provenance: TearSnapshotV1["provenance"] }).provenance = Object.freeze({
    ...source.provenance, actor: "state-forge", producer: "forgeExitLaunchSnapshot", sourceId: source.id,
  });
  (forged as { lineage: NonNullable<TearSnapshotV1["lineage"]> }).lineage = Object.freeze({
    parentId: source.id, relation: "forked-at", parentRootHash: source.hashes.exact, forkTick: source.tick,
  });
  if (launch.kind === "boss-phase") patchBoss(forged, launch);
  else if (launch.kind === "boss-finisher") patchBossFinisher(forged, launch);
  else patchBoundary(forged, launch);
  const mutableHashes = forged.hashes as unknown as MutableRecord;
  mutableHashes.exact = stableVerificationHash(forged.state);
  return Object.freeze(forged);
}

/** Applies the certified long-run truth to a freshly captured live Hammer run. */
export function forgeWave99HammerSnapshot(
  source: TearSnapshotV1,
  certificate: Wave99HammerExitCertificate,
  liveReplay?: TearProgressionReplayResult,
): TearSnapshotV1 {
  const forged = structuredClone(source);
  (forged as { id: string }).id = certificate.snapshotId;
  (forged as { stateClass: TearSnapshotV1["stateClass"] }).stateClass = "reconstructed-reachable";
  const run = mutableRecord(forged.state["tear.run.v1"], "run codec");
  const player = mutableRecord(forged.state["tear.player.v1"], "player codec");
  run.wave = 99;
  run.score = certificate.metrics.score;
  run.kills = certificate.metrics.kills;
  run.style = certificate.metrics.style;
  run.elapsedTicks = certificate.metrics.elapsedTicks;
  player.hp = certificate.metrics.hp;
  player.maxHp = certificate.metrics.maxHp;
  run.stateForgeEvidence = structuredClone({
    ...certificate,
    ...(liveReplay === undefined ? {} : { liveReplay }),
  });
  const mutableHashes = forged.hashes as unknown as MutableRecord;
  mutableHashes.exact = stableVerificationHash(forged.state);
  mutableHashes.progression = certificate.progressionHash;
  return Object.freeze(forged);
}
