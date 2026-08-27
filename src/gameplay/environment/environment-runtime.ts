import { EnvironmentState, createEnvironmentState } from "./environment-state";
import type { EnvironmentClearReason, EnvironmentRuntimeConfiguration, EnvironmentRuntimeState, EnvironmentSnapshot } from "./environment-contracts";
import { advanceEnvironmentField } from "./field-runtime";
import { createEnvironmentCombatObjectRuntime, type EnvironmentCombatObjectRuntime } from "./combat-object-runtime";
import { cleanupOrphanedEnvironmentReferences } from "./environment-cleanup";
import type { TearGameplayEventPort } from "../runtime/gameplay-events";
import { publishEnvironmentEvent } from "./environment-events";

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

/** Collection owner plus the bounded fixed-step phase seam. */
export class EnvironmentRuntime extends EnvironmentState implements EnvironmentStepPort {
  readonly #hooks: EnvironmentStepHooks;
  #events: TearGameplayEventPort | undefined;
  #availableActorIds: (() => ReadonlySet<string>) | undefined;
  readonly #combatKernels = new Map<string, EnvironmentCombatObjectRuntime>();
  #phaseLog: EnvironmentStepPhase[] = [];

  constructor(stageId = "unknown", worldId: string, configuration?: Partial<EnvironmentRuntimeConfiguration>, hooks: EnvironmentStepHooks = {}, options: Readonly<{ events?: TearGameplayEventPort; availableActorIds?: () => ReadonlySet<string> }> = {}) {
    super(stageId, worldId, configuration); this.#hooks = hooks; this.#events = options.events; this.#availableActorIds = options.availableActorIds;
  }

  get phaseLog(): readonly EnvironmentStepPhase[] { return this.#phaseLog; }
  clearPhaseLog(): void { this.#phaseLog = []; }
  override replace(snapshot: EnvironmentSnapshot): void { super.replace(snapshot); this.#combatKernels.clear(); }
  override clear(reason: EnvironmentClearReason): void { super.clear(reason); this.#combatKernels.clear(); }
  override removeCombatObject(id: string): void { super.removeCombatObject(id); this.#combatKernels.delete(id); }

  #run(phase: EnvironmentStepPhase, tick: number, seconds: number, callback: ((context: EnvironmentStepContext) => void) | undefined): void {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("environment tick must be a non-negative safe integer");
    if (!(seconds > 0) || !Number.isFinite(seconds)) throw new RangeError("environment step duration must be finite and positive");
    this.#phaseLog.push(phase);
    callback?.({ tick, seconds, phase, environment: this });
  }

  /** Executes the four environment-owned phases exactly once in canonical order. */
  setEventPort(events: TearGameplayEventPort | undefined): void { this.#events = events; }
  setAvailableActorIdsSource(source: (() => ReadonlySet<string>) | undefined): void { this.#availableActorIds = source; }

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
        for (const entry of entries) if (entry.state === "expired" && prior.get(entry.id)?.state !== "expired") {
          publishEnvironmentEvent(this.#events, { event: "object-cleaned", objectId: entry.id, category, objectKind: entry.kind, reason: "stage-transition" }, tick);
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
    this.#run("active-fields", tick, seconds, () => { this.#advanceFields(tick, seconds); this.#hooks.activeFields?.({ tick, seconds, phase: "active-fields", environment: this }); });
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
}> = {}): EnvironmentRuntime {
  if (options.worldId === undefined) throw new TypeError("environment world identity is required");
  return new EnvironmentRuntime(options.stageId ?? "unknown", options.worldId, options.configuration, options.hooks, options);
}

export { createEnvironmentState };
