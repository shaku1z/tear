import { describe, expect, it, vi } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { createCampaignChapterBindingSpec, stageCampaignChapterBinding } from "../../src/gameplay/campaign/chapter-cinematic-binding";
import { ROOTBOUND_LAST_SPRING } from "../../src/gameplay/entities/enemy-types/rootbound";
import { createRootboundRegrowthConnections, ROOTBOUND_REGROWTH_TIMING } from "../../src/gameplay/environment/regrowth-link";
import type { CampaignChapterTiming } from "../../src/gameplay/campaign/chapter-controller";
import { CinematicTimeline, INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } from "../../src/gameplay/runtime/cinematic-director";
import { stageAt } from "../../src/gameplay/stages";
import { stableVerificationHash } from "../../src/replay/hash";
import { captureProductionReplayCheckpoint, createProductionGhostReplayComposition, createProductionReplayWorld, environmentHash, environmentSnapshotToObservation, restoreProductionReplayChapterBinding, restoreProductionReplaySnapshot } from "../../src/tearbench";
import { GhostProductionReplayWorld, createGhostV3, type GhostReplayTrident } from "../../src/ghost";
import { compileResolvedTearSdlSnapshot } from "../../src/tearbench/state-forge-live-compiler";
import { resolveTearSdl, type TearSdlDocumentV1 } from "../../src/tearbench/tearsdl";
import type { ProductionReplayWorld } from "../../src/tearbench/production-world-factory";
import type { TearSnapshotV1 } from "../../src/tearbench/contracts";

const timing: CampaignChapterTiming = Object.freeze({
  loreReveal: 0.1, chapterIn: 0.2, loreExit: 0.3, biomeRevealBrief: 0.4,
  biomeRevealFull: 0.5, readyBrief: 0.6, readyFull: 0.7,
  dialogueDuck: 0.8, biomeRevealDuck: 0.9,
});

function activeChapterCheckpoint(slowText = false, opening = false) {
  const composition = createProductionGhostReplayComposition({ seed: "runtime-atomic-chapter", mode: "campaign" });
  const source = composition.create(undefined);
  if (slowText) source.replay.configuration.value.presentation.revealCharsPerSec = 1;
  const spec = { ...createCampaignChapterBindingSpec({ stageIndex: 0, priorOutro: null,
    brief: false, prologueShownBefore: false, timing: slowText ? { ...timing, biomeRevealFull: 60 } : timing }),
    flowState: opening ? "LORE_ENTER" as const : slowText ? "BIOME_REVEAL" as const : "LORE_READ" as const };
  const chapter = stageCampaignChapterBinding(spec, stageAt(0), {
    dispatch: vi.fn(), preparedWave: () => true, activationDeferred: () => true, clear: vi.fn(),
  });
  Object.assign(source.replay.world.state.run() ?? {}, { _biomeIdx: 0, _prologueShown: true, chapterState: spec.flowState });
  source.replay.world.lifecycle.restore({ phase: "wave-prepared", sessionId: "runtime-atomic-chapter", wave: 1,
    bossWave: false, activationDeferred: true, reward: null, outcome: null, revision: 2 });
  source.replay.world.context.cinema.start(chapter.binding.script, chapter.binding.context);
  if (!opening) {
    expect(source.replay.world.context.cinema.skipTo(slowText ? "reveal" : "page-0")).toBe(true);
    source.replay.world.context.cinema.update(slowText ? 10 : 0.01);
  }
  else source.waveReward.reward.reset();
  const { snapshot, semanticHash } = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "active-chapter-atomicity");
  const world = snapshot.state["tear.world.v1"] as Readonly<Record<string, unknown>>;
  const runtime = { ...(world.runtime as Readonly<Record<string, unknown>>), chapterBinding: spec,
    cinema: snapshot.state["tear.cinematic.v1"] };
  return { composition, runtime, semanticHash, snapshot: { ...snapshot, state: { ...snapshot.state,
    "tear.world.v1": { ...world, runtime } } } as TearSnapshotV1 };
}

function unchangedDestination(replay: ProductionReplayWorld) {
  const references = () => [replay.world.state.run(), replay.world.state.player(), replay.world.state.blade(),
    replay.world.state.enemies(), replay.world.state.projectiles(), replay.world.state.floaters(),
    replay.world.state.slowZones(), replay.world.state.temporaryWalls(), replay.world.state.bossIntro(),
    replay.configuration.value, replay.configuration.value.presentation, replay.stage.platforms];
  const values = () => ({ config: replay.configuration.snapshot(), rng: replay.world.context.services.random.snapshot(),
    lifecycle: replay.world.lifecycle.snapshot(), cinema: replay.world.context.cinema.captureState(),
    stage: replay.stage.index, platforms: replay.stage.platforms, environment: replay.world.context.environment.snapshot(),
    transient: Object.fromEntries(Object.entries(replay.world.context.transient).filter(([, value]) => typeof value !== "function")),
    actors: JSON.parse(JSON.stringify({ run: replay.world.state.run(), player: replay.world.state.player(),
      blade: replay.world.state.blade(), enemies: replay.world.state.enemies(), projectiles: replay.world.state.projectiles() })) as unknown,
    processConfiguration: CONFIG });
  const beforeReferences = references(), beforeValues = structuredClone(values());
  return () => {
    references().forEach((value, index) => { expect(value).toBe(beforeReferences[index]); });
    expect(values()).toEqual(beforeValues);
  };
}

function withoutPresentation(snapshot: TearSnapshotV1): TearSnapshotV1 {
  const configuration = snapshot.state["tear.configuration.v1"] as { values: Readonly<Record<string, unknown>> };
  const values = { ...configuration.values };
  Reflect.deleteProperty(values, "presentation");
  return { ...snapshot, state: { ...snapshot.state, "tear.configuration.v1": { ...configuration, values } } };
}

describe("production replay composition", () => {
  it("normalizes only the detached entry screen of a valid tick-zero campaign opening anchor", () => {
    const fixture = activeChapterCheckpoint(false, true);
    const snapshot: TearSnapshotV1 = { ...fixture.snapshot, state: { ...fixture.snapshot.state,
      "tear.ui.v1": { screen: "menu", focusId: "0" } } };
    const before = structuredClone(snapshot);
    const restored = fixture.composition.create(snapshot);
    expect(restored.waveReward.screen()).toBe("playing");
    expect(restored.replay.world.context.cinema.captureState()).toEqual(snapshot.state["tear.cinematic.v1"]);
    expect(stableVerificationHash(restored.semanticProjection())).toBe(fixture.semanticHash);
    expect(snapshot).toEqual(before);
  });

  it.each(["nonzero tick", "inactive chapter", "malformed chapter"])("rejects a menu anchor with %s before replacement", (kind) => {
    const fixture = activeChapterCheckpoint(false, true);
    const world = fixture.snapshot.state["tear.world.v1"] as Readonly<Record<string, unknown>>;
    const run = fixture.snapshot.state["tear.run.v1"] as Readonly<Record<string, unknown>>;
    const snapshot = { ...fixture.snapshot, tick: kind === "nonzero tick" ? 1 : 0, state: { ...fixture.snapshot.state,
      "tear.ui.v1": { screen: "menu", focusId: "0" },
      "tear.run.v1": kind === "nonzero tick" ? { ...run, tick: 1 } : run,
      "tear.world.v1": { ...world, ...(kind === "nonzero tick" ? { clock: 1 } : {}), runtime: { ...fixture.runtime,
        ...(kind === "inactive chapter" ? { chapterBinding: null } : {}),
        ...(kind === "malformed chapter" ? { chapterBinding: {} } : {}) } },
      ...(kind === "inactive chapter" ? { "tear.cinematic.v1": INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } : {}) } };
    const target = createProductionReplayWorld({ seed: "menu-rejection" });
    const assertUnchanged = unchangedDestination(target);
    expect(() => restoreProductionReplaySnapshot(target, snapshot)).toThrow(/UI screen is invalid|chapter binding/);
    assertUnchanged();
  });

  const rejectedRuntimeCases = [
    { name: "malformed chapter", patch: (runtime: Readonly<Record<string, unknown>>) => ({ ...runtime, chapterBinding: {} }),
      cinema: undefined, error: /chapter binding/ },
    { name: "invalid lifecycle phase", patch: (runtime: Readonly<Record<string, unknown>>) => ({ ...runtime,
      lifecycle: { ...(runtime.lifecycle as object), phase: "invalid-phase" } }), cinema: undefined, error: /lifecycle phase/ },
    { name: "unsupported cinematic revision", patch: (runtime: Readonly<Record<string, unknown>>) => runtime,
      cinema: { scriptRevision: "unsupported-revision" }, error: /bound cinematic script/ },
    { name: "chapter with active-wave lifecycle", patch: (runtime: Readonly<Record<string, unknown>>) => ({ ...runtime,
      lifecycle: { ...(runtime.lifecycle as object), phase: "wave-active", activationDeferred: false } }),
      cinema: undefined, error: /prepared-wave lifecycle/ },
  ];

  it.each(rejectedRuntimeCases)("rejects $name before replacing any destination owner", ({ patch, cinema, error }) => {
    const fixture = activeChapterCheckpoint();
    const world = fixture.snapshot.state["tear.world.v1"] as Readonly<Record<string, unknown>>;
    const snapshot = { ...fixture.snapshot, state: { ...fixture.snapshot.state,
      "tear.world.v1": { ...world, runtime: patch(fixture.runtime) },
      ...(cinema === undefined ? {} : { "tear.cinematic.v1": {
        ...(fixture.snapshot.state["tear.cinematic.v1"] as object), ...cinema } }) } };
    const target = createProductionReplayWorld({ seed: "atomicity-target", mode: "endless",
      enemies: [{ id: "reflection", x: 600, y: 500 }] });
    target.configuration.value.presentation.revealCharsPerSec = 100_000;
    target.world.context.transient.feel.flash = 0.4;
    const assertUnchanged = unchangedDestination(target);
    expect(() => restoreProductionReplaySnapshot(target, snapshot)).toThrow(error);
    assertUnchanged();
  });

  it.each(rejectedRuntimeCases)("direct chapter restore rejects $name before lifecycle mutation", ({ patch, cinema, error }) => {
    const fixture = activeChapterCheckpoint();
    const target = createProductionReplayWorld({ seed: "direct-atomicity-target", mode: "campaign" });
    const assertUnchanged = unchangedDestination(target);
    const runtime = { ...patch(fixture.runtime), ...(cinema === undefined ? {} : {
      cinema: { ...(fixture.runtime.cinema as object), ...cinema } }) };
    expect(() => { restoreProductionReplayChapterBinding(target, runtime); }).toThrow(error);
    assertUnchanged();
  });

  it("restores and recaptures a valid active chapter using candidate configuration, then activates its prepared wave", () => {
    const fixture = activeChapterCheckpoint();
    const restored = fixture.composition.create(fixture.snapshot);
    expect(restored.replay.world.context.cinema.captureState()).toEqual(fixture.snapshot.state["tear.cinematic.v1"]);
    const checkpoint = captureProductionReplayCheckpoint(restored.replay, restored.combat, restored.waveReward, "chapter-roundtrip");
    expect((checkpoint.snapshot.state["tear.world.v1"] as { runtime: { chapterBinding: unknown } }).runtime.chapterBinding)
      .toEqual(fixture.runtime.chapterBinding);
    const second = fixture.composition.create(checkpoint.snapshot);
    second.replay.world.context.cinema.complete();
    expect(second.replay.world.state.run()).toMatchObject({ chapterState: "WAVE_LIVE" });
    expect(second.replay.world.lifecycle.snapshot()).toMatchObject({ phase: "wave-active", activationDeferred: false });
  });

  it("validates active cinematic reveal timing against candidate configuration", () => {
    const fixture = activeChapterCheckpoint(true);
    expect((fixture.snapshot.state["tear.configuration.v1"] as { values: { presentation: unknown } }).values.presentation)
      .toMatchObject({ revealCharsPerSec: 1 });
    expect(fixture.snapshot.state["tear.blade.v1"]).not.toHaveProperty("presentation");
    expect(fixture.snapshot.state["tear.player.v1"]).not.toHaveProperty("presentation");
    const restored = fixture.composition.create(fixture.snapshot);
    expect(restored.replay.world.context.cinema.captureState()).toEqual(fixture.snapshot.state["tear.cinematic.v1"]);
    expect(restored.replay.configuration.value.presentation.revealCharsPerSec).toBe(1);
    const recaptured = captureProductionReplayCheckpoint(restored.replay, restored.combat, restored.waveReward, "slow-chapter-roundtrip");
    const second = fixture.composition.create(recaptured.snapshot);
    expect(second.replay.world.context.cinema.captureState()).toEqual(fixture.snapshot.state["tear.cinematic.v1"]);
    second.replay.world.context.cinema.complete();
    expect(second.replay.world.lifecycle.snapshot()).toMatchObject({ phase: "wave-active", activationDeferred: false });
  });

  it("rejects legacy omitted-presentation timing against base before replacing a modified destination", () => {
    const fixture = activeChapterCheckpoint(true);
    const target = createProductionReplayWorld({ seed: "legacy-slow-target" });
    target.configuration.value.presentation.revealCharsPerSec = 1;
    const assertUnchanged = unchangedDestination(target);
    expect(() => restoreProductionReplaySnapshot(target, withoutPresentation(fixture.snapshot)))
      .toThrow(/reveal visibility is inconsistent/);
    assertUnchanged();
  });

  it("restores legacy omitted-presentation payloads using the authoritative base rather than current target tuning", () => {
    const fixture = activeChapterCheckpoint();
    const target = createProductionReplayWorld({ seed: "legacy-default-target" });
    target.configuration.value.presentation.revealCharsPerSec = 1;
    const stableConfiguration = target.configuration.value, stablePresentation = stableConfiguration.presentation;
    restoreProductionReplaySnapshot(target, withoutPresentation(fixture.snapshot));
    expect(target.configuration.value).toBe(stableConfiguration);
    expect(target.configuration.value.presentation).toBe(stablePresentation);
    expect(target.configuration.value.presentation.revealCharsPerSec).toBe(CONFIG.presentation.revealCharsPerSec);
    expect(target.world.context.cinema.captureState()).toEqual(fixture.snapshot.state["tear.cinematic.v1"]);
    target.world.context.cinema.complete();
    expect(target.world.lifecycle.snapshot()).toMatchObject({ phase: "wave-active", activationDeferred: false });
  });

  it("rejects malformed transient runtime data before replacing destination owners", () => {
    const fixture = activeChapterCheckpoint();
    const world = fixture.snapshot.state["tear.world.v1"] as Readonly<Record<string, unknown>>;
    const snapshot = { ...fixture.snapshot, state: { ...fixture.snapshot.state,
      "tear.world.v1": { ...world, runtime: { ...fixture.runtime, wasSwinging: "true" } } } };
    const target = createProductionReplayWorld({ seed: "transient-atomicity-target" });
    const assertUnchanged = unchangedDestination(target);
    expect(() => restoreProductionReplaySnapshot(target, snapshot)).toThrow(/wasSwinging must be boolean/);
    assertUnchanged();
  });

  it("preserves an existing same-world non-chapter cinematic owner in the direct helper", () => {
    const target = createProductionReplayWorld({ seed: "same-world-cinema" });
    const onStart = vi.fn(), onEnter = vi.fn(), onComplete = vi.fn();
    const script = { id: "same-world", revision: "1", beats: [{ id: "held", duration: 3, onEnter }], onStart, onComplete };
    const context = { player: target.world.state.player() };
    target.world.context.cinema.start(script, context);
    const saved = target.world.context.cinema.captureState();
    target.world.context.cinema.update(0.1);
    restoreProductionReplayChapterBinding(target, { chapterBinding: null,
      lifecycle: target.world.lifecycle.snapshot(), cinema: saved });
    expect(target.world.context.cinema.captureState()).toEqual(saved);
    expect(target.world.context.cinema.script).toBe(script);
    expect(target.world.context.cinema.context).toBe(context);
    expect(context.player).toBe(target.world.state.player());
    expect(onStart).toHaveBeenCalledTimes(1); expect(onEnter).toHaveBeenCalledTimes(1);
    target.world.context.cinema.complete();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does not carry an outgoing non-chapter callback context into a replaced world", () => {
    const composition = createProductionGhostReplayComposition({ seed: "non-chapter-replacement" });
    const source = composition.create(undefined), target = createProductionReplayWorld({ seed: "outgoing-cinema" });
    const script = { id: "same-script-different-world", revision: "1", beats: [{ id: "held", duration: 3 }] };
    source.replay.world.context.cinema.start(script, { player: source.replay.world.state.player() });
    target.world.context.cinema.start(script, { player: target.world.state.player() });
    const { snapshot } = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "opaque-cinema");
    const assertUnchanged = unchangedDestination(target);
    expect(() => restoreProductionReplaySnapshot(target, snapshot)).toThrow(/bound cinematic script/);
    assertUnchanged();
  });

  it("restores boss intro identity without claiming unsupported fixed-tick playback", () => {
    const composition = createProductionGhostReplayComposition({ seed: "replay-boss-intro", mode: "bossonly" });
    const source = composition.create(undefined);
    const boss = source.replay.world.entities.createEnemy("rootbound", 800, 520,
      source.replay.world.state.run() as never);
    boss.introT = 1.4;
    source.replay.world.state.setEnemies([boss]);
    source.replay.world.state.setBossIntro({ boss, delay: 0, t: 0, dur: 1.4 });
    const { snapshot } = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "active-intro");
    const target = createProductionReplayWorld({ seed: "replay-boss-intro-target", mode: "bossonly" });
    restoreProductionReplaySnapshot(target, snapshot);
    expect(target.world.state.bossIntro()?.boss).toBe(target.world.state.enemies()[0]);
    expect(target.world.state.bossIntro()?.boss).not.toBe(boss);
    expect(target.world.state.bossIntro()).toMatchObject({ delay: 0, t: 0, dur: 1.4 });
    expect(() => composition.create(snapshot)).toThrow(/active boss intro playback is unsupported/);

    const world = snapshot.state["tear.world.v1"] as Readonly<Record<string, unknown>>;
    const runtime = world.runtime as Readonly<Record<string, unknown>>;
    const legacyRuntime = Object.fromEntries(Object.entries(runtime)
      .filter(([key]) => key !== "bossIntro" && key !== "bossIntroVersion"));
    const legacy = { ...snapshot, state: { ...snapshot.state, "tear.world.v1": { ...world, runtime: legacyRuntime } } };
    const priorBoss = target.world.state.enemies()[0];
    const priorIntro = target.world.state.bossIntro();
    expect(() => restoreProductionReplaySnapshot(target, legacy)).toThrow(/missing its intro binding/);
    expect(target.world.state.enemies()[0]).toBe(priorBoss);
    expect(target.world.state.bossIntro()).toBe(priorIntro);

    source.replay.world.state.setBossIntro(null);
    boss.introT = 0;
    const completed = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "completed-intro");
    restoreProductionReplaySnapshot(target, completed.snapshot);
    expect(target.world.state.bossIntro()).toBeNull();
    expect(() => composition.create(completed.snapshot)).not.toThrow();
  });

  it("captures and restores active Rootbound Regrowth and Last Spring state through the shared transaction", () => {
    const composition = createProductionGhostReplayComposition({ seed: "rootbound-phase-three-transaction", mode: "bossonly" });
    const source = composition.create(undefined);
    const boss = source.replay.world.entities.createEnemy("rootbound", 800, 520, source.replay.world.state.run() as never) as never as {
      phaseMarker: number; hp: number; maxHp: number; cinematicRequest: unknown; cinematicT: number; state: string; stateT: number;
      regrowthState: Readonly<{ phase: string; startTick: number | null; requiredConnectionIds: readonly string[]; progress: number }>;
      lastSpringStage: string | null; lastSpringT: number; lastSpringUseCount: number; lastSpringHitSpent: boolean;
      beginRegrowth(tick: number, connectionIds: readonly string[]): boolean;
      advanceRegrowth(tick: number, connectionIds: ReadonlySet<string>, broken?: boolean): unknown;
      startLastSpring(): boolean;
    };
    boss.phaseMarker = 3; boss.hp = boss.maxHp * 0.2; boss.cinematicRequest = null; boss.cinematicT = 0; boss.state = "idle"; boss.stateT = 0;
    source.replay.world.state.setEnemies([boss] as never);
    const links = createRootboundRegrowthConnections({ ownerId: "enemy:1", ownerPosition: { x: 800, y: 520 }, startTick: 40,
      rootNodes: [{ id: "left-remnant", x: 280, y: 800 }, { id: "heart-root", x: 800, y: 800 }, { id: "right-remnant", x: 1_320, y: 800 }] });
    expect(boss.beginRegrowth(40, links.combatObjects.map(({ id }) => id))).toBe(true);
    links.combatObjects.forEach((entry) => source.replay.world.context.environment.addCombatObject(entry));
    links.routes.forEach((entry) => source.replay.world.context.environment.addRoute(entry));

    const active = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "rootbound-regrowth-active");
    const restoredActive = composition.create(active.snapshot);
    const activeBoss = restoredActive.replay.world.state.enemies()[0] as never as typeof boss;
    expect(activeBoss.regrowthState).toMatchObject({ phase: "channeling", startTick: 40, progress: 0 });
    expect(activeBoss.regrowthState.requiredConnectionIds).toEqual(links.combatObjects.map(({ id }) => id));
    const restoredEnvironment = restoredActive.replay.world.context.environment.snapshot();
    expect(restoredEnvironment.combatObjects.map(({ id, state }) => ({ id, state })))
      .toEqual(links.combatObjects.map(({ id }) => ({ id, state: "active" })));
    expect(restoredEnvironment.routes.map(({ id, state }) => ({ id, state })))
      .toEqual(links.routes.map(({ id }) => ({ id, state: "active" })));
    const activeRoundTrip = captureProductionReplayCheckpoint(restoredActive.replay, restoredActive.combat,
      restoredActive.waveReward, "rootbound-regrowth-round-trip");
    expect(stableVerificationHash(activeRoundTrip.snapshot.state["tear.boss.v1"]))
      .toBe(stableVerificationHash(active.snapshot.state["tear.boss.v1"]));
    expect(activeRoundTrip.snapshot.hashes).toMatchObject({
      semantic: active.snapshot.hashes.semantic,
      environment: active.snapshot.hashes.environment,
    });

    boss.advanceRegrowth(40 + ROOTBOUND_REGROWTH_TIMING.channelTicks, new Set(), false);
    boss.state = "idle"; boss.stateT = 0;
    expect(boss.startLastSpring()).toBe(true);
    boss.lastSpringT = ROOTBOUND_LAST_SPRING.warning / 2;
    const spring = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "rootbound-last-spring-active");
    const restoredSpring = composition.create(spring.snapshot);
    const springBoss = restoredSpring.replay.world.state.enemies()[0] as never as typeof boss;
    expect(springBoss).toMatchObject({ lastSpringStage: "warning", lastSpringUseCount: 1,
      lastSpringT: ROOTBOUND_LAST_SPRING.warning / 2, lastSpringHitSpent: false });
    const springRoundTrip = captureProductionReplayCheckpoint(restoredSpring.replay, restoredSpring.combat,
      restoredSpring.waveReward, "rootbound-last-spring-round-trip");
    expect(stableVerificationHash(springRoundTrip.snapshot.state["tear.boss.v1"]))
      .toBe(stableVerificationHash(spring.snapshot.state["tear.boss.v1"]));
    expect(springRoundTrip.snapshot.hashes).toMatchObject({
      semantic: spring.snapshot.hashes.semantic,
      environment: spring.snapshot.hashes.environment,
    });

    const bossPayload = spring.snapshot.state["tear.boss.v1"] as readonly Readonly<Record<string, unknown>>[];
    const malformed = { ...spring.snapshot, state: { ...spring.snapshot.state,
      "tear.boss.v1": [{ ...bossPayload[0], lastSpringUseCount: 2 }] } };
    expect(() => composition.create(malformed)).toThrow(/Last Spring use count/u);

    const ghost = createGhostV3({ id: "rootbound-last-spring-seek", rulesetVersion: "live", sourceClassification: "native-v3",
      trident: replayTrident, actions: [], snapshots: [spring.snapshot], events: [] });
    const replay = new GhostProductionReplayWorld(ghost, composition);
    const firstSeek = replay.seek(spring.snapshot.tick);
    const repeatedSeek = replay.seek(spring.snapshot.tick);
    expect(repeatedSeek).toMatchObject({ usedSnapshotId: spring.snapshot.id, semanticHash: firstSeek.semanticHash });

    const forkDocument: TearSdlDocumentV1 = { format: "tearsdl", schemaVersion: 1, id: "rootbound-last-spring-fork",
      stateClass: "surgical-valid", seed: spring.snapshot.seed,
      start: { mode: "bossonly", difficulty: "normal", weapon: "sword", boss: "rootbound" },
      state: { boss: { lastSpringT: ROOTBOUND_LAST_SPRING.warning / 4 } } };
    const fork = compileResolvedTearSdlSnapshot(spring.snapshot, resolveTearSdl(forkDocument));
    const forked = composition.create(fork);
    expect((forked.replay.world.state.enemies()[0] as never as typeof boss).lastSpringT)
      .toBe(ROOTBOUND_LAST_SPRING.warning / 4);
    expect((composition.create(spring.snapshot).replay.world.state.enemies()[0] as never as typeof boss).lastSpringT)
      .toBe(ROOTBOUND_LAST_SPRING.warning / 2);
    expect(fork.hashes.exact).not.toBe(spring.snapshot.hashes.exact);
  });

  it("restores an active data-bound chapter and activates its prepared wave", () => {
    const replay = createProductionReplayWorld({ seed: "production-replay-chapter", mode: "campaign" });
    const spec = createCampaignChapterBindingSpec({ stageIndex: 0, priorOutro: null,
      brief: false, prologueShownBefore: false, timing });
    const staged = stageCampaignChapterBinding(spec, stageAt(0), {
      dispatch: vi.fn(), preparedWave: () => true, activationDeferred: () => true, clear: vi.fn(),
    });
    const source = new CinematicTimeline.Director(CONFIG);
    source.start(staged.binding.script, staged.binding.context);

    restoreProductionReplayChapterBinding(replay, {
      chapterBinding: spec,
      cinema: source.captureState(),
      lifecycle: { phase: "wave-prepared", sessionId: "production-replay-session", wave: 1,
        bossWave: false, activationDeferred: true, reward: null, outcome: null, revision: 2 },
    });
    expect(replay.world.lifecycle.snapshot()).toMatchObject({ phase: "wave-prepared", activationDeferred: true });
    expect(replay.world.context.cinema).toMatchObject({ active: true, blocksCombat: true });

    replay.world.context.cinema.complete();

    expect(replay.world.state.run()).toMatchObject({ chapterState: "WAVE_LIVE" });
    expect(replay.world.lifecycle.snapshot()).toMatchObject({ phase: "wave-active", activationDeferred: false });
  });

  it("rebases non-empty foreign environment state and rejects malformed post-rebase state atomically", () => {
    const composition = createProductionGhostReplayComposition({ seed: "production-replay-environment" });
    const source = composition.create(undefined);
    source.replay.world.context.environment.setStage("grounds", "restore");
    source.replay.world.context.environment.addField({ kind: "bloom-well", geometry: { x: 10, y: 20, radius: 25 }, state: "active", stateTick: 3, timer: 0.25, ownerId: null, schedule: null, eligibility: { player: true, enemies: true, bosses: false }, force: null, cleanupReason: null });
    const checkpoint = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "environment-rollback");
    const sourceEnvironment = source.replay.world.context.environment.snapshot();
    const sourceWorldId = sourceEnvironment.worldId ?? "source-world";
    const foreignWorldId = "foreign-world";
    const hazard = checkpoint.snapshot.state["tear.hazard.v1"] as Readonly<Record<string, unknown>>;
    const foreignFields = (hazard.fields as readonly Readonly<Record<string, unknown>>[]).map((field) => ({ ...field, id: String(field.id).replace(sourceWorldId, foreignWorldId) }));
    const foreignSnapshot = {
      ...checkpoint.snapshot,
      state: Object.freeze({ ...checkpoint.snapshot.state, "tear.hazard.v1": Object.freeze({ ...hazard, worldId: foreignWorldId, fields: foreignFields }) }),
    };
    const target = createProductionReplayWorld({ seed: "production-replay-environment-target", mode: "campaign" });
    restoreProductionReplaySnapshot(target, foreignSnapshot);
    const targetEnvironment = target.world.context.environment.snapshot();
    expect(targetEnvironment.fields).toHaveLength(1);
    expect(environmentHash(targetEnvironment)).toBe(environmentHash(sourceEnvironment));
    expect(environmentSnapshotToObservation(targetEnvironment)).toEqual(environmentSnapshotToObservation(sourceEnvironment));

    const targetBeforeMalformed = target.world.context.environment.snapshot();
    const destinationWorldId = targetBeforeMalformed.worldId;
    if (destinationWorldId === undefined) throw new Error("production replay environment world ID is required");
    const malformedFields = [foreignFields[0], { ...foreignFields[0], id: `${destinationWorldId}:field:1` }];
    const malformed = {
      ...foreignSnapshot,
      state: Object.freeze({ ...foreignSnapshot.state, "tear.hazard.v1": Object.freeze({ ...hazard, worldId: foreignWorldId, fields: malformedFields }) }),
    };
    expect(() => restoreProductionReplaySnapshot(target, malformed)).toThrow(/after rebase|duplicate/u);
    expect(target.world.context.environment.snapshot()).toEqual(targetBeforeMalformed);
  });
});
const replayTrident = Object.freeze({
  command: { kind: "command", status: "verified", available: true, resumable: true, seekable: false, reason: "Rootbound S9 proof" },
  state: { kind: "state", status: "verified", available: true, resumable: true, seekable: true, reason: "Rootbound S9 proof" },
  visual: { kind: "visual", status: "absent", available: false, resumable: false, seekable: false, reason: "not required" },
} satisfies GhostReplayTrident);
