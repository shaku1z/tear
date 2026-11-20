/**
 * The opening grace: a run's first wave, and any wave that follows a story, gives the player a few seconds in
 * which enemies arrive and close in but cannot attack or hurt by touch. The length is OPENING_GRACE_SECONDS
 * in wave-rules.ts. This file holds the rule, every enemy kind and the real Adventure opening to it, on
 * simulation ticks.
 */
import { describe, expect, it } from "vitest";

import type { RandomSource } from "../../src/domain/random";
import { aabbOverlap } from "../../src/domain/geometry";
import { resolveEnemyContact } from "../../src/gameplay/combat/contact-runtime";
import { planNextWave, type WavePlanningState } from "../../src/gameplay/run/wave-planner";
import { OPENING_GRACE_SECONDS, openingGrace, openingGraceRemaining } from "../../src/gameplay/run/wave-rules";
import { CONFIG } from "../../src/config/game-config";
import { STAGES } from "../../src/gameplay/stages";
import { CANONICAL_ENGINEERING_SCENARIOS, createProductionHeadlessEnvironment } from "../../src/tearbench";
import { createEnemyHarness, createTestPlayer, STANDARD_ACTOR_FACTORIES } from "./enemy-test-harness";

const TICKS_PER_SECOND = 120;
const DT = 1 / TICKS_PER_SECOND;
const GRACE_TICKS = Math.round(OPENING_GRACE_SECONDS * TICKS_PER_SECOND);
/** An attack may begin on the tick the hold runs out, so "during the grace" stops just short of it. */
const HELD_TICKS = GRACE_TICKS - 2;
type ActorKind = keyof typeof STANDARD_ACTOR_FACTORIES;
const KINDS = Object.keys(STANDARD_ACTOR_FACTORIES) as ActorKind[];

/** Harm one enemy does to a player who stands still beside it: shots fired, hits landed and the gap closed. */
function standBeside(kind: ActorKind, hold: number, ticks: number): { harm: number; closed: number } {
  const harness = createEnemyHarness([0.5]);
  const actor = STANDARD_ACTOR_FACTORIES[kind](harness.types);
  const player = createTestPlayer({ x: actor.x + 220 });
  let hits = 0;
  const struck = {
    get x() {
      return player.x;
    },
    get y() {
      return player.y;
    },
    hw: player.hw,
    hh: player.hh,
    invulnerable: false,
    takeDamage: () => {
      hits += 1;
      return "hit";
    },
  };
  const projectiles: unknown[] = [];
  const gap = Math.abs(player.x - actor.x);
  actor.attackHold = hold;
  for (let tick = 0; tick < ticks; tick += 1) {
    actor.update(DT, harness.platforms, player, projectiles as never[]);
    resolveEnemyContact([actor], struck, {
      overlaps: aabbOverlap,
      segmentDistance: () => Infinity,
      onHit: () => undefined,
      onAbsorbed: () => undefined,
      onHostileBladeResolved: () => undefined,
    });
  }
  return { harm: hits + player.damage.length + projectiles.length, closed: gap - Math.abs(player.x - actor.x) };
}

function planningState(mode: WavePlanningState["mode"], wave: number): WavePlanningState {
  return {
    mode,
    wave,
    diffHp: 1,
    diffCount: 1,
    bossOrder: STAGES.map((stage) => stage.boss),
    bossIdx: 0,
    bossesBeaten: 0,
    curBoss: null,
    currentStageIndex: 0,
    biomeIdx: null,
    pendingBossOutro: null,
  };
}

function plannedGrace(mode: WavePlanningState["mode"], priorWave: number, chapterFlowActive: boolean): number {
  let cursor = 0;
  const random: RandomSource = { next: () => (cursor++ % 7) / 7 };
  return planNextWave({
    state: planningState(mode, priorWave),
    tuning: CONFIG.run,
    stages: STAGES.map((stage) => ({
      id: stage.id,
      name: stage.name,
      boss: stage.boss,
      pool: stage.pool.map(([kind, weight, unlockWave]) => ({ kind, weight, unlockWave: unlockWave ?? 1 })),
    })),
    presets: [],
    random,
    chapterFlowActive,
    startDelay: CONFIG.run.startDelay,
    currentMultiplier: 1,
  }).grace;
}

describe("the opening grace", () => {
  it("opens a run's first wave and a wave that follows a story, and no other", () => {
    expect(OPENING_GRACE_SECONDS).toBeGreaterThan(0);
    expect(openingGrace({ wave: 1, followsStory: false, bossWave: false })).toBe(OPENING_GRACE_SECONDS);
    expect(openingGrace({ wave: 11, followsStory: true, bossWave: false })).toBe(OPENING_GRACE_SECONDS);
    expect(openingGrace({ wave: 2, followsStory: false, bossWave: false })).toBe(0);
    expect(openingGrace({ wave: 1, followsStory: false, bossWave: true })).toBe(0);
  });

  it("is planned by the shared wave planner for every mode, not for Adventure alone", () => {
    for (const mode of ["campaign", "endless", "gauntlet"] as const) {
      expect(plannedGrace(mode, 0, false), mode).toBe(OPENING_GRACE_SECONDS);
      expect(plannedGrace(mode, 1, false), mode).toBe(0);
    }
    expect(plannedGrace("campaign", 0, true)).toBe(OPENING_GRACE_SECONDS);
    expect(plannedGrace("campaign", 10, true)).toBe(OPENING_GRACE_SECONDS);
    expect(plannedGrace("campaign", 10, false)).toBe(0);
  });

  it("counts down on the wave clock and never goes below zero", () => {
    expect(openingGraceRemaining({ waveGrace: OPENING_GRACE_SECONDS, waveTime: 0 })).toBe(OPENING_GRACE_SECONDS);
    expect(openingGraceRemaining({ waveGrace: OPENING_GRACE_SECONDS, waveTime: 1 })).toBe(OPENING_GRACE_SECONDS - 1);
    expect(openingGraceRemaining({ waveGrace: OPENING_GRACE_SECONDS, waveTime: OPENING_GRACE_SECONDS + 5 })).toBe(0);
    expect(openingGraceRemaining({})).toBe(0);
  });

  it("keeps every enemy kind from harming a still player while it runs, and lets it attack afterwards", () => {
    const attackers: ActorKind[] = [];
    for (const kind of KINDS) {
      const free = standBeside(kind, 0, GRACE_TICKS * 4);
      if (free.harm === 0) continue;
      attackers.push(kind);
      expect(standBeside(kind, OPENING_GRACE_SECONDS, HELD_TICKS).harm, `${kind} during the grace`).toBe(0);
      expect(standBeside(kind, OPENING_GRACE_SECONDS, GRACE_TICKS * 5).harm, `${kind} after it`).toBeGreaterThan(0);
    }
    // The kinds a first wave is made of must be among the ones measured, or the loop above proves nothing.
    expect(attackers).toEqual(expect.arrayContaining(["charger", "ranged", "flyer", "bomber", "armored"]));
  });

  it("lets a held enemy close in", () => {
    const held = standBeside("charger", OPENING_GRACE_SECONDS, HELD_TICKS);
    expect(held.closed).toBeGreaterThan(100);
  });
});

describe("the Adventure opening, played by a player who does nothing", () => {
  const scenario = CANONICAL_ENGINEERING_SCENARIOS.find(
    (entry) => entry.start.mode === "campaign" && entry.backends.includes("headless"),
  );

  it("passes no time on the run or wave clock during the story, then takes no damage for the grace", () => {
    if (scenario === undefined) throw new Error("no headless Adventure scenario to open");
    const environment = createProductionHeadlessEnvironment();
    try {
      environment.reset(scenario);
      const run = () => environment.world().run() as { runTime: number; waveTime: number; waveGrace: number };
      const chapter = () => (environment.world().run() as { chapterState?: string }).chapterState;
      const living = () =>
        environment
          .world()
          .enemies()
          .filter((enemy) => !enemy.dead).length;
      // The story: frames pass and simulation ticks are asked for, and neither clock moves.
      for (let frame = 0; frame < 240; frame += 1) environment.advanceApplicationFrame(1 / 60, { key: false });
      for (let tick = 0; tick < 240; tick += 1) environment.step([]);
      expect(run().runTime).toBe(0);
      expect(run().waveTime).toBe(0);
      expect(living()).toBe(0);
      // Skip the rest as a player does: hold confirm until the chapter hands over to the wave.
      for (let frame = 0; frame < 600 && chapter() !== "WAVE_LIVE"; frame += 1) {
        environment.advanceApplicationFrame(1 / 60, { key: frame >= 12 });
      }
      environment.advanceApplicationFrame(1 / 60, { key: false });
      expect(chapter()).toBe("WAVE_LIVE");
      expect(run().waveGrace).toBe(OPENING_GRACE_SECONDS);
      expect(run().waveTime).toBeLessThan(0.1);

      const full = environment.policyObservation().player.hp;
      let arrived = 0;
      while (run().waveTime < OPENING_GRACE_SECONDS) {
        environment.step([]);
        arrived = Math.max(arrived, living());
        expect(environment.policyObservation().player.hp, `wave clock ${String(run().waveTime)}`).toBe(full);
      }
      // Enemies did spawn inside the grace; it is not an empty arena that kept the player whole.
      expect(arrived).toBeGreaterThan(0);

      // And the wave is a wave: the same still player is hit once the grace is over.
      let hurtAt = -1;
      for (let tick = 0; tick < 20 * TICKS_PER_SECOND && hurtAt < 0; tick += 1) {
        environment.step([]);
        if (environment.policyObservation().player.hp < full) hurtAt = run().waveTime;
      }
      expect(hurtAt).toBeGreaterThan(OPENING_GRACE_SECONDS);
    } finally {
      environment.dispose();
    }
  });
});
