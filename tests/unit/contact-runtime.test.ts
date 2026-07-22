import { describe, expect, it, vi } from "vitest";
import { resolveEnemyContact, resolveHostileBladeContact, type ContactPlayer } from "../../src/gameplay/combat/contact-runtime";

function player(outcome = "hit"): ContactPlayer {
  return { x: 10, y: 20, hw: 5, hh: 6, invulnerable: false, takeDamage: vi.fn(() => outcome) };
}

describe("combat contact runtime", () => {
  it("keeps contact attempts observable and applies multipliers in enemy order", () => {
    const p = player("absorbed"); const takeDamage = vi.fn(() => "absorbed"); p.takeDamage = takeDamage;
    const observed: string[] = []; const onAbsorbed = vi.fn();
    const hooks = { overlaps: () => true, segmentDistance: () => 99, onHit: vi.fn(),
      onAbsorbed, onHostileBladeResolved: vi.fn() };
    resolveEnemyContact([{ dead: false, dying: false, spawnT: 0, introT: 0, x: 1, y: 2, hw: 3, hh: 4,
      contactReach: 2, contactDmg: 7, chargeMult: 2, auraDmg: 3,
      onContactDamage: (result) => observed.push(result) }], p, hooks);
    expect(takeDamage).toHaveBeenCalledWith(42, 1, expect.any(Object));
    expect(observed).toEqual(["absorbed"]); expect(onAbsorbed).toHaveBeenCalledOnce();
  });

  it("returns the stolen blade after its one hostile connection", () => {
    const p = player(); const blade = { x: 0, y: 0, tipX: 20, tipY: 0, vx: 1, vy: 2,
      hostile: true, stolenBy: {}, state: "flying" };
    const hooks = { overlaps: () => false, segmentDistance: () => 3, onHit: vi.fn(),
      onAbsorbed: vi.fn(), onHostileBladeResolved: vi.fn() };
    expect(resolveHostileBladeContact(blade, p, p.hw, 18, hooks)).toBe(true);
    expect(blade).toMatchObject({ hostile: false, stolenBy: null, state: "returning" });
    expect(hooks.onHostileBladeResolved).toHaveBeenCalledOnce();
  });
});
