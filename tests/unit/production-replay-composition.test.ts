import { describe, expect, it, vi } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import {
  createCampaignChapterBindingSpec,
  stageCampaignChapterBinding,
} from "../../src/gameplay/campaign/chapter-cinematic-binding";
import {
  createBossAttackRunnerState,
  type BossAttackRunnerState,
} from "../../src/gameplay/entities/boss-attack-runner";
import {
  createRootboundRegrowthConnections,
  ROOTBOUND_REGROWTH_TIMING,
} from "../../src/gameplay/environment/regrowth-link";
import type { CampaignChapterTiming } from "../../src/gameplay/campaign/chapter-controller";
import { CinematicTimeline, INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } from "../../src/gameplay/runtime/cinematic-director";
import { stageAt } from "../../src/gameplay/stages";
import { stableVerificationHash } from "../../src/domain/hash";
import {
  captureProductionReplayCheckpoint,
  createProductionGhostReplayComposition,
  restoreProductionReplayChapterBinding,
  restoreProductionReplaySnapshot,
} from "../../src/app/world/detached/replay-composition";
import { createProductionReplayWorld } from "../../src/app/world/detached/world-factory";
import { environmentHash, environmentSnapshotToObservation } from "../../src/gameplay/snapshot/environment-codec";
import { GhostProductionReplayWorld } from "../../src/ghost/replay-world";
import { createGhostV3, type GhostReplayTrident } from "../../src/ghost/truth-kernel";
import { compileResolvedTearSdlSnapshot } from "../../src/tearbench/state-setup-live-compiler";
import { resolveTearSdl, type TearSdlDocumentV1 } from "../../src/tearbench/tearsdl";
import type { ProductionReplayWorld } from "../../src/app/world/detached/world-factory";
import type { TearSnapshotV1 } from "../../src/gameplay/snapshot/snapshot-contract";
import { createLiveParticlePresentationState } from "../../src/app/world/detached/particle-state";
import { legacyCosmeticEmissionSnapshot } from "../../src/domain/cosmetic-emission-random";
import { UPGRADES, applyUpgrade } from "../../src/gameplay/upgrades";

const timing: CampaignChapterTiming = Object.freeze({
  loreReveal: 0.1,
  chapterIn: 0.2,
  loreExit: 0.3,
  biomeRevealBrief: 0.4,
  biomeRevealFull: 0.5,
  readyBrief: 0.6,
  readyFull: 0.7,
  dialogueDuck: 0.8,
  biomeRevealDuck: 0.9,
});

function activeChapterCheckpoint(slowText = false, opening = false) {
  const composition = createProductionGhostReplayComposition({ seed: "runtime-atomic-chapter", mode: "campaign" });
  const source = composition.create(undefined);
  // This is a constructed chapter boundary; retire the now-real natural launch before installing it.
  source.replay.world.context.cinema.cancel("constructed chapter fixture");
  if (slowText) source.replay.configuration.value.presentation.revealCharsPerSec = 1;
  const spec = {
    ...createCampaignChapterBindingSpec({
      stageIndex: 0,
      priorOutro: null,
      brief: false,
      prologueShownBefore: false,
      timing: slowText ? { ...timing, biomeRevealFull: 60 } : timing,
    }),
    flowState: opening ? ("LORE_ENTER" as const) : slowText ? ("BIOME_REVEAL" as const) : ("LORE_READ" as const),
  };
  const chapter = stageCampaignChapterBinding(spec, stageAt(0), {
    dispatch: vi.fn(),
    preparedWave: () => true,
    activationDeferred: () => true,
    clear: vi.fn(),
  });
  Object.assign(source.replay.world.state.run() ?? {}, {
    _biomeIdx: 0,
    _prologueShown: true,
    chapterState: spec.flowState,
  });
  source.replay.world.lifecycle.restore({
    phase: "wave-prepared",
    sessionId: "runtime-atomic-chapter",
    wave: 1,
    bossWave: false,
    activationDeferred: true,
    reward: null,
    outcome: null,
    revision: 2,
  });
  source.replay.world.context.cinema.start(chapter.binding.script, chapter.binding.context);
  if (!opening) {
    expect(source.replay.world.context.cinema.skipTo(slowText ? "reveal" : "page-0")).toBe(true);
    source.replay.world.context.cinema.update(slowText ? 10 : 0.01);
  } else source.waveReward.reward.reset();
  const { snapshot, semanticHash } = captureProductionReplayCheckpoint(
    source.replay,
    source.combat,
    source.waveReward,
    "active-chapter-atomicity",
  );
  const world = snapshot.state["tear.world.v1"] as Readonly<Record<string, unknown>>;
  const runtime = {
    ...(world.runtime as Readonly<Record<string, unknown>>),
    chapterBinding: spec,
    cinema: snapshot.state["tear.cinematic.v1"],
  };
  return {
    composition,
    runtime,
    semanticHash,
    snapshot: { ...snapshot, state: { ...snapshot.state, "tear.world.v1": { ...world, runtime } } } as TearSnapshotV1,
  };
}

function unchangedDestination(replay: ProductionReplayWorld) {
  const references = () => [
    replay.world.state.run(),
    replay.world.state.player(),
    replay.world.state.blade(),
    replay.world.state.enemies(),
    replay.world.state.projectiles(),
    replay.world.state.floaters(),
    replay.world.state.slowZones(),
    replay.world.state.temporaryWalls(),
    replay.world.state.bossIntro(),
    replay.configuration.value,
    replay.configuration.value.presentation,
    replay.stage.platforms,
  ];
  const values = () => ({
    config: replay.configuration.snapshot(),
    rng: replay.world.context.services.random.snapshot(),
    cosmeticEntropy: replay.cosmeticEmissionRandom.snapshot(),
    lifecycle: replay.world.lifecycle.snapshot(),
    cinema: replay.world.context.cinema.captureState(),
    stage: replay.stage.index,
    platforms: replay.stage.platforms,
    environment: replay.world.context.environment.snapshot(),
    transient: Object.fromEntries(
      Object.entries(replay.world.context.transient).filter(([, value]) => typeof value !== "function"),
    ),
    actors: JSON.parse(
      JSON.stringify({
        run: replay.world.state.run(),
        player: replay.world.state.player(),
        blade: replay.world.state.blade(),
        enemies: replay.world.state.enemies(),
        projectiles: replay.world.state.projectiles(),
      }),
    ) as unknown,
    processConfiguration: CONFIG,
  });
  const beforeReferences = references(),
    beforeValues = structuredClone(values());
  return () => {
    references().forEach((value, index) => {
      expect(value).toBe(beforeReferences[index]);
    });
    expect(values()).toEqual(beforeValues);
  };
}

function withoutPresentation(snapshot: TearSnapshotV1): TearSnapshotV1 {
  const configuration = snapshot.state["tear.configuration.v1"] as { values: Readonly<Record<string, unknown>> };
  const values = { ...configuration.values };
  Reflect.deleteProperty(values, "presentation");
  return { ...snapshot, state: { ...snapshot.state, "tear.configuration.v1": { ...configuration, values } } };
}

function rewardDelayCheckpoint(completedSelection = false) {
  const source = createProductionGhostReplayComposition({ seed: "reward-clear-delay", mode: "endless" }).create(
    undefined,
  );
  source.waveReward.reward.reset();
  const run = source.replay.world.state.run();
  if (run === null) throw new Error("reward delay requires a run");
  if (completedSelection) {
    run.spawnQueue = [];
    source.replay.world.state.setEnemies([]);
    source.waveReward.update(1);
    source.waveReward.reward.selectDraft(0);
    expect(source.waveReward.reward.snapshot()?.phase).toBe("complete");
  }
  run.spawnQueue = [];
  source.replay.world.state.setEnemies([]);
  source.simulation.advanceOne([]);
  expect(source.replay.world.lifecycle.phase).toBe("reward-pending");
  expect(run.clearTimer).toBeGreaterThan(0);
  expect(source.waveReward.screen()).toBe("playing");
  return source;
}

describe("production replay composition", () => {
  it.each([
    { completed: false, paused: false },
    { completed: false, paused: true },
    { completed: true, paused: false },
    { completed: true, paused: true },
  ])(
    "continues the source-owned reward delay with retained selection $completed and pause $paused",
    ({ completed, paused }) => {
      // Construct the frontier through actual wave/selection owners, without a native-play claim.
      const source = rewardDelayCheckpoint(completed);
      if (paused) expect(source.waveReward.routeAction({ type: "pause" })).toBe(true);
      const saved = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "reward-delay");
      const restored = createProductionGhostReplayComposition({
        seed: saved.snapshot.seed,
        inputSnapshots: new Map([[saved.snapshot.tick, saved.input]]),
      }).create(saved.snapshot);
      expect(restored.semanticProjection()).toEqual(source.semanticProjection());
      expect(restored.waveReward.reward.snapshot()).toEqual(source.waveReward.reward.snapshot());
      expect(restored.waveReward.screen()).toBe(paused ? "paused" : "playing");
      if (paused) {
        expect(source.waveReward.routeAction({ type: "pause" })).toBe(true);
        expect(restored.waveReward.routeAction({ type: "pause" })).toBe(true);
      }
      let steps = 0;
      while (source.waveReward.screen() === "playing" && steps < 120) {
        expect(restored.simulation.advanceOne([]).state).toEqual(source.simulation.advanceOne([]).state);
        steps++;
      }
      expect(steps).toBeGreaterThan(1);
      expect(source.waveReward.screen()).toBe("draft");
      expect(restored.waveReward.screen()).toBe("draft");
      expect(restored.waveReward.reward.snapshot()).toEqual(source.waveReward.reward.snapshot());
      expect(restored.replay.world.context.services.random.snapshot()).toEqual(
        source.replay.world.context.services.random.snapshot(),
      );
    },
  );

  it.each([
    "zero",
    "negative",
    "nonfinite",
    "over-bound",
    "wrong-wave",
    "wrong-boss",
    "active-selection",
    "reward-screen",
    "active-lifecycle",
  ] as const)("refuses incoherent reward-delay %s before destination replacement", (field) => {
    const source = rewardDelayCheckpoint();
    const saved = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "invalid-delay");
    const invalid = structuredClone(saved.snapshot);
    const run = invalid.state["tear.run.v1"] as Record<string, unknown>;
    const runtime = (invalid.state["tear.world.v1"] as Record<string, unknown>).runtime as Record<string, unknown>;
    const lifecycle = runtime.lifecycle as Record<string, unknown>;
    if (field === "zero") run.clearTimer = 0;
    else if (field === "negative") run.clearTimer = -1;
    else if (field === "nonfinite") run.clearTimer = Infinity;
    else if (field === "over-bound") run.clearTimer = source.replay.configuration.value.run.waveClearPause + 1;
    else if (field === "wrong-wave") lifecycle.wave = Number(lifecycle.wave) + 1;
    else if (field === "wrong-boss") lifecycle.bossWave = true;
    else if (field === "active-selection") {
      const selection = (invalid.state["tear.reward.v1"] as Record<string, unknown>).selection as Record<
        string,
        unknown
      >;
      selection.phase = "draft";
    } else if (field === "reward-screen") (invalid.state["tear.ui.v1"] as Record<string, unknown>).screen = "draft";
    else {
      lifecycle.phase = "wave-active";
      lifecycle.reward = null;
      (invalid.state["tear.ui.v1"] as Record<string, unknown>).screen = "draft";
    }
    const destination = createProductionReplayWorld({ seed: "unchanged-delay-target" }),
      unchanged = unchangedDestination(destination);
    expect(() => restoreProductionReplaySnapshot(destination, invalid)).toThrow();
    unchanged();
  });

  it.each([0, 250])(
    "retains held aim magnitude %s through an input keyframe and its next command-free tick",
    (magnitude) => {
      const options = { seed: "held-aim-frontier", mode: "endless" };
      const source = createProductionGhostReplayComposition(options).create(undefined);
      source.simulation.advanceOne([
        { kind: "command", id: 1, tick: 1, command: { type: "aim", turn: 125000, magnitude } },
      ]);
      const saved = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "held-aim");
      const restored = createProductionGhostReplayComposition({
        ...options,
        inputSnapshots: new Map([[saved.snapshot.tick, saved.input]]),
      }).create(saved.snapshot);
      expect(restored.combat.authoritativeInput.aimVector()).toEqual(source.combat.authoritativeInput.aimVector());
      expect(restored.simulation.advanceOne([]).state).toEqual(source.simulation.advanceOne([]).state);
      expect((restored.replay.world.state.blade() as never as { aimOverride: unknown }).aimOverride).toEqual(
        (source.replay.world.state.blade() as never as { aimOverride: unknown }).aimOverride,
      );
    },
  );
  it.each(["reservePick", "expandedDraft", "reservedChoice", "unowned-tier"] as const)(
    "refuses reward/run coherence drift %s before replacement",
    (field) => {
      const source = createProductionGhostReplayComposition({
        seed: `reward-incoherent-${field}`,
        mode: "endless",
      }).create(undefined);
      Object.assign(source.replay.world.state.run() ?? {}, { spawnQueue: [] });
      source.replay.world.state.setEnemies([]);
      source.waveReward.update(1);
      const { snapshot } = captureProductionReplayCheckpoint(
        source.replay,
        source.combat,
        source.waveReward,
        `incoherent-${field.toLowerCase()}`,
      );
      const invalid = structuredClone(snapshot),
        selection = (invalid.state["tear.reward.v1"] as Record<string, unknown>).selection as Record<string, unknown>;
      if (field === "unowned-tier") {
        selection.phase = "tierup";
        selection.choices = [{ id: "fleet" }];
        (invalid.state["tear.ui.v1"] as Record<string, unknown>).screen = "tierup";
        const runtime = (invalid.state["tear.world.v1"] as Record<string, unknown>).runtime as Record<string, unknown>;
        runtime.lifecycle = { ...(runtime.lifecycle as Record<string, unknown>), reward: "boss", bossWave: true };
      } else if (field === "reservedChoice") selection.reservedChoice = { id: "fleet" };
      else selection[field] = true;
      const target = createProductionReplayWorld({ seed: "unmodified-reward-target" }),
        unchanged = unchangedDestination(target);
      expect(() => restoreProductionReplaySnapshot(target, invalid)).toThrow(/reward|choices/);
      unchanged();
    },
  );
  it.each(["draft", "reserve", "tierup"] as const)(
    "continues a constructed %s boundary through the real reward owner without hydration effects",
    (phase) => {
      const composition = createProductionGhostReplayComposition({ seed: `reward-boundary-${phase}`, mode: "endless" });
      const source = composition.create(undefined),
        independent = composition.create(undefined);
      const run = source.replay.world.state.run() as never as {
        spawnQueue: unknown[];
        wave: number;
        mods: { reservePick: boolean; draftRerolls: number };
      };
      run.mods.reservePick = true;
      run.mods.draftRerolls = 2;
      run.spawnQueue = [];
      source.replay.world.state.setEnemies([]);
      source.waveReward.update(1);
      const fleet = UPGRADES.find((choice) => choice.id === "fleet"),
        vitality = UPGRADES.find((choice) => choice.id === "vitality");
      if (fleet === undefined || vitality === undefined) throw new Error("production choices missing");
      const draft = source.waveReward.reward.snapshot();
      if (draft === null) throw new Error("fixture draft missing");
      source.waveReward.reward.restore({ ...draft, choices: [fleet, vitality] });
      if (phase === "reserve") source.waveReward.reward.selectDraft(0);
      if (phase === "tierup") {
        const tier = UPGRADES.find((choice) => choice.tiers !== undefined);
        if (tier === undefined) throw new Error("tier missing");
        applyUpgrade(tier, {
          config: source.replay.configuration.value,
          player: source.replay.world.state.player() as never,
          blade: source.replay.world.state.blade() as never,
          mods: source.replay.world.state.run()?.mods as never,
        });
        source.replay.world.lifecycle.restore({
          ...source.replay.world.lifecycle.snapshot(),
          reward: "boss",
          bossWave: true,
        });
        source.waveReward.reward.openTier([tier]);
      }
      source.waveReward.restoreUi(phase, 1);
      const before = captureProductionReplayCheckpoint(
        source.replay,
        source.combat,
        source.waveReward,
        `reward-${phase}`,
      );
      const restored = composition.create(JSON.parse(JSON.stringify(before.snapshot)) as TearSnapshotV1);
      expect(restored.waveReward.outward).toEqual([]);
      expect(restored.waveReward.reward.snapshot()).toEqual(source.waveReward.reward.snapshot());
      expect(restored.waveReward.focus()).toBe(1);
      expect(restored.replay.configuration.snapshot()).toEqual(source.replay.configuration.snapshot());
      expect(restored.replay.world.context.services.random.snapshot()).toEqual(
        source.replay.world.context.services.random.snapshot(),
      );
      const sourceConfig = source.replay.configuration.value,
        restoredConfig = restored.replay.configuration.value;
      expect(restoredConfig).not.toBe(sourceConfig);
      const independentConfig = independent.replay.configuration.snapshot();
      if (phase === "draft") {
        source.waveReward.reward.reroll();
        restored.waveReward.reward.reroll();
        expect(restored.waveReward.focus()).toBe(-1);
        expect(restored.waveReward.reward.snapshot()).toEqual(source.waveReward.reward.snapshot());
      }
      const select = (runtime: typeof source.waveReward) => {
        if (phase === "reserve") runtime.reward.selectReserve(0);
        else if (phase === "tierup") runtime.reward.selectTier(0);
        else runtime.reward.selectDraft(0);
      };
      select(source.waveReward);
      select(restored.waveReward);
      expect(restored.waveReward.reward.snapshot()).toEqual(source.waveReward.reward.snapshot());
      expect(restored.replay.configuration.value).toBe(restoredConfig);
      expect(restored.replay.configuration.snapshot()).toEqual(source.replay.configuration.snapshot());
      expect(restored.replay.world.context.services.random.snapshot()).toEqual(
        source.replay.world.context.services.random.snapshot(),
      );
      expect(restored.replay.world.lifecycle.snapshot()).toEqual(source.replay.world.lifecycle.snapshot());
      expect(independent.replay.configuration.snapshot()).toEqual(independentConfig);
      for (let tick = 1; tick <= 10; tick += 1)
        expect(restored.simulation.advanceOne([]).state).toEqual(source.simulation.advanceOne([]).state);
    },
  );
  it("launches the natural chapter and advances only explicit application frames and confirm inputs", () => {
    const composition = createProductionGhostReplayComposition({ seed: "natural-explicit-chapter", mode: "campaign" });
    const source = composition.create(undefined);
    const cinema = source.replay.world.context.cinema;
    expect(source.replay.world.lifecycle.snapshot()).toMatchObject({
      phase: "wave-prepared",
      activationDeferred: true,
    });
    expect(cinema.captureState()).toMatchObject({ active: true, beatId: "enter", elapsedSeconds: 0 });
    source.simulation.advanceOne([]);
    expect(cinema.captureState()).toMatchObject({ beatId: "enter", elapsedSeconds: 0 });
    source.advanceApplicationFrame(1 / 120);
    const saved = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "explicit-frame");
    const restored = composition.create(JSON.parse(JSON.stringify(saved.snapshot)) as TearSnapshotV1);
    expect(restored.replay.world.context.cinema.captureState()).toEqual(cinema.captureState());
    // A page holds for its reading dwell (several seconds for the prologue) before it may play on.
    for (let frame = 0; frame < 30; frame += 1) {
      source.advanceApplicationFrame(0.1);
      restored.advanceApplicationFrame(0.1);
    }
    expect(cinema.captureState()).toMatchObject({ beatId: "page-0" });
    expect(source.replay.world.lifecycle.phase).toBe("wave-prepared");
    expect(restored.replay.world.context.cinema.captureState()).toEqual(cinema.captureState());
    // Explicit test policy: release for latch arming, then one confirm. Never auto-confirm in the host.
    for (let frame = 0; frame < 1000 && cinema.active; frame += 1) {
      const controls = { key: frame % 20 === 19 };
      source.advanceApplicationFrame(0.1, controls);
      restored.advanceApplicationFrame(0.1, controls);
      expect(restored.replay.world.context.cinema.captureState()).toEqual(cinema.captureState());
    }
    expect(cinema.active).toBe(false);
    expect(source.replay.world.lifecycle.snapshot()).toMatchObject({ phase: "wave-active", revision: 3 });
    expect(restored.replay.world.lifecycle.snapshot()).toEqual(source.replay.world.lifecycle.snapshot());
    const activation = {
      spawnTimer: source.replay.configuration.value.run.startDelay,
      waveTime: 0,
      waveKills: 0,
      wavePeak: (source.replay.world.state.run() as never as { mult: number }).mult,
    };
    expect(source.replay.world.state.run()).toMatchObject(activation);
    expect(restored.replay.world.state.run()).toMatchObject(activation);
    expect(source.waveReward.outward).toEqual(expect.arrayContaining(["showWaveBanner", "playWaveSound"]));
    expect(restored.waveReward.outward).toEqual(expect.arrayContaining(["showWaveBanner", "playWaveSound"]));
    expect(source.simulation.scheduler.tick).toBe(1);
    expect(() => {
      source.advanceApplicationFrame(Number.NaN);
    }).toThrow(/frame/);
    expect(() => {
      source.advanceApplicationFrame(0.101);
    }).toThrow(/frame/);
    source.waveReward.routeAction({ type: "pause" });
    const stopped = cinema.captureState();
    source.advanceApplicationFrame(0.1, { key: true });
    expect(cinema.captureState()).toEqual(stopped);
  });
  it("derives legacy v1 entropy only from staged run/tick and never claims old exact protocol identity", () => {
    const composition = createProductionGhostReplayComposition({ seed: "legacy-emission-custody" }),
      source = composition.create(undefined);
    source.replay.effects.spark(800, 775, 1, 0);
    const checkpoint = captureProductionReplayCheckpoint(
      source.replay,
      source.combat,
      source.waveReward,
      "legacy-emission",
    );
    const legacy = structuredClone(checkpoint.snapshot),
      payload = (legacy.state["tear.ui.v1"] as Record<string, unknown>).particlesPresentation as Record<
        string,
        unknown
      >;
    payload.version = 1;
    delete payload.entropy;
    const first = createProductionReplayWorld({ seed: "temporary-one" }),
      second = createProductionReplayWorld({ seed: "temporary-two" });
    first.cosmeticEmissionRandom.next();
    second.effects.explode(20, 30);
    restoreProductionReplaySnapshot(first, legacy);
    restoreProductionReplaySnapshot(second, legacy);
    expect(first.cosmeticEmissionRandom.snapshot()).toEqual(
      legacyCosmeticEmissionSnapshot(source.replay.world.state.run()?.runSeed ?? -1, legacy.tick),
    );
    expect(second.cosmeticEmissionRandom.snapshot()).toEqual(first.cosmeticEmissionRandom.snapshot());
    expect(first.effects.list).toEqual(second.effects.list);
    expect(first.cosmeticEmissionRandom.snapshot().provenance).toBe("legacy-derived");
    const current = createLiveParticlePresentationState(
      first.effects,
      () => ({ effects: first.configuration.value.effects, lowGraphics: false, reducedMotion: false }),
      first.cosmeticEmissionRandom,
    ).capture();
    expect(current.version).toBe(2);
    expect(current).not.toEqual(payload);
  });
  it("captures, stages and recaptures actual particles using candidate tuning without changing replay semantics", () => {
    const composition = createProductionGhostReplayComposition({ seed: "particle-presentation-portability" });
    const source = composition.create(undefined),
      fx = source.replay.effects;
    source.replay.configuration.value.effects.highBudget = 4;
    source.replay.configuration.value.effects.lowBudget = 1;
    fx.spark(800, 775, 1, -1);
    fx.drip(800, 775);
    fx.setViewRect({ left: 0, top: 0, right: 1200, bottom: 900 });
    const checkpoint = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "particles");
    const saved = (checkpoint.snapshot.state["tear.ui.v1"] as Record<string, unknown>).particlesPresentation;
    const target = createProductionReplayWorld({ seed: "different-particle-target" });
    target.configuration.value.effects.highBudget = 9;
    target.configuration.value.effects.cullMargin = 7;
    const list = target.effects.list;
    restoreProductionReplaySnapshot(target, checkpoint.snapshot);
    expect(
      createLiveParticlePresentationState(
        target.effects,
        () => ({ effects: target.configuration.value.effects, lowGraphics: false, reducedMotion: false }),
        target.cosmeticEmissionRandom,
      ).capture(),
    ).toEqual(saved);
    expect(target.effects.list).toBe(list);
    const restored = composition.create(checkpoint.snapshot);
    const recaptured = captureProductionReplayCheckpoint(
      restored.replay,
      restored.combat,
      restored.waveReward,
      "particles-roundtrip",
    );
    expect((recaptured.snapshot.state["tear.ui.v1"] as Record<string, unknown>).particlesPresentation).toEqual(saved);
    expect(recaptured.semanticHash).toBe(checkpoint.semanticHash);
    for (const kind of ["malformed", "binding"] as const) {
      const invalid = structuredClone(checkpoint.snapshot);
      const payload = (invalid.state["tear.ui.v1"] as Record<string, unknown>).particlesPresentation as {
        replacementCursor: number;
        policy: { effects: { cullMargin: number } };
      };
      if (kind === "malformed") payload.replacementCursor = -1;
      else payload.policy.effects.cullMargin += 1;
      const unchanged = unchangedDestination(target),
        particles = structuredClone(target.effects.list),
        view = target.effects.view;
      expect(() => restoreProductionReplaySnapshot(target, invalid)).toThrow(/particle/);
      unchanged();
      expect(target.effects.list).toEqual(particles);
      expect(target.effects.view).toBe(view);
    }
    const legacy = structuredClone(checkpoint.snapshot);
    delete (legacy.state["tear.ui.v1"] as Record<string, unknown>).particlesPresentation;
    restoreProductionReplaySnapshot(target, legacy);
    expect(target.effects.list).toEqual([]);
    expect(target.effects.view).toBeNull();
    expect(target.effects._replacementCursor).toBe(0);
  });
  it("accepts a portable live HUD checkpoint without changing replay semantics", () => {
    const composition = createProductionGhostReplayComposition({ seed: "presentation-portability" });
    const source = composition.create(undefined);
    const checkpoint = captureProductionReplayCheckpoint(
      source.replay,
      source.combat,
      source.waveReward,
      "presentation",
    );
    const snapshot = JSON.parse(JSON.stringify(checkpoint.snapshot)) as TearSnapshotV1;
    const ui = snapshot.state["tear.ui.v1"] as Record<string, unknown>;
    ui.hudPresentation = { version: 1, clockSeconds: 7.25, lagHp: 0.8, multiplier: 2, multiplierPop: 0.5 };
    const restored = composition.create(snapshot);
    expect(stableVerificationHash(restored.semanticProjection())).toBe(checkpoint.semanticHash);
    expect(ui.hudPresentation).toEqual({
      version: 1,
      clockSeconds: 7.25,
      lagHp: 0.8,
      multiplier: 2,
      multiplierPop: 0.5,
    });
  });

  it("restores exact checkpoint seconds without inferring historical time", () => {
    const composition = createProductionGhostReplayComposition({ seed: "checkpoint-clock" });
    const source = composition.create(undefined);
    source.replay.world.context.services.clock.set(0.173456789);
    const checkpoint = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "clock");
    expect((checkpoint.snapshot.state["tear.world.v1"] as Record<string, unknown>).simulationSeconds).toBe(0.173456789);
    const target = createProductionReplayWorld({ seed: "checkpoint-clock-target" });
    restoreProductionReplaySnapshot(target, checkpoint.snapshot);
    expect(target.world.context.services.clock.seconds()).toBe(0.173456789);
    const legacy = structuredClone(checkpoint.snapshot);
    delete (legacy.state["tear.world.v1"] as Record<string, unknown>).simulationSeconds;
    target.world.context.services.clock.set(0.75);
    restoreProductionReplaySnapshot(target, legacy);
    expect(target.world.context.services.clock.seconds()).toBe(0.75);
  });

  it.each([-1, "12", null])("rejects invalid checkpoint seconds %s before clock or world mutation", (seconds) => {
    const source = createProductionGhostReplayComposition({ seed: "invalid-clock" }).create(undefined);
    const { snapshot } = captureProductionReplayCheckpoint(
      source.replay,
      source.combat,
      source.waveReward,
      "invalid-clock",
    );
    const invalid = structuredClone(snapshot);
    (invalid.state["tear.world.v1"] as Record<string, unknown>).simulationSeconds = seconds;
    const target = createProductionReplayWorld({ seed: "invalid-clock-target" });
    target.world.context.services.clock.set(0.75);
    const unchanged = unchangedDestination(target);
    expect(() => restoreProductionReplaySnapshot(target, invalid)).toThrow(/simulationSeconds/);
    unchanged();
    expect(target.world.context.services.clock.seconds()).toBe(0.75);
  });
  it("retains raw Campaign opening UI without treating raw restoration as completed-start permission", () => {
    const fixture = activeChapterCheckpoint(false, true);
    const snapshot: TearSnapshotV1 = {
      ...fixture.snapshot,
      state: { ...fixture.snapshot.state, "tear.ui.v1": { screen: "menu", focusId: "0" } },
    };
    const before = structuredClone(snapshot);
    const restored = fixture.composition.create(snapshot);
    expect(restored.waveReward.screen()).toBe("menu");
    expect(() => {
      restored.completeRecordedOpening();
    }).toThrow(/capsule linkage permit/);
    const recaptured = captureProductionReplayCheckpoint(
      restored.replay,
      restored.combat,
      restored.waveReward,
      "raw-opening-recapture",
    );
    expect(recaptured.snapshot.state["tear.ui.v1"]).toMatchObject({ screen: "menu", focusId: "0" });
    expect(restored.replay.world.context.cinema.captureState()).toEqual(snapshot.state["tear.cinematic.v1"]);
    expect(stableVerificationHash(restored.semanticProjection())).toBe(fixture.semanticHash);
    expect(snapshot).toEqual(before);
  });

  it.each(["nonzero tick", "inactive chapter", "malformed chapter"])(
    "rejects a menu anchor with %s before replacement",
    (kind) => {
      const fixture = activeChapterCheckpoint(false, true);
      const world = fixture.snapshot.state["tear.world.v1"] as Readonly<Record<string, unknown>>;
      const run = fixture.snapshot.state["tear.run.v1"] as Readonly<Record<string, unknown>>;
      const snapshot = {
        ...fixture.snapshot,
        tick: kind === "nonzero tick" ? 1 : 0,
        state: {
          ...fixture.snapshot.state,
          "tear.ui.v1": { screen: "menu", focusId: "0" },
          "tear.run.v1": kind === "nonzero tick" ? { ...run, tick: 1 } : run,
          "tear.world.v1": {
            ...world,
            ...(kind === "nonzero tick" ? { clock: 1 } : {}),
            runtime: {
              ...fixture.runtime,
              ...(kind === "inactive chapter" ? { chapterBinding: null } : {}),
              ...(kind === "malformed chapter" ? { chapterBinding: {} } : {}),
            },
          },
          ...(kind === "inactive chapter" ? { "tear.cinematic.v1": INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } : {}),
        },
      };
      const target = createProductionReplayWorld({ seed: "menu-rejection" });
      const assertUnchanged = unchangedDestination(target);
      expect(() => restoreProductionReplaySnapshot(target, snapshot)).toThrow(/UI screen is invalid|chapter binding/);
      assertUnchanged();
    },
  );

  const rejectedRuntimeCases = [
    {
      name: "malformed chapter",
      patch: (runtime: Readonly<Record<string, unknown>>) => ({ ...runtime, chapterBinding: {} }),
      cinema: undefined,
      error: /chapter binding/,
    },
    {
      name: "invalid lifecycle phase",
      patch: (runtime: Readonly<Record<string, unknown>>) => ({
        ...runtime,
        lifecycle: { ...(runtime.lifecycle as object), phase: "invalid-phase" },
      }),
      cinema: undefined,
      error: /lifecycle phase/,
    },
    {
      name: "unsupported cinematic revision",
      patch: (runtime: Readonly<Record<string, unknown>>) => runtime,
      cinema: { scriptRevision: "unsupported-revision" },
      error: /bound cinematic script/,
    },
    {
      name: "chapter with active-wave lifecycle",
      patch: (runtime: Readonly<Record<string, unknown>>) => ({
        ...runtime,
        lifecycle: { ...(runtime.lifecycle as object), phase: "wave-active", activationDeferred: false },
      }),
      cinema: undefined,
      error: /prepared-wave lifecycle/,
    },
  ];

  it.each(rejectedRuntimeCases)("rejects $name before replacing any destination owner", ({ patch, cinema, error }) => {
    const fixture = activeChapterCheckpoint();
    const world = fixture.snapshot.state["tear.world.v1"] as Readonly<Record<string, unknown>>;
    const snapshot = {
      ...fixture.snapshot,
      state: {
        ...fixture.snapshot.state,
        "tear.world.v1": { ...world, runtime: patch(fixture.runtime) },
        ...(cinema === undefined
          ? {}
          : {
              "tear.cinematic.v1": {
                ...(fixture.snapshot.state["tear.cinematic.v1"] as object),
                ...cinema,
              },
            }),
      },
    };
    const target = createProductionReplayWorld({
      seed: "atomicity-target",
      mode: "endless",
      enemies: [{ id: "reflection", x: 600, y: 500 }],
    });
    target.configuration.value.presentation.revealCharsPerSec = 100_000;
    target.world.context.transient.feel.flash = 0.4;
    const assertUnchanged = unchangedDestination(target);
    expect(() => restoreProductionReplaySnapshot(target, snapshot)).toThrow(error);
    assertUnchanged();
  });

  it.each(rejectedRuntimeCases)(
    "direct chapter restore rejects $name before lifecycle mutation",
    ({ patch, cinema, error }) => {
      const fixture = activeChapterCheckpoint();
      const target = createProductionReplayWorld({ seed: "direct-atomicity-target", mode: "campaign" });
      const assertUnchanged = unchangedDestination(target);
      const runtime = {
        ...patch(fixture.runtime),
        ...(cinema === undefined
          ? {}
          : {
              cinema: { ...(fixture.runtime.cinema as object), ...cinema },
            }),
      };
      expect(() => {
        restoreProductionReplayChapterBinding(target, runtime);
      }).toThrow(error);
      assertUnchanged();
    },
  );

  it("restores and recaptures a valid active chapter using candidate configuration, then activates its prepared wave", () => {
    const fixture = activeChapterCheckpoint();
    const restored = fixture.composition.create(fixture.snapshot);
    expect(restored.replay.world.context.cinema.captureState()).toEqual(fixture.snapshot.state["tear.cinematic.v1"]);
    const checkpoint = captureProductionReplayCheckpoint(
      restored.replay,
      restored.combat,
      restored.waveReward,
      "chapter-roundtrip",
    );
    expect(
      (checkpoint.snapshot.state["tear.world.v1"] as { runtime: { chapterBinding: unknown } }).runtime.chapterBinding,
    ).toEqual(fixture.runtime.chapterBinding);
    const second = fixture.composition.create(checkpoint.snapshot);
    second.replay.world.context.cinema.complete();
    expect(second.replay.world.state.run()).toMatchObject({ chapterState: "WAVE_LIVE" });
    expect(second.replay.world.lifecycle.snapshot()).toMatchObject({ phase: "wave-active", activationDeferred: false });
  });

  it("validates active cinematic reveal timing against candidate configuration", () => {
    const fixture = activeChapterCheckpoint(true);
    expect(
      (fixture.snapshot.state["tear.configuration.v1"] as { values: { presentation: unknown } }).values.presentation,
    ).toMatchObject({ revealCharsPerSec: 1 });
    expect(fixture.snapshot.state["tear.blade.v1"]).not.toHaveProperty("presentation");
    expect(fixture.snapshot.state["tear.player.v1"]).not.toHaveProperty("presentation");
    const restored = fixture.composition.create(fixture.snapshot);
    expect(restored.replay.world.context.cinema.captureState()).toEqual(fixture.snapshot.state["tear.cinematic.v1"]);
    expect(restored.replay.configuration.value.presentation.revealCharsPerSec).toBe(1);
    const recaptured = captureProductionReplayCheckpoint(
      restored.replay,
      restored.combat,
      restored.waveReward,
      "slow-chapter-roundtrip",
    );
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
    expect(() => restoreProductionReplaySnapshot(target, withoutPresentation(fixture.snapshot))).toThrow(
      /reveal visibility is inconsistent/,
    );
    assertUnchanged();
  });

  it("restores legacy omitted-presentation payloads using the authoritative base rather than current target tuning", () => {
    const fixture = activeChapterCheckpoint();
    const target = createProductionReplayWorld({ seed: "legacy-default-target" });
    target.configuration.value.presentation.revealCharsPerSec = 1;
    const stableConfiguration = target.configuration.value,
      stablePresentation = stableConfiguration.presentation;
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
    const snapshot = {
      ...fixture.snapshot,
      state: {
        ...fixture.snapshot.state,
        "tear.world.v1": { ...world, runtime: { ...fixture.runtime, wasSwinging: "true" } },
      },
    };
    const target = createProductionReplayWorld({ seed: "transient-atomicity-target" });
    const assertUnchanged = unchangedDestination(target);
    expect(() => restoreProductionReplaySnapshot(target, snapshot)).toThrow(/wasSwinging must be boolean/);
    assertUnchanged();
  });

  it("preserves an existing same-world non-chapter cinematic owner in the direct helper", () => {
    const target = createProductionReplayWorld({ seed: "same-world-cinema" });
    const onStart = vi.fn(),
      onEnter = vi.fn(),
      onComplete = vi.fn();
    const script = {
      id: "same-world",
      revision: "1",
      beats: [{ id: "held", duration: 3, onEnter }],
      onStart,
      onComplete,
    };
    const context = { player: target.world.state.player() };
    target.world.context.cinema.start(script, context);
    const saved = target.world.context.cinema.captureState();
    target.world.context.cinema.update(0.1);
    restoreProductionReplayChapterBinding(target, {
      chapterBinding: null,
      lifecycle: target.world.lifecycle.snapshot(),
      cinema: saved,
    });
    expect(target.world.context.cinema.captureState()).toEqual(saved);
    expect(target.world.context.cinema.script).toBe(script);
    expect(target.world.context.cinema.context).toBe(context);
    expect(context.player).toBe(target.world.state.player());
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledTimes(1);
    target.world.context.cinema.complete();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does not carry an outgoing non-chapter callback context into a replaced world", () => {
    const composition = createProductionGhostReplayComposition({ seed: "non-chapter-replacement" });
    const source = composition.create(undefined),
      target = createProductionReplayWorld({ seed: "outgoing-cinema" });
    const script = { id: "same-script-different-world", revision: "1", beats: [{ id: "held", duration: 3 }] };
    source.replay.world.context.cinema.start(script, { player: source.replay.world.state.player() });
    target.world.context.cinema.start(script, { player: target.world.state.player() });
    const { snapshot } = captureProductionReplayCheckpoint(
      source.replay,
      source.combat,
      source.waveReward,
      "opaque-cinema",
    );
    const assertUnchanged = unchangedDestination(target);
    expect(() => restoreProductionReplaySnapshot(target, snapshot)).toThrow(/bound cinematic script/);
    assertUnchanged();
  });

  it("continues a restored boss intro on simulation ticks and resumes real boss AI", () => {
    const composition = createProductionGhostReplayComposition({ seed: "replay-boss-intro", mode: "bossonly" });
    const source = composition.create(undefined);
    const boss = source.replay.world.entities.createEnemy(
      "rootbound",
      800,
      520,
      source.replay.world.state.run() as never,
    );
    boss.introT = 1.4;
    source.replay.world.state.setEnemies([boss]);
    source.replay.world.state.setBossIntro({ boss, delay: 0.15, t: 0, dur: 1.4 });
    const { snapshot } = captureProductionReplayCheckpoint(
      source.replay,
      source.combat,
      source.waveReward,
      "active-intro",
    );
    const target = createProductionReplayWorld({ seed: "replay-boss-intro-target", mode: "bossonly" });
    restoreProductionReplaySnapshot(target, snapshot);
    expect(target.world.state.bossIntro()?.boss).toBe(target.world.state.enemies()[0]);
    expect(target.world.state.bossIntro()?.boss).not.toBe(boss);
    expect(target.world.state.bossIntro()).toMatchObject({ delay: 0.15, t: 0, dur: 1.4 });
    const restored = composition.create(snapshot);
    const restoredBoss = restored.replay.world.state.enemies()[0] as (typeof boss & { state: string }) | undefined;
    if (restoredBoss === undefined) throw new Error("restored boss missing");
    expect(restored.replay.world.state.bossIntro()?.boss).toBe(restoredBoss);
    // An application frame plays the arrival at its time scale but does not advance it; the simulation
    // tick does (the intro-clock slice of plans/active/CINEMATICS_OVERHAUL.md).
    restored.advanceApplicationFrame(0.1);
    expect(restored.replay.world.state.bossIntro()).toMatchObject({ delay: 0.15, t: 0 });
    expect(() => {
      restored.advanceApplicationFrame(0.101);
    }).toThrow(/bounded finite seconds/);
    // 0.15 s of delay at full speed is 18 ticks; then the 1.4 s arrival at time scale 0.25 is 42 ticks.
    let ticks = 0;
    while (ticks < 18) {
      restored.simulation.advanceOne([]);
      ticks += 1;
      expect(restoredBoss.introT).toBe(1.4);
      expect(restoredBoss.state).toBe("intro");
    }
    expect(restored.replay.world.state.bossIntro()).toMatchObject({ delay: 0, t: 0 });
    while (ticks < 200 && restored.replay.world.state.bossIntro() !== null) {
      restored.simulation.advanceOne([]);
      ticks += 1;
    }
    expect(ticks).toBe(18 + 42);
    expect(restoredBoss.introT).toBe(0);
    for (let index = 0; index < 120 && restoredBoss.state === "intro"; index += 1) restored.simulation.advanceOne([]);
    expect(restoredBoss.state).not.toBe("intro");
    expect(restoredBoss.dead).toBe(false);
    for (const disposition of ["dead", "dying"] as const) {
      const cancelled = composition.create(snapshot),
        actor = cancelled.replay.world.state.enemies()[0];
      if (actor === undefined) throw new Error("cancelled boss missing");
      actor[disposition] = true;
      cancelled.simulation.advanceOne([]);
      expect(cancelled.replay.world.state.bossIntro()).toBeNull();
      expect(actor.introT).toBe(0);
    }

    const world = snapshot.state["tear.world.v1"] as Readonly<Record<string, unknown>>;
    const runtime = world.runtime as Readonly<Record<string, unknown>>;
    const legacyRuntime = Object.fromEntries(
      Object.entries(runtime).filter(([key]) => key !== "bossIntro" && key !== "bossIntroVersion"),
    );
    const legacy = { ...snapshot, state: { ...snapshot.state, "tear.world.v1": { ...world, runtime: legacyRuntime } } };
    const priorBoss = target.world.state.enemies()[0];
    const priorIntro = target.world.state.bossIntro();
    expect(() => restoreProductionReplaySnapshot(target, legacy)).toThrow(/missing its intro binding/);
    expect(target.world.state.enemies()[0]).toBe(priorBoss);
    expect(target.world.state.bossIntro()).toBe(priorIntro);

    source.replay.world.state.setBossIntro(null);
    boss.introT = 0;
    const completed = captureProductionReplayCheckpoint(
      source.replay,
      source.combat,
      source.waveReward,
      "completed-intro",
    );
    restoreProductionReplaySnapshot(target, completed.snapshot);
    expect(target.world.state.bossIntro()).toBeNull();
    expect(() => composition.create(completed.snapshot)).not.toThrow();
  });

  it("captures and restores active Rootbound Regrowth and Last Spring state through the shared transaction", () => {
    const composition = createProductionGhostReplayComposition({
      seed: "rootbound-phase-three-transaction",
      mode: "bossonly",
    });
    const source = composition.create(undefined);
    const boss = source.replay.world.entities.createEnemy(
      "rootbound",
      800,
      520,
      source.replay.world.state.run() as never,
    ) as never as {
      phaseMarker: number;
      hp: number;
      maxHp: number;
      cinematicRequest: unknown;
      cinematicT: number;
      state: string;
      stateT: number;
      regrowthState: Readonly<{
        phase: string;
        startTick: number | null;
        requiredConnectionIds: readonly string[];
        progress: number;
      }>;
      regrowthCalled: boolean;
      lastSpringUseCount: number;
      moveState: BossAttackRunnerState;
      beginRegrowth(tick: number, connectionIds: readonly string[]): boolean;
      advanceRegrowth(tick: number, connectionIds: ReadonlySet<string>, broken?: boolean): unknown;
    };
    boss.phaseMarker = 3;
    boss.hp = boss.maxHp * 0.2;
    boss.cinematicRequest = null;
    boss.cinematicT = 0;
    boss.state = "idle";
    boss.stateT = 0;
    boss.regrowthCalled = true;
    source.replay.world.state.setEnemies([boss] as never);
    const links = createRootboundRegrowthConnections({
      ownerId: "enemy:1",
      ownerPosition: { x: 800, y: 520 },
      startTick: 40,
      rootNodes: [
        { id: "left-remnant", x: 280, y: 800 },
        { id: "heart-root", x: 800, y: 800 },
        { id: "right-remnant", x: 1_320, y: 800 },
      ],
    });
    expect(
      boss.beginRegrowth(
        40,
        links.combatObjects.map(({ id }) => id),
      ),
    ).toBe(true);
    links.combatObjects.forEach((entry) => source.replay.world.context.environment.addCombatObject(entry));
    links.routes.forEach((entry) => source.replay.world.context.environment.addRoute(entry));

    const active = captureProductionReplayCheckpoint(
      source.replay,
      source.combat,
      source.waveReward,
      "rootbound-regrowth-active",
    );
    const restoredActive = composition.create(active.snapshot);
    const activeBoss = restoredActive.replay.world.state.enemies()[0] as never as typeof boss;
    expect(activeBoss.regrowthState).toMatchObject({ phase: "channeling", startTick: 40, progress: 0 });
    expect(activeBoss.regrowthState.requiredConnectionIds).toEqual(links.combatObjects.map(({ id }) => id));
    const restoredEnvironment = restoredActive.replay.world.context.environment.snapshot();
    expect(restoredEnvironment.combatObjects.map(({ id, state }) => ({ id, state }))).toEqual(
      links.combatObjects.map(({ id }) => ({ id, state: "active" })),
    );
    expect(restoredEnvironment.routes.map(({ id, state }) => ({ id, state }))).toEqual(
      links.routes.map(({ id }) => ({ id, state: "active" })),
    );
    const activeRoundTrip = captureProductionReplayCheckpoint(
      restoredActive.replay,
      restoredActive.combat,
      restoredActive.waveReward,
      "rootbound-regrowth-round-trip",
    );
    expect(stableVerificationHash(activeRoundTrip.snapshot.state["tear.boss.v1"])).toBe(
      stableVerificationHash(active.snapshot.state["tear.boss.v1"]),
    );
    expect(activeRoundTrip.snapshot.hashes).toMatchObject({
      semantic: active.snapshot.hashes.semantic,
      environment: active.snapshot.hashes.environment,
    });

    boss.advanceRegrowth(40 + ROOTBOUND_REGROWTH_TIMING.channelTicks, new Set(), false);
    // Last Spring half-way through its tell, as the move table holds it.
    const run = Object.freeze({
      attackId: "last-spring",
      stage: "tell" as const,
      stageTick: 10,
      facing: 1 as const,
      origin: Object.freeze({ x: 800, y: 520 }),
      target: Object.freeze({ x: 500, y: 800 }),
      landed: false,
      parried: false,
    });
    // Regrowth opened Phase III and Last Spring followed it: the schedule must survive the round trip.
    boss.moveState = Object.freeze({
      ...createBossAttackRunnerState(0),
      run,
      openedPhase: 3,
      begun: 2,
      begunAt: Object.freeze({ regrowth: 0, "last-spring": 1 }),
    });
    boss.lastSpringUseCount = 1;
    const spring = captureProductionReplayCheckpoint(
      source.replay,
      source.combat,
      source.waveReward,
      "rootbound-last-spring-active",
    );
    const restoredSpring = composition.create(spring.snapshot);
    const springBoss = restoredSpring.replay.world.state.enemies()[0] as never as typeof boss;
    expect(springBoss).toMatchObject({
      lastSpringUseCount: 1,
      regrowthCalled: true,
      moveState: { run, openedPhase: 3, begun: 2, begunAt: { regrowth: 0, "last-spring": 1 } },
    });
    const springRoundTrip = captureProductionReplayCheckpoint(
      restoredSpring.replay,
      restoredSpring.combat,
      restoredSpring.waveReward,
      "rootbound-last-spring-round-trip",
    );
    expect(stableVerificationHash(springRoundTrip.snapshot.state["tear.boss.v1"])).toBe(
      stableVerificationHash(spring.snapshot.state["tear.boss.v1"]),
    );
    expect(springRoundTrip.snapshot.hashes).toMatchObject({
      semantic: spring.snapshot.hashes.semantic,
      environment: spring.snapshot.hashes.environment,
    });

    const bossPayload = spring.snapshot.state["tear.boss.v1"] as readonly Readonly<Record<string, unknown>>[];
    const malformed = {
      ...spring.snapshot,
      state: { ...spring.snapshot.state, "tear.boss.v1": [{ ...bossPayload[0], lastSpringUseCount: -1 }] },
    };
    expect(() => composition.create(malformed)).toThrow(/Last Spring use count/u);

    const ghost = createGhostV3({
      id: "rootbound-last-spring-seek",
      rulesetVersion: "live",
      sourceClassification: "native-v3",
      trident: replayTrident,
      actions: [],
      snapshots: [spring.snapshot],
      events: [],
    });
    const replay = new GhostProductionReplayWorld(ghost, composition);
    const firstSeek = replay.seek(spring.snapshot.tick);
    const repeatedSeek = replay.seek(spring.snapshot.tick);
    expect(repeatedSeek).toMatchObject({ usedSnapshotId: spring.snapshot.id, semanticHash: firstSeek.semanticHash });

    const forkDocument: TearSdlDocumentV1 = {
      format: "tearsdl",
      schemaVersion: 1,
      id: "rootbound-last-spring-fork",
      stateClass: "surgical-valid",
      seed: spring.snapshot.seed,
      start: { mode: "bossonly", difficulty: "normal", weapon: "sword", boss: "rootbound" },
      state: { boss: { lastSpringUseCount: 2 } },
    };
    const fork = compileResolvedTearSdlSnapshot(spring.snapshot, resolveTearSdl(forkDocument));
    const forked = composition.create(fork);
    expect((forked.replay.world.state.enemies()[0] as never as typeof boss).lastSpringUseCount).toBe(2);
    expect(
      (composition.create(spring.snapshot).replay.world.state.enemies()[0] as never as typeof boss).lastSpringUseCount,
    ).toBe(1);
    expect(fork.hashes.exact).not.toBe(spring.snapshot.hashes.exact);
  });

  it("restores an active data-bound chapter and activates its prepared wave", () => {
    const replay = createProductionReplayWorld({ seed: "production-replay-chapter", mode: "campaign" });
    const spec = createCampaignChapterBindingSpec({
      stageIndex: 0,
      priorOutro: null,
      brief: false,
      prologueShownBefore: false,
      timing,
    });
    const staged = stageCampaignChapterBinding(spec, stageAt(0), {
      dispatch: vi.fn(),
      preparedWave: () => true,
      activationDeferred: () => true,
      clear: vi.fn(),
    });
    const source = new CinematicTimeline.Director(CONFIG);
    source.start(staged.binding.script, staged.binding.context);

    restoreProductionReplayChapterBinding(replay, {
      chapterBinding: spec,
      cinema: source.captureState(),
      lifecycle: {
        phase: "wave-prepared",
        sessionId: "production-replay-session",
        wave: 1,
        bossWave: false,
        activationDeferred: true,
        reward: null,
        outcome: null,
        revision: 2,
      },
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
    source.replay.world.context.environment.addField({
      kind: "bloom-well",
      geometry: { x: 10, y: 20, radius: 25 },
      state: "active",
      stateTick: 3,
      timer: 0.25,
      ownerId: null,
      schedule: null,
      eligibility: { player: true, enemies: true, bosses: false },
      force: null,
      cleanupReason: null,
    });
    const checkpoint = captureProductionReplayCheckpoint(
      source.replay,
      source.combat,
      source.waveReward,
      "environment-rollback",
    );
    const sourceEnvironment = source.replay.world.context.environment.snapshot();
    const sourceWorldId = sourceEnvironment.worldId ?? "source-world";
    const foreignWorldId = "foreign-world";
    const hazard = checkpoint.snapshot.state["tear.hazard.v1"] as Readonly<Record<string, unknown>>;
    const foreignFields = (hazard.fields as readonly Readonly<Record<string, unknown>>[]).map((field) => ({
      ...field,
      id: String(field.id).replace(sourceWorldId, foreignWorldId),
    }));
    const foreignSnapshot = {
      ...checkpoint.snapshot,
      state: Object.freeze({
        ...checkpoint.snapshot.state,
        "tear.hazard.v1": Object.freeze({ ...hazard, worldId: foreignWorldId, fields: foreignFields }),
      }),
    };
    const target = createProductionReplayWorld({ seed: "production-replay-environment-target", mode: "campaign" });
    restoreProductionReplaySnapshot(target, foreignSnapshot);
    const targetEnvironment = target.world.context.environment.snapshot();
    expect(targetEnvironment.fields).toHaveLength(1);
    expect(environmentHash(targetEnvironment)).toBe(environmentHash(sourceEnvironment));
    expect(environmentSnapshotToObservation(targetEnvironment)).toEqual(
      environmentSnapshotToObservation(sourceEnvironment),
    );

    const targetBeforeMalformed = target.world.context.environment.snapshot();
    const destinationWorldId = targetBeforeMalformed.worldId;
    if (destinationWorldId === undefined) throw new Error("production replay environment world ID is required");
    const malformedFields = [foreignFields[0], { ...foreignFields[0], id: `${destinationWorldId}:field:1` }];
    const malformed = {
      ...foreignSnapshot,
      state: Object.freeze({
        ...foreignSnapshot.state,
        "tear.hazard.v1": Object.freeze({ ...hazard, worldId: foreignWorldId, fields: malformedFields }),
      }),
    };
    expect(() => restoreProductionReplaySnapshot(target, malformed)).toThrow(/after rebase|duplicate/u);
    expect(target.world.context.environment.snapshot()).toEqual(targetBeforeMalformed);
  });
});
const replayTrident = Object.freeze({
  command: {
    kind: "command",
    status: "verified",
    available: true,
    resumable: true,
    seekable: false,
    reason: "Rootbound S9 proof",
  },
  state: {
    kind: "state",
    status: "verified",
    available: true,
    resumable: true,
    seekable: true,
    reason: "Rootbound S9 proof",
  },
  visual: {
    kind: "visual",
    status: "absent",
    available: false,
    resumable: false,
    seekable: false,
    reason: "not required",
  },
} satisfies GhostReplayTrident);
