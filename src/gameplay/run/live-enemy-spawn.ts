import type { EnemyPreset } from "../affixes";
import type { EnemyVariant } from "../variants";
import type { RandomSource } from "../../domain/random";
import type { RunMode } from "./session";
import { bossScaling } from "./wave-rules";
import type { WaveSpawnSpec } from "./wave-planner";

export interface LiveWaveSpawnSpec extends WaveSpawnSpec { readonly variant?: EnemyVariant | null }

export interface LiveSpawnEnemy {
  kind: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  hpDisplay?: number;
  hh: number;
  radius: number;
  color: string;
  contactDmg: number;
  dmgScale?: number;
  weight?: number;
  isBoss?: boolean;
  bossName?: string;
  bossId?: string;
  isMiniBoss?: boolean;
  isMirrorBoss?: boolean;
  _live?: boolean;
  variantName?: string;
  canClimb?: boolean;
  climber?: boolean;
  climbApt?: number;
  moves?: string[];
  spawnT?: number;
}

export interface LiveSpawnRun {
  readonly mode: RunMode;
  readonly wave: number;
  readonly bossesBeaten?: number;
  readonly diffHp?: number;
  readonly waveKinds?: readonly string[];
}

export interface LiveEnemySpawnPort<TEnemy extends LiveSpawnEnemy> {
  readonly random: RandomSource;
  readonly run: () => LiveSpawnRun;
  readonly campaignStage: () => number;
  readonly contentWave: () => number;
  readonly groundSpawn: (halfHeight: number) => Readonly<{ x: number; y: number }>;
  readonly applyPreset: (enemy: TEnemy, preset: EnemyPreset) => void;
  readonly rollVariant: (kind: string, wave: number) => EnemyVariant | null;
  readonly applyVariant: (enemy: TEnemy, variant: EnemyVariant | null) => void;
  readonly rollAffixes: (enemy: TEnemy, wave: number) => void;
  readonly arrivalEffect: (enemy: TEnemy, boss: boolean) => void;
  readonly recordSpawn: (enemy: TEnemy, role: string, detail: Readonly<{ vn: string; b: string }>) => void;
  readonly install: (enemy: TEnemy) => void;
}

export interface LiveEnemyConstructionPort<TEnemy extends LiveSpawnEnemy> {
  readonly sideSpawn: () => number;
  readonly createGround: (kind: "charger" | "ranged" | "bomber" | "armored" | "chimera") => TEnemy;
  readonly createAir: (kind: "flyer" | "wraith", x: number, y: number) => TEnemy;
  readonly createSupport: (kind: "priest" | "herald" | "mender" | "anchor") => TEnemy;
  readonly createBoss: (bossId?: string) => TEnemy;
  readonly beginBossPresentation: (enemy: TEnemy) => void;
}

/** Constructs the authored enemy family before shared spawn invariants are applied. */
export function constructLiveEnemy<TEnemy extends LiveSpawnEnemy>(
  spec: LiveWaveSpawnSpec,
  port: LiveEnemyConstructionPort<TEnemy>,
): TEnemy {
  let enemy: TEnemy;
  switch (spec.type) {
    case "ranged": case "bomber": case "armored": case "chimera":
      enemy = port.createGround(spec.type); break;
    case "flyer": case "wraith":
      enemy = port.createAir(spec.type, port.sideSpawn(), spec.type === "flyer" ? 200 : 220); break;
    case "priest": case "herald": case "mender": case "anchor":
      enemy = port.createSupport(spec.type); break;
    case "boss":
      enemy = port.createBoss();
      if (enemy.isMirrorBoss) enemy._live = true;
      port.beginBossPresentation(enemy);
      break;
    case "miniboss":
      enemy = port.createBoss(spec.bossId);
      if (enemy.isMirrorBoss) enemy._live = true;
      enemy.hp *= 0.4;
      enemy.maxHp *= 0.4;
      enemy.isMiniBoss = true;
      enemy.bossName = `◇ ${enemy.bossName ?? ""}`;
      break;
    default:
      enemy = port.createGround("charger");
  }
  return enemy;
}

/** Applies all shared spawn invariants once, after the caller constructs an authored enemy type. */
export function completeEnemySpawn<TEnemy extends LiveSpawnEnemy>(
  enemy: TEnemy,
  spec: LiveWaveSpawnSpec,
  port: LiveEnemySpawnPort<TEnemy>,
): TEnemy {
  const boss = spec.type === "boss" || spec.type === "miniboss";
  const run = port.run();
  if (!boss) {
    if (spec.hpScale) { enemy.hp *= spec.hpScale; enemy.maxHp *= spec.hpScale; }
    if (spec.dmgScale && spec.dmgScale !== 1) {
      enemy.contactDmg *= spec.dmgScale;
      enemy.dmgScale = spec.dmgScale;
    }
    if (spec.preset !== undefined) port.applyPreset(enemy, spec.preset);
    else {
      port.applyVariant(enemy, spec.variant ?? port.rollVariant(enemy.kind, port.contentWave()));
      port.rollAffixes(enemy, run.wave);
    }
    if (spec.type !== "flyer" && spec.type !== "wraith") {
      const position = port.groundSpawn(enemy.hh);
      enemy.x = position.x;
      enemy.y = position.y;
    }
    if (["charger", "ranged", "bomber", "armored"].includes(enemy.kind)) {
      enemy.canClimb = true;
      enemy.climber = port.random.next() < 0.6;
      enemy.climbApt = port.random.next();
    }
    if (enemy.kind === "chimera") enemy.moves = run.waveKinds?.length ? [...run.waveKinds] : ["charger"];
  } else {
    const scaling = bossScaling({
      mode: run.mode,
      wave: run.wave || 1,
      bossesBeaten: run.bossesBeaten ?? 0,
      campaignStage: port.campaignStage(),
      placeholderBoss: !enemy.bossName,
      difficultyHp: run.diffHp ?? 1,
    });
    enemy.contactDmg *= scaling.contactDamage;
    enemy.hp *= scaling.health;
    enemy.maxHp *= scaling.health;
  }
  enemy.hpDisplay = enemy.hp;
  enemy.spawnT = 0.35;
  port.arrivalEffect(enemy, Boolean(enemy.isBoss));
  port.recordSpawn(enemy, enemy.isBoss ? "boss" : spec.type, {
    vn: enemy.variantName ?? "",
    b: enemy.bossId ?? spec.bossId ?? "",
  });
  port.install(enemy);
  return enemy;
}
