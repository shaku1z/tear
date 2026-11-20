/**
 * The Rootbinder and its roots, on the real enemies, the real stage-object layer and the live actor binding.
 * The rules are ROOTBINDER_RULES and the phases in rootbinder-runtime.ts; this file is what holds the game
 * to them: who is rooted, what a root does to an ally, what a cut does, and when the Rootbinder is open.
 */
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { ROOTBINDER_RULES } from "../../src/gameplay/entities/rootbinder-runtime";
import { bindLiveBloomWellActors } from "../../src/gameplay/environment/biome-actors/bloom-well-actors";
import { bindLiveRootbinderActors } from "../../src/gameplay/environment/biome-actors/rootbinder-actors";
import { BLOOM_WELL_TIMING } from "../../src/gameplay/environment/bloom-well";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { activateStageEnvironment } from "../../src/gameplay/environment/stage-environment-activation";
import {
  createEnemyHarness,
  createTestPlayer,
  STANDARD_ACTOR_FACTORIES,
  type BehaviorActor,
} from "./enemy-test-harness";

const DT = 1 / ROOTBINDER_RULES.ticksPerSecond;
const FLOOR = CONFIG.world.groundY;
type Harness = ReturnType<typeof createEnemyHarness>;
type Binder = InstanceType<Harness["types"]["Rootbinder"]>;
type ActorKind = keyof typeof STANDARD_ACTOR_FACTORIES;

interface SceneOptions {
  /** Where each Rootbinder stands. */
  readonly binders?: readonly number[];
  /** Kind and place of each ally. */
  readonly allies?: readonly (readonly [ActorKind, number])[];
  readonly playerX?: number;
  /** Activates the Verdant stage's Bloom Wells and lets them lift. */
  readonly wells?: boolean;
  /** Allies that run their own update (the others stand where they were put). */
  readonly alliesAct?: boolean;
}

function scene(options: SceneOptions = {}) {
  const harness = createEnemyHarness([0.5]);
  const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "roots" });
  if (options.wells === true) activateStageEnvironment(environment, "verdant-sanctum", 0, "new-run", 800);
  const binders = (options.binders ?? [400]).map(
    (x) => new harness.types.Rootbinder(x, FLOOR - CONFIG.rootbinder.h / 2),
  );
  const allies = (options.allies ?? []).map(([kind, x]) => {
    const actor = STANDARD_ACTOR_FACTORIES[kind](harness.types);
    actor.x = x;
    actor.spawnT = 0;
    return actor;
  });
  for (const binder of binders) binder.spawnT = 0;
  const all: BehaviorActor[] = [...(binders as unknown as BehaviorActor[]), ...allies];
  const ids = new Map(all.map((enemy, index) => [enemy as object, `enemy:${String(index)}`]));
  const idOf = (enemy: object): string => ids.get(enemy) ?? "enemy:unknown";
  const player = createTestPlayer({ x: options.playerX ?? 1400 });
  // No player is bound: these tests are about roots on allies; the snare has its own file.
  bindLiveRootbinderActors(
    environment,
    () => null,
    () => all,
    idOf,
  );
  if (options.wells === true)
    bindLiveBloomWellActors(
      environment,
      () => player,
      () => all,
      idOf,
    );
  let tick = 0;
  const step = (count = 1): void => {
    for (let index = 0; index < count; index += 1) {
      environment.step(tick, DT, () => undefined);
      for (const binder of binders) {
        if (binder.dead) continue;
        if (binder.stun > 0) binder.tickTimers(DT);
        else binder.update(DT, harness.platforms, player);
      }
      for (const ally of allies) {
        if (options.alliesAct !== true || ally.stun > 0) ally.tickTimers(DT);
        else ally.update(DT, harness.platforms, player, []);
      }
      tick += 1;
    }
  };
  const roots = () => environment.combatObjects().filter((object) => object.kind === "root-link");
  const liveRoots = () => roots().filter((object) => object.state === "active");
  /** Runs until every Rootbinder has planted and had one tick to root. */
  const plant = (): void => {
    for (let guard = 0; guard < 1_200 && binders.some((binder) => binder.rootPhase !== "planted"); guard += 1) step();
    step();
  };
  const cut = (id: string): void => {
    environment.damageCombatObject(id, Number.MAX_SAFE_INTEGER, `cut:${id}:${String(tick)}`, tick);
  };
  const binder = binders[0];
  if (binder === undefined) throw new Error("a scene needs a Rootbinder");
  return { environment, binder, binders, allies, player, step, plant, cut, roots, liveRoots, idOf, tick: () => tick };
}

function allyAt(setup: ReturnType<typeof scene>, index: number): BehaviorActor {
  const ally = setup.allies[index];
  if (ally === undefined) throw new Error(`no ally ${String(index)}`);
  return ally;
}

function wellCentre(setup: ReturnType<typeof scene>): number {
  const well = setup.environment.fields()[0];
  if (well === undefined) throw new Error("the Verdant stage has no Bloom Well");
  return well.geometry.x + (well.geometry.w ?? 0) / 2;
}

describe("where a Rootbinder goes", () => {
  it("backs away from a player who is close, never walks at them, and plants once it has room", () => {
    const setup = scene({ binders: [700], playerX: 620 });
    const binder: Binder = setup.binder;
    let closest = Math.abs(setup.player.x - binder.x);
    for (let tick = 0; tick < 1_200 && binder.rootPhase !== "planted"; tick += 1) {
      const before = Math.abs(setup.player.x - binder.x);
      setup.step();
      closest = Math.min(closest, Math.abs(setup.player.x - binder.x));
      expect(Math.abs(setup.player.x - binder.x)).toBeGreaterThanOrEqual(before - 0.001);
    }
    expect(binder.rootPhase).toBe("planted");
    expect(closest).toBe(80);
    expect(Math.abs(setup.player.x - binder.x)).toBeGreaterThanOrEqual(ROOTBINDER_RULES.standoff);
  });

  it("plants where it stands after the longest walk when the player will not give it room", () => {
    const setup = scene({ binders: [60], playerX: 200 });
    for (let tick = 0; tick < ROOTBINDER_RULES.maxWalkTicks + ROOTBINDER_RULES.plantWindupTicks + 2; tick += 1)
      setup.step();
    expect(setup.binder.rootPhase).toBe("planted");
  });

  it("holds its ground and does not walk at a player who is far away", () => {
    const setup = scene({ binders: [400], playerX: 1400 });
    const start = setup.binder.x;
    setup.plant();
    expect(setup.binder.x).toBe(start);
  });
});

describe("who a planted Rootbinder roots", () => {
  it("roots the nearest allies in reach, up to its limit, and leaves the rest free", () => {
    const setup = scene({
      allies: [
        ["charger", 700],
        ["charger", 500],
        ["charger", 600],
        ["charger", 400 + ROOTBINDER_RULES.linkReach + 40],
      ],
    });
    setup.plant();
    expect(setup.liveRoots()).toHaveLength(ROOTBINDER_RULES.maxLinks);
    expect(setup.allies.map((ally) => ally.rooted)).toEqual([false, true, true, false]);
    expect(setup.binder.rootLinkIds).toHaveLength(ROOTBINDER_RULES.maxLinks);
  });

  it("never roots an enemy that flies, a boss, or one that says it is not rootable, whatever its kind", () => {
    for (const kind of Object.keys(STANDARD_ACTOR_FACTORIES) as ActorKind[]) {
      const setup = scene({ allies: [[kind, 460]] });
      const ally = allyAt(setup, 0);
      ally.y = Math.min(ally.y, FLOOR - ally.hh);
      setup.plant();
      const expected = !ally.flies && !ally.isBoss && ally.rootable;
      expect(ally.rooted, kind).toBe(expected);
      expect(setup.liveRoots(), kind).toHaveLength(expected ? 1 : 0);
    }
  });

  it("does not root an ally another Rootbinder already holds", () => {
    const setup = scene({ binders: [400, 600], allies: [["charger", 500]] });
    setup.plant();
    setup.step(4);
    expect(setup.liveRoots()).toHaveLength(1);
    expect(allyAt(setup, 0).rooted).toBe(true);
  });
});

describe("what a root does to an ally", () => {
  function flung(rooted: boolean): number {
    const setup = scene({ allies: [["charger", rooted ? 500 : 400 + ROOTBINDER_RULES.linkReach + 60]] });
    setup.plant();
    const ally = allyAt(setup, 0);
    expect(ally.rooted).toBe(rooted);
    ally.vx = 0;
    ally.vy = 0;
    ally.hit(10, 1, 0);
    return Math.hypot(ally.vx, ally.vy);
  }

  it("holds it against a hit that flings a free one, and takes nothing off the damage", () => {
    expect(flung(true)).toBe(0);
    expect(flung(false)).toBeGreaterThan(0);
    const setup = scene({ allies: [["charger", 500]] });
    setup.plant();
    const ally = allyAt(setup, 0);
    const before = ally.hp;
    expect(ally.hit(10, 1, 0)).toBe(10);
    expect(before - ally.hp).toBe(10);
  });

  function rise(withBinder: boolean): number {
    const probe = scene({ wells: true });
    const centre = wellCentre(probe);
    const setup = scene({
      wells: true,
      binders: [withBinder ? centre - 200 : centre - ROOTBINDER_RULES.linkReach - 400],
      allies: [["charger", centre]],
      alliesAct: true,
      playerX: centre + 1_200,
    });
    const ally = allyAt(setup, 0);
    setup.plant();
    expect(ally.rooted).toBe(withBinder);
    const start = FLOOR - ally.hh;
    let top = start;
    for (let tick = 0; tick < BLOOM_WELL_TIMING.totalTicks; tick += 1) {
      setup.step();
      ally.x = centre;
      top = Math.min(top, ally.y);
    }
    return start - top;
  }

  it("keeps it on the floor through a Bloom Well that lifts a free one", () => {
    expect(rise(true)).toBe(0);
    expect(rise(false)).toBeGreaterThan(100);
  });
});

describe("what a cut does", () => {
  it("frees the ally and staggers it, and the planting grows no new root in its place", () => {
    const setup = scene({
      allies: [
        ["charger", 500],
        ["charger", 600],
        ["charger", 700],
      ],
    });
    setup.plant();
    const [first] = setup.liveRoots();
    if (first === undefined) throw new Error("no root to cut");
    setup.cut(first.id);
    setup.step();
    const freed = setup.allies.find((ally) => setup.idOf(ally) === first.targetId);
    expect(freed?.rooted).toBe(false);
    expect(freed?.anchored).toBe(false);
    expect(freed?.stun).toBeGreaterThan(ROOTBINDER_RULES.freedStaggerSeconds - 2 * DT);
    expect(freed?.vy).toBe(0);
    setup.step(240);
    expect(setup.binder.rootPhase).toBe("planted");
    expect(setup.liveRoots()).toHaveLength(1);
    expect(allyAt(setup, 2).rooted).toBe(false);
  });

  it("throws the ally up when it stands in an active Bloom Well", () => {
    const probe = scene({ wells: true });
    const centre = wellCentre(probe);
    const setup = scene({
      wells: true,
      binders: [centre - 200],
      allies: [["charger", centre]],
      alliesAct: true,
      playerX: centre + 1_200,
    });
    const ally = allyAt(setup, 0);
    const wellState = () => setup.environment.fields()[0]?.state;
    setup.plant();
    // Wait for a Well cycle that begins with the ally already rooted, so it is standing when the root is cut.
    for (let guard = 0; guard < BLOOM_WELL_TIMING.totalTicks && wellState() === "active"; guard += 1) setup.step();
    for (let guard = 0; guard < BLOOM_WELL_TIMING.totalTicks && wellState() !== "active"; guard += 1) {
      setup.step();
      ally.x = centre;
    }
    expect(wellState()).toBe("active");
    expect(ally.rooted).toBe(true);
    expect(ally.vy).toBe(0);
    const [root] = setup.liveRoots();
    if (root === undefined) throw new Error("no root to cut");
    setup.cut(root.id);
    setup.environment.step(setup.tick(), DT, () => undefined);
    expect(ally.vy).toBe(-ROOTBINDER_RULES.cutLaunchSpeed);
    expect(ally.onGround).toBe(false);
  });

  it("uproots the Rootbinder once every root is cut; it recovers, plants again and roots again", () => {
    const setup = scene({
      allies: [
        ["charger", 500],
        ["charger", 600],
      ],
    });
    setup.plant();
    for (const root of setup.liveRoots()) setup.cut(root.id);
    setup.step();
    expect(setup.binder.rootPhase).toBe("uprooted");
    expect(setup.allies.map((ally) => ally.rooted)).toEqual([false, false]);
    setup.step(ROOTBINDER_RULES.uprootedTicks);
    expect(setup.binder.rootPhase).toBe("recover");
    expect(setup.liveRoots()).toHaveLength(0);
    for (const ally of setup.allies) ally.stun = 0;
    setup.plant();
    expect(setup.liveRoots()).toHaveLength(2);
  });
});

describe("when a Rootbinder is open", () => {
  it("takes more damage while planted, and one heavy hit uproots it and lets its roots go", () => {
    const walking = scene();
    expect(walking.binder.hit(10, 0, 0)).toBe(10);
    const setup = scene({ allies: [["charger", 500]] });
    setup.plant();
    expect(setup.binder.hit(10, 0, 0)).toBeCloseTo(10 * ROOTBINDER_RULES.plantedDamageTaken, 6);
    expect(setup.binder.rootPhase).toBe("planted");
    const heavy = (CONFIG.rootbinder.hp * ROOTBINDER_RULES.uprootHitShare) / ROOTBINDER_RULES.plantedDamageTaken;
    setup.binder.hitCd = 0;
    setup.binder.hit(heavy + 0.01, 0, 0);
    expect(setup.binder.rootPhase).toBe("uprooted");
    setup.environment.step(setup.tick(), DT, () => undefined);
    expect(setup.liveRoots()).toHaveLength(0);
    expect(allyAt(setup, 0).rooted).toBe(false);
    expect(allyAt(setup, 0).stun).toBe(0);
  });

  it("has a body that hurts only while it walks", () => {
    const setup = scene();
    expect(setup.binder.contactDamageEnabled()).toBe(true);
    const seen = new Set<string>();
    for (let tick = 0; tick < 400; tick += 1) {
      setup.step();
      seen.add(setup.binder.rootPhase);
      expect(setup.binder.contactDamageEnabled()).toBe(setup.binder.rootPhase === "walk");
    }
    expect([...seen].sort()).toEqual(["plant-windup", "planted", "walk"]);
  });
});

describe("when a root ends without a cut", () => {
  it("lets go of an ally that dies or is carried out of range, and the Rootbinder stays planted", () => {
    const setup = scene({
      allies: [
        ["charger", 500],
        ["charger", 600],
      ],
    });
    setup.plant();
    allyAt(setup, 0).dead = true;
    allyAt(setup, 1).x = 400 + ROOTBINDER_RULES.linkMaxLength + 20;
    setup.step();
    expect(setup.liveRoots()).toHaveLength(0);
    expect(setup.binder.rootPhase).toBe("planted");
    expect(allyAt(setup, 1).rooted).toBe(false);
  });

  it("frees every ally when the Rootbinder dies", () => {
    const setup = scene({
      allies: [
        ["charger", 500],
        ["charger", 600],
      ],
    });
    setup.plant();
    setup.binder.dead = true;
    setup.step();
    expect(setup.liveRoots()).toHaveLength(0);
    expect(setup.allies.map((ally) => [ally.rooted, ally.anchored, ally.stun])).toEqual([
      [false, false, 0],
      [false, false, 0],
    ]);
  });
});
