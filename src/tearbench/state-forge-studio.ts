import type { TearProvenanceV1 } from "./contracts";
import type { StateForgeEvaluation, StateForgeReport, StateForgeValueDiff } from "./state-forge-studio-model";
import { diffStateForgeValues, evaluateStateForgeSource } from "./state-forge-studio-model";
import type { TearSdlDocumentV1, TearSdlResolved } from "./tearsdl";

export interface StateForgeCheckpointItem {
  readonly id: string;
  readonly label: string;
  readonly tick: number;
  readonly parentId?: string;
  readonly state: Readonly<Record<string, unknown>>;
  readonly provenance: TearProvenanceV1;
}

export interface StateForgeForkRequest {
  readonly parentId: string;
  readonly id: string;
  readonly patch: Readonly<Record<string, unknown>>;
}

export interface StateForgeStudioHost {
  readonly initialSource: string;
  tearSdlLibrary(): ReadonlyMap<string, TearSdlDocumentV1>;
  checkpoints(): readonly StateForgeCheckpointItem[];
  fork(request: StateForgeForkRequest): StateForgeCheckpointItem;
  watch(checkpointId: string): void;
  launch(resolved: TearSdlResolved): StateForgeCheckpointItem;
  exportScenario(fileName: string, source: string): void;
}

interface StudioElements {
  readonly editor: HTMLTextAreaElement;
  readonly status: HTMLElement;
  readonly structural: HTMLElement;
  readonly reachability: HTMLElement;
  readonly plausibility: HTMLElement;
  readonly timeline: HTMLSelectElement;
  readonly comparison: HTMLSelectElement;
  readonly provenance: HTMLElement;
  readonly diff: HTMLElement;
  readonly forkId: HTMLInputElement;
  readonly forkPatch: HTMLTextAreaElement;
  readonly launch: HTMLButtonElement;
}

function element<K extends keyof HTMLElementTagNameMap>(
  name: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const value = document.createElement(name);
  if (text !== undefined) value.textContent = text;
  return value;
}

function labelledControl(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = element("label");
  const title = element("span", labelText);
  title.style.display = "block";
  title.style.marginBlock = "8px 4px";
  label.append(title, control);
  return label;
}

function button(label: string, action: () => void): HTMLButtonElement {
  const value = element("button", label);
  value.type = "button";
  value.addEventListener("click", action);
  return value;
}

function renderReport(target: HTMLElement, title: string, report: StateForgeReport): void {
  target.replaceChildren();
  target.dataset.status = report.status;
  target.append(element("strong", `${title}: ${report.status}`));
  const list = element("ul");
  for (const message of report.messages) list.append(element("li", message));
  target.append(list);
}

function renderProvenance(target: HTMLElement, checkpoint?: StateForgeCheckpointItem): void {
  target.replaceChildren(element("strong", "Provenance"));
  if (checkpoint === undefined) {
    target.append(element("p", "Select a checkpoint to inspect its provenance."));
    return;
  }
  const provenance = checkpoint.provenance;
  const list = element("dl");
  const entries = [
    ["Checkpoint", checkpoint.id],
    ["Actor", provenance.actor],
    ["Producer", provenance.producer],
    ["Execution", provenance.executionClass],
    ["Observation", provenance.observationClass],
    ["Consent", provenance.trainingConsent],
    ["Revision", provenance.build.revision],
  ] as const;
  for (const [term, description] of entries) {
    list.append(element("dt", term), element("dd", description));
  }
  target.append(list);
}

function displayValue(value: unknown): string {
  return value === undefined ? "∅" : JSON.stringify(value);
}

function renderDiff(target: HTMLElement, differences: readonly StateForgeValueDiff[]): void {
  target.replaceChildren(element("strong", "Checkpoint diff"));
  if (differences.length === 0) {
    target.append(element("p", "No state differences."));
    return;
  }
  const list = element("ol");
  for (const entry of differences) {
    list.append(element("li", `${entry.path}: ${displayValue(entry.before)} → ${displayValue(entry.after)}`));
  }
  target.append(list);
}

function defaultDiff(
  checkpoints: readonly StateForgeCheckpointItem[],
  fromId: string,
  toId: string,
): readonly StateForgeValueDiff[] {
  const from = checkpoints.find((entry) => entry.id === fromId);
  const to = checkpoints.find((entry) => entry.id === toId);
  if (from === undefined || to === undefined) return Object.freeze([]);
  return diffStateForgeValues(from.state, to.state);
}

function createPanel(): HTMLElement {
  const panel = element("aside");
  panel.id = "tear-state-forge-studio";
  panel.setAttribute("aria-label", "State Forge Studio");
  Object.assign(panel.style, {
    position: "fixed", inset: "12px", zIndex: "2147483646", overflow: "auto",
    padding: "16px", color: "#e8f8ff", background: "rgba(5, 10, 18, .98)",
    border: "1px solid #36d6ff", font: "12px/1.4 ui-monospace, Consolas, monospace",
  });
  return panel;
}

function createElements(panel: HTMLElement, host: StateForgeStudioHost): StudioElements {
  const editor = element("textarea");
  editor.id = "tear-state-forge-editor";
  editor.value = host.initialSource;
  editor.rows = 20;
  editor.style.width = "100%";
  const status = element("p", "Ready.");
  status.setAttribute("role", "status");
  const reports = element("section");
  reports.setAttribute("aria-label", "Validation reports");
  const structural = element("article");
  const reachability = element("article");
  const plausibility = element("article");
  reports.append(structural, reachability, plausibility);
  const timeline = element("select");
  timeline.id = "tear-state-forge-timeline";
  const comparison = element("select");
  comparison.id = "tear-state-forge-comparison";
  const provenance = element("section");
  const diff = element("section");
  const forkId = element("input");
  forkId.placeholder = "fork-id";
  const forkPatch = element("textarea");
  forkPatch.value = "{}";
  forkPatch.rows = 5;
  const launch = element("button", "Launch scenario");
  launch.type = "button";
  panel.append(
    element("h2", "State Forge Studio"),
    labelledControl("Scenario editor", editor),
    status,
    reports,
    labelledControl("Timeline / checkpoint", timeline),
    labelledControl("Compare with", comparison),
    provenance,
    diff,
    labelledControl("Fork id", forkId),
    labelledControl("Fork state patch (JSON)", forkPatch),
  );
  return {
    editor, status, structural, reachability, plausibility, timeline, comparison,
    provenance, diff, forkId, forkPatch, launch,
  };
}

export function installStateForgeStudio(host: StateForgeStudioHost): HTMLElement | null {
  if (new URLSearchParams(window.location.search).get("stateforge") !== "1") return null;
  const existing = document.querySelector<HTMLElement>("#tear-state-forge-studio");
  if (existing !== null) return existing;
  const panel = createPanel();
  const controls = element("nav");
  controls.setAttribute("aria-label", "State Forge actions");
  Object.assign(controls.style, {
    display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center",
    position: "sticky", top: "0", zIndex: "1", paddingBlock: "6px",
    background: "rgba(5, 10, 18, .98)",
  });
  const parts = createElements(panel, host);
  let evaluation: StateForgeEvaluation = evaluateStateForgeSource(parts.editor.value, host.tearSdlLibrary());

  const selectedCheckpoint = (): StateForgeCheckpointItem | undefined =>
    host.checkpoints().find((entry) => entry.id === parts.timeline.value);
  const refreshCheckpoints = (): void => {
    const previous = parts.timeline.value;
    const checkpoints = host.checkpoints();
    for (const select of [parts.timeline, parts.comparison]) {
      select.replaceChildren(...checkpoints.map((entry) => {
        const option = element("option", `${String(entry.tick).padStart(6, "0")} · ${entry.label}`);
        option.value = entry.id;
        return option;
      }));
    }
    if (checkpoints.some((entry) => entry.id === previous)) parts.timeline.value = previous;
    if (checkpoints.length > 1) parts.comparison.value = checkpoints[0]?.id ?? "";
  };
  const refreshSelection = (): void => {
    const checkpoints = host.checkpoints();
    renderProvenance(parts.provenance, selectedCheckpoint());
    renderDiff(parts.diff, defaultDiff(checkpoints, parts.comparison.value, parts.timeline.value));
  };
  const validate = (): void => {
    evaluation = evaluateStateForgeSource(parts.editor.value, host.tearSdlLibrary());
    renderReport(parts.structural, "Structural", evaluation.reports.structural);
    renderReport(parts.reachability, "Reachability", evaluation.reports.reachability);
    renderReport(parts.plausibility, "Population plausibility", evaluation.reports.populationPlausibility);
    parts.launch.disabled = evaluation.resolved === undefined;
    parts.status.textContent = evaluation.resolved === undefined
      ? "Scenario is not launchable."
      : `Resolved ${evaluation.resolved.scenario.id} · ${evaluation.resolved.resolvedHash}`;
  };
  const importInput = element("input");
  importInput.type = "file";
  importInput.accept = ".json,.tearsdl,application/json";
  importInput.setAttribute("aria-label", "Import TearSDL");
  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    if (file === undefined) return;
    void file.text().then((source) => {
      parts.editor.value = source;
      validate();
    }, (error: unknown) => { parts.status.textContent = `Import failed: ${String(error)}`; });
  });
  controls.append(
    button("Validate", validate),
    importInput,
    button("Export", () => {
      host.exportScenario(`${evaluation.document?.id ?? "scenario"}.tearsdl.json`, parts.editor.value);
    }),
    button("Watch checkpoint", () => {
      const checkpoint = selectedCheckpoint();
      if (checkpoint === undefined) return;
      try {
        host.watch(checkpoint.id);
        parts.status.textContent = `Watching ${checkpoint.id} in the live runtime.`;
      } catch (error) {
        parts.status.textContent = `Watch failed: ${error instanceof Error ? error.message : "unknown error"}`;
      }
    }),
    parts.launch,
    button("Fork checkpoint", () => {
      const checkpoint = selectedCheckpoint();
      if (checkpoint === undefined) return;
      try {
        const patch = JSON.parse(parts.forkPatch.value) as unknown;
        if (!isRecord(patch)) {
          throw new TypeError("Fork patch must be a JSON object.");
        }
        const created = host.fork({ parentId: checkpoint.id, id: parts.forkId.value, patch });
        refreshCheckpoints();
        parts.timeline.value = created.id;
        refreshSelection();
        parts.status.textContent = `Forked ${created.id} from ${checkpoint.id}.`;
      } catch (error) {
        parts.status.textContent = `Fork failed: ${error instanceof Error ? error.message : "unknown error"}`;
      }
    }),
  );
  parts.launch.addEventListener("click", () => {
    if (evaluation.resolved === undefined) return;
    try {
      const created = host.launch(evaluation.resolved);
      refreshCheckpoints();
      parts.timeline.value = created.id;
      refreshSelection();
      parts.status.textContent = `Launched ${evaluation.resolved.scenario.id} as ${created.id}.`;
    } catch (error) {
      parts.status.textContent = `Launch failed: ${error instanceof Error ? error.message : "unknown error"}`;
    }
  });
  parts.timeline.addEventListener("change", refreshSelection);
  parts.comparison.addEventListener("change", refreshSelection);
  panel.insertBefore(controls, panel.children[1] ?? null);
  refreshCheckpoints();
  refreshSelection();
  validate();
  document.body.append(panel);
  return panel;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
