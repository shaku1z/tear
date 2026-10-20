import { describe, expect, it } from "vitest";

import { createLiveGhostRecordingSessionState } from "../../src/app/live-ghost-recording-session-state";
import { createLiveGhostRunDnaRecording } from "../../src/app/live-ghost-run-dna-recording";
import { createLiveGhostFrameRecording, declareGhostApplicationFrames } from "../../src/app/live-ghost-frame-recording";
import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";
import { createProductionCombatSimulation } from "../../src/tearbench/production-combat-simulation";
import { GhostLiveRecorder } from "../../src/ghost/live-recorder";
import { GhostLocalVault, createMemoryGhostVaultBackend } from "../../src/ghost/capsule-vault";
import { GhostCapsuleReader } from "../../src/ghost/capsule-reader";
import { createGhostReplayRunContext } from "../../src/ghost/replay-admission";
import { createLiveGhostCausalEvent } from "../../src/ghost/live-causal-events";
import { TearGameplayEventBus } from "../../src/gameplay/runtime/gameplay-events";
import { projectGhostRunDnaTheater } from "../../src/ghost/run-dna-theater";

describe("live Ghost recording session state", () => {
  it("seals native terminal-tick damage before a multi-step frame tail, and refuses corrupt fresh coverage", async () => {
    const replay = createProductionReplayWorld({ seed: "dna-terminal", mode: "endless" });
    const player = replay.world.state.player(), blade = replay.world.state.blade(), run = replay.world.state.run();
    if (!player || !blade || !run) throw new Error("missing production actors");
    const context = declareGhostApplicationFrames(createGhostReplayRunContext({ runId: "terminal-run", seed: "dna-terminal", mode: "endless", difficulty: "normal", weaponId: "sword", ticksPerSecond: 120,
      build: { version: "test", revision: "test", target: "test-standalone", rulesetVersion: "test", configHash: "test", contentHash: "test" }, rng: { gameplay: { state: 1 } } }));
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const recorder = new GhostLiveRecorder({ createVault: () => Promise.resolve(vault), now: () => "2026-10-20T00:00:00Z" });
    const session = { ...createLiveGhostRecordingSessionState(undefined), recorder: () => recorder };
    let playing = true;
    const bus: TearGameplayEventBus = new TearGameplayEventBus(() => core.simulationRuntime.scheduler.tick);
    const nativeRun = (transition: "started" | "defeated") => { bus.emit({ kind: "run", transition, runId: "terminal-run", mode: "endless", difficulty: "normal", weaponId: "sword", wave: 1, score: 0, runTimeSeconds: replay.clock.sim }); };
    bus.subscribe((event) => { recorder.record("events", event.tick, createLiveGhostCausalEvent(event, session.nextEventSequence())); });
    const core = createProductionCombatSimulation(replay, { gameplayEvents: bus, snapshot: (tick) => ({ tick }), endRun: () => {
      nativeRun("defeated"); dna.finish(() => { frames.finish({ defeated: true }); }); playing = false;
    } });
    const dna = createLiveGhostRunDnaRecording({ session, player: () => player, blade: () => blade, run: () => run,
      tick: () => core.simulationRuntime.scheduler.tick, practice: () => false });
    const frames = createLiveGhostFrameRecording({ session, tick: () => core.simulationRuntime.scheduler.tick, introActive: () => false, afterFrame: () => { dna.frameEnded(); } });
    recorder.start({ sessionId: "terminal-capsule", createdAt: "2026-10-20T00:00:00Z", provenance: { replayContext: context } });
    session.setReplayContext(context); dna.start(context); nativeRun("started");
    // Explicit source-frame fixture with an outcome in its first canonical step.
    frames.begin(1 / 30, { key: false, touch: false, pad: false, click: false }, true); frames.preludeApplied();
    const initialHp = player.hp;
    const advanced = core.simulationRuntime.advance(1000 / 30, (tick) => {
      dna.beforeTick(tick); player.takeDamage(initialHp * 2, player.x - 100); return [];
    }, { shouldStep: () => playing, afterStep: (tick) => { dna.afterTick(tick); } });
    expect(advanced.steps).toBe(4); expect(playing).toBe(false); expect(recorder.active).toBe(true);
    frames.end(advanced.steps); await recorder.drain();
    const capsule = await new GhostCapsuleReader(vault).read("terminal-capsule");
    expect(capsule.maxTick).toBe(4);
    const result = capsule.tracks.results.find((entry) => typeof entry.value === "object" && entry.value !== null && "capture" in entry.value);
    expect(result?.tick).toBe(1);
    const projection = projectGhostRunDnaTheater(capsule);
    expect(projection.nativePolicy).toBe("native-combat-episodes-v1");
    expect(projection.sourceMetrics.damageTaken).toBe(initialHp);
    expect(projection.sourceMetrics.combatTicks).toBe(1);
    expect(projection.dimensions?.precision).toBeUndefined();
    expect(projection.unavailable.join(" ")).toMatch(/precision: .*interrupted attack episodes/u);
    const damaged = structuredClone(capsule);
    const raw = damaged.tracks.results.find((entry) => typeof entry.value === "object" && entry.value !== null && "capture" in entry.value)?.value as { capture: { version: number } };
    raw.capture.version = 99;
    expect(projectGhostRunDnaTheater(damaged).dimensions).toBeUndefined();
    const changedSource = { ...capsule, manifest: { ...capsule.manifest, id: "other-session" } };
    expect(projectGhostRunDnaTheater(changedSource).dimensions).toBeUndefined();
  });
  it("keeps the V3 replay context and causal sequence together for one recording session", () => {
    const state = createLiveGhostRecordingSessionState(undefined, {});
    const context = { run: { id: "run-93" } } as never;

    state.setReplayContext(context);

    expect(state.recorder()).toBeNull();
    expect(state.nextEventSequence()).toBe(1);
    expect(state.nextEventSequence()).toBe(2);
    expect(state.replayContext()).toBe(context);

    state.reset();

    expect(state.nextEventSequence()).toBe(1);
    expect(state.replayContext()).toBeUndefined();
    expect(Object.isFrozen(state)).toBe(true);
  });
});
