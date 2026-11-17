/**
 * The lifetime rule for every stage object, in every biome: a field, combat object or route that ends
 * (expired or destroyed) fades for ENVIRONMENT_FADE_TICKS and is then removed by the environment
 * runtime. No biome keeps ended objects, and no biome removes them by hand.
 *
 * The kernel cases pin the rule. The fight cases run each biome boss through every phase inside its
 * real environment, with a player who keeps moving and cuts whatever can be cut, and check every tick.
 * Each fight then removes the boss, and everything it placed must end and leave. Every object kind in
 * the registry must be seen ending and leaving, so a new kind with no end fails here.
 */
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { ENVIRONMENT_FADE_TICKS } from "../../src/gameplay/environment/environment-contracts";
import { ENVIRONMENT_OBJECT_DEFINITIONS } from "../../src/gameplay/environment/environment-definitions";
import { ENVIRONMENT_OBJECT_KIND_IDS } from "../../src/gameplay/environment/environment-object-kinds";
import { createEnvironmentRuntime, type EnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { bindLiveRootboundActors } from "../../src/gameplay/environment/biome-actors/rootbound-actors";
import { bindLiveWhiteHartActors } from "../../src/gameplay/environment/biome-actors/white-hart-actors";
import type { EnemyProjectile } from "../../src/gameplay/entities/enemy-contracts";
import { bossPhaseMarks } from "../../src/gameplay/run/boss-definitions";
import { createBossArena } from "../../src/gameplay/training/arena-rules";
import { createEnemyHarness, createTestPlayer, type BehaviorActor } from "./enemy-test-harness";

const DT = 1 / 120;
const FIGHT_SECONDS = 45;
const CUT_EVERY_TICKS = 180;
/** No biome fight should ever hold more stage objects than this at once, ended ones included. */
const POPULATION_BOUND = 24;

type Entry = Readonly<{ id: string; kind: string; state: string; stateTick: number }>;
const ended = (entry: Entry) => entry.state === "expired" || entry.state === "destroyed";
const everything = (environment: EnvironmentRuntime): readonly Entry[] => [
  ...environment.fields(),
  ...environment.combatObjects(),
  ...environment.routes(),
];

function field(tick: number) {
  return {
    kind: "bloom-well" as const,
    geometry: { x: 0, y: 0, w: 10, h: 10 },
    state: "active" as const,
    stateTick: tick,
    timer: 0,
    ownerId: null,
    schedule: null,
    eligibility: { player: true, enemies: false, bosses: false },
    force: null,
    cleanupReason: null,
  };
}

describe("stage object lifetime rule (kernel)", () => {
  it("removes an object ended during a step once its fade has played, and not before", () => {
    const environment = createEnvironmentRuntime({ stageId: "rule-test", worldId: "lifetime-kernel" });
    const id = environment.addField(field(0));
    environment.step(100, DT, () => {
      // The owner passes no meaningful tick; the step's tick starts the fade.
      environment.updateField(id, { state: "expired", stateTick: 0, cleanupReason: "natural-expiry" });
    });
    expect(environment.fields()).toEqual([expect.objectContaining({ id, state: "expired", stateTick: 100 })]);
    environment.step(100 + ENVIRONMENT_FADE_TICKS - 1, DT, () => undefined);
    expect(environment.fields()).toHaveLength(1);
    environment.step(100 + ENVIRONMENT_FADE_TICKS, DT, () => undefined);
    expect(environment.fields()).toHaveLength(0);
  });

  it("keeps the fade start when an ended object is patched again", () => {
    const environment = createEnvironmentRuntime({ stageId: "rule-test", worldId: "lifetime-repatch" });
    const id = environment.addField(field(0));
    environment.step(10, DT, () => {
      environment.updateField(id, { state: "expired", stateTick: 10, cleanupReason: "natural-expiry" });
    });
    environment.step(20, DT, () => {
      environment.updateField(id, { state: "expired", stateTick: 20 });
    });
    expect(environment.fields()[0]?.stateTick).toBe(10);
    environment.step(10 + ENVIRONMENT_FADE_TICKS, DT, () => undefined);
    expect(environment.fields()).toHaveLength(0);
  });

  it("removes ended objects before a step's installs, so a fading object never holds a slot", () => {
    const environment = createEnvironmentRuntime({
      stageId: "rule-test",
      worldId: "lifetime-capacity",
      configuration: { maxFields: 1 },
    });
    const id = environment.addField(field(0));
    environment.step(1, DT, () => {
      environment.updateField(id, { state: "expired", cleanupReason: "natural-expiry" });
    });
    let replacement = "";
    expect(() => {
      environment.step(1 + ENVIRONMENT_FADE_TICKS, DT, () => {
        replacement = environment.addField(field(1 + ENVIRONMENT_FADE_TICKS));
      });
    }).not.toThrow();
    expect(environment.fields().map((entry) => entry.id)).toEqual([replacement]);
  });
});

type Boss = BehaviorActor & { introT: number; cinematicRequest: unknown; cinematicT: number };
const BIOME_BOSSES = [
  { boss: "rootbound", stageId: "verdant-sanctum" },
  { boss: "white-hart", stageId: "pale-traverse" },
] as const;

interface FightReport {
  readonly oldestEndedTicks: number;
  readonly peakPopulation: number;
  readonly endedSeen: number;
  readonly cuts: number;
  /** Objects still present once the boss had been gone for a full fade. */
  readonly leftAfterBoss: readonly string[];
  /** Kinds seen ending and then leaving. */
  readonly kindsEndedAndLeft: readonly string[];
}

function fight(bossId: (typeof BIOME_BOSSES)[number]["boss"], stageId: string, phase: 1 | 2 | 3): FightReport {
  const harness = createEnemyHarness([0.25, 0.75, 0.4, 0.6, 0.1, 0.9]);
  const Type = bossId === "rootbound" ? harness.types.Rootbound : harness.types.WhiteHart;
  const boss = new Type(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as unknown as Boss;
  const player = Object.assign(createTestPlayer({ x: 220 }), { hazardDmgMult: 1, invulnerable: false });
  const projectiles: EnemyProjectile[] = [];
  const platforms =
    createBossArena(bossId, CONFIG.view.w, CONFIG.view.h, CONFIG.world.groundY, 0.5) ?? harness.platforms;
  const settle = () => {
    boss.cinematicRequest = null;
    boss.cinematicT = 0;
  };
  const marks = bossPhaseMarks(bossId);
  boss.introT = 0;
  if (phase > 1) boss.hp = boss.maxHp * ((phase === 2 ? marks[0] : marks[1]) - 0.05);
  for (let step = 0; step < 4; step += 1) {
    boss.update(DT, platforms, player, projectiles);
    settle();
  }
  const environment = createEnvironmentRuntime({ stageId, worldId: `lifetime-rules:${bossId}:${String(phase)}` });
  let bossPresent = true;
  const enemies = () => (bossPresent ? [boss] : []);
  if (bossId === "rootbound")
    bindLiveRootboundActors(
      environment,
      () => player,
      enemies,
      () => "enemy:boss",
      CONFIG,
    );
  else
    bindLiveWhiteHartActors(
      environment,
      () => player,
      enemies,
      () => "enemy:boss",
    );
  const seen = new Map<string, string>();
  let oldest = 0,
    peak = 0,
    cuts = 0;
  const fightTicks = FIGHT_SECONDS / DT;
  for (let tick = 1; tick <= fightTicks + ENVIRONMENT_FADE_TICKS + 1; tick += 1) {
    // The fight ends with the boss gone; what it placed must end and leave.
    bossPresent = tick <= fightTicks;
    // A player who never stops: across the arena and back every eight seconds.
    const sweep = (tick % 960) / 960;
    player.x = 200 + (CONFIG.view.w - 400) * (sweep < 0.5 ? sweep * 2 : 2 - sweep * 2);
    environment.step(
      tick,
      DT,
      () => {
        if (bossPresent) boss.update(DT, platforms, player, projectiles);
        if (tick % CUT_EVERY_TICKS !== 0) return;
        const target = environment.combatObjects().find((object) => !ended(object) && object.integrity > 0);
        if (
          target !== undefined &&
          environment.damageCombatObject(target.id, target.integrity, "rule-cut", tick).destroyed
        )
          cuts += 1;
      },
      new Set(bossPresent ? ["enemy:boss"] : []),
    );
    settle();
    const entries = everything(environment);
    peak = Math.max(peak, entries.length);
    for (const entry of entries.filter(ended)) {
      seen.set(entry.id, entry.kind);
      oldest = Math.max(oldest, tick - entry.stateTick);
    }
  }
  const present = new Set(everything(environment).map((entry) => entry.id));
  return {
    oldestEndedTicks: oldest,
    peakPopulation: peak,
    endedSeen: seen.size,
    cuts,
    leftAfterBoss: everything(environment).map((entry) => `${entry.kind}:${entry.state}:${entry.id}`),
    kindsEndedAndLeft: [...new Set([...seen].filter(([id]) => !present.has(id)).map(([, kind]) => kind))].sort(),
  };
}

/**
 * Ended objects each phase produces today, as a floor, so the rule cannot pass by a fight that stops
 * creating objects. The first phase of each boss places none: the Rootbound's Phase I moves hit with their own shapes.
 */
const EXERCISED: Readonly<Record<(typeof BIOME_BOSSES)[number]["boss"], readonly [number, number, number]>> = {
  rootbound: [0, 1, 1],
  "white-hart": [0, 1, 1],
};

describe("stage object lifetime rule (biome fights)", { timeout: 120_000 }, () => {
  const kindsEndedAndLeft = new Set<string>();
  describe.each(BIOME_BOSSES)("$boss in $stageId", ({ boss, stageId }) => {
    it.each([1, 2, 3] as const)(
      "phase %i: nothing ended outlives its fade, the population stays bounded and nothing outlives the boss",
      (phase) => {
        const report = fight(boss, stageId, phase);
        for (const kind of report.kindsEndedAndLeft) kindsEndedAndLeft.add(kind);
        // TEAR_LIFETIME_REPORT=1 prints what each fight did.
        if (process.env.TEAR_LIFETIME_REPORT === "1") console.log(`${boss} phase ${String(phase)}`, report);
        expect(report.oldestEndedTicks).toBeLessThan(ENVIRONMENT_FADE_TICKS);
        expect(report.peakPopulation).toBeLessThanOrEqual(POPULATION_BOUND);
        expect(report.endedSeen).toBeGreaterThanOrEqual(EXERCISED[boss][phase - 1] ?? 0);
        expect(report.leftAfterBoss).toEqual([]);
      },
    );
  });

  it("sees every registered object kind end and leave, and every kind declares how it ends", () => {
    for (const kind of ENVIRONMENT_OBJECT_KIND_IDS)
      expect(ENVIRONMENT_OBJECT_DEFINITIONS[kind].endsWhen.length, kind).toBeGreaterThan(0);
    expect([...kindsEndedAndLeft].sort()).toEqual([...ENVIRONMENT_OBJECT_KIND_IDS].sort());
  });
});
