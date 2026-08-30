import { EnvironmentState, createEnvironmentState } from "./environment-state";
import type { EnvironmentClearReason, EnvironmentObjectValidationPort, EnvironmentRuntimeConfiguration, EnvironmentRuntimeState, EnvironmentSnapshot } from "./environment-contracts";
import { createEnvironmentCombatObjectRuntime, type EnvironmentCombatObjectRuntime, type EnvironmentCounterplayResolution } from "./combat-object-runtime";
import type { EnvironmentCounterplayTag } from "./environment-definitions";
import { cleanupOrphanedEnvironmentReferences } from "./environment-cleanup";
import type { TearGameplayEventPort } from "../runtime/gameplay-events";
import { publishEnvironmentEvent } from "./environment-events";
import type { EnvironmentFeature, EnvironmentFeatureContext } from "./environment-feature-ports";
import { advanceEnvironmentField } from "./field-runtime";

export type EnvironmentStepPhase = "pre-step" | "active-fields" | "collision-resolution" | "post-commit";
export interface EnvironmentStepContext { readonly tick: number; readonly seconds: number; readonly phase: EnvironmentStepPhase; readonly environment: EnvironmentRuntimeState; }
export interface EnvironmentStepHooks { readonly preStep?: (context: EnvironmentStepContext) => void; readonly activeFields?: (context: EnvironmentStepContext) => void; readonly resolveCollisions?: (context: EnvironmentStepContext) => void; readonly postCommit?: (context: EnvironmentStepContext) => void; }
export interface EnvironmentStepPort { step(tick: number, seconds: number, gameplayStep: () => void, availableActorIds?: ReadonlySet<string>): void; clear(reason: EnvironmentClearReason): void; }

function lifecycleChanged(
  prior: Readonly<{ state: string; cleanupReason: EnvironmentClearReason | null }> | undefined,
  next: Readonly<{ state: string; cleanupReason: EnvironmentClearReason | null }>,
): boolean {
  const priorState = prior?.state;
  const priorCleanupReason = prior?.cleanupReason;
  return priorState !== next.state || priorCleanupReason !== next.cleanupReason;
}

/** Data collection and fixed-step phase owner. No biome implementation is imported here. */
export class EnvironmentRuntime extends EnvironmentState implements EnvironmentStepPort, EnvironmentFeatureContext {
  readonly #hooks: EnvironmentStepHooks;
  #events: TearGameplayEventPort | undefined;
  #availableActorIds: (() => ReadonlySet<string>) | undefined;
  #phaseLog: EnvironmentStepPhase[] = [];
  readonly #features = new Map<string, EnvironmentFeature>();
  readonly #actorSources = new Map<string, (() => readonly unknown[]) | undefined>();
  readonly #combatKernels = new Map<string, EnvironmentCombatObjectRuntime>();

  constructor(stageId = "unknown", worldId: string, configuration?: Partial<EnvironmentRuntimeConfiguration>, hooks: EnvironmentStepHooks = {}, options: Readonly<{ events?: TearGameplayEventPort; availableActorIds?: () => ReadonlySet<string>; features?: readonly EnvironmentFeature[]; validators?: readonly EnvironmentObjectValidationPort[] }> = {}) {
    super(stageId, worldId, configuration, options.validators);
    this.#hooks = hooks; this.#events = options.events; this.#availableActorIds = options.availableActorIds;
    for (const feature of options.features ?? []) this.addFeature(feature);
  }
  get events(): TearGameplayEventPort | undefined { return this.#events; }
  get phaseLog(): readonly EnvironmentStepPhase[] { return this.#phaseLog; }
  clearPhaseLog(): void { this.#phaseLog = []; }
  addFeature(feature: EnvironmentFeature): void {
    if (!feature.id) throw new TypeError("environment feature ID is required");
    if (this.#features.has(feature.id)) return;
    this.#features.set(feature.id, feature);
    for (const [key, source] of this.#actorSources) { const separator = key.indexOf(":"); feature.setActorSource?.(key.slice(separator + 1), source); }
  }
  setFeatureActorSource(featureId: string, slot: string, source: (() => readonly unknown[]) | undefined): void {
    if (!featureId || !slot) throw new TypeError("environment feature source identity is required");
    this.#actorSources.set(`${featureId}:${slot}`, source); this.#features.get(featureId)?.setActorSource?.(slot, source);
  }
  override replace(snapshot: EnvironmentSnapshot): void { super.replace(snapshot); for (const feature of this.#features.values()) feature.replace?.(this, snapshot); this.#combatKernels.clear(); }
  override clear(reason: EnvironmentClearReason): void { for (const feature of this.#features.values()) feature.clear?.(this, reason); super.clear(reason); this.#combatKernels.clear(); }
  override removeCombatObject(id: string): void { const prior = this.combatObjects().find((object) => object.id === id); super.removeCombatObject(id); this.#combatKernels.delete(id); if (prior !== undefined) for (const feature of this.#features.values()) feature.combatObjectRemoved?.(this, prior); }
  cleanupCombatObject(id: string, reason: EnvironmentClearReason, tick = 0): void {
    const object = this.combatObjects().find((entry) => entry.id === id); if (object === undefined) throw new RangeError(`unknown environment combat object: ${id}`);
    let kernel = this.#combatKernels.get(id); if (kernel === undefined) { kernel = createEnvironmentCombatObjectRuntime(object, undefined, this.#events); this.#combatKernels.set(id, kernel); }
    this.updateCombatObject(id, { ...kernel.cleanup(reason), stateTick: tick }); this.#combatKernels.delete(id);
  }
  setEventPort(events: TearGameplayEventPort | undefined): void { this.#events = events; }
  setAvailableActorIdsSource(source: (() => ReadonlySet<string>) | undefined): void { this.#availableActorIds = source; }
  damageCombatObject(id: string, amount: number, attackId: string, tick = 0) {
    const object = this.combatObjects().find((entry) => entry.id === id); if (object === undefined) throw new RangeError(`unknown environment combat object: ${id}`);
    let kernel = this.#combatKernels.get(id); if (kernel !== undefined && (kernel.state.integrity !== object.integrity || kernel.state.state !== object.state || kernel.state.cleanupReason !== object.cleanupReason || kernel.state.maxIntegrity !== object.maxIntegrity)) { this.#combatKernels.delete(id); kernel = undefined; }
    if (kernel === undefined) { kernel = createEnvironmentCombatObjectRuntime(object, undefined, this.#events); this.#combatKernels.set(id, kernel); }
    const result = kernel.damage(amount, attackId, tick); if (result.accepted) {
      this.updateCombatObject(id, { ...kernel.state, stateTick: tick });
      for (const feature of this.#features.values()) feature.combatObjectUpdated?.(this, kernel.state);
    }
    return result;
  }
  resolveCombatObjectCounterplay(id: string, capability: EnvironmentCounterplayTag): EnvironmentCounterplayResolution {
    const object = this.combatObjects().find((entry) => entry.id === id); if (object === undefined) throw new RangeError(`unknown environment combat object: ${id}`);
    let kernel = this.#combatKernels.get(id); if (kernel === undefined) { kernel = createEnvironmentCombatObjectRuntime(object, undefined, this.#events); this.#combatKernels.set(id, kernel); }
    return kernel.resolveCounterplay(capability);
  }
  #run(phase: EnvironmentStepPhase, tick: number, seconds: number, callback: ((context: EnvironmentStepContext) => void) | undefined): void {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("environment tick must be a non-negative safe integer"); if (!(seconds > 0) || !Number.isFinite(seconds)) throw new RangeError("environment step duration must be finite and positive"); this.#phaseLog.push(phase); callback?.({ tick, seconds, phase, environment: this });
  }
  #cleanupOrphans(tick: number, availableActorIds?: ReadonlySet<string>): void {
    // The ordinary fixed-step path usually has no environment objects. Avoid
    // cloning two complete snapshots merely to prove that an empty set stays
    // empty; populated Verdant/Pale worlds retain the full cleanup contract.
    if (this.fields().length === 0 && this.combatObjects().length === 0 && this.routes().length === 0) return;
    const sourceIds = availableActorIds ?? this.#availableActorIds?.(); if (sourceIds === undefined) return; const ids = new Set(sourceIds); ids.add(this.stageId); const before = this.snapshot(); const after = cleanupOrphanedEnvironmentReferences(before, ids, "stage-transition");
    if (this.#events !== undefined) for (const [category, entries] of [["field", after.fields], ["combat-object", after.combatObjects], ["route", after.routes]] as const) { const prior = new Map((category === "field" ? before.fields : category === "combat-object" ? before.combatObjects : before.routes).map((entry) => [entry.id, entry])); for (const entry of entries) if (entry.cleanupReason !== null && prior.get(entry.id)?.cleanupReason !== entry.cleanupReason) publishEnvironmentEvent(this.#events, { event: "object-cleaned", objectId: entry.id, category, objectKind: entry.kind, reason: entry.cleanupReason }, tick); }
    for (const entry of after.fields) { const prior = before.fields.find((candidate) => candidate.id === entry.id); const carryStates = entry.carryStates?.filter((carry) => ids.has(carry.actorId)); const carryChanged = entry.carryStates !== undefined && carryStates !== undefined && carryStates.length !== entry.carryStates.length; if (lifecycleChanged(prior, entry) || carryChanged) this.updateField(entry.id, { ...entry, ...(carryStates === undefined ? {} : { carryStates: Object.freeze(carryStates) }) }); }
    for (const entry of after.combatObjects) { const prior = before.combatObjects.find((candidate) => candidate.id === entry.id); if (lifecycleChanged(prior, entry)) { this.updateCombatObject(entry.id, entry); this.#combatKernels.delete(entry.id); } }
    for (const entry of after.routes) { const prior = before.routes.find((candidate) => candidate.id === entry.id); if (lifecycleChanged(prior, entry)) this.updateRoute(entry.id, entry); }
  }
  step(tick: number, seconds: number, gameplayStep: () => void, availableActorIds?: ReadonlySet<string>): void {
    if (typeof gameplayStep !== "function") throw new TypeError("environment gameplay step is required"); this.clearPhaseLog(); this.#run("pre-step", tick, seconds, this.#hooks.preStep); gameplayStep();
    const activeFeatures = [...this.#features.values()].filter((feature) => feature.isActive?.(this) !== false);
    this.#run("active-fields", tick, seconds, (context) => {
      for (const field of this.fields()) if (!activeFeatures.some((feature) => feature.claimsField?.(field) === true)) {
        const result = advanceEnvironmentField(field, tick, seconds, "natural-expiry", this.#events);
        if (result.field !== field) this.updateField(field.id, {
          ...result.field,
          stateTick: result.transition === undefined ? field.stateTick : tick,
        });
      }
      for (const feature of activeFeatures) feature.step(this, tick, seconds);
      this.#hooks.activeFields?.(context);
    });
    this.#run("collision-resolution", tick, seconds, (context) => { for (const feature of activeFeatures) feature.resolveCollisions?.(this, tick, seconds); this.#hooks.resolveCollisions?.(context); });
    this.#run("post-commit", tick, seconds, (context) => { this.#cleanupOrphans(tick, availableActorIds); this.#hooks.postCommit?.(context); });
  }
}

export function createEnvironmentRuntime(options: Readonly<{ readonly stageId?: string; readonly worldId?: string; readonly configuration?: Partial<EnvironmentRuntimeConfiguration>; readonly hooks?: EnvironmentStepHooks; readonly events?: TearGameplayEventPort; readonly availableActorIds?: () => ReadonlySet<string>; readonly features?: readonly EnvironmentFeature[]; readonly validators?: readonly EnvironmentObjectValidationPort[] }> = {}): EnvironmentRuntime {
  if (options.worldId === undefined) throw new TypeError("environment world identity is required"); return new EnvironmentRuntime(options.stageId ?? "unknown", options.worldId, options.configuration, options.hooks, options);
}
export { createEnvironmentState };
