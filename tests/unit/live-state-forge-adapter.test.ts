import { preflightGhostRecordedCanonicalSnapshot } from "../../src/ghost/capsule-replay-envelope";
import { declareSeedRace, seedRaceInitialBuildHash } from "../../src/ghost/seed-race-contract";
import { seedRaceCatalogHash } from "../../src/gameplay/run/seed-locked-draft";
import { describe, expect, it, vi } from "vitest";
import { createLiveStateForgeAdapter } from "../../src/app/engineering/state-forge-adapter";
import { createProductionGhostReplayComposition } from "../../src/tearbench/production-replay-composition";
import {
  captureLiveStateForgeSnapshot,
  createLiveStateForgeRestoreFactory,
} from "../../src/tearbench/live-runtime-snapshots";
import { restoreSnapshotIntoLiveWorld } from "../../src/tearbench/live-state-snapshot";
import { createDefaultStateCodecRegistry } from "../../src/tearbench/state-codecs";
import { INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 } from "../../src/gameplay/runtime/cinematic-director";
import type { RootboundGraftEffects } from "../../src/gameplay/environment/graft-anchor";
import { STAGES, PLAYGROUND_STAGES } from "../../src/gameplay/stages";
import { UPGRADES, applyUpgrade } from "../../src/gameplay/upgrades";
import { applyWeapon } from "../../src/gameplay/weapons";
import { createLiveHudFeedbackState } from "../../src/app/interface/hud-feedback-state";
import { createLiveParticlePresentationState } from "../../src/tearbench/particle-presentation-state";

import { TutorialController, parseTutorialSessionCheckpoint } from "../../src/gameplay/training/tutorial-controller";

type Failure = "clear" | "replace" | "late" | "runtime";
interface BossFacts {
  maxHp: number;
  graftDamageTakenMultiplier: number;
  graftGapMultiplier: number;
  activeGraftTypes: readonly string[];
  rootCageRequest: unknown;
  applyGraftEffects(effects: RootboundGraftEffects): void;
  completeRootCage(): void;
  startRootCage(centerX: number): boolean;
}

function fixture(includeTutorial = false) {
  const host = createProductionGhostReplayComposition({ seed: "live-adapter-ownership", mode: "endless" }).create(
    undefined,
  );
  const { replay, combat } = host;
  const state = replay.world.state,
    environment = replay.world.context.environment;
  const identities = combat.combatEntityRuntime;
  const boss = replay.world.entities.createEnemy("rootbound", 800, 520, state.run() as never);
  state.setEnemies([boss]);
  environment.setStage(STAGES[0]?.id ?? "unknown", "restore");
  const observations: { phase: string; actor: unknown; id: string }[] = [];
  let failure: Failure | undefined;
  let screen = "playing",
    focus = -1;
  const hud = createLiveHudFeedbackState();
  const tutorial = includeTutorial ? new TutorialController(replay.configuration.value) : undefined;
  if (tutorial) {
    Object.assign(state.run() ?? {}, { mode: "tutorial" });
    tutorial.start(1600);
    tutorial.consumePendingArena();
  }
  const particles = createLiveParticlePresentationState(
    replay.effects,
    () => ({ effects: replay.configuration.value.effects, lowGraphics: false, reducedMotion: false }),
    replay.cosmeticEmissionRandom,
  );
  const runtimeParticles: ReturnType<typeof particles.capture>[] = [];
  const stagedEntropy: ReturnType<typeof replay.cosmeticEmissionRandom.snapshot>[] = [];
  let runtime: Readonly<Record<string, unknown>> = { sentinel: 1, cinema: INACTIVE_CINEMATIC_DIRECTOR_STATE_V1 };
  const observe = (phase: string) => {
    for (const actor of state.enemies()) observations.push({ phase, actor, id: identities.id(actor, "enemy") });
  };
  const fail = (phase: Failure) => {
    if (failure === phase) {
      failure = undefined;
      throw new Error(`injected ${phase}`);
    }
  };
  environment.setFeatureActorSource("verdant", "rootbound", () =>
    state.enemies().map((actor) => ({
      id: identities.id(actor, "enemy"),
      source: actor,
      state: {},
      applyGraftEffects: (effects: RootboundGraftEffects) => {
        (actor as unknown as BossFacts).applyGraftEffects(effects);
      },
      completeRootCage: () => {
        (actor as unknown as BossFacts).completeRootCage();
      },
    })),
  );
  const adapter = createLiveStateForgeAdapter({
    dependencies: { ...replay.dependencies, STAGES, PLAYGROUND_STAGES, UPGRADES, applyWeapon },
    entities: replay.world.entities,
    worldServices: replay.world.context.services,
    state,
    actorId: identities.id.bind(identities),
    bindActorId: identities.bindId.bind(identities),
    platforms: () => replay.stage.platforms as never,
    stageIndex: () => replay.stage.index,
    restoreStageIndex: (index) => {
      replay.stage.index = index;
    },
    replacePlatforms: (platforms) => {
      replay.stage.platforms = platforms;
    },
    slowZones: state.slowZones.bind(state),
    walls: state.temporaryWalls.bind(state),
    environment: () => environment,
    clearEnvironmentRestore: () => {
      observe("clear");
      environment.clear("restore");
      fail("clear");
    },
    restoreEnvironment: (snapshot) => {
      observe("replace");
      environment.replace(snapshot);
      fail("replace");
    },
    screen: () => screen,
    setScreen: (value) => {
      screen = value;
      fail("late");
    },
    focus: () => focus,
    setFocus: (value) => {
      focus = value;
    },
    tick: () => combat.simulationRuntime.scheduler.tick,
    setTick: (tick) => {
      combat.simulationRuntime.reset(tick);
    },
    clearInputProjection: replay.input.clear.bind(replay.input),
    reward: host.waveReward.reward.snapshot.bind(host.waveReward.reward),
    restoreReward: host.waveReward.reward.restore.bind(host.waveReward.reward),
    captureGhost: () => ({ recording: null }),
    restoreGhost: () => undefined,
    captureIdentityState: identities.captureIdentityState.bind(identities),
    restoreIdentityState: identities.restoreIdentityState.bind(identities),
    runtimeState: () => ({ ...runtime, ...(tutorial ? { tutorialSession: tutorial.captureSession() } : {}) }),
    restoreRuntimeState: (value) => {
      runtime = value;
      tutorial?.restoreSession(value.tutorialSession);
      runtimeParticles.push(particles.capture());
      fail("runtime");
    },
    hudPresentation: hud,
    particlesPresentation: particles,
    ...(tutorial
      ? {
          tutorialPresentation: {
            capture: () => tutorial.capturePresentation(),
            restore: (value: ReturnType<TutorialController["capturePresentation"]> | undefined) => {
              tutorial.restorePresentation(value);
            },
          },
        }
      : {}),
    captureCinema: () => INACTIVE_CINEMATIC_DIRECTOR_STATE_V1,
    validateCinema: (value) => {
      if (tutorial) parseTutorialSessionCheckpoint(value.tutorialSession);
    },
  });
  const registry = createDefaultStateCodecRegistry();
  const capture = () =>
    captureLiveStateForgeSnapshot({
      id: "live-adapter-boundary",
      tick: combat.simulationRuntime.scheduler.tick,
      stateClass: "recorded-canonical",
      seed: "live-adapter-ownership",
      stateForge: adapter,
      registry,
      rng: replay.world.context.services.random.snapshot(),
      observationClass: "structured-state",
      producer: "unit",
      target: "headless",
      contentHash: "unit",
      visualHash: "not-captured",
    });
  const restore = (snapshot: ReturnType<typeof capture>) =>
    restoreSnapshotIntoLiveWorld(snapshot, registry, createLiveStateForgeRestoreFactory(registry), {
      ...adapter,
      validate: (candidate) => {
        stagedEntropy.push(replay.cosmeticEmissionRandom.snapshot());
        return adapter.validate(candidate);
      },
    });
  const facts = (damage: number) => {
    const actor = state.enemies()[0] as unknown as BossFacts;
    Object.assign(actor, {
      phaseMarker: 2,
      hp: actor.maxHp * 0.5,
      cinematicRequest: null,
      cinematicT: 0,
      introT: 0,
      state: "idle",
      rootCageRequest: null,
    });
    actor.applyGraftEffects({
      incomingDamageMultiplier: damage,
      gapMultiplier: 0.6,
      heals: false,
      activeTypes: ["bastion", "haste"],
    });
    expect(actor.startRootCage(800)).toBe(true);
  };
  return {
    host,
    tutorial,
    replay,
    state,
    adapter,
    capture,
    restore,
    facts,
    observations,
    hud,
    particles,
    runtimeParticles,
    stagedEntropy,
    failNext: (phase: Failure) => {
      failure = phase;
    },
  };
}

describe("live State Forge adapter ownership boundary", () => {
  it.each([0, 1, 3])("captures a real partial projectile trail with %i samples before JSON hashing", (samples) => {
    const host = fixture(),
      projectile = new host.replay.factories.Projectile(100, 200, 30, -40);
    for (let i = 0; i < samples; i++) projectile.pushTrail(100 + i, 200 - i);
    host.state.setProjectiles([projectile]);
    const ring = projectile.hist,
      head = projectile.histHead,
      count = projectile.histCount;
    const points = Array.from({ length: count }, (_, index) => ({ ...projectile.trailPoint(index) }));
    const snapshot = host.capture(),
      portable = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
    expect(preflightGhostRecordedCanonicalSnapshot(snapshot)).toMatchObject({
      ok: true,
      exactHash: snapshot.hashes.exact,
    });
    expect(preflightGhostRecordedCanonicalSnapshot(portable)).toMatchObject({
      ok: true,
      exactHash: snapshot.hashes.exact,
      semanticHash: snapshot.hashes.semantic,
    });
    expect(projectile.hist).toBe(ring);
    expect(projectile.histHead).toBe(head);
    expect(projectile.histCount).toBe(count);
    expect(Array.from({ length: count }, (_, index) => ({ ...projectile.trailPoint(index) }))).toEqual(points);
    const saved = portable.state["tear.projectile.v1"] as { hist: unknown[]; histHead: number; histCount: number }[];
    expect(saved[0]).toMatchObject({ histHead: head, histCount: count });
    expect(saved[0]?.hist).toHaveLength(7);
    expect(saved[0]?.hist.slice(samples)).toEqual(Array<null>(7 - samples).fill(null));
    expect(host.restore(portable).ok).toBe(true);
    expect(host.capture().hashes).toEqual(snapshot.hashes);
  });

  it("restores tutorial behavior/help exactly, refuses malformed sessions before mutation and rolls back a late failure", () => {
    const host = fixture(true),
      tutorial = host.tutorial;
    if (!tutorial) throw new Error("tutorial fixture missing");
    tutorial.mark("moveL");
    tutorial.showHelp();
    tutorial.demonstrate();
    const saved = host.capture(),
      session = tutorial.captureSession(),
      presentation = tutorial.capturePresentation();
    tutorial.restart();
    tutorial.consumePendingArena();
    expect(host.restore(saved).ok).toBe(true);
    expect(tutorial.captureSession()).toEqual(session);
    expect(tutorial.capturePresentation()).toEqual(presentation);
    const invalid = structuredClone(saved);
    const runtime = (invalid.state["tear.world.v1"] as { runtime: { tutorialSession: { completionDelay: unknown } } })
      .runtime;
    runtime.tutorialSession.completionDelay = "invalid";
    const unchanged = host.capture();
    host.observations.length = 0;
    expect(host.restore(invalid).ok).toBe(false);
    expect(host.observations).toEqual([]);
    expect(host.capture().state).toEqual(unchanged.state);
    tutorial.mark("moveR");
    tutorial.showHelp();
    const outgoing = host.capture();
    host.failNext("runtime");
    expect(host.restore(saved)).toMatchObject({ ok: false, phase: "commit", rolledBack: true });
    expect(host.capture().state).toEqual(outgoing.state);
    const historical = structuredClone(saved);
    delete (historical.state["tear.ui.v1"] as Record<string, unknown>).tutorialPresentation;
    delete (historical.state["tear.world.v1"] as { runtime: Record<string, unknown> }).runtime.tutorialSession;
    const historicalBefore = host.capture(),
      tutorialBefore = tutorial.captureSession();
    const historicalResult = host.restore(historical);
    expect(historicalResult).toMatchObject({ ok: false, phase: "stage", rolledBack: false });
    if (historicalResult.ok) throw new Error("Historical missing tutorial behavior must be refused");
    expect(historicalResult.issues[0]?.message).toContain("historical missing behavior is unsupported");
    expect(host.capture().state).toEqual(historicalBefore.state);
    expect(tutorial.captureSession()).toEqual(tutorialBefore);
  });

  it("captures and restores actual particles after three fixed steps and rolls back after installed FX on late failure", () => {
    const host = fixture(),
      fx = host.replay.effects;
    fx.spark(800, 775, 1, -1);
    fx.drip(800, 775);
    fx.setViewRect({ left: 0, top: 0, right: 1200, bottom: 900 });
    const saved = host.capture(),
      particles = host.particles.capture(),
      list = fx.list,
      view = fx.view;
    for (let i = 0; i < 3; i++) fx.update(1 / 120);
    expect(host.particles.capture()).not.toEqual(particles);
    expect(host.restore(saved).ok).toBe(true);
    expect(host.particles.capture()).toEqual(particles);
    expect(fx.list).toBe(list);
    expect(fx.view).toBe(view);
    expect((saved.state["tear.ui.v1"] as Record<string, unknown>).particlesPresentation).toEqual(particles);
    fx.update(1 / 120);
    fx.spark(801, 775, 1, 0);
    const outgoing = host.capture(),
      outgoingParticles = host.particles.capture();
    host.failNext("runtime");
    expect(host.restore(saved)).toMatchObject({ ok: false, phase: "commit", rolledBack: true });
    expect(host.capture().state).toEqual(outgoing.state);
    expect(host.particles.capture()).toEqual(outgoingParticles);
    expect(host.runtimeParticles.slice(-2)).toEqual([particles, outgoingParticles]);
    if (outgoingParticles.version !== 2) throw new Error("current capture must retain entropy");
    expect(host.stagedEntropy.at(-1)).toEqual(outgoingParticles.entropy);
  });
  it("restores JSON-portable staged HUD exactly and retains boss flash only on its actor codec", () => {
    const host = fixture();
    const hud = { version: 1, clockSeconds: 2.3456789, lagHp: 0.87, multiplier: 3, multiplierPop: 0.42 };
    host.hud.restore(hud);
    Object.assign(host.state.enemies()[0] ?? {}, { _phaseFlashT: 0.5 });
    const snapshot = JSON.parse(JSON.stringify(host.capture())) as ReturnType<typeof host.capture>;
    expect(snapshot.state["tear.ui.v1"]).toEqual({
      screen: "playing",
      focusId: "-1",
      hudPresentation: hud,
      particlesPresentation: host.particles.capture(),
    });
    expect(snapshot.state["tear.boss.v1"]).toEqual(
      expect.arrayContaining([expect.objectContaining({ _phaseFlashT: 0.5 })]),
    );
    host.hud.restore({ ...hud, clockSeconds: 99, lagHp: 0.1 });
    expect(host.restore(snapshot).ok).toBe(true);
    expect(host.hud.capture()).toEqual(hud);
    expect(host.capture().state).toEqual(snapshot.state);
  });

  it.each(["malformed", "binding", "entropy"] as const)(
    "rejects %s particles before world setters and entropy changes",
    (kind) => {
      const host = fixture();
      host.replay.effects.spark(1, 2, 1, 0);
      const before = host.capture(),
        invalid = structuredClone(before),
        rng = host.replay.random.streams.snapshot();
      const payload = (invalid.state["tear.ui.v1"] as Record<string, unknown>).particlesPresentation as {
        replacementCursor: number;
        policy: { effects: { cullMargin: number } };
        entropy: { cursor: number };
      };
      if (kind === "malformed") payload.replacementCursor = -1;
      else if (kind === "entropy") payload.entropy.cursor = -1;
      else payload.policy.effects.cullMargin += 1;
      const run = host.state.run(),
        player = host.state.player(),
        actors = host.state.enemies();
      expect(host.restore(invalid)).toMatchObject({
        ok: false,
        phase: kind === "binding" ? "stage" : "decode",
        rolledBack: false,
      });
      expect(host.state.run()).toBe(run);
      expect(host.state.player()).toBe(player);
      expect(host.state.enemies()).toBe(actors);
      expect(host.observations).toEqual([]);
      expect(host.replay.random.streams.snapshot()).toEqual(rng);
      expect(host.capture().state).toEqual(before.state);
    },
  );

  it("uses candidate configuration for particles and clears historical absence without resetting backdrop", () => {
    const host = fixture(),
      fx = host.replay.effects;
    host.replay.configuration.value.effects.highBudget = 4;
    host.replay.configuration.value.effects.lowBudget = 1;
    fx.spark(1, 2, 1, 0);
    const saved = host.capture(),
      particles = host.particles.capture();
    host.replay.configuration.value.effects.highBudget = 9;
    host.replay.configuration.value.effects.cullMargin = 17;
    expect(host.restore(saved).ok).toBe(true);
    expect(host.particles.capture()).toEqual(particles);
    const legacy = structuredClone(saved);
    delete (legacy.state["tear.ui.v1"] as Record<string, unknown>).particlesPresentation;
    const reset = vi.spyOn(fx, "reset"),
      backdrop = vi.spyOn(host.replay.dependencies.Backdrop, "resetFx");
    const list = fx.list;
    expect(host.restore(legacy).ok).toBe(true);
    expect(fx.list).toBe(list);
    expect(fx.list).toEqual([]);
    expect(fx.view).toBeNull();
    expect(fx._replacementCursor).toBe(0);
    expect(reset).not.toHaveBeenCalled();
    expect(backdrop).not.toHaveBeenCalled();
  });

  it("resets missing historical HUD rather than inheriting outgoing feedback", () => {
    const host = fixture(),
      snapshot = structuredClone(host.capture());
    delete (snapshot.state["tear.ui.v1"] as Record<string, unknown>).hudPresentation;
    host.hud.restore({ version: 1, clockSeconds: 9, lagHp: 0.2, multiplier: 5, multiplierPop: 0.8 });
    expect(host.restore(snapshot).ok).toBe(true);
    expect(host.hud.capture()).toEqual({ version: 1, clockSeconds: 0, lagHp: 1, multiplier: 1, multiplierPop: 0 });
  });

  it("rejects invalid HUD before live mutation and restores outgoing HUD after a later runtime failure", () => {
    const host = fixture();
    host.hud.restore({ version: 1, clockSeconds: 1, lagHp: 0.8, multiplier: 2, multiplierPop: 0.5 });
    const candidate = structuredClone(host.capture()),
      invalid = structuredClone(candidate);
    (invalid.state["tear.ui.v1"] as Record<string, unknown>).hudPresentation = { version: 1, clockSeconds: -1 };
    const actor = host.state.enemies()[0];
    expect(host.restore(invalid)).toMatchObject({ ok: false, phase: "decode", rolledBack: false });
    expect(host.observations).toEqual([]);
    expect(host.state.enemies()[0]).toBe(actor);
    expect(host.capture().state).toEqual(candidate.state);
    host.hud.restore({ version: 1, clockSeconds: 5, lagHp: 0.2, multiplier: 3, multiplierPop: 0.7 });
    const outgoing = host.capture();
    host.failNext("runtime");
    expect(host.restore(candidate)).toMatchObject({ ok: false, phase: "commit", rolledBack: true });
    expect(host.capture().state).toEqual(outgoing.state);
    expect(host.hud.capture()).toEqual((outgoing.state["tear.ui.v1"] as Record<string, unknown>).hudPresentation);
  });

  it("cleans outgoing actors and identities before installing intact candidate Graft and Root Cage state", () => {
    const host = fixture();
    host.facts(0.8);
    // What the rebuilt Phase II keeps on the boss: each must come back from a snapshot as it was.
    const gardenFacts = {
      phaseTwoEntryHp: 321,
      healedFraction: 0.03,
      quietT: 1.25,
      openingGraft: true,
      fullGrove: true,
      graftRegrowTick: 777,
      graftHeals: false,
      plantedGraftTypes: ["bastion", "haste"],
      graftRequests: [
        { graftType: "bastion", geometry: { shape: "aabb", x: 100, y: 200, w: 54, h: 90 } },
        { graftType: "haste", geometry: { shape: "aabb", x: 400, y: 200, w: 54, h: 90 } },
      ],
    };
    Object.assign(host.state.enemies()[0] as object, structuredClone(gardenFacts));
    host.replay.world.context.services.clock.set(0.173456789);
    const snapshot = host.capture();
    const outgoing = host.state.enemies()[0];
    const id = (snapshot.state["tear.boss.v1"] as { id: string }[])[0]?.id;
    host.replay.world.context.services.clock.set(9.5);
    expect(host.restore(snapshot).ok).toBe(true);
    expect(host.observations).toEqual([
      { phase: "clear", actor: outgoing, id },
      { phase: "replace", actor: outgoing, id },
    ]);
    expect(host.state.enemies()[0]).not.toBe(outgoing);
    expect(host.state.enemies()[0]).toMatchObject({
      graftDamageTakenMultiplier: 0.8,
      graftGapMultiplier: 0.6,
      activeGraftTypes: ["bastion", "haste"],
      rootCageRequest: { sequence: 1, centerX: 800 },
      ...gardenFacts,
    });
    expect(host.replay.world.context.services.clock.seconds()).toBe(0.173456789);
    expect(host.capture().state).toEqual(snapshot.state);
  });

  it.each(["clear", "replace", "late"] as const)(
    "rolls back actor facts, environment, identities and exact seconds after a %s failure",
    (phase) => {
      const host = fixture();
      host.facts(0.8);
      host.replay.world.context.services.clock.set(0.173456789);
      const source = host.capture();
      host.facts(0.7);
      host.replay.world.context.services.clock.set(0.3987654321);
      const before = host.capture();
      host.failNext(phase);
      expect(host.restore(source)).toMatchObject({ ok: false, phase: "commit", rolledBack: true });
      expect(host.capture().state).toEqual(before.state);
      expect(host.replay.world.context.services.clock.seconds()).toBe(0.3987654321);
    },
  );

  it("rejects invalid recorded seconds before any live mutation", () => {
    const host = fixture();
    host.facts(0.8);
    host.replay.world.context.services.clock.set(0.173456789);
    const before = host.capture(),
      invalid = structuredClone(before);
    (invalid.state["tear.world.v1"] as Record<string, unknown>).simulationSeconds = -1;
    const actors = host.state.enemies(),
      run = host.state.run();
    expect(host.restore(invalid)).toMatchObject({ ok: false, phase: "decode", rolledBack: false });
    expect(host.state.enemies()).toBe(actors);
    expect(host.state.run()).toBe(run);
    expect(host.observations).toEqual([]);
    expect(host.capture().state).toEqual(before.state);
    expect(host.replay.world.context.services.clock.seconds()).toBe(0.173456789);
  });

  it("retains the current clock when restoring historical snapshots without seconds", () => {
    const host = fixture();
    host.facts(0.8);
    const snapshot = structuredClone(host.capture());
    delete (snapshot.state["tear.world.v1"] as Record<string, unknown>).simulationSeconds;
    host.replay.world.context.services.clock.set(0.3987654321);
    expect(host.restore(snapshot).ok).toBe(true);
    expect(host.replay.world.context.services.clock.seconds()).toBe(0.3987654321);
  });
});

describe("live Race state ownership", () => {
  it("restores the declaration, owned build, next common offer and RNG, with exact late-failure rollback", () => {
    const f = fixture(),
      run = requireRaceValue(f.state.run());
    Object.assign(run.mods, { expandedDraft: true, reservePick: true, draftRerolls: 2 });
    const initial = f.capture();
    run.seedRace = declareSeedRace({
      format: "tear-seed-race",
      version: 1,
      mode: "endless",
      difficulty: run.diff,
      weapon: run.weaponId,
      boss: "shuffle",
      seed: run.runSeed,
      metaRanks: { expanded: 1, reserve: 1, reroll: 2 },
      variantDiscovery: run.variantDiscovery ?? [],
      headstartId: null,
      initialBuildHash: seedRaceInitialBuildHash(initial.state),
      baselineHash: "1".repeat(16),
      build: initial.provenance.build,
      draft: { policy: "seed-locked-common-offers.v1", seed: run.runSeed, catalogHash: seedRaceCatalogHash() },
    });
    f.state.setEnemies([]); // The ownership fixture installs Rootbound in A0 only for reference tests; it is not a combat encounter.
    f.host.waveReward.reward.reset();
    f.host.simulation.advanceOne([]);
    const saved = f.capture(),
      rng = f.replay.world.context.services.random.snapshot();
    f.host.waveReward.reward.openDraft();
    const offers = f.host.waveReward.reward.snapshot()?.choices.map((c) => c.id);
    const upgrade = UPGRADES.find((choice) => choice.id === "riposte");
    if (!upgrade) throw new Error("upgrade missing");
    applyUpgrade(upgrade, {
      config: f.replay.configuration.value,
      player: requireRaceValue(f.state.player()),
      blade: requireRaceValue(f.state.blade()),
      mods: requireRaceValue(f.state.run()).mods,
    });
    const restoredRace = f.restore(saved);
    expect(restoredRace.ok, JSON.stringify(restoredRace)).toBe(true);
    expect(f.state.run()?.seedRace).toEqual(run.seedRace);
    expect(f.replay.world.context.services.random.snapshot()).toEqual(rng);
    f.host.waveReward.reward.openDraft();
    expect(f.host.waveReward.reward.snapshot()?.choices.map((c) => c.id)).toEqual(offers);
    const outgoing = f.capture();
    f.failNext("runtime");
    expect(f.restore(saved)).toMatchObject({ ok: false, rolledBack: true });
    expect(f.capture().state).toEqual(outgoing.state);
    const malformed = structuredClone(saved);
    const declaration = (
      malformed.state["tear.run.v1"] as { seedRace: { shared: { metaRanks: Record<string, number> } } }
    ).seedRace;
    declaration.shared.metaRanks.tough = 100;
    f.observations.length = 0;
    expect(f.restore(malformed).ok).toBe(false);
    expect(f.observations).toEqual([]);
    expect(f.capture().state).toEqual(outgoing.state);
  });
});

function requireRaceValue<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Race fixture value unavailable");
  return value;
}
