import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { stableVerificationHash } from "../../src/replay/hash";
import {
  captureProductionReplayCheckpoint, createProductionGhostReplayComposition,
} from "../../src/tearbench";

describe("White Hart State Forge and canonical projection", () => {
  it("restores Phase I owned projectiles and their boss references", () => {
    const composition = createProductionGhostReplayComposition({
      seed: "pale-white-hart-projectile-restore", mode: "bossonly",
    });
    const source = composition.create(undefined);
    const boss = source.replay.world.entities.createEnemy(
      "white-hart", 420, CONFIG.world.groundY - CONFIG.whiteHart.h / 2,
      source.replay.world.state.run() as never,
    ) as never as { state: string; stateT: number; attackCursor: number; spawnT: number; introT: number;
      onGround: boolean; ownedAttackProjectiles: unknown[] };
    Object.assign(boss, { state: "idle", stateT: 0, attackCursor: 2, spawnT: 0, introT: 0, onGround: true });
    source.replay.world.state.setEnemies([boss] as never);
    for (let tick = 0; tick < 240 && source.replay.world.state.projectiles().length === 0; tick += 1) {
      source.simulation.advanceOne([]);
    }
    expect(source.replay.world.state.projectiles()).toHaveLength(3);
    expect(boss.ownedAttackProjectiles).toHaveLength(3);
    const checkpoint = captureProductionReplayCheckpoint(
      source.replay, source.combat, source.waveReward, "pale-white-hart-projectile-source",
    );
    const restored = composition.create(checkpoint.snapshot);
    const restoredBoss = restored.replay.world.state.enemies()[0] as never as typeof boss;
    const projectiles = restored.replay.world.state.projectiles();
    expect(projectiles).toHaveLength(3);
    expect(restoredBoss.ownedAttackProjectiles).toHaveLength(3);
    expect(projectiles.every((projectile) => projectile.owner === (restoredBoss as never)
      && projectile.sourceEnemy === (restoredBoss as never) && projectile.bossAttack === "aurora-volley")).toBe(true);
  });

  it("round-trips an active phase-two route attack through the production transaction", () => {
    const composition = createProductionGhostReplayComposition({
      seed: "pale-white-hart-route-restore", mode: "bossonly",
    });
    const source = composition.create(undefined);
    const boss = source.replay.world.entities.createEnemy(
      "white-hart", 420, CONFIG.world.groundY - CONFIG.whiteHart.h / 2,
      source.replay.world.state.run() as never,
    ) as never as {
      kind: string; hp: number; maxHp: number; phaseMarker: 1 | 2 | 3;
      state: string; stateT: number; stateMax: number; atk: string; attackCursor: number;
      attackStep: number; attackSequence: number; environmentSequence: number; routeProgress: number;
      trueRouteIndex: number; routeTelegraph: readonly Readonly<{ x: number; y: number }>[];
      candidateRoutes: readonly (readonly Readonly<{ x: number; y: number }>[])[];
      pendingEnvironmentRequests: readonly Readonly<Record<string, unknown>>[];
    };
    Object.assign(boss, {
      hp: boss.maxHp * 0.5, phaseMarker: 2, state: "windup", stateT: 0.3, stateMax: 0.6,
      atk: "ghost-tracks", attackCursor: 1, attackStep: 0, attackSequence: 5,
      environmentSequence: 1, routeProgress: 0, trueRouteIndex: 1,
      routeTelegraph: Object.freeze([{ x: 420, y: 728 }, { x: 1_520, y: 728 }]),
      candidateRoutes: Object.freeze([
        Object.freeze([{ x: 80, y: 700 }, { x: 1_520, y: 700 }]),
        Object.freeze([{ x: 80, y: 728 }, { x: 1_520, y: 728 }]),
      ]),
      pendingEnvironmentRequests: Object.freeze([Object.freeze({
        sequence: 1, phase: 2, kind: "ghost-track",
        points: Object.freeze([{ x: 80, y: 728 }, { x: 1_520, y: 728 }]),
        direction: 1, width: 54, damage: 16, threatening: true,
      })]),
    });
    source.replay.world.state.setEnemies([boss] as never);
    source.simulation.advanceOne([]);

    const route = source.replay.world.context.environment.routes().find((entry) => entry.kind === "ghost-track");
    expect(route).toMatchObject({ state: "warning", damage: 16, threatening: true, direction: 1, width: 54 });
    expect(boss.pendingEnvironmentRequests).toEqual([]);
    const checkpoint = captureProductionReplayCheckpoint(
      source.replay, source.combat, source.waveReward, "pale-white-hart-route-restore-source",
    );
    expect(source.semanticProjection().enemies[0]?.whiteHart).toMatchObject({
      state: "windup", atk: "ghost-tracks", phaseMarker: 2, attackSequence: 5,
      environmentSequence: 1, trueRouteIndex: 1,
    });

    const restored = composition.create(checkpoint.snapshot);
    const restoredBoss = restored.replay.world.state.enemies()[0] as never as typeof boss;
    expect(restoredBoss).toMatchObject({
      kind: "white-hart", state: "windup", atk: "ghost-tracks", phaseMarker: 2,
      attackCursor: 1, attackSequence: 5, environmentSequence: 1, trueRouteIndex: 1,
    });
    expect(restoredBoss.routeTelegraph).toEqual(boss.routeTelegraph);
    expect(restored.replay.world.context.environment.routes()).toEqual(
      source.replay.world.context.environment.routes(),
    );

    const roundTrip = captureProductionReplayCheckpoint(
      restored.replay, restored.combat, restored.waveReward, "pale-white-hart-route-restore-round-trip",
    );
    expect(stableVerificationHash(roundTrip.snapshot.state["tear.boss.v1"]))
      .toBe(stableVerificationHash(checkpoint.snapshot.state["tear.boss.v1"]));
    // Raw hazard ids are transaction-world scoped and are intentionally rebased on restore.
    expect(roundTrip.snapshot.hashes.environment).toBe(checkpoint.snapshot.hashes.environment);
    expect(roundTrip.snapshot.hashes.semantic).toBe(checkpoint.snapshot.hashes.semantic);

    restoredBoss.routeProgress = 0.5;
    const changed = captureProductionReplayCheckpoint(
      restored.replay, restored.combat, restored.waveReward, "pale-white-hart-route-restore-mutated",
    );
    expect(changed.semanticHash).not.toBe(checkpoint.semanticHash);
  });

  it("round-trips a committed Phase III multi-segment route", () => {
    const composition = createProductionGhostReplayComposition({
      seed: "pale-white-hart-final-route-restore", mode: "bossonly",
    });
    const source = composition.create(undefined);
    const boss = source.replay.world.entities.createEnemy(
      "white-hart", 420, CONFIG.world.groundY - CONFIG.whiteHart.h / 2,
      source.replay.world.state.run() as never,
    ) as never as { hp: number; maxHp: number; phaseMarker: number; state: string; stateT: number;
      stateMax: number; atk: string; attackCursor: number; attackStep: number; attackSequence: number;
      routeProgress: number; batonStrike: number; auroraBossChargeActive: boolean;
      routeTelegraph: readonly Readonly<{ x: number; y: number }>[] };
    const route = Object.freeze([
      { x: 420, y: 728 }, { x: 1_500, y: 728 }, { x: 100, y: 728 }, { x: 1_500, y: 728 },
    ]);
    Object.assign(boss, { hp: boss.maxHp * 0.2, phaseMarker: 3, state: "commit", stateT: 1.4,
      stateMax: 2.35, atk: "last-crossing", attackCursor: 0, attackStep: 1, attackSequence: 12,
      routeProgress: 0.42, batonStrike: 0.08, auroraBossChargeActive: true, routeTelegraph: route });
    source.replay.world.state.setEnemies([boss] as never);
    const checkpoint = captureProductionReplayCheckpoint(
      source.replay, source.combat, source.waveReward, "pale-white-hart-final-route-source",
    );
    const restored = composition.create(checkpoint.snapshot);
    expect(restored.replay.world.state.enemies()[0]).toMatchObject({
      phaseMarker: 3, state: "commit", atk: "last-crossing", stateT: 1.4, stateMax: 2.35,
      attackSequence: 12, routeProgress: 0.42, batonStrike: 0.08, auroraBossChargeActive: true,
      routeTelegraph: route,
    });
    const roundTrip = captureProductionReplayCheckpoint(
      restored.replay, restored.combat, restored.waveReward, "pale-white-hart-final-route-round-trip",
    );
    expect(stableVerificationHash(roundTrip.snapshot.state["tear.boss.v1"]))
      .toBe(stableVerificationHash(checkpoint.snapshot.state["tear.boss.v1"]));
    expect(roundTrip.snapshot.hashes.semantic).toBe(checkpoint.snapshot.hashes.semantic);
  });
});
