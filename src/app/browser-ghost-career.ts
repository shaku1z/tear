import { parseGhostCapsuleManifest } from "../ghost/capsule-vault";
import { stableVerificationHash } from "../replay/hash";
import { UPGRADES } from "../gameplay/upgrades";
import type { StyleState, TrickTuning } from "../gameplay/scoring/style-runtime";
import type { TearGameplayEvent } from "../gameplay/runtime/gameplay-events";
import { careerObject, type CareerEntry, type CareerNotes, type CareerRetention } from "../ghost/career-archive";
import { GhostCareerStore } from "../ghost/career-archive-store";
import { createIndexedDbGhostVaultBackend } from "../ghost/indexeddb-vault-backend";

import type { LiveGhostRecordingSessionState } from "./live-ghost-recording-session-state";
import { createCareerTextPort } from "./browser-ghost-career-search";
import type { CareerPort } from "./ghost-career-controller";

export interface CareerLivePorts {
  readonly session: LiveGhostRecordingSessionState;
  run(): object; tick(): number; enemies(): readonly object[]; actorId(actor: object): string;
}
/** Local-only metadata and passive recording composition; no profile/account mutations. */
export function createBrowserGhostCareer(factory: IDBFactory | undefined, document: Document, live: CareerLivePorts) {
  let promise: Promise<GhostCareerStore> | undefined;
  const store = () => { if (!factory) return Promise.reject(new Error("Local Career storage unavailable")); return promise ??= createIndexedDbGhostVaultBackend(factory).then((backend) => new GhostCareerStore(backend)); };
  let bound: Readonly<{ id: string; runId: string; run: object }> | undefined, styles = 0, truncated = false, ended = false, peakCombo = 0, peakMult = 1, peakRank = -1;
  const loadout = () => { const mods = careerObject(careerObject(live.run()).mods), tiers = careerObject(mods.tier); return Object.entries(careerObject(mods.owned)).filter(([, count]) => typeof count === "number" && count > 0).map(([id, count]) => ({ id, count, tier: typeof tiers[id] === "number" ? tiers[id] : 1 })).sort((a, b) => a.id.localeCompare(b.id)); };
  const write = (kind: "coverage" | "style" | "terminal" | "boss", data: Readonly<Record<string, unknown>>) => {
    const recorder = live.session.recorder();
    if (!bound || recorder?.active !== true || recorder.activeSessionId !== bound.id || live.run() !== bound.run || live.session.replayContext()?.run.id !== bound.runId) return;
    const tick = live.tick(); recorder.record("results", tick, { format: "tearghost-career-witness", version: 1, kind, sessionId: bound.id, runId: bound.runId, tick, data });
  };
  const terminal = (outcome: "defeat" | "victory" | "abandoned") => {
    if (ended) return; ended = true;
    const bosses = live.enemies().flatMap((raw) => {
      const actor = raw as { bossId?: string; isBoss?: boolean; isMirrorBoss?: boolean; hp?: number; maxHp?: number; dead?: boolean; dying?: boolean; practicePhaseEntry?: () => { phase: number } };
      const boss = actor.bossId ?? (actor.isMirrorBoss === true ? "echo" : undefined);
      if (actor.isBoss !== true || typeof actor.practicePhaseEntry !== "function" || typeof boss !== "string") return [];
      return [{ id: live.actorId(raw), boss, phase: actor.practicePhaseEntry().phase, hp: actor.hp ?? null, maxHp: actor.maxHp ?? null, dead: actor.dead === true, dying: actor.dying === true }];
    });
    write("terminal", { outcome, styles: Math.min(styles, 16384), truncated, loadout: loadout(), bosses });
  };
  const port: CareerPort = {
    text: createCareerTextPort(document),
    async usage() {
      const storage = await store(), all = new Map<string, number>(), held = new Map<string, number>();
      for (const id of await storage.backend.keys("manifests")) try { const raw = await storage.backend.get("manifests", id); if (!raw) continue; const manifest = parseGhostCapsuleManifest(JSON.parse(raw));
        const protectedSource = await storage.backend.get("analysis", `ghost-capsule-protection:v1:${id}`) !== undefined;
        manifest.chunks.forEach((chunk) => { all.set(chunk.id, chunk.compressedBytes); if (protectedSource) held.set(chunk.id, chunk.compressedBytes); });
      } catch { /* Bad source metadata contributes no invented bytes. */ }
      const estimate = await document.defaultView?.navigator.storage.estimate().catch(() => undefined);
      return { recordedChunkBytes: [...all.values()].reduce((a, b) => a + b, 0), protectedChunkBytes: [...held.values()].reduce((a, b) => a + b, 0), browserQuota: estimate?.quota ?? null, browserUsage: estimate?.usage ?? null, pendingBytes: null, profileBytes: null, assetCacheBytes: null, analysisCacheBytes: null };
    },
    async list(signal) { return (await store()).list(signal); },
    index(changed, failed) {
      if (typeof Worker === "undefined") { failed("Background indexing unavailable; metadata remains searchable."); return () => undefined; }
      let stopped = false; const worker = new Worker(new URL("../ghost/career-archive-worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ progress?: string; complete?: boolean; error?: string }>) => { if (stopped) return; if (event.data.error) { failed(event.data.error); worker.terminate(); }
        else if (event.data.complete) { changed(); failed("Indexing complete. Unknown historical facts remain unavailable."); worker.terminate(); } else changed(); };
      worker.onerror = () => { failed("Background indexing refused; metadata remains available."); worker.terminate(); }; worker.postMessage({ id: 1 }); return () => { stopped = true; worker.terminate(); };
    },
    async current(entry) { const raw = await (await store()).backend.get("manifests", entry.id); return raw !== undefined && stableVerificationHash(JSON.parse(raw)) === entry.manifestHash; },
    async annotate(entry: CareerEntry, notes: CareerNotes, tags: readonly string[], retention: CareerRetention) { await (await store()).annotate(entry, notes, tags, retention); },
    async remove(entry, notes) { await (await store()).remove(entry, notes); },
  };
  return Object.freeze({ port,
    observe(event: TearGameplayEvent) { if (event.kind === "run" && event.transition === "abandoned") terminal("abandoned"); if (event.kind === "spawn" && event.bossId) write("boss", { actorId: event.actorId, boss: event.bossId, variant: event.variantId ?? null, encounter: event.actorKind, loadout: loadout() }); },
    start() {
      const recorder = live.session.recorder(), context = live.session.replayContext(); styles = 0; truncated = false; ended = false; peakCombo = 0; peakMult = 1; peakRank = -1;
      bound = recorder?.active === true && context && live.tick() === 0 ? { id: recorder.activeSessionId, runId: context.run.id, run: live.run() } : undefined;
      write("coverage", { catalog: UPGRADES.map(({ id, cat }) => ({ id, cat })), catalogHash: stableVerificationHash(UPGRADES.map(({ id, cat }) => ({ id, cat }))), policy: "native-career-v1", buildHash: context ? stableVerificationHash(context.build) : "", origin: 0 });
    },
    style(technique: string | undefined, _before: StyleState, after: StyleState, tuning: TrickTuning) {
      if (ended || !bound) return;
      const ordinal = tuning.tiers.findIndex((tier) => tier.name === after.rank);
      if (technique === undefined && after.combo <= peakCombo && after.mult <= peakMult && ordinal <= peakRank) return;
      peakCombo = Math.max(peakCombo, after.combo); peakMult = Math.max(peakMult, after.mult); peakRank = Math.max(peakRank, ordinal);
      if (++styles > 16384) { truncated = true; return; }
      write("style", { accepted: technique !== undefined && Object.hasOwn(tuning.pts, technique), technique: technique ?? "", combo: after.combo, multiplier: after.mult, rank: after.rank, tuningHash: stableVerificationHash(tuning), ranks: tuning.tiers.map(({ at, mult, name }) => ({ at, mult, name })) });
    },
    terminal,
  });
}
