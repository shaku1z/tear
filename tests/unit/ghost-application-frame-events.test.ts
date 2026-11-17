import { declareSeedRace, seedRaceInitialBuildHash } from "../../src/ghost/seed-race-contract";
import { seedRaceCatalogHash } from "../../src/gameplay/run/seed-locked-draft";
import { createSeedRaceDecision, readSeedRaceDecisions } from "../../src/ghost/seed-race-decisions";
import { mapGhostCapsuleToReplayEnvelope } from "../../src/ghost/capsule-replay-envelope";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { GhostLocalVault, createMemoryGhostVaultBackend } from "../../src/ghost/capsule-vault";
import { GhostCapsuleReader } from "../../src/ghost/capsule-reader";
import {
  verifyGhostCapsuleOpeningContinuation,
  verifyGhostCapsuleProductionReplay,
} from "../../src/ghost/production-replay-verification";
import {
  createGhostApplicationClockEvent,
  GHOST_APPLICATION_FRAMES_V1,
  readGhostApplicationClockSchedule,
  type GhostApplicationFrameCursor,
} from "../../src/ghost/application-frame-events";
import { createGhostAuthoritativeReceipt } from "../../src/ghost/authoritative-receipt";
import {
  captureProductionReplayCheckpoint,
  createProductionGhostReplayComposition,
} from "../../src/tearbench/production-replay-composition";
import { GhostProductionReplayWorld } from "../../src/ghost/replay-world";
import { createGhostV3, type GhostReplayTrident } from "../../src/ghost/truth-kernel";
import type { GhostReadCapsule } from "../../src/ghost/capsule-reader";
import type { TearSnapshotV1 } from "../../src/tearbench/contracts";
import { createLiveGhostFrameRecording } from "../../src/app/replay/ghost-frame-recording";
import type { LiveGhostRecordingSessionState } from "../../src/app/replay/ghost-recording-session-state";
import { GhostLiveRecorder } from "../../src/ghost/live-recorder";
import { createGhostReplayRunContext, ghostReplayContextFingerprint } from "../../src/ghost/replay-admission";
import { ghostLiveBootstrapEventId } from "../../src/ghost/live-causal-events";
import { issueGhostForkPermit, readGhostForkOrigin, type GhostForkOriginV1 } from "../../src/ghost/fork-origin";
import {
  challengeGoal,
  recordedGhostChallengeChoices,
  verifyRecordedGhostChallenge,
} from "../../src/ghost/recorded-challenge";
import { createLiveGhostChallengeController } from "../../src/app/replay/ghost-challenge-controller";
import { createGhostProductionReplaySession } from "../../src/ghost/production-replay-session";
import { TearGameplayEventBus } from "../../src/gameplay/runtime/gameplay-events";
import { createGameplayCausalEvent } from "../../src/tearbench/gameplay-causal-events";
import { stableVerificationHash } from "../../src/domain/hash";
import { prepareGhostLiveReference } from "../../src/ghost/live-ghost-reference";
import { drawLiveGhostReference } from "../../src/presentation/world/live-ghost-reference";
import type { ReplayActionEnvelope } from "../../src/replay/envelope";
import { reopenRecordedGhostChallenge } from "../../src/ghost/browser-recorded-challenge";
import { createIndexedDbGhostVaultBackend } from "../../src/ghost/indexeddb-vault-backend";
vi.mock("../../src/ghost/indexeddb-vault-backend", () => ({ createIndexedDbGhostVaultBackend: vi.fn() }));

const trident: GhostReplayTrident = {
  command: {
    kind: "command",
    status: "verified",
    available: true,
    resumable: true,
    seekable: false,
    reason: "fixture",
  },
  state: { kind: "state", status: "verified", available: true, resumable: true, seekable: true, reason: "fixture" },
  visual: { kind: "visual", status: "absent", available: false, resumable: false, seekable: false, reason: "fixture" },
};
const binding = { version: 1 as const, runId: "clock-run", sessionId: "clock-session" };
const confirm = { key: false, touch: false, pad: false, click: false };
const begin = (sequence: number, ordinal: number, tick: number) =>
  createGhostApplicationClockEvent(sequence, tick, {
    ...binding,
    format: "tearghost-application-frame",
    kind: "begin",
    ordinal,
    beforeTick: tick,
    seconds: 0.1,
    confirm,
  });
const end = (sequence: number, ordinal: number, beginSequence: number, beforeTick: number, afterTick: number) =>
  createGhostApplicationClockEvent(sequence, afterTick, {
    ...binding,
    format: "tearghost-application-frame",
    kind: "end",
    ordinal,
    beginSequence,
    beforeTick,
    afterTick,
    steps: afterTick - beforeTick,
    introActive: true,
  });

function fixture() {
  const composition = createProductionGhostReplayComposition({ seed: "clock-fixture", mode: "bossonly" });
  const source = composition.create(undefined),
    world = source.replay.world;
  const boss = world.entities.createEnemy("rootbound", 800, 520, world.state.run() as never);
  boss.introT = 1.4;
  world.state.setEnemies([boss]);
  world.state.setBossIntro({ boss, t: 0, dur: 1.4, delay: 0 });
  const origin = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "clock-origin");
  source.advanceApplicationFrame(0.1);
  source.simulation.advanceOne([]);
  source.simulation.advanceOne([]);
  const middle = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "clock-middle");
  const events = [
    begin(1, 1, 0),
    end(2, 1, 1, 0, 2),
    begin(3, 2, 2),
    end(4, 2, 3, 2, 2),
    begin(5, 3, 2),
    end(6, 3, 5, 2, 2),
    begin(7, 4, 2),
    end(8, 4, 7, 2, 3),
  ];
  const receipts = [origin, middle].map((capture, index) => ({
    kind: "results" as const,
    tick: capture.snapshot.tick,
    value: createGhostAuthoritativeReceipt(capture.snapshot.tick, capture.semanticHash, capture.input, {
      version: 1,
      cursor:
        index === 0
          ? { version: 1, ordinal: 0, sequence: 0 }
          : {
              version: 1,
              ordinal: 1,
              sequence: 1,
              open: { ordinal: 1, beginSequence: 1, preludeApplied: true },
            },
      keyframe: { id: capture.snapshot.id, exactHash: capture.snapshot.hashes.exact },
    }),
  }));
  const capsule = {
    manifest: { id: binding.sessionId },
    maxTick: 3,
    tracks: {
      commands: [],
      rng: [],
      presentation: [],
      events: events.map((event) => ({ kind: "events", tick: event.tick, value: event })),
      keyframes: [origin, middle].map(({ snapshot }) => ({ kind: "keyframes", tick: snapshot.tick, value: snapshot })),
      results: receipts,
    },
  } as unknown as GhostReadCapsule;
  return { composition, capsule, origin: origin.snapshot, middle: middle.snapshot };
}

describe("Ghost application-frame evidence", () => {
  it.each(["seek", "reference"] as const)(
    "keeps the native blocked draft scheduler tail through %s",
    async (consumer) => {
      // Source-owned engineered clear at the origin, then real countdown/draft/choice.
      // The source uses the existing native shouldStep lifecycle; no recorded receipts are injected later.
      const vault = new GhostLocalVault(createMemoryGhostVaultBackend()),
        recorder = new GhostLiveRecorder({
          createVault: () => Promise.resolve(vault),
          now: () => "2026-10-20T00:00:01Z",
        });
      const bus = new TearGameplayEventBus();
      let nativeTick = 0,
        sequence = 0;
      bus.setTickSource(() => nativeTick);
      bus.subscribe((event) => {
        if (recorder.active)
          recorder.record(
            "events",
            event.tick,
            createGameplayCausalEvent(event, ++sequence, `tail-native-${String(sequence)}`, "engine"),
          );
      });
      const source = createProductionGhostReplayComposition({
        seed: "draft-tail-source",
        mode: "endless",
        gameplayEvents: bus,
      }).create(undefined);
      const run = source.replay.world.state.run();
      if (!run) throw new Error("source run missing");
      run.spawnQueue = [];
      source.replay.world.state.setEnemies([]);
      const initial = captureProductionReplayCheckpoint(
        source.replay,
        source.combat,
        source.waveReward,
        "tail-initial",
      );
      run.seedRace = declareSeedRace({
        format: "tear-seed-race",
        version: 1,
        mode: "endless",
        difficulty: run.diff,
        weapon: run.weaponId,
        boss: "shuffle",
        seed: run.runSeed,
        metaRanks: {},
        variantDiscovery: run.variantDiscovery ?? [],
        headstartId: null,
        initialBuildHash: seedRaceInitialBuildHash(initial.snapshot.state),
        baselineHash: stableVerificationHash(source.replay.configuration.baseSnapshot()),
        build: initial.snapshot.provenance.build,
        draft: { policy: "seed-locked-common-offers.v1", seed: run.runSeed, catalogHash: seedRaceCatalogHash() },
      });
      source.waveReward.reward.reset();
      const runId = "draft-tail-run",
        id = "draft-tail-capsule";
      const context = createGhostReplayRunContext({
        runId,
        seed: initial.snapshot.seed,
        mode: "endless",
        difficulty: run.diff,
        weaponId: run.weaponId,
        ticksPerSecond: 120,
        initialState: "seeded-run-start",
        build: initial.snapshot.provenance.build,
        rng: initial.snapshot.rng,
      });
      const capture = () => {
        const value = captureProductionReplayCheckpoint(
          source.replay,
          source.combat,
          source.waveReward,
          `tail-${String(nativeTick)}`,
          context.build,
        );
        const snapshot = {
          ...value.snapshot,
          provenance: { ...value.snapshot.provenance, sourceId: ghostLiveBootstrapEventId(id) },
        };
        recorder.record("keyframes", nativeTick, snapshot);
        recorder.record("rng", nativeTick, snapshot.rng);
        recorder.record(
          "results",
          nativeTick,
          createGhostAuthoritativeReceipt(nativeTick, value.semanticHash, value.input),
        );
        return { ...value, snapshot };
      };
      recorder.start({
        sessionId: id,
        createdAt: "2026-10-20T00:00:00Z",
        provenance: { replayContext: context, seedRace: run.seedRace },
      });
      const origin = capture();
      let opened = 0,
        selected = 0,
        drains = 0,
        afterOpen: string | undefined;
      for (let tick = 1; tick <= 120; tick++) {
        nativeTick = tick;
        const executed = source.simulation.advanceExact(
          () => {
            drains++;
            const actions: ReplayActionEnvelope[] =
              tick === 1
                ? [{ kind: "command", tick, id: 1, command: { type: "move", x: 1000, y: 0 } }]
                : selected && tick === selected + 1
                  ? [{ kind: "command", tick, id: 2, command: { type: "move", x: 0, y: 0 } }]
                  : [];
            actions.forEach((action) => {
              recorder.record("commands", tick, action);
            });
            return actions;
          },
          { shouldStep: () => source.waveReward.screen() === "playing" },
        );
        if (!opened && source.waveReward.screen() === "draft") {
          opened = tick;
          afterOpen = JSON.stringify({
            input: source.simulation.input.snapshot(),
            seconds: source.replay.world.context.services.clock.seconds(),
            runTime: run.runTime,
          });
        } else if (opened && !selected) {
          expect(executed.steps).toBe(0);
          expect(
            JSON.stringify({
              input: source.simulation.input.snapshot(),
              seconds: source.replay.world.context.services.clock.seconds(),
              runTime: run.runTime,
            }),
          ).toBe(afterOpen);
        }
        if (opened && tick === opened + 2) {
          const before = source.waveReward.reward.snapshot();
          if (!before) throw new Error("draft missing");
          const decision = createSeedRaceDecision(++sequence, tick, runId, run.seedRace.sharedHash, before, {
            kind: "draft",
            index: 0,
          });
          recorder.record("events", tick, decision);
          source.waveReward.reward.decide({ kind: "draft", index: 0 }, decision.sequence);
          selected = tick;
        }
      }
      expect(opened).toBeGreaterThan(1);
      expect(selected).toBe(opened + 2);
      expect(drains).toBe(118);
      const expected = capture();
      await recorder.finish();
      const capsule = await new GhostCapsuleReader(vault).read(id),
        raw = await vault.exportCapsule(id);
      expect(verifyGhostCapsuleProductionReplay(capsule).status).toBe("verified");
      if (consumer === "reference") {
        const reference = await prepareGhostLiveReference(capsule, () => Promise.resolve());
        expect(reference.frames.at(-1)).toMatchObject({ tick: 120, time: run.runTime, wave: 2 });
      } else {
        const mapped = mapGhostCapsuleToReplayEnvelope(capsule);
        const composition = createProductionGhostReplayComposition({
          seed: origin.snapshot.seed,
          raceDecisions: readSeedRaceDecisions(capsule, runId),
          inputSnapshots: new Map([[0, origin.input]]),
        });
        let restored: ReturnType<typeof composition.create> | undefined;
        const replay = new GhostProductionReplayWorld(
          createGhostV3({ ...mapped.ghost, snapshots: [origin.snapshot] }),
          {
            create(snapshot) {
              restored = composition.create(snapshot);
              return restored;
            },
          },
        );
        expect(replay.seek(120).semanticHash).toBe(expected.semanticHash);
        expect(restored?.simulation.scheduler.tick).toBe(120);
        expect(restored?.simulation.input.snapshot()).toEqual(expected.input);
        expect(restored?.replay.world.context.services.clock.seconds()).toBe(
          source.replay.world.context.services.clock.seconds(),
        );
        expect(restored?.waveReward.reward.snapshot()?.decisionSequence).toBe(
          source.waveReward.reward.snapshot()?.decisionSequence,
        );
      }
      expect(await vault.exportCapsule(id)).toBe(raw);
    },
  );

  it.skipIf(process.env.TEAR_R07_ORIGINAL_ARCHIVE === undefined)(
    "continues an original normal downloaded intro archive",
    async () => {
      const path = process.env.TEAR_R07_ORIGINAL_ARCHIVE;
      if (path === undefined) throw new Error("original archive path missing");
      const encoded = readFileSync(path, "utf8"),
        vault = new GhostLocalVault(createMemoryGhostVaultBackend());
      const manifest = await vault.importCapsule(encoded),
        capsule = await new GhostCapsuleReader(vault).read(manifest.id);
      const continued = verifyGhostCapsuleOpeningContinuation(capsule),
        verification = verifyGhostCapsuleProductionReplay(capsule);
      console.info(JSON.stringify({ continued, verification }));
      expect(verification.status, JSON.stringify(verification)).toBe("verified");
      expect(continued.status, JSON.stringify(continued)).toBe("verified");
      expect(await vault.exportCapsule(manifest.id)).toBe(encoded);
    },
  );
  it("replays ordered zero-tick frames and skips the prelude already reflected in a mid-frame keyframe", () => {
    const value = fixture(),
      schedule = readGhostApplicationClockSchedule(value.capsule, binding.runId, true);
    if (schedule === undefined) throw new Error("clock schedule missing");
    for (const snapshots of [[value.origin], [value.origin, value.middle]]) {
      const composition = createProductionGhostReplayComposition({
        seed: "clock-fixture",
        mode: "bossonly",
        applicationClock: schedule,
      });
      let current: ReturnType<typeof composition.create> | undefined;
      const replay = new GhostProductionReplayWorld(
        createGhostV3({
          id: "clock-fixture",
          rulesetVersion: "test",
          sourceClassification: "native-v3",
          trident,
          actions: [],
          snapshots,
          events: [],
        }),
        {
          create(snapshot: TearSnapshotV1 | undefined) {
            current = composition.create(snapshot);
            return current;
          },
        },
      );
      replay.seek(3);
      expect(current?.replay.world.state.bossIntro()?.t).toBeCloseTo(0.4, 12);
      expect(current?.simulation.scheduler.tick).toBe(3);
      expect(current?.replay.world.context.services.clock.seconds()).toBeCloseTo(3 / 120, 12);
    }
  });

  it("refuses incomplete, mismatched and substituted frame provenance without changing original capsule bytes", () => {
    const { capsule } = fixture(),
      bytes = JSON.stringify(capsule);
    const replace = (
      events = capsule.tracks.events,
      results = capsule.tracks.results,
      keyframes = capsule.tracks.keyframes,
    ) => ({
      ...capsule,
      tracks: { ...capsule.tracks, events, results, keyframes },
    });
    expect(() =>
      readGhostApplicationClockSchedule(replace(capsule.tracks.events.slice(0, -1)), binding.runId, true),
    ).toThrow(/incomplete/);
    expect(() => readGhostApplicationClockSchedule(capsule, "other-run", true)).toThrow(/run\/session/);
    expect(() => readGhostApplicationClockSchedule(capsule, binding.runId, false)).toThrow(/declaration/);
    const middle = capsule.tracks.results[1];
    if (middle === undefined) throw new Error("middle receipt missing");
    const firstReceipt = capsule.tracks.results[0],
      firstKeyframe = capsule.tracks.keyframes[0];
    if (firstReceipt === undefined || firstKeyframe === undefined) throw new Error("origin fixture missing");
    const raw = middle.value as { applicationFrames: { cursor: GhostApplicationFrameCursor } };
    const changed = {
      ...middle,
      value: {
        ...(middle.value as object),
        applicationFrames: { ...raw.applicationFrames, cursor: { ...raw.applicationFrames.cursor, sequence: 0 } },
      },
    };
    expect(() =>
      readGhostApplicationClockSchedule(replace(undefined, [firstReceipt, changed]), binding.runId, true),
    ).toThrow(/cursor|frontier/);
    const keyframe = capsule.tracks.keyframes[1];
    if (keyframe === undefined) throw new Error("middle keyframe missing");
    expect(() =>
      readGhostApplicationClockSchedule(
        replace(undefined, undefined, [
          firstKeyframe,
          { ...keyframe, value: { ...(keyframe.value as object), id: "substituted" } },
        ]),
        binding.runId,
        true,
      ),
    ).toThrow(/unique exact/);
    expect(JSON.stringify(capsule)).toBe(bytes);
  });

  it("retains a terminal frame end before finish and never finalizes a replacement recorder", () => {
    let tick = 4,
      sequence = 0,
      context = { run: { id: binding.runId }, simulation: { applicationFrames: GHOST_APPLICATION_FRAMES_V1 } };
    const old = {
      active: true,
      activeSessionId: binding.sessionId,
      record: vi.fn(),
      finish: vi.fn(() => Promise.resolve(null)),
    };
    let recorder = old;
    const session = {
      recorder: () => recorder,
      replayContext: () => context,
      setReplayContext: vi.fn(),
      nextEventSequence: () => ++sequence,
    } as unknown as LiveGhostRecordingSessionState;
    const frames = createLiveGhostFrameRecording({ session, tick: () => tick, introActive: () => true });
    frames.begin(0.01, confirm);
    frames.preludeApplied();
    frames.finish({ outcome: "defeated" });
    expect(old.finish).not.toHaveBeenCalled();
    tick = 5;
    frames.end(1);
    expect(old.record.mock.calls.at(-1)?.[2]).toMatchObject({ payload: { kind: "end", afterTick: 5, steps: 1 } });
    expect(old.finish).toHaveBeenCalledOnce();
    frames.reset();
    frames.begin(0.01, confirm);
    frames.finish({ outcome: "defeated" });
    const replacement = {
      ...old,
      activeSessionId: "replacement",
      record: vi.fn(),
      finish: vi.fn(() => Promise.resolve(null)),
    };
    recorder = replacement;
    context = { ...context, run: { id: "replacement-run" } };
    frames.reset();
    expect(replacement.finish).not.toHaveBeenCalled();
  });

  it("records actual chosen frame inputs for cinema installation before prelude, without retroactive simulation advancement", () => {
    let sequence = 0,
      active = false;
    const recorder = { active: true, activeSessionId: binding.sessionId, record: vi.fn() };
    const session = {
      recorder: () => recorder,
      replayContext: () => ({
        run: { id: binding.runId },
        simulation: { applicationFrames: GHOST_APPLICATION_FRAMES_V1 },
      }),
      nextEventSequence: () => ++sequence,
    } as unknown as LiveGhostRecordingSessionState;
    const frames = createLiveGhostFrameRecording({ session, tick: () => 4, introActive: () => active });
    frames.begin(0.037, { ...confirm, click: true });
    active = true;
    frames.installed("boss-1", 1.4, 0.12);
    frames.preludeApplied();
    frames.end(0);
    expect(recorder.record.mock.calls.map((call) => (call[2] as { payload: unknown }).payload)).toMatchObject([
      { kind: "begin", seconds: 0.037, confirm: { click: true } },
      { actorId: "boss-1", delay: 0.12 },
      { kind: "end", steps: 0 },
    ]);
    active = false;
    recorder.record.mockClear();
    frames.begin(0.023, confirm);
    frames.preludeApplied();
    active = true;
    frames.installed("boss-2", 1.4, 0);
    frames.end(0);
    expect(recorder.record.mock.calls).toHaveLength(1);
    expect(recorder.record.mock.calls[0]?.[2]).toMatchObject({
      payload: { format: "tearghost-intro-install", actorId: "boss-2" },
    });
    // A raw fixed tick outside any application frame records no clock witness.
    recorder.record.mockClear();
    frames.installed("boss-3", 1.4, 0);
    expect(recorder.record).not.toHaveBeenCalled();
  });
});

describe("Recorded local challenge continuation", () => {
  it("records a real nonzero fork, reexecutes its catch goal, seals abandoned attempts and preserves parent custody", async () => {
    const vault = new GhostLocalVault(createMemoryGhostVaultBackend()),
      reader = new GhostCapsuleReader(vault);
    vi.mocked(createIndexedDbGhostVaultBackend).mockResolvedValue(vault.backend());
    const recorder = new GhostLiveRecorder({
      createVault: () => Promise.resolve(vault),
      now: () => "2026-10-19T00:00:01Z",
      maxStagingEntries: 4096,
    });
    const bus = new TearGameplayEventBus();
    let nativeTick = 0,
      sequence = 0;
    bus.setTickSource(() => nativeTick);
    bus.subscribe((event) => {
      if (recorder.active)
        recorder.record(
          "events",
          event.tick,
          createGameplayCausalEvent(event, ++sequence, `native-${String(sequence)}`, "engine"),
        );
    });
    const source = createProductionGhostReplayComposition({
      seed: "challenge-source",
      mode: "endless",
      gameplayEvents: bus,
    }).create(undefined);
    const first = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "parent-origin");
    const context = createGhostReplayRunContext({
      runId: "challenge-source-run",
      seed: first.snapshot.seed,
      mode: "endless",
      difficulty: "normal",
      weaponId: "sword",
      ticksPerSecond: 120,
      initialState: "seeded-run-start",
      applicationFrames: GHOST_APPLICATION_FRAMES_V1,
      build: first.snapshot.provenance.build,
      rng: first.snapshot.rng,
    });
    const capture = (session: typeof source, id: string) => {
      const value = captureProductionReplayCheckpoint(
        session.replay,
        session.combat,
        session.waveReward,
        `${id}-${String(session.simulation.scheduler.tick)}`,
        context.build,
      );
      const snapshot = {
        ...value.snapshot,
        provenance: { ...value.snapshot.provenance, sourceId: ghostLiveBootstrapEventId(id) },
      };
      recorder.record("keyframes", snapshot.tick, snapshot);
      recorder.record("rng", snapshot.tick, snapshot.state["tear.rng.v1"]);
      const receipt = createGhostAuthoritativeReceipt(snapshot.tick, value.semanticHash, value.input, {
        version: 1,
        cursor: { version: 1, ordinal: 0, sequence: 0 },
        keyframe: { id: snapshot.id, exactHash: snapshot.hashes.exact },
      });
      recorder.record("results", snapshot.tick, receipt);
      return { snapshot, receipt };
    };
    const actionsAt = (tick: number, early = false): ReplayActionEnvelope[] =>
      tick === (early ? 121 : 140)
        ? [{ kind: "command", tick, id: 1, command: { type: "weapon", intent: "throw", phase: "pressed" } }]
        : tick === (early ? 131 : 150)
          ? [{ kind: "command", tick, id: 2, command: { type: "weapon", intent: "recall", phase: "pressed" } }]
          : [];
    recorder.start({
      sessionId: "challenge-parent",
      createdAt: "2026-10-19T00:00:00Z",
      provenance: { replayContext: context },
    });
    capture(source, "challenge-parent");
    let checkpoint: ReturnType<typeof capture> | undefined;
    for (let tick = 1; tick <= 300; tick++) {
      nativeTick = tick;
      const actions = actionsAt(tick);
      actions.forEach((action) => {
        recorder.record("commands", tick, action);
      });
      source.simulation.advanceOne(actions);
      if (tick === 120) checkpoint = capture(source, "challenge-parent");
    }
    capture(source, "challenge-parent");
    await recorder.finish();
    const parent = await reader.read("challenge-parent"),
      original = await vault.exportCapsule(parent.manifest.id),
      parentSession = createGhostProductionReplaySession(parent);
    const reference = await prepareGhostLiveReference(parent, () => Promise.resolve());
    const pose = reference.frames.find((frame) => frame.tick === 120);
    if (pose === undefined || checkpoint === undefined) throw new Error("Actual reference/checkpoint absent");
    const capturedPlayer = checkpoint.snapshot.state["tear.player.v1"] as { x: number; y: number };
    expect(pose.player).toMatchObject({ x: capturedPlayer.x, y: capturedPlayer.y });
    expect(reference.assistance).toMatchObject({
      sourceId: parent.manifest.id,
      competitiveEligible: false,
      actor: "unknown",
    });
    await expect(
      prepareGhostLiveReference(
        {
          ...parent,
          manifest: {
            ...parent.manifest,
            provenance: { ...parent.manifest.provenance, ghostAssistance: reference.assistance },
          },
        },
        () => Promise.resolve(),
      ),
    ).rejects.toThrow(/unassisted/);
    const divergent = {
      ...parent,
      tracks: {
        ...parent.tracks,
        commands: parent.tracks.commands.map((entry) =>
          entry.tick !== 140
            ? entry
            : { ...entry, value: { kind: "command", tick: 140, id: 1, command: { type: "move", x: 1000, y: 0 } } },
        ),
      },
    };
    // Same-tick restored receipts alone remain valid; the displayed origin-forward world must also agree.
    expect(verifyGhostCapsuleProductionReplay(divergent).status).toBe("verified");
    await expect(prepareGhostLiveReference(divergent, () => Promise.resolve())).rejects.toThrow(
      /forward continuation.*receipt/,
    );
    const painted = createProductionGhostReplayComposition({ seed: first.snapshot.seed }).create(first.snapshot);
    const hidden = createProductionGhostReplayComposition({ seed: first.snapshot.seed }).create(first.snapshot);
    const canvas = new Proxy({}, { get: () => () => undefined, set: () => true }) as CanvasRenderingContext2D;
    for (let tick = 1; tick <= 180; tick++) {
      painted.simulation.advanceOne(actionsAt(tick));
      hidden.simulation.advanceOne(actionsAt(tick));
      drawLiveGhostReference(canvas, { active: true, visible: true, message: "", pose });
      drawLiveGhostReference(canvas, { active: true, visible: false, message: "" });
      expect(painted.simulation.lastResult?.state).toEqual(hidden.simulation.lastResult?.state);
      expect(painted.replay.world.context.services.random.snapshot()).toEqual(
        hidden.replay.world.context.services.random.snapshot(),
      );
    }
    expect(await vault.exportCapsule(parent.manifest.id)).toBe(original);
    const definition = recordedGhostChallengeChoices(parent, checkpoint.snapshot).find(
      (choice) => choice.rule === "blade-return",
    );
    if (definition === undefined)
      throw new Error(
        `Actual source catch/checkpoint missing: ${JSON.stringify({ screen: source.waveReward.screen(), blade: source.replay.world.state.blade()?.state, events: parent.tracks.events.map((entry) => entry.value).filter((value) => typeof value === "object" && value !== null && "type" in value && String(value.type).startsWith("blade.")) })}`,
      );
    expect(definition.forkTick).toBe(120);
    expect(parentSession.seek(120).tick).toBe(120);
    const child = { ...parentSession.forkPractice(120, "race-practice"), challenge: definition };
    for (const stop of [false, true]) {
      sequence = 0;
      const id = stop ? "challenge-stopped" : "challenge-caught";
      const session = createProductionGhostReplayComposition({ seed: context.run.seed, gameplayEvents: bus }).create(
        child.snapshot,
      );
      session.simulation.input.beginTick(120, []);
      const anchor = captureProductionReplayCheckpoint(
        session.replay,
        session.combat,
        session.waveReward,
        `${id}-origin`,
        context.build,
      );
      const origin: GhostForkOriginV1 = {
        format: "tearghost-fork-origin",
        schemaVersion: 1,
        parent: {
          capsuleId: parent.manifest.id,
          rootIntegrity: parent.manifest.rootIntegrity,
          replayRootHash: parentSession.sourceRootHash,
          contextHash: ghostReplayContextFingerprint(context),
        },
        checkpoint: {
          id: checkpoint.snapshot.id,
          tick: 120,
          exactHash: checkpoint.snapshot.hashes.exact,
          semanticHash: checkpoint.snapshot.hashes.semantic,
          receiptHash: stableVerificationHash(checkpoint.receipt),
        },
        childAnchor: {
          id: `${id}-120`,
          exactHash: anchor.snapshot.hashes.exact,
          semanticHash: anchor.snapshot.hashes.semantic,
          inputHash: stableVerificationHash(
            createGhostAuthoritativeReceipt(120, anchor.semanticHash, anchor.input).input,
          ),
          configurationHash: stableVerificationHash(anchor.snapshot.state["tear.configuration.v1"]),
          rngHash: stableVerificationHash(anchor.snapshot.state["tear.rng.v1"]),
        },
        inputPolicy: "release-all",
        framePolicy: "fresh-child-frame-from-committed-frontier",
        sourceFrameReceiptHash: stableVerificationHash(checkpoint.receipt.applicationFrames),
        challengeHash: stableVerificationHash(definition),
      };
      recorder.start({
        sessionId: id,
        createdAt: "2026-10-19T00:00:00Z",
        provenance: { replayContext: context, forkOrigin: origin, challenge: definition },
      });
      capture(session, id);
      let finalTick = 120;
      const observed: ReturnType<typeof createGameplayCausalEvent>[] = [];
      const unsubscribe = bus.subscribe((event) => {
        observed.push(
          createGameplayCausalEvent(event, observed.length + 1, `goal-${String(observed.length)}`, "engine"),
        );
      });
      if (stop) {
        let paused = false,
          endpoint: ReturnType<typeof capture> | undefined,
          finished: Promise<unknown> | undefined;
        const owner = createLiveGhostChallengeController({
          prepare: () => Promise.resolve({ ok: true, child, semanticHash: anchor.semanticHash }),
          pause: () => {
            paused = true;
          },
          notice: () => undefined,
          captureEndpoint(tick) {
            session.waveReward.restoreScreen("confirmquit");
            endpoint = capture(session, id);
            finalTick = tick;
          },
          finish(reason, tick) {
            const result = recorder
              .finish({ format: "tearghost-challenge-end", reason, authoritativeTick: tick, originTick: 120 })
              .then(async () => {
                const sealed = await reader.read(id);
                return verifyRecordedGhostChallenge(sealed, parent, issueGhostForkPermit(sealed, parent));
              });
            finished = result;
            return result;
          },
        });
        const launching = owner.launch(child);
        if (!launching.ok) await launching.completion;
        session.simulation.advance(25, () => [], {
          shouldStep: () => !paused,
          beforeStep(tick) {
            nativeTick = tick;
          },
          afterStep(tick) {
            owner.afterStep(tick);
            owner.stop();
          },
        });
        expect(session.simulation.scheduler.tick).toBe(123);
        expect(endpoint?.snapshot.tick).toBe(121);
        expect(endpoint?.receipt.input.tick).toBe(121);
        expect(finished).toBeDefined();
        await finished;
      } else {
        for (let tick = 121; tick <= 120 + definition.limitTicks; tick++) {
          nativeTick = tick;
          const actions = actionsAt(tick, true);
          actions.forEach((action) => {
            recorder.record("commands", tick, action);
          });
          session.simulation.advanceOne(actions);
          finalTick = tick;
          if (challengeGoal(definition, observed) !== undefined) break;
        }
        capture(session, id);
        await recorder.finish({
          format: "tearghost-challenge-end",
          reason: "goal",
          authoritativeTick: finalTick,
          originTick: 120,
        });
      }
      unsubscribe();
      const capsule = await reader.read(id),
        permit = issueGhostForkPermit(capsule, parent),
        result = verifyRecordedGhostChallenge(capsule, parent, permit);
      expect(result.status).toBe(stop ? "abandoned" : "succeeded");
      expect(result.finalTick).toBeGreaterThan(120);
      expect(result.proof.completed).toBe(!stop);
      const reopened = createGhostProductionReplaySession(capsule, {}, permit);
      expect(reopened.firstTick).toBe(120);
      expect(reopened.lastTick).toBe(finalTick);
      expect(reopened.seek(finalTick).tick).toBe(finalTick);
      expect(() => reopened.seek(119)).toThrow(/range/);
      expect(() => reopened.seek(finalTick + 1)).toThrow(/range/);
      expect(() => reopened.forkPractice(finalTick, "exact-practice")).toThrow(/Nested/);
      expect(() => createGhostProductionReplaySession(capsule)).toThrow(/admission/);
      expect(() =>
        issueGhostForkPermit(capsule, { ...parent, manifest: { ...parent.manifest, rootIntegrity: "changed" } }),
      ).toThrow(/changed/);
      expect(() => readGhostForkOrigin({ forkOrigin: { ...origin, schemaVersion: 99 } })).toThrow(/Unsupported/);
      expect(verifyRecordedGhostChallenge(await reader.read(id), parent, permit)).toEqual(result);
      const fakeDefeat = {
        ...capsule,
        tracks: {
          ...capsule.tracks,
          results: capsule.tracks.results.map((entry) => {
            if (
              typeof entry.value !== "object" ||
              entry.value === null ||
              !("format" in entry.value) ||
              entry.value.format !== "tearghost-challenge-end"
            )
              return entry;
            return { ...entry, value: { ...entry.value, reason: "defeated" } };
          }),
        },
      };
      expect(() => verifyRecordedGhostChallenge(fakeDefeat, parent, permit)).toThrow(/endpoint disagrees/);
      const persisted = await reopenRecordedGhostChallenge({} as IDBFactory, capsule, true);
      expect(persisted?.result).toEqual(result);
      const resultBytes = await vault.backend().get("analysis", `recorded-challenge:${id}`);
      expect(resultBytes).toBe(JSON.stringify(result));
      expect((await reopenRecordedGhostChallenge({} as IDBFactory, capsule, true))?.result).toEqual(result);
      expect(await vault.backend().get("analysis", `recorded-challenge:${id}`)).toBe(resultBytes);
    }
    expect(await vault.exportCapsule(parent.manifest.id)).toBe(original);
  }, 30000);

  it("invalidates preparation before replacement and never clears a newer owner on late rejection", async () => {
    let signal: AbortSignal | undefined, reject: ((error: Error) => void) | undefined;
    const prepare = vi.fn((_child, owner: AbortSignal) => {
      signal = owner;
      return new Promise<never>((_resolve, fail) => {
        reject = fail;
      });
    });
    const controller = createLiveGhostChallengeController({
      prepare,
      finish: vi.fn(),
      pause: vi.fn(),
      notice: vi.fn(),
    });
    const child = { challenge: {} } as unknown as Parameters<typeof controller.launch>[0];
    const first = controller.launch(child);
    controller.reset();
    expect(signal?.aborted).toBe(true);
    const oldReject = reject;
    controller.launch(child);
    oldReject?.(new Error("old source unavailable"));
    if (!first.ok) await first.completion;
    expect(controller.active()).toBe(true);
    const refused = controller.launch(child);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toContain("already active");
    controller.reset();
    reject?.(new Error("cancelled"));
  });
});
