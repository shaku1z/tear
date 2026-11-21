/**
 * The held blade against a boss part it cuts (the new Rootbound's planted vine,
 * plans/active/VERDANT_PALE_REBUILD.md, 2.1 "Cutting"): one swing through the part cuts it and does not hit the
 * body; with no part to cut, the swing reaches the body as before.
 */
import { describe, expect, it, vi } from "vitest";

import type { HeldBladeCollisionInput } from "../../src/gameplay/combat/held-blade-collision-contracts";
import { resolveHeldBladeEnemyCollisions } from "../../src/gameplay/combat/held-blade-collision-runtime";

function input(enemy: Record<string, unknown>, damage = 10): HeldBladeCollisionInput {
  const effects = { burst: vi.fn(), ring: vi.fn(), floater: vi.fn(), style: vi.fn(), sound: vi.fn(), shake: vi.fn() };
  return {
    player: {},
    blade: { damageAt: () => damage, tipVX: 1, tipVY: 0, x: 0, y: 0, tipX: 20, tipY: 0, tipSpeed: 100 },
    enemies: [enemy],
    run: { mult: 1 },
    segment: { x1: 0, y1: 0, x2: 20, y2: 0, pad: 2 },
    tuning: { style: { styleDamage: 0, styleDamageMax: 0 }, hitStop: { small: 0.05 }, colors: {}, juice: {} },
    effects,
    hooks: {},
    currentHitStop: 0,
    distance: Math.hypot,
    segmentCircle: () => true,
    weaponSegmentContact: () => false,
    segmentPointDistance: () => ({ px: 0, py: 0, dist: 0 }),
  } as unknown as HeldBladeCollisionInput;
}

function boss(cut: { x: number; y: number; r: number } | null) {
  return {
    x: 10,
    y: 0,
    radius: 30,
    dead: false,
    dying: false,
    introT: 0,
    hitCd: 0,
    color: "green",
    cutPoint: () => cut,
    cutPart: vi.fn(() => cut !== null),
    // A body hit would go through `blocks` first; the cut never reaches it.
    blocks: vi.fn(() => true),
  };
}

describe("held blade collisions", () => {
  it("cuts a boss part the swing crosses, and does not reach the body", () => {
    const foe = boss({ x: 10, y: 0, r: 12 });
    const result = resolveHeldBladeEnemyCollisions(input(foe));
    expect(foe.cutPart).toHaveBeenCalledOnce();
    expect(foe.blocks).not.toHaveBeenCalled();
    expect(foe.hitCd).toBeGreaterThan(0);
    expect(result.hitStop).toBeGreaterThan(0);
  });

  it("reaches the body as before when the boss has no part to cut", () => {
    const foe = boss(null);
    resolveHeldBladeEnemyCollisions(input(foe));
    expect(foe.cutPart).not.toHaveBeenCalled();
    expect(foe.blocks).toHaveBeenCalled();
  });

  it("does not cut with a blade too slow to do damage", () => {
    const foe = boss({ x: 10, y: 0, r: 12 });
    resolveHeldBladeEnemyCollisions(input(foe, 0));
    expect(foe.cutPart).not.toHaveBeenCalled();
  });
});
