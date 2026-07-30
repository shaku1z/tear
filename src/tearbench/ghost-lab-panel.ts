import type { GameAction } from "../input/game-action";
import { TEAR_CONTRACT_FORMAT, TEAR_CONTRACT_VERSION, type TearObservationV1, type TearScenarioV1 } from "./contracts";
import { runInvariantChecks } from "./invariants";
import type { TearRuntimeBridgeFactory } from "./live-runtime-contracts";

export function installGhostLabPanel(factory: TearRuntimeBridgeFactory): void {
  if (new URLSearchParams(window.location.search).get("ghostlab") !== "1") return;
  const environment = factory.create("A");
  const scenario: TearScenarioV1 = Object.freeze({
    format: TEAR_CONTRACT_FORMAT, kind: "scenario", schemaVersion: TEAR_CONTRACT_VERSION,
    id: "ghost-lab.disposable-live-run", version: 1,
    description: "Ghost Lab disposable live runtime inspection",
    stateClass: "recorded-canonical", executionClass: "engineering", seed: "ghost-lab",
    start: Object.freeze({ mode: "endless", difficulty: "normal", weapon: "sword" }),
    maxTicks: 3_600, assertions: Object.freeze([
      "runtime.finite-state", "player.finite-transform", "blade.finite-transform",
    ] as const), tags: Object.freeze(["ghost-lab", "c22", "disposable"]),
  });
  const panel = document.createElement("aside");
  panel.id = "tear-ghost-lab";
  Object.assign(panel.style, {
    position: "fixed", inset: "12px 12px 12px auto", width: "min(460px, 42vw)",
    zIndex: "2147483647", overflow: "auto", padding: "14px", color: "#e8f8ff",
    background: "rgba(5, 10, 18, .96)", border: "1px solid #36d6ff",
    font: "12px/1.35 ui-monospace, SFMono-Regular, Consolas, monospace",
  });
  const title = document.createElement("h2");
  title.textContent = "Ghost Lab · Live Disposable Runtime";
  title.style.margin = "0 0 10px";
  const controls = document.createElement("div");
  const output = document.createElement("pre");
  output.id = "tear-ghost-lab-state";
  output.style.whiteSpace = "pre-wrap";
  const button = (label: string, run: () => void): HTMLButtonElement => {
    const value = document.createElement("button");
    value.textContent = label;
    value.style.margin = "0 6px 8px 0";
    value.addEventListener("click", run);
    controls.append(value);
    return value;
  };
  const refresh = (lastActions: readonly GameAction[] = []): void => {
    let observation: TearObservationV1 | null = null;
    try { observation = environment.observe(); } catch { /* not launched yet */ }
    output.textContent = JSON.stringify({
      status: observation === null ? "ready" : "running",
      observation,
      actions: lastActions,
      events: observation === null ? [] : environment.events().slice(-12),
      rng: observation === null ? {} : environment.rng(),
      invariants: observation === null ? [] : (() => {
        const failures = new Map(runInvariantChecks(observation, scenario.assertions)
          .map((failure) => [failure.id, failure]));
        return scenario.assertions.map((id) => ({
          id, status: failures.has(id) ? "failed" : "passed", message: failures.get(id)?.message,
        }));
      })(),
      metrics: environment.metrics(),
      stateHash: observation === null ? null : environment.stateHash(),
    }, null, 2);
  };
  button("Launch disposable run", () => { environment.reset(scenario); refresh(); });
  button("Step", () => { environment.step(); refresh(); });
  button("Move + step", () => {
    const action: GameAction = Object.freeze({ type: "move", x: 1_000, y: 0 });
    environment.step([Object.freeze({
      kind: "command", id: 1, tick: environment.observe().tick + 1, command: action,
    })]);
    refresh([action]);
  });
  button("Pause", () => { environment.pause(); refresh(); });
  button("Resume", () => { environment.resume(); refresh(); });
  panel.append(title, controls, output);
  document.body.append(panel);
  refresh();
}
