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
  readonly state?: string;
  readonly stateT?: number;
  readonly stateMax?: number;
  readonly phaseMarker?: number;
  readonly attackCursor?: number;
  readonly attackStep?: number;
  readonly attackSequence?: number;
  readonly environmentSequence?: number;
  readonly routeProgress?: number;
  readonly trueRouteIndex?: number;
  readonly fracturePlatformId?: string | null;
  readonly fractureWindow?: boolean;
  readonly batonStrike?: number;
  readonly auroraBossChargeActive?: boolean;
  readonly parryOutcome?: string;
  readonly routeTelegraph?: readonly Readonly<{ x: number; y: number }>[];
  readonly candidateRoutes?: readonly (readonly Readonly<{ x: number; y: number }>[] )[];
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

export interface CanonicalWhiteHartState {
  readonly state: string; readonly atk: string; readonly stateT: number; readonly stateMax: number;
  readonly phaseMarker: number; readonly attackCursor: number; readonly attackStep: number;
  readonly attackSequence: number; readonly environmentSequence: number; readonly routeProgress: number;
  readonly trueRouteIndex: number; readonly fracturePlatformId: string | null; readonly fractureWindow: boolean;
  readonly batonStrike: number; readonly auroraBossChargeActive: boolean; readonly parryOutcome: string;
  readonly routeTelegraph: readonly Readonly<{ x: number; y: number }>[];
  readonly candidateRoutes: readonly (readonly Readonly<{ x: number; y: number }>[])[];
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
    whiteHart?: Readonly<CanonicalWhiteHartState>;
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
      ...(enemy.kind === "white-hart" ? { whiteHart: Object.freeze({
        state: enemy.state ?? "", atk: enemy.atk ?? "", stateT: fixed(enemy.stateT ?? 0),
        stateMax: fixed(enemy.stateMax ?? 0), phaseMarker: enemy.phaseMarker ?? 1,
        attackCursor: enemy.attackCursor ?? 0, attackStep: enemy.attackStep ?? 0,
        attackSequence: enemy.attackSequence ?? 0, environmentSequence: enemy.environmentSequence ?? 0,
        routeProgress: fixed(enemy.routeProgress ?? 0), trueRouteIndex: enemy.trueRouteIndex ?? -1,
        fracturePlatformId: enemy.fracturePlatformId ?? null, fractureWindow: enemy.fractureWindow ?? false,
        batonStrike: fixed(enemy.batonStrike ?? 0), auroraBossChargeActive: enemy.auroraBossChargeActive ?? false,
        parryOutcome: enemy.parryOutcome ?? "none",
        routeTelegraph: Object.freeze((enemy.routeTelegraph ?? []).map((point) => Object.freeze({
          x: fixed(point.x), y: fixed(point.y),
        }))),
        candidateRoutes: Object.freeze((enemy.candidateRoutes ?? []).map((route) => Object.freeze(route.map((point) => Object.freeze({
          x: fixed(point.x), y: fixed(point.y),
        }))))),
      }) } : {}),
    })).sort((left, right) => left.id - right.id || left.kind.localeCompare(right.kind))),
    ...(environment === undefined ? {} : { environment: projectEnvironmentSemanticSnapshot(environment) }),
  });
}
