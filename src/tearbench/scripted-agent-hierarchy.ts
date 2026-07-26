import {
  AIM_TURN_SCALE,
  INPUT_AXIS_SCALE,
  type GameAction,
} from "../input/game-action";
import type {
  TearAgentDecision,
  TearAgentObservation,
  TearAgentProfileId,
  TearBladeManeuver,
} from "../agents/contracts";
import type { TearObservedActorV1, TearObservationClass } from "./contracts";

export type TearAgentWatchdogKind =
  | "transition-stall"
  | "no-progress"
  | "softlock"
  | "repeated-input"
  | "loading-stall"
  | "paused"
  | "focus-lost"
  | "device-disconnected"
  | "terminal";

export type TearHierarchicalObjective =
  | "navigate-menu"
  | "start-run"
  | "clear-wave"
  | "defeat-boss"
  | "select-build"
  | "survive"
  | "recover-blade"
  | "recover-runtime"
  | "return-to-menu"
  | "stop";

export interface TearAgentOperationalSignals {
  readonly loading?: boolean;
  readonly focused?: boolean;
  readonly deviceConnected?: boolean;
  readonly terminal?: boolean;
  readonly progressToken?: string;
}

export interface TearHierarchicalObservation extends TearAgentObservation {
  readonly signals?: TearAgentOperationalSignals;
}

export interface TearAgentWatchdogContract {
  readonly transitionTicks: number;
  readonly noProgressTicks: number;
  readonly repeatedInputLimit: number;
  readonly loadingTicks: number;
}

export const DEFAULT_AGENT_WATCHDOG_CONTRACT = Object.freeze({
  transitionTicks: 3_600,
  noProgressTicks: 1_800,
  repeatedInputLimit: 240,
  loadingTicks: 1_200,
} satisfies TearAgentWatchdogContract);

export interface TearAgentWatchdogIncident {
  readonly kind: TearAgentWatchdogKind;
  readonly tick: number;
  readonly severity: "notice" | "recoverable" | "fatal";
  readonly detail: string;
}

export interface TearAgentMemorySnapshot {
  readonly decisions: number;
  readonly lastTick: number;
  readonly lastProgressTick: number;
  readonly screenEnteredTick: number;
  readonly loadingEnteredTick?: number;
  readonly targetId?: string;
  readonly repeatedActions: number;
  readonly recoveryAttempts: number;
}

export interface TearStructuredAgentIntent {
  readonly tick: number;
  readonly profile: TearAgentProfileId;
  readonly objective: TearHierarchicalObjective;
  readonly targetId?: string;
  readonly maneuver: TearBladeManeuver;
  readonly confidence: number;
  readonly recovery: boolean;
  readonly critic: readonly string[];
  readonly invariantViolations: readonly string[];
  readonly watchdog: readonly TearAgentWatchdogIncident[];
  readonly observationClass: TearObservationClass;
  readonly memory: TearAgentMemorySnapshot;
}

export interface TearHierarchicalDecision {
  readonly actions: readonly GameAction[];
  readonly intent: TearStructuredAgentIntent;
}

function actionSignature(actions: readonly GameAction[]): string {
  return JSON.stringify(actions);
}

function progressToken(observation: TearHierarchicalObservation): string {
  return observation.signals?.progressToken ?? [
    observation.ui?.screen ?? "playing",
    observation.state.run.wave,
    observation.state.run.score,
    observation.state.player.hp,
    observation.state.entities.filter((entity) => (entity.hpRatio ?? 1) > 0).length,
  ].join(":");
}

export class TearLongHorizonMemory {
  #decisions = 0;
  #lastTick = 0;
  #lastProgressTick = 0;
  #screen = "";
  #screenEnteredTick = 0;
  #loadingEnteredTick: number | undefined;
  #progressToken = "";
  #targetId: string | undefined;
  #actionSignature = "";
  #repeatedActions = 0;
  #recoveryAttempts = 0;

  observe(observation: TearHierarchicalObservation): void {
    const tick = observation.state.tick;
    if (tick < this.#lastTick) this.reset(tick);
    this.#decisions += 1;
    this.#lastTick = tick;
    const screen = observation.ui?.screen ?? "playing";
    if (screen !== this.#screen) {
      this.#screen = screen;
      this.#screenEnteredTick = tick;
    }
    const token = progressToken(observation);
    if (token !== this.#progressToken) {
      this.#progressToken = token;
      this.#lastProgressTick = tick;
    }
    if (observation.signals?.loading === true) {
      this.#loadingEnteredTick ??= tick;
    } else {
      this.#loadingEnteredTick = undefined;
    }
  }

  rememberDecision(actions: readonly GameAction[], targetId: string | undefined, recovery: boolean): void {
    const signature = actionSignature(actions);
    this.#repeatedActions = signature === this.#actionSignature ? this.#repeatedActions + 1 : 1;
    this.#actionSignature = signature;
    this.#targetId = targetId;
    if (recovery) this.#recoveryAttempts += 1;
  }

  reset(tick = 0): void {
    this.#decisions = 0;
    this.#lastTick = tick;
    this.#lastProgressTick = tick;
    this.#screen = "";
    this.#screenEnteredTick = tick;
    this.#loadingEnteredTick = undefined;
    this.#progressToken = "";
    this.#targetId = undefined;
    this.#actionSignature = "";
    this.#repeatedActions = 0;
    this.#recoveryAttempts = 0;
  }

  snapshot(): TearAgentMemorySnapshot {
    return Object.freeze({
      decisions: this.#decisions,
      lastTick: this.#lastTick,
      lastProgressTick: this.#lastProgressTick,
      screenEnteredTick: this.#screenEnteredTick,
      ...(this.#loadingEnteredTick === undefined ? {} : { loadingEnteredTick: this.#loadingEnteredTick }),
      ...(this.#targetId === undefined ? {} : { targetId: this.#targetId }),
      repeatedActions: this.#repeatedActions,
      recoveryAttempts: this.#recoveryAttempts,
    });
  }
}

export class TearInvariantSentinel {
  inspect(observation: TearHierarchicalObservation): readonly string[] {
    const { player, blade, run } = observation.state;
    const violations: string[] = [];
    const finite = [player.x, player.y, player.vx, player.vy, player.hp, player.maxHp,
      blade.tipX, blade.tipY, blade.vx, blade.vy, blade.tipSpeed, run.wave];
    if (!finite.every(Number.isFinite)) violations.push("non-finite-authoritative-state");
    if (player.maxHp <= 0 || player.hp < 0 || player.hp > player.maxHp) violations.push("invalid-player-health");
    if (!Number.isSafeInteger(observation.state.tick) || observation.state.tick < 0) violations.push("invalid-tick");
    if (run.wave < 0 || !Number.isSafeInteger(run.wave)) violations.push("invalid-wave");
    return Object.freeze(violations);
  }
}

export class TearAgentWatchdog {
  readonly #contract: TearAgentWatchdogContract;

  constructor(contract: TearAgentWatchdogContract = DEFAULT_AGENT_WATCHDOG_CONTRACT) {
    for (const value of Object.values(contract)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new RangeError("watchdog limits must be positive integers");
    }
    this.#contract = Object.freeze({ ...contract });
  }

  inspect(
    observation: TearHierarchicalObservation,
    memory: TearAgentMemorySnapshot,
  ): readonly TearAgentWatchdogIncident[] {
    const tick = observation.state.tick;
    const incidents: TearAgentWatchdogIncident[] = [];
    const add = (kind: TearAgentWatchdogKind, severity: TearAgentWatchdogIncident["severity"], detail: string): void => {
      incidents.push(Object.freeze({ kind, tick, severity, detail }));
    };
    if (observation.signals?.terminal === true) add("terminal", "notice", "runtime reported a terminal state");
    if (observation.signals?.focused === false) add("focus-lost", "recoverable", "input focus is unavailable");
    if (observation.signals?.deviceConnected === false) {
      add("device-disconnected", "recoverable", "selected physical adapter is disconnected");
    }
    if (observation.state.diagnostics?.paused === true) add("paused", "recoverable", "simulation is paused");
    if (memory.loadingEnteredTick !== undefined
      && tick - memory.loadingEnteredTick > this.#contract.loadingTicks) {
      add("loading-stall", "recoverable", "loading exceeded its tick budget");
    }
    if (tick - memory.screenEnteredTick > this.#contract.transitionTicks
      && observation.ui?.screen !== "playing") {
      add("transition-stall", "recoverable", "UI transition exceeded its tick budget");
    }
    const softlockLimit = observation.state.diagnostics?.softlockLimitTicks ?? this.#contract.noProgressTicks;
    if (tick - memory.lastProgressTick > this.#contract.noProgressTicks) {
      add("no-progress", "recoverable", "no visible progress was observed");
    }
    if (tick - memory.lastProgressTick > softlockLimit) {
      add("softlock", "fatal", "runtime exceeded its declared softlock budget");
    }
    if (memory.repeatedActions >= this.#contract.repeatedInputLimit) {
      add("repeated-input", "recoverable", "identical semantic action batch repeated too often");
    }
    return Object.freeze(incidents);
  }
}

export class TearJourneyDirector {
  decide(observation: TearHierarchicalObservation): TearHierarchicalObjective {
    const screen = observation.ui?.screen ?? "playing";
    if (observation.signals?.terminal === true) return "return-to-menu";
    if (screen === "draft" || screen === "tierup" || screen === "reserve") return "select-build";
    if (screen === "menu") return "start-run";
    if (screen !== "playing") return "navigate-menu";
    return observation.boss === undefined ? "clear-wave" : "defeat-boss";
  }
}

export class TearRunStrategist {
  decide(observation: TearHierarchicalObservation, objective: TearHierarchicalObjective): TearHierarchicalObjective {
    if (objective !== "clear-wave" && objective !== "defeat-boss") return objective;
    if (observation.state.blade.state === "stolen") return "recover-blade";
    const ratio = observation.state.player.hp / Math.max(1, observation.state.player.maxHp);
    return ratio < 0.25 ? "survive" : objective;
  }
}

export interface TearTacticalDecision {
  readonly target?: TearObservedActorV1;
  readonly confidence: number;
}

export class TearTacticalCombat {
  decide(observation: TearHierarchicalObservation, rememberedTarget?: string): TearTacticalDecision {
    const { player } = observation.state;
    const candidates = observation.state.entities
      .filter((entity) => !["platform", "hazard"].includes(entity.kind) && (entity.hpRatio ?? 1) > 0)
      .map((entity) => {
        const distance = Math.hypot(entity.x - player.x, entity.y - player.y);
        const projectile = entity.kind === "projectile" ? 20_000 : 0;
        const persistence = entity.id === rememberedTarget ? 500 : 0;
        return { entity, score: (entity.threat ?? 1) * 10_000 + projectile + persistence - distance };
      })
      .sort((left, right) => right.score - left.score || left.entity.id.localeCompare(right.entity.id));
    const selected = candidates[0];
    return selected === undefined
      ? Object.freeze({ confidence: 0.35 })
      : Object.freeze({ target: selected.entity, confidence: Math.min(0.99, 0.55 + selected.score / 100_000) });
  }
}

function aimTurn(dx: number, dy: number): number {
  const radians = Math.atan2(dy, dx);
  const positive = radians < 0 ? radians + Math.PI * 2 : radians;
  return Math.min(AIM_TURN_SCALE - 1, Math.floor(positive / (Math.PI * 2) * AIM_TURN_SCALE));
}

export class TearBladeMotor {
  decide(observation: TearHierarchicalObservation, target?: TearObservedActorV1): Readonly<{
    maneuver: TearBladeManeuver;
    actions: readonly GameAction[];
  }> {
    const { blade, player, tick } = observation.state;
    if (blade.state === "stolen") {
      return Object.freeze({ maneuver: "recover", actions: Object.freeze([{ type: "interact" } as const]) });
    }
    if (blade.state === "thrown" || blade.state === "embedded") {
      return Object.freeze({ maneuver: "recall", actions: Object.freeze([
        { type: "weapon", intent: "recall", phase: "pressed" } as const,
      ]) });
    }
    const projectile = observation.state.entities.find((entity) =>
      entity.kind === "projectile" && Math.hypot(entity.x - player.x, entity.y - player.y) <= 180);
    const selected = projectile ?? target;
    if (selected === undefined) return Object.freeze({ maneuver: "track", actions: Object.freeze([]) });
    const dx = selected.x - player.x;
    const dy = selected.y - player.y;
    const aim = { type: "aim", turn: aimTurn(dx, dy) } as const;
    if (projectile !== undefined) {
      return Object.freeze({ maneuver: "parry", actions: Object.freeze([
        aim, { type: "weapon", intent: "primary", phase: "pressed" } as const,
      ]) });
    }
    if (Math.hypot(dx, dy) > 340) {
      return Object.freeze({ maneuver: "throw", actions: Object.freeze([
        aim, { type: "weapon", intent: "throw", phase: "pressed" } as const,
      ]) });
    }
    const secondary = tick % 180 === 0;
    return Object.freeze({
      maneuver: secondary ? "secondary" : "slash",
      actions: Object.freeze([
        aim,
        { type: "weapon", intent: secondary ? "secondary" : "primary", phase: "pressed" } as const,
      ]),
    });
  }
}

export class TearMovementPlanner {
  decide(
    observation: TearHierarchicalObservation,
    target: TearObservedActorV1 | undefined,
    objective: TearHierarchicalObjective,
  ): readonly GameAction[] {
    const player = observation.state.player;
    if (target === undefined) return Object.freeze([{ type: "move", x: 0, y: 0 }]);
    const away = target.x >= player.x ? -INPUT_AXIS_SCALE : INPUT_AXIS_SCALE;
    const toward = -away;
    const retreat = objective === "survive";
    const x = retreat ? away : Math.abs(target.x - player.x) < 90 ? 0 : toward;
    const actions: GameAction[] = [{ type: "move", x, y: 0 }];
    if (!retreat && target.y < player.y - 80 && player.grounded) actions.push({ type: "jump", phase: "pressed" });
    if ((retreat || Math.abs(target.x - player.x) > 300) && player.dashCharges > 0) {
      actions.push({ type: "dash", x, y: 0 });
    }
    return Object.freeze(actions);
  }
}

export class TearDraftPlanner {
  decide(observation: TearHierarchicalObservation): readonly GameAction[] {
    const screen = observation.ui?.screen;
    const choice = [...(observation.ui?.choices ?? [])].sort((left, right) =>
      (right.score ?? 0) - (left.score ?? 0)
      || Number(right.unique === true) - Number(left.unique === true)
      || left.id.localeCompare(right.id))[0];
    if (choice === undefined) return Object.freeze([]);
    if (screen === "tierup") return Object.freeze([{ type: "tier-up-choice", choiceId: choice.id }]);
    if (screen === "reserve") return Object.freeze([{ type: "reserve-choice", choiceId: choice.id }]);
    return Object.freeze([{ type: "draft-choice", choiceId: choice.id }]);
  }
}

export class TearRecoveryPlanner {
  decide(incidents: readonly TearAgentWatchdogIncident[], violations: readonly string[]): readonly GameAction[] {
    if (violations.length > 0 || incidents.some((incident) => incident.severity === "fatal")) {
      return Object.freeze([{ type: "pause" }]);
    }
    const kinds = new Set(incidents.map((incident) => incident.kind));
    if (kinds.has("terminal")) return Object.freeze([{ type: "confirm" }]);
    if (kinds.has("paused")) return Object.freeze([{ type: "pause" }]);
    if (kinds.has("transition-stall") || kinds.has("loading-stall")) {
      return Object.freeze([{ type: "cancel" }, { type: "confirm" }]);
    }
    if (kinds.has("focus-lost") || kinds.has("device-disconnected")) return Object.freeze([{ type: "pause" }]);
    if (kinds.has("no-progress") || kinds.has("repeated-input")) {
      return Object.freeze([{ type: "move", x: 0, y: 0 }, { type: "jump", phase: "pressed" }]);
    }
    return Object.freeze([]);
  }
}

export class TearPolicyCritic {
  review(
    observation: TearHierarchicalObservation,
    objective: TearHierarchicalObjective,
    actions: readonly GameAction[],
    incidents: readonly TearAgentWatchdogIncident[],
  ): readonly string[] {
    const notes: string[] = [];
    if (actions.length === 0) notes.push("no-action-selected");
    if (observation.state.availableActions.length === 0) notes.push("no-actions-advertised");
    if (objective === "clear-wave" && observation.state.entities.length === 0) notes.push("awaiting-wave-transition");
    notes.push(...incidents.map((incident) => `watchdog:${incident.kind}`));
    return Object.freeze(notes);
  }
}

export class TearHierarchicalAgentOrchestrator {
  readonly #profile: TearAgentProfileId;
  readonly #memory = new TearLongHorizonMemory();
  readonly #sentinel = new TearInvariantSentinel();
  readonly #watchdog: TearAgentWatchdog;
  readonly #journey = new TearJourneyDirector();
  readonly #strategy = new TearRunStrategist();
  readonly #tactical = new TearTacticalCombat();
  readonly #blade = new TearBladeMotor();
  readonly #movement = new TearMovementPlanner();
  readonly #draft = new TearDraftPlanner();
  readonly #recovery = new TearRecoveryPlanner();
  readonly #critic = new TearPolicyCritic();

  constructor(
    profile: TearAgentProfileId = "competent",
    watchdog: TearAgentWatchdogContract = DEFAULT_AGENT_WATCHDOG_CONTRACT,
  ) {
    this.#profile = profile;
    this.#watchdog = new TearAgentWatchdog(watchdog);
  }

  get memory(): TearAgentMemorySnapshot { return this.#memory.snapshot(); }

  decide(
    observation: TearHierarchicalObservation,
    operational?: TearAgentDecision,
  ): TearHierarchicalDecision {
    this.#memory.observe(observation);
    const before = this.#memory.snapshot();
    const violations = this.#sentinel.inspect(observation);
    const incidents = this.#watchdog.inspect(observation, before);
    const journeyObjective = this.#journey.decide(observation);
    const fatalRecovery = violations.length > 0
      || incidents.some((incident) => incident.severity === "fatal");
    const objective = fatalRecovery
      ? "recover-runtime"
      : this.#strategy.decide(observation, journeyObjective);
    const tactical = this.#tactical.decide(observation, before.targetId);
    const blade = this.#blade.decide(observation, tactical.target);
    const movementActions = this.#movement.decide(observation, tactical.target, objective);
    const draftActions = this.#draft.decide(observation);
    const recoveryActions = this.#recovery.decide(incidents, violations);
    let plannedActions: readonly GameAction[];
    if (objective === "recover-runtime") {
      plannedActions = recoveryActions;
    } else if (objective === "select-build") {
      plannedActions = draftActions;
    } else if (objective === "navigate-menu" || objective === "start-run" || objective === "return-to-menu") {
      plannedActions = Object.freeze([{ type: "confirm" }]);
    } else if (objective === "recover-blade") {
      plannedActions = blade.actions;
    } else {
      plannedActions = Object.freeze([...movementActions, ...blade.actions]);
    }
    const actions = Object.freeze([
      ...(fatalRecovery || operational === undefined ? plannedActions : operational.actions),
    ]);
    const operationalTrace = fatalRecovery ? undefined : operational?.trace;
    const targetId = operationalTrace === undefined ? tactical.target?.id : operationalTrace.targetId;
    const maneuver = fatalRecovery ? "recover" : operationalTrace?.maneuver ?? blade.maneuver;
    const confidence = fatalRecovery ? 0 : operationalTrace?.confidence ?? tactical.confidence;
    const recovery = fatalRecovery || (operationalTrace?.recovery
      ?? (objective === "recover-blade" || objective === "survive"));
    const critic = this.#critic.review(observation, objective, actions, incidents);
    this.#memory.rememberDecision(actions, targetId, recovery);
    const memory = this.#memory.snapshot();
    return Object.freeze({
      actions,
      intent: Object.freeze({
        tick: observation.state.tick,
        profile: this.#profile,
        objective,
        ...(targetId === undefined ? {} : { targetId }),
        maneuver,
        confidence,
        recovery,
        critic,
        invariantViolations: violations,
        watchdog: incidents,
        observationClass: observation.state.observationClass,
        memory,
      }),
    });
  }
}
