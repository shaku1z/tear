import { advanceOverrun, type OverrunConfig, type OverrunState } from "./overrun";
import { advanceStormEchoes, type StormbankConfig, type StormbankState, type StormbankTarget } from "./stormbank";

export interface WeaponRuntimeTarget extends StormbankTarget {
  readonly radius: number;
  readonly anchored?: boolean;
  readonly weight: number;
  vx: number;
  vy: number;
  hit(damage: number, fromX: number, fromY: number): void;
}

export interface WeaponAbilityPorts<TTarget extends WeaponRuntimeTarget> {
  ribbon(fromX: number, fromY: number, toX: number, toY: number): void;
  killed(target: TTarget): void;
}

export function advanceWeaponAbilities<TTarget extends WeaponRuntimeTarget>(
  state: OverrunState & StormbankState,
  overrun: OverrunConfig,
  stormbank: StormbankConfig,
  seconds: number,
  targets: readonly TTarget[],
  ports: WeaponAbilityPorts<TTarget>,
): void {
  advanceOverrun(state, overrun, seconds);
  for (const { echo, arc } of advanceStormEchoes(state, stormbank, seconds, targets)) {
    const target = arc.target;
    target.hit(arc.damage, target.x - echo.x, target.y - echo.y);
    ports.ribbon(echo.x, echo.y, target.x, target.y);
    if (target.dead) ports.killed(target);
  }
}

export interface WeaponLogEntry extends Record<string, unknown> { readonly t: number; readonly type: string; readonly weaponId: string }

export function appendWeaponEvent(
  log: unknown[] | null | undefined,
  time: number,
  type: string,
  weaponId: string,
  data?: Readonly<Record<string, unknown>> | null,
  capacity = 240,
): void {
  if (!log) return;
  log.push({ t: time, type, weaponId, ...(data ?? {}) });
  while (log.length > capacity) log.shift();
}

export function nearestLivingTarget<T extends Readonly<{ x: number; y: number; dead?: boolean }>>(
  targets: readonly T[], x: number, y: number,
): T | null {
  let best: T | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    if (target.dead) continue;
    const candidate = Math.hypot(target.x - x, target.y - y);
    if (candidate < distance) { distance = candidate; best = target; }
  }
  return best;
}

type CollapsibleTarget = Pick<WeaponRuntimeTarget, "x" | "y" | "vx" | "vy" | "dead" | "anchored" | "weight" | "radius" | "isBoss">;

export function collapseTargets(
  targets: readonly CollapsibleTarget[], x: number, y: number, radius = 190,
): void {
  for (const target of targets) {
    if (target.dead || target.anchored || Math.hypot(target.x - x, target.y - y) > radius + target.radius) continue;
    const dx = x - target.x;
    const dy = y - target.y;
    const magnitude = Math.hypot(dx, dy) || 1;
    const resistance = target.isBoss ? 0.12 : 1 / target.weight;
    target.vx += dx / magnitude * 640 * resistance;
    target.vy += dy / magnitude * 420 * resistance;
  }
}

export function invokeWeaponHook(
  weapon: Readonly<object> | null | undefined,
  name: string,
  context: Readonly<Record<string, unknown>> = {},
): unknown {
  const hook: unknown = weapon === null || weapon === undefined ? undefined : Reflect.get(weapon, name);
  if (!isWeaponHook(hook)) return undefined;
  return hook(context);
}

function isWeaponHook(value: unknown): value is (context: Readonly<Record<string, unknown>>) => unknown {
  return typeof value === "function";
}

export function addKillScore(
  run: { score: number; wave: number; mult: number; scoreMod?: number; waveKills: number },
  scorePerKill: number,
  scoreMultiplier: number,
): void {
  run.score += Math.round(scorePerKill * run.wave * run.mult * scoreMultiplier * (run.scoreMod ?? 1));
  run.waveKills += 1;
}
