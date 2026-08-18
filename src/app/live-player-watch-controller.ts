import { createIndexedDbGhostVaultBackend } from "../ghost";
import type { CanonicalGameplayState } from "../gameplay/runtime/canonical-state";
import type { GameAction } from "../input/game-action";
import { TearC32CanonicalActivePolicyRuntime } from "../agents/c32-canonical-active-policy-runtime";
import { parseTearPolicyActivation, parseTearPolicyArtifact } from "../agents/policy-artifact-registry";
import { TEAR_C34_V3_C32_POLICY_FORMAT_V1 } from "../agents/c34-v3-c32-policy-adapter";

export type PlayerWatchStatus = "checking" | "unavailable" | "ready" | "starting" | "running" | "paused" | "stopped";
export interface PlayerWatchView { readonly status: PlayerWatchStatus; readonly detail: string; readonly decisions: number; }
export interface PlayerWatchPort {
  readonly canonicalState: () => CanonicalGameplayState | null;
  readonly availableActions: () => readonly GameAction["type"][];
  readonly pushAction: (action: GameAction) => void;
  readonly setSemanticAuthority: (active: boolean) => void;
  readonly startNormalRun: () => void;
}
type PlayerWatchRuntime = Pick<TearC32CanonicalActivePolicyRuntime, "decide">;
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
  const runtime = new TearC32CanonicalActivePolicyRuntime(backend, () => [], true); await runtime.reset(); return runtime;
}

/** Normal-player C37 policy controller. It has no TearBench bridge, journal, monitor, or fallback policy. */
export class LivePlayerWatchController {
  readonly #port: PlayerWatchPort; readonly #factory: IDBFactory | undefined;
  #runtime: PlayerWatchRuntime | undefined;
  #view: PlayerWatchView = Object.freeze({ status: "checking", detail: "Checking the local canonical policy.", decisions: 0 });
  readonly #load: PlayerWatchRuntimeLoader;
  constructor(factory: IDBFactory | undefined, port: PlayerWatchPort, load: PlayerWatchRuntimeLoader = loadCanonicalRuntime) { this.#factory = factory; this.#port = port; this.#load = load; }
  snapshot = (): PlayerWatchView => this.#view;
  async refresh(): Promise<void> {
    this.#runtime = undefined;
    try {
      const runtime = await this.#load(this.#factory); if (runtime === undefined) throw new Error("unavailable");
      this.#runtime = runtime; this.#set("ready", "Canonical V3 policy is available locally.", 0);
    } catch { this.#set("unavailable", "No validated canonical V3 policy is available locally.", 0); }
  }
  start = (): void => { if (this.#runtime === undefined || this.#view.status !== "ready") return; this.#set("starting", "Starting a normal-speed local Watch run.", 0); this.#port.setSemanticAuthority(true); this.#port.startNormalRun(); this.#set("running", "Local aggregate health only; no traffic or rollout.", 0); };
  pause = (): void => { if (this.#view.status === "running") { this.#port.setSemanticAuthority(false); this.#set("paused", "Watch paused; native play remains available.", this.#view.decisions); } };
  resume = (): void => { if (this.#view.status === "paused" && this.#runtime !== undefined) { this.#port.setSemanticAuthority(true); this.#set("running", "Local aggregate health only; no traffic or rollout.", this.#view.decisions); } };
  stop = (): void => { if (this.#view.status === "running" || this.#view.status === "paused") { this.#port.setSemanticAuthority(false); this.#set("stopped", "Watch stopped; the native game loop and player input are restored.", this.#view.decisions); } };
  advance(): void {
    if (this.#view.status !== "running" || this.#runtime === undefined) return;
    const state = this.#port.canonicalState();
    if (state === null) return;
    const decision = this.#runtime.decide(state, this.#port.availableActions());
    if (decision.source !== "artifact") { this.#port.setSemanticAuthority(false); this.#set("unavailable", "Canonical policy refused; native play is restored.", this.#view.decisions); return; }
    for (const action of decision.actions) this.#port.pushAction(action);
    this.#set("running", "Local aggregate health only; no traffic or rollout.", this.#view.decisions + 1);
  }
  #set(status: PlayerWatchStatus, detail: string, decisions: number): void { this.#view = Object.freeze({ status, detail, decisions }); }
}
