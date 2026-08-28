import { EnvironmentState, createEnvironmentState } from "./environment-state";
import type { EnvironmentClearReason, EnvironmentCombatObjectState, EnvironmentRuntimeConfiguration, EnvironmentRuntimeState, EnvironmentSnapshot } from "./environment-contracts";
import { advanceEnvironmentField } from "./field-runtime";
import { createEnvironmentCombatObjectRuntime, type EnvironmentCombatObjectRuntime } from "./combat-object-runtime";
import { cleanupOrphanedEnvironmentReferences } from "./environment-cleanup";
import type { TearGameplayEventPort } from "../runtime/gameplay-events";
import { publishEnvironmentEvent } from "./environment-events";
import { applyBloomWellForce, advanceBloomWell, isBloomWellState, type BloomWellActor } from "./bloom-well";
import { applyElasticLeashForce, createElasticLeash, createRootNetwork, installRootNetwork, isElasticLeashValid, isRootbinderLineValid, redistributeRootNetworkKnockback, type LeashPlayerState, type RootbinderCandidate, type RootbinderState } from "../entities/rootbinder-runtime";
import { installGraftAnchor, type GraftAnchorPlacementRequest } from "./graft-anchor";

/** The only phases an environment may own inside one authoritative tick. */
export type EnvironmentStepPhase = "pre-step" | "active-fields" | "collision-resolution" | "post-commit";

export interface EnvironmentStepContext {
  readonly tick: number;
  readonly seconds: number;
  readonly phase: EnvironmentStepPhase;
  readonly environment: EnvironmentRuntimeState;
}

export interface EnvironmentStepHooks {
  readonly preStep?: (context: EnvironmentStepContext) => void;
  readonly activeFields?: (context: EnvironmentStepContext) => void;
  readonly resolveCollisions?: (context: EnvironmentStepContext) => void;
  readonly postCommit?: (context: EnvironmentStepContext) => void;
}

/** Fixed-step port consumed by the authoritative simulation controller. */
export interface EnvironmentStepPort {
  step(tick: number, seconds: number, gameplayStep: () => void, availableActorIds?: ReadonlySet<string>): void;
  clear(reason: EnvironmentClearReason): void;
}

export interface RootbinderEnvironmentActor {
  readonly id: string;
  readonly state: RootbinderState;
  readonly candidates: readonly RootbinderCandidate[];
  readonly player?: RootbinderPlayerTarget;
}

export interface RootbinderPlayerTarget extends LeashPlayerState {
  readonly id: string;
  readonly alive: boolean;
  readonly apply: (value: LeashPlayerState) => void;
}

export interface RootboundEnvironmentActor {
  readonly id: string;
  readonly source: unknown;
  readonly state: Readonly<{
    stage: "warning" | "active" | "cleanup" | null;
    geometry: Readonly<{ x: number; y: number; w: number; h: number }>;
    damage: number;
    cleanupReason: "natural-expiry" | "stage-transition" | null;
    graftPlacements?: readonly GraftAnchorPlacementRequest[];
    ownerPosition?: Readonly<{ x: number; y: number }>;
  }>;
  readonly player?: Readonly<{
    x: number; y: number; hw: number; hh: number; invulnerable: boolean; hazardDamageMultiplier: number;
    takeDamage: (damage: number, sourceX: number, source: unknown) => void;
  }>;
}

/** Collection owner plus the bounded fixed-step phase seam. */
export class EnvironmentRuntime extends EnvironmentState implements EnvironmentStepPort {
  readonly #hooks: EnvironmentStepHooks;
  #events: TearGameplayEventPort | undefined;
  #availableActorIds: (() => ReadonlySet<string>) | undefined;
  #bloomWellActors: (() => readonly BloomWellActor[]) | undefined;
  #rootbinderActors: (() => readonly RootbinderEnvironmentActor[]) | undefined;
  #rootboundActors: (() => readonly RootboundEnvironmentActor[]) | undefined;
  readonly #combatKernels = new Map<string, EnvironmentCombatObjectRuntime>();
  readonly #rootbinderNetworks = new Map<string, readonly string[]>();
  readonly #rootbinderLeashes = new Map<string, string>();
  readonly #rootbinderRedistribution = new Map<string, Readonly<{ x: number; y: number }>>();
  readonly #rootbinderGenerations = new Map<string, number>();
  readonly #rootlineFields = new Map<string, string>();
  readonly #rootlineHitFields = new Set<string>();
  #phaseLog: EnvironmentStepPhase[] = [];

  constructor(stageId = "unknown", worldId: string, configuration?: Partial<EnvironmentRuntimeConfiguration>, hooks: EnvironmentStepHooks = {}, options: Readonly<{ events?: TearGameplayEventPort; availableActorIds?: () => ReadonlySet<string>; bloomWellActors?: () => readonly BloomWellActor[] }> = {}) {
    super(stageId, worldId, configuration); this.#hooks = hooks; this.#events = options.events; this.#availableActorIds = options.availableActorIds; this.#bloomWellActors = options.bloomWellActors;
  }

  get phaseLog(): readonly EnvironmentStepPhase[] { return this.#phaseLog; }
  clearPhaseLog(): void { this.#phaseLog = []; }
  override replace(snapshot: EnvironmentSnapshot): void {
    const priorIds = new Set(this.combatObjects().map((object) => object.id));
    super.replace(snapshot); this.#combatKernels.clear(); this.#rootbinderNetworks.clear(); this.#rootbinderLeashes.clear(); this.#rootbinderRedistribution.clear(); this.#rootlineFields.clear(); this.#rootlineHitFields.clear();
    this.#rootbinderGenerations.clear();
    for (const object of snapshot.combatObjects) {
      const match = /^(.*):(network|leash):g(\d+)(?::\d+)?$/u.exec(object.id);
      const ownerId = match?.[1];
      const relationshipKind = match?.[2];
      const generationText = match?.[3];
      if (ownerId !== undefined && generationText !== undefined) {
        this.#rootbinderGenerations.set(ownerId, Math.max(this.#rootbinderGenerations.get(ownerId) ?? 0, Number(generationText)));
        if (object.state !== "destroyed" && object.state !== "expired") {
          if (relationshipKind === "leash") this.#rootbinderLeashes.set(ownerId, object.id);
          else if (relationshipKind === "network") this.#rootbinderNetworks.set(
            ownerId,
            Object.freeze([...(this.#rootbinderNetworks.get(ownerId) ?? []), object.id]),
          );
        }
      }
    }
    if (this.#events !== undefined) for (const object of snapshot.combatObjects) {
      if (object.kind === "root-link" && !priorIds.has(object.id)) publishEnvironmentEvent(this.#events, { event: "combat-object-link-created", objectId: object.id, category: "combat-object", objectKind: object.kind }, object.stateTick);
    }
  }
  override clear(reason: EnvironmentClearReason): void { super.clear(reason); this.#combatKernels.clear(); this.#rootbinderNetworks.clear(); this.#rootbinderLeashes.clear(); this.#rootbinderRedistribution.clear(); this.#rootbinderGenerations.clear(); this.#rootlineFields.clear(); this.#rootlineHitFields.clear(); }
  override removeCombatObject(id: string): void { super.removeCombatObject(id); this.#combatKernels.delete(id); this.#rootbinderRedistribution.delete(id); }

  /** Cleans one relationship through its kernel so the native cleanup fact is delivered. */
  cleanupCombatObject(id: string, reason: EnvironmentClearReason, tick = 0): void {
    const object = this.combatObjects().find((entry) => entry.id === id);
    if (object === undefined) throw new RangeError(`unknown environment combat object: ${id}`);
    let kernel = this.#combatKernels.get(id);
    if (kernel === undefined) {
      kernel = createEnvironmentCombatObjectRuntime(object, undefined, this.#events);
      this.#combatKernels.set(id, kernel);
    }
    this.updateCombatObject(id, { ...kernel.cleanup(reason), stateTick: tick });
    this.#combatKernels.delete(id); this.#rootbinderRedistribution.delete(id);
  }

  #run(phase: EnvironmentStepPhase, tick: number, seconds: number, callback: ((context: EnvironmentStepContext) => void) | undefined): void {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("environment tick must be a non-negative safe integer");
    if (!(seconds > 0) || !Number.isFinite(seconds)) throw new RangeError("environment step duration must be finite and positive");
    this.#phaseLog.push(phase);
    callback?.({ tick, seconds, phase, environment: this });
  }

  /** Executes the four environment-owned phases exactly once in canonical order. */
  setEventPort(events: TearGameplayEventPort | undefined): void { this.#events = events; }
  setAvailableActorIdsSource(source: (() => ReadonlySet<string>) | undefined): void { this.#availableActorIds = source; }
  setBloomWellActorsSource(source: (() => readonly BloomWellActor[]) | undefined): void { this.#bloomWellActors = source; }
  setRootbinderActorsSource(source: (() => readonly RootbinderEnvironmentActor[]) | undefined): void { this.#rootbinderActors = source; }
  setRootboundActorsSource(source: (() => readonly RootboundEnvironmentActor[]) | undefined): void { this.#rootboundActors = source; }

  #advanceRootboundRootlines(tick: number): void {
    const present = new Set<string>();
    for (const actor of this.#rootboundActors?.() ?? []) {
      present.add(actor.id);
      const stage = actor.state.stage;
      const environmentState = stage === null ? "expired" : stage === "cleanup" ? "cooldown" : stage;
      let fieldId = this.#rootlineFields.get(actor.id);
      if (stage !== null && fieldId === undefined) {
        fieldId = this.addField({
          kind: "rootline", geometry: actor.state.geometry, state: environmentState, stateTick: tick, timer: 0,
          ownerId: actor.id, schedule: null, eligibility: Object.freeze({ player: true, enemies: false, bosses: false }),
          force: null, cleanupReason: null, patternId: "rootbound-rootline",
        });
        this.#rootlineFields.set(actor.id, fieldId);
      } else if (stage !== null && fieldId !== undefined) {
        const prior = this.fields().find((field) => field.id === fieldId);
        if (prior !== undefined && prior.state !== environmentState) {
          this.updateField(fieldId, { state: environmentState, stateTick: tick, geometry: actor.state.geometry });
          if (stage === "active" && this.#events !== undefined) publishEnvironmentEvent(this.#events, {
            event: "field-started", objectId: fieldId, category: "field", objectKind: "rootline",
          }, tick);
        } else if (prior !== undefined) this.updateField(fieldId, { geometry: actor.state.geometry });
      }
      if (stage === "active" && fieldId !== undefined && !this.#rootlineHitFields.has(fieldId)) {
        const target = actor.player;
        const geometry = actor.state.geometry;
        if (target !== undefined && !target.invulnerable
          && target.x + target.hw >= geometry.x && target.x - target.hw <= geometry.x + geometry.w
          && target.y + target.hh >= geometry.y && target.y - target.hh <= geometry.y + geometry.h) {
          this.#rootlineHitFields.add(fieldId);
          target.takeDamage(actor.state.damage * target.hazardDamageMultiplier, geometry.x + geometry.w / 2, actor.source);
        }
      }
      if (stage === null && fieldId !== undefined) {
        const cleanupReason = actor.state.cleanupReason ?? "natural-expiry";
        this.updateField(fieldId, { state: "expired", stateTick: tick, cleanupReason });
        if (this.#events !== undefined) publishEnvironmentEvent(this.#events, {
          event: "field-resolved", objectId: fieldId, category: "field", objectKind: "rootline", reason: cleanupReason,
        }, tick);
        this.#rootlineFields.delete(actor.id); this.#rootlineHitFields.delete(fieldId);
      }
    }
    for (const [ownerId, fieldId] of this.#rootlineFields) if (!present.has(ownerId)) {
      this.updateField(fieldId, { state: "expired", stateTick: tick, cleanupReason: "stage-transition" });
      this.#rootlineFields.delete(ownerId); this.#rootlineHitFields.delete(fieldId);
    }
  }

  #advanceRootboundGrafts(tick: number): void {
    for (const actor of this.#rootboundActors?.() ?? []) {
      const ownerPosition = actor.state.ownerPosition;
      if (ownerPosition === undefined) continue;
      for (const placement of actor.state.graftPlacements ?? []) installGraftAnchor(this, {
        ownerId: actor.id,
        ownerPosition,
        graftType: placement.graftType,
        geometry: placement.geometry,
        createdTick: tick,
      });
    }
  }

  #nextRootbinderId(ownerId: string, kind: "network" | "leash"): string {
    const generation = (this.#rootbinderGenerations.get(ownerId) ?? 0) + 1;
    this.#rootbinderGenerations.set(ownerId, generation);
    return `${ownerId}:${kind}:g${String(generation)}`;
  }

  #refreshNetworkSegment(segment: EnvironmentCombatObjectState, actor: RootbinderEnvironmentActor, candidate: RootbinderCandidate, tick: number, seconds: number): boolean {
    if (segment.state === "destroyed" || segment.state === "expired") return false;
    const valid = isRootbinderLineValid({ worldId: this.worldId, stageId: this.stageId, targetWorldId: candidate.worldId, targetStageId: candidate.stageId,
      sourceX: actor.state.x, sourceY: actor.state.y, targetX: candidate.x, targetY: candidate.y, maxLength: actor.state.tuning.lineMaxLength });
    if (!valid || candidate.dead || candidate.dying || candidate.geometryValid === false) {
      this.cleanupCombatObject(segment.id, "natural-expiry", tick);
      return false;
    }
    const points = Object.freeze([{ x: actor.state.x, y: actor.state.y }, { x: candidate.x, y: candidate.y }]);
    this.updateCombatObject(segment.id, { geometry: Object.freeze({ x: actor.state.x, y: actor.state.y, points }) });
    const edgeDistance = Math.max(0, Math.hypot(candidate.x - actor.state.x, candidate.y - actor.state.y) - actor.state.tuning.lineMaxLength * 0.75);
    if (edgeDistance === 0) this.#rootbinderRedistribution.delete(segment.id);
    if (edgeDistance > 0 && candidate.applyVelocity !== undefined) {
      const priorImpulse = this.#rootbinderRedistribution.get(segment.id);
      const result = redistributeRootNetworkKnockback({ x: candidate.x, y: candidate.y, vx: candidate.vx ?? 0, vy: candidate.vy ?? 0,
        weight: candidate.weight ?? 1, maxRedistribution: actor.state.tuning.maxNetworkRedistribution, edgeDistance, seconds,
        ...(priorImpulse === undefined ? {} : { appliedImpulseX: priorImpulse.x, appliedImpulseY: priorImpulse.y }),
        directionX: actor.state.x - candidate.x, directionY: actor.state.y - candidate.y });
      candidate.applyVelocity(result.vx, result.vy);
      this.#rootbinderRedistribution.set(segment.id, Object.freeze({ x: result.appliedImpulseX, y: result.appliedImpulseY }));
    }
    return true;
  }

  #advanceRootbinderNetworks(tick: number, seconds: number): void {
    const actors = this.#rootbinderActors?.() ?? [];
    const present = new Set<string>();
    for (const actor of actors) {
      present.add(actor.id);
      const existing = this.#rootbinderNetworks.get(actor.id);
      if (actor.state.state === "linked" && existing === undefined) {
        const segments = installRootNetwork(this, {
          id: this.#nextRootbinderId(actor.id, "network"), worldId: this.worldId, stageId: this.stageId,
          ownerId: actor.id, sourceX: actor.state.x, sourceY: actor.state.y,
          maxLength: actor.state.tuning.lineMaxLength, tuning: actor.state.tuning,
        }, actor.candidates, { activeNetworks: 0, activePlayerLeashes: this.#rootbinderLeashes.size, limits: actor.state.tuning });
        if (segments.length > 0) {
          this.#rootbinderNetworks.set(actor.id, Object.freeze(segments.map((segment) => segment.id)));
          for (const segment of segments) if (this.#events !== undefined) publishEnvironmentEvent(this.#events, { event: "combat-object-link-created", objectId: segment.id, category: "combat-object", objectKind: segment.kind }, tick);
        }
      } else if (existing !== undefined && actor.state.state === "linked") {
        let activeSegment = false;
        for (const id of existing) {
          const segment = this.combatObjects().find((entry) => entry.id === id);
          const candidate = segment === undefined ? undefined : actor.candidates.find((value) => value.id === segment.targetId);
          if (segment !== undefined && candidate !== undefined) {
            activeSegment ||= this.#refreshNetworkSegment(segment, actor, candidate, tick, seconds);
          }
          else if (segment !== undefined && segment.state !== "destroyed" && segment.state !== "expired") this.cleanupCombatObject(segment.id, "natural-expiry", tick);
        }
        if (!activeSegment) this.#rootbinderNetworks.delete(actor.id);
      } else if (existing !== undefined && actor.state.state !== "linked") {
        for (const id of existing) {
          const object = this.combatObjects().find((entry) => entry.id === id);
          if (object !== undefined && object.state !== "destroyed" && object.state !== "expired") this.cleanupCombatObject(id, actor.state.state === "broken" ? "natural-expiry" : "stage-transition", tick);
        }
        this.#rootbinderNetworks.delete(actor.id);
      }

      const player = actor.player;
      let leashId = this.#rootbinderLeashes.get(actor.id);
      const usefulNetwork = this.#rootbinderNetworks.has(actor.id) || createRootNetwork({
        id: `${actor.id}:probe`, worldId: this.worldId, stageId: this.stageId, ownerId: actor.id,
        sourceX: actor.state.x, sourceY: actor.state.y, tuning: actor.state.tuning,
      }, actor.candidates).length > 0;
      if (!usefulNetwork && player !== undefined && player.alive && (actor.state.state === "link-warning" || actor.state.state === "linked")) {
        if (leashId === undefined && this.#rootbinderLeashes.size < actor.state.tuning.maxPlayerLeashes) {
          const leash = createElasticLeash({ id: this.#nextRootbinderId(actor.id, "leash"), worldId: this.worldId, stageId: this.stageId,
            sourceId: actor.id, playerId: player.id, sourceX: actor.state.x, sourceY: actor.state.y,
            playerX: player.x, playerY: player.y, radius: actor.state.tuning.leashRadius, tuning: actor.state.tuning });
          this.addCombatObject(leash); this.#rootbinderLeashes.set(actor.id, leash.id); leashId = leash.id;
          if (this.#events !== undefined) publishEnvironmentEvent(this.#events, { event: "combat-object-link-created", objectId: leash.id, category: "combat-object", objectKind: leash.kind }, tick);
        } else {
          const leash = this.combatObjects().find((entry) => entry.id === leashId);
          if (leash !== undefined) {
            const sourceAlive = true;
            const valid = isElasticLeashValid(leash as never, { worldId: this.worldId, stageId: this.stageId, currentTick: tick,
              expiryTick: actor.state.transitionTick, sourceAlive, playerAlive: player.alive, severed: leash.state === "destroyed" });
            if (!valid) {
              if (leash.state !== "destroyed" && leash.state !== "expired") this.cleanupCombatObject(leash.id, "natural-expiry", tick);
              this.#rootbinderLeashes.delete(actor.id); leashId = undefined;
              continue;
            }
            const active = actor.state.state === "linked";
            if (active && leash.state === "warning") this.updateCombatObject(leash.id, { state: "active", stateTick: tick });
            const geometry = Object.freeze({ x: actor.state.x, y: actor.state.y, radius: actor.state.tuning.leashRadius,
              points: Object.freeze([{ x: actor.state.x, y: actor.state.y }, { x: player.x, y: player.y }]) });
            this.updateCombatObject(leash.id, { geometry });
            if (active) player.apply(applyElasticLeashForce({ ...leash, state: "active", geometry, tuning: actor.state.tuning } as never, player, seconds));
          }
        }
      } else if (leashId !== undefined) {
        const leash = this.combatObjects().find((entry) => entry.id === leashId);
        if (leash !== undefined && leash.state !== "destroyed" && leash.state !== "expired") this.cleanupCombatObject(leash.id, player?.alive === false ? "defeat" : "stage-transition", tick);
        this.#rootbinderLeashes.delete(actor.id);
      }
    }
    for (const [ownerId, ids] of this.#rootbinderNetworks) if (!present.has(ownerId)) {
      for (const id of ids) {
        const object = this.combatObjects().find((entry) => entry.id === id);
        if (object !== undefined && object.state !== "destroyed" && object.state !== "expired") this.cleanupCombatObject(id, "defeat", tick);
      }
      this.#rootbinderNetworks.delete(ownerId);
      const leashId = this.#rootbinderLeashes.get(ownerId);
      if (leashId !== undefined) {
        const leash = this.combatObjects().find((entry) => entry.id === leashId);
        if (leash !== undefined && leash.state !== "destroyed" && leash.state !== "expired") this.cleanupCombatObject(leashId, "defeat", tick);
        this.#rootbinderLeashes.delete(ownerId);
      }
    }
    for (const [ownerId, leashId] of this.#rootbinderLeashes) if (!present.has(ownerId)) {
      const leash = this.combatObjects().find((entry) => entry.id === leashId);
      if (leash !== undefined && leash.state !== "destroyed" && leash.state !== "expired") this.cleanupCombatObject(leashId, "defeat", tick);
      this.#rootbinderLeashes.delete(ownerId);
    }
  }

  damageCombatObject(id: string, amount: number, attackId: string, tick = 0) {
    const object = this.combatObjects().find((entry) => entry.id === id);
    if (object === undefined) throw new RangeError(`unknown environment combat object: ${id}`);
    let kernel = this.#combatKernels.get(id);
    if (kernel !== undefined && (kernel.state.integrity !== object.integrity || kernel.state.state !== object.state
      || kernel.state.cleanupReason !== object.cleanupReason || kernel.state.maxIntegrity !== object.maxIntegrity)) {
      this.#combatKernels.delete(id); kernel = undefined;
    }
    if (kernel === undefined) {
      kernel = createEnvironmentCombatObjectRuntime(object, undefined, this.#events);
      this.#combatKernels.set(id, kernel);
    }
    const result = kernel.damage(amount, attackId, tick);
    if (result.accepted) this.updateCombatObject(id, { ...kernel.state, stateTick: tick });
    return result;
  }

  #advanceFields(tick: number, seconds: number): void {
    for (const field of this.fields()) {
      if (isBloomWellState(field)) {
        const result = advanceBloomWell(field, tick, this.#events);
        if (result !== field) this.updateField(field.id, result);
        if (result.state === "active") for (const actor of this.#bloomWellActors?.() ?? []) applyBloomWellForce(result, actor, seconds);
        continue;
      }
      const result = advanceEnvironmentField(field, tick, seconds, "natural-expiry", this.#events);
      if (result.field !== field) this.updateField(field.id, { ...result.field, stateTick: result.transition === undefined ? field.stateTick : tick });
    }
  }

  #cleanupOrphans(tick: number, availableActorIds?: ReadonlySet<string>): void {
    const ids = availableActorIds ?? this.#availableActorIds?.();
    if (ids === undefined) return;
    const before = this.snapshot();
    const after = cleanupOrphanedEnvironmentReferences(before, ids, "stage-transition");
    if (this.#events !== undefined) {
      for (const [category, entries] of [["field", after.fields], ["combat-object", after.combatObjects], ["route", after.routes]] as const) {
        const prior = new Map((category === "field" ? before.fields : category === "combat-object" ? before.combatObjects : before.routes).map((entry) => [entry.id, entry]));
        for (const entry of entries) if (entry.cleanupReason !== null && prior.get(entry.id)?.cleanupReason !== entry.cleanupReason) {
          publishEnvironmentEvent(this.#events, { event: "object-cleaned", objectId: entry.id, category, objectKind: entry.kind, reason: entry.cleanupReason }, tick);
        }
      }
    }
    for (const entry of after.fields) if (entry.state !== before.fields.find((candidate) => candidate.id === entry.id)?.state
      || entry.cleanupReason !== before.fields.find((candidate) => candidate.id === entry.id)?.cleanupReason) this.updateField(entry.id, entry);
    for (const entry of after.combatObjects) if (entry.state !== before.combatObjects.find((candidate) => candidate.id === entry.id)?.state
      || entry.cleanupReason !== before.combatObjects.find((candidate) => candidate.id === entry.id)?.cleanupReason) {
      this.updateCombatObject(entry.id, entry); this.#combatKernels.delete(entry.id);
    }
    for (const entry of after.routes) if (entry.state !== before.routes.find((candidate) => candidate.id === entry.id)?.state
      || entry.cleanupReason !== before.routes.find((candidate) => candidate.id === entry.id)?.cleanupReason) this.updateRoute(entry.id, entry);
  }

  step(tick: number, seconds: number, gameplayStep: () => void, availableActorIds?: ReadonlySet<string>): void {
    if (typeof gameplayStep !== "function") throw new TypeError("environment gameplay step is required");
    this.clearPhaseLog(); this.#run("pre-step", tick, seconds, this.#hooks.preStep); gameplayStep();
    this.#run("active-fields", tick, seconds, () => { this.#advanceFields(tick, seconds); this.#advanceRootbinderNetworks(tick, seconds); this.#advanceRootboundRootlines(tick); this.#advanceRootboundGrafts(tick); this.#hooks.activeFields?.({ tick, seconds, phase: "active-fields", environment: this }); });
    this.#run("collision-resolution", tick, seconds, this.#hooks.resolveCollisions);
    this.#run("post-commit", tick, seconds, () => { this.#cleanupOrphans(tick, availableActorIds); this.#hooks.postCommit?.({ tick, seconds, phase: "post-commit", environment: this }); });
  }
}

export function createEnvironmentRuntime(options: Readonly<{
  readonly stageId?: string;
  readonly worldId?: string;
  readonly configuration?: Partial<EnvironmentRuntimeConfiguration>;
  readonly hooks?: EnvironmentStepHooks;
  readonly events?: TearGameplayEventPort;
  readonly availableActorIds?: () => ReadonlySet<string>;
  readonly bloomWellActors?: () => readonly BloomWellActor[];
}> = {}): EnvironmentRuntime {
  if (options.worldId === undefined) throw new TypeError("environment world identity is required");
  return new EnvironmentRuntime(options.stageId ?? "unknown", options.worldId, options.configuration, options.hooks, options);
}

export { createEnvironmentState };
