import { describe, expect, it } from "vitest";
import { LegacyGhostEngine, type LegacyReplayDependencies, type ReplayStore } from "../../src/replay/legacy-compat";
import {
  buildVisualReplayPacket,
  migrateVisualRecording,
  verifyVisualReplayPacket,
  type VisualRecordingV2,
} from "../../src/replay/visual-replay";

function visualFixture(samples = 20): VisualRecordingV2 {
  const positions = Array.from({ length: samples }, (_, index) => index * 10);
  return {
    v: 2, dt: 0.1, edt: 0.25,
    px: positions, py: positions.map(() => 400), tx: positions.map((x) => x + 30), ty: positions.map(() => 380),
    fc: positions.map(() => 1), stages: [{ t: 0, s: 0 }, { t: 1, s: 1 }],
    waves: [{ t: 0, w: 1, e: "start" }], spawns: [], esamp: [], deaths: [], events: [], loadout: [], thumb: null,
    mode: "endless", diff: "normal", score: 100,
  };
}

const provenance = {
  rulesetVersion: "rules-a",
  build: { version: "0.1.0", revision: "abc", target: "standalone" },
  runId: "run-a",
  seed: "seed-a",
  ticksPerSecond: 60,
  tearScore: { enabled: true, engineVersion: "0.1", scoreVersion: "score-a", seed: "music-a", eventJournalHash: "journal-a" },
} as const;

describe("visual replay migration", () => {
  it("upgrades hero-only v1 recordings without changing their path", () => {
    const legacy = { v: 1, dt: 0.1, px: [0, 10, 20], py: [400, 400, 400], bx: [5, 15, 25], by: [380, 380, 380], stage: 3 };
    const migrated = migrateVisualRecording(legacy);
    expect(migrated.ok).toBe(true);
    if (migrated.ok) {
      expect(migrated.recording).toMatchObject({ v: 2, tx: legacy.bx, ty: legacy.by, stages: [{ t: 0, s: 3 }] });
      expect(migrated.recording.spawns).toEqual([]);
    }
  });

  it("retains complete legacy v2 visual and summary fields", () => {
    const fixture = visualFixture();
    const migrated = migrateVisualRecording(JSON.parse(JSON.stringify(fixture)) as unknown);
    expect(migrated).toMatchObject({ ok: true, recording: { v: 2, mode: "endless", score: 100 } });
  });

  it("round-trips a canonical hybrid packet with deterministic provenance and hash", () => {
    const packet = buildVisualReplayPacket(visualFixture(), provenance, [
      { kind: "command", id: 1, tick: 4, command: { type: "move", x: 1_000, y: 0 } },
    ]);
    const roundTrip = JSON.parse(JSON.stringify(packet)) as unknown;
    expect(verifyVisualReplayPacket(roundTrip)).toBe(true);
    expect(roundTrip).toMatchObject({
      format: "tear-replay",
      schemaVersion: 2,
      rulesetVersion: "rules-a",
      run: { runId: "run-a", seed: "seed-a", ticksPerSecond: 60 },
      build: provenance.build,
      tearScore: provenance.tearScore,
    });
    const tampered = { ...(roundTrip as Record<string, unknown>), px: [999, ...visualFixture().px.slice(1)] };
    expect(verifyVisualReplayPacket(tampered)).toBe(false);
  });

  it("rejects malformed tracks before playback", () => {
    expect(migrateVisualRecording({ v: 2, px: [1, 2], py: [1] })).toMatchObject({ ok: false });
  });
});

describe("LegacyGhostEngine", () => {
  it("records semantic commands into the canonical packet and preserves playback", () => {
    const values = new Map<string, string>();
    const store: ReplayStore = { get: (key) => values.get(key) ?? null, set: (key, value) => { values.set(key, value); } };
    let semanticTick = 0;
    const dependencies: LegacyReplayDependencies = {
      store,
      document: {} as Document,
      now: () => 1,
      random: () => 0.5,
      semanticInput: {
        startRecording: () => undefined,
        stopRecording: () => undefined,
        drain: (tick) => tick > semanticTick ? [{ kind: "command", id: ++semanticTick, tick, command: { type: "confirm" } }] : [],
      },
      defaults: { rulesetVersion: provenance.rulesetVersion, build: provenance.build, ticksPerSecond: 60, tearScore: () => provenance.tearScore },
    };
    const ghost = new LegacyGhostEngine(dependencies);
    ghost.startRec({ runId: "run-live", seed: "seed-live" });
    for (let index = 0; index < 20; index += 1) {
      ghost.sample(0.1, { x: index * 10, y: 400, facing: 1 }, { tipX: index * 10 + 20, tipY: 380 }, []);
    }
    const packet = ghost.stopRec({ mode: "endless", score: 200 });
    expect(packet).not.toBeNull();
    expect(packet?.actions.length).toBeGreaterThan(0);
    expect(packet?.run).toMatchObject({ runId: "run-live", seed: "seed-live" });
    expect(packet && verifyVisualReplayPacket(packet)).toBe(true);

    const playback = ghost.begin(JSON.parse(JSON.stringify(packet)) as unknown);
    expect(playback).not.toBeNull();
    ghost.seek(0.45);
    expect(ghost.pose()).toMatchObject({ x: 45, y: 400, face: 1 });
    expect(ghost.duration()).toBeCloseTo(1.9);
  });

  it("seals the final TearScore journal instead of the pre-activation placeholder", () => {
    const store: ReplayStore = { get: () => null, set: () => undefined };
    let score: Readonly<{ enabled: false; reason: "not-recorded" }> | typeof provenance.tearScore =
      { enabled: false, reason: "not-recorded" };
    const ghost = new LegacyGhostEngine({
      store, document: {} as Document, now: () => 1, random: () => 0.5,
      defaults: {
        rulesetVersion: provenance.rulesetVersion,
        build: provenance.build,
        ticksPerSecond: 60,
        tearScore: () => score,
      },
    });
    ghost.startRec();
    score = provenance.tearScore;
    for (let index = 0; index < 20; index += 1) {
      ghost.sample(0.1, { x: index, y: 0, facing: 1 }, null, []);
    }

    expect(ghost.stopRec()?.tearScore).toEqual(provenance.tearScore);
  });

  it("keeps semantic ticks monotonic when the visual track trims a long run", () => {
    const ticks: number[] = [];
    const store: ReplayStore = { get: () => null, set: () => undefined };
    const ghost = new LegacyGhostEngine({
      store, document: {} as Document, now: () => 1, random: () => 0.5,
      semanticInput: {
        startRecording: () => undefined,
        stopRecording: () => undefined,
        drain: (tick) => { ticks.push(tick); return []; },
      },
      defaults: { rulesetVersion: provenance.rulesetVersion, build: provenance.build, ticksPerSecond: 60, tearScore: () => provenance.tearScore },
    });
    ghost.startRec();
    for (let index = 0; index < 9_010; index += 1) ghost.sample(0.1, { x: index, y: 0, facing: 1 }, null, []);
    expect(ticks.every((tick, index) => index === 0 || tick >= (ticks[index - 1] ?? 0))).toBe(true);
    expect(ghost.rec?.px.length).toBeLessThan(9_000);
  });
});
