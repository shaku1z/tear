/**
 * The new Rootbound's Phase I and Uproot (plans/active/VERDANT_PALE_REBUILD.md, 2.1), stepped one update per
 * tick: when each move is chosen, how long each part of it lasts, what it deals, when it can't be hit, and
 * that the phase change is a move of its own that ends the move in progress.
 */
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import type { EnemyProjectile } from "../../src/gameplay/entities/enemy-contracts";
import {
  ROOTBOUND_BODY,
  ROOTBOUND_CADENCE,
  ROOTBOUND_MOVES as M,
} from "../../src/gameplay/entities/enemy-types/rootbound-rebuild/rootbound-moves";
import { createEnemyHarness, createTestPlayer, type TestPlayer } from "./enemy-test-harness";

const DT = 1 / 120;
const GROUND = CONFIG.world.groundY;

function setup(bossX: number, player: Partial<TestPlayer> = {}) {
  const harness = createEnemyHarness();
  const boss = new harness.types.RootboundRebuild(bossX, GROUND - ROOTBOUND_BODY.h / 2);
  const target = createTestPlayer(player);
  const projectiles: EnemyProjectile[] = [];
  // It faces the player the way `rest()` does before it chooses, for the tests that start a move directly.
  boss.facing = Math.sign(target.x - bossX) || 1;
  const step = () => {
    boss.update(DT, harness.platforms, target, projectiles);
  };
  /** Updates until the boss is in `state`, and returns how many updates that took. */
  const until = (state: string, max = 2000) => {
    for (let tick = 1; tick <= max; tick += 1) {
      step();
      if (boss.state === state) return tick;
    }
    throw new Error(`never reached ${state}; ended in ${boss.state}`);
  };
  return { harness, boss, player: target, projectiles, step, until };
}

const levelAt = (x: number): Partial<TestPlayer> => ({ x, y: GROUND - 36 });

describe("the new Rootbound chooses its Phase I move from where the player is", () => {
  it("has the body its spawn lifts by: the old Rootbound's frame", () => {
    expect(ROOTBOUND_BODY.h).toBe(CONFIG.boss.h);
  });

  it("attacks first after its opening pause, with the vine when the player is level and in reach", () => {
    const { until } = setup(600, levelAt(850));
    expect(until("swingwind")).toBe(ROOTBOUND_CADENCE.firstAttack);
  });

  it("throws a seed pod at range, and burrows when the player is far", () => {
    const thrower = setup(300, levelAt(750));
    thrower.boss.attackT = 1;
    expect(thrower.until("throwwind")).toBe(1);
    const digger = setup(150, levelAt(1100));
    digger.boss.attackT = 1;
    expect(digger.until("sink")).toBe(1);
  });

  it("answers a player who crowds it with a Thorn Burst, between its attacks", () => {
    const { boss, until } = setup(600, levelAt(640));
    boss.attackT = 999;
    expect(until("swell")).toBe(M.thornBurst.track);
    expect(boss._perilMove).toBe("swell");
  });

  it("answers a player standing above it with a Canopy Vault to their platform", () => {
    const { boss, harness, until } = setup(560, { x: 800, y: 520 - 36 });
    boss.attackT = 999;
    const ledge = harness.platforms.find((p) => p.id === "ledge");
    expect(until("vaultwind")).toBe(M.canopyVault.track);
    expect(boss.vaultTarget).toBe(ledge);
  });
});

describe("each move's parts last their ticks and deal their damage", () => {
  it("Vine Swing: 54 to wind up, 22 to sweep, 42 to recover, 18 damage", () => {
    const { boss, player, until } = setup(600, levelAt(790));
    boss.startSwing();
    expect(until("swing")).toBe(M.vineSwing.windup);
    expect(until("swingrecover")).toBe(M.vineSwing.hit);
    expect(player.damage.map((hit) => hit.amount)).toEqual([M.vineSwing.damage]);
    const rested = setup(600, levelAt(790));
    rested.boss.startSwing();
    for (let tick = 0; tick < M.vineSwing.windup + M.vineSwing.hit + M.vineSwing.recover - 1; tick += 1) rested.step();
    expect(rested.boss.state).toBe("swingrecover");
    rested.step();
    expect(rested.boss.state).toBe("idle");
  });

  it("a perfect held-blade parry of the swing stops it landing and leaves it staggered and open", () => {
    const { boss, player, step } = setup(600, levelAt(790));
    boss.startSwing();
    for (let tick = 0; tick < M.vineSwing.windup; tick += 1) step();
    expect(boss.state).toBe("swing");
    expect(boss.batonStrike).toBe(1);
    expect(boss.parryBaton(true)).toBe(true);
    expect(boss.state).toBe("staggered");
    expect(boss.stateT).toBe(M.vineSwing.stagger);
    expect(boss.damageTakenMult()).toBe(ROOTBOUND_CADENCE.openDamageTaken);
    for (let tick = 0; tick < 10; tick += 1) step();
    expect(player.damage).toEqual([]);
    expect(boss.parryBaton(true)).toBe(false);
  });

  it("a touch that is not perfect does not parry, and the first touch of a sweep decides", () => {
    const { boss, player, step, until } = setup(600, levelAt(790));
    boss.startSwing();
    for (let tick = 0; tick < M.vineSwing.windup; tick += 1) step();
    expect(boss.parryBaton(false)).toBe(false);
    expect(boss.parryCd).toBe(M.vineSwing.parryCooldown);
    step();
    expect(boss.parryBaton(true)).toBe(false);
    expect(boss.state).toBe("swing");
    until("swingrecover");
    expect(player.damage.map((hit) => hit.amount)).toEqual([M.vineSwing.damage]);
    expect(M.vineSwing.parryCooldown).toBeGreaterThan(M.vineSwing.hit);
  });

  it("Seed Throw: a deflectable pod arcs to where the player stood", () => {
    const { boss, projectiles, until } = setup(300, levelAt(750));
    boss.startThrow();
    expect(until("throwrecover")).toBe(M.seedThrow.windup);
    expect(projectiles).toHaveLength(1);
    const pod = projectiles[0];
    expect(pod?.dmg).toBe(M.seedThrow.damage);
    expect(pod?.deflectDmg).toBe(M.seedThrow.deflectDamage);
  });

  it("Burrow: it can't be hit under the floor, and comes up under the player with a Surface Strike", () => {
    const { boss, player, until } = setup(300, levelAt(800));
    boss.startBurrow();
    expect(until("burrow")).toBe(M.burrow.sink);
    expect(boss.hidden).toBe(true);
    expect(boss.blocksDamage()).toBe(true);
    expect(boss.limitIncomingDamage(50)).toBe(0);
    expect(boss.bodyBlocks()).toBe(false);
    const under = until("rise");
    expect(under).toBeLessThanOrEqual(M.burrow.maxUnder);
    expect(Math.abs(boss.x - player.x)).toBeLessThan(6);
    expect(boss._perilMove).toBe("rise");
    expect(until("surface")).toBe(M.surfaceStrike.windup);
    expect(until("split")).toBe(M.surfaceStrike.hit);
    expect(player.damage.map((hit) => hit.amount)).toEqual([M.surfaceStrike.damage]);
    expect(boss.damageTakenMult()).toBe(ROOTBOUND_CADENCE.openDamageTaken);
  });

  it("Canopy Vault: 50 to wind up, 82 in the air, lands on the platform, hits and stresses it", () => {
    const { boss, harness, player, until } = setup(560, { x: 800, y: 520 - 36 });
    const ledge = harness.platforms.find((p) => p.id === "ledge");
    if (ledge === undefined) throw new Error("the harness has a ledge");
    boss.startVault(ledge, player);
    expect(until("vault")).toBe(M.canopyVault.windup);
    expect(until("vaultrecover")).toBe(M.canopyVault.flight);
    expect(boss.y + boss.hh).toBe(ledge.y);
    expect(player.damage.map((hit) => hit.amount)).toEqual([M.canopyVault.damage]);
    expect(ledge.stress).toBeGreaterThan(0);
  });

  it("Thorn Burst: 34 to swell, 12 of thorns, 16 damage, open in the recovery", () => {
    const { boss, player, until } = setup(600, levelAt(700));
    boss.startBurst();
    expect(until("burst")).toBe(M.thornBurst.windup);
    expect(until("burstrecover")).toBe(M.thornBurst.hit);
    expect(player.damage.map((hit) => hit.amount)).toEqual([M.thornBurst.damage]);
    expect(boss.damageTakenMult()).toBe(ROOTBOUND_CADENCE.openDamageTaken);
  });
});

describe("Uproot, the change into Phase II", () => {
  it("ends the move in progress on the tick its health crosses the mark, and strikes 138 ticks later", () => {
    const { boss, player, step, until } = setup(300, levelAt(800));
    boss.startThrow();
    step();
    expect(boss.state).toBe("throwwind");
    boss.hp = boss.maxHp * 0.6;
    step();
    expect(boss.state).toBe("uprootsink");
    expect(boss.enteredPhase).toBe(2);
    expect(boss.practicePhaseEntry()).toMatchObject({ phase: 2, targetPhase: 2, ready: false, stage: "transition" });
    const toUnder = until("uprootunder");
    expect(boss.limitIncomingDamage(50)).toBe(0);
    const toRise = until("rise");
    const toStrike = until("surface");
    expect(1 + toUnder + toRise + toStrike).toBe(M.uproot.sink + M.uproot.under + M.surfaceStrike.windup);
    expect(Math.abs(boss.x - player.x)).toBeLessThan(M.surfaceStrike.width / 2);
    expect(boss.practicePhaseEntry()).toMatchObject({ ready: true, stage: "combat" });
  });

  it("plays only once: crossing the second mark is Last Bloom, not another Uproot", () => {
    const { boss, step } = setup(600, levelAt(1300));
    boss.enteredPhase = 2;
    boss.hp = boss.maxHp * 0.2;
    step();
    expect(boss.enteredPhase).toBe(3);
    expect(boss.state).toBe("bloomsink");
  });
});

/** The keeper in Phase II, as Uproot leaves it: its Phase II health is where it entered. */
function phaseTwo(bossX: number, player: Partial<TestPlayer> = {}) {
  const fight = setup(bossX, player);
  fight.boss.enteredPhase = 2;
  fight.boss.hp = fight.boss.maxHp * 0.6;
  fight.boss.phaseTwoHp = fight.boss.hp;
  fight.boss.lastHp = fight.boss.hp;
  return fight;
}

describe("Phase II", () => {
  it("Second Swing follows the first: 32 to wind up, 22 to sweep, then the vine plants for 120", () => {
    const { boss, player, until } = phaseTwo(600, levelAt(790));
    boss.startSwing();
    until("swing");
    expect(until("swing2wind")).toBe(M.vineSwing.hit);
    expect(until("swing2")).toBe(M.secondSwing.windup);
    expect(until("planted")).toBe(M.secondSwing.hit);
    expect(player.damage.every((hit) => hit.amount === M.vineSwing.damage)).toBe(true);
    expect(until("idle")).toBe(M.rootSeam.planted);
  });

  it("the planted vine drives a Root Seam along the floor in the swing's direction, at 300 px/s", () => {
    const { boss, step, until } = phaseTwo(400, levelAt(560));
    boss.startSwing();
    until("planted");
    const seam = boss.zones.find((zone) => zone.kind === "seam");
    expect(seam).toMatchObject({ w: M.rootSeam.width, dmg: M.rootSeam.damage, dir: 1, on: true });
    const from = seam?.x ?? 0;
    for (let tick = 0; tick < 60; tick += 1) step();
    expect((seam?.x ?? 0) - from).toBeCloseTo(M.rootSeam.speed / 2, 5);
    expect(boss.zones).toContain(seam);
  });

  it("one blade hit on the vine's root cuts it: the seam ends that tick, and it staggers, open", () => {
    const { boss, until } = phaseTwo(400, levelAt(560));
    expect(boss.cutPoint()).toBeNull();
    boss.startSwing();
    until("planted");
    expect(boss.cutPoint()?.x).toBe(boss.rootX);
    expect(boss.cutPart()).toBe(true);
    expect(boss.zones).toEqual([]);
    expect(boss.state).toBe("staggered");
    expect(boss.stateT).toBe(M.vineSwing.stagger);
    expect(boss.damageTakenMult()).toBe(ROOTBOUND_CADENCE.openDamageTaken);
    expect(boss.cutPart()).toBe(false);
  });

  it("Bramble Rows: it kneels, open, while the floor's thirds warn and burn in turn, the player's first", () => {
    const { boss, player, step, until } = phaseTwo(200, levelAt(1100));
    boss.attackT = 1;
    expect(until("bramblewind")).toBe(1);
    expect(until("bramble")).toBe(M.brambleRows.windup);
    expect(boss.damageTakenMult()).toBe(ROOTBOUND_CADENCE.openDamageTaken);
    const [first] = boss.zones;
    expect(first).toMatchObject({ kind: "bramble", on: false, warn: true });
    expect(Math.abs((first?.x ?? 0) - player.x)).toBeLessThan((first?.w ?? 0) / 2);
    const seen = new Set(boss.zones);
    let lit = 0;
    while (boss.state === "bramble") {
      step();
      for (const zone of boss.zones) seen.add(zone);
      if (first?.on === true && boss.zones.includes(first)) lit += 1;
    }
    expect(lit).toBe(M.brambleRows.burn);
    expect(seen.size).toBe(M.brambleRows.rows);
    expect(boss.zones).toEqual([]);
    expect(boss.state).toBe("bramblerecover");
  });

  it("Mend: once the player stands back without a hit, it kneels and heals, never above its Phase II health", () => {
    const { boss, step, until } = phaseTwo(200, levelAt(1100));
    boss.attackT = 999;
    boss.burrowCd = 9999;
    boss.hp -= 100;
    boss.lastHp = boss.hp;
    // It walks at the player meanwhile, so the test starts it one tick short of the quiet it waits for.
    boss.quietT = M.mend.quiet - 1;
    expect(until("mendwind")).toBe(1);
    until("mend");
    const before = boss.hp;
    for (let tick = 0; tick < 120; tick += 1) step();
    expect(boss.hp - before).toBeCloseTo(boss.maxHp * M.mend.perSecond, 5);
    while (boss.state === "mend") step();
    expect(boss.hp).toBe(boss.phaseTwoHp);
  });

  it("any hit ends Mend, and it splits, open", () => {
    const { boss, step, until } = phaseTwo(200, levelAt(1100));
    boss.attackT = 999;
    boss.burrowCd = 9999;
    boss.hp -= 100;
    boss.lastHp = boss.hp;
    boss.quietT = M.mend.quiet - 1;
    until("mend");
    boss.hp -= 10;
    step();
    expect(boss.state).toBe("mendsplit");
    expect(boss.stateT).toBe(M.mend.broken);
    expect(boss.damageTakenMult()).toBe(ROOTBOUND_CADENCE.openDamageTaken);
  });

  it("Burrow surfaces twice, under the floor 60 ticks between the strikes", () => {
    const { boss, player, until } = phaseTwo(300, levelAt(800));
    boss.startBurrow();
    until("surface");
    until("resurface");
    expect(boss.hidden).toBe(true);
    expect(until("rise")).toBe(ROOTBOUND_CADENCE.resurfaceUnder[1]);
    until("split");
    expect(player.damage.map((hit) => hit.amount)).toEqual([M.surfaceStrike.damage, M.surfaceStrike.damage]);
  });
});

describe("Last Bloom, the change into Phase III", () => {
  it("sinks, goes under to the centre and comes up in a 180 px Thorn Burst ring; the phase change ends its zones", () => {
    const { boss, player, step, until } = phaseTwo(300, levelAt(560));
    boss.startSwing();
    until("planted");
    expect(boss.zones.length).toBeGreaterThan(0);
    boss.hp = boss.maxHp * 0.2;
    boss.noticePhase();
    step();
    expect(boss.state).toBe("bloomsink");
    expect(boss.zones).toEqual([]);
    expect(boss.practicePhaseEntry()).toMatchObject({ phase: 3, ready: false, stage: "transition" });
    const toUnder = until("bloomunder");
    const toRise = until("rise");
    expect(1 + toUnder).toBe(M.lastBloom.sink);
    expect(toRise).toBe(M.lastBloom.under);
    expect(boss.x).toBe(CONFIG.view.w / 2);
    player.x = boss.x + M.lastBloom.radius - 10;
    expect(until("burst")).toBe(M.surfaceStrike.windup);
    expect(boss.ringRadius).toBe(M.lastBloom.radius);
    until("burstrecover");
    expect(player.damage.at(-1)?.amount).toBe(M.thornBurst.damage);
  });
});
