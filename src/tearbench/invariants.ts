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
    ...observation.entities.flatMap((entity) => [entity.x, entity.y, entity.vx, entity.vy,
      ...(entity.hpRatio === undefined ? [] : [entity.hpRatio]), ...(entity.damage === undefined ? [] : [entity.damage])]),
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
    if (diagnostics?.waveOwnership === "unavailable" || diagnostics?.livingWaveEnemies === undefined) {
      throw new Error("wave completion requires source-owned current-wave actor evidence");
    }
    return diagnostics.waveComplete === true && diagnostics.livingWaveEnemies > 0
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
  "environment.finite-state": (observation) => {
    const environment = observation.environment;
    if (environment === undefined) throw new Error("environment finite-state requires structured environment observation");
    const values = environment.fields.flatMap((entry) => [entry.bounds.minX, entry.bounds.maxX, entry.bounds.minY, entry.bounds.maxY])
      .concat(environment.combatObjects.flatMap((entry) => [entry.bounds.minX, entry.bounds.maxX, entry.bounds.minY, entry.bounds.maxY, entry.integrityRatio]))
      .concat(environment.routes.flatMap((entry) => entry.points.flatMap((point) => [point.x, point.y])));
    return finite(values) ? null : failure("environment.finite-state", observation, "environment observation contains a non-finite value", "fatal");
  },
  "environment.unique-id": (observation) => {
    const environment = observation.environment;
    if (environment === undefined) throw new Error("environment unique-id requires structured environment observation");
    const ids = [...environment.fields, ...environment.combatObjects, ...environment.routes].map((entry) => entry.id);
    return new Set(ids).size === ids.length ? null : failure("environment.unique-id", observation, "environment object IDs are not unique", "fatal");
  },
  "environment.valid-references": (observation) => {
    const environment = observation.environment;
    if (environment === undefined) throw new Error("environment reference invariant requires structured environment observation");
    const ids = new Set(["player", "blade", ...observation.entities.map((entry) => entry.id),
      ...environment.fields.map((entry) => entry.id), ...environment.combatObjects.map((entry) => entry.id), ...environment.routes.map((entry) => entry.id)]);
    const invalid = environment.fields.find((entry) => entry.ownerId !== undefined && !ids.has(entry.ownerId))
      ?? environment.combatObjects.find((entry) => (entry.ownerId !== undefined && !ids.has(entry.ownerId)) || (entry.targetId !== undefined && !ids.has(entry.targetId)))
      ?? environment.routes.find((entry) => entry.ownerId !== undefined && !ids.has(entry.ownerId));
    return invalid === undefined ? null : failure("environment.valid-references", observation, "environment object refers to a missing owner or target", "fatal");
  },
  "environment.no-orphan-link": (observation) => {
    const environment = observation.environment;
    if (environment === undefined) throw new Error("environment orphan invariant requires structured environment observation");
    const ids = new Set(["player", "blade", ...observation.entities.map((entry) => entry.id),
      ...environment.fields.map((entry) => entry.id), ...environment.combatObjects.map((entry) => entry.id), ...environment.routes.map((entry) => entry.id)]);
    const orphan = environment.combatObjects.find((entry) => entry.state !== "destroyed" && entry.state !== "expired"
      && ((entry.ownerId !== undefined && !ids.has(entry.ownerId)) || (entry.targetId !== undefined && !ids.has(entry.targetId))));
    return orphan === undefined ? null : failure("environment.no-orphan-link", observation, `environment relationship ${orphan.id} has an orphan owner or target`, "fatal");
  },
  "environment.legal-transition": (observation, previous) => {
    if (previous === undefined || observation.environment === undefined || previous.environment === undefined) return null;
    const prior = new Map([...previous.environment.fields, ...previous.environment.combatObjects, ...previous.environment.routes].map((entry) => [entry.id, entry.state]));
    const allowed: Readonly<Record<string, readonly string[]>> = {
      scheduled: ["scheduled", "warning", "active", "destroyed", "expired"], warning: ["warning", "active", "cooldown", "destroyed", "expired"],
      active: ["active", "cooldown", "destroyed", "expired"], cooldown: ["cooldown", "active", "destroyed", "expired"],
      destroyed: ["destroyed"], expired: ["expired"],
    };
    const current = [...observation.environment.fields, ...observation.environment.combatObjects, ...observation.environment.routes]
      .find((entry) => prior.has(entry.id) && !(allowed[prior.get(entry.id) ?? ""] ?? []).includes(entry.state));
    return current === undefined ? null : failure("environment.legal-transition", observation, `environment object ${current.id} made an illegal state transition`, "fatal");
  },
  "environment.bounded": (observation) => {
    const environment = observation.environment;
    if (environment === undefined) throw new Error("environment bounds invariant requires structured environment observation");
    return environment.fields.length <= 64 && environment.combatObjects.length <= 128 && environment.routes.length <= 64
      ? null : failure("environment.bounded", observation, "environment population exceeds the declared cap", "fatal");
  },
});

export function runInvariantChecks(
  observation: TearObservationV1,
  ids: readonly TearInvariantId[],
  checks: Readonly<Partial<Record<TearInvariantId, TearInvariantCheck>>> = DEFAULT_INVARIANT_CHECKS,
  previous?: TearObservationV1,
): readonly TearInvariantFailure[] {
  const failures: TearInvariantFailure[] = [];
  for (const id of ids) {
    if (["world.legal-bounds", "wave.valid-completion", "boss.valid-phase", "ui.valid-focus",
      "runtime.pause-freezes-simulation", "runtime.no-softlock"].includes(id)
      && observation.diagnostics === undefined) {
      throw new Error(`requested invariant ${id} requires privileged diagnostic observation`);
    }
    if (id.startsWith("environment.") && observation.environment === undefined) {
      throw new Error(`requested invariant ${id} requires structured environment observation`);
    }
    const check = checks[id];
    if (check === undefined) {
      throw new Error(`requested invariant ${id} has no applicable implementation or required comparison inputs`);
    }
    const result = check(observation, previous);
    if (result !== null) failures.push(result);
  }
  return Object.freeze(failures);
}
