import { isRecord } from "../../domain/records";
import type { EnvironmentSnapshot } from "../environment/environment-contracts";
import { MAX_ATTACK_IDS } from "../environment/combat-object-runtime";
import { ENVIRONMENT_OBJECT_KIND_IDS } from "../environment/environment-object-kinds";
import { environmentObjectDefinition, isEnvironmentObjectKind } from "../environment/environment-definitions";
import type { TearEnvironmentObservationV1 } from "./snapshot-contract";
import { createStableRegistry } from "../../domain/stable-registry";
import {
  COMBAT_OBJECT_KEYS,
  FIELD_KEYS,
  projectEnvironmentHash,
  projectExtensions,
  ROUTE_KEYS,
} from "../environment/environment-projection";

export {
  environmentHash,
  projectEnvironmentHash,
  projectEnvironmentSemanticSnapshot,
  rebaseEnvironmentSnapshot,
} from "../environment/environment-projection";

/** The State Setup factories an environment object may name as its source. */
export const ENVIRONMENT_STATE_SETUP_FACTORY_IDS = Object.freeze([
  "environment-field",
  "environment-combat-object",
  "environment-route",
] as const);
export const ENVIRONMENT_STATE_SETUP_FACTORY_REGISTRY = createStableRegistry(
  "environment State Setup factory",
  ENVIRONMENT_STATE_SETUP_FACTORY_IDS,
);

export interface EnvironmentCodecIssue {
  readonly path: string;
  readonly message: string;
}

export interface EnvironmentCodecValidationPort {
  readonly id: string;
  validateField?(value: Readonly<Record<string, unknown>>, path: string): readonly EnvironmentCodecIssue[];
  validateCombatObject?(value: Readonly<Record<string, unknown>>, path: string): readonly EnvironmentCodecIssue[];
  validateRoute?(value: Readonly<Record<string, unknown>>, path: string): readonly EnvironmentCodecIssue[];
}

const STATES = new Set(["scheduled", "warning", "active", "cooldown", "dormant", "destroyed", "expired"]);
const KINDS = new Set<string>(ENVIRONMENT_OBJECT_KIND_IDS);
const MAX_FIELDS = 64;
const MAX_COMBAT_OBJECTS = 128;
const MAX_ROUTES = 64;
const MAX_POINTS = 256;
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function nonNegative(value: unknown): value is number {
  return finite(value) && value >= 0;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function issue(path: string, message: string): EnvironmentCodecIssue {
  return Object.freeze({ path, message });
}

function geometry(value: unknown, path: string): EnvironmentCodecIssue[] {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y))
    return [issue(path, "geometry requires finite x and y")];
  const issues: EnvironmentCodecIssue[] = [];
  for (const key of ["w", "h", "radius"] as const) {
    if (value[key] !== undefined && !nonNegative(value[key]))
      issues.push(issue(`${path}.${key}`, `${key} must be finite and non-negative`));
  }
  if (value.points !== undefined) {
    if (!Array.isArray(value.points) || value.points.length > MAX_POINTS)
      issues.push(issue(`${path}.points`, "points must be a bounded array"));
    else
      value.points.forEach((point, index) => {
        if (!isRecord(point) || !finite(point.x) || !finite(point.y))
          issues.push(issue(`${path}.points[${String(index)}]`, "point must contain finite x and y"));
      });
  }
  return issues;
}

function common(
  path: string,
  value: Readonly<Record<string, unknown>>,
  category: "field" | "combat-object" | "route",
): EnvironmentCodecIssue[] {
  const issues: EnvironmentCodecIssue[] = [];
  if (!text(value.id)) issues.push(issue(`${path}.id`, "environment object requires a stable id"));
  if (!text(value.kind) || !KINDS.has(value.kind))
    issues.push(issue(`${path}.kind`, "environment object kind is not approved"));
  else if (isEnvironmentObjectKind(value.kind) && environmentObjectDefinition(value.kind).category !== category) {
    issues.push(issue(`${path}.kind`, `environment kind is not approved for ${category} collection`));
  }
  const sourceOwnedFactory =
    value.factoryId === value.kind &&
    isEnvironmentObjectKind(value.kind) &&
    environmentObjectDefinition(value.kind).category === category;
  if (
    value.factoryId !== undefined &&
    (!text(value.factoryId) || (!ENVIRONMENT_STATE_SETUP_FACTORY_REGISTRY.has(value.factoryId) && !sourceOwnedFactory))
  )
    issues.push(issue(`${path}.factoryId`, "environment factory is not approved"));
  if (category === "route") {
    if (!Array.isArray(value.points)) issues.push(issue(`${path}.points`, "route requires points"));
    else
      value.points.forEach((point, index) => {
        if (!isRecord(point) || !finite(point.x) || !finite(point.y))
          issues.push(issue(`${path}.points[${String(index)}]`, "route point must contain finite x and y"));
      });
  } else if (!isRecord(value.geometry)) issues.push(issue(`${path}.geometry`, "environment object requires geometry"));
  else issues.push(...geometry(value.geometry, `${path}.geometry`));
  if (!STATES.has(value.state as string))
    issues.push(issue(`${path}.state`, "environment object state is not approved"));
  if (!Number.isSafeInteger(value.stateTick) || Number(value.stateTick) < 0)
    issues.push(issue(`${path}.stateTick`, "stateTick must be a non-negative safe integer"));
  if (value.ownerId !== null && !text(value.ownerId))
    issues.push(issue(`${path}.ownerId`, "ownerId must be null or a stable ID"));
  if (value.cleanupReason !== null && !text(value.cleanupReason))
    issues.push(issue(`${path}.cleanupReason`, "cleanupReason must be null or a stable reason"));
  return issues;
}

function duplicateIds(values: readonly unknown[], path: string): EnvironmentCodecIssue[] {
  const seen = new Set<string>();
  const issues: EnvironmentCodecIssue[] = [];
  values.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== "string") return;
    if (seen.has(entry.id))
      issues.push(issue(`${path}[${String(index)}].id`, `duplicate environment object id ${entry.id}`));
    seen.add(entry.id);
  });
  return issues;
}

/** Validates the v2 hazard payload's canonical environment collections. */
export function validateEnvironmentCodecPayload(
  payload: unknown,
  validators: readonly EnvironmentCodecValidationPort[] = [],
): readonly EnvironmentCodecIssue[] {
  if (!isRecord(payload)) return Object.freeze([issue("$", "hazard codec payload must be an object")]);
  const issues: EnvironmentCodecIssue[] = [];
  if (
    payload.allocator !== undefined &&
    (!isRecord(payload.allocator) ||
      Object.keys(payload.allocator).sort().join() !== "nextSequence,version" ||
      payload.allocator.version !== 1 ||
      !Number.isSafeInteger(payload.allocator.nextSequence) ||
      Number(payload.allocator.nextSequence) < 1)
  )
    issues.push(issue("$.allocator", "Invalid environment allocator continuation"));
  for (const key of ["slowZones", "walls", "fields", "combatObjects", "routes"] as const) {
    if (!Array.isArray(payload[key])) issues.push(issue(`$.${key}`, `${key} must be an array`));
  }
  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const combatObjects = Array.isArray(payload.combatObjects) ? payload.combatObjects : [];
  const routes = Array.isArray(payload.routes) ? payload.routes : [];
  if (fields.length > MAX_FIELDS) issues.push(issue("$.fields", "field population cap exceeded"));
  if (combatObjects.length > MAX_COMBAT_OBJECTS)
    issues.push(issue("$.combatObjects", "combat-object population cap exceeded"));
  if (routes.length > MAX_ROUTES) issues.push(issue("$.routes", "route population cap exceeded"));
  for (const [key, values] of [
    ["fields", fields],
    ["combatObjects", combatObjects],
    ["routes", routes],
  ] as const) {
    issues.push(...duplicateIds(values, `$.${key}`));
    values.forEach((entry, index) => {
      const path = `$.${key}[${String(index)}]`;
      if (!isRecord(entry)) {
        issues.push(issue(path, "environment collection entry must be an object"));
        return;
      }
      issues.push(...common(path, entry, key === "routes" ? "route" : key === "fields" ? "field" : "combat-object"));
      const expectedFactory =
        key === "fields"
          ? "environment-field"
          : key === "combatObjects"
            ? "environment-combat-object"
            : "environment-route";
      const category = key === "fields" ? "field" : key === "combatObjects" ? "combat-object" : "route";
      const sourceOwnedFactory =
        entry.factoryId === entry.kind &&
        isEnvironmentObjectKind(entry.kind) &&
        environmentObjectDefinition(entry.kind).category === category;
      if (entry.factoryId !== undefined && entry.factoryId !== expectedFactory && !sourceOwnedFactory)
        issues.push(
          issue(
            `${path}.factoryId`,
            `factoryId must be ${expectedFactory} or the source-owned kind for this collection`,
          ),
        );
      if (key === "fields") {
        if (typeof entry.timer !== "number" || !Number.isFinite(entry.timer) || entry.timer < 0)
          issues.push(issue(`${path}.timer`, "timer must be finite and non-negative"));
        const eligibility = entry.eligibility;
        if (
          !isRecord(eligibility) ||
          ["player", "enemies", "bosses"].some((name) => typeof eligibility[name] !== "boolean")
        )
          issues.push(issue(`${path}.eligibility`, "eligibility must declare player, enemies, and bosses booleans"));
        if (entry.schedule !== null && entry.schedule !== undefined && !isRecord(entry.schedule))
          issues.push(issue(`${path}.schedule`, "schedule must be null or an object"));
        if (isRecord(entry.schedule))
          for (const name of ["startTick", "endTick", "intervalTicks"] as const) {
            const scheduleValue = entry.schedule[name];
            if (
              scheduleValue !== undefined &&
              (typeof scheduleValue !== "number" || !Number.isSafeInteger(scheduleValue) || scheduleValue < 0)
            )
              issues.push(issue(`${path}.schedule.${name}`, `${name} must be a non-negative safe integer`));
          }
        if (
          entry.force !== null &&
          entry.force !== undefined &&
          (!isRecord(entry.force) ||
            !finite(entry.force.x) ||
            !finite(entry.force.y) ||
            !finite(entry.force.magnitude) ||
            entry.force.magnitude < 0)
        )
          issues.push(issue(`${path}.force`, "force must contain finite x, y, and non-negative magnitude"));
        for (const validator of validators) issues.push(...(validator.validateField?.(entry, path) ?? []));
      } else if (key === "combatObjects") {
        if (entry.targetId !== null && !text(entry.targetId))
          issues.push(issue(`${path}.targetId`, "targetId must be null or a stable ID"));
        if (
          !finite(entry.integrity) ||
          !finite(entry.maxIntegrity) ||
          entry.maxIntegrity <= 0 ||
          entry.integrity < 0 ||
          entry.integrity > entry.maxIntegrity
        )
          issues.push(issue(`${path}.integrity`, "integrity must be finite and within maxIntegrity"));
        if (!Array.isArray(entry.counterplayTags) || entry.counterplayTags.some((tag) => !text(tag)))
          issues.push(issue(`${path}.counterplayTags`, "counterplayTags must be a string array"));
        else {
          if (new Set(entry.counterplayTags).size !== entry.counterplayTags.length)
            issues.push(issue(`${path}.counterplayTags`, "counterplayTags must be unique"));
          if (isEnvironmentObjectKind(entry.kind)) {
            const allowed = new Set(environmentObjectDefinition(entry.kind).counterplayTags);
            if (entry.counterplayTags.some((tag) => !allowed.has(tag as never)))
              issues.push(issue(`${path}.counterplayTags`, "counterplayTags are not source-approved for this kind"));
          }
        }
        if (!text(entry.damageDedupeId)) issues.push(issue(`${path}.damageDedupeId`, "damageDedupeId is required"));
        if (
          entry.damagedBy !== undefined &&
          (!Array.isArray(entry.damagedBy) ||
            entry.damagedBy.length > MAX_ATTACK_IDS ||
            entry.damagedBy.some((attack) => !text(attack)))
        )
          issues.push(issue(`${path}.damagedBy`, "damagedBy must be a bounded string array"));
        if (entry.procEligible !== false)
          issues.push(issue(`${path}.procEligible`, "environment combat objects cannot be ordinary-proc eligible"));
        for (const validator of validators) issues.push(...(validator.validateCombatObject?.(entry, path) ?? []));
      } else {
        if (!Array.isArray(entry.points) || entry.points.length < 2 || entry.points.length > MAX_POINTS)
          issues.push(issue(`${path}.points`, "route points must be a bounded array with at least two points"));
        else
          entry.points.forEach((point, pointIndex) => {
            if (!isRecord(point) || !finite(point.x) || !finite(point.y))
              issues.push(issue(`${path}.points[${String(pointIndex)}]`, "route point must contain finite x and y"));
          });
        for (const validator of validators) issues.push(...(validator.validateRoute?.(entry, path) ?? []));
      }
    });
  }
  return Object.freeze(issues);
}

export function environmentSnapshotToObservation(value: unknown): TearEnvironmentObservationV1 {
  const projection = projectEnvironmentHash(value) as Readonly<Record<string, unknown>>;
  const bounds = (geometryValue: unknown): Readonly<{ minX: number; maxX: number; minY: number; maxY: number }> => {
    const geometryRecord = geometryValue as Readonly<Record<string, unknown>>;
    const x = Number(geometryRecord.x),
      y = Number(geometryRecord.y),
      w = Number(geometryRecord.w ?? 0),
      h = Number(geometryRecord.h ?? 0);
    return Object.freeze({ minX: x, maxX: x + w, minY: y, maxY: y + h });
  };
  return Object.freeze({
    fields: (projection.fields as readonly Readonly<Record<string, unknown>>[]).map((entry) =>
      Object.freeze({
        id: entry.id as string,
        kind: entry.kind,
        bounds: bounds(entry.geometry),
        state: entry.state,
        active: entry.state === "active",
        ...(typeof entry.ownerId === "string" ? { ownerId: entry.ownerId } : {}),
        eligibility: entry.eligibility,
        ...projectExtensions(entry, new Set([...FIELD_KEYS, "geometry"]), new Map()),
      }),
    ),
    combatObjects: (projection.combatObjects as readonly Readonly<Record<string, unknown>>[]).map((entry) =>
      Object.freeze({
        id: entry.id as string,
        kind: entry.kind,
        ...(typeof entry.ownerId === "string" ? { ownerId: entry.ownerId } : {}),
        ...(typeof entry.targetId === "string" ? { targetId: entry.targetId } : {}),
        bounds: bounds(entry.geometry),
        integrityRatio: Number(entry.maxIntegrity) > 0 ? Number(entry.integrity) / Number(entry.maxIntegrity) : 0,
        state: entry.state,
        counterplayTags: entry.counterplayTags,
        procEligible: entry.procEligible,
        ...projectExtensions(entry, new Set([...COMBAT_OBJECT_KEYS, "geometry"]), new Map()),
      }),
    ),
    routes: (projection.routes as readonly Readonly<Record<string, unknown>>[]).map((entry) =>
      Object.freeze({
        id: entry.id as string,
        kind: entry.kind,
        points: entry.points,
        state: entry.state,
        ...(typeof entry.ownerId === "string" ? { ownerId: entry.ownerId } : {}),
        ...projectExtensions(entry, ROUTE_KEYS, new Map()),
      }),
    ),
  }) as TearEnvironmentObservationV1;
}

export type { EnvironmentSnapshot };
