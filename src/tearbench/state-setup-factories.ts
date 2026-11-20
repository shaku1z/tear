import type { TearSdlDocumentV1 } from "./tearsdl";
import type {
  EnvironmentCombatObjectState,
  EnvironmentFieldState,
  EnvironmentRouteState,
} from "../gameplay/environment/environment-contracts";
import { createStableRegistry } from "./registries";
import {
  assertEnvironmentCombatCapabilities,
  assertEnvironmentObjectCategory,
} from "../gameplay/environment/environment-definitions";
import type { BloomWellState } from "../gameplay/environment/bloom-well";
import { createGraftAnchorState } from "../gameplay/environment/graft-anchor";
import { createRootLink } from "../gameplay/entities/rootbinder-runtime";

type Patch = Readonly<Record<string, unknown>>;

/** State Setup factories are generic capability fixtures, not a Verdant roster. */
export const ENVIRONMENT_STATE_SETUP_FACTORY_IDS = Object.freeze([
  "environment-field",
  "environment-combat-object",
  "environment-route",
] as const);
export const ENVIRONMENT_STATE_SETUP_FACTORY_REGISTRY = createStableRegistry(
  "environment State Setup factory",
  ENVIRONMENT_STATE_SETUP_FACTORY_IDS,
);

export function buildEnvironmentFieldState(
  base: TearSdlDocumentV1,
  field: Omit<EnvironmentFieldState, "id"> & { readonly id: string },
): TearSdlDocumentV1 {
  assertEnvironmentObjectCategory("field", field.kind);
  return patch(base, `${base.id}-${field.id}`, {
    environment: {
      fields: [{ factoryId: "environment-field", ...structuredClone(field) }],
      combatObjects: [],
      routes: [],
    },
  });
}

/** Surgical C5 journey: a Bloom Well is restored as a built field, never inserted into a stage roster. */
export function buildBloomWellCycleState(base: TearSdlDocumentV1, field: BloomWellState): TearSdlDocumentV1 {
  return buildEnvironmentFieldState(base, field);
}

export function buildEnvironmentCombatObjectState(
  base: TearSdlDocumentV1,
  object: Omit<EnvironmentCombatObjectState, "id"> & { readonly id: string },
): TearSdlDocumentV1 {
  assertEnvironmentCombatCapabilities(object.kind, object.counterplayTags, object.procEligible);
  return patch(base, `${base.id}-${object.id}`, {
    environment: {
      fields: [],
      combatObjects: [{ factoryId: "environment-combat-object", ...structuredClone(object) }],
      routes: [],
    },
  });
}

/** Root fixture: State Setup restores one Rootbinder and two ordinary allies, then the two roots that tie
 * them, built as the game builds a root. */
export function buildRootbinderNetworkState(base: TearSdlDocumentV1): TearSdlDocumentV1 {
  const source = { x: 260, y: 600 };
  const links = ["enemy:2", "enemy:3"].map((targetId, index) => ({
    ...createRootLink(
      { id: `root-network:${String(index + 1)}`, ownerId: "enemy:1", tick: 0, source },
      { id: targetId, x: 420 + index * 120, y: source.y, rootable: true },
    ),
    factoryId: "environment-combat-object",
  }));
  links.forEach((link) => {
    assertEnvironmentCombatCapabilities(link.kind, link.counterplayTags, link.procEligible);
  });
  return patch(base, `${base.id}-root-network`, {
    enemyComposition: [
      { kind: "rootbinder", count: 1 },
      { kind: "charger", count: 2 },
    ],
    environment: { fields: [], combatObjects: links, routes: [] },
  });
}

/** C12/TC-4 surgical fixture: one active Mercy Graft retains the live Rootbound owner/target identity. */
export function buildRootboundGraftAnchorState(base: TearSdlDocumentV1): TearSdlDocumentV1 {
  const warning = createGraftAnchorState({
    ownerId: "enemy:1",
    graftType: "mercy",
    geometry: { x: 773, y: 610, w: 54, h: 90 },
    createdTick: 0,
  });
  const active = Object.freeze({ ...warning, state: "active" as const, stateTick: warning.activationTick });
  const built = buildEnvironmentCombatObjectState(base, active);
  return Object.freeze({
    ...built,
    state: Object.freeze({
      ...built.state,
      boss: Object.freeze({ phaseMarker: 2, state: "idle", stateT: 0, atk: "unavailable" }),
    }),
    id: `${base.id}-graft-mercy`,
  });
}

export function buildEnvironmentRouteState(
  base: TearSdlDocumentV1,
  route: Omit<EnvironmentRouteState, "id"> & { readonly id: string },
): TearSdlDocumentV1 {
  assertEnvironmentObjectCategory("route", route.kind);
  return patch(base, `${base.id}-${route.id}`, {
    environment: {
      fields: [],
      combatObjects: [],
      routes: [{ factoryId: "environment-route", ...structuredClone(route) }],
    },
  });
}

function patch(base: TearSdlDocumentV1, id: string, state: Patch): TearSdlDocumentV1 {
  return Object.freeze({
    ...base,
    id,
    state: Object.freeze({ ...base.state, ...structuredClone(state) }),
  });
}

export function buildWaveState(
  base: TearSdlDocumentV1,
  wave: number,
  enemies: readonly Readonly<{ kind: string; count: number; hpScale?: number; variantId?: string }>[],
): TearSdlDocumentV1 {
  if (!Number.isSafeInteger(wave) || wave < 1) throw new RangeError("wave must be a positive safe integer");
  for (const entry of enemies) {
    if (!Number.isSafeInteger(entry.count) || entry.count < 0)
      throw new RangeError("enemy counts must be non-negative");
  }
  return Object.freeze({
    ...patch(base, `${base.id}-wave-${String(wave)}`, { enemyComposition: enemies }),
    start: Object.freeze({ ...base.start, wave }),
  });
}

export function buildBossFrameState(
  base: TearSdlDocumentV1,
  boss: string,
  phase: string,
  attack: string,
  frame: number,
): TearSdlDocumentV1 {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new RangeError("boss attack frame must be non-negative");
  return Object.freeze({
    ...patch(base, `${base.id}-${boss}-${phase}-${attack}-${String(frame)}`, {
      boss: Object.freeze({ id: boss, phase, attack, frame }),
    }),
    start: Object.freeze({ ...base.start, boss, bossPhase: phase }),
  });
}

export function buildBladeAbilityState(
  base: TearSdlDocumentV1,
  blade: Readonly<{ state: string; x?: number; y?: number; vx?: number; vy?: number }>,
  abilities: Readonly<Record<string, Readonly<{ active: boolean; cooldownTicks: number }>>>,
): TearSdlDocumentV1 {
  return patch(base, `${base.id}-blade-${blade.state}`, {
    blade: Object.freeze(structuredClone(blade)),
    abilities: Object.freeze(structuredClone(abilities)),
  });
}

export function buildUiDeviceState(
  base: TearSdlDocumentV1,
  ui: Readonly<{ screen: string; focusedId?: string; scroll?: number }>,
  device: Readonly<{ kind: "keyboard-mouse" | "gamepad" | "touch"; width: number; height: number }>,
): TearSdlDocumentV1 {
  if (!(device.width > 0) || !(device.height > 0)) throw new RangeError("device viewport must be positive");
  return patch(base, `${base.id}-${ui.screen}-${device.kind}`, {
    ui: Object.freeze(structuredClone(ui)),
    device: Object.freeze(structuredClone(device)),
  });
}

export interface TearOneFrameBoundaryDefinition {
  readonly id: string;
  readonly field: string;
  readonly before: number;
  readonly at: number;
  readonly after: number;
}

export function buildOneFrameBoundaryStates(
  base: TearSdlDocumentV1,
  definition: TearOneFrameBoundaryDefinition,
): readonly TearSdlDocumentV1[] {
  return Object.freeze([
    patch(base, `${base.id}-${definition.id}-before`, { [definition.field]: definition.before }),
    patch(base, `${base.id}-${definition.id}-at`, { [definition.field]: definition.at }),
    patch(base, `${base.id}-${definition.id}-after`, { [definition.field]: definition.after }),
  ]);
}

export const DECLARED_ONE_FRAME_BOUNDARIES = Object.freeze([
  Object.freeze({ id: "hit-threshold", field: "bladeHitSpeedDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "perfect-parry", field: "perfectParrySpeedDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "deflect", field: "deflectSpeedDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "slam", field: "slamSpeedDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "power-slam", field: "powerSlamSpeedDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "launch", field: "launchSpeedDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "recall-distance", field: "recallDistanceDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "overlap", field: "overlapDelta", before: -1, at: 0, after: 1 }),
  Object.freeze({ id: "boss-hp", field: "bossHpDelta", before: 1, at: 0, after: -1 }),
  Object.freeze({ id: "cooldown", field: "cooldownTicks", before: 1, at: 0, after: -1 }),
  Object.freeze({ id: "iframe", field: "iframeTicks", before: 1, at: 0, after: -1 }),
  Object.freeze({ id: "shield", field: "shieldPips", before: 1, at: 0, after: -1 }),
  Object.freeze({ id: "style", field: "styleThresholdDelta", before: -1, at: 0, after: 1 }),
] as const);
