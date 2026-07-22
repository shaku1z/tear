import { describe, expect, it, vi } from "vitest";
import { bindLiveHammerMeteor } from "../../src/gameplay/combat/live-hammer-meteor";

describe("live hammer meteor", () => {
  it("scales the impact, breaks nearby enemies, and redirects to a distant cluster", () => {
    const nearby = { dead: false, x: 10, y: 0, radius: 10, weight: 1, vx: 0, vy: 0, stun: 0, applyBreak: vi.fn() };
    const distant = { dead: false, x: 260, y: 0, radius: 10, weight: 1, vx: 0, vy: 0, stun: 0, applyBreak: vi.fn() };
    const areaDamage = vi.fn(() => 0), ribbon = vi.fn();
    const impact = bindLiveHammerMeteor({
      blade: () => ({ vx: 1000, vy: 500, throwDmg: 100, throwOrigin: { x: -400, y: 0 } }),
      enemies: () => [nearby, distant], tuning: () => ({ meteorRadius: 160, meteorStun: 0.5, meteorBreak: 2 }),
      maximumThrowSpeed: () => 1200, redirect: () => true, slamColor: () => "#fff",
      bigShake: () => 20, bigZoom: () => 0.1, distance: Math.hypot,
      clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
      explode: vi.fn(), ribbon, shake: vi.fn(), zoom: vi.fn(), boom: vi.fn(), areaDamage,
    });
    impact(0, 0);
    expect(nearby.applyBreak).toHaveBeenCalledOnce();
    expect(nearby.stun).toBe(0.5);
    expect(areaDamage).toHaveBeenCalledTimes(2);
    expect(ribbon).toHaveBeenCalledWith(0, 0, 260, 0, "#fff");
  });
});
