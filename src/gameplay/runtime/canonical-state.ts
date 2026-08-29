import type { AuthoritativeInputSnapshot } from "./authoritative-input";
import type { EnvironmentSnapshot } from "../environment/environment-contracts";
import { projectEnvironmentSemanticSnapshot } from "../../tearbench/environment-codec";

export interface RuntimeRunState {
  readonly mode: string;
  readonly wave: number;
  readonly score: number;
  readonly runTime: number;
  readonly runSeed: number;
}

export interface RuntimeBodyState {
  readonly x: number; readonly y: number; readonly vx: number; readonly vy: number;
}

export interface RuntimePlayerState extends RuntimeBodyState { readonly hp: number }
export interface RuntimeBladeState extends RuntimeBodyState { readonly state: string }
export interface RuntimeEnemyState extends RuntimeBodyState {
  readonly _gid?: number;
  readonly kind?: string;
  readonly bossId?: string;
  readonly hp: number;
  readonly dead: boolean;
  readonly atk?: string;
  readonly atkT?: number;
  readonly atkCd?: number;
  readonly packRole?: string;
  readonly packFlank?: number;
  readonly packLockT?: number;
  readonly packAttackAuthorized?: boolean;
  readonly pounceTargetX?: number;
  readonly pounceAirborne?: boolean;
  readonly auroraDirection?: number;
  readonly auroraResponseT?: number;
  readonly auroraPounceExtended?: boolean;
}

export interface CanonicalRimehoundState {
  readonly atk: string;
  readonly atkT: number;
  readonly atkCd: number;
  readonly packRole: string;
  readonly packFlank: number;
  readonly packLockT: number;
  readonly packAttackAuthorized: boolean;
  readonly pounceTargetX: number;
  readonly pounceAirborne: boolean;
  readonly auroraDirection: number;
  readonly auroraResponseT: number;
  readonly auroraPounceExtended: boolean;
}

export interface CanonicalGameplayState {
  readonly tick: number;
  readonly input: AuthoritativeInputSnapshot;
  readonly run: Readonly<{ mode: string; wave: number; score: number; time: number; seed: number }> | null;
  readonly player: Readonly<{ x: number; y: number; vx: number; vy: number; hp: number }> | null;
  readonly blade: Readonly<{ state: string; x: number; y: number; vx: number; vy: number }> | null;
  readonly enemies: readonly Readonly<{
    id: number; kind: string; bossId: string; x: number; y: number; vx: number; vy: number; hp: number; dead: boolean;
    rimehound?: Readonly<CanonicalRimehoundState>;
  }>[];
  /** Optional world-owned environment projection; absent on legacy hosts. */
  readonly environment?: EnvironmentSnapshot;
}

const fixed = (value: number): number => Math.round(value * 1_000);

/** Canonical, renderer-neutral projection hashed by live runs and replay verification. */
export function projectCanonicalGameplayState(
  tick: number,
  input: AuthoritativeInputSnapshot,
  run: RuntimeRunState | null,
  player: RuntimePlayerState | null,
  blade: RuntimeBladeState | null,
  enemies: readonly RuntimeEnemyState[],
  environment?: EnvironmentSnapshot,
): CanonicalGameplayState {
  return Object.freeze({
    tick,
    input,
    run: run === null ? null : Object.freeze({
      mode: run.mode, wave: run.wave, score: run.score, time: fixed(run.runTime), seed: run.runSeed,
    }),
    player: player === null ? null : Object.freeze({
      x: fixed(player.x), y: fixed(player.y), vx: fixed(player.vx), vy: fixed(player.vy), hp: fixed(player.hp),
    }),
    blade: blade === null ? null : Object.freeze({
      state: blade.state, x: fixed(blade.x), y: fixed(blade.y), vx: fixed(blade.vx), vy: fixed(blade.vy),
    }),
    enemies: Object.freeze(enemies.map((enemy) => Object.freeze({
      id: enemy._gid ?? 0, kind: enemy.kind ?? "", bossId: enemy.bossId ?? "",
      x: fixed(enemy.x), y: fixed(enemy.y), vx: fixed(enemy.vx), vy: fixed(enemy.vy),
      hp: fixed(enemy.hp), dead: enemy.dead,
      ...(enemy.kind === "rimehound" ? { rimehound: Object.freeze({
        atk: enemy.atk ?? "", atkT: fixed(enemy.atkT ?? 0), atkCd: fixed(enemy.atkCd ?? 0),
        packRole: enemy.packRole ?? "", packFlank: enemy.packFlank ?? 0,
        packLockT: fixed(enemy.packLockT ?? 0), packAttackAuthorized: enemy.packAttackAuthorized ?? false,
        pounceTargetX: fixed(enemy.pounceTargetX ?? 0), pounceAirborne: enemy.pounceAirborne ?? false,
        auroraDirection: enemy.auroraDirection ?? 0, auroraResponseT: fixed(enemy.auroraResponseT ?? 0),
        auroraPounceExtended: enemy.auroraPounceExtended ?? false,
      }) } : {}),
    })).sort((left, right) => left.id - right.id || left.kind.localeCompare(right.kind))),
    ...(environment === undefined ? {} : { environment: projectEnvironmentSemanticSnapshot(environment) }),
  });
}
