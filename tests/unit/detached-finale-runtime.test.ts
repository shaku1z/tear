import { describe, expect, it } from "vitest";

import { TearGameplayEventBus, type TearGameplayEvent } from
  "../../src/gameplay/runtime/gameplay-events";
import { projectGameplayEventForParity } from "../../src/tearbench/gameplay-causal-events";
import {
  createDetachedCombatSimulation,
  createDetachedFinaleComposition,
  createDetachedWaveRewardRuntime,
  createDetachedWorld,
} from "./detached-world-harness";

describe("detached portable finale runtime", () => {
  it("publishes live-shaped boss and death facts through production kill and cleanup hooks", () => {
    const detached = createDetachedWorld({
      seed: "detached-source-native-facts", mode: "campaign",
      enemies: [{ id: "source", x: 810, y: 330 }],
    });
    detached.stage.index = 4;
    const run = detached.world.state.run() as never as Record<string, unknown>;
    Object.assign(run, {
      mode: "campaign", diff: "normal", wave: 50, score: 0, runTime: 0,
      waveTime: 0, waveKills: 0, wavePeak: 1, waveLog: [], spawnQueue: [],
      _dmgThisWave: false, _dmgThisRun: false, chapterState: "WAVE_LIVE",
    });
    const events = new TearGameplayEventBus();
    const native: TearGameplayEvent[] = [];
    events.subscribe((event) => { native.push(event); });
    const core = createDetachedCombatSimulation(detached, {
      gameplayEvents: events,
      snapshot: (tick) => ({ tick }),
    });
    events.setTickSource(() => core.simulationRuntime.scheduler.tick);
    const source = detached.world.state.enemies()[0] as unknown as ({
      id?: string; _gid?: number; x: number; y: number; dead: boolean;
    } | undefined);
    if (source === undefined) throw new Error("detached Source was not constructed");
    // Ghost 2's visual id only admits the actor to its cleanup hook. The fact
    // must use the shared core identity, never this legacy number.
    source._gid = 41;
    const actorId = core.combatEntityRuntime.id(source, "enemy");
    source.dead = true;
    core.killRuntime.resolve(source as never, "combat");
    core.simulationRuntime.advanceOne([]);

    expect(native.map((event, sequence) => projectGameplayEventForParity(event, sequence))).toEqual([
      {
        tick: 0, sequence: 0, type: "boss.defeated", phase: "post-simulation-commit",
        payload: { effect: "bossKill", x: 810, y: 330 },
      },
      {
        tick: 1, sequence: 1, type: "enemy.defeated", phase: "deaths-and-rewards",
        actorId, payload: { cause: "combat" },
      },
    ]);
    expect(actorId).not.toBe("enemy:41");

    const silent = createDetachedWorld({ seed: "detached-source-silent", mode: "campaign" });
    const silentCore = createDetachedCombatSimulation(silent, { snapshot: (tick) => ({ tick }) });
    expect(silentCore.collision.ghostRecording()).toBe(false);
  });

  it("crosses final campaign wave clear, real cinematic frames, and the victory outcome endpoint", () => {
    const detached = createDetachedWorld({ seed: "detached-finale", mode: "campaign" });
    const run = detached.world.state.run() as never as Record<string, unknown>;
    Object.assign(run, {
      mode: "campaign", diff: "normal", wave: 50, score: 12_345, runTime: 612,
      waveTime: 18, waveKills: 1, wavePeak: 1, waveLog: [], bossesBeaten: 4,
      isBossWave: true, horde: false, spawnQueue: [], spawnTimer: 0, clearTimer: -1,
      pendingReward: null, _dmgThisWave: false, _dmgThisStage: false, _dmgThisRun: false,
      chapterState: "WAVE_LIVE", finalBossDeath: { x: 800, y: 320 },
    });
    detached.stage.index = 4;
    detached.world.state.setEnemies([]);
    detached.world.state.setBossIntro({ id: "stale-intro" } as never);
    detached.world.state.setBossBeat({ id: "stale-beat" } as never);
    detached.world.lifecycle.start("detached-finale-session");
    detached.world.lifecycle.prepareWave(50, true, false);
    detached.world.lifecycle.activateWave();

    const events = new TearGameplayEventBus();
    const nativeEvents: TearGameplayEvent[] = [];
    events.subscribe((event) => { nativeEvents.push(event); });
    const finale = createDetachedFinaleComposition(detached, events);
    let updateWave: (seconds: number) => void = () => undefined;
    const core = createDetachedCombatSimulation(detached, {
      gameplayEvents: events,
      updateWave: (seconds) => { updateWave(seconds); },
      finale: {
        snapshot: finale.snapshot,
        markLanded: finale.markLanded,
        tryBladeCut: finale.tryBladeCut,
      },
      snapshot: (tick) => ({
        tick,
        lifecycle: detached.world.lifecycle.phase,
        cinema: detached.world.context.cinema.id ?? null,
        finale: finale.snapshot()?.phase ?? null,
      }),
    });
    events.setTickSource(() => core.simulationRuntime.scheduler.tick);
    const waves = createDetachedWaveRewardRuntime(
      detached,
      events,
      (enemy) => core.combatEntityRuntime.id(enemy, "enemy"),
      detached.stage.platforms,
      finale,
    );
    updateWave = waves.update;

    const entry = core.simulationRuntime.advanceOne([]);

    expect(entry.state).toMatchObject({ lifecycle: "finale", cinema: "adventure-final-cut" });
    expect(detached.world.lifecycle.snapshot()).toMatchObject({
      phase: "finale", wave: 50, bossWave: true, outcome: null,
    });
    expect(finale.snapshot()?.phase).toBe("silence");
    expect(detached.world.state.bossIntro()).toBeNull();
    expect(detached.world.state.bossBeat()).toBeNull();
    expect(finale.outcome.pendingFinale()).not.toBeNull();
    expect(nativeEvents).toContainEqual(expect.objectContaining({
      kind: "wave", wave: 50, event: "clear",
    }));
    expect(nativeEvents).toContainEqual(expect.objectContaining({
      kind: "run", transition: "completed", runId: "detached-finale-session", wave: 50,
    }));

    detached.world.context.cinema.requestSkip();
    expect(finale.snapshot()).toMatchObject({ phase: "restoration", severed: 3, restoring: true });
    let directorAdvancedBeforeSimulation = false;
    let frames = 0;
    while (detached.world.lifecycle.phase !== "terminated" && frames < 360) {
      finale.advanceApplicationFrame(1 / 60, (seconds) => {
        directorAdvancedBeforeSimulation ||= detached.world.context.cinema.elapsed > 0;
        return core.simulationRuntime.advance(seconds * 1_000, () => []);
      });
      frames += 1;
    }

    expect(directorAdvancedBeforeSimulation).toBe(true);
    expect(frames).toBeLessThan(360);
    expect(core.simulationRuntime.scheduler.tick).toBeGreaterThan(entry.tick);
    expect(detached.world.context.cinema.active).toBe(false);
    expect(finale.snapshot()).toBeNull();
    expect(detached.world.lifecycle.snapshot()).toMatchObject({ phase: "terminated", outcome: "victory" });
    expect(finale.outcome.pendingFinale()).toBeNull();
    const presented = finale.outcome.presented();
    expect(presented?.outcome).toBe("victory");
    expect(presented?.result).toMatchObject({ win: true, campaign: true, wave: 50, score: 12_345 });
    expect(finale.outward).toEqual(expect.arrayContaining([
      "persistFinale", "clearFinale", "present:victory",
    ]));
    const chronology = finale.outcomeChronology;
    expect(chronology.map((entry) => entry.sequence)).toEqual(chronology.map((_, index) => index));
    expect(chronology.slice(0, 4).map((entry) => entry.effect.type)).toEqual([
      "outcome.stop-clipper", "outcome.terminal-published", "outcome.prepared-stored",
      "outcome.pending-finale-persisted",
    ]);
    expect(chronology.slice(-4).map((entry) => entry.effect.type)).toEqual([
      "outcome.prepared-cache-hit", "outcome.pending-finale-cleared",
      "outcome.lifecycle-terminated", "outcome.presented",
    ]);
    expect(nativeEvents.filter((event) => event.kind === "run" && event.transition === "completed")).toHaveLength(1);
  });
});
