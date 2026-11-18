/**
 * Rootbound Phase III, "Nothing Here Dies": the keeper opens with Regrowth, a channel that keeps attacking
 * while three links feed it, and then plays its strikes with Last Spring every few moves. Both are moves on the
 * shared table. Healing follows the one table `ROOTBOUND_HEALING`. Each test runs the real boss inside the real
 * Verdant environment.
 */
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import type { BossAttackRunnerState } from "../../src/gameplay/entities/boss-attack-runner";
import { ROOTBOUND_HEALING, ROOTBOUND_PHASE_THREE_CADENCE } from "../../src/gameplay/entities/enemy-types/rootbound";
import { ROOTBOUND_ARENA_WIDTH, ROOTBOUND_MOVES } from "../../src/gameplay/entities/enemy-types/rootbound-moves";
import { bindLiveRootboundActors } from "../../src/gameplay/environment/biome-actors/rootbound-actors";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { ROOTBOUND_REGROWTH_TIMING, type RootboundRegrowthState } from "../../src/gameplay/environment/regrowth-link";
import type { BossEncounterCleanupReason } from "../../src/gameplay/run/boss-encounter";
import { createBossArena } from "../../src/gameplay/training/arena-rules";
import { createEnemyHarness, createTestPlayer } from "./enemy-test-harness";

type Harness = ReturnType<typeof createEnemyHarness>;
type FinalBoss = InstanceType<Harness["types"]["Rootbound"]> & {
  moveState: BossAttackRunnerState;
  moveTick: number;
  phaseMarker: number;
  regrowthState: RootboundRegrowthState;
  regrowthCalled: boolean;
  phaseThreeEntryHp: number | null;
  lastSpringUseCount: number;
  exposed(): boolean;
  limitIncomingDamage(damage: number): number;
  bossBloomPattern(): string | null;
  cleanupEncounter(reason: BossEncounterCleanupReason): void;
};

const DT = 1 / 120;
const live = (object: Readonly<{ state: string }>) => object.state !== "destroyed" && object.state !== "expired";
const move = (id: string) => {
  const found = ROOTBOUND_MOVES.byId.get(id);
  if (found === undefined) throw new Error(`no move ${id}`);
  return found;
};

/** The boss entering Phase III inside its environment, with a player standing at `playerX` on the floor. */
function finale(options: Readonly<{ playerX?: number; arena?: boolean }> = {}) {
  const harness = createEnemyHarness([0.25, 0.75, 0.4, 0.6, 0.1, 0.9]);
  const boss = new harness.types.Rootbound(CONFIG.view.w / 2, CONFIG.world.groundY - CONFIG.boss.h / 2) as FinalBoss;
  const player = Object.assign(createTestPlayer({ x: options.playerX ?? 100 }), {
    hazardDmgMult: 1,
    invulnerable: false,
  });
  const arena = createBossArena("rootbound", CONFIG.view.w, CONFIG.view.h, CONFIG.world.groundY, 0.5);
  const platforms = options.arena === true && arena !== null ? arena.map((p) => ({ ...p })) : harness.platforms;
  const environment = createEnvironmentRuntime({ stageId: "verdant-sanctum", worldId: "rootbound-phase-three" });
  bindLiveRootboundActors(
    environment,
    () => player,
    () => [boss],
    () => "enemy:boss",
    CONFIG,
  );
  boss.introT = 0;
  boss.hp = boss.maxHp * (boss.phaseMarks[1] - 0.02);
  let tick = 0;
  const moves: string[] = [];
  const step = (seconds: number): void => {
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
    }
  };
  const until = (done: () => boolean, limit = 60): void => {
    for (let waited = 0; waited < limit / DT && !done(); waited += 1) step(DT);
    if (!done()) throw new Error("the finale never reached the expected state");
  };
  const links = () => environment.combatObjects().filter((object) => object.kind === "root-link" && live(object));
  const cut = (id: string): void => {
    environment.damageCombatObject(id, 100_000, `cut:${String(tick)}`, tick + 8);
  };
  const channeling = () => boss.regrowthState.phase === "channeling";
  return { boss, player, environment, platforms, moves, step, until, links, cut, channeling };
}

/** Into the channel, with the keeper `down` of its full health under the health it entered Phase III with. */
function channel(down: number, options?: Parameters<typeof finale>[0]) {
  const scene = finale(options);
  scene.until(scene.channeling);
  scene.boss.hp -= scene.boss.maxHp * down;
  return scene;
}

describe("Rootbound Phase III: Regrowth is a move that keeps attacking", () => {
  it("opens with Regrowth and nothing else; its links grow at the tell", () => {
    const scene = finale();
    scene.until(() => scene.moves.length > 0);
    expect(scene.moves[0]).toBe("regrowth");
    expect(scene.boss.regrowthCalled).toBe(true);
    scene.step(0.1);
    expect(scene.links()).toHaveLength(3);
    expect(scene.boss.regrowthState.phase).toBe("channeling");
  });

  it("runs the channel for exactly the move's tell and active stages", () => {
    const regrowth = move("regrowth");
    expect(regrowth.timing.tell + regrowth.timing.active).toBe(ROOTBOUND_REGROWTH_TIMING.channelTicks);
    expect(ROOTBOUND_ARENA_WIDTH).toBe(CONFIG.view.w);
  });

  it("sitting back is answered: a root wave hits a player in front of it on every repeat", () => {
    const scene = finale({ playerX: 420 });
    scene.until(scene.channeling);
    scene.step(4.2);
    const waves = scene.player.damage.filter((entry) => entry.amount === 16);
    // Three waves in the active stage (0, 1.1 and 2.2 s in); a player that never moves takes all three.
    expect(waves).toHaveLength(3);
  });

  it("a channel left alone heals the most the table allows, never above the Phase III entry health", () => {
    const scene = channel(0.15);
    const start = scene.boss.hp;
    scene.until(() => scene.boss.regrowthState.phase === "resolved");
    expect(scene.boss.regrowthState.interruptClassification).toBe("no-interrupt");
    expect((scene.boss.hp - start) / scene.boss.maxHp).toBeCloseTo(ROOTBOUND_HEALING.regrowthMax, 6);

    const shallow = channel(0.02);
    shallow.until(() => shallow.boss.regrowthState.phase === "resolved");
    expect(shallow.boss.hp).toBeCloseTo(shallow.boss.phaseThreeEntryHp ?? 0, 6);
  });

  it("one link cut heals for the two left, and the keeper still opens after the channel", () => {
    const scene = channel(0.15);
    const start = scene.boss.hp;
    const [first] = scene.links();
    if (first === undefined) throw new Error("no link to cut");
    scene.cut(first.id);
    scene.until(() => scene.boss.regrowthState.phase === "resolved");
    expect(scene.boss.regrowthState.interruptClassification).toBe("partial-interrupt");
    expect((scene.boss.hp - start) / scene.boss.maxHp).toBeCloseTo((ROOTBOUND_HEALING.regrowthMax * 2) / 3, 6);
    scene.until(() => scene.boss.exposed(), 3);
    expect(scene.boss.moveState.run?.attackId).toBe("regrowth");
  });

  it("all three links cut: no healing, and the keeper is opened at once", () => {
    const scene = channel(0.15);
    const start = scene.boss.hp;
    for (const link of scene.links()) scene.cut(link.id);
    scene.step(2 * DT);
    expect(scene.boss.regrowthState).toMatchObject({ phase: "resolved", interruptClassification: "full-interrupt" });
    expect(scene.boss.hp).toBe(start);
    expect(scene.boss.exposed()).toBe(true);
    expect(scene.boss.moveState.run).toBeNull();
  });

  it("hitting the keeper for the break share while it channels breaks it the same way", () => {
    const scene = channel(0.15);
    const start = scene.boss.hp;
    const dealt = scene.boss.limitIncomingDamage(scene.boss.maxHp * ROOTBOUND_HEALING.regrowthBreak);
    scene.boss.hp -= dealt;
    scene.step(2 * DT);
    expect(scene.boss.regrowthState.interruptClassification).toBe("full-interrupt");
    expect(scene.boss.hp).toBe(start - dealt);
    expect(scene.boss.exposed()).toBe(true);
  });
});

describe("Rootbound Phase III: Last Spring and the strikes", () => {
  it("follows Regrowth with Last Spring, then plays it after every few moves and never otherwise", () => {
    const scene = finale();
    const after = move("last-spring").choose.afterMoves ?? 0;
    expect(after).toBeGreaterThan(0);
    scene.until(() => scene.moves.length >= 2 + 2 * after, 90);
    const every = after + 1;
    scene.moves.slice(1).forEach((id, index) => {
      expect(id === "last-spring").toBe(index % every === 0);
    });
    expect(scene.moves.filter((id) => id === "regrowth")).toHaveLength(1);
  });

  it("warns for its whole tell: the Wells bloom and a perch starts to fracture as the tell begins", () => {
    const scene = finale({ arena: true });
    scene.until(() => scene.boss.moveState.run?.attackId === "last-spring");
    expect(scene.boss.bossBloomPattern()).toBe("last-spring");
    expect(scene.platforms.some((p) => p.arenaFractureRequest?.reason === "rootbound-last-spring")).toBe(true);
    expect(move("last-spring").timing.tell / 120).toBeGreaterThanOrEqual(2.3);
    expect(scene.boss.lastSpringUseCount).toBe(1);
  });

  it("strikes the floor across most of the arena once, for its authored damage", () => {
    const scene = finale({ playerX: 500 });
    scene.until(() => scene.boss.moveState.run?.attackId === "last-spring");
    const before = scene.player.damage.length;
    scene.until(() => scene.boss.moveState.run?.stage === "punish", 5);
    const springs = scene.player.damage.slice(before).filter((entry) => entry.amount === 24);
    expect(springs).toHaveLength(1);
  });

  it("is the fastest phase: the pause after each move is cut by the Phase III multiplier", () => {
    const scene = finale();
    scene.until(() => scene.moves.length >= 3, 30);
    const state = scene.boss.moveState;
    if (state.run !== null) scene.until(() => scene.boss.moveState.run === null, 5);
    const pause = scene.boss.moveState.readyTick - scene.boss.moveTick;
    expect(pause).toBe(Math.round(ROOTBOUND_MOVES.gap * ROOTBOUND_PHASE_THREE_CADENCE.gapMultiplier));
  });
});

describe("Rootbound Phase III: ending the encounter", () => {
  it("cleans every Phase III object across retry, defeat, victory and abandon, mid-channel", () => {
    const cases = [
      { label: "retry", bossReason: "retry", environmentReason: "retry" },
      { label: "defeat", bossReason: "death", environmentReason: "defeat" },
      { label: "victory", bossReason: "death", environmentReason: "boss-terminal" },
      { label: "abandon", bossReason: "exit", environmentReason: "abandon" },
    ] as const;
    for (const entry of cases) {
      const scene = channel(0.1);
      expect(scene.links()).toHaveLength(3);
      scene.boss.cleanupEncounter(entry.bossReason);
      scene.environment.clear(entry.environmentReason);
      expect(scene.environment.snapshot()).toMatchObject({ fields: [], combatObjects: [], routes: [] });
      expect(scene.boss).toMatchObject({
        cleanupReason: entry.bossReason,
        regrowthState: { phase: "resolved", resolvedHealFraction: 0 },
      });
      expect(scene.boss.moveState.run).toBeNull();
    }
  });
});
