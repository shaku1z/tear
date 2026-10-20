import type { GhostRunAssistance } from "../gameplay/run/ghost-assistance";
import type { GhostLiveReference, GhostReferenceFrame, GhostChaseView } from "../ghost/live-ghost-reference-data";

export interface GhostChaseLiveState { readonly runId: number; readonly mode: string; readonly difficulty: string; readonly weapon: string;
  readonly time: number; readonly waveTime: number; readonly wave: number; readonly stage: number; readonly score: number; readonly hp: number; readonly maxHp: number;
  readonly arena: string; readonly blocked: boolean; readonly assistance?: GhostRunAssistance; }
interface ChasePorts { prepare(id: string, signal: AbortSignal): Promise<GhostLiveReference>; current(source: GhostRunAssistance): Promise<boolean>;
  start(reference: GhostLiveReference): void; }
/** Reference state never supplies a live action, actor, random value or clock. */
export function createLiveGhostReferenceController(ports: ChasePorts) {
  let reference: GhostLiveReference | undefined, selected: GhostReferenceFrame | undefined, owner: AbortController | undefined, generation = 0;
  let starting = false, pending: GhostRunAssistance | undefined, boundRun: number | undefined, visible = true, message = "", lastWave = "", checking = false;
  let timeDelta: number | undefined, split: string | undefined;
  let byWave = new Map<string, readonly GhostReferenceFrame[]>(), cursor = 0, elapsedCursor = 0, elapsed: GhostReferenceFrame | undefined;
  const cancelPreparation = () => { if (owner) { owner.abort(); owner = undefined; generation++; } };
  const stop = (reason = "") => { cancelPreparation(); generation++; reference = selected = undefined; elapsed = undefined; byWave.clear(); pending = undefined; boundRun = undefined; message = reason; lastWave = ""; timeDelta = undefined; split = undefined; checking = false; };
  return Object.freeze({
    async choose(id: string, expectedManifestHash?: string): Promise<void> {
      stop(); const ticket = generation, signal = new AbortController(); owner = signal; message = "Preparing verified reference…";
      try {
        const value = await ports.prepare(id, signal.signal);
        if (value.assistance.sourceId !== id || expectedManifestHash !== undefined && value.assistance.sourceManifestHash !== expectedManifestHash) throw new Error("Selected reference identity changed.");
        if (signal.signal.aborted || ticket !== generation || !await ports.current(value.assistance)) { if (ticket === generation) message = "Reference custody changed."; return; }
        if (ticket !== generation) return;
        owner = undefined; reference = value; visible = true; message = "Independent seed and choices · assisted / noncompetitive"; pending = value.assistance;
        const groups = new Map<string, GhostReferenceFrame[]>(); cursor = elapsedCursor = 0;
        for (const frame of value.frames) { const key = `${String(frame.stage)}:${String(frame.wave)}`; const group = groups.get(key); if (group) group.push(frame); else groups.set(key, [frame]); }
        byWave = groups;
        starting = true; try { ports.start(value); } finally { starting = false; pending = undefined; }
      } catch (error) { if (ticket === generation) stop(error instanceof Error ? error.message : "Reference unavailable."); }
    },
    cancelPreparation,
    assistance: () => pending,
    installed(seed: number): void { if (starting && reference) boundRun = seed; else stop(); },
    configuration(hash: string): void { if (reference && reference.build.configHash !== hash) stop("Different live configuration; reference unavailable. This run remains assisted."); },
    stop,
    toggle(): void { if (reference) visible = !visible; },
    boundary(live: GhostChaseLiveState, event: "start" | "clear"): void {
      if (!reference || boundRun !== live.runId) return;
      const boundary = reference.splits.find((s) => s.stage === live.stage && s.wave === live.wave && s.event === event);
      if (boundary) { timeDelta = live.time - boundary.time; split = `Wave ${String(live.wave)} ${event} · live minus reference`; }
    },
    observe(live: GhostChaseLiveState): void {
      if (!reference) return;
      if (boundRun !== live.runId || live.assistance?.sourceManifestHash !== reference.assistance.sourceManifestHash) { stop(); return; }
      if (live.mode !== reference.mode || live.difficulty !== reference.difficulty || live.weapon !== reference.weapon) { stop("Reference category changed."); return; }
      const key = `${String(live.stage)}:${String(live.wave)}`;
      if (key !== lastWave) {
        lastWave = key; cursor = 0;
        const captured = reference, ticket = generation;
        if (!checking) { checking = true; void ports.current(captured.assistance).then((ok) => { if (!ok && generation === ticket) stop("Reference source changed or is unavailable."); }, () => { if (generation === ticket) stop("Reference custody unavailable."); }).finally(() => { if (generation === ticket) checking = false; }); }
      }
      while (elapsedCursor + 1 < reference.frames.length && (reference.frames[elapsedCursor + 1]?.time ?? Infinity) <= live.time) elapsedCursor++;
      elapsed = live.time <= (reference.frames.at(-1)?.time ?? -1) ? reference.frames[elapsedCursor] : undefined;
      const candidates = byWave.get(key) ?? [];
      while (cursor + 1 < candidates.length && (candidates[cursor + 1]?.waveTime ?? Infinity) <= live.waveTime) cursor++;
      selected = (candidates[cursor]?.waveTime ?? Infinity) <= live.waveTime ? candidates[cursor] : undefined;
      if (!selected || selected.blocked || live.blocked || selected.arena !== live.arena || live.waveTime > (candidates.at(-1)?.waveTime ?? -1)) {
        selected = undefined; message = "Different encounter / reference coverage — projection unavailable. Shared splits retained.";
      } else message = "Independent seed and choices · assisted / noncompetitive";
    },
    snapshot(live?: GhostChaseLiveState): GhostChaseView {
      return Object.freeze({ active: reference !== undefined, visible, message, ...(reference ? { source: reference.assistance.sourceId, actor: reference.assistance.actor } : {}),
        ...(selected && live ? { ...(visible ? { pose: selected } : {}), score: live.score - selected.score, hp: live.hp - selected.hp,
          ownHp: `${live.hp.toFixed(0)}/${live.maxHp.toFixed(0)}`, referenceHp: `${selected.hp.toFixed(0)}/${selected.maxHp.toFixed(0)}` } : {}),
        ...(live && reference && elapsed ? { wave: live.wave - elapsed.wave } : {}),
        ...(timeDelta === undefined || split === undefined ? {} : { time: timeDelta, split }) });
    },
  });
}
