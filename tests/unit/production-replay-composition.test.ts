import { describe, expect, it, vi } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { createCampaignChapterBindingSpec, stageCampaignChapterBinding } from "../../src/gameplay/campaign/chapter-cinematic-binding";
import { ROOTBOUND_LAST_SPRING } from "../../src/gameplay/entities/enemy-types/rootbound";
import { createRootboundRegrowthConnections, ROOTBOUND_REGROWTH_TIMING } from "../../src/gameplay/environment/regrowth-link";
import type { CampaignChapterTiming } from "../../src/gameplay/campaign/chapter-controller";
import { CinematicTimeline } from "../../src/gameplay/runtime/cinematic-director";
import { stageAt } from "../../src/gameplay/stages";
import { stableVerificationHash } from "../../src/replay/hash";
import { captureProductionReplayCheckpoint, createProductionGhostReplayComposition, createProductionReplayWorld, environmentHash, environmentSnapshotToObservation, restoreProductionReplayChapterBinding, restoreProductionReplaySnapshot } from "../../src/tearbench";

const timing: CampaignChapterTiming = Object.freeze({
  loreReveal: 0.1, chapterIn: 0.2, loreExit: 0.3, biomeRevealBrief: 0.4,
  biomeRevealFull: 0.5, readyBrief: 0.6, readyFull: 0.7,
  dialogueDuck: 0.8, biomeRevealDuck: 0.9,
});

describe("production replay composition", () => {
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
