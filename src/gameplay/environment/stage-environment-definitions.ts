import type { StageId } from "../stages";
import type { EnvironmentObjectKind } from "./environment-object-kinds";
import type { EnvironmentGeometry } from "./environment-contracts";

/**
 * The surface a field lies on: one of the stage's platforms, by its place in the stage's layout, or a
 * stretch of the floor. A field that names a surface gets its box from it, so it cannot sit off its surface.
 */
export type StageFieldSurface =
  Readonly<{ platform: number }> | Readonly<{ floor: Readonly<{ x: number; w: number }> }>;

interface StageInitialFieldBase {
  readonly slot: string;
  /** Delays a recurring field's first cycle so paired fields alternate instead of pulsing together. */
  readonly offsetTicks?: number;
}
export type StageInitialFieldDefinition =
  | (StageInitialFieldBase &
      Readonly<{ kind: Extract<EnvironmentObjectKind, "bloom-well">; geometry: EnvironmentGeometry }>)
  | (StageInitialFieldBase &
      Readonly<{
        kind: Extract<EnvironmentObjectKind, "aurora-track">;
        surface: StageFieldSurface;
        direction: -1 | 1;
      }>);

export interface StageEnvironmentDefinition {
  readonly id: string;
  readonly stageId: StageId;
  readonly initialFields: readonly StageInitialFieldDefinition[];
  readonly maximumFields: number;
  readonly maximumCombatObjects: number;
  readonly maximumRoutes: number;
  readonly cleanup: "stage-owned";
}

/**
 * Typed stage-owned environment setup; activation remains centralized in the stage host.
 * A Bloom Well stands on the floor (its box ends at the ground, y 800), so it lifts whoever stands in it.
 */
export const STAGE_ENVIRONMENT_DEFINITIONS = Object.freeze({
  "verdant-sanctum": Object.freeze({
    id: "verdant-sanctum-environment",
    stageId: "verdant-sanctum",
    initialFields: Object.freeze([
      Object.freeze({
        kind: "bloom-well",
        slot: "left-rise",
        geometry: Object.freeze({ x: 480, y: 285, w: 170, h: 515 }),
      }),
      Object.freeze({
        kind: "bloom-well",
        slot: "right-rise",
        geometry: Object.freeze({ x: 950, y: 285, w: 170, h: 515 }),
        offsetTicks: 372,
      }),
    ]),
    maximumFields: 3,
    maximumCombatObjects: 8,
    maximumRoutes: 0,
    cleanup: "stage-owned",
  }),
  "pale-traverse": Object.freeze({
    id: "pale-traverse-environment",
    stageId: "pale-traverse",
    initialFields: Object.freeze([
      // Three roads that wake in turn, a third of a cycle (912 ticks) apart. The floor road runs east, the
      // middle platform (layout[2]) runs back west, and the low west platform (layout[0]) runs east again.
      Object.freeze({
        kind: "aurora-track",
        slot: "floor-east",
        direction: 1 as const,
        surface: Object.freeze({ floor: Object.freeze({ x: 200, w: 1200 }) }),
      }),
      Object.freeze({
        kind: "aurora-track",
        slot: "crossing-west",
        direction: -1 as const,
        surface: Object.freeze({ platform: 2 }),
        offsetTicks: 304,
      }),
      Object.freeze({
        kind: "aurora-track",
        slot: "low-west-east",
        direction: 1 as const,
        surface: Object.freeze({ platform: 0 }),
        offsetTicks: 608,
      }),
    ]),
    maximumFields: 4,
    maximumCombatObjects: 8,
    maximumRoutes: 3,
    cleanup: "stage-owned",
  }),
} as const satisfies Readonly<Partial<Record<StageId, StageEnvironmentDefinition>>>);

export function stageEnvironmentDefinition(stageId: StageId): StageEnvironmentDefinition | null {
  const definitions: Readonly<Partial<Record<StageId, StageEnvironmentDefinition>>> = STAGE_ENVIRONMENT_DEFINITIONS;
  return definitions[stageId] ?? null;
}

/** Source-derived mechanic identity projection for stage-owned initial fields. */
export function stageEnvironmentMechanicKinds(stageId: StageId): readonly EnvironmentObjectKind[] {
  const definition = stageEnvironmentDefinition(stageId);
  if (definition === null) return Object.freeze([]);
  return Object.freeze([...new Set(definition.initialFields.map(({ kind }) => kind))]);
}
