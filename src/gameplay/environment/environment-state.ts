import type {
  EnvironmentClearReason,
  EnvironmentCombatObjectState,
  EnvironmentFieldState,
  EnvironmentRouteState,
  EnvironmentRuntimeConfiguration,
  EnvironmentRuntimeState,
  EnvironmentSimulationView,
  EnvironmentSnapshot,
} from "./environment-contracts";

const DEFAULT_CONFIGURATION: EnvironmentRuntimeConfiguration = Object.freeze({
  maxFields: 64, maxCombatObjects: 128, maxRoutes: 64,
});

function copyField(value: EnvironmentFieldState): EnvironmentFieldState {
  return Object.freeze({ ...value, geometry: Object.freeze({ ...value.geometry,
    ...(value.geometry.points === undefined ? {} : { points: Object.freeze(value.geometry.points.map((point) => Object.freeze({ ...point })) ) }),
  }), eligibility: Object.freeze({ ...value.eligibility }),
    ...(value.schedule === null ? {} : { schedule: Object.freeze({ ...value.schedule }) }),
    ...(value.force === null ? {} : { force: Object.freeze({ ...value.force }) }),
  });
}

function copyCombatObject(value: EnvironmentCombatObjectState): EnvironmentCombatObjectState {
  return Object.freeze({ ...value, geometry: Object.freeze({ ...value.geometry,
    ...(value.geometry.points === undefined ? {} : { points: Object.freeze(value.geometry.points.map((point) => Object.freeze({ ...point })) ) }),
  }), counterplayTags: Object.freeze([...value.counterplayTags]) });
}

function copyRoute(value: EnvironmentRouteState): EnvironmentRouteState {
  return Object.freeze({ ...value, points: Object.freeze(value.points.map((point) => Object.freeze({ ...point }))) });
}

function assertUnique(ids: readonly string[], category: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0) throw new TypeError(`${category} IDs must be non-empty strings`);
    if (seen.has(id)) throw new TypeError(`duplicate environment ${category} ID: ${id}`);
    seen.add(id);
  }
}

/** One isolated, data-only environment collection and deterministic ID allocator. */
export class EnvironmentState implements EnvironmentRuntimeState {
  readonly worldId: string;
  readonly configuration: EnvironmentRuntimeConfiguration;
  #stageId: string;
  #fields: EnvironmentFieldState[] = [];
  #combatObjects: EnvironmentCombatObjectState[] = [];
  #routes: EnvironmentRouteState[] = [];
  #nextSequence = 1;
  #revision = 0;
  #lastClearReason: EnvironmentClearReason | null = null;

  constructor(stageId: string, worldId: string, configuration: Partial<EnvironmentRuntimeConfiguration> = {}) {
    if (stageId.length === 0 || worldId.length === 0) throw new TypeError("environment stage and world IDs are required");
    this.#stageId = stageId; this.worldId = worldId;
    const merged = { ...DEFAULT_CONFIGURATION, ...configuration };
    if (![merged.maxFields, merged.maxCombatObjects, merged.maxRoutes].every((value) => Number.isSafeInteger(value) && value >= 0)) {
      throw new RangeError("environment population limits must be non-negative safe integers");
    }
    this.configuration = Object.freeze(merged);
  }

  get stageId(): string { return this.#stageId; }
  get revision(): number { return this.#revision; }
  get lastClearReason(): EnvironmentClearReason | null { return this.#lastClearReason; }
  fields(): readonly EnvironmentFieldState[] { return this.#fields; }
  combatObjects(): readonly EnvironmentCombatObjectState[] { return this.#combatObjects; }
  routes(): readonly EnvironmentRouteState[] { return this.#routes; }

  snapshot(): EnvironmentSnapshot {
    return Object.freeze({ stageId: this.#stageId, fields: Object.freeze(this.#fields.map(copyField)),
      combatObjects: Object.freeze(this.#combatObjects.map(copyCombatObject)), routes: Object.freeze(this.#routes.map(copyRoute)) });
  }

  simulationView(): EnvironmentSimulationView {
    const snapshot = this.snapshot();
    return Object.freeze({ ...snapshot, worldId: this.worldId, revision: this.#revision, lastClearReason: this.#lastClearReason });
  }

  replace(snapshot: EnvironmentSnapshot): void {
    if (snapshot.stageId !== this.#stageId) throw new RangeError("environment snapshot stage does not match this world");
    if (snapshot.fields.length > this.configuration.maxFields || snapshot.combatObjects.length > this.configuration.maxCombatObjects || snapshot.routes.length > this.configuration.maxRoutes) {
      throw new RangeError("environment snapshot exceeds population bounds");
    }
    assertUnique(snapshot.fields.map((item) => item.id), "field");
    assertUnique(snapshot.combatObjects.map((item) => item.id), "combat-object");
    assertUnique(snapshot.routes.map((item) => item.id), "route");
    const all = [...snapshot.fields, ...snapshot.combatObjects, ...snapshot.routes].map((item) => item.id);
    assertUnique(all, "object");
    this.#fields.splice(0, this.#fields.length, ...snapshot.fields.map(copyField));
    this.#combatObjects.splice(0, this.#combatObjects.length, ...snapshot.combatObjects.map(copyCombatObject));
    this.#routes.splice(0, this.#routes.length, ...snapshot.routes.map(copyRoute));
    this.#revision += 1;
  }

  clear(reason: EnvironmentClearReason): void {
    this.#fields.length = 0; this.#combatObjects.length = 0; this.#routes.length = 0;
    this.#nextSequence = 1; this.#lastClearReason = reason; this.#revision += 1;
  }

  setStage(stageId: string, reason: EnvironmentClearReason = "stage-transition"): void {
    if (stageId.length === 0) throw new TypeError("environment stage ID is required");
    this.clear(reason); this.#stageId = stageId;
  }

  #id(category: "field" | "combat-object" | "route"): string {
    const id = `${this.worldId}:${category}:${String(this.#nextSequence)}`; this.#nextSequence += 1; return id;
  }
  #claim(id: string | undefined, category: "field" | "combat-object" | "route"): string {
    const chosen = id ?? this.#id(category);
    if (typeof chosen !== "string" || chosen.length === 0) throw new TypeError("environment object ID is required");
    if ([...this.#fields, ...this.#combatObjects, ...this.#routes].some((item) => item.id === chosen)) throw new TypeError(`duplicate environment object ID: ${chosen}`);
    return chosen;
  }

  addField(value: Omit<EnvironmentFieldState, "id"> & { readonly id?: string }): string {
    if (this.#fields.length >= this.configuration.maxFields) throw new RangeError("environment field population bound exceeded");
    const id = this.#claim(value.id, "field"); this.#fields.push(copyField({ ...value, id })); this.#revision += 1; return id;
  }
  addCombatObject(value: Omit<EnvironmentCombatObjectState, "id"> & { readonly id?: string }): string {
    if (this.#combatObjects.length >= this.configuration.maxCombatObjects) throw new RangeError("environment combat-object population bound exceeded");
    const id = this.#claim(value.id, "combat-object"); this.#combatObjects.push(copyCombatObject({ ...value, id })); this.#revision += 1; return id;
  }
  addRoute(value: Omit<EnvironmentRouteState, "id"> & { readonly id?: string }): string {
    if (this.#routes.length >= this.configuration.maxRoutes) throw new RangeError("environment route population bound exceeded");
    const id = this.#claim(value.id, "route"); this.#routes.push(copyRoute({ ...value, id })); this.#revision += 1; return id;
  }

  #update<T extends { readonly id: string }>(items: T[], id: string, patch: Partial<Omit<T, "id">>, copy: (value: T) => T): void {
    const index = items.findIndex((item) => item.id === id); if (index < 0) throw new RangeError(`unknown environment object: ${id}`);
    items[index] = copy({ ...items[index], ...patch, id } as T); this.#revision += 1;
  }
  updateField(id: string, patch: Partial<Omit<EnvironmentFieldState, "id">>): void { this.#update(this.#fields, id, patch, copyField); }
  updateCombatObject(id: string, patch: Partial<Omit<EnvironmentCombatObjectState, "id">>): void { this.#update(this.#combatObjects, id, patch, copyCombatObject); }
  updateRoute(id: string, patch: Partial<Omit<EnvironmentRouteState, "id">>): void { this.#update(this.#routes, id, patch, copyRoute); }
  removeField(id: string): void { this.#remove(this.#fields, id); }
  removeCombatObject(id: string): void { this.#remove(this.#combatObjects, id); }
  removeRoute(id: string): void { this.#remove(this.#routes, id); }
  #remove(items: { readonly id: string }[], id: string): void {
    const index = items.findIndex((item) => item.id === id); if (index < 0) return; items.splice(index, 1); this.#revision += 1;
  }

  /** Internal reset hook used when a world is disposed without exposing arrays. */
  dispose(): void { this.clear("disposal"); }
}

export function createEnvironmentState(stageId: string, worldId: string, configuration?: Partial<EnvironmentRuntimeConfiguration>): EnvironmentState {
  return new EnvironmentState(stageId, worldId, configuration);
}
