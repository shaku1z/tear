import { describe, expect, it } from "vitest";

import type {
  CombatActorState, ProjectileCollisionTuning, ProjectilePlayerState, ProjectileState,
} from "../../src/gameplay/combat/combat-entity-contracts";
import { planProjectileCollisions } from "../../src/gameplay/combat/projectile-collision-resolver";

describe("weapon projectile collision", () => {
  it("routes a visible player-owned Razor Round to the weapon hit contract instead of the player", () => {
    const projectile = {
      id: "razor:1", x: 100, y: 100, vx: 1450, vy: 0, r: 6, dead: false,
      family: "weaponProjectile", ownerId: null, sourceEnemyId: null,
      deflected: false, perfect: false, deflectDmg: 0, pierce: false, piercedIds: new Set(),
      unparryable: true, dmg: 42, root: 0, curve: false, curved: false, curveT: 0,
      bomb: false, mud: false, mine: false, armed: false, armT: 0, life: 1,
      playerOwned: true, weaponId: "riftlock", attackId: 9, throwId: 3,
      remote: true, secondary: false,
    } satisfies ProjectileState;
    const enemy = {
      id: "enemy:1", kind: "melee", x: 104, y: 100, radius: 18, hp: 100, maxHp: 100,
      dead: false, dying: false, spawnT: 0, stun: 0,
    } satisfies CombatActorState;
    const player = {
      x: 100, y: 100, hw: 16, hh: 25, dashTimer: 0, dashX: 0, dashY: 0, facing: 1,
    } satisfies ProjectilePlayerState;
    const tuning = {
      projectileDamage: 10, projectileSpeed: 500, deflectBoost: 1, deflectDamageMultiplier: 1,
      runDamageMultiplier: 1, phaseStep: false, parryStun: false, aegisParry: false,
      sparkCount: 4, deflectedColor: "#fff", rootColor: "#fff", shakeBig: 1, shakeSmall: 0.5,
      achievementTracking: false,
    } satisfies ProjectileCollisionTuning;

    const intents = planProjectileCollisions({ projectiles: [projectile], actors: [enemy], player, tuning });
    expect(intents).toContainEqual(expect.objectContaining({
      type: "weapon-projectile-hit", enemyId: enemy.id, damage: 42,
      weaponId: "riftlock", attackId: 9, throwId: 3, remote: true,
    }));
    expect(intents.some((intent) => intent.type === "damage-player")).toBe(false);
    expect(intents.some((intent) => intent.type === "projectile-patch" && intent.patch.dead === true)).toBe(true);
  });
});
