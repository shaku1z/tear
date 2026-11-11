import { careerRowKey, CAREER_FILTERS, CAREER_VIEWS, emptyCareerQuery, queryCareer, type CareerUsage, type CareerEntry, type CareerNotes, type CareerRetention, type CareerRow } from "../ghost/career-archive";
import type { CareerTextPort } from "./browser-ghost-career-search";

export interface CareerPort {
  usage?(): Promise<CareerUsage>;
  list(signal: AbortSignal): Promise<readonly CareerRow[]>;
  index(changed: () => void, failed: (message: string) => void): () => void;
  current(entry: CareerEntry): Promise<boolean>;
  annotate(entry: CareerEntry, notes: CareerNotes, tags: readonly string[], retention: CareerRetention): Promise<void>;
  remove(entry: CareerEntry, notes: CareerNotes): Promise<void>;
  readonly text: CareerTextPort;
}
export function createGhostCareerController(port: CareerPort) {
  let rows: readonly CareerRow[] = [], query = emptyCareerQuery(), selected: string | undefined, status: "idle" | "loading" | "ready" | "failed" = "idle", message = "", indexing = false;
  let usage: CareerUsage | undefined;
  let generation = 0, operation: AbortController | undefined, stop: (() => void) | undefined, confirming = false;
  const refresh = async () => {
    const ticket = generation, signal = operation?.signal; if (!signal) return;
    try { const [values, measured] = await Promise.all([port.list(signal), port.usage?.().catch(() => undefined)]); if (ticket !== generation || signal.aborted) return; rows = values; usage = measured; status = "ready"; }
    catch (error) { if (ticket === generation && !signal.aborted) { status = "failed"; message = error instanceof Error ? error.message : "Career unavailable"; } }
  };
  const choose = () => queryCareer(rows, query, 3).rows.find((row) => careerRowKey(row) === selected) ?? rows.find((row) => careerRowKey(row) === selected);
  const mutate = async (callback: (row: CareerRow) => Promise<void>) => {
    const row = choose(), ticket = generation; if (!row) return;
    try { await callback(row); if (ticket === generation) { message = "Saved on this device."; await refresh(); } }
    catch (error) { if (ticket === generation) message = error instanceof Error ? error.message : "Career action refused"; }
  };
  return Object.freeze({
    open() { if (status !== "idle" && operation && !operation.signal.aborted) return; generation++; operation?.abort(); operation = new AbortController(); status = "loading"; void refresh();
      indexing = true; stop = port.index(() => { void refresh(); }, (reason) => { indexing = false; message = reason; void refresh(); }); },
    close() { generation++; operation?.abort(); stop?.(); stop = undefined; port.text.close(); indexing = false; },
    snapshot() { const result = queryCareer(rows, query, 3); return Object.freeze({ status, indexing, message, query, ...(usage ? { usage } : {}), ...result, selected: choose(), confirming, retained: rows.length, known: rows.filter(({ entry }) => entry.enriched).length }); },
    select(key: string) { selected = key; confirming = false; },
    control(command: string) {
      if (command === "search") { const ticket = generation; port.text.edit("SEARCH YOUR RUNS", { search: query.text, ...Object.fromEntries(CAREER_FILTERS.map((key) => [key, query.filters[key] ?? ""])) }, (fields) => {
        if (ticket !== generation) return; const filters = Object.fromEntries(CAREER_FILTERS.flatMap((key) => fields[key] ? [[key, fields[key]]] : [])); query = { ...query, text: fields.search ?? "", filters, page: 0 }; }); }
      else if (command === "back") { selected = undefined; confirming = false; }
      else if (command === "clear") query = emptyCareerQuery();
      else if (command === "next" || command === "previous") query = { ...query, page: Math.max(0, query.page + (command === "next" ? 1 : -1)) };
      else if (command === "view") query = { ...query, page: 0, view: CAREER_VIEWS[(CAREER_VIEWS.indexOf(query.view) + 1) % CAREER_VIEWS.length] ?? "history" };
      else if (command === "sort") query = { ...query, page: 0, sort: query.sort === "newest" ? "oldest" : query.sort === "oldest" ? "score" : "newest" };
      else if (command === "tags") { const row = choose(), ticket = generation; if (!row) return;
        port.text.edit("TAGS", { tags: row.notes.tags.join(", ") }, (fields) => { if (ticket === generation && choose()?.entry.manifestHash === row.entry.manifestHash && choose()?.notes.revision === row.notes.revision) void mutate((current) => port.annotate(current.entry, current.notes, (fields.tags ?? "").split(","), current.notes.retention)); }); }
      else if (command === "pin") void mutate((row) => port.annotate(row.entry, row.notes, row.notes.tags, row.notes.retention === "pinned" ? "recent" : "pinned"));
      else if (command === "retention") { const row = choose(), ticket = generation; if (!row) return;
        port.text.edit("KEEP THIS RUN", { retention: row.notes.retention }, (fields) => { if (ticket === generation && choose()?.entry.manifestHash === row.entry.manifestHash && choose()?.notes.revision === row.notes.revision) void mutate((current) => port.annotate(current.entry, current.notes, current.notes.tags, fields.retention as CareerRetention)); }); }
      else if (command === "delete") confirming = true;
      else if (command === "cancel-delete") confirming = false;
      else if (command === "confirm-delete") { confirming = false; void mutate((row) => port.remove(row.entry, row.notes)); }
      else if (command === "refresh") { void refresh(); }
    },
    async sourceAction(action: (id: string) => unknown) {
      const row = choose(), ticket = generation, identity = selected; if (!row) return;
      try { if (!row.entry.present || !await port.current(row.entry)) { if (ticket === generation && identity === selected) message = "This run changed or is no longer on this device — reopen the list and try again."; return; }
      if (ticket !== generation || identity !== selected) return; stop?.(); operation?.abort(); port.text.close(); indexing = false; await action(row.entry.id); } catch (error) { if (ticket === generation) { message = error instanceof Error ? error.message : "Source action refused"; operation = new AbortController(); } }
    },
  });
}
