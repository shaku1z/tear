/// <reference types="vite/client" />
import { createLiveSeedRace } from "../../src/app/replay/seed-race-composition";
import { createMetaProgression } from "../../src/gameplay/progression/meta";
import { seedRaceInitialBuildHash } from "../../src/ghost/seed-race-contract";
import { describe, expect, it, vi } from "vitest";
import { LiveRunStartController } from "../../src/gameplay/run/live-run-start-controller";
import { createSurfaceAvailability } from "../../src/domain/surface-availability";
import { createLiveRunStartHost } from "../../src/app/run/run-start-host";
import { createLiveGhostOpeningCapture } from "../../src/app/replay/ghost-opening-capture";
import { GhostLiveRecorder } from "../../src/ghost/live-recorder";
import * as productionReplayComposition from "../../src/tearbench/production-replay-composition";
import { validateTearContract } from "../../src/tearbench/validation";
import {
  createProductionGhostReplayComposition,
  captureProductionReplayCheckpoint,
} from "../../src/tearbench/production-replay-composition";
import { REMOTE } from "../../src/config/game-config";
import { applyWeapon } from "../../src/gameplay/weapons";
import { newMods, UPGRADES, applyUpgrade } from "../../src/gameplay/upgrades";
import {
  GhostCapsuleReader,
  GhostLocalVault,
  GhostStreamingRecorder,
  createLiveGhostBootstrapEvent,
  createMemoryGhostVaultBackend,
  ghostLiveBootstrapEventId,
} from "../../src/ghost";
import {
  assessGhostReplayBootstrap,
  createGhostReplayRunContext,
  issueGhostRecordedOpeningPermit,
  readGhostRecordedOpeningPermit,
  readGhostReplayRunContext,
  type GhostRecordedOpeningPermit,
} from "../../src/ghost/replay-admission";
import { createLiveGhostCausalEvent } from "../../src/ghost/live-causal-events";
import { createGhostAuthoritativeReceipt } from "../../src/ghost/authoritative-receipt";
import { mapGhostCapsuleToReplayEnvelope } from "../../src/ghost/capsule-replay-envelope";
import { GhostProductionReplayWorld } from "../../src/ghost/replay-world";
import { createGhostV3 } from "../../src/ghost/truth-kernel";
import { TearGameplayEventBus, type UntickedTearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";
import {
  verifyGhostCapsuleProductionReplay,
  verifyGhostCapsuleOpeningContinuation,
} from "../../src/ghost/production-replay-verification";
import { createGhostProductionReplaySession } from "../../src/ghost/production-replay-session";
import { stableVerificationHash } from "../../src/domain/hash";
import type { ReplayActionEnvelope } from "../../src/replay/envelope";
import { restoreProductionReplaySnapshot } from "../../src/tearbench/production-replay-composition";
import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";
import { createDefaultStateCodecRegistry, type TearCodecWorld } from "../../src/tearbench/state-codecs";
import type { GhostReadCapsule } from "../../src/ghost/capsule-reader";
import type { TearCausalEventV1, TearSnapshotV1 } from "../../src/tearbench/contracts";
import { AppStateController } from "../../src/app/interface/app-state-controller";
import { createLiveGhostReferenceController } from "../../src/app/replay/ghost-reference-controller";
import type { GhostLiveReference } from "../../src/ghost/live-ghost-reference-data";
import type { GameRun } from "../../src/gameplay/runtime/game-runtime-state";

/** Disclosed legacy-format model, authored before sealing. No historical archive is rewritten. */
async function sealedLegacyAim(
  magnitudes: readonly number[],
  options: Readonly<{
    legacyOpening?: boolean;
    freshLater?: boolean;
    invalidHistory?: boolean;
    extraInputField?: boolean;
    seeded?: boolean;
    initialMagnitude?: number;
  }> = {},
) {
  const receiptTick = 1;
  const fixture = actualOpeningHost(options.seeded === true ? "playing" : "menu");
  fixture.controller.start("endless", "normal");
  let capture = fixture.captured();
  const boundary = fixture.boundary();
  if (capture === undefined || boundary === undefined) throw new Error("opening missing");
  if (options.initialMagnitude !== undefined) {
    // Constructed source-owned input edge before archival sealing, not a historical producer claim.
    fixture.source.simulation.input.restore({
      ...fixture.source.simulation.input.snapshot(),
      aimMagnitude: options.initialMagnitude,
    });
    capture = captureProductionReplayCheckpoint(
      fixture.source.replay,
      fixture.source.combat,
      fixture.source.waveReward,
      capture.snapshot.id,
    );
  }
  const id = "legacy-aim-model",
    run = fixture.source.replay.world.state.run();
  if (run === null) throw new Error("source run missing");
  const context = createGhostReplayRunContext({
    runId: boundary.runId,
    seed: boundary.seed,
    mode: run.mode,
    difficulty: run.diff,
    weaponId: run.weaponId,
    ticksPerSecond: 120,
    build: capture.snapshot.provenance.build,
    rng: fixture.source.replay.random.streams.snapshot(),
    ...(options.seeded === true ? { initialState: "seeded-run-start" as const } : {}),
    ...(options.seeded === true
      ? {}
      : {
          opening: {
            version: 1,
            phase: boundary.phase,
            previousScreen: "menu",
            destination: "playing",
            runId: boundary.runId,
          },
        }),
  });
  const provenance = { replayContext: context },
    vault = new GhostLocalVault(createMemoryGhostVaultBackend());
  const recorder = new GhostStreamingRecorder({
    sessionId: id,
    createdAt: "2026-10-19T00:00:00Z",
    chunkEntries: 16,
    maxPendingWrites: 16,
    vault,
    provenance,
  });
  await recorder.start();
  await recorder.append({ kind: "events", tick: 0, value: createLiveGhostBootstrapEvent(id, provenance) });
  for (const event of fixture.events) await recorder.append({ kind: "events", tick: 0, value: event });
  const anchor = {
    ...capture.snapshot,
    provenance: { ...capture.snapshot.provenance, sourceId: ghostLiveBootstrapEventId(id) },
  };
  await recorder.append({ kind: "keyframes", tick: 0, value: anchor });
  // Tick-zero receipt is fresh and explicit, so only the requested later legacy omission is under test.
  const legacyOpeningInput = { ...capture.input };
  delete legacyOpeningInput.aimMagnitude;
  const openingReceipt = createGhostAuthoritativeReceipt(0, capture.semanticHash, capture.input);
  await recorder.append({
    kind: "results",
    tick: 0,
    value:
      options.legacyOpening === true
        ? {
            ...openingReceipt,
            input: legacyOpeningInput,
            stateHash: stableVerificationHash({ ...fixture.source.semanticProjection(), input: legacyOpeningInput }),
          }
        : openingReceipt,
  });
  const actions: ReplayActionEnvelope[] = magnitudes.map((magnitude, index) => ({
    kind: "command",
    id: index + 1,
    tick: 1,
    command: { type: "aim", turn: 125000, magnitude },
  }));
  let state = fixture.source.semanticProjection();
  for (let tick = 1; tick <= receiptTick; tick++) {
    const commands = tick === 1 ? actions : [];
    for (const command of commands)
      await recorder.append({
        kind: "commands",
        tick,
        value: options.invalidHistory === true ? { ...command, id: 0 } : command,
      });
    state = fixture.source.simulation.advanceOne(commands).state;
  }
  const checkpoint = captureProductionReplayCheckpoint(
    fixture.source.replay,
    fixture.source.combat,
    fixture.source.waveReward,
    "legacy-aim-same-tick",
  );
  await recorder.append({
    kind: "keyframes",
    tick: receiptTick,
    value: {
      ...checkpoint.snapshot,
      provenance: { ...checkpoint.snapshot.provenance, sourceId: ghostLiveBootstrapEventId(id) },
    },
  });
  const input = { ...fixture.source.simulation.input.snapshot() };
  delete input.aimMagnitude;
  // The old projection omitted magnitude even when actual held aim was partial/zero.
  const receipt =
    options.freshLater === true
      ? createGhostAuthoritativeReceipt(
          receiptTick,
          stableVerificationHash(state),
          fixture.source.simulation.input.snapshot(),
        )
      : { ...createGhostAuthoritativeReceipt(receiptTick, stableVerificationHash({ ...state, input }), input), input };
  const archived =
    options.extraInputField === true ? { ...receipt, input: { ...receipt.input, unsupportedField: true } } : receipt;
  await recorder.append({ kind: "results", tick: receiptTick, value: archived });
  await recorder.finalize("2026-10-19T00:00:01Z");
  return new GhostCapsuleReader(vault).read(id);
}

function rehashOpening(snapshot: TearSnapshotV1): TearSnapshotV1 {
  const registry = createDefaultStateCodecRegistry(),
    world: TearCodecWorld = {
      components: new Map(Object.entries(snapshot.state) as never),
      references: new Map(),
      entityIds: new Set(),
    };
  return {
    ...snapshot,
    hashes: {
      ...snapshot.hashes,
      exact: stableVerificationHash(snapshot.state),
      semantic: stableVerificationHash(
        Object.fromEntries(registry.list().map((codec) => [codec.id, codec.hashProjection(world)])),
      ),
    },
  };
}

function openingDestinationEvidence(target: ReturnType<typeof createProductionReplayWorld>) {
  const refs = [
    target.world.state.run(),
    target.world.state.player(),
    target.world.state.blade(),
    target.world.state.enemies(),
    target.world.state.projectiles(),
    target.configuration.value,
    target.stage.platforms,
  ];
  const capture = () => ({
    actors: JSON.parse(
      JSON.stringify({
        run: target.world.state.run(),
        player: target.world.state.player(),
        blade: target.world.state.blade(),
        enemies: target.world.state.enemies(),
        projectiles: target.world.state.projectiles(),
        floaters: target.world.state.floaters(),
      }),
    ) as unknown,
    configuration: target.configuration.snapshot(),
    gameplay: target.random.streams.snapshot(),
    entropy: target.cosmeticEmissionRandom.snapshot(),
    effects: target.effects.list,
    lifecycle: target.world.lifecycle.snapshot(),
    cinema: target.world.context.cinema.captureState(),
    environment: target.world.context.environment.snapshot(),
    clock: target.clock.sim,
    stage: target.stage.index,
    platforms: target.stage.platforms,
    transient: { opening: target.transient.opening, impact: target.transient.impact, feel: target.transient.feel },
  });
  const before = structuredClone(capture());
  return () => {
    expect([
      target.world.state.run(),
      target.world.state.player(),
      target.world.state.blade(),
      target.world.state.enemies(),
      target.world.state.projectiles(),
      target.configuration.value,
      target.stage.platforms,
    ]).toEqual(refs);
    [
      target.world.state.run(),
      target.world.state.player(),
      target.world.state.blade(),
      target.world.state.enemies(),
      target.world.state.projectiles(),
      target.configuration.value,
      target.stage.platforms,
    ].forEach((ref, i) => {
      expect(ref).toBe(refs[i]);
    });
    expect(capture()).toEqual(before);
  };
}

function actualOpeningHost(
  previousScreen = "setup",
  failStarted = false,
  injectedHeldInput = false,
  observer?: Readonly<{
    captured: (
      capture: ReturnType<typeof captureProductionReplayCheckpoint>,
      boundary: { runId: string; seed: number },
    ) => void;
    event: (event: TearCausalEventV1) => void;
    installed?: (run: GameRun) => void;
  }>,
  baselinePractice = false,
  application?: AppStateController,
) {
  const source = createProductionGhostReplayComposition({ seed: "actual-opening-source" }).create(undefined);
  const { replay } = source,
    noop = () => undefined,
    order: string[] = [];
  let screen = previousScreen,
    captured: ReturnType<typeof captureProductionReplayCheckpoint> | undefined;
  let boundary: { phase: "opening-initialized-before-run-start"; runId: string; seed: number } | undefined;
  let pending = false;
  const native = new TearGameplayEventBus(() => 0),
    events: ReturnType<typeof createLiveGhostCausalEvent>[] = [];
  const recordEvent = (event: TearCausalEventV1) => {
    events.push(event);
    observer?.event(event);
  };
  native.subscribe((event) => {
    if (captured !== undefined) recordEvent(createLiveGhostCausalEvent(event, events.length + 1));
  });
  const openingCapture = createLiveGhostOpeningCapture({
    screen: () => screen,
    tick: () => source.simulation.scheduler.tick,
    replayRunId: () => boundary?.runId,
    nextSequence: () => events.length + 1,
    record: recordEvent,
    failed: (error) => {
      throw error;
    },
  });
  const markMode = vi.fn(),
    achievementCheck = vi.fn();
  const dependencies = {
    ...replay.dependencies,
    REMOTE,
    surfaces: createSurfaceAvailability("engineering"),
    PROFILE: { data: { stats: {}, ach: {}, rewards: {} }, markMode },
    META: { level: () => 0, apply: noop },
    SFX: { setVoidDescent: noop, setMusicDuck: noop, musicScoreVersion: () => "unit" },
    newMods,
    Input: {
      startSemanticRecording: () => {
        order.push("input");
      },
      syncSemanticMovement: () => {
        order.push("held");
        // Deliberate held-input restore edge fixture only. Normal browser sync queues
        // movement for tick1 and leaves its reset authoritative tick0 receipt neutral.
        if (injectedHeldInput)
          source.simulation.input.restore({ tick: 0, moveX: 0.75, moveY: 0, aimTurn: 37, primaryHeld: true });
      },
      stopSemanticRecording: noop,
    },
    GAMEPLAY_EVENTS: {
      emit: (event: UntickedTearGameplayEvent) => {
        order.push("started");
        native.emit(event);
        if (failStarted) throw new Error("source start listener failed");
      },
    },
    GHOST: {
      recording: () => false,
      startRec: () => {
        order.push("recording");
        source.waveReward.restoreScreen(screen);
        captured = captureProductionReplayCheckpoint(replay, source.combat, source.waveReward, "actual-host-opening");
        if (boundary !== undefined) {
          observer?.captured(captured, boundary);
          openingCapture.captured(boundary.runId);
        }
      },
    },
  };
  const context = {
    dependencies,
    state: { ...replay.world.state, selectedWeapon: () => "chainblade", setSelectedWeapon: noop },
    width: replay.configuration.value.view.w,
    services: replay.world.context.services,
    environment: replay.world.context.environment,
    prepareWorld: noop,
    applySettings: noop,
    configureBlade: (blade: { weapon: unknown; model: unknown }, id: string) => {
      const weapon = applyWeapon(replay.configuration.value, id);
      blade.weapon = weapon;
      blade.model = weapon.model;
    },
    createPlayer: (x: number, y: number) => replay.world.entities.createPlayer(x, y),
    createBlade: () => replay.world.entities.createBlade(),
    installRun: (run: unknown) => {
      replay.world.state.setRun(run as never);
    },
    runInstalled: observer?.installed,
    world: {
      resetTransient: noop,
      finishReset: () => {
        replay.transient.resetOpening();
      },
    },
    resetAuthoritativeClocks: () => {
      source.simulation.reset(0);
    },
    resetCombatIdentity: () => {
      source.combat.combatEntityRuntime.resetIdentity();
    },
    createRunSeed: () => 12345,
    loadStage: noop,
    stage: { platforms: [], resetBanner: noop },
    story: { resetChapter: noop, resetFinale: noop },
    lifecycle: replay.world.lifecycle,
    install: noop,
    setScreen: (next: "playing", detail: { runId: string }) => {
      application?.transition(next, detail);
      order.push("playing");
      screen = next;
      source.waveReward.restoreScreen(next);
    },
    selectedBoss: () => "shuffle",
    shuffledRoster: () => [],
    gauntletTrials: () => [],
    bossBiome: () => 0,
    trainingPlatforms: () => [],
    playground: { state: {}, reset: noop, enterArena: noop },
    tutorial: { start: noop },
    startNextWave: () => {
      order.push("opening");
      source.waveReward.waves.startNextWave();
    },
    achievementTracking: () => true,
    achievementCheck,
    baselinePractice: () => baselinePractice,
    resetRewards: () => {
      source.waveReward.reward.reset();
    },
    music: { begin: noop },
    requestPointerLock: noop,
    testMode: false,
    window: {},
    withOpeningCapture: (value: NonNullable<typeof boundary>, record: () => void) => {
      order.push("boundary");
      boundary = value;
      pending = true;
      openingCapture.withCapture(value, record);
    },
    discardOpeningCapture: () => {
      pending = false;
      openingCapture.discard();
    },
    openingExposed: (runId: string) => {
      pending = false;
      order.push("completion");
      openingCapture.exposed(runId);
    },
  } as unknown as Parameters<typeof createLiveRunStartHost>[0];
  const controller = createLiveRunStartHost(context);
  return {
    controller,
    context,
    dependencies,
    source,
    native,
    order,
    events,
    markMode,
    achievementCheck,
    captured: () => captured,
    boundary: () => boundary,
    pending: () => pending,
    prepareStart: () => {
      if (application?.screen !== "profile") throw new Error("Chase launch left Profile");
      application.transition("setup");
      screen = "setup";
      source.waveReward.restoreScreen(screen);
    },
  };
}

/** Actual source-owned host/helper/bus/recorder; adversarial edits are resealed before Reader validation. */
async function sealedTerminatedOpening(
  options: Readonly<{
    legacy?: boolean;
    laterTick?: boolean;
    outcome?: "quit" | "victory" | "defeat";
    terminal?: Partial<TearCausalEventV1>;
    payload?: Readonly<Record<string, unknown>>;
    duplicate?: boolean;
  }> = {},
) {
  const id = "actual-terminated-opening",
    vault = new GhostLocalVault(createMemoryGhostVaultBackend());
  const recorder = new GhostLiveRecorder({
    createVault: () => Promise.resolve(vault),
    now: () => "2026-10-19T00:00:01Z",
  });
  let snapshot: TearSnapshotV1 | undefined;
  const fixture = actualOpeningHost("menu", false, false, {
    captured(capture, boundary) {
      const run = fixture.source.replay.world.state.run();
      if (run === null) throw new Error("run missing");
      const context = createGhostReplayRunContext({
        runId: boundary.runId,
        seed: boundary.seed,
        mode: run.mode,
        difficulty: run.diff,
        weaponId: run.weaponId,
        ticksPerSecond: 120,
        build: capture.snapshot.provenance.build,
        rng: fixture.source.replay.random.streams.snapshot(),
        ...(options.legacy === true
          ? {}
          : {
              opening: {
                version: 1,
                phase: "opening-initialized-before-run-start",
                previousScreen: "menu",
                destination: "playing",
                runId: boundary.runId,
              },
            }),
      });
      snapshot = {
        ...capture.snapshot,
        stateClass: "recorded-canonical",
        provenance: { ...capture.snapshot.provenance, sourceId: ghostLiveBootstrapEventId(id) },
      };
      recorder.start({ sessionId: id, createdAt: "2026-10-19T00:00:00Z", provenance: { replayContext: context } });
      recorder.record("rng", 0, snapshot.rng);
      recorder.record("keyframes", 0, snapshot);
      recorder.record("results", 0, createGhostAuthoritativeReceipt(0, capture.semanticHash, capture.input));
    },
    event(event) {
      const terminal = ["run.completed", "run.defeated", "run.abandoned"].includes(event.type);
      const archived = terminal
        ? { ...event, ...options.terminal, payload: { ...event.payload, ...options.payload } }
        : event;
      recorder.record("events", archived.tick, archived);
      if (terminal && options.duplicate === true)
        recorder.record("events", archived.tick, {
          ...archived,
          id: `${archived.id}-duplicate`,
          sequence: archived.sequence + 1,
          type: "run.defeated",
        });
    },
  });
  // This host fixture owns valid Endless opening content. Campaign chapter
  // composition remains covered by the independently captured browser case.
  fixture.controller.start("endless", "normal");
  if (options.laterTick === true) fixture.source.simulation.advanceOne([]);
  fixture.native.setTickSource(() => fixture.source.simulation.scheduler.tick);
  const lifecycle = fixture.source.replay.world.lifecycle.snapshot(),
    run = fixture.source.replay.world.state.run();
  if (run === null || lifecycle.sessionId === null) throw new Error("started run missing");
  const outcome = options.outcome ?? "quit";
  fixture.source.replay.world.context.environment.clear("abandon");
  fixture.source.replay.world.lifecycle.terminate(outcome);
  fixture.native.emit({
    kind: "run",
    transition: outcome === "quit" ? "abandoned" : outcome === "victory" ? "completed" : "defeated",
    runId: lifecycle.sessionId,
    mode: run.mode,
    difficulty: run.diff,
    weaponId: run.weaponId,
    wave: run.wave,
    score: run.score,
    runTimeSeconds: run.runTime,
    reason: "tearbench-terminated",
  });
  expect(await recorder.finish({ tearBenchTerminated: true, abandoned: "tearbench-terminated" })).not.toBeNull();
  expect(recorder.failure).toBeNull();
  if (snapshot === undefined) throw new Error("opening snapshot missing");
  return { fixture, snapshot, capsule: await new GhostCapsuleReader(vault).read(id) };
}

async function sealedActualOpening(
  previousScreen = "menu",
  legacy = false,
  continuation = false,
  mutate?: (snapshot: TearSnapshotV1) => TearSnapshotV1,
  tracks?: Readonly<{
    bootstrapSequence?: number;
    sealedPredecessor?: string;
    legacyMagnitude?: boolean;
    finalAimMagnitude?: number;
    entries?: readonly Readonly<{ kind: "commands" | "events"; tick: number; value: unknown }>[];
  }>,
) {
  const fixture = actualOpeningHost(previousScreen, false, continuation);
  fixture.controller.start("endless", "normal");
  const capture = fixture.captured(),
    boundary = fixture.boundary();
  if (capture === undefined || boundary === undefined) throw new Error("actual capture boundary missing");
  const run = fixture.source.replay.world.state.run();
  if (run === null) throw new Error("run missing");
  const capturedContext = createGhostReplayRunContext({
    runId: boundary.runId,
    seed: boundary.seed,
    mode: run.mode,
    difficulty: run.diff,
    weaponId: run.weaponId,
    ticksPerSecond: 120,
    build: capture.snapshot.provenance.build,
    rng: fixture.source.replay.random.streams.snapshot(),
    ...(legacy
      ? {}
      : {
          opening: { version: 1, phase: boundary.phase, previousScreen, destination: "playing", runId: boundary.runId },
        }),
  });
  // Model untrusted archival bytes after a real valid producer capture. Recompute
  // their envelope hashes and let the actual recorder seal a new integrity root.
  const context =
    tracks?.sealedPredecessor === undefined || capturedContext.simulation.opening === undefined
      ? capturedContext
      : {
          ...capturedContext,
          simulation: {
            ...capturedContext.simulation,
            opening: { ...capturedContext.simulation.opening, previousScreen: tracks.sealedPredecessor },
          },
        };
  const id = "actual-host-capsule",
    provenance = { replayContext: context };
  const rawSnapshot = {
    ...capture.snapshot,
    stateClass: "recorded-canonical" as const,
    provenance: { ...capture.snapshot.provenance, sourceId: ghostLiveBootstrapEventId(id) },
  };
  let snapshot = mutate === undefined ? rawSnapshot : rehashOpening(mutate(structuredClone(rawSnapshot)));
  if (tracks?.sealedPredecessor !== undefined)
    snapshot = rehashOpening({
      ...snapshot,
      state: {
        ...snapshot.state,
        "tear.ui.v1": { ...(snapshot.state["tear.ui.v1"] as object), screen: tracks.sealedPredecessor },
      },
    });
  const vault = new GhostLocalVault(createMemoryGhostVaultBackend()),
    recorder = new GhostStreamingRecorder({
      sessionId: id,
      createdAt: "2026-10-19T00:00:00Z",
      chunkEntries: 16,
      maxPendingWrites: 16,
      vault,
      provenance,
    });
  await recorder.start();
  await recorder.append({
    kind: "events",
    tick: 0,
    value: { ...createLiveGhostBootstrapEvent(id, provenance), sequence: tracks?.bootstrapSequence ?? 0 },
  });
  for (const event of fixture.events)
    if (!legacy || event.type !== "system.checkpoint") await recorder.append({ kind: "events", tick: 0, value: event });
  for (const entry of tracks?.entries ?? []) await recorder.append(entry);
  await recorder.append({ kind: "keyframes", tick: 0, value: snapshot });
  const openingReceipt = createGhostAuthoritativeReceipt(0, capture.semanticHash, capture.input);
  await recorder.append({
    kind: "results",
    tick: 0,
    value: tracks?.legacyMagnitude === true ? { ...openingReceipt, input: capture.input } : openingReceipt,
  });
  const sourceReceipts = new Map<number, { stateHash: string; input: typeof capture.input }>();
  if (continuation) {
    for (let tick = 1; tick <= 180; tick++) {
      const actions: ReplayActionEnvelope[] =
        tick === 1
          ? [{ kind: "command", id: 1, tick, command: { type: "move", x: 0, y: 0 } }]
          : tick === 2
            ? [{ kind: "command", id: 2, tick, command: { type: "weapon", intent: "primary", phase: "released" } }]
            : tick === 3
              ? [{ kind: "command" as const, id: 3, tick, command: { type: "move" as const, x: -500, y: 0 } }]
              : tick === 4
                ? [{ kind: "command", id: 4, tick, command: { type: "weapon", intent: "primary", phase: "pressed" } }]
                : tick === 15
                  ? [
                      {
                        kind: "command" as const,
                        id: 5,
                        tick,
                        command: { type: "jump" as const, phase: "pressed" as const },
                      },
                    ]
                  : tick === 75
                    ? [{ kind: "command" as const, id: 6, tick, command: { type: "dash" as const, x: 1000, y: 0 } }]
                    : tick === 121
                      ? [
                          {
                            kind: "command",
                            id: 7,
                            tick,
                            command: { type: "weapon", intent: "primary", phase: "released" },
                          },
                        ]
                      : tick === 180 && tracks?.finalAimMagnitude !== undefined
                        ? [
                            {
                              kind: "command",
                              id: 8,
                              tick,
                              command: { type: "aim", turn: 125000, magnitude: tracks.finalAimMagnitude },
                            },
                          ]
                        : [];
      for (const action of actions) await recorder.append({ kind: "commands", tick, value: action });
      const result = fixture.source.simulation.advanceOne(actions);
      if ([1, 60, 120, 180].includes(tick)) {
        const input = fixture.source.simulation.input.snapshot();
        sourceReceipts.set(tick, { stateHash: result.stateHash, input });
        await recorder.append({
          kind: "results",
          tick,
          value: createGhostAuthoritativeReceipt(tick, result.stateHash, input),
        });
        const checkpoint = captureProductionReplayCheckpoint(
          fixture.source.replay,
          fixture.source.combat,
          fixture.source.waveReward,
          `actual-host-${String(tick)}`,
        );
        await recorder.append({
          kind: "keyframes",
          tick,
          value: {
            ...checkpoint.snapshot,
            stateClass: "recorded-canonical",
            provenance: { ...checkpoint.snapshot.provenance, sourceId: ghostLiveBootstrapEventId(id) },
          },
        });
      }
    }
  }
  await recorder.finalize("2026-10-19T00:00:01Z");
  return { fixture, snapshot, sourceReceipts, capsule: await new GhostCapsuleReader(vault).read(id) };
}

describe("LiveRunStartController", () => {
  it("launches admitted Chase from Profile through the real setup opening boundary", async () => {
    const application = new AppStateController(createSurfaceAvailability("engineering"));
    application.transition("profile");
    expect(() => application.transition("playing", { runId: "unscoped" })).toThrow(
      /Illegal legacy application transition/,
    );
    const reference: GhostLiveReference = {
      version: 1,
      mode: "endless",
      difficulty: "normal",
      weapon: "sword",
      seed: "reference",
      frames: [],
      splits: [],
      build: {
        version: "1",
        revision: "r",
        target: "test",
        rulesetVersion: "v",
        contentHash: "c",
        configHash: "config",
      },
      assistance: {
        format: "tear-ghost-chase",
        version: 1,
        sourceId: "reference",
        sourceManifestHash: "a".repeat(16),
        sourceRoot: "b".repeat(16),
        actor: "unknown",
        coachEnabled: true,
        ghostVisible: true,
        competitiveEligible: false,
      },
    };
    const fixture = actualOpeningHost(
      "profile",
      false,
      false,
      {
        captured: () => undefined,
        event: () => undefined,
        installed: (run) => {
          const assistance = chase.assistance();
          if (assistance) run.ghostAssistance = assistance;
          chase.installed(run.runSeed);
        },
      },
      false,
      application,
    );
    const ports = {
      prepare: () => Promise.resolve(reference),
      current: () => Promise.resolve(true),
      prepareStart: () => {
        expect(chase.takeSetupLaunch()).toBe(true);
        expect(chase.takeSetupLaunch()).toBe(false);
        fixture.prepareStart();
      },
      start: () => {
        fixture.controller.start("endless", "normal");
      },
    };
    const chase: ReturnType<typeof createLiveGhostReferenceController> = createLiveGhostReferenceController(ports);
    await chase.choose("reference");
    expect(chase.takeSetupLaunch()).toBe(false);
    expect(application.screen, chase.snapshot().message).toBe("playing");
    expect(chase.snapshot().active).toBe(true);
    const capture = fixture.captured(),
      boundary = fixture.boundary();
    if (!capture || !boundary) throw new Error("real opening missing");
    expect(capture.snapshot.state["tear.ui.v1"]).toMatchObject({ screen: "setup" });
    expect(capture.snapshot.state["tear.run.v1"]).toMatchObject({ ghostAssistance: reference.assistance });
    expect(fixture.events.at(-1)).toMatchObject({
      payload: { boundary: "recorded-opening-playing-exposed", screen: "playing" },
    });
    const run = fixture.source.replay.world.state.run();
    if (!run) throw new Error("real installed run missing");
    const context = createGhostReplayRunContext({
      runId: boundary.runId,
      seed: boundary.seed,
      mode: run.mode,
      difficulty: run.diff,
      weaponId: run.weaponId,
      ticksPerSecond: 120,
      build: capture.snapshot.provenance.build,
      rng: capture.snapshot.rng,
      opening: {
        version: 1,
        phase: boundary.phase,
        previousScreen: "setup",
        destination: "playing",
        runId: boundary.runId,
      },
    });
    expect(readGhostReplayRunContext({ replayContext: context })?.simulation.opening?.previousScreen).toBe("setup");
  });
  it("keeps explicit baseline practice starts out of mode progression without changing ordinary or course starts", () => {
    for (const mode of ["playground", "tutorial", "endless"] as const) {
      const practice = actualOpeningHost("menu", false, false, undefined, true);
      practice.controller.start(mode, "normal");
      expect(practice.markMode).not.toHaveBeenCalled();
      expect(practice.achievementCheck).not.toHaveBeenCalled();
      const ordinary = actualOpeningHost("menu");
      ordinary.controller.start(mode, "normal");
      expect(ordinary.markMode).toHaveBeenCalledExactlyOnceWith(mode);
      expect(ordinary.achievementCheck).toHaveBeenCalledOnce();
    }
  });
  it.each([{ magnitudes: [250] }, { magnitudes: [0] }, { magnitudes: [1000, 250] }])(
    "refuses same-tick exact authority for sealed legacy missing magnitude after original aim $magnitudes",
    async ({ magnitudes }) => {
      const capsule = await sealedLegacyAim(magnitudes),
        before = JSON.stringify(capsule);
      expect(mapGhostCapsuleToReplayEnvelope(capsule).issues).toEqual([]);
      const report = verifyGhostCapsuleProductionReplay(capsule);
      expect(report.status, JSON.stringify(report)).toBe("unavailable");
      expect(JSON.stringify(capsule)).toBe(before);
    },
  );
  it.each([{ magnitudes: [1000] }, { magnitudes: [250, 1000] }])(
    "retains proven-full legacy same-tick authority after original aim $magnitudes",
    async ({ magnitudes }) => {
      const capsule = await sealedLegacyAim(magnitudes);
      expect(verifyGhostCapsuleProductionReplay(capsule).status).toBe("verified");
    },
  );
  it.each([{ magnitudes: [] }, { magnitudes: [1000] }])(
    "does not prove unknown legacy tick-zero aim retroactively from $magnitudes",
    async ({ magnitudes }) => {
      const capsule = await sealedLegacyAim(magnitudes, { legacyOpening: true }),
        before = JSON.stringify(capsule);
      const create = vi.spyOn(productionReplayComposition, "createProductionGhostReplayComposition");
      create.mockClear();
      try {
        const report = verifyGhostCapsuleProductionReplay(capsule);
        expect(report.status).toBe("unavailable");
        expect(report.comparisons[0]).toMatchObject({ tick: 0, equal: false });
        expect(report.comparisons[0]?.reason).toContain("unknown");
        expect(create).not.toHaveBeenCalled();
        expect(JSON.stringify(capsule)).toBe(before);
      } finally {
        create.mockRestore();
      }
    },
  );
  it.each([250, 1000])(
    "does not treat a linked seeded declaration as initial magnitude authority (%s)",
    async (initialMagnitude) => {
      const capsule = await sealedLegacyAim([], { seeded: true, legacyOpening: true, initialMagnitude }),
        before = JSON.stringify(capsule);
      const context = readGhostReplayRunContext(capsule.manifest.provenance);
      if (context === undefined) throw new Error("source context missing");
      expect(assessGhostReplayBootstrap(capsule, context)).toBeUndefined();
      expect(mapGhostCapsuleToReplayEnvelope(capsule).issues).toEqual([]);
      const create = vi.spyOn(productionReplayComposition, "createProductionGhostReplayComposition");
      create.mockClear();
      try {
        const report = verifyGhostCapsuleProductionReplay(capsule);
        expect(report.status, JSON.stringify(report)).toBe("unavailable");
        expect(report.comparisons[0]?.reason).toContain("unknown");
        expect(create).not.toHaveBeenCalled();
        expect(JSON.stringify(capsule)).toBe(before);
      } finally {
        create.mockRestore();
      }
    },
  );
  it.each([0, 250, 1000])(
    "verifies freshly explicit aim magnitude %s against unchanged canonical state",
    async (magnitude) => {
      const capsule = await sealedLegacyAim([magnitude], { freshLater: true });
      expect(verifyGhostCapsuleProductionReplay(capsule).status).toBe("verified");
    },
  );
  it("refuses inadmissible original aim history before creating a replay destination", async () => {
    const capsule = await sealedLegacyAim([1000], { invalidHistory: true }),
      before = JSON.stringify(capsule);
    const create = vi.spyOn(productionReplayComposition, "createProductionGhostReplayComposition");
    create.mockClear();
    try {
      expect(verifyGhostCapsuleProductionReplay(capsule).status).toBe("mismatch");
      expect(create).not.toHaveBeenCalled();
      expect(JSON.stringify(capsule)).toBe(before);
    } finally {
      create.mockRestore();
    }
  });
  it("does not erase unrelated original receipt input fields to make a comparison equal", async () => {
    const capsule = await sealedLegacyAim([1000], { freshLater: true, extraInputField: true });
    const report = verifyGhostCapsuleProductionReplay(capsule);
    expect(report.status).toBe("mismatch");
    expect(report.comparisons.at(-1)?.reason).toContain("original receipt fields");
  });
  it("executes original partial aim in the opening-only continuation without later receipt injection", async () => {
    const { capsule } = await sealedActualOpening("setup", false, true, undefined, { finalAimMagnitude: 250 });
    const before = JSON.stringify(capsule),
      report = verifyGhostCapsuleOpeningContinuation(capsule);
    expect(report.status, JSON.stringify(report)).toBe("verified");
    expect(report.continuation.steps).toBe(180);
    expect(report.comparisons.map((entry) => entry.inputEqual)).toEqual([true, true, true]);
    expect(JSON.stringify(capsule)).toBe(before);
  });
  it("refuses opening-only execution from an unknown legacy held-magnitude anchor", async () => {
    const { capsule } = await sealedActualOpening("setup", false, true, undefined, { legacyMagnitude: true });
    const report = verifyGhostCapsuleOpeningContinuation(capsule);
    expect(report.status).toBe("unavailable");
    expect(report.continuation.steps).toBe(0);
    expect(report.comparisons[0]?.reason).toContain("unknown");
  });
  it.each(
    [false, true].flatMap((legacy) => (["quit", "victory", "defeat"] as const).map((outcome) => ({ legacy, outcome }))),
  )(
    "verifies only the original Endless tick-zero anchor after completed start then $outcome (legacy descriptor=$legacy)",
    async ({ legacy, outcome }) => {
      // Constructed lifecycle outcomes exercise each native terminal type; this
      // does not attest a naturally completed/defeated gameplay journey.
      const { capsule, snapshot, fixture } = await sealedTerminatedOpening({ legacy, outcome });
      expect(
        capsule.tracks.events.map((entry) => {
          const event = validateTearContract(entry.value);
          if (!event.ok || event.value.kind !== "event") throw new Error("reader event is malformed");
          return [event.value.type, event.value.tick, event.value.sequence, event.value.phase];
        }),
      ).toEqual([
        ["system.checkpoint", 0, 0, "pre-simulation"],
        ["run.started", 0, 1, "pre-simulation"],
        ["system.checkpoint", 0, 2, "pre-simulation"],
        [
          outcome === "quit" ? "run.abandoned" : outcome === "victory" ? "run.completed" : "run.defeated",
          0,
          3,
          "post-simulation-commit",
        ],
      ]);
      expect(fixture.source.replay.world.lifecycle.snapshot()).toMatchObject({ phase: "terminated", outcome });
      expect(capsule.maxTick).toBe(0);
      expect(capsule.tracks.commands).toEqual([]);
      const sourceHash = stableVerificationHash(capsule),
        unchanged = openingDestinationEvidence(fixture.source.replay);
      const permit = issueGhostRecordedOpeningPermit(capsule);
      expect(permit).toBeDefined();
      if (permit === undefined) throw new Error("opening permit missing");
      expect(readGhostRecordedOpeningPermit(permit, snapshot).kind).toBe(legacy ? "legacy-inferred" : "explicit");
      const verification = verifyGhostCapsuleProductionReplay(capsule);
      expect(verification.status).toBe("verified");
      expect(verification.comparisons).toHaveLength(1);
      expect(verification.comparisons[0]).toMatchObject({ tick: 0, equal: true });
      expect(createGhostProductionReplaySession(capsule).seek(0).tick).toBe(0);
      expect(verifyGhostCapsuleOpeningContinuation(capsule).status).toBe("unavailable");
      unchanged();
      expect(stableVerificationHash(capsule)).toBe(sourceHash);
    },
  );

  it("retains the later-tick terminal control without claiming continuation from a tick-zero receipt", async () => {
    const { capsule } = await sealedTerminatedOpening({ laterTick: true });
    expect(capsule.tracks.events.at(-1)?.value).toMatchObject({ type: "run.abandoned", tick: 1, sequence: 3 });
    const verification = verifyGhostCapsuleProductionReplay(capsule);
    expect(verification.status, JSON.stringify(verification)).toBe("verified");
    expect(verifyGhostCapsuleOpeningContinuation(capsule).status).toBe("unavailable");
  });

  it("refuses public session advancement beyond a closed tick-zero capsule before constructing a destination", async () => {
    const { capsule, fixture } = await sealedTerminatedOpening(),
      before = stableVerificationHash(capsule),
      unchanged = openingDestinationEvidence(fixture.source.replay);
    const realFactory = productionReplayComposition.createProductionGhostReplayComposition;
    const created: ReturnType<ReturnType<typeof realFactory>["create"]>[] = [];
    const spy = vi
      .spyOn(productionReplayComposition, "createProductionGhostReplayComposition")
      .mockImplementation((options) => {
        const composition = realFactory(options);
        return Object.freeze({
          create(snapshot: Parameters<typeof composition.create>[0]) {
            const destination = composition.create(snapshot);
            created.push(destination);
            return destination;
          },
        });
      });
    try {
      for (const maxTick of [-1, NaN, Infinity, 0.5])
        expect(() => createGhostProductionReplaySession({ ...capsule, maxTick })).toThrow(RangeError);
      expect(created).toHaveLength(0);
      const supplied = { ...capsule },
        session = createGhostProductionReplaySession(supplied);
      expect(session.seek(0).tick).toBe(0);
      const destination = created.at(-1);
      if (destination === undefined) throw new Error("valid seek created no destination");
      const destinationUnchanged = openingDestinationEvidence(destination.replay),
        count = created.length;
      let refused = false,
        advancedTick: number | undefined;
      try {
        advancedTick = session.seek(1).tick;
      } catch {
        refused = true;
      }
      const observed = { refused, advancedTick, created: created.length - count };
      expect(observed, JSON.stringify(observed)).toEqual({ refused: true, advancedTick: undefined, created: 0 });
      for (const tick of [-1, NaN, Infinity, 0.5]) expect(() => session.seek(tick)).toThrow(RangeError);
      // The session captures its bound; mutating this external decoded object
      // after construction must not extend its already verified source range.
      supplied.maxTick = 180;
      expect(() => session.seek(1)).toThrow(RangeError);
      expect(created).toHaveLength(count);
      destinationUnchanged();
      unchanged();
      expect(stableVerificationHash(capsule)).toBe(before);
    } finally {
      spy.mockRestore();
    }
  });

  it("refuses a resealed legacy tick-zero terminal without sealed completion despite later playing receipts", async () => {
    const terminated = await sealedTerminatedOpening(),
      terminal = terminated.capsule.tracks.events.at(-1);
    if (terminal === undefined) throw new Error("native terminal missing");
    const { capsule, snapshot } = await sealedActualOpening("menu", true, true, undefined, {
      entries: [{ kind: "events", tick: 0, value: terminal.value }],
    });
    const target = createProductionReplayWorld({ seed: "legacy-terminal-refusal" }),
      unchanged = openingDestinationEvidence(target),
      set = vi.fn();
    const destination = { ...target, world: { ...target.world, state: { ...target.world.state, setRun: set } } };
    expect(() => {
      const permit = issueGhostRecordedOpeningPermit(capsule);
      if (permit === undefined) throw new Error("missing permit");
      restoreProductionReplaySnapshot(destination, snapshot, permit);
    }).toThrow(/sealed playing completion/);
    expect(verifyGhostCapsuleProductionReplay(capsule).status).toBe("mismatch");
    expect(() => createGhostProductionReplaySession(capsule).seek(0)).toThrow();
    expect(set).not.toHaveBeenCalled();
    unchanged();
  });

  it.each(["run.completed", "run.defeated", "run.abandoned"] as const)(
    "refuses fully resealed %s with contradictory phase/order/linkage before destination mutation",
    async (type) => {
      const cases: Parameters<typeof sealedTerminatedOpening>[0][] = [
        ...[0, 1, 2].map((sequence) => ({ terminal: { type, sequence } })),
        { terminal: { type, phase: "pre-simulation" } },
        { terminal: { type, phase: "presentation-only" } },
        { terminal: { type, source: "derived" } },
        { terminal: { type }, payload: { runId: "foreign-run" } },
        { terminal: { type }, payload: { mode: "campaign" } },
        { terminal: { type }, payload: { difficulty: "onehit" } },
        { terminal: { type }, payload: { weapon: "sword" } },
        { terminal: { type }, duplicate: true },
      ];
      for (const options of cases) {
        const { capsule, snapshot } = await sealedTerminatedOpening(options),
          before = stableVerificationHash(capsule);
        const target = createProductionReplayWorld({ seed: "terminal-order-refusal" }),
          unchanged = openingDestinationEvidence(target),
          set = vi.fn();
        const destination = {
          ...target,
          world: {
            ...target.world,
            state: { ...target.world.state, setRun: set, setPlayer: set, setBlade: set, setEnemies: set },
          },
        };
        expect(() => {
          const permit = issueGhostRecordedOpeningPermit(capsule);
          if (permit === undefined) throw new Error("missing permit");
          restoreProductionReplaySnapshot(destination, snapshot, permit);
        }).toThrow();
        expect(verifyGhostCapsuleProductionReplay(capsule).status).toBe("mismatch");
        expect(() => createGhostProductionReplaySession(capsule).seek(0)).toThrow();
        expect(set).not.toHaveBeenCalled();
        unchanged();
        expect(stableVerificationHash(capsule)).toBe(before);
      }
    },
  );

  it.each(["menu", "setup", "gameover", "win", "playing", "paused"])(
    "retains the canonical %s predecessor/playing edge",
    async (screen) => {
      const { capsule, snapshot } = await sealedActualOpening(screen),
        permit = issueGhostRecordedOpeningPermit(capsule);
      if (permit === undefined) throw new Error("valid predecessor lost opening permit");
      expect(readGhostRecordedOpeningPermit(permit, snapshot).previousScreen).toBe(screen);
      expect(createGhostProductionReplaySession(capsule).seek(0).tick).toBe(0);
    },
  );

  it.each([
    { legacy: false, screen: "invalid-state-forge-screen" },
    { legacy: true, screen: "invalid-state-forge-screen" },
    { legacy: false, screen: "settings" },
    { legacy: true, screen: "settings" },
  ])(
    "refuses fully resealed predecessor $screen (legacy=$legacy) before target replacement",
    async ({ legacy, screen }) => {
      const { capsule, snapshot } = await sealedActualOpening("menu", legacy, legacy, undefined, {
        sealedPredecessor: screen,
      });
      const target = createProductionReplayWorld({ seed: "rejected-predecessor" }),
        unchanged = openingDestinationEvidence(target);
      let setters = 0,
        issued = false,
        restored = false;
      const destination = {
        ...target,
        world: {
          ...target.world,
          state: {
            ...target.world.state,
            setRun: (run: Parameters<typeof target.world.state.setRun>[0]) => {
              setters++;
              target.world.state.setRun(run);
            },
          },
        },
      };
      try {
        const permit = issueGhostRecordedOpeningPermit(capsule);
        issued = permit !== undefined;
        if (permit !== undefined) {
          restoreProductionReplaySnapshot(destination, snapshot, permit);
          restored = true;
        }
      } catch {
        /* refusal */
      }
      const observed = { issued, restored, setters };
      expect(observed, JSON.stringify(observed)).toEqual({ issued: false, restored: false, setters: 0 });
      unchanged();
    },
  );

  it.each([
    "unknown command",
    "malformed command",
    "nonmonotonic commands",
    "invalid event",
    "unrelated noncausal event",
    "bootstrap5/start1/completion2",
  ])("refuses a fully resealed %s before issuer/standard verifier/Theater acceptance", async (kind) => {
    const command = { kind: "command", id: 1, tick: 1, command: { type: "move", x: 1000, y: 0 } };
    const entries: { kind: "commands" | "events"; tick: number; value: unknown }[] = [];
    if (kind === "unknown command")
      entries.push({ kind: "commands", tick: 1, value: { ...command, command: { type: "future-action" } } });
    if (kind === "malformed command")
      entries.push({ kind: "commands", tick: 1, value: { ...command, command: { type: "move", x: "bad", y: 0 } } });
    if (kind === "nonmonotonic commands")
      entries.push(
        { kind: "commands", tick: 1, value: { ...command, id: 2 } },
        { kind: "commands", tick: 1, value: command },
      );
    if (kind === "invalid event")
      entries.push({
        kind: "events",
        tick: 1,
        value: {
          format: "tear-contract",
          kind: "event",
          schemaVersion: 1,
          id: "invalid-event",
          type: "unknown-event",
          tick: 1,
          sequence: 3,
          phase: "pre-simulation",
          source: "engine",
          payload: {},
        },
      });
    if (kind === "unrelated noncausal event")
      entries.push({ kind: "events", tick: 1, value: { note: "unrelated non-causal object in required event track" } });
    // Recorder encodes a new manifest/root/chunks; reader reopens those bytes.
    // These are not mutations of an already-read capsule with stale integrity metadata.
    const { capsule, fixture } = await sealedActualOpening("menu", false, false, undefined, {
      entries,
      bootstrapSequence: kind === "bootstrap5/start1/completion2" ? 5 : 0,
    });
    const sourceHash = stableVerificationHash(capsule),
      unchangedSourceWorld = openingDestinationEvidence(fixture.source.replay);
    let permitIssued = false,
      theaterOpened = false;
    try {
      permitIssued = issueGhostRecordedOpeningPermit(capsule) !== undefined;
    } catch {
      /* refusal */
    }
    const verification = verifyGhostCapsuleProductionReplay(capsule);
    try {
      theaterOpened = createGhostProductionReplaySession(capsule).seek(0).tick === 0;
    } catch {
      /* refusal */
    }
    const observed = { permitIssued, standardStatus: verification.status, theaterOpened };
    unchangedSourceWorld();
    expect(stableVerificationHash(capsule)).toBe(sourceHash);
    expect(observed, JSON.stringify(observed)).toEqual({
      permitIssued: false,
      standardStatus: "mismatch",
      theaterOpened: false,
    });
    if (kind === "bootstrap5/start1/completion2") {
      const context = readGhostReplayRunContext(capsule.manifest.provenance);
      if (context === undefined) throw new Error("fixture lost context");
      expect(assessGhostReplayBootstrap(capsule, context)).toMatch(/sequence|boundary/);
    }
  });

  it.each(["tick", "mode", "clock", "runtime", "reward", "outcome", "cinema"])(
    "rejects a fully sealed opening with invalid %s before all destination setters",
    async (kind) => {
      const { capsule, snapshot } = await sealedActualOpening("menu", false, false, (source) => {
        const raw = source as unknown as { state: Record<string, Record<string, unknown>> };
        const run = raw.state["tear.run.v1"],
          world = raw.state["tear.world.v1"],
          reward = raw.state["tear.reward.v1"];
        if (run === undefined || world === undefined || reward === undefined)
          throw new Error("fixture missing required components");
        if (kind === "tick") {
          run.tick = 1;
          return { ...source, tick: 1 };
        }
        if (kind === "mode") run.mode = "tutorial";
        if (kind === "clock") world.simulationSeconds = 0.5;
        if (kind === "runtime") run.runTime = 0.1;
        if (kind === "reward") (reward.selection as Record<string, unknown>).phase = "draft";
        if (kind === "outcome")
          Object.assign((world.runtime as { lifecycle: object }).lifecycle, { phase: "terminated", outcome: "defeat" });
        if (kind === "cinema")
          raw.state["tear.cinematic.v1"] = {
            version: 1,
            active: true,
            scriptId: "missing-opening",
            scriptRevision: 1,
            beatId: "enter",
            beatIndex: 0,
            elapsedSeconds: 0,
            context: {},
          };
        return source;
      });
      const target = createProductionReplayWorld({ seed: "invalid-sealed-opening" }),
        unchanged = openingDestinationEvidence(target);
      const set = vi.fn(),
        destination = {
          ...target,
          world: {
            ...target.world,
            state: { ...target.world.state, setRun: set, setPlayer: set, setBlade: set, setEnemies: set },
          },
        };
      expect(() => {
        const permit = issueGhostRecordedOpeningPermit(capsule);
        if (permit === undefined) throw new Error("missing permit");
        restoreProductionReplaySnapshot(destination, snapshot, permit);
      }).toThrow();
      expect(set).not.toHaveBeenCalled();
      unchanged();
    },
  );

  it.each(["root", "context", "start", "completion", "duplicate completion", "missing receipt"])(
    "refuses %s linkage without issuing an opening capability",
    async (kind) => {
      const { capsule } = await sealedActualOpening(),
        bad = structuredClone(capsule) as unknown as {
          manifest: { rootIntegrity: string; provenance: { replayContext: { run: { id: string } } } };
          tracks: { events: { value: { type: string; payload: Record<string, unknown> } }[]; results: unknown[] };
        };
      if (kind === "root") bad.manifest.rootIntegrity = "wrong-root";
      if (kind === "context") bad.manifest.provenance.replayContext.run.id = "old-session";
      if (kind === "start") {
        const event = bad.tracks.events.find((entry) => entry.value.type === "run.started");
        if (event) event.value.payload.runId = "old-run";
      }
      const completion = bad.tracks.events.find(
        (entry) => entry.value.payload.boundary === "recorded-opening-playing-exposed",
      );
      if (kind === "completion" && completion) completion.value.payload.runId = "old-run";
      if (kind === "duplicate completion" && completion) bad.tracks.events.push(completion);
      if (kind === "missing receipt") bad.tracks.results = [];
      expect(() => issueGhostRecordedOpeningPermit(bad as unknown as GhostReadCapsule)).toThrow();
    },
  );

  it("does not treat a malformed supplied descriptor as legacy absence when the captured UI is already playing", async () => {
    const { capsule } = await sealedActualOpening("playing");
    const bad = structuredClone(capsule) as unknown as {
      manifest: { provenance: { replayContext: { simulation: { opening: { version: number } } } } };
    };
    bad.manifest.provenance.replayContext.simulation.opening.version = 2;
    expect(() => issueGhostRecordedOpeningPermit(bad as unknown as GhostReadCapsule)).toThrow(
      /malformed or unsupported/,
    );
    expect(verifyGhostCapsuleProductionReplay(bad as unknown as GhostReadCapsule).status).toBe("mismatch");
  });

  it("does not attest completion when an actual source start listener throws before playing", () => {
    const fixture = actualOpeningHost("gameover", true);
    expect(() => fixture.controller.start("endless", "normal")).toThrow(/source start listener/);
    expect(fixture.events.map((event) => event.type)).toEqual(["run.started"]);
    expect(fixture.order).not.toContain("playing");
    expect(fixture.order).not.toContain("completion");
    expect(fixture.pending()).toBe(false);
  });

  it("uses a constructed win predecessor to prove descend-again host ordering and new Campaign identity only", () => {
    const fixture = actualOpeningHost("win"),
      previous = fixture.source.replay.world.lifecycle.snapshot().sessionId;
    fixture.controller.start("campaign", "normal");
    expect(fixture.captured()?.snapshot.state["tear.ui.v1"]).toMatchObject({ screen: "win" });
    expect(fixture.source.replay.world.lifecycle.snapshot().sessionId).not.toBe(previous);
    expect(fixture.events[0]).toMatchObject({ type: "run.started", payload: { mode: "campaign", runId: "run-9ix" } });
    expect(fixture.order.slice(-3)).toEqual(["started", "playing", "completion"]);
    // Constructed route fixture: this does not attest a natural60-wave Campaign/finale.
  });

  it("advances the disclosed injected-held-input production fixture180 ticks without later keyframes or receipt-input injection", async () => {
    const { capsule, fixture } = await sealedActualOpening("setup", false, true),
      before = stableVerificationHash(capsule);
    const mapped = mapGhostCapsuleToReplayEnvelope(capsule),
      permit = issueGhostRecordedOpeningPermit(capsule);
    expect(mapped.issues).toEqual([]);
    if (permit === undefined) throw new Error("permit missing");
    const anchor = mapped.ghost.snapshots.find((snapshot) => snapshot.tick === 0);
    if (anchor === undefined) throw new Error("anchor missing");
    // Deliberately derived in-memory test envelope: source archive and later anchors stay immutable.
    const derived = createGhostV3({ ...mapped.ghost, snapshots: [anchor] });
    const capture = fixture.captured();
    if (capture === undefined) throw new Error("capture missing");
    const initialInput = capture.input;
    expect(initialInput).toMatchObject({ tick: 0, moveX: 0.75, primaryHeld: true });
    const openingReceipt = createGhostAuthoritativeReceipt(0, capture.semanticHash, initialInput);
    const composition = createProductionGhostReplayComposition({
      seed: "unused",
      openingPermit: permit,
      inputSnapshots: new Map([[0, openingReceipt.input]]),
    });
    const sampled = new Map<number, { stateHash: string; input: typeof initialInput }>(),
      created: ReturnType<typeof composition.create>[] = [],
      advances: number[] = [],
      executed: number[] = [];
    // Since c4d9569c production replay advances through the screen-gated
    // advanceExact path (a gated tick returns a null result), not advanceOne.
    const recording = {
      create(snapshot: Parameters<typeof composition.create>[0]) {
        const session = composition.create(snapshot),
          advance = session.simulation.advanceExact.bind(session.simulation),
          restore = vi.spyOn(session.simulation.input, "restore");
        created.push(session);
        let count = 0,
          steps = 0;
        vi.spyOn(session.simulation, "advanceExact").mockImplementation((actionsForTick, lifecycle) => {
          const advanced = advance(actionsForTick, lifecycle);
          count++;
          advances[created.length - 1] = count;
          const result = advanced.result;
          if (result !== null) steps++;
          executed[created.length - 1] = steps;
          if (result !== null && [1, 60, 120, 180].includes(result.tick))
            sampled.set(result.tick, { stateHash: result.stateHash, input: session.simulation.input.snapshot() });
          return advanced;
        });
        expect(session.simulation.input.snapshot()).toEqual(initialInput);
        expect(restore).not.toHaveBeenCalled();
        return session;
      },
    };
    const world = new GhostProductionReplayWorld(derived, recording);
    world.seek(0);
    expect(created[0]?.waveReward.screen()).toBe("setup");
    world.seek(180);
    expect(advances[1]).toBe(180);
    expect(executed[1]).toBe(180);
    expect(created[1]?.waveReward.screen()).toBe("playing");
    for (const [tick, observed] of sampled) {
      const receiptEntry = capsule.tracks.results.find((entry) => entry.tick === tick);
      expect(receiptEntry?.value).toMatchObject(observed);
    }
    expect(sampled.size).toBe(4);
    const repeated = world.seek(180);
    expect(repeated.semanticHash).toBe(sampled.get(180)?.stateHash);
    expect(advances[2]).toBe(180);
    expect(executed[2]).toBe(180);
    expect(stableVerificationHash(capsule)).toBe(before);
    const verification = verifyGhostCapsuleOpeningContinuation(capsule);
    expect(verification.status).toBe("verified");
    expect(verification.continuation).toMatchObject({
      steps: 180,
      laterKeyframesUsed: false,
      sourceRootIntegrity: capsule.manifest.rootIntegrity,
    });
    expect(verification.comparisons.map((entry) => [entry.tick, entry.equal, entry.inputEqual])).toEqual([
      [60, true, true],
      [120, true, true],
      [180, true, true],
    ]);
    expect(
      verifyGhostCapsuleOpeningContinuation({
        ...capsule,
        tracks: { ...capsule.tracks, results: capsule.tracks.results.filter((entry) => entry.tick !== 120) },
      }).status,
    ).toBe("unavailable");
    expect(stableVerificationHash(capsule)).toBe(before);
  });

  it.each(["throw", "reenter-caught"])(
    "fails the actual replay session before UI/advance when its start sink %s",
    async (kind) => {
      const { capsule } = await sealedActualOpening(),
        mapped = mapGhostCapsuleToReplayEnvelope(capsule),
        openingPermit = issueGhostRecordedOpeningPermit(capsule);
      if (openingPermit === undefined) throw new Error("permit missing");
      const bus = new TearGameplayEventBus(),
        composition = createProductionGhostReplayComposition({ seed: "unused", openingPermit, gameplayEvents: bus });
      let session: ReturnType<typeof composition.create> | undefined,
        calls = 0;
      const world = new GhostProductionReplayWorld(mapped.ghost, {
        create(snapshot) {
          session = composition.create(snapshot);
          return session;
        },
      });
      bus.subscribe(() => {
        calls++;
        if (kind === "throw") throw new Error("sink failed");
        try {
          world.seek(1);
        } catch {
          /* A caught nested error must still poison the outer transition. */
        }
      });
      expect(() => world.seek(1)).toThrow(/sink failed|invalidated/);
      expect(calls).toBe(1);
      expect(session?.waveReward.screen()).toBe("menu");
      expect(session?.simulation.scheduler.tick).toBe(0);
      expect(() => session?.completeRecordedOpening()).toThrow(/failed|reentrant/);
      expect(calls).toBe(1);
    },
  );

  it("requires complete source evidence for legacy inference and rejects forged/cross-anchor permits before setters", async () => {
    const incomplete = await sealedActualOpening("menu", true);
    expect(() => issueGhostRecordedOpeningPermit(incomplete.capsule)).toThrow(
      /legacy opening completion is unavailable/,
    );
    const legacy = await sealedActualOpening("menu", true, true),
      permit = issueGhostRecordedOpeningPermit(legacy.capsule);
    if (permit === undefined) throw new Error("permit missing");
    expect(readGhostRecordedOpeningPermit(permit, legacy.snapshot).kind).toBe("legacy-inferred");
    const target = createProductionReplayWorld({ seed: "rejected-opening-target" }),
      before = target.world.state.run(),
      setter = vi.fn();
    const observed = { ...target, world: { ...target.world, state: { ...target.world.state, setRun: setter } } };
    expect(() => restoreProductionReplaySnapshot(observed, legacy.snapshot, {} as GhostRecordedOpeningPermit)).toThrow(
      /permit/,
    );
    expect(() => restoreProductionReplaySnapshot(observed, { ...legacy.snapshot, id: "other-anchor" }, permit)).toThrow(
      /another anchor/,
    );
    expect(setter).not.toHaveBeenCalled();
    expect(target.world.state.run()).toBe(before);
  });
  it("scopes actual host capture after opening/input and before native start/playing", () => {
    const fixture = actualOpeningHost();
    fixture.controller.start("endless", "normal");
    expect(fixture.order).toEqual([
      "opening",
      "input",
      "held",
      "boundary",
      "recording",
      "started",
      "playing",
      "completion",
    ]);
    expect(fixture.boundary()).toMatchObject({
      phase: "opening-initialized-before-run-start",
      runId: "run-9ix",
      seed: 12345,
    });
    expect(fixture.captured()?.snapshot.state["tear.ui.v1"]).toMatchObject({ screen: "setup" });
    expect(fixture.events[0]).toMatchObject({
      type: "run.started",
      tick: 0,
      phase: "pre-simulation",
      payload: { wave: 0, runTimeSeconds: 0 },
    });
    expect(fixture.captured()?.snapshot.state["tear.run.v1"]).toMatchObject({ wave: 1, runTime: 0 });
  });

  it("preserves actual host opening UI through a sealed capsule permit and completes it once", async () => {
    const { snapshot, capsule } = await sealedActualOpening();
    const permit = issueGhostRecordedOpeningPermit(capsule);
    if (permit === undefined) throw new Error("permit missing");
    expect(readGhostRecordedOpeningPermit(permit, snapshot).kind).toBe("explicit");
    const events: string[] = [],
      bus = new TearGameplayEventBus();
    bus.subscribe((event) => {
      events.push(event.kind);
    });
    const composition = createProductionGhostReplayComposition({
        seed: "temporary",
        openingPermit: permit,
        gameplayEvents: bus,
      }),
      restored = composition.create(snapshot);
    expect(restored.waveReward.screen()).toBe("menu");
    expect(events).toEqual([]);
    const clock = restored.replay.clock.sim,
      rng = restored.replay.random.streams.snapshot(),
      entropy = restored.replay.cosmeticEmissionRandom.snapshot();
    restored.completeRecordedOpening();
    restored.completeRecordedOpening();
    expect(restored.waveReward.screen()).toBe("playing");
    expect(events).toEqual(["run"]);
    expect(restored.replay.clock.sim).toBe(clock);
    expect(restored.replay.random.streams.snapshot()).toEqual(rng);
    expect(restored.replay.cosmeticEmissionRandom.snapshot()).toEqual(entropy);
    expect(verifyGhostCapsuleProductionReplay(capsule).status).toBe("verified");
    expect(createGhostProductionReplaySession(capsule).seek(0).tick).toBe(0);
  });
  it("owns the ordered replacement-to-play transaction and deterministic identities", () => {
    const events: string[] = [];
    let installedSeed = 0;
    const controller = new LiveRunStartController({
      replaceActiveRun: () => events.push("replace"),
      initializeWorld: () => {
        events.push("world");
        return {
          weaponId: "blade",
          mods: {},
          scaling: { coin: 1, score: 1, enemyHp: 1, enemyCount: 1 },
          achievementSnapshot: [],
        };
      },
      resetAuthoritativeClocks: () => events.push("clocks"),
      finishWorldReset: () => events.push("finish-world"),
      createRunSeed: () => 12345,
      resetRunRandom: () => events.push("random"),
      installSession: (session) => {
        installedSeed = session.runSeed;
        events.push("install");
      },
      startLifecycle: (id) => events.push(`lifecycle:${id}`),
      exposeDebugState: () => events.push("debug"),
      updateProgressionTracking: () => events.push("progression"),
      startRecording: () => events.push("recording"),
      publishRunStarted: () => events.push("event:started"),
      configureMode: () => events.push("mode"),
      applyMetaProgression: () => events.push("meta"),
      activateOpeningContent: () => events.push("content"),
      enterPlayingState: () => events.push("playing"),
      beginMusic: () => events.push("music"),
      requestPointerLock: () => events.push("lock"),
    });

    const session = controller.start("endless", "normal");
    expect(installedSeed).toBe(12345);
    expect(session.voidSeed).toBeGreaterThan(0);
    expect(events).toEqual([
      "replace",
      "world",
      "clocks",
      "random",
      "install",
      "finish-world",
      "lifecycle:run-9ix",
      "debug",
      "progression",
      "mode",
      "meta",
      "content",
      "recording",
      "event:started",
      "playing",
      "music",
      "lock",
    ]);
  });
});

describe("native Seed-Locked start transaction", () => {
  it("applies shared projected META and one headstart before the recording, without rewriting private ranks", () => {
    vi.stubGlobal("__TEAR_BUILD_REVISION__", "race-unit");
    try {
      const start = (privateRanks: Record<string, number>, reference?: GhostLiveReference) => {
        const f = actualOpeningHost(),
          replay = f.source.replay;
        const meta = createMetaProgression({
          store: { get: () => null, set: vi.fn() },
          config: replay.configuration.value,
          cloud: { loggedIn: () => false, push: () => Promise.resolve() },
          random: replay.random.streams.stream("draft"),
          upgrades: UPGRADES,
          applyUpgrade: () => {
            throw new Error("Race must not apply private random headstart");
          },
        });
        meta.META.data.buy = { ...privateRanks };
        Object.assign(f.dependencies, meta, { createRunSeed: () => 117, UPGRADES, applyUpgrade });
        const race = createLiveSeedRace({
          dependencies: f.dependencies as unknown as Parameters<typeof createLiveSeedRace>[0]["dependencies"],
          run: () => requireRaceValue(replay.world.state.run()),
          player: () => requireRaceValue(replay.world.state.player()),
          blade: () => requireRaceValue(replay.world.state.blade()),
          baseline: () => replay.configuration.baseSnapshot(),
          capture: () =>
            new Map(
              Object.entries(
                captureProductionReplayCheckpoint(replay, f.source.combat, f.source.waveReward, "race-pre-record")
                  .snapshot.state,
              ),
            ),
          resetRewards: f.source.waveReward.reward.reset,
          recording: {
            runId: () => undefined,
            active: () => false,
            nextSequence: () => 1,
            tick: () => 0,
            record: () => undefined,
          },
          setup: () => ({ mode: "endless", difficulty: "normal", weapon: "chainblade", boss: "shuffle" }),
        });
        const pendingStageEligibility: boolean[] = [];
        const controller = createLiveRunStartHost({
          ...f.context,
          race,
          createRunSeed: () => race.seed() ?? 999,
          achievementTracking: () => false,
          loadStage: () => {
            // Native stage entry occurs before finalize installs the declaration.
            // The live telemetry subscriber must use this scoped owner as well.
            expect(replay.world.state.run()?.seedRace).toBeUndefined();
            pendingStageEligibility.push(race.active());
          },
        });
        const invoke = () => {
          controller.start("endless", "normal");
        };
        if (reference) race.challenge(reference, invoke);
        else race.reference(invoke);
        const run = requireRaceValue(replay.world.state.run()),
          captured = f.captured();
        expect(pendingStageEligibility).toEqual([true]);
        expect(race.active()).toBe(true);
        if (!run.seedRace || !captured) throw new Error("declared recording missing");
        expect(captured.snapshot.state["tear.run.v1"]).toMatchObject({ seedRace: run.seedRace });
        expect(seedRaceInitialBuildHash(captured.snapshot.state)).toBe(run.seedRace.shared.initialBuildHash);
        expect(run.mods.owned[requireRaceValue(run.seedRace.shared.headstartId)]).toBe(1);
        expect(meta.META.data.buy).toEqual(privateRanks);
        expect(f.markMode).not.toHaveBeenCalled();
        expect(f.achievementCheck).not.toHaveBeenCalled();
        expect(f.order.indexOf("recording")).toBeLessThan(f.order.indexOf("started"));
        return { run, captured, race };
      };
      const source = start({ tough: 2, sharp: 1, headstart: 1, reserve: 1, reroll: 3, expanded: 1 });
      const reference = {
        seedRace: source.run.seedRace,
        assistance: {
          format: "tear-ghost-chase",
          version: 1,
          sourceId: "source",
          sourceRoot: "1".repeat(16),
          sourceManifestHash: "2".repeat(16),
          actor: "unknown",
          coachEnabled: true,
          ghostVisible: true,
          competitiveEligible: false,
        },
      } as GhostLiveReference;
      const target = start({ tough: 0, sharp: 0, headstart: 0, reserve: 0, reroll: 0, expanded: 0 }, reference);
      expect(target.run.seedRace?.shared).toEqual(source.run.seedRace?.shared);
      expect(target.run.seedRace).toMatchObject({ role: "challenger", source: { id: "source" } });
      expect(target.run.mods.owned).toEqual(source.run.mods.owned);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function requireRaceValue<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Race fixture value unavailable");
  return value;
}
