import type {
  EnvironmentCombatObjectState,
  EnvironmentGeometry,
  EnvironmentPoint,
  EnvironmentRuntimeState,
} from "./environment-contracts";
import type { EnvironmentObjectKind } from "./environment-object-kinds";
import { environmentObjectDefinition } from "./environment-definitions";

/**
 * The Rootbound's Grafts: plants the keeper sets down in Phase II, each helping it while it stands. The
 * player cuts one with the held or thrown blade; the boss answers a cut by being opened (`rootbound.ts`).
 * The healing numbers of the Mercy Graft are not here: every healing rule is in `ROOTBOUND_HEALING`
 * (rootbound-tuning.ts).
 */
export const GRAFT_ANCHOR_TYPES = Object.freeze(["mercy", "bastion", "haste"] as const);
export type GraftAnchorType = (typeof GRAFT_ANCHOR_TYPES)[number];

export const MAX_ACTIVE_GRAFT_ANCHORS = 3;
/** One or two swings cut a Graft. */
export const GRAFT_ANCHOR_MAX_INTEGRITY = 40;
/** A planted Graft takes `warningTicks` to take hold; it helps the boss only once active. */
export const GRAFT_ANCHOR_TIMING = Object.freeze({ ticksPerSecond: 120, warningTicks: 84 });

interface GraftAnchorDefinitionBase {
  readonly kind: Extract<EnvironmentObjectKind, "graft-anchor">;
  readonly factoryId: "graft-anchor";
  readonly procPolicyId: "boss-combat-object";
  readonly graftType: GraftAnchorType;
}

export interface MercyGraftDefinition extends GraftAnchorDefinitionBase {
  readonly graftType: "mercy";
  /** The boss heals while this stands and the player leaves the boss alone. */
  readonly effect: "heals-owner";
}

export interface BastionGraftDefinition extends GraftAnchorDefinitionBase {
  readonly graftType: "bastion";
  readonly effect: "incoming-damage-multiplier";
  /** Applied to damage the boss takes. Above zero, below one. */
  readonly incomingDamageMultiplier: number;
}

export interface HasteGraftDefinition extends GraftAnchorDefinitionBase {
  readonly graftType: "haste";
  readonly effect: "move-gap-multiplier";
  /** Applied to the pause between the boss's moves. Above zero, below one. */
  readonly gapMultiplier: number;
}

export type GraftAnchorDefinition = MercyGraftDefinition | BastionGraftDefinition | HasteGraftDefinition;

export type GraftAnchorState = EnvironmentCombatObjectState &
  GraftAnchorDefinition &
  Readonly<{ createdTick: number; activationTick: number }>;

/** What the living Grafts do for their boss right now. */
export interface RootboundGraftEffects {
  readonly activeTypes: readonly GraftAnchorType[];
  readonly incomingDamageMultiplier: number;
  readonly gapMultiplier: number;
  readonly heals: boolean;
}

export const ROOTBOUND_NO_GRAFT_EFFECTS: RootboundGraftEffects = Object.freeze({
  activeTypes: Object.freeze([]),
  incomingDamageMultiplier: 1,
  gapMultiplier: 1,
  heals: false,
});

export interface GraftAnchorPlacementRequest {
  readonly graftType: GraftAnchorType;
  readonly geometry: EnvironmentGeometry;
}

export interface GraftAnchorFactoryInput extends GraftAnchorPlacementRequest {
  readonly ownerId: string;
  readonly createdTick: number;
  readonly maxIntegrity?: number;
}

const BASE = Object.freeze({
  kind: "graft-anchor",
  factoryId: "graft-anchor",
  procPolicyId: "boss-combat-object",
} as const);

export const GRAFT_ANCHOR_DEFINITIONS: readonly GraftAnchorDefinition[] = Object.freeze([
  Object.freeze({ ...BASE, graftType: "mercy", effect: "heals-owner" } satisfies MercyGraftDefinition),
  Object.freeze({
    ...BASE,
    graftType: "bastion",
    effect: "incoming-damage-multiplier",
    incomingDamageMultiplier: 0.65,
  } satisfies BastionGraftDefinition),
  Object.freeze({
    ...BASE,
    graftType: "haste",
    effect: "move-gap-multiplier",
    gapMultiplier: 0.6,
  } satisfies HasteGraftDefinition),
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
  if (!(extent > 0) || !Number.isFinite(extent))
    throw new RangeError("Graft Anchor geometry must be bounded and non-empty");
  return Object.freeze({ ...geometry });
}

function ended(object: EnvironmentCombatObjectState): boolean {
  return object.state === "destroyed" || object.state === "expired";
}

export function isGraftAnchorState(value: EnvironmentCombatObjectState): value is GraftAnchorState {
  const candidate = value as Partial<GraftAnchorState>;
  return (
    value.kind === "graft-anchor" &&
    value.factoryId === "graft-anchor" &&
    GRAFT_ANCHOR_TYPES.some((graftType) => graftType === candidate.graftType) &&
    typeof candidate.createdTick === "number" &&
    typeof candidate.activationTick === "number" &&
    candidate.procPolicyId === "boss-combat-object"
  );
}

/** Builds the state the environment runtime owns for one Graft. */
export function createGraftAnchorState(input: GraftAnchorFactoryInput): GraftAnchorState {
  if (input.ownerId.length === 0) throw new TypeError("Graft Anchor owner ID is required");
  if (!Number.isSafeInteger(input.createdTick) || input.createdTick < 0)
    throw new RangeError("Graft Anchor created tick must be a non-negative safe integer");
  const maxIntegrity = input.maxIntegrity ?? GRAFT_ANCHOR_MAX_INTEGRITY;
  if (!Number.isFinite(maxIntegrity) || maxIntegrity <= 0)
    throw new RangeError("Graft Anchor integrity must be finite and positive");
  return Object.freeze({
    ...graftAnchorDefinition(input.graftType),
    id: `${input.ownerId}:graft:${input.graftType}`,
    ownerId: input.ownerId,
    targetId: input.ownerId,
    geometry: frozenGeometry(input.geometry),
    createdTick: input.createdTick,
    activationTick: input.createdTick + GRAFT_ANCHOR_TIMING.warningTicks,
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

/**
 * Plants one Graft for its owner. Returns the Graft of that type already standing, or the new one, or null
 * while a cut Graft of that type is still fading from the stage (the caller asks again next tick).
 */
export function installGraftAnchor(
  environment: Pick<EnvironmentRuntimeState, "addCombatObject" | "combatObjects">,
  input: GraftAnchorFactoryInput,
): GraftAnchorState | null {
  const owned = environment
    .combatObjects()
    .filter(isGraftAnchorState)
    .filter((object) => object.ownerId === input.ownerId);
  const existing = owned.find((object) => object.graftType === input.graftType);
  if (existing !== undefined) return ended(existing) ? null : existing;
  if (owned.filter((object) => !ended(object)).length >= MAX_ACTIVE_GRAFT_ANCHORS)
    throw new RangeError("Rootbound Graft Anchor population bound exceeded");
  const id = environment.addCombatObject(createGraftAnchorState(input));
  const installed = environment.combatObjects().find((object) => object.id === id);
  if (installed === undefined || !isGraftAnchorState(installed))
    throw new Error("canonical environment owner rejected Graft Anchor state");
  return installed;
}

export function resolveRootboundGraftEffects(
  objects: readonly EnvironmentCombatObjectState[],
  ownerId: string,
): RootboundGraftEffects {
  let incomingDamageMultiplier = 1,
    gapMultiplier = 1,
    heals = false;
  const activeTypes: GraftAnchorType[] = [];
  for (const object of objects) {
    if (!isGraftAnchorState(object) || object.ownerId !== ownerId || object.state !== "active") continue;
    activeTypes.push(object.graftType);
    if (object.effect === "incoming-damage-multiplier") incomingDamageMultiplier = object.incomingDamageMultiplier;
    else if (object.effect === "move-gap-multiplier") gapMultiplier = object.gapMultiplier;
    else heals = true;
  }
  if (activeTypes.length === 0) return ROOTBOUND_NO_GRAFT_EFFECTS;
  return Object.freeze({ activeTypes: Object.freeze(activeTypes), incomingDamageMultiplier, gapMultiplier, heals });
}

/** A planted Graft takes hold once its warning has run. */
export function advanceGraftAnchor(state: GraftAnchorState, tick: number): GraftAnchorState {
  if (!Number.isSafeInteger(tick) || tick < 0)
    throw new RangeError("Graft Anchor tick must be a non-negative safe integer");
  if (state.state !== "warning" || tick < state.activationTick) return state;
  return Object.freeze({ ...state, state: "active", stateTick: state.activationTick });
}
