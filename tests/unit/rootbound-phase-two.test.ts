/**
 * Rootbound Phase II, "The Garden Remembers": the keeper plays its move table and plants Grafts one at a
 * time. A Graft helps it while it stands; cutting one always opens the keeper. Healing follows the one
 * table `ROOTBOUND_HEALING`. Each test runs the real boss inside the real Verdant environment.
 */
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import type { BossAttackRunnerState } from "../../src/gameplay/entities/boss-attack-runner";
import { bossTells } from "../../src/gameplay/entities/boss-tells";
import {
  ROOTBOUND_GRAFTS,
  ROOTBOUND_GRAFT_ANCHOR_GEOMETRY,
  ROOTBOUND_HEALING,
} from "../../src/gameplay/entities/enemy-types/rootbound";
import { ROOTBOUND_MOVES } from "../../src/gameplay/entities/enemy-types/rootbound-moves";
import { bindLiveRootboundActors } from "../../src/gameplay/environment/biome-actors/rootbound-actors";
import { isBloomWellState } from "../../src/gameplay/environment/bloom-well";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import {
  GRAFT_ANCHOR_TYPES,
  isGraftAnchorState,
  type GraftAnchorPlacementRequest,
  type GraftAnchorState,
} from "../../src/gameplay/environment/graft-anchor";
import { isRootCageState } from "../../src/gameplay/environment/root-cage";
import type { BossEncounterCleanupReason } from "../../src/gameplay/run/boss-encounter";
import { createBossArena } from "../../src/gameplay/training/arena-rules";
import { createEnemyHarness, createTestPlayer } from "./enemy-test-harness";

type Harness = ReturnType<typeof createEnemyHarness>;
type GardenBoss = InstanceType<Harness["types"]["Rootbound"]> & {
  moveState: BossAttackRunnerState;
  moveTick: number;
  phaseMarker: number;
  graftRequests: readonly GraftAnchorPlacementRequest[];
  activeGraftTypes: readonly string[];
  graftDamageTakenMultiplier: number;
  graftGapMultiplier: number;
  healedFraction: number;
  bloomPatternIndex: number;
  exposed(): boolean;
  graftAnchorPlacements(): readonly GraftAnchorPlacementRequest[];
  rootCagePlacement(): unknown;
  limitIncomingDamage(damage: number): number;
  cleanupEncounter(reason: BossEncounterCleanupReason): void;
  tells(): readonly unknown[];
};

const DT = 1 / 120;
const ended = (object: Readonly<{ state: string }>) => object.state === "destroyed" || object.state === "expired";

/** The boss at the start of Phase II, inside its environment, with a player standing at `playerX`. */
function garden(options: Readonly<{ arena?: boolean; bare?: boolean; playerX?: number }> = {}) {
  const harness = createEnemyHarness([0.25, 0.75, 0.4, 0.6, 0.1, 0.9]);
  const boss = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as GardenBoss;
  const player = Object.assign(createTestPlayer({ x: options.playerX ?? 300 }), {
    hazardDmgMult: 1,
    invulnerable: false,
  });
  const arena = createBossArena("rootbound", CONFIG.view.w, CONFIG.view.h, CONFIG.world.groundY, 0.5);
  const platforms =
    options.arena === true && arena !== null
      ? arena
      : options.bare === true
        ? harness.platforms.filter((platform) => platform.oneway !== true)
        : harness.platforms;
  const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "rootbound-phase-two" });
  bindLiveRootboundActors(
    environment,
    () => player,
    () => [boss],
    () => "enemy:boss",
    CONFIG,
  );
  boss.introT = 0;
  boss.hp = boss.maxHp * (boss.phaseMarks[0] - 0.02);
  let tick = 0;
  const moves: string[] = [];
  const step = (seconds: number, each?: () => void): void => {
    for (let index = 0; index < Math.round(seconds / DT); index += 1) {
      tick += 1;
      const before = boss.moveState.run?.attackId ?? null;
      environment.step(
        tick + 8,
        DT,
        () => {
          boss.update(DT, platforms, player);
        },
        new Set(["enemy:boss"]),
      );
      boss.cinematicRequest = null;
      boss.cinematicT = 0;
      const now = boss.moveState.run?.attackId ?? null;
      if (now !== null && now !== before) moves.push(now);
      each?.();
    }
  };
  const grafts = (): readonly GraftAnchorState[] =>
    environment
      .combatObjects()
      .filter(isGraftAnchorState)
      .filter((graft) => !ended(graft));
  const cut = (id: string): void => {
    environment.damageCombatObject(id, 100_000, `cut:${String(tick)}`, tick + 8);
  };
  /** Runs until `done`, at most `limit` seconds. */
  const until = (done: () => boolean, limit = 60): void => {
    for (let waited = 0; waited < limit / DT && !done(); waited += 1) step(DT);
    if (!done()) throw new Error("the garden never reached the expected state");
  };
  return { boss, player, environment, platforms, moves, step, grafts, cut, until, tick: () => tick };
}

/** A grove of all three Grafts, each grown in. */
function fullGrove(options?: Parameters<typeof garden>[0]) {
  const scene = garden(options);
  scene.until(() => scene.boss.activeGraftTypes.length === GRAFT_ANCHOR_TYPES.length);
  return scene;
}

describe("Rootbound Phase II: planting", () => {
  it("opens the phase by kneeling to plant one Graft, and keeps playing its Phase I moves", () => {
    const scene = garden();
    scene.until(() => scene.grafts().length === 1);
    expect(scene.moves).toEqual(["plant-graft"]);
    expect(scene.boss.graftRequests.map((request) => request.graftType)).toEqual(["mercy"]);
    scene.step(30);
    const phaseOneMoves = ROOTBOUND_MOVES.attacks.filter((move) => move.phases.includes(1)).map((move) => move.id);
    expect(scene.moves.some((id) => phaseOneMoves.includes(id))).toBe(true);
    expect(scene.moves.every((id, index) => id !== scene.moves[index - 1])).toBe(true);
  });

  it("plants the three Grafts one at a time, in order, and never more than three", () => {
    const scene = fullGrove();
    expect(scene.grafts().map((graft) => graft.graftType)).toEqual([...GRAFT_ANCHOR_TYPES]);
    expect(scene.moves.filter((id) => id === "plant-graft")).toHaveLength(3);
    scene.step(20);
    expect(scene.grafts()).toHaveLength(3);
    expect(scene.moves.filter((id) => id === "plant-graft")).toHaveLength(3);
  });

  it("warns before it plants: the planting move shows a tell and deals no damage", () => {
    const scene = garden();
    let warned = 0;
    scene.until(() => {
      if (bossTells(scene.boss).some((tell) => tell.attackId === "plant-graft" && tell.stage === "warning"))
        warned += 1;
      return scene.grafts().length === 1;
    });
    expect(warned * DT).toBeGreaterThanOrEqual(0.8);
    expect(scene.player.damage).toEqual([]);
  });

  it("stands the Grafts apart on the floor of a bare arena, and on the platforms of its own arena", () => {
    const bare = fullGrove({ bare: true });
    const floor = bare.grafts().map((graft) => graft.geometry);
    expect(floor.map((geometry) => geometry.y + (geometry.h ?? 0))).toEqual([
      CONFIG.world.groundY,
      CONFIG.world.groundY,
      CONFIG.world.groundY,
    ]);
    expect(floor.map((geometry) => geometry.x + ROOTBOUND_GRAFT_ANCHOR_GEOMETRY.width / 2)).toEqual([
      CONFIG.view.w * 0.2,
      CONFIG.view.w * 0.5,
      CONFIG.view.w * 0.8,
    ]);
    const arena = fullGrove({ arena: true });
    const perches = arena.platforms.filter((platform) => platform.oneway === true && platform.floor !== true);
    if (perches.length === 0) return;
    const raised = arena.grafts().filter((graft) => graft.geometry.y + (graft.geometry.h ?? 0) < CONFIG.world.groundY);
    expect(raised.length).toBeGreaterThan(0);
    for (const graft of raised) {
      const foot = graft.geometry.y + (graft.geometry.h ?? 0);
      const centre = graft.geometry.x + (graft.geometry.w ?? 0) / 2;
      expect(perches.some((perch) => perch.y === foot && centre >= perch.x && centre <= perch.x + perch.w)).toBe(true);
    }
  });
});

describe("Rootbound Phase II: what a Graft does, and what cutting it does", () => {
  it("Bastion lowers the damage the keeper takes and Haste shortens the pause between its moves", () => {
    const scene = fullGrove();
    expect(scene.boss.graftDamageTakenMultiplier).toBe(0.65);
    expect(scene.boss.graftGapMultiplier).toBe(0.6);
    // The pause after a move that ends with all three Grafts standing.
    scene.until(() => scene.boss.moveState.run !== null);
    scene.until(() => scene.boss.moveState.run === null && !scene.boss.exposed());
    expect(scene.boss.limitIncomingDamage(100)).toBeCloseTo(65, 8);
    expect(scene.boss.moveState.readyTick - scene.boss.moveTick).toBeLessThanOrEqual(
      Math.round(ROOTBOUND_MOVES.gap * 0.6),
    );
  });

  it("cutting a Graft always opens the keeper, ends its move without a strike and ends the effect", () => {
    for (const type of GRAFT_ANCHOR_TYPES) {
      const scene = fullGrove();
      // Cut while a move is winding up, to show the move is cancelled.
      scene.until(() => scene.boss.moveState.run?.stage === "tell");
      const hitsBefore = scene.player.damage.length;
      const graft = scene.grafts().find((entry) => entry.graftType === type);
      if (graft === undefined) throw new Error(`no ${type} Graft`);
      scene.cut(graft.id);
      expect(scene.boss.exposed()).toBe(true);
      expect(scene.boss.moveState.run).toBeNull();
      expect(scene.boss.activeGraftTypes).not.toContain(type);
      expect(bossTells(scene.boss).some((tell) => tell.stage === "exposed")).toBe(true);
      // Exposed hits count 1.5x; Bastion, if it still stands, still takes its share.
      const bastion = type === "bastion" ? 1 : 0.65;
      expect(scene.boss.limitIncomingDamage(100)).toBeCloseTo(150 * bastion, 8);
      let open = 0;
      scene.step(ROOTBOUND_GRAFTS.cutExposed + 0.5, () => {
        if (scene.boss.exposed()) open += 1;
      });
      expect(open * DT).toBeCloseTo(ROOTBOUND_GRAFTS.cutExposed, 1);
      expect(scene.player.damage.length).toBe(hitsBefore);
    }
  });

  it("does not plant again for the regrow time after a cut, then plants the missing Graft", () => {
    const scene = fullGrove();
    const mercy = scene.grafts().find((entry) => entry.graftType === "mercy");
    if (mercy === undefined) throw new Error("no Mercy Graft");
    scene.cut(mercy.id);
    const planted = scene.moves.filter((id) => id === "plant-graft").length;
    scene.step(ROOTBOUND_GRAFTS.regrow - 0.2);
    expect(scene.moves.filter((id) => id === "plant-graft")).toHaveLength(planted);
    expect(scene.grafts().map((graft) => graft.graftType)).not.toContain("mercy");
    scene.until(() => scene.grafts().some((graft) => graft.graftType === "mercy"), 30);
    expect(scene.grafts()).toHaveLength(3);
  });

  it("cutting the last Graft of a full grove uproots the keeper for the long opening", () => {
    const scene = fullGrove();
    const [first, second, third] = scene.grafts();
    if (first === undefined || second === undefined || third === undefined) throw new Error("no full grove");
    scene.cut(first.id);
    scene.cut(second.id);
    scene.cut(third.id);
    let open = 0;
    scene.step(ROOTBOUND_GRAFTS.uprootedExposed + 0.5, () => {
      if (scene.boss.exposed()) open += 1;
    });
    expect(open * DT).toBeCloseTo(ROOTBOUND_GRAFTS.uprootedExposed, 1);
  });

  it("cutting the only Graft planted so far is an ordinary cut, not an uprooting", () => {
    const scene = garden();
    scene.until(() => scene.grafts().length === 1);
    const [only] = scene.grafts();
    if (only === undefined) throw new Error("no Graft");
    scene.cut(only.id);
    let open = 0;
    scene.step(ROOTBOUND_GRAFTS.uprootedExposed + 0.5, () => {
      if (scene.boss.exposed()) open += 1;
    });
    expect(open * DT).toBeCloseTo(ROOTBOUND_GRAFTS.cutExposed, 1);
  });
});

describe("Rootbound Phase II: healing is fair (ROOTBOUND_HEALING)", () => {
  it("sitting back: an unpressed keeper heals, slowly, and never more than the phase cap", () => {
    const scene = garden();
    const start = scene.boss.hp;
    scene.step(60);
    const healed = (scene.boss.hp - start) / scene.boss.maxHp;
    expect(healed).toBeGreaterThan(0);
    expect(healed).toBeLessThanOrEqual(ROOTBOUND_HEALING.phaseTwoCap + 1e-9);
    expect(scene.boss.healedFraction).toBeLessThanOrEqual(ROOTBOUND_HEALING.phaseTwoCap + 1e-9);
    expect(scene.boss.hp).toBeLessThanOrEqual(scene.boss.maxHp * scene.boss.phaseMarks[0]);
    // It did not stand still to do it: the sitting player was attacked throughout.
    expect(scene.moves.length).toBeGreaterThan(20);
  });

  it("any hit restarts the wait: a player who lands one hit every 2.5 s sees no healing at all", () => {
    const scene = garden();
    let sinceHit = 0,
      healed = 0,
      last = scene.boss.hp;
    scene.step(60, () => {
      if (scene.boss.hp > last) healed += scene.boss.hp - last;
      sinceHit += DT;
      if (sinceHit >= 2.5) {
        sinceHit = 0;
        scene.boss.hp -= scene.boss.limitIncomingDamage(1);
      }
      last = scene.boss.hp;
    });
    expect(healed).toBe(0);
    expect(scene.boss.healedFraction).toBe(0);
  });

  it("heals only while a Mercy Graft stands", () => {
    const scene = garden();
    scene.until(() => scene.boss.activeGraftTypes.includes("mercy"));
    const mercy = scene.grafts().find((entry) => entry.graftType === "mercy");
    if (mercy === undefined) throw new Error("no Mercy Graft");
    scene.boss.hp -= scene.boss.maxHp * 0.05;
    scene.cut(mercy.id);
    const start = scene.boss.hp;
    scene.step(ROOTBOUND_GRAFTS.regrow - 0.5);
    expect(scene.boss.hp).toBe(start);
  });

  it("waits the quiet time before the first heal, then heals at the table's rate", () => {
    const scene = garden();
    scene.until(() => scene.boss.activeGraftTypes.includes("mercy"));
    scene.boss.hp -= scene.boss.limitIncomingDamage(scene.boss.maxHp * 0.05);
    const start = scene.boss.hp;
    scene.step(ROOTBOUND_HEALING.quietSeconds - 0.1);
    expect(scene.boss.hp).toBe(start);
    scene.step(1.1);
    expect((scene.boss.hp - start) / scene.boss.maxHp).toBeCloseTo(ROOTBOUND_HEALING.perSecond, 3);
  });
});

describe("Rootbound Phase II: Root Cage and Bloom Shift are moves that place stage objects", () => {
  /** The next move must be `id`: every other move is cooling down. */
  function queue(boss: GardenBoss, id: string): void {
    const cooling = Object.fromEntries(
      ROOTBOUND_MOVES.attacks.filter((other) => other.id !== id).map((other) => [other.id, Number.MAX_SAFE_INTEGER]),
    );
    boss.moveState = {
      run: null,
      readyTick: boss.moveTick,
      lastAttackId: null,
      cooldownUntil: cooling,
      exposed: null,
    };
  }

  it("raises a cage around where the player stood; cutting a wall opens the keeper", () => {
    const scene = garden({ playerX: 700 });
    scene.until(() => scene.grafts().length === 1);
    scene.until(() => scene.boss.moveState.run === null);
    queue(scene.boss, "root-cage");
    scene.until(() => scene.environment.combatObjects().some(isRootCageState));
    const walls = scene.environment.combatObjects().filter(isRootCageState);
    expect(walls).toHaveLength(2);
    expect(walls.every((wall) => Math.abs(wall.geometry.x + (wall.geometry.w ?? 0) / 2 - 700) < 300)).toBe(true);
    expect(scene.boss.rootCagePlacement()).not.toBeNull();
    scene.until(() =>
      scene.environment.combatObjects().some((wall) => isRootCageState(wall) && wall.state === "active"),
    );
    const wall = scene.environment.combatObjects().find(isRootCageState);
    if (wall === undefined) throw new Error("no cage wall");
    scene.cut(wall.id);
    expect(scene.boss.exposed()).toBe(true);
    // The other wall stands until its time runs out; then the keeper may raise a cage again.
    scene.until(() => scene.boss.rootCagePlacement() === null, 4);
  });

  it("re-plants the Bloom Wells in the next pattern", () => {
    const scene = garden();
    scene.until(() => scene.grafts().length === 1);
    scene.until(() => scene.boss.moveState.run === null);
    const before = scene.boss.bloomPatternIndex;
    queue(scene.boss, "bloom-shift");
    scene.until(() => scene.boss.bloomPatternIndex !== before, 5);
    scene.step(0.5);
    expect(scene.environment.fields().some(isBloomWellState)).toBe(true);
  });
});

describe("Rootbound Phase II: leaving the phase, and cost", () => {
  it("takes its Grafts and cage with it into Phase III and on cleanup", () => {
    const scene = fullGrove();
    scene.boss.hp = scene.boss.maxHp * (scene.boss.phaseMarks[1] - 0.02);
    scene.step(0.1);
    expect(scene.boss.phaseMarker).toBe(3);
    expect(scene.boss.graftAnchorPlacements()).toEqual([]);
    expect(scene.grafts()).toEqual([]);
    expect(scene.boss.graftDamageTakenMultiplier).toBe(1);
    expect(scene.boss.exposed()).toBe(false);

    const other = fullGrove();
    other.boss.cleanupEncounter("death");
    other.step(0.1);
    expect(other.grafts()).toEqual([]);
    expect(other.boss.graftAnchorPlacements()).toEqual([]);
  });

  it("hands out one tell list per update instead of building a new one for every reader", () => {
    const scene = garden();
    scene.until(() => scene.boss.moveState.run?.stage === "tell");
    expect(scene.boss.tells()).toBe(scene.boss.tells());
    const before = scene.boss.tells();
    scene.step(DT);
    expect(scene.boss.tells()).not.toBe(before);
  });

  it("plays the same garden twice from the same start", () => {
    const run = () => {
      const scene = garden();
      scene.step(40);
      return { moves: scene.moves, hp: scene.boss.hp, x: scene.boss.x, hits: scene.player.damage.length };
    };
    expect(run()).toEqual(run());
  });
});
