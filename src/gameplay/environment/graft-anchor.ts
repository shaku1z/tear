import type {
  EnvironmentCombatObjectState,
  EnvironmentGeometry,
  EnvironmentPoint,
  EnvironmentRuntimeState,
} from "./environment-contracts";
import type { EnvironmentObjectKind } from "./environment-object-kinds";
import { environmentObjectDefinition } from "./environment-definitions";

export const GRAFT_ANCHOR_TYPES = Object.freeze(["bastion", "mercy", "haste"] as const);
export type GraftAnchorType = typeof GRAFT_ANCHOR_TYPES[number];

export const MAX_ACTIVE_GRAFT_ANCHORS = 3;
export const GRAFT_WARNING_FLOOR_SECONDS = 0.55;
export const GRAFT_ANCHOR_MAX_INTEGRITY = 60;
export const GRAFT_ANCHOR_TIMING = Object.freeze({ ticksPerSecond: 120, warningTicks: 84 });

interface GraftAnchorDefinitionBase {
  readonly kind: Extract<EnvironmentObjectKind, "graft-anchor">;
  readonly factoryId: "graft-anchor";
  readonly procPolicyId: "boss-combat-object";
  readonly graftType: GraftAnchorType;
  readonly playerQuestion: string;
}

export interface BastionGraftDefinition extends GraftAnchorDefinitionBase {
  readonly graftType: "bastion";
  readonly effect: "incoming-damage-multiplier";
  /** Applied to otherwise legal boss damage. It must remain above zero. */
  readonly incomingDamageMultiplier: number;
}

export interface MercyGraftDefinition extends GraftAnchorDefinitionBase {
  readonly graftType: "mercy";
  readonly effect: "bounded-pulse-recovery";
  readonly pulseIntervalSeconds: number;
  readonly pulseHealthFraction: number;
  readonly maxRecoveryHealthFraction: number;
}

export interface HasteGraftDefinition extends GraftAnchorDefinitionBase {
  readonly graftType: "haste";
  readonly effect: "selected-attack-cadence-multiplier";
  readonly cadenceMultiplier: number;
  readonly minimumWarningSeconds: number;
}

export type GraftAnchorDefinition = BastionGraftDefinition | MercyGraftDefinition | HasteGraftDefinition;

export type GraftAnchorState = EnvironmentCombatObjectState & GraftAnchorDefinition & Readonly<{
  connectionGeometry: EnvironmentGeometry;
  createdTick: number;
  activationTick: number;
  nextPulseTick: number | null;
  recoverySpentHealthFraction: number;
}>;

export interface RootboundGraftEffects {
  readonly activeTypes: readonly GraftAnchorType[];
  readonly incomingDamageMultiplier: number;
  readonly cadenceMultiplier: number;
}

export const ROOTBOUND_NO_GRAFT_EFFECTS: RootboundGraftEffects = Object.freeze({
  activeTypes: Object.freeze([]), incomingDamageMultiplier: 1, cadenceMultiplier: 1,
});

export interface GraftAnchorPlacementRequest {
  readonly graftType: GraftAnchorType;
  readonly geometry: EnvironmentGeometry;
}

export interface GraftAnchorFactoryInput extends GraftAnchorPlacementRequest {
  readonly ownerId: string;
  readonly ownerPosition: EnvironmentPoint;
  readonly createdTick: number;
  readonly maxIntegrity?: number;
}

const BASTION_GRAFT = Object.freeze({
  kind: "graft-anchor",
  factoryId: "graft-anchor",
  procPolicyId: "boss-combat-object",
  graftType: "bastion",
  playerQuestion: "Break the Graft for full damage, or keep pressuring Rootbound through its protection?",
  effect: "incoming-damage-multiplier",
  incomingDamageMultiplier: 0.8,
} satisfies BastionGraftDefinition);

const MERCY_GRAFT = Object.freeze({
  kind: "graft-anchor",
  factoryId: "graft-anchor",
  procPolicyId: "boss-combat-object",
  graftType: "mercy",
  playerQuestion: "Break the Graft before its bounded recovery budget is spent?",
  effect: "bounded-pulse-recovery",
  pulseIntervalSeconds: 2.4,
  pulseHealthFraction: 0.015,
  maxRecoveryHealthFraction: 0.09,
} satisfies MercyGraftDefinition);

const HASTE_GRAFT = Object.freeze({
  kind: "graft-anchor",
  factoryId: "graft-anchor",
  procPolicyId: "boss-combat-object",
  graftType: "haste",
  playerQuestion: "Break the Graft to restore the normal attack rhythm?",
  effect: "selected-attack-cadence-multiplier",
  cadenceMultiplier: 1.15,
  minimumWarningSeconds: GRAFT_WARNING_FLOOR_SECONDS,
} satisfies HasteGraftDefinition);

/**
 * Rootbound-specific tuning for the existing `graft-anchor` environment kind.
 * This is not an environment-kind or placement registry; production ownership
 * and construction remain with the canonical environment runtime.
 */
export const GRAFT_ANCHOR_DEFINITIONS: readonly GraftAnchorDefinition[] = Object.freeze([
  BASTION_GRAFT,
  MERCY_GRAFT,
  HASTE_GRAFT,
]);

export function graftAnchorDefinition(graftType: GraftAnchorType): GraftAnchorDefinition {
  const definition = GRAFT_ANCHOR_DEFINITIONS.find((candidate) => candidate.graftType === graftType);
  if (definition === undefined) throw new RangeError(`unknown Graft Anchor type: ${graftType}`);
  return definition;
}

function assertFinitePoint(point: EnvironmentPoint, label: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new TypeError(`${label} must be finite`);
}

function frozenGeometry(geometry: EnvironmentGeometry): EnvironmentGeometry {
  assertFinitePoint(geometry, "Graft Anchor geometry");
  const extent = geometry.radius ?? Math.max(geometry.w ?? 0, geometry.h ?? 0);
  if (!(extent > 0) || !Number.isFinite(extent)) throw new RangeError("Graft Anchor geometry must be bounded and non-empty");
  return Object.freeze({ ...geometry,
    ...(geometry.points === undefined ? {} : { points: Object.freeze(geometry.points.map((point) => {
      assertFinitePoint(point, "Graft Anchor connection point"); return Object.freeze({ ...point });
    })) }),
  });
}

export function isGraftAnchorState(value: EnvironmentCombatObjectState): value is GraftAnchorState {
  const candidate = value as Partial<GraftAnchorState>;
  return value.kind === "graft-anchor" && value.factoryId === "graft-anchor"
    && GRAFT_ANCHOR_TYPES.some((graftType) => graftType === candidate.graftType)
    && typeof candidate.createdTick === "number" && typeof candidate.activationTick === "number"
    && (candidate.nextPulseTick === null || typeof candidate.nextPulseTick === "number")
    && typeof candidate.recoverySpentHealthFraction === "number" && candidate.procPolicyId === "boss-combat-object"
    && candidate.connectionGeometry !== undefined;
}

/** Builds the specialized state consumed by the canonical combat-object owner. */
export function createGraftAnchorState(input: GraftAnchorFactoryInput): GraftAnchorState {
  if (input.ownerId.length === 0) throw new TypeError("Graft Anchor owner ID is required");
  if (!Number.isSafeInteger(input.createdTick) || input.createdTick < 0) throw new RangeError("Graft Anchor created tick must be a non-negative safe integer");
  assertFinitePoint(input.ownerPosition, "Graft Anchor owner position");
  const maxIntegrity = input.maxIntegrity ?? GRAFT_ANCHOR_MAX_INTEGRITY;
  if (!Number.isFinite(maxIntegrity) || maxIntegrity <= 0) throw new RangeError("Graft Anchor integrity must be finite and positive");
  const definition = graftAnchorDefinition(input.graftType);
  const geometry = frozenGeometry(input.geometry);
  const anchorX = geometry.x + (geometry.w ?? 0) / 2;
  const anchorY = geometry.y + (geometry.h ?? 0) / 2;
  const connectionGeometry = frozenGeometry({
    x: input.ownerPosition.x,
    y: input.ownerPosition.y,
    points: Object.freeze([
      Object.freeze({ ...input.ownerPosition }),
      Object.freeze({ x: anchorX, y: anchorY }),
    ]),
    radius: Math.max(1, Math.hypot(anchorX - input.ownerPosition.x, anchorY - input.ownerPosition.y)),
  });
  const activationTick = input.createdTick + GRAFT_ANCHOR_TIMING.warningTicks;
  const nextPulseTick = definition.effect === "bounded-pulse-recovery"
    ? activationTick + Math.round(definition.pulseIntervalSeconds * GRAFT_ANCHOR_TIMING.ticksPerSecond)
    : null;
  return Object.freeze({
    ...definition,
    id: `${input.ownerId}:graft:${input.graftType}`,
    ownerId: input.ownerId,
    targetId: input.ownerId,
    geometry,
    connectionGeometry,
    createdTick: input.createdTick,
    activationTick,
    nextPulseTick,
    recoverySpentHealthFraction: 0,
    integrity: maxIntegrity,
    maxIntegrity,
    counterplayTags: environmentObjectDefinition("graft-anchor").counterplayTags,
    procEligible: false,
    damageDedupeId: `${input.ownerId}:graft:${input.graftType}:damage`,
    state: "warning",
    stateTick: input.createdTick,
    cleanupReason: null,
    patternId: `rootbound-graft/${input.graftType}`,
  });
}

/** Idempotently installs one owner-bound Graft into the existing environment collection. */
export function installGraftAnchor(
  environment: Pick<EnvironmentRuntimeState, "addCombatObject" | "combatObjects">,
  input: GraftAnchorFactoryInput,
): GraftAnchorState {
  const owned = environment.combatObjects().filter(isGraftAnchorState).filter((object) => object.ownerId === input.ownerId);
  const existing = owned.find((object) => object.graftType === input.graftType);
  if (existing !== undefined) return existing;
  const active = owned.filter((object) => object.state !== "destroyed" && object.state !== "expired");
  if (active.length >= MAX_ACTIVE_GRAFT_ANCHORS) throw new RangeError("Rootbound Graft Anchor population bound exceeded");
  const created = createGraftAnchorState(input);
  const id = environment.addCombatObject(created);
  const installed = environment.combatObjects().find((object) => object.id === id);
  if (installed === undefined || !isGraftAnchorState(installed)) throw new Error("canonical environment owner rejected Graft Anchor state");
  return installed;
}

export function resolveRootboundGraftEffects(objects: readonly EnvironmentCombatObjectState[], ownerId: string): RootboundGraftEffects {
  const active = objects.filter(isGraftAnchorState).filter((object) => object.ownerId === ownerId && object.state === "active");
  if (active.length === 0) return ROOTBOUND_NO_GRAFT_EFFECTS;
  let incomingDamageMultiplier = 1;
  let cadenceMultiplier = 1;
  for (const graft of active) {
    if (graft.effect === "incoming-damage-multiplier") incomingDamageMultiplier = Math.min(incomingDamageMultiplier, graft.incomingDamageMultiplier);
    else if (graft.effect === "selected-attack-cadence-multiplier") cadenceMultiplier = Math.max(cadenceMultiplier, graft.cadenceMultiplier);
  }
  return Object.freeze({ activeTypes: Object.freeze(active.map((graft) => graft.graftType)), incomingDamageMultiplier, cadenceMultiplier });
}

/** Advances warning/activation and the Mercy budget from absolute simulation ticks. */
export function advanceGraftAnchor(
  state: GraftAnchorState,
  tick: number,
  recoverHealthFraction?: (fraction: number) => number,
): GraftAnchorState {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("Graft Anchor tick must be a non-negative safe integer");
  if (state.state === "destroyed" || state.state === "expired") return state;
  let next = state;
  if (state.state === "warning" && tick >= state.activationTick) next = Object.freeze({ ...state, state: "active", stateTick: state.activationTick });
  if (next.effect !== "bounded-pulse-recovery" || next.state !== "active" || next.nextPulseTick === null
    || tick < next.nextPulseTick || next.recoverySpentHealthFraction >= next.maxRecoveryHealthFraction) return next;
  const intervalTicks = Math.round(next.pulseIntervalSeconds * GRAFT_ANCHOR_TIMING.ticksPerSecond);
  const duePulses = Math.floor((tick - next.nextPulseTick) / intervalTicks) + 1;
  const available = next.maxRecoveryHealthFraction - next.recoverySpentHealthFraction;
  const requested = Math.min(available, duePulses * next.pulseHealthFraction);
  const recovered = Math.max(0, Math.min(requested, recoverHealthFraction?.(requested) ?? 0));
  return Object.freeze({ ...next, nextPulseTick: next.nextPulseTick + duePulses * intervalTicks,
    recoverySpentHealthFraction: next.recoverySpentHealthFraction + recovered });
}
