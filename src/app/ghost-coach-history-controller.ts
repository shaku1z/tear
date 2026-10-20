import { checkGhostCoachSelection, ghostCoachRequestHash, type GhostCoachCandidate, type GhostCoachHistory, type GhostCoachMoment, type GhostCoachHistoryView } from "../ghost/coach-history";

export interface GhostCoachHistoryTask { readonly result: Promise<GhostCoachHistory>; cancel(): void }
export interface GhostCoachHistoryPort {
  list(): Promise<readonly GhostCoachCandidate[]>;
  current(sources: readonly GhostCoachCandidate[]): Promise<boolean>;
  analyze(sources: readonly GhostCoachCandidate[]): GhostCoachHistoryTask;
}

/** One session-scoped job. Selection/exit invalidates both async output and pending actions. */
export function createGhostCoachHistoryController(port: GhostCoachHistoryPort) {
  let generation = 0, target: GhostCoachCandidate | undefined, task: GhostCoachHistoryTask | undefined;
  let candidates: readonly GhostCoachCandidate[] = [], selected: readonly string[] = [], result: GhostCoachHistory | undefined;
  let message = "Select distinct compatible local recordings.", busy = false, page = 0, metric = 0, moment = 0, details = false, selection = true, rows = 0, section = 0;
  const cancel = () => { generation++; task?.cancel(); task = undefined; busy = false; result = undefined; };
  const selectedSources = () => target === undefined ? [] : [target, ...selected.flatMap((id) => candidates.find((source) => source.id === id) ?? [])];
  return Object.freeze({
    async open(source: GhostCoachCandidate): Promise<void> {
      cancel(); target = source; selected = []; candidates = []; page = metric = moment = 0; details = false; selection = true; rows = 0;
      const ticket = generation;
      try {
        const listed = await port.list();
        if (ticket !== generation) return;
        candidates = listed.filter((candidate) => candidate.id !== source.id && candidate.eligible && candidate.compatibility === source.compatibility);
        message = source.eligible ? "Select runs to compare recorded observations. No run is selected automatically." : source.reason;
      } catch { if (ticket === generation) message = "Local recording list unavailable."; }
    },
    async toggle(id: string): Promise<void> {
      if (!target?.eligible || !candidates.some((candidate) => candidate.id === id)) return;
      cancel(); selected = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
      const sources = selectedSources(), ticket = generation;
      if (selected.length === 0) { message = "Select at least one other recording."; return; }
      try {
        checkGhostCoachSelection(sources); busy = true; message = "Reading and verifying only selected recordings…";
        task = port.analyze(sources);
        const output = await task.result;
        if (ticket !== generation) return;
        if (output.targetId !== target.id || output.requestHash !== ghostCoachRequestHash(sources) || !(await port.current(sources))) throw new TypeError("Selected recording changed; select it again.");
        if (ticket !== generation) return;
        result = output; moment = 0; selection = false; rows = 0; message = "Selected recordings · descriptive history, not a skill score.";
      } catch (error) { if (ticket === generation) message = error instanceof Error ? error.message : "History unavailable."; }
      finally { if (ticket === generation) { task?.cancel(); task = undefined; busy = false; } }
    },
    async action(id: string, run: (moment: GhostCoachMoment) => void): Promise<void> {
      const output = result, ticket = generation, found = output?.moments.find((entry) => entry.id === id);
      if (output === undefined || found === undefined) return;
      try { if (!(await port.current(output.sources))) { if (ticket === generation) { cancel(); message = "Selected recording changed; select it again."; } return; }
      if (ticket === generation && result === output) run(found);
      } catch { if (ticket === generation) { cancel(); message = "Recording identity could not be checked. Select again."; } }
    },
    close(): void { cancel(); target = undefined; candidates = []; selected = []; },
    page(delta: number): void { page = Math.max(0, Math.min(candidates.length - 1, page + delta)); },
    metric(delta: number): void { metric = (metric + delta + 8) % 8; moment = rows = 0; },
    moment(delta: number): void { moment = Math.max(0, moment + delta); },
    details(): void { details = !details; selection = false; rows = 0; },
    sources(): void { selection = !selection; details = false; },
    section(value: number): void { section = Math.max(0, Math.min(2, value)); },
    rows(delta: number): void { rows = Math.max(0, Math.min(2 * (result?.sources.length ?? 0) + 5, rows + delta)); },
    snapshot(): GhostCoachHistoryView {
      const measurement = result?.metrics[metric], cited = result?.moments.filter((entry) => entry.metric === measurement?.id) ?? [];
      moment = Math.min(moment, Math.max(0, cited.length - 1));
      return Object.freeze({ targetId: target?.id ?? "", candidates, selected, result, message, busy, page, metric, details, selection, rows, section,
        measurement, cited: cited[moment], moment, momentCount: cited.length });
    },
  });
}
