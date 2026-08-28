import type { EnvironmentCombatObjectState, EnvironmentPoint, EnvironmentRouteState } from "./environment-contracts";

export const ROOTBOUND_REGROWTH_TIMING = Object.freeze({
  ticksPerSecond: 120,
  channelTicks: 480,
});
export const ROOTBOUND_REGROWTH_CONNECTION_COUNT = 3;

export interface RootboundRegrowthConnectionBundle {
  readonly combatObjects: readonly EnvironmentCombatObjectState[];
  readonly routes: readonly EnvironmentRouteState[];
}

export function createRootboundRegrowthConnections(input: Readonly<{
  ownerId: string;
  ownerPosition: EnvironmentPoint;
  rootNodes: readonly (EnvironmentPoint & { readonly id: string })[];
  startTick: number;
}>): RootboundRegrowthConnectionBundle {
  if (input.ownerId.length === 0) throw new TypeError("Regrowth owner ID is required");
  assertTick(input.startTick, "Regrowth connection start tick");
  if (input.rootNodes.length !== ROOTBOUND_REGROWTH_CONNECTION_COUNT) {
    throw new RangeError(`Regrowth requires exactly ${String(ROOTBOUND_REGROWTH_CONNECTION_COUNT)} authored root nodes`);
  }
  canonicalConnectionIds(input.rootNodes.map((node) => node.id));
  if (![input.ownerPosition, ...input.rootNodes].every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))) {
    throw new RangeError("Regrowth connection geometry must be finite");
  }
  const combatObjects = input.rootNodes.map((node, index): EnvironmentCombatObjectState => {
    const id = `${input.ownerId}:regrowth:g1:${String(index + 1)}`;
    const points = Object.freeze([Object.freeze({ ...input.ownerPosition }), Object.freeze({ x: node.x, y: node.y })]);
    return Object.freeze({
      id,
      factoryId: "root-link",
      kind: "root-link",
      ownerId: input.ownerId,
      targetId: null,
      geometry: Object.freeze({
        x: Math.min(input.ownerPosition.x, node.x),
        y: Math.min(input.ownerPosition.y, node.y),
        w: Math.abs(node.x - input.ownerPosition.x),
        h: Math.abs(node.y - input.ownerPosition.y),
        points,
      }),
      integrity: 1,
      maxIntegrity: 1,
      counterplayTags: Object.freeze(["cut", "break"]),
      procEligible: false,
      damageDedupeId: `${id}:damage`,
      state: "active",
      stateTick: input.startTick,
      cleanupReason: null,
      patternId: `rootbound-regrowth/${node.id}`,
    });
  });
  const routes = combatObjects.map((object): EnvironmentRouteState => Object.freeze({
    id: `${object.id}:route`,
    factoryId: "regrowth-link",
    kind: "regrowth-link",
    points: object.geometry.points ?? Object.freeze([]),
    state: object.state,
    stateTick: input.startTick,
    ownerId: input.ownerId,
    cleanupReason: null,
  }));
  return Object.freeze({ combatObjects: Object.freeze(combatObjects), routes: Object.freeze(routes) });
}

export type RootboundRegrowthPhase = "idle" | "channeling" | "resolved";
export type RootboundRegrowthInterruptClassification = "full-interrupt" | "partial-interrupt" | "no-interrupt";

/** Canonical, replay-safe Regrowth channel facts. Healing and recovery belong to the outcome resolver. */
export interface RootboundRegrowthState {
  readonly phase: RootboundRegrowthPhase;
  readonly useCount: 0 | 1;
  readonly startTick: number | null;
  readonly requiredConnectionIds: readonly string[];
  readonly survivingConnectionIds: readonly string[];
  readonly progress: number;
  readonly interruptClassification: RootboundRegrowthInterruptClassification | null;
}

function freezeState(state: RootboundRegrowthState): RootboundRegrowthState {
  return Object.freeze({
    ...state,
    requiredConnectionIds: Object.freeze([...state.requiredConnectionIds]),
    survivingConnectionIds: Object.freeze([...state.survivingConnectionIds]),
  });
}

function assertTick(tick: number, label: string): void {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError(`${label} must be a non-negative safe integer`);
}

function canonicalConnectionIds(connectionIds: readonly string[]): readonly string[] {
  if (connectionIds.length === 0) throw new RangeError("Regrowth requires at least one connection");
  if (connectionIds.some((id) => typeof id !== "string" || id.length === 0)) throw new TypeError("Regrowth connection IDs must be non-empty strings");
  if (new Set(connectionIds).size !== connectionIds.length) throw new RangeError("Regrowth connection IDs must be unique");
  return Object.freeze([...connectionIds]);
}

export function createRootboundRegrowthState(): RootboundRegrowthState {
  return freezeState({
    phase: "idle",
    useCount: 0,
    startTick: null,
    requiredConnectionIds: Object.freeze([]),
    survivingConnectionIds: Object.freeze([]),
    progress: 0,
    interruptClassification: null,
  });
}

export function beginRootboundRegrowth(
  state: RootboundRegrowthState,
  startTick: number,
  connectionIds: readonly string[],
): RootboundRegrowthState {
  assertTick(startTick, "Regrowth start tick");
  if (state.useCount !== 0 || state.phase !== "idle") throw new RangeError("Rootbound may use Regrowth at most once");
  const requiredConnectionIds = canonicalConnectionIds(connectionIds);
  return freezeState({
    phase: "channeling",
    useCount: 1,
    startTick,
    requiredConnectionIds,
    survivingConnectionIds: requiredConnectionIds,
    progress: 0,
    interruptClassification: null,
  });
}

export function advanceRootboundRegrowth(
  state: RootboundRegrowthState,
  tick: number,
  activeConnectionIds: ReadonlySet<string>,
  bossChannelBroken: boolean,
): RootboundRegrowthState {
  if (state.phase !== "channeling") return state;
  assertTick(tick, "Regrowth tick");
  if (state.startTick === null) throw new TypeError("channeling Regrowth state requires a start tick");
  if (tick < state.startTick) throw new RangeError("Regrowth cannot advance before its start tick");
  const survivingConnectionIds = Object.freeze(state.requiredConnectionIds.filter((id) => activeConnectionIds.has(id)));
  const elapsedTicks = tick - state.startTick;
  const progress = Math.min(1, elapsedTicks / ROOTBOUND_REGROWTH_TIMING.channelTicks);
  const resolved = bossChannelBroken || survivingConnectionIds.length === 0 || progress >= 1;
  if (!resolved) return freezeState({ ...state, survivingConnectionIds, progress });
  const interruptClassification: RootboundRegrowthInterruptClassification = bossChannelBroken || survivingConnectionIds.length === 0
    ? "full-interrupt"
    : survivingConnectionIds.length === state.requiredConnectionIds.length ? "no-interrupt" : "partial-interrupt";
  return freezeState({ ...state, phase: "resolved", survivingConnectionIds, progress: 1, interruptClassification });
}
