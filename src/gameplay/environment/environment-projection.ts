// The presentation-independent projection of an environment snapshot: what live play, replay and
// verification compare and hash. It lives with the environment rules because the canonical state
// of a live run uses it; TearBench's codec validates payloads and re-exports it.
import { stableVerificationHash } from "../../domain/hash";
import type { EnvironmentSnapshot } from "./environment-contracts";

const ENVIRONMENT_REFERENCE_KEY = /^(?:owner|target|source|actor).*Id$/iu;

function isGeneratedEnvironmentId(id: string, worldId: string): boolean {
  if (!id.startsWith(`${worldId}:`)) return false;
  const parts = id.slice(worldId.length + 1).split(":");
  return (
    parts.length === 2 && ["field", "combat-object", "route"].includes(parts[0] ?? "") && /^\d+$/u.test(parts[1] ?? "")
  );
}

function environmentIdRemapping(value: Readonly<Record<string, unknown>>): ReadonlyMap<string, string> {
  const worldId = typeof value.worldId === "string" ? value.worldId : undefined;
  if (worldId === undefined) return new Map();
  const result = new Map<string, string>();
  for (const [key, prefix] of [
    ["fields", "field"],
    ["combatObjects", "combat-object"],
    ["routes", "route"],
  ] as const) {
    const entries = Array.isArray(value[key]) ? value[key] : [];
    entries.forEach((entry, index) => {
      if (!record(entry) || typeof entry.id !== "string" || !isGeneratedEnvironmentId(entry.id, worldId)) return;
      result.set(entry.id, `generated:${prefix}:${String(index)}`);
    });
  }
  return result;
}

function portableEnvironmentId(value: unknown, remapping: ReadonlyMap<string, string>): unknown {
  return typeof value === "string" ? (remapping.get(value) ?? value) : value;
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
        if (!record(entry) || typeof entry.id !== "string" || !isGeneratedEnvironmentId(entry.id, sourceWorldId))
          return;
        remapping.set(entry.id, `${destinationWorldId}:${entry.id.slice(sourceWorldId.length + 1)}`);
      });
    }
  }
  const rewrite = (entry: unknown): unknown => {
    if (!record(entry)) return entry;
    const result: Record<string, unknown> = { ...entry, id: portableEnvironmentId(entry.id, remapping) };
    for (const [key, reference] of Object.entries(entry)) {
      if (ENVIRONMENT_REFERENCE_KEY.test(key)) result[key] = portableEnvironmentId(reference, remapping);
      else if (/(?:target|source|actor).*Ids$/iu.test(key) && Array.isArray(reference)) {
        result[key] = reference.map((item) => portableEnvironmentId(item, remapping));
      }
    }
    return result;
  };
  const list = (key: "fields" | "combatObjects" | "routes"): readonly unknown[] =>
    (Array.isArray(value[key]) ? value[key] : []).map(rewrite);
  return Object.freeze({
    ...(value.allocator === undefined ? {} : { allocator: structuredClone(value.allocator) }),
    worldId: destinationWorldId,
    stageId: typeof value.stageId === "string" ? value.stageId : "unknown",
    fields: list("fields"),
    combatObjects: list("combatObjects"),
    routes: list("routes"),
  }) as EnvironmentSnapshot;
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

const rounded = (value: number): number => Math.round(value * 1_000) / 1_000;
function projectionGeometry(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const firstPoint = Array.isArray(value.points) && record(value.points[0]) ? value.points[0] : undefined;
  const result: Record<string, unknown> = {
    x: rounded(Number(value.x ?? firstPoint?.x ?? 0)),
    y: rounded(Number(value.y ?? firstPoint?.y ?? 0)),
  };
  for (const key of ["w", "h", "radius"] as const)
    if (typeof value[key] === "number") result[key] = rounded(value[key]);
  if (Array.isArray(value.points))
    result.points = value.points.map((point) => ({
      x: rounded(Number((point as Record<string, unknown>).x)),
      y: rounded(Number((point as Record<string, unknown>).y)),
    }));
  return Object.freeze(result);
}

function projectData(value: unknown, key: string, remapping: ReadonlyMap<string, string>): unknown {
  if (typeof value === "number") return rounded(value);
  if (typeof value === "string")
    return ENVIRONMENT_REFERENCE_KEY.test(key) ? portableEnvironmentId(value, remapping) : value;
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => projectData(entry, key, remapping)));
  if (!record(value)) return value;
  return Object.freeze(
    Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((childKey) => [childKey, projectData(value[childKey], childKey, remapping)]),
    ),
  );
}

export function projectExtensions(
  entry: Readonly<Record<string, unknown>>,
  excluded: ReadonlySet<string>,
  remapping: ReadonlyMap<string, string>,
): Readonly<Record<string, unknown>> {
  return Object.freeze(
    Object.fromEntries(
      Object.keys(entry)
        .sort()
        .filter((key) => !excluded.has(key) && !/^(?:cosmetic|presentation)/iu.test(key))
        .map((key) => [key, projectData(entry[key], key, remapping)]),
    ),
  );
}

const COMMON_KEYS = new Set(["id", "kind", "geometry", "points", "state", "stateTick", "ownerId", "cleanupReason"]);
export const FIELD_KEYS = new Set([...COMMON_KEYS, "timer", "eligibility", "force", "schedule", "patternId"]);
export const COMBAT_OBJECT_KEYS = new Set([
  ...COMMON_KEYS,
  "targetId",
  "targetIds",
  "linkedActorIds",
  "integrity",
  "maxIntegrity",
  "counterplayTags",
  "procEligible",
  "damageDedupeId",
  "patternId",
]);
export const ROUTE_KEYS = new Set(COMMON_KEYS);

/** Presentation-independent environment projection used by exact hosts and replay. */
export function projectEnvironmentHash(value: unknown): unknown {
  if (!record(value)) return Object.freeze({ stageId: "unknown", fields: [], combatObjects: [], routes: [] });
  const remapping = environmentIdRemapping(value);
  const list = (key: "fields" | "combatObjects" | "routes"): readonly unknown[] => {
    const entries: readonly unknown[] = Array.isArray(value[key]) ? value[key] : [];
    return entries.map((entry): unknown => {
      if (!record(entry)) return entry;
      const commonValue: Record<string, unknown> = {
        id: portableEnvironmentId(entry.id, remapping),
        kind: entry.kind,
        geometry: projectionGeometry(record(entry.geometry) ? entry.geometry : {}),
        state: entry.state,
        stateTick: entry.stateTick,
        ownerId: portableEnvironmentId(entry.ownerId ?? null, remapping),
        cleanupReason: entry.cleanupReason ?? null,
      };
      if (key === "fields")
        Object.assign(
          commonValue,
          {
            timer: finite(entry.timer) ? rounded(entry.timer) : entry.timer,
            eligibility: entry.eligibility ?? null,
            force: entry.force ?? null,
            schedule: entry.schedule ?? null,
            patternId: entry.patternId ?? null,
          },
          projectExtensions(entry, FIELD_KEYS, remapping),
        );
      if (key === "combatObjects") {
        Object.assign(commonValue, {
          targetId: portableEnvironmentId(entry.targetId ?? null, remapping),
          ...(Array.isArray(entry.targetIds)
            ? { targetIds: entry.targetIds.map((target) => portableEnvironmentId(target, remapping)) }
            : {}),
          ...(Array.isArray(entry.linkedActorIds)
            ? { linkedActorIds: entry.linkedActorIds.map((target) => portableEnvironmentId(target, remapping)) }
            : {}),
          integrity: entry.integrity,
          maxIntegrity: entry.maxIntegrity,
          counterplayTags: entry.counterplayTags ?? [],
          procEligible: entry.procEligible,
          damageDedupeId: entry.damageDedupeId,
          patternId: entry.patternId ?? null,
        });
        Object.assign(commonValue, projectExtensions(entry, COMBAT_OBJECT_KEYS, remapping));
      }
      if (key === "routes") {
        commonValue.points = Array.isArray(entry.points)
          ? entry.points.map((point) => ({
              x: rounded(Number((point as Record<string, unknown>).x)),
              y: rounded(Number((point as Record<string, unknown>).y)),
            }))
          : [];
        Object.assign(commonValue, projectExtensions(entry, ROUTE_KEYS, remapping));
      }
      return Object.freeze(commonValue);
    });
  };
  return Object.freeze({
    stageId: value.stageId ?? "unknown",
    fields: list("fields"),
    combatObjects: list("combatObjects"),
    routes: list("routes"),
  });
}

export function environmentHash(value: unknown): string {
  return stableVerificationHash(projectEnvironmentHash(value));
}

/** Portable semantic environment state for canonical live/replay comparison. */
export function projectEnvironmentSemanticSnapshot(value: unknown): EnvironmentSnapshot {
  return projectEnvironmentHash(value) as EnvironmentSnapshot;
}
