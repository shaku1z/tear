import { createIndexedDbGhostVaultBackend } from "../../ghost";
import type { CanonicalGameplayState } from "../../gameplay/runtime/canonical-state";
import type { TearGameplayEvent } from "../../gameplay/runtime/gameplay-events";
import type { GameAction } from "../../input/game-action";
import { TearC32CanonicalActivePolicyRuntime } from "../../agents/c32-canonical-active-policy-runtime";
import { parseTearPolicyActivation, parseTearPolicyArtifact } from "../../agents/policy-artifact-registry";
import { createPlayerWatchObservation, previousPlayerWatchObservation, PLAYER_WATCH_DECISION_LIMIT, type PlayerWatchObservation, type PlayerWatchTerminal } from "./player-watch-observation";
import { TEAR_C34_V3_C32_POLICY_FORMAT_V1 } from "../../agents/c34-v3-c32-policy-adapter";

export type PlayerWatchStatus = "checking" | "unavailable" | "ready" | "starting" | "running" | "paused" | "stopped";
export interface PlayerWatchView { readonly status: PlayerWatchStatus; readonly detail: string; readonly decisions: number; }
export interface PlayerWatchPort {
  readonly canonicalState: () => CanonicalGameplayState | null;
  readonly availableActions: () => readonly GameAction["type"][];
  readonly pushAction: (action: GameAction) => void;
  readonly setSemanticAuthority: (active: boolean) => void;
  readonly startNormalRun: () => void;
  readonly bindRunEvents?: boolean;
}
type PlayerWatchRuntime = Pick<TearC32CanonicalActivePolicyRuntime, "decide"> & Readonly<{ observation?: PlayerWatchObservation; previousDetail?: string }>;
export type PlayerWatchRuntimeLoader = (factory: IDBFactory | undefined) => Promise<PlayerWatchRuntime | undefined>;

async function loadCanonicalRuntime(factory: IDBFactory | undefined): Promise<PlayerWatchRuntime | undefined> {
  if (factory === undefined) return undefined;
  const backend = await createIndexedDbGhostVaultBackend(factory);
  const activationRaw = await backend.get("analysis", "policy-active:v1");
  if (activationRaw === undefined) return undefined;
  const activation = parseTearPolicyActivation(JSON.parse(activationRaw));
  const artifactRaw = await backend.get("analysis", `policy-artifact:v1:${activation.artifactId}`);
  if (artifactRaw === undefined) return undefined;
  const artifact = parseTearPolicyArtifact(JSON.parse(artifactRaw));
  if (artifact.artifactHash !== activation.artifactHash || artifact.model.format !== TEAR_C34_V3_C32_POLICY_FORMAT_V1) return undefined;
  const runtime = new TearC32CanonicalActivePolicyRuntime(backend, () => [], true); await runtime.reset();
  const observation = await createPlayerWatchObservation(backend, activation), previousDetail = observation === undefined ? undefined : await previousPlayerWatchObservation(backend, activation);
  return Object.freeze({ decide: runtime.decide.bind(runtime), ...(observation === undefined ? {} : { observation }),
    ...(previousDetail === undefined ? {} : { previousDetail }) });
}

/** Normal-player C37 policy controller with bounded C36 observation; no diagnostic host or fallback policy. */
export class LivePlayerWatchController {
  readonly #port: PlayerWatchPort; readonly #factory: IDBFactory | undefined;
  #runtime: PlayerWatchRuntime | undefined;
  #view: PlayerWatchView = Object.freeze({ status: "checking", detail: "Checking the local canonical policy.", decisions: 0 });
  readonly #load: PlayerWatchRuntimeLoader;
  #epoch = 0;
  #tick = 0;
  #runId: string | undefined;
  #awaitingRun = false;
  #beforeStart: CanonicalGameplayState | null = null;
  #finishing: Promise<void> | undefined;
  constructor(factory: IDBFactory | undefined, port: PlayerWatchPort, load: PlayerWatchRuntimeLoader = loadCanonicalRuntime) { this.#factory = factory; this.#port = port; this.#load = load; }
  snapshot = (): PlayerWatchView => this.#view;
  async refresh(): Promise<void> {
    if (["running", "paused", "starting"].includes(this.#view.status)) return;
    await this.#finishing;
    const epoch = ++this.#epoch;
    this.#runtime = undefined;
    this.#set("checking", "Checking the local canonical policy.", 0);
    try {
      const runtime = await this.#load(this.#factory); if (runtime === undefined) throw new Error("unavailable");
      if (epoch !== this.#epoch) return;
      this.#runtime = runtime; this.#set("ready", runtime.previousDetail ?? "Canonical V3 policy is available locally.", 0);
    } catch { if (epoch === this.#epoch) this.#set("unavailable", "No validated canonical V3 policy is available locally.", 0); }
  }
  start = (): void | Promise<void> => {
    const runtime = this.#runtime;
    if (runtime === undefined || this.#view.status !== "ready") return;
    const epoch = ++this.#epoch;
    this.#set("starting", "Starting a local Run Monitor, limited to 256 decisions.", 0); this.#tick = 0;
    const start = () => {
      if (epoch !== this.#epoch || this.#view.status !== "starting") return;
      this.#beforeStart = this.#port.canonicalState(); this.#runId = undefined; this.#awaitingRun = this.#port.bindRunEvents === true;
      this.#port.setSemanticAuthority(true); this.#port.startNormalRun();
      if (epoch === this.#epoch) this.#set("running", "Local Run Monitor: at most 256 decisions. No automatic rollback.", 0);
    };
    if (runtime.observation === undefined) { start(); return; }
    return runtime.observation.begin().then(start).catch(() => {
      if (epoch === this.#epoch) { this.#port.setSemanticAuthority(false); this.#set("unavailable", "Run Monitor provenance changed; refresh before starting.", 0); }
    });
  };
  pause = (): void => { if (this.#view.status === "running") { this.#port.setSemanticAuthority(false); this.#set("paused", "Run Monitor paused; the same observation is preserved.", this.#view.decisions); } };
  resume = (): void => { if (this.#view.status === "paused" && this.#runtime !== undefined) { this.#port.setSemanticAuthority(true); this.#set("running", "Local Run Monitor: at most 256 decisions. No automatic rollback.", this.#view.decisions); } };
  stop = (): void => { if (["running", "paused", "starting"].includes(this.#view.status)) this.#finish({ status: "stopped", tick: this.#tick, reason: "user-stop" }); };
  /** Only the run domain's actual events finalize completion; screens and restored snapshots do not. */
  observeRunEvent = (event: TearGameplayEvent): void => {
    if (event.kind !== "run" || !["starting", "running", "paused"].includes(this.#view.status)) return;
    if (event.transition === "started") {
      if (this.#awaitingRun) { this.#runId = event.runId; this.#awaitingRun = false; }
      else if (this.#runId !== undefined && event.runId !== this.#runId) this.#finish({ status: "stopped", tick: this.#tick, reason: "run-replaced" });
      return;
    }
    if (event.runId !== this.#runId) return;
    if (event.transition === "completed" || event.transition === "defeated") this.#finish({ status: "completed", tick: event.tick, reason: event.transition });
    else if (event.transition === "abandoned") this.#finish({ status: "stopped", tick: event.tick, reason: "run-abandoned" });
  };
  advance(): void {
    if (this.#view.status !== "running" || this.#runtime === undefined) return;
    if (this.#view.decisions >= PLAYER_WATCH_DECISION_LIMIT) { this.#finish({ status: "stopped", tick: this.#tick, reason: "decision-limit" }); return; }
    const state = this.#port.canonicalState();
    if (state === null || this.#port.bindRunEvents === true && (this.#awaitingRun || this.#runId === undefined || state === this.#beforeStart)) return;
    this.#tick = state.tick;
    const decision = this.#runtime.decide(state, this.#port.availableActions());
    try { this.#runtime.observation?.record(state, decision); }
    catch { this.#finish({ status: "failed", tick: state.tick, reason: "observation-refused" }, "unavailable"); return; }
    if (decision.source !== "artifact") { this.#finish({ status: "failed", tick: state.tick, reason: decision.reason ?? "policy-refused" }, "unavailable"); return; }
    for (const action of decision.actions) this.#port.pushAction(action);
    this.#set("running", "Local Run Monitor: at most 256 decisions. No automatic rollback.", this.#view.decisions + 1);
    if (this.#view.decisions === PLAYER_WATCH_DECISION_LIMIT) this.#finish({ status: "stopped", tick: state.tick, reason: "decision-limit" });
  }
  #finish(terminal: PlayerWatchTerminal, status: PlayerWatchStatus = "stopped"): void {
    if (!["running", "paused", "starting"].includes(this.#view.status)) return;
    const epoch = ++this.#epoch, runtime = this.#runtime;
    this.#port.setSemanticAuthority(false);
    this.#set(status, runtime?.observation === undefined ? "Run Monitor stopped; native play is restored. No promotion-linked observation is available."
      : `Run Monitor ${terminal.status}; saving observation. Native play is restored.`, this.#view.decisions);
    if (runtime?.observation !== undefined) this.#finishing = runtime.observation.finish(terminal).then((detail) => {
      if (epoch === this.#epoch) this.#set(status, detail, this.#view.decisions);
    });
  }
  #set(status: PlayerWatchStatus, detail: string, decisions: number): void { this.#view = Object.freeze({ status, detail, decisions }); }
}
