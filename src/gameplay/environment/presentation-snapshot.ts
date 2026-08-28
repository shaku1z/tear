import type { EnvironmentSnapshot, EnvironmentObjectState } from "./environment-contracts";
import { isGraftAnchorState, type GraftAnchorType } from "./graft-anchor";
import { isRootCageState, type RootCageBoundarySide, type RootCageResponse } from "./root-cage";

export interface EnvironmentPresentationSnapshot {
  readonly stageId: string;
  readonly fields: readonly Readonly<{ id: string; kind: string; state: EnvironmentObjectState; active: boolean; bounds: Readonly<{ minX: number; maxX: number; minY: number; maxY: number }> }>[];
  readonly combatObjects: readonly Readonly<{ id: string; kind: string; state: EnvironmentObjectState; geometry: EnvironmentSnapshot["combatObjects"][number]["geometry"]; integrityRatio: number; counterplayTags: readonly string[]; graftType?: GraftAnchorType; effect?: string; connectionGeometry?: EnvironmentSnapshot["combatObjects"][number]["geometry"]; rootCageId?: string; boundarySide?: RootCageBoundarySide; response?: RootCageResponse }>[];
  readonly routes: readonly Readonly<{ id: string; kind: string; state: EnvironmentObjectState; points: readonly Readonly<{ x: number; y: number }>[] }>[];
}

function bounds(geometry: Readonly<{ x: number; y: number; w?: number; h?: number }>) {
  return Object.freeze({ minX: geometry.x, maxX: geometry.x + (geometry.w ?? 0), minY: geometry.y, maxY: geometry.y + (geometry.h ?? 0) });
}

/** Data-only environment view. It has no renderer, audio, DOM, or mutable runtime handles. */
export function buildEnvironmentPresentationSnapshot(snapshot: EnvironmentSnapshot): EnvironmentPresentationSnapshot {
  return Object.freeze({
    stageId: snapshot.stageId,
    fields: Object.freeze(snapshot.fields.map((field) => Object.freeze({ id: field.id, kind: field.kind, state: field.state, active: field.state === "active", bounds: bounds(field.geometry) }))),
    combatObjects: Object.freeze(snapshot.combatObjects.map((object) => Object.freeze({ id: object.id, kind: object.kind, state: object.state, geometry: structuredClone(object.geometry), integrityRatio: object.maxIntegrity > 0 ? object.integrity / object.maxIntegrity : 0, counterplayTags: Object.freeze([...object.counterplayTags]),
      ...(isGraftAnchorState(object) ? { graftType: object.graftType, effect: object.effect, connectionGeometry: structuredClone(object.connectionGeometry) } : {}),
      ...(isRootCageState(object) ? { rootCageId: object.rootCageId, boundarySide: object.boundarySide, response: object.response } : {}),
    }))),
    routes: Object.freeze(snapshot.routes.map((route) => Object.freeze({ id: route.id, kind: route.kind, state: route.state, points: Object.freeze(route.points.map((point) => Object.freeze({ x: point.x, y: point.y }))) }))),
  });
}
