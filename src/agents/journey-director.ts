import type { GameAction } from "../input/game-action";
import type { TearExecutionClass, TearObservationClass } from "../tearbench/contracts";

export type TearJourneyStage =
  | "menu" | "setup" | "playing-wave-1" | "draft-1" | "playing-wave-2"
  | "boss" | "evolution" | "result" | "replay" | "returned-menu" | "failed";

export interface TearJourneyObservation {
  readonly tick: number;
  readonly screen: string;
  readonly mode?: string;
  readonly difficulty?: string;
  readonly weapon?: string;
  readonly wave?: number;
  readonly bossActive?: boolean;
  readonly choices?: readonly string[];
  readonly replayAvailable?: boolean;
}

export interface TearJourneyTransition {
  readonly from: TearJourneyStage;
  readonly to: TearJourneyStage;
  readonly tick: number;
  readonly reason: string;
}

export interface TearJourneyDecision {
  readonly stage: TearJourneyStage;
  readonly actions: readonly GameAction[];
  readonly transition?: TearJourneyTransition;
  readonly timedOut: boolean;
}

export interface TearJourneyContract {
  readonly id: string;
  readonly mode: string;
  readonly startScreen: string;
  readonly playableScreens: readonly string[];
  readonly terminalScreens: readonly string[];
}

export const JOURNEY_MODE_CONTRACTS = Object.freeze([
  { id: "tutorial", mode: "tutorial", startScreen: "menu", playableScreens: ["playing"], terminalScreens: ["win", "gameover"] },
  { id: "adventure", mode: "campaign", startScreen: "menu", playableScreens: ["playing", "draft", "tierup"], terminalScreens: ["win", "gameover"] },
  { id: "endless", mode: "endless", startScreen: "menu", playableScreens: ["playing", "draft", "tierup"], terminalScreens: ["win", "gameover"] },
  { id: "gauntlet", mode: "gauntlet", startScreen: "menu", playableScreens: ["playing", "draft", "tierup"], terminalScreens: ["win", "gameover"] },
  { id: "playground", mode: "playground", startScreen: "menu", playableScreens: ["playing", "pgmenu", "pglab"], terminalScreens: ["menu"] },
  { id: "boss-test", mode: "bossonly", startScreen: "menu", playableScreens: ["playing", "tierup"], terminalScreens: ["win", "gameover"] },
  { id: "enemy-test", mode: "sandbox", startScreen: "menu", playableScreens: ["playing", "pgmenu", "pglab"], terminalScreens: ["menu"] },
] as const satisfies readonly TearJourneyContract[]);

export class TearJourneyDirector {
  readonly #watchdogTicks: number;
  #stage: TearJourneyStage = "menu";
  #lastTransitionTick = 0;
  readonly #transitions: TearJourneyTransition[] = [];

  constructor(watchdogTicks = 3_600) {
    if (!Number.isSafeInteger(watchdogTicks) || watchdogTicks < 1) throw new RangeError("watchdogTicks must be positive");
    this.#watchdogTicks = watchdogTicks;
  }

  get stage(): TearJourneyStage { return this.#stage; }
  get transitions(): readonly TearJourneyTransition[] { return Object.freeze([...this.#transitions]); }

  decide(observation: TearJourneyObservation): TearJourneyDecision {
    const prior = this.#stage;
    let next = prior;
    let reason = "";
    const actions: GameAction[] = [];
    if (prior === "menu" && observation.screen === "menu") actions.push({ type: "confirm" });
    if (prior === "menu" && observation.screen === "setup") { next = "setup"; reason = "setup-opened"; }
    if (prior === "setup" && observation.screen === "setup") actions.push({ type: "confirm" });
    if ((prior === "setup" || prior === "menu") && observation.screen === "playing") {
      next = "playing-wave-1"; reason = "run-started";
    } else if (prior === "playing-wave-1" && observation.screen === "draft") {
      next = "draft-1"; reason = "first-wave-cleared";
      const choice = observation.choices?.[0];
      if (choice !== undefined) actions.push({ type: "draft-choice", choiceId: choice });
    } else if (prior === "draft-1" && observation.screen === "draft") {
      const choice = observation.choices?.[0];
      if (choice !== undefined) actions.push({ type: "draft-choice", choiceId: choice });
    } else if (prior === "draft-1" && observation.screen === "playing") {
      next = "playing-wave-2"; reason = "draft-selected";
    } else if ((prior === "playing-wave-2" || prior === "playing-wave-1") && observation.bossActive === true) {
      next = "boss"; reason = "boss-entered";
    } else if (prior === "boss" && observation.screen === "tierup") {
      next = "evolution"; reason = "boss-defeated";
      const choice = observation.choices?.[0];
      if (choice !== undefined) actions.push({ type: "tier-up-choice", choiceId: choice });
    } else if (prior === "evolution" && observation.screen === "tierup") {
      const choice = observation.choices?.[0];
      if (choice !== undefined) actions.push({ type: "tier-up-choice", choiceId: choice });
    } else if (["playing-wave-2", "boss", "evolution"].includes(prior)
      && (observation.screen === "win" || observation.screen === "gameover")) {
      next = "result"; reason = "run-terminated";
    } else if (prior === "result" && observation.screen === "replay") {
      next = "replay"; reason = "replay-opened";
    } else if ((prior === "result" || prior === "replay") && observation.screen === "menu") {
      next = "returned-menu"; reason = "menu-returned";
    }
    let transition: TearJourneyTransition | undefined;
    if (next !== prior) {
      transition = Object.freeze({ from: prior, to: next, tick: observation.tick, reason });
      this.#transitions.push(transition);
      this.#stage = next;
      this.#lastTransitionTick = observation.tick;
    }
    const timedOut = !["returned-menu", "failed"].includes(this.#stage)
      && observation.tick - this.#lastTransitionTick > this.#watchdogTicks;
    if (timedOut) this.#stage = "failed";
    return Object.freeze({
      stage: this.#stage,
      actions: Object.freeze(actions),
      ...(transition === undefined ? {} : { transition }),
      timedOut,
    });
  }
}

export interface TearJourneyCertification {
  readonly executionClass: TearExecutionClass;
  readonly observationClass: TearObservationClass;
  readonly attempts: number;
  readonly successes: number;
  readonly completionRate: number;
  readonly requiredAttempts: number;
  readonly requiredRate: number;
  readonly certified: boolean;
  readonly label: string;
}

export function evaluateJourneyCertification(
  executionClass: TearExecutionClass,
  observationClass: TearObservationClass,
  outcomes: readonly boolean[],
  requiredAttempts = 30,
  requiredRate = 0.9,
): TearJourneyCertification {
  const successes = outcomes.filter(Boolean).length;
  const completionRate = outcomes.length === 0 ? 0 : successes / outcomes.length;
  const certified = executionClass === "black-box"
    && observationClass === "pixel-only"
    && outcomes.length >= requiredAttempts
    && completionRate >= requiredRate;
  return Object.freeze({
    executionClass,
    observationClass,
    attempts: outcomes.length,
    successes,
    completionRate,
    requiredAttempts,
    requiredRate,
    certified,
    label: certified ? "black-box-certified" : `${executionClass}-evidence-only`,
  });
}

export interface TearWatchOverlay {
  readonly visible: boolean;
  readonly title: string;
  readonly lines: readonly string[];
}

export function createWatchOverlay(
  enabled: boolean,
  input: Readonly<{ stage: TearJourneyStage; objective: string; maneuver: string; confidence: number }>,
): TearWatchOverlay {
  return Object.freeze({
    visible: enabled,
    title: "TEARBOT WATCH",
    lines: Object.freeze([
      `Journey: ${input.stage}`,
      `Objective: ${input.objective}`,
      `Maneuver: ${input.maneuver}`,
      `Confidence: ${String(Math.round(input.confidence * 100))}%`,
    ]),
  });
}
