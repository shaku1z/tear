import { describe, it, expect } from "vitest";
import { createProductionGhostReplayComposition, captureProductionReplayCheckpoint, restoreProductionReplaySnapshot } from "../../src/tearbench/production-replay-composition";
import { stableVerificationHash } from "../../src/replay/hash";
import { GhostLocalVault, createMemoryGhostVaultBackend } from "../../src/ghost/capsule-vault";
import { GhostCapsuleReader } from "../../src/ghost/capsule-reader";
import { GhostLiveRecorder } from "../../src/ghost/live-recorder";
import { createLiveGhostFrameRecording } from "../../src/app/live-ghost-frame-recording";
import { createLiveGhostFinaleCompanion } from "../../src/app/live-ghost-finale-companion";
import { createGhostReplayRunContext } from "../../src/ghost/replay-admission";
import { GHOST_APPLICATION_FRAMES_V1 } from "../../src/ghost/application-frame-events";
import { createGhostAuthoritativeReceipt } from "../../src/ghost/authoritative-receipt";
import { createGameplayCausalEvent } from "../../src/tearbench/gameplay-causal-events";
import { TearGameplayEventBus } from "../../src/gameplay/runtime/gameplay-events";
import { projectProductionReplayCanonicalState } from "../../src/tearbench/production-replay-composition";
import { admitGhostFinaleCompanion, readGhostFinaleCompanion } from "../../src/ghost/finale-companion";
import { createGhostFinalePlayback } from "../../src/ghost/finale-playback";
import { CAMPAIGN_STAGE_IDS, stageAt } from "../../src/gameplay/stages";
import { LegacyGhostEngine } from "../../src/replay/legacy-compat";

function finaleSource() {
  const source = createProductionGhostReplayComposition({ seed: "constructed-finale-owner", mode: "campaign" }).create(undefined);
  source.replay.world.context.cinema.complete();
  Object.assign(source.replay.configuration.value.finale, { silence: 0.02, wound: 0.02, relics: 0.02, cutAutoAt: 0.02, cutAutoStep: 0.02, restorationMin: 0.02, epilogueReveal: 0.02, rewardHold: 0.02 });
  // Engineered direct owner boundary, not natural wave-60 or whole-run evidence.
  source.replay.finale.runtime.start();
  source.simulation.advanceOne([]);
  return source;
}
function step(source: ReturnType<typeof finaleSource>, count: number) {
  for (let index = 0; index < count; index++) {
    source.advanceApplicationFrame(1 / 60, { key: false, touch: false, pad: false, click: true });
    if (source.waveReward.screen() === "playing") source.simulation.advanceOne([]);
  }
}
function witness(source: ReturnType<typeof finaleSource>) {
  return { finale: source.replay.finale.runtime.captureBinding(), cinema: source.replay.world.context.cinema.captureState(), cinemaInput: source.replay.world.context.cinema.captureRecordedInput(), lifecycle: source.replay.world.lifecycle.snapshot(),
    player: { x: source.replay.world.state.player()?.x, y: source.replay.world.state.player()?.y, vy: source.replay.world.state.player()?.vy },
    rng: source.replay.world.context.services.random.snapshot(), clock: source.replay.world.context.services.clock.seconds() };
}

describe("source-linked finale continuation", () => {
  it("restores actual controller/director bytes and continues cuts, gravity, landing and completion without re-preparing scored victory", () => {
    const source = finaleSource(); step(source, 5);
    const captured = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "constructed-mid-finale");
    const restored = createProductionGhostReplayComposition({ seed: "fresh-detached", inputSnapshots: new Map([[captured.snapshot.tick, captured.input]]) }).create(captured.snapshot);
    expect(witness(restored)).toEqual(witness(source));
    const scored = source.replay.world.state.run()?._victoryPrepared;
    for (let index = 0; index < 180; index++) { step(source, 1); step(restored, 1); expect(witness(restored)).toEqual(witness(source)); if (source.waveReward.screen() === "win") break; }
    expect(source.waveReward.screen()).toBe("win"); expect(restored.waveReward.screen()).toBe("win");
    expect(source.replay.world.state.run()?._victoryPrepared).toEqual(scored);
    expect(restored.outcome.outward).not.toContain("persistFinale");
    expect(restored.outcome.outward.filter((value) => value === "present:victory")).toHaveLength(1);
  });

  it("clears an outgoing finale on ordinary restore and rejects malformed behavior before changing its destination", () => {
    const source = finaleSource(), ordinary = createProductionGhostReplayComposition({ seed: "ordinary" }).create(undefined);
    const baseline = captureProductionReplayCheckpoint(ordinary.replay, ordinary.combat, ordinary.waveReward, "ordinary");
    restoreProductionReplaySnapshot(source.replay, baseline.snapshot);
    expect(source.replay.finale.runtime.captureBinding()).toBeNull();
    const bad = finaleSource(), invalid = structuredClone(captureProductionReplayCheckpoint(bad.replay, bad.combat, bad.waveReward, "bad-fixture").snapshot);
    const runtime = (invalid.state["tear.world.v1"] as Record<string, unknown>).runtime as Record<string, unknown>;
    const saved = runtime.finaleBinding as { state: { severed: number } };
    saved.state.severed = 99;
    const before = stableVerificationHash(witness(source));
    expect(() => restoreProductionReplaySnapshot(source.replay, invalid)).toThrow();
    expect(stableVerificationHash(witness(source))).toBe(before);
  });

  it("rebuilds the real Source descent binding and continues its shared void stream instead of refusing it", () => {
    const source = createProductionGhostReplayComposition({ seed: "constructed-source-descent", mode: "campaign" }).create(undefined);
    source.replay.world.context.cinema.complete();
    const actor = source.replay.world.entities.createEnemy("source", 800, 400, source.replay.world.state.run() as never);
    actor.bossId = "source";
    source.replay.world.state.setEnemies([actor]);
    expect(source.replay.practiceCinematic.runtime.startVoidDescent(actor)).toBe(true);
    step(source, 5);
    const captured = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "active-source-descent");
    const restored = createProductionGhostReplayComposition({ seed: "source-restore", inputSnapshots: new Map([[captured.snapshot.tick, captured.input]]) }).create(captured.snapshot);
    for (let index = 0; index < 30; index++) {
      step(source, 1); step(restored, 1);
      expect(projectProductionReplayCanonicalState(restored.replay, restored.simulation.scheduler.tick, restored.simulation.input))
        .toEqual(projectProductionReplayCanonicalState(source.replay, source.simulation.scheduler.tick, source.simulation.input));
      expect(restored.replay.world.context.cinema.captureState()).toEqual(source.replay.world.context.cinema.captureState());
    }
    source.replay.world.context.cinema.complete(); restored.replay.world.context.cinema.complete();
    const stream = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "active-source-stream");
    const resumed = createProductionGhostReplayComposition({ seed: "stream-restore", inputSnapshots: new Map([[stream.snapshot.tick, stream.input]]) }).create(stream.snapshot);
    for (let index = 0; index < 20; index++) {
      source.simulation.advanceOne([]); resumed.simulation.advanceOne([]);
      expect(projectProductionReplayCanonicalState(resumed.replay, resumed.simulation.scheduler.tick, resumed.simulation.input))
        .toEqual(projectProductionReplayCanonicalState(source.replay, source.simulation.scheduler.tick, source.simulation.input));
    }
    // Constructed launch after real descent/stream activity, not a natural Source
    // kill. The actual finale owner freezes history and restores the real floors.
    Object.assign(source.replay.configuration.value.finale, { silence: 0.02, wound: 0.02, relics: 0.02, cutAutoAt: 0.02, cutAutoStep: 0.02, restorationMin: 0.02, epilogueReveal: 0.02, rewardHold: 0.02 });
    source.replay.finale.runtime.start();
    for (let index = 0; index < 180 && source.replay.finale.runtime.captureBinding()?.state.restoring !== true; index++) step(source, 1);
    expect(source.replay.finale.runtime.captureBinding()?.state.restoring).toBe(true);
    const landing = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "source-history-restoration");
    const history = stableVerificationHash((landing.snapshot.state["tear.run.v1"] as Record<string, unknown>).voidScroll);
    const landed = createProductionGhostReplayComposition({ seed: landing.snapshot.seed, inputSnapshots: new Map([[landing.snapshot.tick, landing.input]]) }).create(landing.snapshot);
    expect(landed.replay.stage.platforms).toHaveLength(6);
    expect(stableVerificationHash(landed.replay.world.state.run()?.voidScroll)).toBe(history);
    const bad = structuredClone(landing.snapshot), badRun = bad.state["tear.run.v1"] as Record<string, unknown>;
    const graph = badRun.voidScroll as { chunks: { platforms: { platformId: string }[] }[] };
    const alias = graph.chunks[0]?.platforms[0]; if (alias === undefined) throw new Error("Source graph fixture missing");
    alias.platformId = "unknown-history-platform";
    expect(() => createProductionGhostReplayComposition({ seed: "source-negative" }).create(bad)).toThrow(/Source.*alias|reference target/);
    const conflict = structuredClone(landing.snapshot);
    const conflictRun = conflict.state["tear.run.v1"] as { voidScroll: { chunks: { platforms: { x: number }[] }[] } };
    const position = conflictRun.voidScroll.chunks[0]?.platforms[0]; if (position === undefined) throw new Error("Source graph fixture missing");
    position.x += 1;
    expect(() => createProductionGhostReplayComposition({ seed: "source-negative" }).create(conflict)).toThrow(/Source.*alias/);
    const missing = structuredClone(stream.snapshot); (missing.state["tear.platform.v1"] as unknown[]).pop();
    expect(() => createProductionGhostReplayComposition({ seed: "source-negative" }).create(missing)).toThrow(/reference target/);
    const support = structuredClone(landing.snapshot);
    (support.state["tear.player.v1"] as Record<string, unknown>).supportPlatform = { platformId: "unknown-live-platform" };
    expect(() => createProductionGhostReplayComposition({ seed: "source-negative" }).create(support)).toThrow(/reference target/);
    for (let index = 0; index < 180; index++) { step(source, 1); step(landed, 1); expect(witness(landed)).toEqual(witness(source)); if (source.waveReward.screen() === "win") break; }
    expect(source.waveReward.screen()).toBe("win");
  });

  it.skipIf(process.env.TEAR_FINALE_SOURCE_PAIR === undefined)("restores the unchanged original native Source/finale archive pair", async () => {
    const { readFile } = await import("node:fs/promises");
    const file = process.env.TEAR_FINALE_SOURCE_PAIR; if (file === undefined) throw new Error("pair path unavailable");
    const decoded: unknown = JSON.parse(await readFile(file, "utf8"));
    const pair = decoded as Record<string, { manifestText: string; chunks: Record<string, string> }>;
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    for (const value of Object.values(pair)) { const manifest: unknown = JSON.parse(value.manifestText); await vault.importCapsule(JSON.stringify({ manifest, chunks: value.chunks })); }
    const reader = new GhostCapsuleReader(vault), sources = await Promise.all(Object.keys(pair).map((id) => reader.read(id)));
    const child = sources.find((value) => readGhostFinaleCompanion(value.manifest.provenance) !== undefined);
    if (child === undefined) throw new Error("native companion missing");
    const declaration = readGhostFinaleCompanion(child.manifest.provenance), parent = sources.find((value) => value.manifest.id === declaration?.parentId);
    if (parent === undefined) throw new Error("native parent missing");
    const playback = createGhostFinalePlayback(child, admitGhostFinaleCompanion(child, parent));
    expect(playback.seekFrame(playback.positions.length - 1).result.tick).toBe(playback.positions.at(-1)?.tick);
  });

  it.each(["completion", "replacement", "newer-session"])("streams a real final-wave handoff with pause and %s lifetime", async (ending) => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend()), reader = new GhostCapsuleReader(vault);
    const recorder = new GhostLiveRecorder({ createVault: () => Promise.resolve(vault), now: () => "2026-10-20T00:00:01Z" });
    const bus = new TearGameplayEventBus(); let sequence = 0, finishRequested = false;
    const source = createProductionGhostReplayComposition({ seed: "constructed-final-wave", mode: "campaign", gameplayEvents: bus }).create(undefined);
    source.replay.world.context.cinema.complete();
    const run = source.replay.world.state.run(); if (run === null) throw new Error("run missing");
    let currentRun: object = run;
    const lastStage = CAMPAIGN_STAGE_IDS.length - 1;
    source.replay.stage.index = lastStage; source.replay.world.context.environment.setStage(stageAt(lastStage).id, "stage-transition");
    Object.assign(run, { wave: 60, isBossWave: true, spawnQueue: [], clearTimer: 0, _biomeIdx: lastStage }); source.replay.world.state.setEnemies([]);
    source.replay.world.lifecycle.restore({ ...source.replay.world.lifecycle.snapshot(), wave: 60, bossWave: true, phase: "wave-active", activationDeferred: false });
    source.simulation.reset(119); bus.setTickSource(() => source.simulation.scheduler.tick);
    const initial = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "constructed-before-clear");
    let context: ReturnType<typeof createGhostReplayRunContext> | undefined = createGhostReplayRunContext({ runId: source.replay.world.lifecycle.snapshot().sessionId ?? "missing", seed: initial.snapshot.seed,
      mode: "campaign", difficulty: "normal", weaponId: "sword", ticksPerSecond: 120, applicationFrames: GHOST_APPLICATION_FRAMES_V1, build: initial.snapshot.provenance.build, rng: initial.snapshot.rng });
    let clockSessionId: string | undefined;
    const session = { recorder: () => recorder, replayContext: () => context, nextEventSequence: () => ++sequence, reset: () => undefined,
      setReplayContext: (value: typeof context) => { context = value; }, clockSessionId: () => clockSessionId, setClockSessionId: (value: string | undefined) => { clockSessionId = value; } };
    const frames = createLiveGhostFrameRecording({ session, tick: () => source.simulation.scheduler.tick, introActive: () => false,
      interceptFinish: (result) => companion.interceptFinish(result), closedFrame: () => { companion.frameEnded(); } });
    const capture = (tick: number) => {
      const c = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, `origin-${String(tick)}`);
      const receipt = createGhostAuthoritativeReceipt(tick, c.semanticHash, c.input, frames.receipt({ id: c.snapshot.id, exactHash: c.snapshot.hashes.exact }));
      recorder.record("keyframes", tick, c.snapshot); recorder.record("results", tick, receipt); companion.observed(c.snapshot, receipt); return c.snapshot;
    };
    const state = () => ({ canonical: projectProductionReplayCanonicalState(source.replay, source.simulation.scheduler.tick, source.simulation.input), finale: source.replay.finale.runtime.captureBinding(),
      cinema: source.replay.world.context.cinema.captureState(), cinemaInput: source.replay.world.context.cinema.captureRecordedInput(), lifecycle: source.replay.world.lifecycle.snapshot(), rng: source.replay.world.context.services.random.snapshot(), seconds: source.replay.world.context.services.clock.seconds(), stage: source.replay.stage.index });
    const companion = createLiveGhostFinaleCompanion({ session, frames, tick: () => source.simulation.scheduler.tick, run: () => currentRun,
      finaleActive: () => source.replay.world.lifecycle.snapshot().phase === "finale", completed: () => source.waveReward.screen() === "win", captureReceipt: capture, witness: state });
    bus.subscribe((event) => { if (recorder.active) recorder.record("events", event.tick, createGameplayCausalEvent(event, ++sequence, `native-${String(sequence)}`, "engine")); if (event.kind === "run" && event.transition === "completed") finishRequested = true; });
    const ghost = new LegacyGhostEngine({ store: { get: () => null, set: () => undefined }, document: {} as Document,
      now: () => 1, random: () => 0.5, defaults: { rulesetVersion: "finale-fixture", build: { version: "0.1.0", revision: "fixture", target: "standalone" }, ticksPerSecond: 120, tearScore: () => ({ enabled: false, reason: "not-recorded" }) } });
    // Exercise the real stop observer before FinaleRuntime launches its binding.
    // No Run DNA observer is present to defer this boundary until after the tick.
    ghost.setRecordingObserver({ started: () => undefined, stopped: (meta) => { frames.finish(meta); } }); ghost.startRec();
    source.replay.finale.bindOutcome((campaign, persist) => {
      const prepared = source.outcome.controller.prepareVictory(campaign, persist);
      expect(source.replay.world.lifecycle.snapshot().phase).not.toBe("finale");
      ghost.stopRec({ won: true }, { continueSemanticInput: true });
      return prepared;
    }, (campaign) => { source.outcome.controller.victory(campaign); source.waveReward.restoreScreen("win"); });
    recorder.start({ sessionId: "scored-parent", createdAt: "2026-10-20T00:00:00Z", provenance: { replayContext: context } });
    const confirm = { key: false, touch: false, pad: false, click: false };
    frames.begin(1 / 60, confirm, false); source.advanceApplicationFrame(1 / 60, confirm); frames.preludeApplied();
    source.simulation.advanceOne([{ kind: "command", id: 1, tick: 120, command: { type: "aim", turn: 0, magnitude: 400 } }]);
    expect(finishRequested).toBe(true); expect(ghost.recording()).toBe(false);
    capture(120); companion.afterTick();
    source.simulation.advanceOne([]); companion.afterTick(); frames.end(2); await recorder.drain();
    expect(recorder.activeSessionId).toBe("scored-parent:finale");
    // Paused RAFs close no new application frame and must not duplicate witnesses.
    frames.end(0); frames.end(0);
    if (ending !== "completion") {
      if (ending === "newer-session") {
        recorder.interrupt("source already replaced");
        recorder.start({ sessionId: "newer-run", createdAt: "2026-10-20T00:00:02Z", provenance: { replayContext: context } });
      }
      currentRun = {};
      companion.reset();
      expect(recorder.active).toBe(ending === "newer-session");
      if (ending === "replacement") recorder.start({ sessionId: "newer-run", createdAt: "2026-10-20T00:00:02Z", provenance: { replayContext: context } });
      expect(recorder.activeSessionId).toBe("newer-run");
      recorder.interrupt("fixture cleanup"); await expect(recorder.drain()).rejects.toThrow(/fixture cleanup/); return;
    }
    for (let index = 0; index < 720 && recorder.active; index++) {
      const before = source.simulation.scheduler.tick;
      const input = { ...confirm, key: index > 60, click: index % 30 === 0 };
      frames.begin(1 / 60, input, source.replay.world.context.cinema.active);
      source.advanceApplicationFrame(1 / 60, input); frames.preludeApplied();
      if (source.waveReward.screen() === "playing") { source.simulation.advanceOne([]); source.simulation.advanceOne([]); }
      frames.end(source.simulation.scheduler.tick - before); await recorder.drain();
    }
    await recorder.drain();
    expect(source.waveReward.screen()).toBe("win"); expect(recorder.failure).toBeNull();
    const parent = await reader.read("scored-parent"), child = await reader.read("scored-parent:finale");
    expect(parent.tracks.keyframes.filter((entry) => entry.tick === 120)).toHaveLength(1);
    expect(child.tracks.keyframes).toHaveLength(1);
    expect(readGhostFinaleCompanion(child.manifest.provenance)?.origin.cursor.open?.preludeApplied).toBe(true);
    const playback = createGhostFinalePlayback(child, admitGhostFinaleCompanion(child, parent));
    expect(playback.positions.at(-1)?.tick).toBe(source.simulation.scheduler.tick);
    const last = playback.seekFrame(playback.positions.length - 1); expect(last.result.semanticHash).toBe(stableVerificationHash(state()));
    expect(() => admitGhostFinaleCompanion(child, { ...parent, manifest: { ...parent.manifest, rootIntegrity: "changed" } })).toThrow(/root/);
    expect(() => createGhostFinalePlayback(child, {} as never)).toThrow(/custody/);
  });
});
