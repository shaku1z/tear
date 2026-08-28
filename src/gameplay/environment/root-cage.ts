import type { EnvironmentCombatObjectState, EnvironmentGeometry, EnvironmentRuntimeState } from "./environment-contracts";
import { environmentObjectDefinition } from "./environment-definitions";

export const ROOT_CAGE_TIMING = Object.freeze({
  ticksPerSecond: 120,
  warningTicks: 72,
  activeTicks: 240,
});

export const ROOT_CAGE_GEOMETRY = Object.freeze({
  boundaryWidth: 56,
  boundaryHeight: 180,
  interiorWidth: 480,
  arenaMargin: 96,
});

export type RootCageBoundarySide = "left" | "right";
export type RootCageResponse = "sever-either-boundary";

export interface RootCagePlacementRequest {
  readonly sequence: number;
  readonly centerX: number;
  readonly arenaWidth: number;
  readonly groundY: number;
}

export interface RootCageState extends EnvironmentCombatObjectState {
  readonly factoryId: "root-link";
  readonly kind: "root-link";
  readonly rootCageId: string;
  readonly boundarySide: RootCageBoundarySide;
  readonly response: RootCageResponse;
  readonly createdTick: number;
  readonly activationTick: number;
  readonly expiryTick: number;
}

function boundaryGeometry(centerX: number, groundY: number, side: RootCageBoundarySide): EnvironmentGeometry {
  const centerOffset = ROOT_CAGE_GEOMETRY.interiorWidth / 2 + ROOT_CAGE_GEOMETRY.boundaryWidth / 2;
  const boundaryCenter = centerX + (side === "left" ? -centerOffset : centerOffset);
  return Object.freeze({
    x: boundaryCenter - ROOT_CAGE_GEOMETRY.boundaryWidth / 2,
    y: groundY - ROOT_CAGE_GEOMETRY.boundaryHeight,
    w: ROOT_CAGE_GEOMETRY.boundaryWidth,
    h: ROOT_CAGE_GEOMETRY.boundaryHeight,
  });
}

function validatePlacement(input: RootCagePlacementRequest): number {
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) throw new RangeError("Root Cage sequence must be a positive safe integer");
  if (![input.centerX, input.arenaWidth, input.groundY].every(Number.isFinite) || input.arenaWidth <= 0) {
    throw new RangeError("Root Cage placement must contain finite arena geometry");
  }
  const halfSpan = ROOT_CAGE_GEOMETRY.interiorWidth / 2 + ROOT_CAGE_GEOMETRY.boundaryWidth;
  const minimum = ROOT_CAGE_GEOMETRY.arenaMargin + halfSpan;
  const maximum = input.arenaWidth - ROOT_CAGE_GEOMETRY.arenaMargin - halfSpan;
  if (minimum > maximum) throw new RangeError("Root Cage arena cannot preserve its authored response route");
  return Math.max(minimum, Math.min(maximum, input.centerX));
}

/** Builds two severable boundaries from the existing root-link combat-object definition. */
export function createRootCage(ownerId: string, input: RootCagePlacementRequest, createdTick: number): readonly RootCageState[] {
  if (ownerId.length === 0) throw new TypeError("Root Cage requires a stable owner ID");
  if (!Number.isSafeInteger(createdTick) || createdTick < 0) throw new RangeError("Root Cage creation tick must be a non-negative safe integer");
  const centerX = validatePlacement(input);
  const rootCageId = `${ownerId}:root-cage:g${String(input.sequence)}`;
  const activationTick = createdTick + ROOT_CAGE_TIMING.warningTicks;
  const expiryTick = activationTick + ROOT_CAGE_TIMING.activeTicks;
  const counterplayTags = environmentObjectDefinition("root-link").counterplayTags;
  return Object.freeze((["left", "right"] as const).map((boundarySide): RootCageState => Object.freeze({
    id: `${rootCageId}:${boundarySide}`,
    factoryId: "root-link",
    kind: "root-link",
    rootCageId,
    boundarySide,
    response: "sever-either-boundary",
    ownerId,
    targetId: null,
    geometry: boundaryGeometry(centerX, input.groundY, boundarySide),
    integrity: 1,
    maxIntegrity: 1,
    counterplayTags,
    procEligible: false,
    damageDedupeId: `${rootCageId}:${boundarySide}:damage`,
    state: "warning",
    stateTick: createdTick,
    cleanupReason: null,
    patternId: "root-cage",
    createdTick,
    activationTick,
    expiryTick,
  })));
}

export function isRootCageState(value: EnvironmentCombatObjectState): value is RootCageState {
  const candidate = value as Partial<RootCageState>;
  return candidate.kind === "root-link" && candidate.factoryId === "root-link" && candidate.patternId === "root-cage"
    && typeof candidate.rootCageId === "string" && (candidate.boundarySide === "left" || candidate.boundarySide === "right")
    && candidate.response === "sever-either-boundary";
}

export function installRootCage(
  environment: Pick<EnvironmentRuntimeState, "combatObjects" | "addCombatObject">,
  ownerId: string,
  input: RootCagePlacementRequest,
  createdTick: number,
): readonly RootCageState[] {
  const states = createRootCage(ownerId, input, createdTick);
  for (const state of states) if (!environment.combatObjects().some((object) => object.id === state.id)) environment.addCombatObject(state);
  return states;
}

export function advanceRootCage(state: RootCageState, tick: number): RootCageState {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("Root Cage tick must be a non-negative safe integer");
  if (state.state === "destroyed" || state.state === "expired") return state;
  if (tick >= state.expiryTick) return Object.freeze({ ...state, state: "expired", stateTick: tick, cleanupReason: "natural-expiry" });
  if (state.state === "warning" && tick >= state.activationTick) return Object.freeze({ ...state, state: "active", stateTick: tick });
  return state;
}
