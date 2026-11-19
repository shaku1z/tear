/**
 * The body-contact rule: a boss body hurts only inside a declared move, and a body that blocks never leaves
 * the player stuck. The bosses built before the move table keep the contact they had, as rows.
 */
import { describe, expect, it } from "vitest";

import { resolveBodyBlocks, type BlockedPlayer, type ContactEnemy } from "../../src/gameplay/combat/contact-runtime";
import {
  BOSS_BODY_CONTACT,
  BOSS_BODY_CONTACT_OLD_ROWS,
  BOSS_BODY_PUSH_SPEED,
  bossBodyHurts,
  pushOutOfBossBody,
} from "../../src/gameplay/entities/boss-body-contact";
import { AUTHORED_BOSS_ROSTER } from "../../src/gameplay/run/content-director";
import { CONFIG } from "../../src/config/game-config";
import { createEnemyHarness } from "./enemy-test-harness";
import { createMirrorTestHarness } from "./mirror-test-harness";

const ARENA = 1600;
const DT = 1 / 120;

/** The bosses whose body may still hurt outside a declared move. A boss may leave this list; none may join. */
const OLD_ROWS_ALLOWED = ["warden", "aldric", "colossus", "echo", "source"];

function overlaps(ax: number, ay: number, ahw: number, ahh: number, bx: number, by: number, bhw: number, bhh: number) {
  return Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh;
}

function body(x: number, blocks = true): ContactEnemy & { x: number } {
  return {
    dead: false,
    dying: false,
    spawnT: 0,
    x,
    y: 500,
    hw: 59,
    hh: 59,
    contactReach: 0,
    contactDmg: 20,
    bodyBlocks: () => blocks,
  };
}

function player(x: number, overrides: Partial<BlockedPlayer> = {}): BlockedPlayer {
  return { x, vx: 0, y: 520, hw: 18, hh: 36, dashTimer: 0, ...overrides };
}

describe("the body-contact table", () => {
  it("has a row for every boss, and only the old bosses hurt outside a declared move", () => {
    expect(Object.keys(BOSS_BODY_CONTACT).sort()).toEqual(AUTHORED_BOSS_ROSTER.map((boss) => boss.id).sort());
    for (const id of BOSS_BODY_CONTACT_OLD_ROWS) expect(OLD_ROWS_ALLOWED, id).toContain(id);
    expect(BOSS_BODY_CONTACT.rootbound).toEqual({ hurtsIn: "never", blocks: true });
    expect(BOSS_BODY_CONTACT["white-hart"].hurtsIn).toBe("never");
  });

  it("keeps the Warden's contact: it hurts except during its staff strikes", () => {
    const hurts = (state: string) => bossBodyHurts(BOSS_BODY_CONTACT.warden, state);
    expect(["idle", "windup", "lungewind", "fakedeath"].map(hurts)).toEqual([true, true, true, true]);
    expect(["string", "batonlunge", "lunge"].map(hurts)).toEqual([false, false, false]);
  });

  it("keeps Aldric's contact: it hurts except during his cleaver moves", () => {
    const hurts = (state: string) => bossBodyHurts(BOSS_BODY_CONTACT.aldric, state);
    const safe = ["lunge", "overhead", "royalvault", "ascend", "thronefall"];
    const every = [
      ...safe,
      ...["idle", "windup", "recover", "charge", "chargewind", "overheadwind", "vaultwind"],
      ...["ascendwind", "thronewind", "crownfire", "fallen"],
    ];
    for (const state of every) expect(hurts(state), state).toBe(!safe.includes(state));
  });

  it("keeps the Source's contact by plane and breach, and the always-on bodies of Colossus and the Echo", () => {
    const hurts = (label: string) => bossBodyHurts(BOSS_BODY_CONTACT.source, label);
    expect(["front", "breach-drift"].map(hurts)).toEqual([true, true]);
    expect(["rear", "exposed", "breach-tell", "breach-recoil", "breach-drift-spent"].map(hurts)).toEqual(
      Array.from({ length: 5 }, () => false),
    );
    expect(bossBodyHurts(BOSS_BODY_CONTACT.colossus, null)).toBe(true);
    expect(bossBodyHurts(BOSS_BODY_CONTACT.echo, null)).toBe(true);
    expect(bossBodyHurts(BOSS_BODY_CONTACT.rootbound, "idle")).toBe(false);
  });
});

describe("a blocking body pushes the player out and never leaves them stuck", () => {
  it("pushes to the nearer side, one step at a time, and leaves a player outside it alone", () => {
    expect(pushOutOfBossBody({ x: 780, hw: 18 }, { x: 800, hw: 59 }, ARENA, 10)).toBe(770);
    expect(pushOutOfBossBody({ x: 820, hw: 18 }, { x: 800, hw: 59 }, ARENA, 10)).toBe(830);
    expect(pushOutOfBossBody({ x: 730, hw: 18 }, { x: 800, hw: 59 }, ARENA, 10)).toBe(723);
    expect(pushOutOfBossBody({ x: 600, hw: 18 }, { x: 800, hw: 59 }, ARENA, 10)).toBe(600);
  });

  it("moves a player with no room on the nearer side through to the open side", () => {
    // The body stands 60 px from the left wall: 1 px of floor between them, less than the player is wide.
    expect(pushOutOfBossBody({ x: 20, hw: 18 }, { x: 60, hw: 59 }, ARENA, 10)).toBe(30);
    expect(pushOutOfBossBody({ x: ARENA - 20, hw: 18 }, { x: ARENA - 60, hw: 59 }, ARENA, 10)).toBe(ARENA - 30);
    // A body as wide as the arena leaves no side: the player is left where they are.
    expect(pushOutOfBossBody({ x: 50, hw: 18 }, { x: 50, hw: 80 }, 100, 10)).toBe(50);
  });

  it("a player at the wall with the boss walking in ends on the open side, inside the arena, never held", () => {
    const boss = body(400);
    const walled = player(18);
    let overlapping = 0;
    let longest = 0;
    for (let tick = 0; tick < 120 * 6; tick += 1) {
      // The boss walks into the wall and stops with its edge on it.
      boss.x = Math.max(boss.hw, boss.x - 140 * DT);
      resolveBodyBlocks([boss], walled, ARENA, DT, overlaps);
      expect(walled.x).toBeGreaterThanOrEqual(walled.hw);
      expect(walled.x).toBeLessThanOrEqual(ARENA - walled.hw);
      overlapping = overlaps(walled.x, walled.y, walled.hw, walled.hh, boss.x, boss.y, boss.hw, boss.hh)
        ? overlapping + 1
        : 0;
      longest = Math.max(longest, overlapping);
    }
    expect(boss.x).toBe(boss.hw);
    expect(walled.x).toBeGreaterThanOrEqual(boss.x + boss.hw + walled.hw);
    // Crossing the whole body at the push speed is the longest the player is ever inside it.
    expect(longest).toBeLessThanOrEqual(Math.ceil((2 * (boss.hw + walled.hw)) / (BOSS_BODY_PUSH_SPEED * DT)) + 1);
  });

  it("stops a player walking into the body, lets a dash through, and ignores a body that does not block", () => {
    const walking = player(735, { vx: 430 });
    resolveBodyBlocks([body(800)], walking, ARENA, DT, overlaps);
    expect(walking).toMatchObject({ x: 727.5, vx: 0 });
    const dashing = player(780, { vx: 900, dashTimer: 0.1 });
    resolveBodyBlocks([body(800)], dashing, ARENA, DT, overlaps);
    expect(dashing).toMatchObject({ x: 780, vx: 900 });
    const through = player(780, { vx: 430 });
    resolveBodyBlocks([body(800, false)], through, ARENA, DT, overlaps);
    expect(through).toMatchObject({ x: 780, vx: 430 });
    // Above the body (a jump over it) there is no overlap, so nothing moves.
    const above = player(800, { y: 300 });
    resolveBodyBlocks([body(800)], above, ARENA, DT, overlaps);
    expect(above.x).toBe(800);
  });
});

describe("each boss answers contact by its row", () => {
  const harness = createEnemyHarness([0.25, 0.75, 0.4]);
  const at = [CONFIG.view.w / 2, CONFIG.world.groundY - 180] as const;

  it("the old bosses hurt where their rows say, read from what the body is doing", () => {
    const warden = new harness.types.Warden(...at);
    warden.state = "idle";
    expect(warden.contactDamageEnabled()).toBe(true);
    warden.state = "string";
    expect(warden.contactDamageEnabled()).toBe(false);
    const aldric = new harness.types.Aldric(...at);
    aldric.state = "windup";
    expect(aldric.contactDamageEnabled()).toBe(true);
    aldric.state = "thronefall";
    expect(aldric.contactDamageEnabled()).toBe(false);
    expect(new harness.types.Colossus(...at).contactDamageEnabled()).toBe(true);
    expect(createMirrorTestHarness().host.bodyContact).toBe(BOSS_BODY_CONTACT.echo);
    const source = new harness.types.Source(...at);
    source.depthPlane = "foreground";
    source.depthState = "idle";
    source.breachState = "follow";
    expect(source.contactDamageEnabled()).toBe(true);
    source.breachState = "drift";
    source.breachContactSpent = false;
    expect(source.contactDamageEnabled()).toBe(true);
    source.onContactDamage();
    expect(source.contactDamageEnabled()).toBe(false);
    source.breachState = "tell";
    expect(source.contactDamageEnabled()).toBe(false);
    source.breachState = "follow";
    source.depthPlane = "rear";
    expect(source.contactDamageEnabled()).toBe(false);
    for (const boss of [warden, aldric, source]) expect(boss.bodyBlocks()).toBe(false);
  });

  it("a boss on the move table never hurts by contact; the Rootbound blocks and the White Hart does not yet", () => {
    const rootbound = new harness.types.Rootbound(...at);
    const hart = new harness.types.WhiteHart(...at);
    expect(rootbound.contactDamageEnabled()).toBe(false);
    expect(hart.contactDamageEnabled()).toBe(false);
    expect(rootbound.bodyBlocks()).toBe(true);
    expect(hart.bodyBlocks()).toBe(false);
  });

  it("an ordinary enemy has no row and its body always hurts", () => {
    const grunt = new harness.types.Enemy(at[0], at[1], CONFIG.enemy);
    expect(grunt.bodyContact).toBeNull();
    expect(grunt.contactDamageEnabled()).toBe(true);
    expect(grunt.bodyBlocks()).toBe(false);
  });
});
