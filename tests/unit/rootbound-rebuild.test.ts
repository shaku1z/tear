/**
 * The new Rootbound's three phases, Uproot and Last Bloom (plans/active/VERDANT_PALE_REBUILD.md, 2.1), stepped
 * one update per tick: when each move is chosen, how long each part of it lasts, what it deals, when it can't be
 * hit, and that each phase change is a move of its own that ends the move in progress.
 */
import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import type { EnemyProjectile } from "../../src/gameplay/entities/enemy-contracts";
import {
  ROOTBOUND_BODY,
  ROOTBOUND_CADENCE,
  ROOTBOUND_MOVES as M,
} from "../../src/gameplay/entities/enemy-types/rootbound-rebuild/rootbound-moves";
import {
  PATCH_WARN_TICKS,
  RootboundZones,
} from "../../src/gameplay/entities/enemy-types/rootbound-rebuild/rootbound-zones";
import { BOSS_TELL_MIN_LEAD_SECONDS } from "../../src/gameplay/entities/boss-tells";
import { aimedTellTicks as aimedTell, minAimedTellTicks } from "../../src/gameplay/entities/move-aim";
import { createEnemyHarness, createTestPlayer, type TestPlayer } from "./enemy-test-harness";

const DT = 1 / 120;
const aimedTellTicks = (ticks: number) => aimedTell(ticks, CONFIG.dash);
const MIN_AIMED_TELL_TICKS = minAimedTellTicks(CONFIG.dash);
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

  it("the swing's declared tell is the box its hit test reaches: built from the same vine, never drifting", () => {
    const check = (fight: ReturnType<typeof setup>, wind: string, swing: string) => {
      const { boss, step } = fight;
      while (boss.state !== wind) step();
      let told = boss.tells()[0];
      while (boss.state === wind) {
        told = boss.tells()[0];
        step();
      }
      if (told === undefined) throw new Error(`no tell declared in ${wind}`);
      expect(told).toMatchObject({ id: "vine-swing", mark: "box", damaging: true });
      const reach = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
      // Read the vine after each update of the sweep, where the hit test reads it (the last one ends the sweep).
      for (let sweeping = true; sweeping;) {
        step();
        sweeping = boss.state === swing;
        const from = boss.vineShoulder(),
          to = boss.vineTip();
        for (let i = 0; i <= 10; i += 1) {
          const x = from.x + ((to.x - from.x) * i) / 10,
            y = from.y + ((to.y - from.y) * i) / 10;
          reach.left = Math.min(reach.left, x);
          reach.right = Math.max(reach.right, x);
          reach.top = Math.min(reach.top, y);
          reach.bottom = Math.max(reach.bottom, y);
        }
      }
      // The swing strikes 10 px past its segment (beyond the player's half extent); the tell carries that pad.
      const pad = 10;
      expect(told.x - told.hw).toBeCloseTo(reach.left - pad, 0);
      expect(told.x + told.hw).toBeCloseTo(reach.right + pad, 0);
      expect(told.y + told.hh).toBeCloseTo(reach.bottom + pad, 0);
      // The sweep's first strike tick is a little past the coil's top, so the tell may reach at most 12 px higher.
      expect(reach.top - pad - (told.y - told.hh)).toBeGreaterThanOrEqual(0);
      expect(reach.top - pad - (told.y - told.hh)).toBeLessThan(12);
    };
    const first = setup(600, levelAt(790));
    first.boss.startSwing();
    check(first, "swingwind", "swing");
    const second = phaseTwo(600, levelAt(1000));
    second.boss.startSwing();
    while (second.boss.state !== "swing2wind") second.step();
    second.player.x = 1100;
    check(second, "swing2wind", "swing2");
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
  it("Second Swing follows the first: its aimed tell (84) to wind up, 22 to sweep, then the vine plants for 120", () => {
    const { boss, player, until } = phaseTwo(600, levelAt(790));
    boss.startSwing();
    until("swing");
    expect(until("swing2wind")).toBe(M.vineSwing.hit);
    expect(until("swing2")).toBe(aimedTellTicks(M.secondSwing.windup));
    expect(until("planted")).toBe(M.secondSwing.hit);
    expect(player.damage.every((hit) => hit.amount === M.vineSwing.damage)).toBe(true);
    expect(until("idle")).toBe(M.rootSeam.planted);
  });

  it("Second Swing aims once, at where the player is when its tell starts, and steps there through the tell", () => {
    const { boss, player, step, until } = phaseTwo(600, levelAt(700));
    boss.startSwing();
    until("swing");
    player.x = 1000; // the player dashed through the first sweep's reach and landed here
    until("swing2wind");
    const stand = 1000 - M.secondSwing.aim.reachShare * M.vineSwing.reach;
    const from = boss.x;
    player.x = 1200; // moving again once the tell has started does not move the aim
    while (boss.state === "swing2wind") step();
    expect(boss.x).toBeCloseTo(Math.min(stand, from + M.secondSwing.aim.maxStep), 5);
    expect(boss.facing).toBe(1);
  });

  it("Second Swing's tell is never under the shared minimum, Phase III's quicker windups included", () => {
    const { boss, until } = phaseTwo(600, levelAt(790));
    boss.enteredPhase = 3;
    boss.startSwing();
    until("swing");
    until("swing2wind");
    expect(until("swing2")).toBe(MIN_AIMED_TELL_TICKS);
    // The shared 0.45 s minimum, or the dash's 0.55 s cooldown and 0.15 s of invulnerability: the longer.
    expect(MIN_AIMED_TELL_TICKS).toBe(84);
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
    const third = CONFIG.view.w / M.brambleRows.rows;
    const isRow = (zone: { w?: number }) => zone.w === third;
    const seen = new Set(boss.zones.filter(isRow));
    let lit = 0;
    while (boss.state === "bramble") {
      step();
      for (const zone of boss.zones.filter(isRow)) seen.add(zone);
      if (first?.on === true && boss.zones.includes(first)) lit += 1;
    }
    expect(lit).toBe(M.brambleRows.burn);
    expect(seen.size).toBe(M.brambleRows.rows);
    // The rows are gone; each left a lingering patch at its centre.
    expect(boss.zones.filter(isRow)).toEqual([]);
    expect(boss.zones.map((zone) => zone.x).sort((a, b) => a - b)).toEqual([0.5, 1.5, 2.5].map((k) => k * third));
    expect(boss.state).toBe("bramblerecover");
  });

  it("Mend: once the player stands back without a hit, it kneels and heals, never above its Phase II health", () => {
    const { boss, step, until } = phaseTwo(200, levelAt(1100));
    boss.attackT = 999;
    boss.burrowCd = 9999;
    // A second and a half of healing short: one full second heals freely, and the cap stops it before its end.
    boss.hp -= boss.maxHp * M.mend.perSecond * 1.5;
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

describe("Lingering bramble: patches that stay", () => {
  const P = M.lingeringBramble;
  const field = (cap: number) => {
    const zones = new RootboundZones(CONFIG.view.w, GROUND);
    zones.patchCap = cap;
    const steps = (ticks: number) => {
      for (let tick = 0; tick < ticks; tick += 1) zones.step(DT);
    };
    return { zones, steps };
  };

  it("grows for its tell, never under the shared minimum, then stays live for its length, on the floor only", () => {
    const { zones, steps } = field(3);
    expect(PATCH_WARN_TICKS).toBeGreaterThanOrEqual(Math.ceil(BOSS_TELL_MIN_LEAD_SECONDS.normal * 120));
    zones.growPatch(500);
    const [patch] = zones.list;
    expect(patch).toMatchObject({ kind: "bramble", x: 500, w: P.width, dmg: P.damage, on: false, warn: true });
    expect(zones.tells()).toEqual([
      expect.objectContaining({ mark: "band", stage: "warning", x: 500, hw: P.width / 2, y: GROUND - 4, hh: 4 }),
    ]);
    steps(PATCH_WARN_TICKS - 1);
    expect(patch?.on).toBe(false);
    steps(1);
    expect(patch?.on).toBe(true);
    expect(zones.tells()[0]?.stage).toBe("active");
    steps(P.live - 1);
    expect(zones.list).toEqual([patch]);
    steps(1);
    expect(zones.list).toEqual([]);
  });

  it("at most the phase's cap at once, the oldest withering first", () => {
    expect(P.caps).toEqual([2, 4, 5]);
    const { zones } = field(3);
    for (const x of [100, 300, 500, 700]) zones.growPatch(x);
    expect(zones.list.map((zone) => zone.x)).toEqual([300, 500, 700]);
    const none = field(0);
    none.zones.growPatch(500);
    expect(none.zones.list).toEqual([]);
  });

  it("each Surface Strike leaves one where it came up, Phase I's Burrow included", () => {
    const { boss, step, until } = setup(300, levelAt(800));
    boss.startBurrow();
    until("surface");
    const at = boss.x;
    expect(boss.zones).toEqual([]);
    while (boss.state === "surface") step();
    expect(boss.zones).toEqual([expect.objectContaining({ kind: "bramble", x: at, w: P.width, on: false })]);
  });

  it("Last Bloom's ring leaves them around the centre as it bursts, never where the player stood on the phase tick", () => {
    const bloomPatches = (playerX: number) => {
      const { boss, player, step, until } = phaseTwo(300, levelAt(playerX));
      boss.hp = boss.maxHp * 0.2;
      boss.noticePhase();
      step();
      expect(boss.state).toBe("bloomsink");
      player.x = 100; // where it goes afterwards does not matter: the phase tick decides
      until("burst");
      return boss.zones.filter((zone) => zone.kind === "bramble").map((zone) => zone.x);
    };
    const centre = CONFIG.view.w / 2;
    const ring = P.bloomAt.map((k) => centre + k * M.lastBloom.radius);
    expect(bloomPatches(centre + 400)).toEqual(ring);
    // A player on a ring point at the phase tick: that patch does not grow, the others do.
    expect(bloomPatches(ring[0] ?? 0)).toEqual(ring.slice(1));
  });

  it("one that would overlap a patch renews it in place: still grown, a whole length ahead", () => {
    const { zones, steps } = field(3);
    zones.growPatch(500);
    steps(PATCH_WARN_TICKS + 600);
    zones.growPatch(500 + P.width / 2);
    expect(zones.patchCount).toBe(1);
    const [renewed] = zones.list;
    expect(renewed).toMatchObject({ x: 500, on: true });
    steps(P.live - 1);
    expect(zones.list).toEqual([renewed]);
    steps(1);
    expect(zones.list).toEqual([]);
  });

  it("the Root Seam seeds one every `seamEvery` px it runs", () => {
    const { zones, steps } = field(4);
    zones.startSeam(100, 1);
    steps(M.rootSeam.life);
    const seeded = Math.floor((M.rootSeam.speed * M.rootSeam.life) / 120 / P.seamEvery);
    expect(seeded).toBeGreaterThan(1);
    expect(zones.list.map((zone) => Math.round(zone.x))).toEqual(
      Array.from({ length: seeded }, (_, i) => 100 + (i + 1) * P.seamEvery),
    );
  });

  it("the planted vine leaves one at its root when its time runs out, and none when it is cut", () => {
    const run = (cut: boolean) => {
      const { boss, until } = phaseTwo(400, levelAt(560));
      boss.startSwing();
      until("planted");
      const root = boss.rootX;
      if (cut) boss.cutPart();
      else until("idle");
      return { root, patches: boss.zones.filter((zone) => zone.kind === "bramble").map((zone) => zone.x) };
    };
    const timedOut = run(false);
    expect(timedOut.patches).toContain(timedOut.root);
    expect(run(true).patches).toEqual([]);
  });

  it("they all end with the phase", () => {
    const { boss, step } = phaseTwo(300, levelAt(560));
    boss.field.patchCap = P.caps[1];
    boss.field.growPatch(800);
    step();
    expect(boss.zones.some((zone) => zone.kind === "bramble")).toBe(true);
    boss.hp = boss.maxHp * 0.2;
    boss.noticePhase();
    step();
    expect(boss.zones).toEqual([]);
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

/** The keeper in Phase III, as Last Bloom leaves it. */
function phaseThree(bossX: number, player: Partial<TestPlayer> = {}) {
  const fight = phaseTwo(bossX, player);
  fight.boss.enteredPhase = 3;
  fight.boss.hp = fight.boss.maxHp * 0.2;
  fight.boss.lastHp = fight.boss.hp;
  return fight;
}

describe("Phase III", () => {
  it("is faster: a 112-tick attack cooldown, a 160 px/s walk and every windup ×0.85", () => {
    const { boss, step, until } = phaseThree(300, levelAt(1100));
    boss.attackT = 999;
    boss.burrowCd = 9999;
    step();
    expect(boss.state).toBe("walk");
    expect(Math.abs(boss.vx)).toBeCloseTo(ROOTBOUND_CADENCE.walkSpeeds[2], 5);
    boss.startSwing();
    expect(boss.attackT).toBe(ROOTBOUND_CADENCE.attackCooldowns[2]);
    expect(until("swing")).toBe(Math.round(M.vineSwing.windup * 0.85));
  });

  it("Burrow surfaces three times, under the floor 48 ticks between the strikes", () => {
    const { boss, player, until } = phaseThree(300, levelAt(800));
    boss.startBurrow();
    until("surface");
    until("resurface");
    expect(until("rise")).toBe(ROOTBOUND_CADENCE.resurfaceUnder[2]);
    until("resurface");
    until("split");
    expect(player.damage.map((hit) => hit.amount)).toEqual(Array(3).fill(M.surfaceStrike.damage));
  });

  it("Spring Surge: 102 up and over to the centre, root waves both ways and five pods, then open for 66", () => {
    const { boss, projectiles, step, until } = phaseThree(300, levelAt(1100));
    boss.attackT = 1;
    expect(until("springwind")).toBe(1);
    expect(boss.springCd).toBe(M.springSurge.cooldown);
    for (let tick = 0; tick < M.springSurge.windup / 2; tick += 1) step();
    expect(boss.y).toBeLessThan(GROUND - ROOTBOUND_BODY.h / 2 - M.springSurge.rise / 2);
    expect(until("springslam")).toBe(M.springSurge.windup / 2);
    expect(boss.x).toBe(CONFIG.view.w / 2);
    const waves = projectiles.filter((shot) => shot.family === "groundShock");
    expect(waves.map((wave) => Math.sign(wave.vx)).sort()).toEqual([-1, 1]);
    expect(waves.every((wave) => wave.dmg === M.springSurge.waveDamage)).toBe(true);
    const pods = projectiles.filter((shot) => shot.family !== "groundShock");
    expect(pods).toHaveLength(M.springSurge.pods);
    expect(pods.every((pod) => pod.dmg === M.springSurge.podDamage && pod.deflectDmg > 0)).toBe(true);
    expect(boss.damageTakenMult()).toBe(ROOTBOUND_CADENCE.openDamageTaken);
    expect(until("idle")).toBe(M.springSurge.recover);
  });

  it("only from Phase III", () => {
    const { boss, step } = phaseTwo(300, levelAt(1100));
    boss.attackT = 1;
    boss.brambleCd = 9999;
    step();
    expect(boss.state).not.toBe("springwind");
  });
});
