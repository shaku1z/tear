import {
  createProductionGhostReplayComposition,
  captureProductionReplayCheckpoint,
} from "../../src/tearbench/production-replay-composition";
import { createGhostReplayRunContext } from "../../src/ghost/replay-admission";
import { GhostLiveRecorder } from "../../src/ghost/live-recorder";
import { createGhostAuthoritativeReceipt } from "../../src/ghost/authoritative-receipt";
import { TearGameplayEventBus } from "../../src/gameplay/runtime/gameplay-events";
import { createGameplayCausalEvent } from "../../src/tearbench/gameplay-causal-events";
import { recordingFreeBossSnapshot } from "../../src/ghost/boss-memory";
import { stableVerificationHash } from "../../src/domain/hash";
import {
  saveBossMemory,
  verifyBossMemory,
  bossMemoryFrameFrontier,
  bossMemoryReplay,
} from "../../src/ghost/boss-memory";
import { GhostProductionReplayWorld } from "../../src/ghost/replay-world";
import { createGhostV3 } from "../../src/ghost/truth-kernel";
import { createGhostApplicationClockEvent } from "../../src/ghost/application-frame-events";
import { readGhostBossMemory } from "../../src/ghost/boss-memory-origin";
import { GhostLocalVault } from "../../src/ghost/capsule-vault";
import { createMemoryGhostVaultBackend } from "../../src/ghost/capsule-vault-backend";
import { prepareCompleteGhostCapsuleArchive, prepareGhostCapsuleArchive } from "../../src/ghost/capsule-archive";
import { GhostColdRestore } from "../../src/ghost/cold-restore";
import { GhostCapsuleReader } from "../../src/ghost/capsule-reader";
import { createGhostProductionReplaySession } from "../../src/ghost/production-replay-session";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { GhostReadCapsule } from "../../src/ghost/capsule-reader";
import { mapGhostCapsuleToReplayEnvelope } from "../../src/ghost/capsule-replay-envelope";

export function nativeBossSource(): GhostReadCapsule {
  const path = process.env.TEAR_BOSS_MEMORY_SOURCE;
  if (!path) throw new Error("Explicit native input required");
  return JSON.parse(readFileSync(path, "utf8")) as GhostReadCapsule;
}
async function generatedBossSource(): Promise<GhostReadCapsule> {
  // Constructed native actor fixture on the real production simulation; no human/full-course claim.
  const bus = new TearGameplayEventBus(),
    host = createProductionGhostReplayComposition({
      seed: "117",
      mode: "endless",
      weaponId: "sword",
      difficulty: "normal",
      gameplayEvents: bus,
    }).create(undefined),
    run = host.replay.world.state.run();
  if (!run) throw new Error("Fixture run missing");
  run.spawnQueue = [];
  host.replay.world.state.setEnemies([host.replay.world.entities.createEnemy("rootbound", 850, 600, run)]);
  const vault = new GhostLocalVault(createMemoryGhostVaultBackend()),
    recorder = new GhostLiveRecorder({ createVault: () => Promise.resolve(vault), now: () => "2026-10-20T00:00:01Z" });
  const initial = captureProductionReplayCheckpoint(host.replay, host.combat, host.waveReward, "fixture-origin"),
    context = createGhostReplayRunContext({
      runId: host.replay.world.lifecycle.snapshot().sessionId ?? "fixture",
      seed: "117",
      mode: run.mode,
      difficulty: run.diff,
      weaponId: run.weaponId,
      ticksPerSecond: 120,
      build: initial.snapshot.provenance.build,
      rng: host.replay.random.streams.snapshot(),
    });
  const id = "native-boss-fixture";
  recorder.start({ sessionId: id, createdAt: "2026-10-20T00:00:00Z", provenance: { replayContext: context } });
  let tick = 0,
    sequence = 0,
    actionId = 0;
  bus.setTickSource(() => tick);
  bus.subscribe((e) => {
    recorder.record("events", tick, createGameplayCausalEvent(e, ++sequence, `native-${String(sequence)}`, "engine"));
  });
  const capture = () => {
    const c = captureProductionReplayCheckpoint(host.replay, host.combat, host.waveReward, `source-${String(tick)}`);
    recorder.record("keyframes", tick, {
      ...c.snapshot,
      provenance: { ...c.snapshot.provenance, sourceId: `ghost-v3-bootstrap-${id}` },
    });
    recorder.record("rng", tick, c.snapshot.state["tear.rng.v1"]);
    recorder.record("results", tick, createGhostAuthoritativeReceipt(tick, c.semanticHash, c.input));
  };
  capture();
  for (tick = 1; tick <= 3600; tick++) {
    const actions =
      tick % 120 === 1
        ? [
            {
              kind: "command" as const,
              id: ++actionId,
              tick,
              command: { type: "aim" as const, turn: tick % 2 ? 250000 : 750000, magnitude: 500 },
            },
          ]
        : [];
    for (const action of actions) recorder.record("commands", tick, action);
    host.simulation.advanceOne(actions);
    if (tick % 120 === 0) capture();
    if (host.replay.world.lifecycle.snapshot().phase === "terminated") break;
  }
  if (tick > 3600) throw new Error("Native fixture censored before defeat");
  await recorder.finish({ outcome: "defeat" });
  return new GhostCapsuleReader(vault).read(id);
}
describe("Boss Memory", () => {
  it("retains the original closing witness without moving the playable endpoint frontier", () => {
    const base = {
      version: 1 as const,
      runId: "run",
      sessionId: "source",
      format: "tearghost-application-frame" as const,
      ordinal: 1,
      beforeTick: 100,
    };
    const begin = createGhostApplicationClockEvent(4, 100, {
      ...base,
      kind: "begin",
      seconds: 4 / 120,
      confirm: { key: false, touch: false, pad: false, click: false },
    });
    const close = createGhostApplicationClockEvent(8, 104, {
      ...base,
      kind: "end",
      beginSequence: 4,
      afterTick: 104,
      steps: 4,
      introActive: false,
    });
    const initial = { version: 1 as const, ordinal: 0, sequence: 0 },
      schedule = { events: [begin, close], receipts: new Map() };
    expect(bossMemoryFrameFrontier(schedule, 102, initial)).toEqual({
      cursor: { version: 1, ordinal: 1, sequence: 4, open: { ordinal: 1, beginSequence: 4, preludeApplied: true } },
      closingFrame: close,
    });
    expect(bossMemoryFrameFrontier(schedule, 104, initial)).toEqual({
      cursor: { version: 1, ordinal: 1, sequence: 8 },
      closingFrame: null,
    });
    expect(() => bossMemoryFrameFrontier({ ...schedule, events: [begin] }, 102, initial)).toThrow(/closing frame/);
  });
  it("saves a native constructed encounter, imports parentless, watches and forks entry", async () => {
    const source = await generatedBossSource(),
      before = JSON.stringify(source),
      vault = new GhostLocalVault(createMemoryGhostVaultBackend());
    const segment = await saveBossMemory(vault, source, 120, "Rootbound lesson", "Player-authored note: canopy step");
    expect(verifyBossMemory(segment).status).toBe("verified");
    // Descriptor-only boundary; this does not claim a long encounter was simulated.
    const longer = structuredClone(segment.manifest.provenance),
      description = readGhostBossMemory(longer);
    if (!description) throw new Error("Missing Memory descriptor");
    const longTick = description.origin.tick + 20001;
    expect(
      readGhostBossMemory({
        ...longer,
        bossMemory: {
          ...description,
          endpoint: {
            ...description.endpoint,
            tick: longTick,
            event: { ...description.endpoint.event, tick: longTick },
          },
        },
      })?.endpoint.tick,
    ).toBe(longTick);
    expect(
      segment.tracks.keyframes.every(
        (e) =>
          (e.value as { state: Record<string, { ghost?: { recording: unknown } }> }).state["tear.world.v1"]?.ghost
            ?.recording === null,
      ),
    ).toBe(true);
    expect(segment.tracks.commands.every((e) => e.tick > 120)).toBe(true);
    expect(JSON.stringify(segment)).not.toContain('"recording":{"');
    const exported = await prepareCompleteGhostCapsuleArchive(vault, segment.manifest.id);
    await prepareGhostCapsuleArchive(exported.bytes);
    const destination = new GhostLocalVault(createMemoryGhostVaultBackend()),
      restore = new GhostColdRestore(destination),
      job = await restore.select("parentless-memory", exported.bytes);
    await restore.restore(job.id, exported.bytes, undefined, job);
    expect(await destination.getManifest(source.manifest.id)).toBeUndefined();
    const imported = await new GhostCapsuleReader(destination).read(segment.manifest.id),
      session = createGhostProductionReplaySession(imported);
    const playback = bossMemoryReplay(imported),
      forwardTicks: number[] = [];
    let creations = 0;
    const originOnly = createGhostV3({
      ...playback.mapped.ghost,
      snapshots: playback.mapped.ghost.snapshots.filter((s) => s.tick === 120),
    });
    const continuous = new GhostProductionReplayWorld(originOnly, {
      create(snapshot) {
        creations++;
        const owner = playback.composition.create(snapshot);
        return {
          ...owner,
          beforeReplayAdvance(tick) {
            forwardTicks.push(tick);
            owner.beforeReplayAdvance(tick);
          },
        };
      },
    });
    continuous.advanceTo(120);
    continuous.advanceTo(122);
    const forward = continuous.advanceTo(125);
    expect(creations).toBe(1);
    expect(forwardTicks).toEqual([121, 122, 123, 124, 125]);
    expect(forward.semanticHash).toBe(
      new GhostProductionReplayWorld(originOnly, playback.composition).seek(125).semanticHash,
    );
    continuous.advanceTo(120);
    expect(creations).toBe(2);
    expect(continuous.advanceTo(125).semanticHash).toBe(forward.semanticHash);
    const end = (segment.manifest.provenance?.bossMemory as { endpoint: { tick: number } }).endpoint.tick;
    expect(session.firstTick).toBe(120);
    expect(session.lastTick).toBe(end);
    expect(() => session.seek(119)).toThrow();
    expect(() => session.seek(end + 1)).toThrow();
    expect(session.seek(end).semanticHash).toBe(
      (imported.manifest.provenance?.bossMemory as { endpoint: { stateHash: string } }).endpoint.stateHash,
    );
    const child = session.forkPractice(120, "exact-practice");
    expect(child.rankedEligible).toBe(false);
    expect(child.inputLatchPolicy).toBe("release-all");
    const forged = structuredClone(imported);
    (forged.manifest.provenance?.bossMemory as { endpoint: { stateHash: string } }).endpoint.stateHash = "0".repeat(16);
    expect(verifyBossMemory(forged).status).not.toBe("verified");
    const missing = { ...imported, tracks: { ...imported.tracks, commands: [] } };
    expect(verifyBossMemory(missing).status).not.toBe("verified");
    expect(JSON.stringify(source)).toBe(before);
    if (process.env.TEAR_BOSS_MEMORY_SOURCE)
      expect(createHash("sha256").update(readFileSync(process.env.TEAR_BOSS_MEMORY_SOURCE)).digest("hex")).toBe(
        "a10f8626194624286af2e6e93052d0acb4ce012aa7ef2d8175e7ed6e090d569a",
      );
  }, 20000);

  it.skipIf(!process.env.TEAR_BOSS_MEMORY_SOURCE)(
    "admits original native Rootbound canopy destination aliases (optional local source)",
    () => {
      expect(mapGhostCapsuleToReplayEnvelope(nativeBossSource()).issues).toEqual([]);
      const snapshot = nativeBossSource().tracks.keyframes.find((e) => e.tick === 1200)?.value as Parameters<
        typeof recordingFreeBossSnapshot
      >[0];
      expect(JSON.stringify((snapshot.state["tear.world.v1"] as { ghost: unknown }).ghost)).not.toBe(
        '{"recording":null}',
      );
      const derived = recordingFreeBossSnapshot(snapshot, "privacy-control");
      expect((derived.state["tear.world.v1"] as { ghost: { recording: unknown } }).ghost.recording).toBeNull();
      const bad = structuredClone(snapshot),
        badBoss = (bad.state["tear.boss.v1"] as { canopyDestination: { platformId: string } }[])[0];
      if (!badBoss) throw new Error("Missing source boss");
      badBoss.canopyDestination.platformId = "missing-slot";
      expect(
        mapGhostCapsuleToReplayEnvelope({
          ...nativeBossSource(),
          tracks: { ...nativeBossSource().tracks, keyframes: [{ kind: "keyframes", tick: 1200, value: bad }] },
        }).issues.length,
      ).toBeGreaterThan(0);
      expect(stableVerificationHash(snapshot)).not.toBe(stableVerificationHash(derived));
    },
  );
});
