import type { EnvironmentCombatObjectState, EnvironmentGeometry, EnvironmentRuntimeState, EnvironmentClearReason } from "../environment/environment-contracts";

/** Authoritative world-owned tuning for all Rootbinder timers and forces. */
export interface RootbinderTuning {
  readonly ticksPerSecond: number;
  readonly repositionTicks: number;
  readonly plantWindupTicks: number;
  readonly plantedTicks: number;
  readonly linkWarningTicks: number;
  readonly linkedTicks: number;
  readonly brokenTicks: number;
  readonly recoverTicks: number;
  readonly maxLeashForce: number;
  readonly maxNetworkRedistribution: number;
  readonly leashRadius: number;
  readonly lineMaxLength: number;
  readonly maxNetworksPerRootbinder: number;
  readonly maxPlayerLeashes: number;
  readonly maxNetworkTargets: number;
}

export const ROOTBINDER_TIMING: RootbinderTuning = Object.freeze({
  ticksPerSecond: 120,
  repositionTicks: 60,
  plantWindupTicks: 36,
  plantedTicks: 48,
  linkWarningTicks: 48,
  linkedTicks: 240,
  brokenTicks: 36,
  recoverTicks: 60,
  maxLeashForce: 80,
  maxNetworkRedistribution: 80,
  leashRadius: 120,
  lineMaxLength: 520,
  maxNetworksPerRootbinder: 1,
  maxPlayerLeashes: 1,
  maxNetworkTargets: 3,
});

/** Compatibility defaults; live limits are always read from injected tuning. */
export const ROOTBINDER_CAPS = Object.freeze({ maxNetworksPerRootbinder: ROOTBINDER_TIMING.maxNetworksPerRootbinder, maxPlayerLeashes: ROOTBINDER_TIMING.maxPlayerLeashes, maxNetworkTargets: ROOTBINDER_TIMING.maxNetworkTargets });

export type RootbinderPhase = "reposition" | "plant-windup" | "planted" | "link-warning" | "linked" | "broken" | "recover";

function phaseDuration(phase: RootbinderPhase, tuning: RootbinderTuning): number {
  return phase === "reposition" ? tuning.repositionTicks : phase === "plant-windup" ? tuning.plantWindupTicks
    : phase === "planted" ? tuning.plantedTicks : phase === "link-warning" ? tuning.linkWarningTicks
      : phase === "linked" ? tuning.linkedTicks : phase === "broken" ? tuning.brokenTicks : tuning.recoverTicks;
}

function validateTuning(tuning: RootbinderTuning): RootbinderTuning {
  const durations = [tuning.ticksPerSecond, tuning.repositionTicks, tuning.plantWindupTicks, tuning.plantedTicks,
    tuning.linkWarningTicks, tuning.linkedTicks, tuning.brokenTicks, tuning.recoverTicks, tuning.maxNetworksPerRootbinder, tuning.maxPlayerLeashes, tuning.maxNetworkTargets];
  if (!durations.every((value) => Number.isSafeInteger(value) && value > 0)
    || ![tuning.maxLeashForce, tuning.maxNetworkRedistribution, tuning.leashRadius, tuning.lineMaxLength].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError("Rootbinder tuning must be finite, positive, and tick-bounded");
  }
  return Object.freeze({ ...tuning });
}

const NEXT_PHASE: Readonly<Record<RootbinderPhase, RootbinderPhase>> = {
  reposition: "plant-windup",
  "plant-windup": "planted",
  planted: "link-warning",
  "link-warning": "linked",
  linked: "broken",
  broken: "recover",
  recover: "reposition",
};

export interface RootbinderState {
  readonly id: string;
  readonly factoryId: "rootbinder";
  readonly worldId: string;
  readonly stageId: string;
  readonly x: number;
  readonly y: number;
  readonly state: RootbinderPhase;
  /** Absolute simulation tick at which this phase began. */
  readonly stateTick: number;
  /** Absolute simulation tick at which this phase ends. */
  readonly transitionTick: number;
  /** Absolute simulation tick reached by the authoritative fixed-step owner. */
  readonly simulationTick: number;
  readonly tuning: RootbinderTuning;
}

export function createRootbinderState(input: Pick<RootbinderState, "id" | "worldId" | "stageId" | "x" | "y">, tuning: RootbinderTuning = ROOTBINDER_TIMING): RootbinderState {
  if (!input.id || !input.worldId || !input.stageId || !Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    throw new RangeError("Rootbinder identity and position must be finite and non-empty");
  }
  const validated = validateTuning(tuning);
  return Object.freeze({ ...input, factoryId: "rootbinder" as const, state: "reposition" as const, stateTick: 0, transitionTick: phaseDuration("reposition", validated), simulationTick: 0, tuning: validated });
}

/** Advances only deterministic simulation time; render cadence cannot affect phase boundaries. */
export function advanceRootbinder(value: RootbinderState, ticks: number): RootbinderState {
  if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError("Rootbinder ticks must be a non-negative safe integer");
  let current = value;
  const now = value.simulationTick + ticks;
  while (now >= current.transitionTick) {
    const state = NEXT_PHASE[current.state];
    const stateTick = current.transitionTick;
    current = Object.freeze({ ...current, state, stateTick, transitionTick: stateTick + phaseDuration(state, current.tuning) });
  }
  return current.simulationTick === now ? current : Object.freeze({ ...current, simulationTick: now });
}

export interface ElasticLeash extends EnvironmentCombatObjectState {
  readonly kind: "root-link";
  readonly worldId: string;
  readonly stageId: string;
  readonly sourceId: string;
  readonly playerId: string;
  readonly radius: number;
  readonly tuning: RootbinderTuning;
  readonly force: { readonly x: number; readonly y: number; readonly magnitude: number };
}

export type ElasticLeashBreakReason = "sever" | "death" | "invalid" | "stage-transition" | "natural-expiry";

export interface ElasticLeashInput {
  readonly id: string;
  readonly worldId: string;
  readonly stageId: string;
  readonly sourceId: string;
  readonly playerId: string;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly playerX: number;
  readonly playerY: number;
  readonly radius: number;
  readonly tuning?: RootbinderTuning;
}

function finitePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || !(value > 0)) throw new RangeError(`${name} must be finite and positive`);
  return value;
}

function linkGeometry(sourceX: number, sourceY: number, targetX: number, targetY: number, radius?: number): EnvironmentGeometry {
  return Object.freeze({ x: sourceX, y: sourceY, ...(radius === undefined ? {} : { radius }), points: Object.freeze([{ x: sourceX, y: sourceY }, { x: targetX, y: targetY }]) });
}

export function createElasticLeash(input: ElasticLeashInput): ElasticLeash {
  const tuning = validateTuning(input.tuning ?? ROOTBINDER_TIMING);
  finitePositive(input.radius, "leash radius");
  if (!input.id || !input.worldId || !input.stageId || !input.sourceId || !input.playerId || input.sourceId === input.playerId) {
    throw new RangeError("leash references must be distinct, stable, and non-empty");
  }
  const dx = input.playerX - input.sourceX;
  const dy = input.playerY - input.sourceY;
  const length = Math.hypot(dx, dy) || 1;
  return Object.freeze({
    id: input.id,
    factoryId: "root-link",
    kind: "root-link" as const,
    sourceId: input.sourceId,
    playerId: input.playerId,
    worldId: input.worldId,
    stageId: input.stageId,
    targetId: input.playerId,
    ownerId: input.sourceId,
    geometry: linkGeometry(input.sourceX, input.sourceY, input.playerX, input.playerY, input.radius),
    radius: input.radius,
    tuning,
    integrity: 1,
    maxIntegrity: 1,
    counterplayTags: Object.freeze(["cut", "break"]),
    procEligible: false,
    damageDedupeId: `${input.id}:damage`,
    state: "warning" as const,
    stateTick: 0,
    cleanupReason: null,
    force: Object.freeze({ x: dx / length, y: dy / length, magnitude: tuning.maxLeashForce }),
  });
}

/** Transitions a geometry-first warning into the force-bearing link state. */
export function activateElasticLeash(leash: ElasticLeash, stateTick: number): ElasticLeash {
  if (!Number.isSafeInteger(stateTick) || stateTick < 0) throw new RangeError("leash state tick must be a non-negative safe integer");
  return Object.freeze({ ...leash, state: "active" as const, stateTick });
}

export interface LeashPlayerState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly jumpEnabled: boolean;
  readonly dashEnabled: boolean;
}

/** Applies a bounded restoring impulse only outside the authored radius. */
export function applyElasticLeashForce(leash: ElasticLeash, player: LeashPlayerState, seconds = 1): LeashPlayerState {
  if (leash.state !== "active") return player;
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("leash step duration must be finite and non-negative");
  const geometryPoint = leash.geometry.points?.[0];
  if (geometryPoint === undefined) return player;
  const dx = geometryPoint.x - player.x;
  const dy = geometryPoint.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= leash.radius) return player;
  const excess = Math.min(distance - leash.radius, leash.force.magnitude) * Math.min(seconds, 1);
  return {
    ...player,
    vx: player.vx + (dx / (distance || 1)) * excess,
    vy: player.vy + (dy / (distance || 1)) * excess,
  };
}

export interface ElasticLeashValidity {
  readonly worldId: string;
  readonly stageId: string;
  readonly currentTick: number;
  readonly expiryTick: number;
  readonly sourceAlive: boolean;
  readonly playerAlive: boolean;
  readonly severed: boolean;
}

export function isElasticLeashValid(leash: ElasticLeash, input: ElasticLeashValidity): boolean {
  return leash.state !== "destroyed" && leash.state !== "expired" && !input.severed && input.sourceAlive && input.playerAlive &&
    input.worldId === leash.worldId && input.stageId === leash.stageId && input.currentTick < input.expiryTick;
}

export function breakElasticLeash(leash: ElasticLeash, reason: ElasticLeashBreakReason): ElasticLeash {
  const cleanupReason = reason === "stage-transition" ? "stage-transition" : reason === "natural-expiry" ? "natural-expiry" : reason === "death" ? "defeat" : "disposal";
  return Object.freeze({ ...leash, state: "destroyed" as const, integrity: 0, cleanupReason });
}

export interface RootbinderCandidate {
  readonly id: string;
  readonly worldId: string;
  readonly stageId: string;
  readonly kind: "ordinary" | "boss" | "rootbinder" | "flyer";
  readonly x: number;
  readonly y: number;
  readonly dead: boolean;
  readonly dying: boolean;
  readonly geometryValid?: boolean;
  readonly linked?: boolean;
  readonly vx?: number;
  readonly vy?: number;
  readonly weight?: number;
  readonly applyVelocity?: (vx: number, vy: number) => void;
  readonly supportKinds?: readonly ("priest" | "herald" | "mender" | "anchor" | "rootbinder")[];
}

export interface RootNetworkInput {
  readonly id: string;
  readonly worldId: string;
  readonly stageId: string;
  readonly ownerId: string;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly maxLength?: number;
  readonly tuning?: RootbinderTuning;
}

export const ROOTBINDER_LINE_MAX_LENGTH = ROOTBINDER_TIMING.lineMaxLength;

export interface RootbinderRelationshipCapacity {
  readonly activeNetworks: number;
  readonly activePlayerLeashes: number;
  readonly limits?: Pick<RootbinderTuning, "maxNetworksPerRootbinder" | "maxPlayerLeashes">;
}

export type RootbinderTargetAction = "network" | "player-leash" | "reposition";

export function canCreateRootRelationship(capacity: RootbinderRelationshipCapacity, relationship: "network" | "player-leash"): boolean {
  const limits = capacity.limits ?? ROOTBINDER_CAPS;
  return relationship === "network"
    ? capacity.activeNetworks < limits.maxNetworksPerRootbinder
    : capacity.activePlayerLeashes < limits.maxPlayerLeashes;
}

/** Target order is authored and bounded: ally network, one player leash, then reposition. */
export function selectRootbinderTargetAction(input: Readonly<{
  readonly network: RootNetworkInput;
  readonly candidates: readonly RootbinderCandidate[];
  readonly capacity?: RootbinderRelationshipCapacity;
  readonly playerAvailable: boolean;
}>): RootbinderTargetAction {
  const capacity = input.capacity ?? { activeNetworks: 0, activePlayerLeashes: 0 };
  const eligible = input.candidates.filter((candidate) => candidateIsEligible(input.network, candidate));
  if (eligible.length >= 2 && canCreateRootRelationship(capacity, "network")) return "network";
  if (input.playerAvailable && canCreateRootRelationship(capacity, "player-leash")) return "player-leash";
  return "reposition";
}

export function isRootbinderLineValid(input: Readonly<{ worldId: string; stageId: string; targetWorldId: string; targetStageId: string; sourceX: number; sourceY: number; targetX: number; targetY: number; maxLength?: number }>): boolean {
  const maxLength = input.maxLength ?? ROOTBINDER_TIMING.lineMaxLength;
  return input.worldId === input.targetWorldId && input.stageId === input.targetStageId
    && Number.isFinite(input.sourceX) && Number.isFinite(input.sourceY)
    && Number.isFinite(input.targetX) && Number.isFinite(input.targetY)
    && Number.isFinite(maxLength) && maxLength > 0
    && Math.hypot(input.targetX - input.sourceX, input.targetY - input.sourceY) <= maxLength;
}

function candidateIsEligible(input: RootNetworkInput, candidate: RootbinderCandidate): boolean {
  const maxLength = input.maxLength ?? input.tuning?.lineMaxLength;
  return candidate.kind === "ordinary" && !candidate.dead && !candidate.dying && candidate.geometryValid !== false
    && candidate.linked !== true && (candidate.supportKinds ?? []).every((kind) => kind !== "anchor" && kind !== "rootbinder")
    && candidate.worldId === input.worldId && candidate.stageId === input.stageId && candidate.id !== input.ownerId
    && isRootbinderLineValid({ worldId: input.worldId, stageId: input.stageId, targetWorldId: candidate.worldId, targetStageId: candidate.stageId,
      sourceX: input.sourceX, sourceY: input.sourceY, targetX: candidate.x, targetY: candidate.y,
      ...(maxLength === undefined ? {} : { maxLength }) });
}

/** Selects at most three ordinary, live allies in the same world/stage. */
export function createRootNetwork(input: RootNetworkInput, candidates: readonly RootbinderCandidate[]): readonly EnvironmentCombatObjectState[] {
  if (!input.id || !input.worldId || !input.stageId || !input.ownerId || !Number.isFinite(input.sourceX) || !Number.isFinite(input.sourceY)) throw new RangeError("root network identity and source position are required");
  const selected = candidates.filter((candidate) => candidateIsEligible(input, candidate)).slice(0, input.tuning?.maxNetworkTargets ?? ROOTBINDER_CAPS.maxNetworkTargets);
  if (selected.length < 2) return Object.freeze([]);
  return Object.freeze(selected.map((candidate, index) => Object.freeze({
    id: `${input.id}:${String(index + 1)}`,
    factoryId: "root-link",
    kind: "root-link" as const,
    ownerId: input.ownerId,
    targetId: candidate.id,
    geometry: linkGeometry(input.sourceX, input.sourceY, candidate.x, candidate.y),
    integrity: 1,
    maxIntegrity: 1,
    counterplayTags: Object.freeze(["cut", "break"]),
    procEligible: false,
    damageDedupeId: `${input.id}:${candidate.id}:damage`,
    state: "active" as const,
    stateTick: 0,
    cleanupReason: null,
  })));
}

export function installRootNetwork(
  environment: Pick<EnvironmentRuntimeState, "addCombatObject" | "worldId" | "stageId">,
  input: RootNetworkInput,
  candidates: readonly RootbinderCandidate[],
  capacity: RootbinderRelationshipCapacity = { activeNetworks: 0, activePlayerLeashes: 0 },
): readonly EnvironmentCombatObjectState[] {
  if (!canCreateRootRelationship(capacity, "network")) return Object.freeze([]);
  if (environment.worldId !== input.worldId || environment.stageId !== input.stageId) throw new RangeError("root network host does not match world/stage");
  const segments = createRootNetwork(input, candidates);
  for (const segment of segments) environment.addCombatObject(segment);
  return segments;
}

export function severRootLink(
  environment: { damageCombatObject: (id: string, amount: number, attackId: string, tick?: number) => RootLinkDamageResult },
  id: string,
  attackId: string,
  tick: number,
): RootLinkDamageResult {
  return environment.damageCombatObject(id, Number.MAX_SAFE_INTEGER, attackId, tick);
}

export interface RootLinkDamageResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly damage: number;
  readonly integrity: number;
  readonly destroyed: boolean;
}

export function cleanupRootNetwork(
  environment: Pick<EnvironmentRuntimeState, "combatObjects" | "updateCombatObject"> & {
    readonly cleanupCombatObject?: (id: string, reason: EnvironmentClearReason, tick?: number) => void;
  },
  ownerId: string,
  reason: EnvironmentClearReason,
): void {
  for (const object of environment.combatObjects()) {
    if (object.ownerId === ownerId && object.kind === "root-link" && object.state !== "destroyed" && object.state !== "expired") {
      if (environment.cleanupCombatObject !== undefined) environment.cleanupCombatObject(object.id, reason);
      else environment.updateCombatObject(object.id, { state: "expired", cleanupReason: reason });
    }
  }
}

export interface RootNetworkKnockbackInput {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly weight: number;
  readonly maxRedistribution: number;
  readonly edgeDistance: number;
  readonly seconds?: number;
  readonly appliedImpulseX?: number;
  readonly appliedImpulseY?: number;
  readonly directionX?: number;
  readonly directionY?: number;
}

export interface RootNetworkKnockbackResult {
  readonly vx: number;
  readonly vy: number;
  readonly anchored: false;
  readonly damageReduction: 1;
  readonly preventDeath: false;
  readonly appliedImpulseX: number;
  readonly appliedImpulseY: number;
}

/** Adds only a bounded edge-pivot impulse; it does not turn allies into Anchors. */
export function redistributeRootNetworkKnockback(input: RootNetworkKnockbackInput): RootNetworkKnockbackResult {
  const cap = finitePositive(input.maxRedistribution, "redistribution cap");
  const edge = Math.max(0, Math.min(input.edgeDistance, cap));
  const seconds = input.seconds === undefined ? 1 : Math.max(0, Math.min(input.seconds, 1));
  const directionLength = Math.hypot(input.directionX ?? 1, input.directionY ?? -1) || 1;
  const directionX = (input.directionX ?? 1) / directionLength;
  const directionY = (input.directionY ?? -1) / directionLength;
  const appliedX = input.appliedImpulseX ?? 0;
  const appliedY = input.appliedImpulseY ?? 0;
  const remaining = Math.max(0, cap - Math.hypot(appliedX, appliedY));
  const scale = Math.min(edge / Math.max(1, input.weight), remaining, cap * seconds);
  const deltaX = directionX * scale;
  const deltaY = directionY * scale;
  return Object.freeze({
    vx: input.vx + deltaX,
    vy: input.vy + deltaY,
    anchored: false as const,
    damageReduction: 1 as const,
    preventDeath: false as const,
    appliedImpulseX: appliedX + deltaX,
    appliedImpulseY: appliedY + deltaY,
  });
}
