export type RunPhase =
  | "idle"
  | "preparing"
  | "training-active"
  | "wave-prepared"
  | "wave-active"
  | "wave-cleared"
  | "reward-pending"
  | "finale"
  | "terminated";

export type RunRewardKind = "draft" | "boss";
export type RunOutcome = "defeat" | "victory" | "quit";

export interface RunLifecycleSnapshot {
  readonly phase: RunPhase;
  readonly sessionId: string | null;
  readonly wave: number | null;
  readonly bossWave: boolean;
  readonly activationDeferred: boolean;
  readonly reward: RunRewardKind | null;
  readonly outcome: RunOutcome | null;
  readonly revision: number;
}

export type RunLifecycleEvent =
  | { readonly type: "start"; readonly sessionId: string }
  | { readonly type: "activate-training" }
  | { readonly type: "prepare-wave"; readonly wave: number; readonly bossWave: boolean; readonly activationDeferred: boolean }
  | { readonly type: "activate-wave" }
  | { readonly type: "clear-wave" }
  | { readonly type: "prepare-reward"; readonly reward: RunRewardKind }
  | { readonly type: "begin-finale" }
  | { readonly type: "terminate"; readonly outcome: RunOutcome };

export const RUN_PHASES = Object.freeze([
  "idle", "preparing", "training-active", "wave-prepared", "wave-active",
  "wave-cleared", "reward-pending", "finale", "terminated",
] as const satisfies readonly RunPhase[]);

export const RUN_EVENTS_BY_PHASE: Readonly<Record<RunPhase, readonly RunLifecycleEvent["type"][]>> = Object.freeze({
  idle: ["start"],
  preparing: ["start", "activate-training", "prepare-wave", "begin-finale", "terminate"],
  "training-active": ["start", "terminate"],
  "wave-prepared": ["start", "activate-wave", "begin-finale", "terminate"],
  "wave-active": ["start", "clear-wave", "begin-finale", "terminate"],
  "wave-cleared": ["start", "prepare-reward", "begin-finale", "terminate"],
  "reward-pending": ["start", "prepare-wave", "terminate"],
  finale: ["start", "terminate"],
  terminated: ["start"],
});

export class IllegalRunLifecycleTransitionError extends Error {
  constructor(readonly phase: RunPhase, readonly event: RunLifecycleEvent["type"]) {
    super(`Illegal run lifecycle event: ${event} while ${phase}`);
    this.name = "IllegalRunLifecycleTransitionError";
  }
}

export function initialRunLifecycleSnapshot(): RunLifecycleSnapshot {
  return Object.freeze({
    phase: "idle",
    sessionId: null,
    wave: null,
    bossWave: false,
    activationDeferred: false,
    reward: null,
    outcome: null,
    revision: 0,
  });
}

function assertPositiveWave(wave: number): void {
  if (!Number.isSafeInteger(wave) || wave < 1) throw new RangeError("wave must be a positive integer");
}

export function transitionRunLifecycle(
  current: RunLifecycleSnapshot,
  event: RunLifecycleEvent,
): RunLifecycleSnapshot {
  if (!RUN_EVENTS_BY_PHASE[current.phase].includes(event.type)) {
    throw new IllegalRunLifecycleTransitionError(current.phase, event.type);
  }
  if (event.type === "start") {
    if (event.sessionId.length === 0) throw new TypeError("sessionId must not be empty");
    return Object.freeze({
      phase: "preparing", sessionId: event.sessionId, wave: null, bossWave: false,
      activationDeferred: false, reward: null, outcome: null, revision: current.revision + 1,
    });
  }
  if (current.sessionId === null) throw new IllegalRunLifecycleTransitionError(current.phase, event.type);
  if (event.type === "activate-training") {
    return Object.freeze({ ...current, phase: "training-active", revision: current.revision + 1 });
  }
  if (event.type === "prepare-wave") {
    assertPositiveWave(event.wave);
    return Object.freeze({
      ...current,
      phase: "wave-prepared",
      wave: event.wave,
      bossWave: event.bossWave,
      activationDeferred: event.activationDeferred,
      reward: null,
      outcome: null,
      revision: current.revision + 1,
    });
  }
  if (event.type === "activate-wave") {
    return Object.freeze({ ...current, phase: "wave-active", activationDeferred: false, revision: current.revision + 1 });
  }
  if (event.type === "clear-wave") {
    return Object.freeze({ ...current, phase: "wave-cleared", revision: current.revision + 1 });
  }
  if (event.type === "prepare-reward") {
    return Object.freeze({ ...current, phase: "reward-pending", reward: event.reward, revision: current.revision + 1 });
  }
  if (event.type === "begin-finale") {
    return Object.freeze({ ...current, phase: "finale", activationDeferred: false, reward: null, revision: current.revision + 1 });
  }
  return Object.freeze({
    ...current,
    phase: "terminated",
    activationDeferred: false,
    reward: null,
    outcome: event.outcome,
    revision: current.revision + 1,
  });
}

export class RunLifecycleController {
  #snapshot = initialRunLifecycleSnapshot();

  snapshot(): RunLifecycleSnapshot { return this.#snapshot; }
  get phase(): RunPhase { return this.#snapshot.phase; }
  get isWaveActive(): boolean { return this.#snapshot.phase === "wave-active"; }
  get hasPreparedWave(): boolean { return this.#snapshot.phase === "wave-prepared"; }
  get activationDeferred(): boolean { return this.#snapshot.activationDeferred; }
  get reward(): RunRewardKind | null { return this.#snapshot.reward; }

  dispatch(event: RunLifecycleEvent): RunLifecycleSnapshot {
    this.#snapshot = transitionRunLifecycle(this.#snapshot, event);
    return this.#snapshot;
  }

  start(sessionId: string): RunLifecycleSnapshot { return this.dispatch({ type: "start", sessionId }); }
  activateTraining(): RunLifecycleSnapshot { return this.dispatch({ type: "activate-training" }); }
  prepareWave(wave: number, bossWave: boolean, activationDeferred: boolean): RunLifecycleSnapshot {
    return this.dispatch({ type: "prepare-wave", wave, bossWave, activationDeferred });
  }
  activateWave(): RunLifecycleSnapshot { return this.dispatch({ type: "activate-wave" }); }
  clearWave(): RunLifecycleSnapshot { return this.dispatch({ type: "clear-wave" }); }
  prepareReward(reward: RunRewardKind): RunLifecycleSnapshot { return this.dispatch({ type: "prepare-reward", reward }); }
  beginFinale(): RunLifecycleSnapshot { return this.dispatch({ type: "begin-finale" }); }
  terminate(outcome: RunOutcome): RunLifecycleSnapshot { return this.dispatch({ type: "terminate", outcome }); }
}
