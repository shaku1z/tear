import type { ScreenAction } from "../presentation/screens/contracts";
import type { RunDifficulty, RunMode } from "../gameplay/run/session";
import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import type { LiveTearRuntimeEnvironmentContext } from "../tearbench/live-runtime-contracts";
import { projectLiveTearObservation } from "../tearbench/live-runtime-environment";
import type { TearStructuredAgentIntent } from "../tearbench/scripted-agent-hierarchy";
import { TearLiveHierarchicalPolicy } from "./hierarchical-policy-adapter";
import type { TearAgentIntentTrace, TearAgentProfileId } from "./contracts";
import type { TearPolicyDecisionJournal, TearPolicyDecisionJournalSnapshot } from "./policy-decision-journal";
import type { TearActivePolicyRuntime, TearPolicyDecisionReceipt } from "./policy-runtime";
import type { TearC32CanonicalActivePolicyRuntime } from "./c32-canonical-active-policy-runtime";
import { buildWatchChoiceScore } from "./watch-build-choice";
import { installLiveWatchAgentPanel } from "./live-watch-agent-panel";
import {
  C24_LONGITUDINAL_POLICY,
  C24LongitudinalJourneyDirector,
  type LongitudinalJourneySnapshot,
} from "./longitudinal-progression";

export interface TearWatchAgentOptions {
  readonly profile?: TearAgentProfileId;
  readonly mode?: RunMode;
  readonly difficulty?: RunDifficulty;
  readonly weapon?: "sword" | "hammer" | "spear" | "chainblade" | "ringblade";
  readonly boss?: "shuffle" | "warden" | "colossus" | "aldric" | "echo" | "source";
  readonly seed?: number;
  readonly skipCinematics?: boolean;
  readonly journey?: "single-run" | "longitudinal-earned-profile";
  readonly maxEpisodes?: number;
  readonly maxSpend?: number;
}

export type TearWatchAgentStatus = "idle" | "running" | "paused" | "completed" | "failed" | "stopped";

export interface TearWatchAgentSelection {
  readonly profile: TearAgentProfileId;
  readonly mode: Required<TearWatchAgentOptions>["mode"];
  readonly difficulty: Required<TearWatchAgentOptions>["difficulty"];
  readonly weapon: Required<TearWatchAgentOptions>["weapon"];
  readonly boss: Required<TearWatchAgentOptions>["boss"];
  readonly seed: number;
  readonly skipCinematics: boolean;
  readonly journey?: Required<TearWatchAgentOptions>["journey"];
  readonly maxEpisodes?: number;
  readonly maxSpend?: number;
}

export interface TearWatchdogSnapshot {
  readonly noProgressTicks: number;
  readonly noProgressLimit: number;
  readonly active: readonly string[];
}

export interface TearWatchAgentSnapshot {
  readonly status: TearWatchAgentStatus;
  readonly selection: TearWatchAgentSelection;
  readonly screen: string;
  readonly tick: number;
  readonly decisions: number;
  readonly fixedTicks: number;
  readonly runSeed?: number;
  readonly wave?: number;
  readonly hp?: number;
  readonly enemyCount: number;
  readonly terminalReason?: string;
  readonly transitions: readonly Readonly<{ screen: string; tick: number }>[];
  readonly mechanics: readonly string[];
  readonly bladeStates: readonly string[];
  readonly bladeStateTransitions: readonly Readonly<{
    tick: number; state: string; hostile: boolean; stolen: boolean;
  }>[];
  readonly bladeTether: Readonly<{ minimum: number; maximum: number; contracted: boolean }>;
  readonly engineEvents: readonly TearGameplayEvent[];
  readonly weaponEvents: readonly unknown[];
  readonly weaponStats?: Readonly<{
    heldHits: number; trueCuts: number; throws: number; throwHits: number; perfectParries: number;
  }>;
  readonly draftPicks: readonly Readonly<{ tick: number; offered: readonly string[]; selected: string }>[];
  readonly lastTrace?: TearAgentIntentTrace;
  readonly structuredIntent?: TearStructuredAgentIntent;
  readonly policyReceipt?: TearPolicyDecisionReceipt;
  readonly policyDecisionTrace?: TearPolicyDecisionJournalSnapshot;
  readonly watchdogs: TearWatchdogSnapshot;
  readonly debugTransitions: 0;
  readonly executionClass: "engineering";
  readonly observationClass: "privileged-diagnostic";
  readonly observationLabel: "Class A - privileged diagnostic";
  readonly certified: false;
  readonly longitudinal?: LongitudinalJourneySnapshot;
}

export interface TearWatchAgentApi {
  start(options?: TearWatchAgentOptions): TearWatchAgentSnapshot;
  run(tickBudget?: number): TearWatchAgentSnapshot;
  pause(): TearWatchAgentSnapshot;
  resume(): TearWatchAgentSnapshot;
  stop(): TearWatchAgentSnapshot;
  activatePlaygroundAction(id: string): TearWatchAgentSnapshot;
  resumePlayground(): TearWatchAgentSnapshot;
  snapshot(): TearWatchAgentSnapshot;
}

interface MutableState {
  status: TearWatchAgentStatus;
  decisions: number;
  fixedTicks: number;
  terminalReason?: string;
  transitions: { screen: string; tick: number }[];
  mechanics: Set<string>;
  bladeStates: Set<string>;
  bladeStateTransitions: { tick: number; state: string; hostile: boolean; stolen: boolean }[];
  lastBladeSignature?: string;
  tetherMinimum: number;
  tetherMaximum: number;
  engineEvents: TearGameplayEvent[];
  draftPicks: { tick: number; offered: readonly string[]; selected: string }[];
  lastTrace?: TearAgentIntentTrace;
  structuredIntent?: TearStructuredAgentIntent;
  policyReceipt?: TearPolicyDecisionReceipt;
  lastScreen: string;
  noProgressTicks: number;
  progressSignature: string;
  setupStep: number;
  options: Required<TearWatchAgentOptions>;
  policy: TearLiveHierarchicalPolicy;
  artifactRuntime?: TearActivePolicyRuntime;
  canonicalRuntime?: TearC32CanonicalActivePolicyRuntime;
  decisionJournal?: TearPolicyDecisionJournal;
  director?: C24LongitudinalJourneyDirector;
}

const DEFAULTS: Required<TearWatchAgentOptions> = {
  profile: "competent",
  mode: "campaign",
  difficulty: "easy",
  weapon: "ringblade",
  boss: "shuffle",
  seed: 62,
  skipCinematics: true,
  journey: "single-run",
  maxEpisodes: C24_LONGITUDINAL_POLICY.maxEpisodes,
  maxSpend: C24_LONGITUDINAL_POLICY.maxSpend,
};
const NO_PROGRESS_LIMIT = 14_400;

function modeAction(mode: Required<TearWatchAgentOptions>["mode"]): ScreenAction {
  return { type: "setup.selectMode", id: mode };
}

function immutableSnapshot(context: LiveTearRuntimeEnvironmentContext, state: MutableState): TearWatchAgentSnapshot {
  const tick = context.authoritative()?.tick ?? 0;
  const policyDecisionTrace = state.decisionJournal?.current();
  // The menu exists before the legacy host installs its first run object even
  // though the historical port type predates that transient undefined state.
  const run = context.state.run() as ReturnType<typeof context.state.run> | undefined;
  const player = context.state.player();
  return Object.freeze({
    status: state.status,
    selection: Object.freeze({
      profile: state.options.profile, mode: state.options.mode, difficulty: state.options.difficulty,
      weapon: state.options.weapon, boss: state.options.boss, seed: state.options.seed,
      skipCinematics: state.options.skipCinematics,
      ...(state.options.journey === "single-run" ? {} : {
        journey: state.options.journey, maxEpisodes: state.options.maxEpisodes, maxSpend: state.options.maxSpend,
      }),
    }),
    screen: context.screen(),
    tick,
    decisions: state.decisions,
    fixedTicks: state.fixedTicks,
    ...(run === null || run === undefined ? {} : { runSeed: run.runSeed, wave: run.wave }),
    ...(player === undefined ? {} : { hp: player.hp }),
    enemyCount: context.state.enemies().filter((enemy) => !enemy.dead).length,
    ...(state.terminalReason === undefined ? {} : { terminalReason: state.terminalReason }),
    transitions: Object.freeze(state.transitions.map((entry) => Object.freeze({ ...entry }))),
    mechanics: Object.freeze([...state.mechanics].sort()),
    bladeStates: Object.freeze([...state.bladeStates].sort()),
    bladeStateTransitions: Object.freeze(state.bladeStateTransitions.map((entry) => Object.freeze({ ...entry }))),
    bladeTether: Object.freeze({
      minimum: Number.isFinite(state.tetherMinimum) ? state.tetherMinimum : 1,
      maximum: state.tetherMaximum, contracted: state.tetherMinimum < 0.9,
    }),
    engineEvents: Object.freeze(state.engineEvents.map((event) => Object.freeze({ ...event }))),
    weaponEvents: Object.freeze((run === null || run === undefined ? [] : run.weaponLog).map((event) =>
      event && typeof event === "object" ? Object.freeze({ ...event }) : event)),
    ...(run === null || run === undefined ? {} : { weaponStats: Object.freeze({
      heldHits: run.weaponStats.heldHits, trueCuts: run.weaponStats.trueCuts,
      throws: run.weaponStats.throws, throwHits: run.weaponStats.throwHits,
      perfectParries: run.weaponStats.perfectParries,
    }) }),
    draftPicks: Object.freeze(state.draftPicks.map((entry) => Object.freeze({ ...entry }))),
    ...(state.lastTrace === undefined ? {} : { lastTrace: state.lastTrace }),
    ...(state.structuredIntent === undefined ? {} : { structuredIntent: state.structuredIntent }),
    ...(state.policyReceipt === undefined ? {} : { policyReceipt: state.policyReceipt }),
    ...(policyDecisionTrace === undefined ? {} : { policyDecisionTrace }),
    watchdogs: Object.freeze({
      noProgressTicks: state.noProgressTicks,
      noProgressLimit: NO_PROGRESS_LIMIT,
      active: Object.freeze([
        ...(state.terminalReason?.includes("watchdog") === true ? [state.terminalReason] : []),
      ]),
    }),
    debugTransitions: 0 as const,
    executionClass: "engineering" as const,
    observationClass: "privileged-diagnostic" as const,
    observationLabel: "Class A - privileged diagnostic" as const,
    certified: false as const,
    ...(state.director === undefined ? {} : { longitudinal: state.director.snapshot() }),
  });
}

function activateRequired(
  context: LiveTearRuntimeEnvironmentContext,
  action: ScreenAction,
  label: string,
): void {
  if (!context.activateControl(action)) throw new Error(`Watch Agent could not activate ${label}`);
}

export function createLiveWatchAgentHost(
  context: LiveTearRuntimeEnvironmentContext,
  artifactRuntime?: TearActivePolicyRuntime,
  decisionJournal?: TearPolicyDecisionJournal,
  canonicalRuntime?: TearC32CanonicalActivePolicyRuntime,
): TearWatchAgentApi {
  let decisionJournalRuns = 0;
  let state: MutableState = {
    status: "idle", decisions: 0, fixedTicks: 0, transitions: [], mechanics: new Set(),
    bladeStates: new Set(), bladeStateTransitions: [], tetherMinimum: Number.POSITIVE_INFINITY,
    tetherMaximum: 0, engineEvents: [], draftPicks: [],
    lastScreen: context.screen(), noProgressTicks: 0, progressSignature: "",
    setupStep: 0,
    options: DEFAULTS, policy: new TearLiveHierarchicalPolicy(DEFAULTS.profile),
    ...(artifactRuntime === undefined ? {} : { artifactRuntime }),
    ...(canonicalRuntime === undefined ? {} : { canonicalRuntime }),
    ...(decisionJournal === undefined ? {} : { decisionJournal }),
  };
  context.subscribeEngineEvent((event) => {
    if (state.status === "running" && state.engineEvents.length < 4_096) {
      state.engineEvents.push(Object.freeze({ ...event }));
    }
  });

  const transition = (): void => {
    const screen = context.screen();
    if (screen === state.lastScreen) return;
    state.lastScreen = screen;
    state.transitions.push({ screen, tick: context.authoritative()?.tick ?? 0 });
  };
  const fail = (reason: string): void => {
    state.status = "failed";
    state.terminalReason = reason;
    context.setSemanticInputAuthority(false);
  };
  const captureBlade = (): void => {
    const blade = context.state.blade();
    if (blade === undefined) return;
    const hostile = blade.hostile, stolen = Boolean(blade.stolenBy);
    state.tetherMinimum = Math.min(state.tetherMinimum, blade.tetherFactor);
    state.tetherMaximum = Math.max(state.tetherMaximum, blade.tetherFactor);
    const signature = `${blade.state}:${String(hostile)}:${String(stolen)}`;
    state.bladeStates.add(blade.state);
    if (signature !== state.lastBladeSignature) {
      state.bladeStateTransitions.push({
        tick: context.authoritative()?.tick ?? state.fixedTicks, state: blade.state, hostile, stolen,
      });
      state.lastBladeSignature = signature;
    }
  };
  const start = (options: TearWatchAgentOptions = {}): TearWatchAgentSnapshot => {
    if (context.screen() !== "menu") throw new Error("Watch Agent must start from the real main menu");
    context.setSemanticInputAuthority(true);
    const resolved = { ...DEFAULTS, ...options };
    const director = resolved.journey === "longitudinal-earned-profile"
      ? new C24LongitudinalJourneyDirector(resolved.seed, context.progression(), {
          ...C24_LONGITUDINAL_POLICY,
          maxEpisodes: resolved.maxEpisodes,
          maxSpend: resolved.maxSpend,
        })
      : undefined;
    state = {
      status: "running", decisions: 0, fixedTicks: 0,
      transitions: [{ screen: "menu", tick: context.authoritative()?.tick ?? 0 }],
      mechanics: new Set(), bladeStates: new Set(), bladeStateTransitions: [],
      tetherMinimum: Number.POSITIVE_INFINITY, tetherMaximum: 0, engineEvents: [], draftPicks: [],
      lastScreen: "menu", noProgressTicks: 0, progressSignature: "",
      setupStep: 0,
      options: resolved, policy: new TearLiveHierarchicalPolicy(resolved.profile),
      ...(artifactRuntime === undefined ? {} : { artifactRuntime }),
      ...(canonicalRuntime === undefined ? {} : { canonicalRuntime }),
      ...(decisionJournal === undefined ? {} : { decisionJournal }),
      ...(director === undefined ? {} : { director }),
    };
    state.artifactRuntime?.setConditioning({ personaId: resolved.profile });
    if (state.decisionJournal !== undefined) {
      const run = decisionJournalRuns;
      decisionJournalRuns += 1;
      // This is diagnostic persistence identity only; it must not affect the
      // deterministic simulation seed, action stream, or policy observation.
      state.decisionJournal.begin(`watch-policy:v1:${Date.now().toString(36)}:${String(run)}`);
    }
    activateRequired(context, { type: "navigate", to: "setup" }, "PLAY");
    transition();
    return immutableSnapshot(context, state);
  };
  const run = (tickBudget = 2_000): TearWatchAgentSnapshot => {
    if (!Number.isSafeInteger(tickBudget) || tickBudget < 1 || tickBudget > 20_000) {
      throw new RangeError("Watch Agent tick budget must be an integer from 1 to 20000");
    }
    if (state.status !== "running") return immutableSnapshot(context, state);
    for (let index = 0; index < tickBudget; index += 1) {
      const screen = context.screen();
      transition();
      if (state.director !== undefined) {
        const directive = state.director.step(screen, context.outcome(), context.progression());
        if (directive.type === "activate") {
          activateRequired(context, directive.action, `longitudinal ${JSON.stringify(directive.action)}`);
          transition();
          break;
        }
        if (directive.type === "begin-episode") {
          state.setupStep = 0; state.noProgressTicks = 0; state.progressSignature = "";
          state.policy = new TearLiveHierarchicalPolicy(state.options.profile);
          activateRequired(context, { type: "navigate", to: "setup" }, "longitudinal next episode");
          transition();
          continue;
        }
        if (directive.type === "complete") {
          state.status = "completed"; context.setSemanticInputAuthority(false); break;
        }
        if (directive.type === "fail") { fail(directive.reason); break; }
      }
      if (screen === "setup") {
        const difficultyAction: readonly Readonly<{ action: ScreenAction; label: string }>[] =
          state.options.mode === "tutorial" || state.options.mode === "playground"
            ? []
            : [{ action: { type: "setup.selectDifficulty", id: state.options.difficulty }, label: state.options.difficulty }];
        const setupActions: readonly Readonly<{ action: ScreenAction; label: string }>[] = [
          { action: modeAction(state.options.mode), label: state.options.mode },
          ...difficultyAction,
          ...(state.options.mode === "bossonly"
            ? [{ action: { type: "setup.selectBoss", id: state.options.boss } as ScreenAction, label: state.options.boss }]
            : []),
          { action: { type: "setup.selectWeapon", id: state.options.weapon }, label: state.options.weapon },
          { action: { type: "setup.start" }, label: "START" },
        ];
        const step = setupActions[state.setupStep];
        if (step === undefined) {
          fail("setup-transition-watchdog");
        } else {
          if (step.action.type === "setup.start") context.setRunSeed(state.director?.seed() ?? state.options.seed);
          activateRequired(context, step.action, step.label);
          state.setupStep += 1;
          if (step.action.type === "setup.start") {
            context.stopFrameLoop();
            if (state.options.skipCinematics) context.skipCinematic();
          }
        }
        transition();
        break;
      }
      if (screen === "menu" && state.fixedTicks > 0 && state.director === undefined) {
        state.status = "completed";
        context.setSemanticInputAuthority(false);
        break;
      }
      if (screen === "win") {
        activateRequired(context, { type: "navigate", to: "menu" }, "MAIN MENU");
        transition();
        continue;
      }
      if (screen === "gameover") {
        fail("terminal-gameover");
        break;
      }
      if (screen === "continue") {
        if (!context.activateControl({ type: "continue.revive" })) {
          fail("continue-unavailable");
          break;
        }
        transition();
        continue;
      }
      if (state.options.skipCinematics) context.skipCinematic();
      // A new production run has no post-step receipt until C30 advances its
      // first fixed tick.  Establish that receipt through the real empty-input
      // frame before asking a strict V3 policy for its first source action.
      if (state.canonicalRuntime !== undefined && context.canonicalGameplayState() === null) {
        const beforeTick = context.authoritative()?.tick ?? 0;
        context.advanceApplicationFrame(1 / 120);
        state.fixedTicks += Math.max(0, (context.authoritative()?.tick ?? beforeTick) - beforeTick);
        captureBlade();
      }
      const observation = projectLiveTearObservation(
        context,
        context.authoritative()?.tick ?? state.fixedTicks,
        "A",
      );
      const agentObservation = {
        state: observation,
        ui: { screen, choices: context.choiceIds().map((id) => ({
          id, score: buildWatchChoiceScore(id, state.options.weapon),
        })) },
        ...(observation.diagnostics?.boss === undefined ? {} : { boss: observation.diagnostics.boss }),
      };
      const hierarchy = state.policy.decide(agentObservation);
      const artifact = state.artifactRuntime?.decide(agentObservation);
      const sourceState = state.canonicalRuntime === undefined ? undefined : context.canonicalGameplayState();
      if (state.canonicalRuntime !== undefined && sourceState === null) {
        state.policyReceipt = Object.freeze({ observationHash: "0000000000000000", source: "refused", reason: "canonical-source-unavailable" });
        fail("canonical-policy-refused:canonical-source-unavailable");
        break;
      }
      const canonical = sourceState === undefined || sourceState === null
        ? undefined : state.canonicalRuntime?.decide(sourceState, context.availableGameActions());
      const canonicalReceipt: TearPolicyDecisionReceipt | undefined = canonical === undefined ? undefined : Object.freeze({
        observationHash: canonical.stateHash, source: canonical.source,
        ...(canonical.reason === undefined ? {} : { reason: canonical.reason }),
        ...(canonical.artifactId === undefined ? {} : { artifactId: canonical.artifactId }),
        ...(canonical.artifactHash === undefined ? {} : { artifactHash: canonical.artifactHash }),
        ...(canonical.activationHash === undefined ? {} : { activationHash: canonical.activationHash }),
      });
      if (canonical?.source === "refused") {
        if (canonicalReceipt !== undefined) {
          state.policyReceipt = canonicalReceipt;
          if (state.decisionJournal !== undefined) state.decisionJournal.append({ tick: observation.tick, receipt: canonicalReceipt, actions: [], trace: hierarchy.trace });
        }
        fail(`canonical-policy-refused:${canonical.reason ?? "invalid-active-artifact"}`);
        break;
      }
      const decision = canonical?.source === "artifact"
        ? Object.freeze({ ...hierarchy, actions: canonical.actions, policyReceipt: canonicalReceipt })
        : artifact?.receipt.source === "artifact"
          ? Object.freeze({ ...hierarchy, actions: artifact.actions, policyReceipt: artifact.receipt })
          : Object.freeze({ ...hierarchy, ...(canonicalReceipt === undefined ? (artifact === undefined ? {} : { policyReceipt: artifact.receipt }) : { policyReceipt: canonicalReceipt }) });
      state.decisions += 1;
      state.lastTrace = decision.trace;
      state.structuredIntent = decision.structuredIntent;
      if (decision.policyReceipt === undefined) delete state.policyReceipt;
      else state.policyReceipt = decision.policyReceipt;
      if (decision.policyReceipt !== undefined && state.decisionJournal !== undefined) {
        state.decisionJournal.append({ tick: observation.tick, receipt: decision.policyReceipt, actions: decision.actions, trace: decision.trace });
      }
      state.mechanics.add(decision.trace.maneuver);
      captureBlade();
      const draft = decision.actions.find((action) => action.type === "draft-choice");
      if (screen === "draft" && draft?.type === "draft-choice") {
        state.draftPicks.push({
          tick: observation.tick,
          offered: Object.freeze([...context.choiceIds()]),
          selected: draft.choiceId,
        });
      }
      if (screen === "playing") {
        for (const action of decision.actions) context.pushAction(action);
        const beforeTick = context.authoritative()?.tick ?? 0;
        context.advanceApplicationFrame(1 / 60);
        state.fixedTicks += Math.max(0, (context.authoritative()?.tick ?? beforeTick) - beforeTick);
        captureBlade();
      } else {
        let routed = false;
        for (const action of decision.actions) routed = context.routeAction(action) || routed;
        if (!routed && screen !== "cinematic") {
          state.noProgressTicks += 1;
        }
      }
      const signature = `${screen}:${String(observation.run.wave)}:${String(observation.entities.length)}:${String(Math.round(observation.player.hp))}`;
      if (signature === state.progressSignature) state.noProgressTicks += 1;
      else {
        state.progressSignature = signature;
        state.noProgressTicks = 0;
      }
      if (state.noProgressTicks > NO_PROGRESS_LIMIT) {
        fail("no-progress-watchdog");
        break;
      }
    }
    context.render();
    return immutableSnapshot(context, state);
  };
  return Object.freeze({
    start,
    run,
    pause() {
      if (state.status === "running") state.status = "paused";
      return immutableSnapshot(context, state);
    },
    resume() {
      if (state.status === "paused") state.status = "running";
      return immutableSnapshot(context, state);
    },
    stop() {
      if (state.status === "running" || state.status === "paused") state.status = "stopped";
      context.setSemanticInputAuthority(false);
      context.startFrameLoop();
      return immutableSnapshot(context, state);
    },
    activatePlaygroundAction(id: string) {
      const screen = context.screen();
      if (screen !== "pgmenu" && screen !== "pglab") {
        throw new Error("Playground actions require the real Playground menu");
      }
      activateRequired(context, { type: "playground.action", id }, `playground action ${id}`);
      transition();
      context.render();
      return immutableSnapshot(context, state);
    },
    resumePlayground() {
      activateRequired(context, { type: "run.resume" }, "Playground RESUME");
      transition();
      return immutableSnapshot(context, state);
    },
    snapshot: () => immutableSnapshot(context, state),
  });
}

export function installLiveWatchAgentHost(
  context: LiveTearRuntimeEnvironmentContext,
  target: Window & { __TEAR_WATCH_AGENT__?: TearWatchAgentApi },
  artifactRuntime?: TearActivePolicyRuntime,
  decisionJournal?: TearPolicyDecisionJournal,
  canonicalRuntime?: TearC32CanonicalActivePolicyRuntime,
): void {
  const api = createLiveWatchAgentHost(context, artifactRuntime, decisionJournal, canonicalRuntime);
  Object.defineProperty(target, "__TEAR_WATCH_AGENT__", {
    configurable: false, writable: false, value: api,
  });
  installLiveWatchAgentPanel(api, DEFAULTS);
}
