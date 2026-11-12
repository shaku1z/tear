import { describe, expect, it } from "vitest";
import { GhostLocalVault, GhostStreamingRecorder } from "../../src/ghost/capsule-vault";
import { createMemoryGhostVaultBackend } from "../../src/ghost/capsule-vault-backend";
import { GhostCapsuleReader } from "../../src/ghost/capsule-reader";
import { createGhostReplayRunContext } from "../../src/ghost/replay-admission";
import { createLiveGhostCausalEvent } from "../../src/ghost/live-causal-events";
import { CAREER_FILTERS, CAREER_VIEWS, defaultCareerNotes, emptyCareerQuery, legacyCareerRow, projectCareerEntry, provisionalCareerEntry, queryCareer } from "../../src/ghost/career-archive";
import { GhostCareerStore, careerKey } from "../../src/ghost/career-archive-store";
import { createBrowserGhostCareer } from "../../src/app/replay/browser-ghost-career";
import { createGhostCareerController, type CareerPort } from "../../src/app/library/ghost-career-controller";
import type { LiveGhostRecordingSessionState } from "../../src/app/replay/ghost-recording-session-state";
import type { StyleState } from "../../src/gameplay/scoring/style-runtime";
import type { GhostVaultBackend } from "../../src/ghost/capsule-vault";
import { RunDnaObserver } from "../../src/gameplay/runtime/run-dna-observer";

async function recorded(id: string, backend = createMemoryGhostVaultBackend()) {
  const vault = new GhostLocalVault(backend);
  const context = createGhostReplayRunContext({ runId: "career-run", seed: "career", mode: "endless", difficulty: "normal", weaponId: "sword", ticksPerSecond: 120,
    build: { version: "0.1.0", revision: "source-revision", target: "standalone", rulesetVersion: "1", contentHash: "content", configHash: "config" }, rng: { gameplay: { state: 1 } } });
  const recorder = new GhostStreamingRecorder({ sessionId: id, createdAt: "2026-10-20T12:00:00Z", vault, chunkEntries: 8, maxPendingWrites: 2, provenance: { replayContext: context } });
  await recorder.start();
  await recorder.append({ kind: "events", tick: 0, value: createLiveGhostCausalEvent({ kind: "run", tick: 0, transition: "started", runId: context.run.id, mode: "endless", difficulty: "normal", weaponId: "sword", wave: 1, score: 0, runTimeSeconds: 0 }, 1) });
  const manifest = await recorder.finalize("2026-10-20T12:01:00Z");
  return { backend, vault, manifest, capsule: await new GhostCapsuleReader(vault).read(id), context };
}

describe("durable personal Career Archive", () => {
  it("filters actual native maneuver uses independently of newer Career style coverage", async () => {
    const source = await recorded("native-uses"), observer = new RunDnaObserver(source.context.run.id, source.manifest.id);
    const body = { x: 0, y: 0, maxHp: 100 };
    observer.beginTick(1, body, { mode: "endless", weaponId: "sword" }); observer.eligible();
    observer.start("throw:1", "throw"); observer.end("throw:1"); observer.completeTick(1, body);
    const result = observer.capture(1), terminal = createLiveGhostCausalEvent({ kind: "run", tick: 1, transition: "abandoned", runId: source.context.run.id,
      mode: "endless", difficulty: "normal", weaponId: "sword", wave: 1, score: 0, runTimeSeconds: 1 / 120 }, 2);
    const capsule = { ...source.capsule, maxTick: 1, tracks: { ...source.capsule.tracks,
      results: [{ kind: "results" as const, tick: 1, value: result }], events: [...source.capsule.tracks.events, { kind: "events" as const, tick: 1, value: terminal }] } };
    const entry = projectCareerEntry(capsule, true), row = { entry, notes: defaultCareerNotes() };
    expect(entry.abilities).toEqual(["throw"]); expect(entry.style).toBeNull();
    expect(queryCareer([row], { ...emptyCareerQuery(), filters: { ability: "throw" } }).total).toBe(1);
    expect(queryCareer([row], { ...emptyCareerQuery(), filters: { ability: "swing" } }).total).toBe(0);
    expect(projectCareerEntry({ ...capsule, tracks: { ...capsule.tracks, results: [{ kind: "results", tick: 1,
      value: { ...result, capture: { ...result.capture, runId: "another-run" } } }] } }, true).abilities).toBeNull();
  });

  it("captures source-bound pre-cleanup facts, source categories and authored rank order; historical absence stays unknown", async () => {
    const source = await recorded("native-career"), results: { kind: "results"; tick: number; value: unknown }[] = [];
    let tick = 0; const run = { mods: { owned: {}, tier: {} } }, boss = { isBoss: true, bossId: "warden", hp: 8, maxHp: 100, dead: false, dying: false, practicePhaseEntry: () => ({ phase: 3 }) };
    const session = { recorder: () => ({ active: true, activeSessionId: source.manifest.id, record: (_kind: string, at: number, value: unknown) => results.push({ kind: "results", tick: at, value }) }), replayContext: () => source.context } as unknown as LiveGhostRecordingSessionState;
    const career = createBrowserGhostCareer(undefined, {} as Document, { session, run: () => run, tick: () => tick, enemies: () => [boss], actorId: () => "boss-1" });
    career.start(); tick = 1;
    const before: StyleState = { combo: 0, comboTimer: 0, lastTrick: "", mult: 1, rank: "", wavePeak: 1, runTime: 1 };
    const tuning = { pts: { parry: 10 }, variety: 1, decay: 1, drainRate: 1, hitLoss: 0, tiers: [{ at: 1, mult: 4, name: "FIRST" }, { at: 2, mult: 2, name: "LATER" }] };
    career.style("parry", before, { ...before, combo: 10, mult: 4, rank: "FIRST" }, tuning);
    career.style(undefined, before, { ...before, combo: 20, mult: 2, rank: "LATER" }, tuning);
    tick = 120; career.terminal("defeat"); boss.dead = true; boss.hp = 0;
    career.terminal("defeat"); career.style("parry", before, { ...before, combo: 99 }, tuning);
    const terminal = createLiveGhostCausalEvent({ kind: "run", tick, transition: "defeated", runId: source.context.run.id, mode: "endless", difficulty: "normal", weaponId: "sword", wave: 3, score: 200, runTimeSeconds: 1 }, 2);
    const entry = projectCareerEntry({ ...source.capsule, tracks: { ...source.capsule.tracks, results, events: [...source.capsule.tracks.events, { kind: "events", tick, value: terminal }] } }, true);
    expect(entry).toMatchObject({ gameVersion: "0.1.0", resumed: false, categories: ["unupgraded"], abilities: ["parry"], style: { rank: "LATER", rankOrdinal: 1, combo: 20, multiplier: 4 }, nearMiss: [{ boss: "warden", hp: 8, maxHp: 100, phase: 3 }] });
    expect(entry.witnesses).toHaveLength(4);
    const old = projectCareerEntry(source.capsule, true); expect(old.abilities).toBeNull(); expect(old.nearMiss).toBeNull(); expect(old.resumed).toBeNull();
    const abandoned = results.filter((r) => (r.value as { kind: string }).kind !== "terminal");
    tick = 0; career.start(); tick = 121; career.observe({ kind: "run", tick, transition: "abandoned", runId: source.context.run.id, mode: "endless", difficulty: "normal", weaponId: "sword", wave: 3, score: 200, runTimeSeconds: 1 });
    expect(abandoned.length).toBe(3); expect(results.at(-1)?.value).toMatchObject({ kind: "terminal", data: { outcome: "abandoned" } });
  });

  it("indexes all retained and legacy metadata, paginates all history, keeps unknown coverage and original legacy identity", async () => {
    const { backend, manifest } = await recorded("retained"), store = new GhostCareerStore(backend);
    await backend.put("manifests", "broken", "not JSON");
    const first = provisionalCareerEntry(manifest); expect(first.verified).toBe("unavailable"); await store.retain(first);
    const rows = [...await store.list(), legacyCareerRow({ id: "old-visual", ts: 1, pin: true, shareId: null, sum: { mode: "endless" } })];
    expect(legacyCareerRow({ id: "bad-date", ts: 1e100, pin: false, shareId: null, sum: {} }).entry.epoch).toBeNull();
    expect(rows).toHaveLength(2); expect(rows[1]?.entry).toMatchObject({ kind: "legacy-visual", root: "", verified: "unavailable", score: null });
    const many = Array.from({ length: 20 }, (_, i) => ({ entry: { ...first, id: `source-${String(i)}`, epoch: i }, notes: defaultCareerNotes() }));
    const found = new Set<string>(); for (let page = 0; page < 7; page++) queryCareer(many, { ...emptyCareerQuery(), page }, 3).rows.forEach((row) => found.add(row.entry.id));
    expect(found.size).toBe(20); expect(CAREER_FILTERS).toHaveLength(18); expect(CAREER_VIEWS).toHaveLength(10);
    expect(queryCareer(rows, { ...emptyCareerQuery(), filters: { ability: "unknown", verified: "unavailable" } }).total).toBe(2);
    const changed = { ...manifest, completedAt: "2026-10-20T13:00:00Z" }; await backend.put("manifests", manifest.id, JSON.stringify(changed));
    expect((await store.list()).find((r) => r.entry.id === manifest.id)?.entry.enriched).toBe(false);
  });

  it("keeps separate comparable boss reports from one source and ordered available DNA quantities", async () => {
    const { manifest } = await recorded("history"), base = provisionalCareerEntry(manifest);
    const clear = (key: string, boss: string, ticks: number) => ({ key, boss, ticks, spawn: `${boss}-spawn`, defeat: `${boss}-defeat` });
    const first = { entry: { ...base, enriched: true, epoch: 1, id: "first", bossClears: [clear("w", "warden", 100), clear("c", "colossus", 200)], dna: { mobility: .2 } }, notes: defaultCareerNotes() };
    const later = { entry: { ...base, enriched: true, epoch: 2, id: "later", bossClears: [clear("w", "warden", 80), clear("c", "colossus", 140)], dna: { mobility: .3 } }, notes: defaultCareerNotes() };
    const reports = queryCareer([first, later], { ...emptyCareerQuery(), view: "boss-change" }).rows;
    expect(reports.map((row) => row.detail)).toEqual([expect.stringContaining("colossus: 200 → 140"), expect.stringContaining("warden: 100 → 80")]);
    expect(reports.every((row) => row.entry.id === "later" && row.detail?.includes("n=2"))).toBe(true);
    const dna = queryCareer([later, first], { ...emptyCareerQuery(), view: "dna-evolution" }).rows;
    expect(dna.map((row) => row.entry.id)).toEqual(["first", "later"]); expect(dna[0]?.detail).toContain("mobility=0.2"); expect(dna[1]?.detail).toContain("precision=unavailable");
  });

  it("persists annotations/protection, refuses foreign holds and source replacement during deletion CAS", async () => {
    const { backend, manifest } = await recorded("owned"), store = new GhostCareerStore(backend), entry = provisionalCareerEntry(manifest);
    await store.retain(entry); const pinned = await store.annotate(entry, defaultCareerNotes(), ["remember", "remember"], "pinned");
    expect((await new GhostCareerStore(backend).list())[0]?.notes).toMatchObject({ tags: ["remember"], retention: "pinned", revision: 1 });
    expect(await new GhostLocalVault(backend).enforceQuota(0, {})).toEqual([]);
    let replace = false;
    const racing: GhostVaultBackend = { ...backend, commitIfMatches: async (guards, writes) => { if (replace) { replace = false; await backend.put("manifests", entry.id, JSON.stringify({ ...manifest, completedAt: "changed" })); } return backend.commitIfMatches(guards, writes); } };
    replace = true; await expect(new GhostCareerStore(racing).remove(entry, pinned)).rejects.toThrow();
    expect(await backend.get("indexes", careerKey(entry.id, entry.root))).toBeDefined();
    await backend.put("manifests", entry.id, JSON.stringify(manifest));
    await backend.put("analysis", `ghost-capsule-protection:v1:${entry.id}`, JSON.stringify({ format: "ghost-capsule-protection", schemaVersion: 1, capsuleId: entry.id, rootIntegrity: entry.root, owners: ["another-owner"] }));
    await expect(store.remove(entry, pinned)).rejects.toThrow();
    await backend.remove("analysis", `ghost-capsule-protection:v1:${entry.id}`); await store.remove(entry, pinned);
    expect(await new GhostLocalVault(backend).getManifest(entry.id)).toBeUndefined(); expect(await store.list()).toEqual([]);
  });

  it("cancels enrichment and ignores late catalog results after exit/reselection", async () => {
    const { manifest } = await recorded("late"), entry = provisionalCareerEntry(manifest);
    let resolve: ((rows: readonly { entry: typeof entry; notes: ReturnType<typeof defaultCareerNotes> }[]) => void) | undefined, stopped = 0;
    const port: CareerPort = { list: () => new Promise((done) => { resolve = done; }), index: () => () => { stopped++; }, current: () => Promise.resolve(true), annotate: () => Promise.resolve(), remove: () => Promise.resolve(), text: { edit: () => undefined, close: () => undefined } };
    const controller = createGhostCareerController(port); controller.open(); controller.close(); resolve?.([{ entry, notes: defaultCareerNotes() }]); await Promise.resolve();
    expect(controller.snapshot().retained).toBe(0); expect(stopped).toBe(1);
    const b = { ...entry, id: "second", manifestHash: "second-hash" }; let check: ((value: boolean) => void) | undefined, opened = 0;
    const current = createGhostCareerController({ ...port, list: () => Promise.resolve([{ entry, notes: defaultCareerNotes() }, { entry: b, notes: defaultCareerNotes() }]), current: () => new Promise((done) => { check = done; }) });
    current.open(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); current.select(careerKey(entry.id, entry.root));
    const opening = current.sourceAction(() => { opened++; }); current.select(careerKey(b.id, b.root)); check?.(true); await opening;
    expect(opened).toBe(0); current.close();
  });
});
