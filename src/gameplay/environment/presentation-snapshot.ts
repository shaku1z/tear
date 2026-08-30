import type { EnvironmentSnapshot, EnvironmentObjectState } from "./environment-contracts";

export interface EnvironmentPresentationSnapshot {
  readonly stageId: string;
  readonly fields: readonly Readonly<{ readonly [authoredDetail: string]: unknown; id: string; kind: string; state: EnvironmentObjectState; active: boolean; bounds: Readonly<{ minX: number; maxX: number; minY: number; maxY: number }>; direction?: -1 | 1; variant?: string }>[];
  readonly combatObjects: readonly Readonly<{ readonly [authoredDetail: string]: unknown; id: string; kind: string; state: EnvironmentObjectState; geometry: EnvironmentSnapshot["combatObjects"][number]["geometry"]; integrityRatio: number; counterplayTags: readonly string[]; connectionGeometry?: EnvironmentSnapshot["combatObjects"][number]["geometry"] }>[];
  readonly routes: readonly Readonly<{ id: string; kind: string; state: EnvironmentObjectState;
    readonly [authoredDetail: string]: unknown; points: readonly Readonly<{ x: number; y: number }>[];
    direction?: -1 | 1; width?: number; threatening?: boolean }>[];
}

function bounds(geometry: Readonly<{ x: number; y: number; w?: number; h?: number }>) {
  return Object.freeze({ minX: geometry.x, maxX: geometry.x + (geometry.w ?? 0), minY: geometry.y, maxY: geometry.y + (geometry.h ?? 0) });
}

function authoredDetails(value: Readonly<Record<string, unknown>>, excluded: ReadonlySet<string>): Readonly<Record<string, unknown>> {
  return Object.freeze(Object.fromEntries(Object.keys(value).sort().filter((key) => !excluded.has(key)
    && !/^(?:cosmetic|presentation)/iu.test(key)).map((key) => [key, structuredClone(value[key])])));
}

const FIELD_BASE = new Set(["id", "kind", "state", "geometry", "stateTick", "timer", "ownerId", "schedule", "eligibility", "force", "cleanupReason"]);
const COMBAT_BASE = new Set(["id", "kind", "state", "geometry", "stateTick", "ownerId", "targetId", "integrity", "maxIntegrity", "counterplayTags", "procEligible", "damageDedupeId", "cleanupReason"]);
const ROUTE_BASE = new Set(["id", "kind", "state", "points", "stateTick", "ownerId", "cleanupReason"]);

/** Data-only environment view. It has no renderer, audio, DOM, or mutable runtime handles. */
export function buildEnvironmentPresentationSnapshot(snapshot: EnvironmentSnapshot): EnvironmentPresentationSnapshot {
  return Object.freeze({
    stageId: snapshot.stageId,
    fields: Object.freeze(snapshot.fields.map((field) => { const extension = field as unknown as Readonly<Record<string, unknown>>; return Object.freeze({
      id: field.id, kind: field.kind, state: field.state, active: field.state === "active", bounds: bounds(field.geometry),
      ...authoredDetails(extension, FIELD_BASE),
    }); })),
    combatObjects: Object.freeze(snapshot.combatObjects.map((object) => {
      const extension = object as unknown as Readonly<Record<string, unknown>>;
      return Object.freeze({ id: object.id, kind: object.kind, state: object.state, geometry: structuredClone(object.geometry), integrityRatio: object.maxIntegrity > 0 ? object.integrity / object.maxIntegrity : 0, counterplayTags: Object.freeze([...object.counterplayTags]),
      ...authoredDetails(extension, COMBAT_BASE),
    }); })),
    routes: Object.freeze(snapshot.routes.map((route) => { const extension = route as unknown as Readonly<Record<string, unknown>>; return Object.freeze({ id: route.id, kind: route.kind,
      state: route.state, points: Object.freeze(route.points.map((point) => Object.freeze({ x: point.x, y: point.y }))),
      ...authoredDetails(extension, ROUTE_BASE),
    }); })),
  });
}
