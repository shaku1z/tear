import { describe, expect, it, vi } from "vitest";
import { CombatEntityRuntime, type CombatEntityRuntimeHooks, type LiveCombatEntity,
  type LiveCombatPlayer } from "../../src/gameplay/combat/combat-entity-runtime";
import type { CombatEntityIntent } from "../../src/gameplay/combat/combat-entity-contracts";

function entity(patch: Partial<LiveCombatEntity> = {}): LiveCombatEntity {
  return { kind: "charger", x: 0, y: 0, radius: 5, hp: 10, maxHp: 10, dead: false, stun: 0,
    vx: 0, vy: 0, r: 2, deflectDmg: 1, life: 1, hit: vi.fn(() => 1), deflect: vi.fn(),
    counterSweeper: vi.fn(() => true), shatterSweeper: vi.fn(), ...patch };
}
function harness(actors: LiveCombatEntity[] = [], shots: LiveCombatEntity[] = []) {
  const zones: { id?: string; x: number; y: number; r: number; life: number }[] = [], walls: never[] = [];
  const player: LiveCombatPlayer = { x: 0, y: 0, hw: 4, hh: 6, rootT: 0, hazardT: 0, slowMult: 1,
    shield: 0, maxShield: 2, hazardDmgMult: 1, dashTimer: 0, dashX: 0, dashY: 0, facing: 1,
    takeDamage: vi.fn(() => "hit") };
  const events: string[] = [];
  const hooks: CombatEntityRuntimeHooks = { actors: () => actors, projectiles: () => shots, player: () => player,
    slowZones: () => zones, setSlowZones: (next) => { zones.splice(0, zones.length, ...next); },
    walls: () => walls, setWalls: vi.fn(), platforms: () => [], ring: vi.fn(), burst: vi.fn(), explode: vi.fn(),
    fxFlash: vi.fn(), floater: vi.fn(), shake: vi.fn(), flash: vi.fn(), sound: vi.fn(),
    loseStyle: () => events.push("lose"), shieldAbsorbed: vi.fn(), addStyle: () => events.push("style"), dashDodge: vi.fn(),
    maxStat: vi.fn(), checkAchievements: vi.fn(), noteFirstDamage: vi.fn(), reflectedHit: vi.fn(), bossHit: vi.fn(),
    onKill: vi.fn(), areaDamage: vi.fn(() => 0) };
  return { runtime: new CombatEntityRuntime(hooks), hooks, player, events };
}

describe("combat entity runtime", () => {
  it("assigns stable live identities across actor and projectile snapshots", () => {
    const owner = entity(), shot = entity({ kind: "projectile", owner, family: "ordinaryProjectile" });
    const { runtime } = harness([owner], [shot]);
    const first = new Map<string, LiveCombatEntity>(), second = new Map<string, LiveCombatEntity>();
    const actorId = runtime.actorSnapshots(first)[0]?.id; const projectile = runtime.projectileSnapshots(first)[0];
    expect(runtime.actorSnapshots(second)[0]?.id).toBe(actorId); expect(runtime.projectileSnapshots(second)[0]?.id).toBe(projectile?.id);
    expect(projectile?.ownerId).toBe(actorId);
  });

  it("applies accepted projectile patches before recursively dispatching hit intents", () => {
    const shot = entity({ kind: "projectile", family: "ordinaryProjectile" }); const { runtime, events } = harness([], [shot]);
    const objects = new Map([["shot", shot]]); const intents: CombatEntityIntent[] = [{ type: "damage-player",
      damage: 2, sourceX: 1, sourceId: null, cause: "projectile", projectileId: "shot",
      acceptedProjectilePatch: { dead: true }, afterAttempt: [{ type: "add-style", style: "deflect" }],
      onHit: [{ type: "lose-style" }], onAbsorbed: [], onRejected: [] }];
    runtime.execute(intents, objects);
    expect(shot.dead).toBe(true); expect(events).toEqual(["style", "lose"]);
  });

  it("maps support links back onto the original live entities", () => {
    const target = entity({ x: 10 }), support = entity({ kind: "support", supportType: "priest", range: 100 });
    const { runtime } = harness([support, target]);
    runtime.updateSupports(0.1, { drMult: 0.5, dmgBuff: 2, speedBuff: 1, hasteBuff: 1,
      menderRate: 1, anchorDR: 0.5, anchorRegen: 1 }, "blue");
    expect(target.auraDR).toBe(0.5); expect(support.links).toEqual([target]);
  });
});
