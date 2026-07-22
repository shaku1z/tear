import { createLiveContentRuntime, type ContentMode, type ContentStage,
  type LiveContentRuntimeApi } from "../gameplay/run/live-content-runtime";
import type { EnemyPreset } from "../gameplay/affixes";
import type { RandomSource } from "../domain/random";
import type { LiveSpawnEnemy, LiveSpawnRun } from "../gameplay/run/live-enemy-spawn";
import type { ArenaPlatform } from "../gameplay/training/arena-rules";
import type { EnemyVariant } from "../gameplay/variants";

export interface ContentHostEnemy extends LiveSpawnEnemy { introT?: number }

export interface ContentHostRun extends LiveSpawnRun {
  readonly runTime: number;
  readonly curBoss?: string | null;
  _bossFightT?: number | null;
  bossAdds?: readonly unknown[] | null;
  _preBossPlatforms?: ArenaPlatform[];
  _brokenPlats?: readonly unknown[] | null;
  _arenaBroken?: ArenaPlatform[] | null;
  readonly mods?: object;
}

export interface LiveContentHostContext<TEnemy extends ContentHostEnemy> {
  readonly width: number;
  readonly groundY: number;
  readonly random: RandomSource;
  readonly run: () => ContentHostRun;
  readonly modes: () => readonly ContentMode[];
  readonly stages: readonly ContentStage[];
  readonly stageIndex: () => number;
  readonly platforms: () => ArenaPlatform[];
  readonly setPlatforms: (platforms: ArenaPlatform[]) => void;
  readonly createGround: (kind: "charger" | "ranged" | "bomber" | "armored" | "chimera") => TEnemy;
  readonly createAir: (kind: "flyer" | "wraith", x: number, y: number) => TEnemy;
  readonly createSupport: (kind: "priest" | "herald" | "mender" | "anchor") => TEnemy;
  readonly createDefaultBoss: () => TEnemy;
  readonly createBoss: (id: string) => TEnemy;
  readonly applyPreset: (enemy: TEnemy, preset: EnemyPreset) => void;
  readonly rollVariant: (kind: string, wave: number) => EnemyVariant | null;
  readonly applyVariant: (enemy: TEnemy, variant: EnemyVariant | null) => void;
  readonly rollAffixes: (enemy: TEnemy, wave: number) => void;
  readonly arrivalEffect: (enemy: TEnemy, boss: boolean) => void;
  readonly recordSpawn: (enemy: TEnemy, role: string, detail: Readonly<{ vn: string; b: string }>) => void;
  readonly install: (enemy: TEnemy) => void;
  readonly startClipper: () => void;
  readonly bossIntroDuration: number;
  readonly wipeRemainingSeconds: () => number;
  readonly setBossIntro: (enemy: TEnemy, duration: number, delay: number) => void;
  readonly clearBossBeat: () => void;
  readonly clearBanners: () => void;
  readonly bossArena: (bossId: string) => ArenaPlatform[] | null;
}

/** Owns enemy/boss construction and spawn presentation behind the typed run-content API. */
export function createLiveContentHost<TEnemy extends ContentHostEnemy>(
  context: LiveContentHostContext<TEnemy>,
): LiveContentRuntimeApi<TEnemy> {
  const run = (): ContentHostRun => context.run();
  const construction = {
    sideSpawn: () => 0,
    createGround: context.createGround,
    createAir: context.createAir,
    createSupport: context.createSupport,
    createBoss: context.createDefaultBoss,
    beginBossPresentation(enemy: TEnemy) {
      const active = run();
      active._bossFightT = active.runTime;
      context.startClipper();
      context.setBossIntro(enemy, context.bossIntroDuration, context.wipeRemainingSeconds());
      enemy.introT = context.bossIntroDuration;
      context.clearBossBeat();
      context.clearBanners();
      active.bossAdds = null;
      const arena = context.bossArena(enemy.bossId ?? "warden");
      if (arena !== null) {
        active._preBossPlatforms = context.platforms();
        active._brokenPlats = null;
        active._arenaBroken = [];
        context.setPlatforms(arena);
      }
    },
  };
  const spawning = {
    random: context.random,
    run,
    campaignStage: context.stageIndex,
    contentWave: () => 0,
    groundSpawn: () => ({ x: 0, y: 0 }),
    applyPreset: context.applyPreset,
    rollVariant: context.rollVariant,
    applyVariant: context.applyVariant,
    rollAffixes: context.rollAffixes,
    arrivalEffect: context.arrivalEffect,
    recordSpawn: context.recordSpawn,
    install: context.install,
  };
  return createLiveContentRuntime({
    width: context.width,
    random: context.random,
    run: () => {
      const active = run();
      return { mode: active.mode, wave: active.wave,
        ...(active.curBoss === null || active.curBoss === undefined ? {} : { curBoss: active.curBoss }) };
    },
    modes: context.modes,
    stages: context.stages,
    platforms: context.platforms,
    groundY: () => context.groundY,
    construction,
    spawning,
    createBoss: context.createBoss,
  });
}
