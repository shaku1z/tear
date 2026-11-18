import type {
  LiveBlade as OpeningBlade,
  LiveEnemy as OpeningEnemy,
  LivePlayer as OpeningPlayer,
  LiveRun as OpeningRun,
} from "../combat/live-opening-phase";
import type {
  LiveBlade as CollisionBlade,
  LiveEnemy as CollisionEnemy,
  LivePlayer as CollisionPlayer,
  LiveProjectile,
  LiveRun as CollisionRun,
} from "../combat/live-collision-phase";
import type { LiveWaveRun } from "../run/live-wave-controller";
import type { RunSession } from "../run/session";
import type { LiveCampaignRun } from "../campaign/campaign-runtime";
import type { LiveStyleRun } from "../scoring/live-style-achievement-runtime";
import type { LiveWeaponRun } from "../combat/live-weapon-runtime";
import type { newMods } from "../upgrades";
import type { UpgradeDefinition } from "../upgrades";
import type { createPlayer } from "../entities/player";
import type { createBlade } from "../entities/blade";
import type { createEnemyTypes } from "../entities/enemies";
import type { createProjectile } from "../entities/projectile";
import type { BossId } from "../run/content-director";
import type { SourceVoidState } from "../training/arena-rules";
import type { ArenaPlatform } from "../training/arena-rules";

type EnemyTypes = ReturnType<typeof createEnemyTypes>;
export type GamePlayer = InstanceType<ReturnType<typeof createPlayer>> & OpeningPlayer & CollisionPlayer;
export type GameBlade = InstanceType<ReturnType<typeof createBlade>> & OpeningBlade & CollisionBlade;
export type GameEnemy = InstanceType<EnemyTypes["Enemy"]> &
  OpeningEnemy &
  CollisionEnemy & {
    isVoidWisp?: boolean;
    _gid?: number;
  };
export type GameProjectile = InstanceType<ReturnType<typeof createProjectile>> & LiveProjectile;
export type GameMods = ReturnType<typeof newMods>;
export type GameRun = RunSession<GameMods> &
  OpeningRun &
  CollisionRun &
  LiveWaveRun &
  LiveCampaignRun &
  LiveStyleRun &
  LiveWeaponRun<GameEnemy> & {
    diffDmg: number;
    bossIdx: number;
    bossOrder: string[];
    curBoss: BossId | null;
    voidScroll: SourceVoidState | null;
    pgArena?: number;
    pg: Readonly<{ hpMultiplier?: number; count?: number; god?: boolean; freeze?: boolean; slow?: boolean }>;
    reservedUpgrade: UpgradeDefinition | null;
    _arenaBroken?: ArenaPlatform[] | null;
  };

export interface GameFloater {
  x: number;
  y: number;
  text: string;
  life: number;
  big: boolean;
  col: string;
}
export interface GameSlowZone {
  x: number;
  y: number;
  r: number;
  life: number;
}
export interface GameTemporaryWall {
  x: number;
  y: number;
  w: number;
  h: number;
  wall: true;
  life: number;
  maxLife: number;
}
