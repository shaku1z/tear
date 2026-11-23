import type { AuthoritativeInputSnapshot } from "./authoritative-input";
import type { TutorialSessionCheckpoint } from "../training/tutorial-session-checkpoint";
import type { EnvironmentSnapshot } from "../environment/environment-contracts";
import { projectEnvironmentSemanticSnapshot } from "../environment/environment-projection";
import { DeferredCanonicalState } from "./authoritative-step";

/**
 * The status effects an actor carries from tick to tick that its position, speed and health do not show:
 * what a weapon, an ability, an enemy or the stage put on it, and that changes what happens to it later.
 * They are in the canonical state, so a replay that drifts on one (a burn that ends a tick late) is caught
 * at the next checkpoint. A new status is one name here, on the actor that carries it.
 */
export const ENEMY_STATUS_FIELDS = Object.freeze([
  "bleedStacks",
  "bleedT",
  "burnT",
  "burnDps",
  "markT",
  "slowStatus",
  "stun",
  "shield",
  "seamT",
  "breakPressure",
  "breakT",
  "driveT",
  "boundT",
  "severT",
  "severMult",
  "severTier",
  "rooted",
] as const);
export const PLAYER_STATUS_FIELDS = Object.freeze([
  "iframe",
  "shield",
  "rootT",
  "slowMult",
  "voidSlowT",
  "hazardT",
] as const);
export type EnemyStatusField = (typeof ENEMY_STATUS_FIELDS)[number];
export type PlayerStatusField = (typeof PLAYER_STATUS_FIELDS)[number];
type StatusValues<Field extends string> = Readonly<Partial<Record<Field, number | boolean>>>;

/** An actor's statuses as values, read from the live actor (numbers as they are, flags as flags). */
export function copyStatus<Field extends string>(
  fields: readonly Field[],
  actor: Readonly<Partial<Record<Field, unknown>>>,
): StatusValues<Field> {
  const values: Partial<Record<Field, number | boolean>> = {};
  for (const field of fields) {
    const value = actor[field];
    if (typeof value === "number" || typeof value === "boolean") values[field] = value;
  }
  return values;
}

/** The canonical form of an actor's statuses: numbers in thousandths, as positions are, flags as flags. */
function projectStatus<Field extends string>(
  fields: readonly Field[],
  actor: Readonly<Partial<Record<Field, unknown>>>,
): StatusValues<Field> {
  const values: Partial<Record<Field, number | boolean>> = {};
  for (const [field, value] of Object.entries(copyStatus(fields, actor)) as [Field, number | boolean][])
    values[field] = typeof value === "number" ? fixed(value) : value;
  return Object.freeze(values);
}

export interface RuntimeRunState {
  readonly mode: string;
  readonly wave: number;
  readonly score: number;
  readonly runTime: number;
  readonly runSeed: number;
}

export interface RuntimeBodyState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

export interface RuntimePlayerState extends RuntimeBodyState, StatusValues<PlayerStatusField> {
  readonly hp: number;
}
export interface RuntimeBladeState extends RuntimeBodyState {
  readonly state: string;
}
export interface RuntimeEnemyState extends RuntimeBodyState, StatusValues<EnemyStatusField> {
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
  readonly candidateRoutes?: readonly (readonly Readonly<{ x: number; y: number }>[])[];
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
  readonly state: string;
  readonly atk: string;
  readonly stateT: number;
  readonly stateMax: number;
  readonly phaseMarker: number;
  readonly attackCursor: number;
  readonly attackStep: number;
  readonly attackSequence: number;
  readonly environmentSequence: number;
  readonly routeProgress: number;
  readonly trueRouteIndex: number;
  readonly fracturePlatformId: string | null;
  readonly fractureWindow: boolean;
  readonly batonStrike: number;
  readonly auroraBossChargeActive: boolean;
  readonly parryOutcome: string;
  readonly routeTelegraph: readonly Readonly<{ x: number; y: number }>[];
  readonly candidateRoutes: readonly (readonly Readonly<{ x: number; y: number }>[])[];
}

export interface CanonicalGameplayState {
  /** Behavior only. Display/help/ghost cadence never affects simulation verification. */
  readonly tutorial?: TutorialSessionCheckpoint;
  readonly tick: number;
  readonly input: AuthoritativeInputSnapshot;
  readonly run: Readonly<{ mode: string; wave: number; score: number; time: number; seed: number }> | null;
  readonly player: Readonly<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    hp: number;
    status: StatusValues<PlayerStatusField>;
  }> | null;
  readonly blade: Readonly<{ state: string; x: number; y: number; vx: number; vy: number }> | null;
  readonly enemies: readonly Readonly<{
    id: number;
    kind: string;
    bossId: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    hp: number;
    dead: boolean;
    status: StatusValues<EnemyStatusField>;
    rimehound?: Readonly<CanonicalRimehoundState>;
    whiteHart?: Readonly<CanonicalWhiteHartState>;
  }>[];
  /** Optional world-owned environment projection; absent on legacy hosts. */
  readonly environment?: EnvironmentSnapshot;
}

const fixed = (value: number): number => Math.round(value * 1_000);

/** A run's time as the canonical state holds it: whole milliseconds of `run.runTime` (seconds). */
export const canonicalRunTime = (runTime: number): number => fixed(runTime);

/**
 * A replay summary's run time: the canonical run time back in seconds, to the millisecond. The live run end
 * (from `run.runTime`) and a re-simulation (from the canonical state) both write it through here, so verify
 * compares the same number.
 */
export const replaySummaryTime = (canonicalMilliseconds: number): number => canonicalMilliseconds / 1_000;

/** A replay summary's run totals from the canonical run a re-simulation ends on (zeros when there is none). */
export function canonicalReplayTotals(
  run: Readonly<{ score: number; wave: number; time: number }> | null | undefined,
): Readonly<{ score: number; wave: number; time: number }> {
  return Object.freeze({ score: run?.score ?? 0, wave: run?.wave ?? 0, time: replaySummaryTime(run?.time ?? 0) });
}

/** Canonical, renderer-neutral projection hashed by live runs and replay verification. */
export function projectCanonicalGameplayState(
  tick: number,
  input: AuthoritativeInputSnapshot,
  run: RuntimeRunState | null,
  player: RuntimePlayerState | null,
  blade: RuntimeBladeState | null,
  enemies: readonly RuntimeEnemyState[],
  environment?: EnvironmentSnapshot,
  tutorial?: TutorialSessionCheckpoint,
): CanonicalGameplayState {
  return Object.freeze({
    tick,
    input,
    run:
      run === null
        ? null
        : Object.freeze({
            mode: run.mode,
            wave: run.wave,
            score: run.score,
            time: canonicalRunTime(run.runTime),
            seed: run.runSeed,
          }),
    player:
      player === null
        ? null
        : Object.freeze({
            x: fixed(player.x),
            y: fixed(player.y),
            vx: fixed(player.vx),
            vy: fixed(player.vy),
            hp: fixed(player.hp),
            status: projectStatus(PLAYER_STATUS_FIELDS, player),
          }),
    blade:
      blade === null
        ? null
        : Object.freeze({
            state: blade.state,
            x: fixed(blade.x),
            y: fixed(blade.y),
            vx: fixed(blade.vx),
            vy: fixed(blade.vy),
          }),
    enemies: Object.freeze(
      enemies
        .map((enemy) =>
          Object.freeze({
            id: enemy._gid ?? 0,
            kind: enemy.kind ?? "",
            bossId: enemy.bossId ?? "",
            x: fixed(enemy.x),
            y: fixed(enemy.y),
            vx: fixed(enemy.vx),
            vy: fixed(enemy.vy),
            hp: fixed(enemy.hp),
            dead: enemy.dead,
            status: projectStatus(ENEMY_STATUS_FIELDS, enemy),
            ...(enemy.kind === "rimehound"
              ? {
                  rimehound: Object.freeze({
                    atk: enemy.atk ?? "",
                    atkT: fixed(enemy.atkT ?? 0),
                    atkCd: fixed(enemy.atkCd ?? 0),
                    packRole: enemy.packRole ?? "",
                    packFlank: enemy.packFlank ?? 0,
                    packLockT: fixed(enemy.packLockT ?? 0),
                    packAttackAuthorized: enemy.packAttackAuthorized ?? false,
                    pounceTargetX: fixed(enemy.pounceTargetX ?? 0),
                    pounceAirborne: enemy.pounceAirborne ?? false,
                    auroraDirection: enemy.auroraDirection ?? 0,
                    auroraResponseT: fixed(enemy.auroraResponseT ?? 0),
                    auroraPounceExtended: enemy.auroraPounceExtended ?? false,
                  }),
                }
              : {}),
            ...(enemy.kind === "white-hart"
              ? {
                  whiteHart: Object.freeze({
                    state: enemy.state ?? "",
                    atk: enemy.atk ?? "",
                    stateT: fixed(enemy.stateT ?? 0),
                    stateMax: fixed(enemy.stateMax ?? 0),
                    phaseMarker: enemy.phaseMarker ?? 1,
                    attackCursor: enemy.attackCursor ?? 0,
                    attackStep: enemy.attackStep ?? 0,
                    attackSequence: enemy.attackSequence ?? 0,
                    environmentSequence: enemy.environmentSequence ?? 0,
                    routeProgress: fixed(enemy.routeProgress ?? 0),
                    trueRouteIndex: enemy.trueRouteIndex ?? -1,
                    fracturePlatformId: enemy.fracturePlatformId ?? null,
                    fractureWindow: enemy.fractureWindow ?? false,
                    batonStrike: fixed(enemy.batonStrike ?? 0),
                    auroraBossChargeActive: enemy.auroraBossChargeActive ?? false,
                    parryOutcome: enemy.parryOutcome ?? "none",
                    routeTelegraph: Object.freeze(
                      (enemy.routeTelegraph ?? []).map((point) =>
                        Object.freeze({
                          x: fixed(point.x),
                          y: fixed(point.y),
                        }),
                      ),
                    ),
                    candidateRoutes: Object.freeze(
                      (enemy.candidateRoutes ?? []).map((route) =>
                        Object.freeze(
                          route.map((point) =>
                            Object.freeze({
                              x: fixed(point.x),
                              y: fixed(point.y),
                            }),
                          ),
                        ),
                      ),
                    ),
                  }),
                }
              : {}),
          }),
        )
        .sort((left, right) => left.id - right.id || left.kind.localeCompare(right.kind)),
    ),
    ...(environment === undefined ? {} : { environment: projectEnvironmentSemanticSnapshot(environment) }),
    ...(run?.mode !== "tutorial" || tutorial === undefined || tutorial.phase === "inactive"
      ? {}
      : { tutorial: Object.freeze(structuredClone(tutorial)) }),
  });
}

/**
 * Captures what projectCanonicalGameplayState reads and defers the projection
 * until a consumer reads it. Run, player and blade are copied by value here.
 * The other inputs are already detached from the live world by their owners:
 * the input snapshot is frozen, enemy rows are fresh value copies whose route
 * point arrays the White Hart only ever replaces with deeply frozen ones,
 * environment snapshots hold immutable entries, and a tutorial checkpoint is a
 * fresh copy. A deferred projection therefore equals the eager one at capture.
 */
export function captureCanonicalGameplayState(
  tick: number,
  input: AuthoritativeInputSnapshot,
  run: RuntimeRunState | null,
  player: RuntimePlayerState | null,
  blade: RuntimeBladeState | null,
  enemies: readonly RuntimeEnemyState[],
  environment?: EnvironmentSnapshot,
  tutorial?: TutorialSessionCheckpoint,
): DeferredCanonicalState<CanonicalGameplayState> {
  const runValue =
    run === null
      ? null
      : { mode: run.mode, wave: run.wave, score: run.score, runTime: run.runTime, runSeed: run.runSeed };
  const playerValue =
    player === null
      ? null
      : {
          x: player.x,
          y: player.y,
          vx: player.vx,
          vy: player.vy,
          hp: player.hp,
          ...copyStatus(PLAYER_STATUS_FIELDS, player),
        };
  const bladeValue = blade === null ? null : { state: blade.state, x: blade.x, y: blade.y, vx: blade.vx, vy: blade.vy };
  return new DeferredCanonicalState(() =>
    projectCanonicalGameplayState(tick, input, runValue, playerValue, bladeValue, enemies, environment, tutorial),
  );
}
