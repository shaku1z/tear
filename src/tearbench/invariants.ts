import type { TearInvariantId } from "./registries";
import type { TearObservationV1 } from "./contracts";

export interface TearInvariantFailure {
  readonly id: TearInvariantId;
  readonly severity: "info" | "warning" | "error" | "fatal";
  readonly tick: number;
  readonly message: string;
}

export type TearInvariantCheck = (
  observation: TearObservationV1,
  previous?: TearObservationV1,
) => TearInvariantFailure | null;

const failure = (
  id: TearInvariantId,
  observation: TearObservationV1,
  message: string,
  severity: TearInvariantFailure["severity"] = "error",
): TearInvariantFailure => Object.freeze({ id, severity, tick: observation.tick, message });

function finite(values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}

export const DEFAULT_INVARIANT_CHECKS: Readonly<Partial<Record<TearInvariantId, TearInvariantCheck>>> = Object.freeze({
  "runtime.finite-state": (observation) => finite([
    observation.player.x, observation.player.y, observation.player.vx, observation.player.vy,
    observation.blade.handX, observation.blade.handY, observation.blade.tipX, observation.blade.tipY,
  ]) ? null : failure("runtime.finite-state", observation, "authoritative state contains a non-finite number", "fatal"),
  "player.finite-transform": (observation) => finite([
    observation.player.x, observation.player.y, observation.player.vx, observation.player.vy,
  ]) ? null : failure("player.finite-transform", observation, "player transform is not finite", "fatal"),
  "blade.finite-transform": (observation) => finite([
    observation.blade.handX, observation.blade.handY, observation.blade.tipX, observation.blade.tipY,
    observation.blade.vx, observation.blade.vy, observation.blade.tipSpeed,
  ]) ? null : failure("blade.finite-transform", observation, "blade transform is not finite", "fatal"),
  "entity.unique-id": (observation) => {
    const ids = observation.entities.map((entity) => entity.id);
    return new Set(ids).size === ids.length ? null : failure("entity.unique-id", observation, "entity IDs are not unique", "fatal");
  },
  "entity.valid-owner": (observation) => {
    const ids = new Set(observation.entities.map((entity) => entity.id));
    ids.add("player");
    const invalid = observation.entities.find((entity) => entity.ownerId !== undefined && !ids.has(entity.ownerId));
    return invalid === undefined
      ? null
      : failure("entity.valid-owner", observation, `entity ${invalid.id} refers to missing owner ${invalid.ownerId ?? ""}`, "fatal");
  },
  "player.valid-health": (observation) => {
    const { hp, maxHp } = observation.player;
    return finite([hp, maxHp]) && maxHp > 0 && hp >= 0 && hp <= maxHp
      ? null
      : failure("player.valid-health", observation, `player health ${String(hp)}/${String(maxHp)} is invalid`, "fatal");
  },
  "world.legal-bounds": (observation) => {
    const bounds = observation.diagnostics?.worldBounds;
    if (bounds === undefined) return null;
    const actors = [
      { id: "player", x: observation.player.x, y: observation.player.y },
      ...observation.entities.map(({ id, x, y }) => ({ id, x, y })),
    ];
    const invalid = actors.find(({ x, y }) =>
      x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY);
    return invalid === undefined
      ? null
      : failure("world.legal-bounds", observation, `${invalid.id} is outside declared world bounds`);
  },
  "wave.valid-completion": (observation) => {
    const diagnostics = observation.diagnostics;
    return diagnostics?.waveComplete === true && (diagnostics.livingWaveEnemies ?? 0) > 0
      ? failure("wave.valid-completion", observation, "wave is complete while wave-owned enemies remain")
      : null;
  },
  "boss.valid-phase": (observation) => {
    const boss = observation.diagnostics?.boss;
    return boss !== undefined && !boss.validPhases.includes(boss.phase)
      ? failure("boss.valid-phase", observation, `boss ${boss.id} is in undeclared phase ${boss.phase}`)
      : null;
  },
  "ui.valid-focus": (observation) => {
    const ui = observation.diagnostics?.ui;
    return ui?.focusedId !== undefined && !ui.focusableIds.includes(ui.focusedId)
      ? failure("ui.valid-focus", observation, `UI focus points to non-focusable control ${ui.focusedId}`)
      : null;
  },
  "runtime.pause-freezes-simulation": (observation, previous) => {
    if (previous === undefined || observation.diagnostics?.paused !== true) return null;
    return observation.run.elapsedTicks === previous.run.elapsedTicks
      ? null
      : failure("runtime.pause-freezes-simulation", observation, "authoritative elapsed time advanced while paused");
  },
  "runtime.no-softlock": (observation) => {
    const progressTick = observation.diagnostics?.progressTick;
    const limit = observation.diagnostics?.softlockLimitTicks;
    return progressTick !== undefined && limit !== undefined && observation.tick - progressTick > limit
      ? failure("runtime.no-softlock", observation, `no declared progress for ${String(observation.tick - progressTick)} ticks`)
      : null;
  },
  "replay.monotonic-time": (observation, previous) =>
    previous === undefined || observation.tick > previous.tick
      ? null
      : failure("replay.monotonic-time", observation, `tick ${String(observation.tick)} did not advance`, "fatal"),
  "test.production-isolation": () => null,
});

export function runInvariantChecks(
  observation: TearObservationV1,
  ids: readonly TearInvariantId[],
  checks: Readonly<Partial<Record<TearInvariantId, TearInvariantCheck>>> = DEFAULT_INVARIANT_CHECKS,
  previous?: TearObservationV1,
): readonly TearInvariantFailure[] {
  const failures: TearInvariantFailure[] = [];
  for (const id of ids) {
    const check = checks[id];
    if (check === undefined) continue;
    const result = check(observation, previous);
    if (result !== null) failures.push(result);
  }
  return Object.freeze(failures);
}
