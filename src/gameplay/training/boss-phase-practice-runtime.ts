import { BOSS_ROSTER } from "../run/content-director";

export type PracticeBossId = (typeof BOSS_ROSTER)[number]["id"];
export type PracticeBossPhase = 1 | 2 | 3;
export interface BossPhasePracticeRequest {
  readonly bossId: PracticeBossId;
  readonly phase: PracticeBossPhase;
  readonly seed: string;
}
/** Actor-owned facts; phase is the committed transition marker, not just an HP getter. */
export interface BossPracticeActorEntry {
  readonly phase: PracticeBossPhase;
  /** The owner's HP/mode-implied phase: proves a pending request really exists in actor bytes. */
  readonly targetPhase: PracticeBossPhase;
  readonly ready: boolean;
  readonly stage: "opening" | "transition" | "combat" | "kneel" | "regrowth" | "void-descent" | "graft-baseline";
}
export interface BossPhasePracticeActor {
  practicePhaseEntry(): BossPracticeActorEntry;
  /** Selects owned entry health; the ordinary next world tick performs the real transition. */
  requestPracticePhase(phase: 2 | 3): boolean;
}
export type BossPracticeSetupStage = "opening" | "phase-2" | "phase-2-baseline" | "phase-3" | "target";
export interface BossPhasePracticeState extends BossPhasePracticeRequest {
  readonly version: 1;
  readonly generation: number;
  readonly encounterId: string;
  readonly lifecycle: "preparing" | "entering" | "active" | "cancelled";
  readonly setupStage: BossPracticeSetupStage;
  readonly enteredPhase: PracticeBossPhase;
  readonly entryStage: BossPracticeActorEntry["stage"];
  readonly pendingPhase: 2 | 3 | null;
}
/** Read from the canonical candidate world, including its cinematic and environment owners. */
export interface BossPhasePracticeWorld {
  readonly encounterId: string;
  readonly generation: number;
  readonly seed: string;
  readonly bossId: PracticeBossId;
  readonly weaponId: string;
  readonly difficulty: string;
  readonly noProgression: boolean;
  readonly actor: BossPhasePracticeActor;
  readonly cinematicActive: boolean;
  readonly arenaReady: boolean;
  /** Echo split installed; Source stream active/frozen as appropriate; other owners settled. */
  readonly phaseWorldReady: boolean;
  /** All pending cinema/environment state is supported by the canonical checkpoint owner. */
  readonly checkpointReady: boolean;
}
export interface BossPhasePracticeServices {
  /** Fresh Sword/Normal world, canonical placement/encounter, seeded RNG and owner cleanup. */
  createEncounter(request: BossPhasePracticeRequest, generation: number, encounterId: string): void;
  observe(): BossPhasePracticeWorld | null;
  cleanup(reason: "exit" | "reset" | "replacement"): void;
}
export type BossPhasePracticeResult =
  | Readonly<{
      status: "preparing" | "entering" | "active" | "cancelled";
      state: BossPhasePracticeState;
      capture: "canonical-checkpoint" | "unavailable";
    }>
  | Readonly<{ status: "refused"; reason: "invalid-request" | "world-mismatch" | "entry-refused" | "inactive" }>;

export function practicePhaseEntryHealth(marks: readonly number[], phase: 2 | 3): number {
  const first = marks[0],
    second = marks[1];
  if (first === undefined || second === undefined || !(first > second && second > 0 && first < 1))
    throw new RangeError("Invalid boss phase marks");
  return phase === 2 ? (first + second) / 2 : second / 2;
}
/** True for a boss the game's phase practice offers: the published roster. */
export function isPracticeBossId(value: unknown): value is PracticeBossId {
  return BOSS_ROSTER.some(({ id }) => id === value);
}
export function isPracticeBossPhase(value: unknown): value is PracticeBossPhase {
  return value === 1 || value === 2 || value === 3;
}
function validRequest(value: BossPhasePracticeRequest): boolean {
  return (
    isPracticeBossId(value.bossId) &&
    isPracticeBossPhase(value.phase) &&
    typeof value.seed === "string" &&
    value.seed.length > 0 &&
    value.seed.length <= 128
  );
}
function identity(request: BossPhasePracticeRequest, generation: number): string {
  return `boss-practice:${String(generation)}:${request.bossId}:${String(request.phase)}:${request.seed}`;
}
function matches(state: BossPhasePracticeState, world: BossPhasePracticeWorld): boolean {
  return (
    world.encounterId === state.encounterId &&
    world.generation === state.generation &&
    world.seed === state.seed &&
    world.bossId === state.bossId &&
    world.weaponId === "sword" &&
    world.difficulty === "normal" &&
    world.noProgression
  );
}
/** Validate BEFORE adopting a restored world. This never spawns, ticks or requests entry. */
export function validateBossPhasePracticeState(value: unknown, world?: BossPhasePracticeWorld): BossPhasePracticeState {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error("Invalid boss practice state");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = [
    "version",
    "bossId",
    "phase",
    "seed",
    "generation",
    "encounterId",
    "lifecycle",
    "setupStage",
    "enteredPhase",
    "entryStage",
    "pendingPhase",
  ];
  if (
    Reflect.ownKeys(value).length !== keys.length ||
    keys.some((key) => !descriptors[key] || !("value" in descriptors[key]))
  )
    throw new Error("Invalid boss practice fields");
  const record = value as Readonly<Record<string, unknown>>;
  const state = value as BossPhasePracticeState;
  if (
    record.version !== 1 ||
    !validRequest(state) ||
    !Number.isSafeInteger(state.generation) ||
    state.generation < 1 ||
    state.encounterId !== identity(state, state.generation) ||
    !["preparing", "entering", "active", "cancelled"].includes(state.lifecycle) ||
    !["opening", "phase-2", "phase-2-baseline", "phase-3", "target"].includes(state.setupStage) ||
    !isPracticeBossPhase(state.enteredPhase) ||
    (state.lifecycle !== "active" && state.lifecycle !== "cancelled" && state.enteredPhase > state.phase) ||
    !["opening", "transition", "combat", "kneel", "regrowth", "void-descent", "graft-baseline"].includes(
      state.entryStage,
    ) ||
    !(record.pendingPhase === null || record.pendingPhase === 2 || record.pendingPhase === 3) ||
    (state.pendingPhase !== null &&
      (state.pendingPhase !== state.enteredPhase + 1 || state.pendingPhase > state.phase)) ||
    (state.lifecycle === "active" &&
      (state.setupStage !== "target" || state.pendingPhase !== null || state.enteredPhase < state.phase)) ||
    (state.pendingPhase !== null && state.setupStage !== `phase-${String(state.pendingPhase)}`) ||
    (state.setupStage === "opening" && (state.enteredPhase !== 1 || state.pendingPhase !== null)) ||
    (state.setupStage === "phase-2-baseline" &&
      (state.enteredPhase !== 2 || state.phase !== 3 || state.pendingPhase !== null)) ||
    (state.lifecycle === "entering" && (state.pendingPhase ?? state.enteredPhase) !== state.phase) ||
    (state.setupStage === "target" && state.enteredPhase < state.phase)
  )
    throw new Error("Invalid boss practice lifecycle");
  if (world !== undefined) {
    const entry = world.actor.practicePhaseEntry();
    if (
      state.lifecycle === "cancelled" ||
      !matches(state, world) ||
      !world.arenaReady ||
      !world.checkpointReady ||
      (entry.phase !== state.enteredPhase && entry.phase !== state.pendingPhase) ||
      (state.pendingPhase !== null && entry.targetPhase !== state.pendingPhase) ||
      (state.pendingPhase === null && entry.stage !== state.entryStage)
    )
      throw new Error("Boss practice world mismatch");
  }
  return Object.freeze({ ...state });
}

export function createBossPhasePracticeRuntime(services: BossPhasePracticeServices) {
  let current: BossPhasePracticeState | null = null;
  let generation = 0;
  function result(): BossPhasePracticeResult {
    if (current === null) return { status: "refused", reason: "inactive" };
    const world = services.observe();
    let capture: "canonical-checkpoint" | "unavailable" = "unavailable";
    if (current.lifecycle !== "cancelled" && world !== null) {
      try {
        validateBossPhasePracticeState(current, world);
        capture = "canonical-checkpoint";
      } catch {
        /* A half-installed world cannot be captured. */
      }
    }
    return { status: current.lifecycle, state: current, capture };
  }
  function begin(request: BossPhasePracticeRequest): BossPhasePracticeResult {
    if (!validRequest(request) || generation === Number.MAX_SAFE_INTEGER)
      return { status: "refused", reason: "invalid-request" };
    if (current !== null && current.lifecycle !== "cancelled") services.cleanup("replacement");
    generation += 1;
    const encounterId = identity(request, generation);
    current = Object.freeze({
      version: 1,
      bossId: request.bossId,
      phase: request.phase,
      seed: request.seed,
      generation,
      encounterId,
      lifecycle: "preparing",
      setupStage: "opening",
      enteredPhase: 1,
      entryStage: "opening",
      pendingPhase: null,
    });
    services.createEncounter(request, generation, encounterId);
    return result();
  }
  function afterWorldStep(): BossPhasePracticeResult {
    if (current === null || current.lifecycle === "cancelled") return result();
    const world = services.observe();
    if (world === null || !matches(current, world) || !world.arenaReady)
      return { status: "refused", reason: "world-mismatch" };
    const entry = world.actor.practicePhaseEntry();
    if (current.lifecycle === "active") {
      if (entry.phase < current.enteredPhase) return { status: "refused", reason: "world-mismatch" };
      current = Object.freeze({ ...current, enteredPhase: entry.phase, entryStage: entry.stage });
      return result();
    }
    if (entry.phase < current.enteredPhase || entry.phase > (current.pendingPhase ?? current.enteredPhase))
      return { status: "refused", reason: "world-mismatch" };
    if (current.pendingPhase === entry.phase)
      current = Object.freeze({ ...current, enteredPhase: entry.phase, pendingPhase: null });
    current = Object.freeze({ ...current, entryStage: entry.stage });
    if (current.pendingPhase !== null) {
      return entry.targetPhase === current.pendingPhase ? result() : { status: "refused", reason: "world-mismatch" };
    }
    if (entry.phase === current.phase) {
      current = Object.freeze({
        ...current,
        lifecycle: entry.ready && !world.cinematicActive && world.phaseWorldReady ? "active" : "entering",
        setupStage: "target",
      });
      return result();
    }
    if (!entry.ready || world.cinematicActive || !world.phaseWorldReady) {
      current = Object.freeze({ ...current, setupStage: entry.phase === 1 ? "opening" : "phase-2-baseline" });
      return result();
    }
    const next = entry.phase === 1 ? 2 : 3;
    if (!world.actor.requestPracticePhase(next)) return { status: "refused", reason: "entry-refused" };
    current = Object.freeze({
      ...current,
      lifecycle: next === current.phase ? "entering" : "preparing",
      pendingPhase: next,
      setupStage: next === 2 ? "phase-2" : "phase-3",
    });
    return result();
  }
  return Object.freeze({
    begin,
    afterWorldStep,
    restart(): BossPhasePracticeResult {
      return current === null ? { status: "refused", reason: "inactive" } : begin(current);
    },
    cancel(reason: "exit" | "reset" | "replacement"): void {
      if (current === null || current.lifecycle === "cancelled") return;
      services.cleanup(reason);
      current = Object.freeze({ ...current, lifecycle: "cancelled" });
    },
    snapshot(): BossPhasePracticeState | null {
      return current;
    },
    captureAvailability(): "canonical-checkpoint" | "unavailable" {
      const value = result();
      return value.status === "refused" ? "unavailable" : value.capture;
    },
    discardSelection(): void {
      current = null;
      generation = 0;
    },
    /** The outer v6 owner has already validated genuine terminal actor absence. No world is recreated. */
    restoreFinished(value: unknown): void {
      const state = validateBossPhasePracticeState(value);
      if (state.lifecycle !== "active") throw new Error("Finished boss practice requires a completed entry");
      current = state;
      generation = state.generation;
    },
    restore(value: unknown, world: BossPhasePracticeWorld): void {
      const state = validateBossPhasePracticeState(value, world);
      current = state;
      generation = state.generation;
    },
  });
}
export type BossPhasePracticeRuntime = ReturnType<typeof createBossPhasePracticeRuntime>;
