import { stableVerificationHash } from "../replay/hash";
import { ENVIRONMENT_OBJECT_KIND_IDS, type EnvironmentSnapshot } from "../gameplay/environment/environment-contracts";
import { environmentObjectDefinition, isEnvironmentObjectKind } from "../gameplay/environment/environment-definitions";
import { isValidBloomWellForcePolicy } from "../gameplay/environment/bloom-well";
import type { TearEnvironmentObservationV1 } from "./contracts";
import { ENVIRONMENT_STATE_FORGE_FACTORY_REGISTRY } from "./state-forge-factories";

export interface EnvironmentCodecIssue {
  readonly path: string;
  readonly message: string;
}

const STATES = new Set(["scheduled", "warning", "active", "cooldown", "dormant", "destroyed", "expired"]);
const KINDS = new Set<string>(ENVIRONMENT_OBJECT_KIND_IDS);
const MAX_FIELDS = 64;
const MAX_COMBAT_OBJECTS = 128;
const MAX_ROUTES = 64;
const MAX_POINTS = 256;

function isGeneratedEnvironmentId(id: string, worldId: string): boolean {
  if (!id.startsWith(`${worldId}:`)) return false;
  const parts = id.slice(worldId.length + 1).split(":");
  return parts.length === 2 && ["field", "combat-object", "route"].includes(parts[0] ?? "")
    && /^\d+$/u.test(parts[1] ?? "");
}

function environmentIdRemapping(value: Readonly<Record<string, unknown>>): ReadonlyMap<string, string> {
  const worldId = typeof value.worldId === "string" ? value.worldId : undefined;
  if (worldId === undefined) return new Map();
  const result = new Map<string, string>();
  for (const [key, prefix] of [["fields", "field"], ["combatObjects", "combat-object"], ["routes", "route"]] as const) {
    const entries = Array.isArray(value[key]) ? value[key] : [];
    entries.forEach((entry, index) => {
      if (!record(entry) || typeof entry.id !== "string" || !isGeneratedEnvironmentId(entry.id, worldId)) return;
      result.set(entry.id, `generated:${prefix}:${String(index)}`);
    });
  }
  return result;
}

function portableEnvironmentId(value: unknown, remapping: ReadonlyMap<string, string>): unknown {
  return typeof value === "string" ? remapping.get(value) ?? value : value;
}

/** Rehomes allocator-generated environment IDs while preserving authored IDs. */
export function rebaseEnvironmentSnapshot(value: unknown, destinationWorldId: string): EnvironmentSnapshot {
  if (!text(destinationWorldId)) throw new TypeError("destination environment world ID is required");
  if (!record(value)) throw new TypeError("environment snapshot must be an object");
  const sourceWorldId = typeof value.worldId === "string" ? value.worldId : undefined;
  const remapping = new Map<string, string>();
  if (sourceWorldId !== undefined && sourceWorldId !== destinationWorldId) {
    for (const key of ["fields", "combatObjects", "routes"] as const) {
      const entries = Array.isArray(value[key]) ? value[key] : [];
      entries.forEach((entry) => {
        if (!record(entry) || typeof entry.id !== "string" || !isGeneratedEnvironmentId(entry.id, sourceWorldId)) return;
        remapping.set(entry.id, `${destinationWorldId}:${entry.id.slice(sourceWorldId.length + 1)}`);
      });
    }
  }
  const rewrite = (entry: unknown): unknown => {
    if (!record(entry)) return entry;
    const references = ["ownerId", "targetId", "sourceId"] as const;
    const result: Record<string, unknown> = { ...entry, id: portableEnvironmentId(entry.id, remapping) };
    for (const key of references) if (key in entry) result[key] = portableEnvironmentId(entry[key], remapping);
    for (const key of ["targetIds", "linkedActorIds"] as const) {
      if (Array.isArray(entry[key])) result[key] = entry[key].map((reference) => portableEnvironmentId(reference, remapping));
    }
    return result;
  };
  const list = (key: "fields" | "combatObjects" | "routes"): readonly unknown[] =>
    (Array.isArray(value[key]) ? value[key] : []).map(rewrite);
  return Object.freeze({ worldId: destinationWorldId, stageId: typeof value.stageId === "string" ? value.stageId : "unknown",
    fields: list("fields"), combatObjects: list("combatObjects"), routes: list("routes") }) as EnvironmentSnapshot;
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function nonNegative(value: unknown): value is number { return finite(value) && value >= 0; }
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function issue(path: string, message: string): EnvironmentCodecIssue { return Object.freeze({ path, message }); }

function geometry(value: unknown, path: string): EnvironmentCodecIssue[] {
  if (!record(value) || !finite(value.x) || !finite(value.y)) return [issue(path, "geometry requires finite x and y")];
  const issues: EnvironmentCodecIssue[] = [];
  for (const key of ["w", "h", "radius"] as const) {
    if (value[key] !== undefined && !nonNegative(value[key])) issues.push(issue(`${path}.${key}`, `${key} must be finite and non-negative`));
  }
  if (value.points !== undefined) {
    if (!Array.isArray(value.points) || value.points.length > MAX_POINTS) issues.push(issue(`${path}.points`, "points must be a bounded array"));
    else value.points.forEach((point, index) => {
      if (!record(point) || !finite(point.x) || !finite(point.y)) issues.push(issue(`${path}.points[${String(index)}]`, "point must contain finite x and y"));
    });
  }
  return issues;
}

function common(path: string, value: Readonly<Record<string, unknown>>, category: "field" | "combat-object" | "route"): EnvironmentCodecIssue[] {
  const issues: EnvironmentCodecIssue[] = [];
  if (!text(value.id)) issues.push(issue(`${path}.id`, "environment object requires a stable id"));
  if (!text(value.kind) || !KINDS.has(value.kind)) issues.push(issue(`${path}.kind`, "environment object kind is not approved"));
  else if (isEnvironmentObjectKind(value.kind) && environmentObjectDefinition(value.kind).category !== category) {
    issues.push(issue(`${path}.kind`, `environment kind is not approved for ${category} collection`));
  }
  if (value.factoryId !== undefined && (!text(value.factoryId) || !ENVIRONMENT_STATE_FORGE_FACTORY_REGISTRY.has(value.factoryId))) issues.push(issue(`${path}.factoryId`, "environment factory is not approved"));
  if (category === "route") {
    if (!Array.isArray(value.points)) issues.push(issue(`${path}.points`, "route requires points"));
    else value.points.forEach((point, index) => { if (!record(point) || !finite(point.x) || !finite(point.y)) issues.push(issue(`${path}.points[${String(index)}]`, "route point must contain finite x and y")); });
  } else if (!record(value.geometry)) issues.push(issue(`${path}.geometry`, "environment object requires geometry"));
  else issues.push(...geometry(value.geometry, `${path}.geometry`));
  if (!STATES.has(value.state as string)) issues.push(issue(`${path}.state`, "environment object state is not approved"));
  if (!Number.isSafeInteger(value.stateTick) || Number(value.stateTick) < 0) issues.push(issue(`${path}.stateTick`, "stateTick must be a non-negative safe integer"));
  if (value.ownerId !== null && !text(value.ownerId)) issues.push(issue(`${path}.ownerId`, "ownerId must be null or a stable ID"));
  if (value.cleanupReason !== null && !text(value.cleanupReason)) issues.push(issue(`${path}.cleanupReason`, "cleanupReason must be null or a stable reason"));
  return issues;
}

function duplicateIds(values: readonly unknown[], path: string): EnvironmentCodecIssue[] {
  const seen = new Set<string>(); const issues: EnvironmentCodecIssue[] = [];
  values.forEach((entry, index) => {
    if (!record(entry) || typeof entry.id !== "string") return;
    if (seen.has(entry.id)) issues.push(issue(`${path}[${String(index)}].id`, `duplicate environment object id ${entry.id}`));
    seen.add(entry.id);
  });
  return issues;
}

/** Validates the v2 hazard payload's canonical environment collections. */
export function validateEnvironmentCodecPayload(payload: unknown): readonly EnvironmentCodecIssue[] {
  if (!record(payload)) return Object.freeze([issue("$", "hazard codec payload must be an object")]);
  const issues: EnvironmentCodecIssue[] = [];
  for (const key of ["slowZones", "walls", "fields", "combatObjects", "routes"] as const) {
    if (!Array.isArray(payload[key])) issues.push(issue(`$.${key}`, `${key} must be an array`));
  }
  const fields = Array.isArray(payload.fields) ? payload.fields : [];
  const combatObjects = Array.isArray(payload.combatObjects) ? payload.combatObjects : [];
  const routes = Array.isArray(payload.routes) ? payload.routes : [];
  if (fields.length > MAX_FIELDS) issues.push(issue("$.fields", "field population cap exceeded"));
  if (combatObjects.length > MAX_COMBAT_OBJECTS) issues.push(issue("$.combatObjects", "combat-object population cap exceeded"));
  if (routes.length > MAX_ROUTES) issues.push(issue("$.routes", "route population cap exceeded"));
  for (const [key, values] of [["fields", fields], ["combatObjects", combatObjects], ["routes", routes]] as const) {
    issues.push(...duplicateIds(values, `$.${key}`));
    values.forEach((entry, index) => {
      const path = `$.${key}[${String(index)}]`;
      if (!record(entry)) { issues.push(issue(path, "environment collection entry must be an object")); return; }
      issues.push(...common(path, entry, key === "routes" ? "route" : key === "fields" ? "field" : "combat-object"));
      const expectedFactory = key === "fields" ? "environment-field" : key === "combatObjects" ? "environment-combat-object" : "environment-route";
      if (entry.factoryId !== undefined && entry.factoryId !== expectedFactory) issues.push(issue(`${path}.factoryId`, `factoryId must be ${expectedFactory} for this collection`));
      if (key === "fields") {
        if (typeof entry.timer !== "number" || !Number.isFinite(entry.timer) || entry.timer < 0) issues.push(issue(`${path}.timer`, "timer must be finite and non-negative"));
        const eligibility = entry.eligibility;
        if (!record(eligibility) || ["player", "enemies", "bosses"].some((name) => typeof eligibility[name] !== "boolean")) issues.push(issue(`${path}.eligibility`, "eligibility must declare player, enemies, and bosses booleans"));
        if (entry.schedule !== null && entry.schedule !== undefined && !record(entry.schedule)) issues.push(issue(`${path}.schedule`, "schedule must be null or an object"));
        if (record(entry.schedule)) for (const name of ["startTick", "endTick", "intervalTicks"] as const) { const scheduleValue = entry.schedule[name]; if (scheduleValue !== undefined && (typeof scheduleValue !== "number" || !Number.isSafeInteger(scheduleValue) || scheduleValue < 0)) issues.push(issue(`${path}.schedule.${name}`, `${name} must be a non-negative safe integer`)); }
        if (entry.force !== null && entry.force !== undefined && (!record(entry.force) || !finite(entry.force.x) || !finite(entry.force.y) || !finite(entry.force.magnitude) || entry.force.magnitude < 0)) issues.push(issue(`${path}.force`, "force must contain finite x, y, and non-negative magnitude"));
        if (entry.kind === "bloom-well" && text(entry.bloomWellId) && !isValidBloomWellForcePolicy(entry.force)) issues.push(issue(`${path}.force`, "Bloom Well force must fit its bounded declared magnitude"));
      } else if (key === "combatObjects") {
        if (entry.targetId !== null && !text(entry.targetId)) issues.push(issue(`${path}.targetId`, "targetId must be null or a stable ID"));
        if (!finite(entry.integrity) || !finite(entry.maxIntegrity) || entry.maxIntegrity <= 0 || entry.integrity < 0 || entry.integrity > entry.maxIntegrity) issues.push(issue(`${path}.integrity`, "integrity must be finite and within maxIntegrity"));
        if (!Array.isArray(entry.counterplayTags) || entry.counterplayTags.some((tag) => !text(tag))) issues.push(issue(`${path}.counterplayTags`, "counterplayTags must be a string array"));
        else {
          if (new Set(entry.counterplayTags).size !== entry.counterplayTags.length) issues.push(issue(`${path}.counterplayTags`, "counterplayTags must be unique"));
          if (isEnvironmentObjectKind(entry.kind)) {
            const allowed = new Set(environmentObjectDefinition(entry.kind).counterplayTags);
            if (entry.counterplayTags.some((tag) => !allowed.has(tag as never))) issues.push(issue(`${path}.counterplayTags`, "counterplayTags are not source-approved for this kind"));
          }
        }
        if (!text(entry.damageDedupeId)) issues.push(issue(`${path}.damageDedupeId`, "damageDedupeId is required"));
        if (entry.procEligible !== false) issues.push(issue(`${path}.procEligible`, "environment combat objects cannot be ordinary-proc eligible"));
      } else {
        if (!Array.isArray(entry.points) || entry.points.length < 2 || entry.points.length > MAX_POINTS) issues.push(issue(`${path}.points`, "route points must be a bounded array with at least two points"));
        else entry.points.forEach((point, pointIndex) => { if (!record(point) || !finite(point.x) || !finite(point.y)) issues.push(issue(`${path}.points[${String(pointIndex)}]`, "route point must contain finite x and y")); });
      }
    });
  }
  return Object.freeze(issues);
}

const rounded = (value: number): number => Math.round(value * 1_000) / 1_000;
function projectionGeometry(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const firstPoint = Array.isArray(value.points) && record(value.points[0]) ? value.points[0] : undefined;
  const result: Record<string, unknown> = { x: rounded(Number(value.x ?? firstPoint?.x ?? 0)), y: rounded(Number(value.y ?? firstPoint?.y ?? 0)) };
  for (const key of ["w", "h", "radius"] as const) if (typeof value[key] === "number") result[key] = rounded(value[key]);
  if (Array.isArray(value.points)) result.points = value.points.map((point) => ({ x: rounded(Number((point as Record<string, unknown>).x)), y: rounded(Number((point as Record<string, unknown>).y)) }));
  return Object.freeze(result);
}

/** Presentation-independent environment projection used by exact hosts and replay. */
export function projectEnvironmentHash(value: unknown): unknown {
  if (!record(value)) return Object.freeze({ stageId: "unknown", fields: [], combatObjects: [], routes: [] });
  const remapping = environmentIdRemapping(value);
  const list = (key: "fields" | "combatObjects" | "routes"): readonly unknown[] => {
    const entries: readonly unknown[] = Array.isArray(value[key]) ? value[key] : [];
    return entries.map((entry): unknown => {
    if (!record(entry)) return entry;
    const commonValue: Record<string, unknown> = { id: portableEnvironmentId(entry.id, remapping), kind: entry.kind, geometry: projectionGeometry(record(entry.geometry) ? entry.geometry : {}), state: entry.state, stateTick: entry.stateTick, ownerId: portableEnvironmentId(entry.ownerId ?? null, remapping), cleanupReason: entry.cleanupReason ?? null };
    if (key === "fields") Object.assign(commonValue, { timer: finite(entry.timer) ? rounded(entry.timer) : entry.timer, eligibility: entry.eligibility ?? null, force: entry.force ?? null, schedule: entry.schedule ?? null, patternId: entry.patternId ?? null,
      variant: entry.variant ?? null, bloomWellId: entry.bloomWellId ?? null, stageOwnerId: entry.stageOwnerId ?? null,
      bossOwnerId: portableEnvironmentId(entry.bossOwnerId ?? null, remapping), startTick: entry.startTick ?? null, transitionTick: entry.transitionTick ?? null });
    if (key === "combatObjects") Object.assign(commonValue, { targetId: portableEnvironmentId(entry.targetId ?? null, remapping), ...(Array.isArray(entry.targetIds) ? { targetIds: entry.targetIds.map((target) => portableEnvironmentId(target, remapping)) } : {}), ...(Array.isArray(entry.linkedActorIds) ? { linkedActorIds: entry.linkedActorIds.map((target) => portableEnvironmentId(target, remapping)) } : {}), integrity: entry.integrity, maxIntegrity: entry.maxIntegrity, counterplayTags: entry.counterplayTags ?? [], procEligible: entry.procEligible, damageDedupeId: entry.damageDedupeId, patternId: entry.patternId ?? null });
    if (key === "routes") commonValue.points = Array.isArray(entry.points) ? entry.points.map((point) => ({ x: rounded(Number((point as Record<string, unknown>).x)), y: rounded(Number((point as Record<string, unknown>).y)) })) : [];
    return Object.freeze(commonValue);
    });
  };
  return Object.freeze({ stageId: value.stageId ?? "unknown", fields: list("fields"), combatObjects: list("combatObjects"), routes: list("routes") });
}

export function environmentHash(value: unknown): string { return stableVerificationHash(projectEnvironmentHash(value)); }

/** Portable semantic environment state for canonical live/replay comparison. */
export function projectEnvironmentSemanticSnapshot(value: unknown): EnvironmentSnapshot {
  return projectEnvironmentHash(value) as EnvironmentSnapshot;
}

export function environmentSnapshotToObservation(value: unknown): TearEnvironmentObservationV1 {
  const projection = projectEnvironmentHash(value) as Readonly<Record<string, unknown>>;
  const bounds = (geometryValue: unknown): Readonly<{ minX: number; maxX: number; minY: number; maxY: number }> => {
    const geometryRecord = geometryValue as Readonly<Record<string, unknown>>;
    const x = Number(geometryRecord.x), y = Number(geometryRecord.y), w = Number(geometryRecord.w ?? 0), h = Number(geometryRecord.h ?? 0);
    return Object.freeze({ minX: x, maxX: x + w, minY: y, maxY: y + h });
  };
  return Object.freeze({
    fields: (projection.fields as readonly Readonly<Record<string, unknown>>[]).map((entry) => Object.freeze({ id: entry.id as string, kind: entry.kind, bounds: bounds(entry.geometry), state: entry.state, active: entry.state === "active", ...(typeof entry.ownerId === "string" ? { ownerId: entry.ownerId } : {}), eligibility: entry.eligibility })),
    combatObjects: (projection.combatObjects as readonly Readonly<Record<string, unknown>>[]).map((entry) => Object.freeze({ id: entry.id as string, kind: entry.kind, ...(typeof entry.ownerId === "string" ? { ownerId: entry.ownerId } : {}), ...(typeof entry.targetId === "string" ? { targetId: entry.targetId } : {}), bounds: bounds(entry.geometry), integrityRatio: Number(entry.maxIntegrity) > 0 ? Number(entry.integrity) / Number(entry.maxIntegrity) : 0, state: entry.state, counterplayTags: entry.counterplayTags, procEligible: entry.procEligible })),
    routes: (projection.routes as readonly Readonly<Record<string, unknown>>[]).map((entry) => Object.freeze({ id: entry.id as string, kind: entry.kind, points: entry.points, state: entry.state, ...(typeof entry.ownerId === "string" ? { ownerId: entry.ownerId } : {}) })),
  }) as TearEnvironmentObservationV1;
}

export type { EnvironmentSnapshot };
