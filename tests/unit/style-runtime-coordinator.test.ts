import { describe, expect, it, vi } from "vitest";

import {
  applyStyleSnapshot,
  executeAchievementIntents,
  executeStyleIntents,
  snapshotStyle,
  splitParryProjectile,
} from "../../src/gameplay/scoring/style-runtime-coordinator";

describe("style runtime coordinator", () => {
  it("round-trips mutable style state and preserves semantic callback order", () => {
    const run = { combo: 1, comboTimer: 2, lastTrick: "a", mult: 1, rank: "", wavePeak: 1, runTime: 3 };
    const state = { ...snapshotStyle(run), combo: 9, rank: "S" };
    applyStyleSnapshot(run, state);
    expect(run.combo).toBe(9);
    const order: string[] = [];
    executeStyleIntents([
      { type: "tutorial-mark", kind: "parry" },
      { type: "rank-up", rank: "S" },
      { type: "profile-add", stat: "parries", amount: 1 },
      { type: "achievement-check" },
    ], {
      tutorialMark: () => order.push("tutorial"), ghostCapture: vi.fn(), playerTrick: vi.fn(),
      rankUp: () => order.push("rank"), musicRankChanged: vi.fn(), haptic: vi.fn(),
      profileAdd: () => order.push("profile"), dailyBump: vi.fn(), profileMax: vi.fn(),
      achievementCheck: () => order.push("check"),
    });
    expect(order).toEqual(["tutorial", "rank", "profile", "check"]);
    executeAchievementIntents([{ type: "profile-max", stat: "best", value: 2 }, { type: "achievement-check" }],
      (_stat, value) => order.push(`max:${String(value)}`), () => order.push("achievement"));
    expect(order.slice(-2)).toEqual(["max:2", "achievement"]);
  });

  it("caps the parent and creates two inherited split-parry shards", () => {
    const create = (_x: number, _y: number, vx: number, vy: number) => ({
      x: 0, y: 0, vx, vy, deflectDmg: 0, bounces: 0, owner: null as unknown,
      sourceEnemy: undefined as unknown, perfect: true, pierce: false, pierced: new Set<unknown>(), deflect: vi.fn(),
    });
    const parent = create(0, 0, 2_000, 0);
    parent.owner = { id: "owner" }; parent.sourceEnemy = { id: "source" }; parent.deflectDmg = 20; parent.pierce = true;
    const shards: typeof parent[] = [];
    splitParryProjectile(parent, 1_000, create, (shard) => shards.push(shard));
    expect(Math.hypot(parent.vx, parent.vy)).toBeCloseTo(1_300);
    expect(parent.deflectDmg).toBe(8);
    expect(shards).toHaveLength(2);
    expect(shards.every((shard) => shard.owner === parent.owner && shard.sourceEnemy === parent.sourceEnemy && shard.bounces === 2)).toBe(true);
    expect(shards.every((shard) => shard.pierce && shard.pierced.size === 0)).toBe(true);
  });
});
