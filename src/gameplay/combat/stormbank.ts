export interface StormEcho {
  x: number;
  y: number;
  t: number;
  arcT: number;
}

export interface StormbankState {
  stormbank: number;
  stormCharges: number;
  stormEchoes: StormEcho[];
}

export interface StormbankTarget {
  readonly x: number;
  readonly y: number;
  readonly dead: boolean;
  readonly isBoss?: boolean;
}

export interface StormbankConfig {
  readonly maxPrimary: readonly number[];
  readonly primaryPerCharge: readonly number[];
  readonly maxTargets: readonly number[];
  readonly radius: number;
  readonly chainDamage: number;
  readonly stun: number;
  readonly echoDuration: number;
  readonly echoInterval: number;
}

export interface StormArc<TTarget extends StormbankTarget> {
  readonly target: TTarget;
  readonly damage: number;
  readonly stun: number;
}

export interface StormbankDischarge<TTarget extends StormbankTarget> {
  readonly charges: number;
  readonly primaryBonus: number;
  readonly arcs: readonly StormArc<TTarget>[];
  readonly label: string;
}

const distance = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

export function dischargeStormbank<TTarget extends StormbankTarget>(
  state: StormbankState,
  config: StormbankConfig,
  origin: Readonly<{ x: number; y: number }>,
  primaryTarget: TTarget,
  primaryDamage: number,
  targets: readonly TTarget[],
): StormbankDischarge<TTarget> | null {
  if (!state.stormbank || !state.stormCharges) return null;
  const tier = Math.max(1, Math.min(3, Math.round(state.stormbank)));
  const index = tier - 1;
  const maximumPrimary = config.maxPrimary[index];
  const primaryPerCharge = config.primaryPerCharge[index];
  const maximumTargets = config.maxTargets[index];
  if (maximumPrimary === undefined || primaryPerCharge === undefined || maximumTargets === undefined) {
    throw new RangeError("stormbank tier configuration is incomplete");
  }
  const charges = state.stormCharges;
  state.stormCharges = 0;
  const primaryBonus = primaryDamage * Math.min(maximumPrimary, charges * primaryPerCharge);
  const targetLimit = Math.min(maximumTargets, Math.ceil(charges / 2));
  const arcs = targets
    .filter((target) => target !== primaryTarget && !target.dead && distance(target.x, target.y, origin.x, origin.y) <= config.radius)
    .sort((left, right) => distance(left.x, left.y, origin.x, origin.y) - distance(right.x, right.y, origin.x, origin.y))
    .slice(0, targetLimit)
    .map((target) => ({
      target,
      damage: config.chainDamage * (0.7 + charges * 0.06),
      stun: tier >= 2 && !target.isBoss ? config.stun : 0,
    }));
  if (tier >= 3) {
    state.stormEchoes.push({ x: origin.x, y: origin.y, t: config.echoDuration, arcT: config.echoInterval });
  }
  return Object.freeze({ charges, primaryBonus, arcs, label: `STORMBANK ×${String(charges)}` });
}

export function advanceStormEchoes<TTarget extends StormbankTarget>(
  state: StormbankState,
  config: StormbankConfig,
  seconds: number,
  targets: readonly TTarget[],
): readonly Readonly<{ echo: StormEcho; arc: StormArc<TTarget> }>[] {
  const emitted: { echo: StormEcho; arc: StormArc<TTarget> }[] = [];
  for (const echo of state.stormEchoes) {
    echo.t -= seconds;
    echo.arcT -= seconds;
    if (echo.arcT <= 0 && echo.t > 0) {
      echo.arcT += config.echoInterval;
      const target = targets
        .filter((candidate) => !candidate.dead && distance(candidate.x, candidate.y, echo.x, echo.y) <= config.radius)
        .sort((left, right) => distance(left.x, left.y, echo.x, echo.y) - distance(right.x, right.y, echo.x, echo.y))[0];
      if (target) emitted.push({ echo, arc: { target, damage: config.chainDamage * 0.45, stun: 0 } });
    }
  }
  state.stormEchoes = state.stormEchoes.filter((echo) => echo.t > 0);
  return emitted;
}
