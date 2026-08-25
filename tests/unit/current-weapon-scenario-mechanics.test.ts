import { describe, expect, it } from "vitest";
import { EnvelopeSequencer } from "../../src/domain/envelopes";
import { CONFIG } from "../../src/config/game-config";
import { getWeapon } from "../../src/gameplay/weapons";
import { WEAPON_IDS, type WeaponId } from "../../src/gameplay/weapon-selection";
import { runLiveCollisionPhase } from "../../src/gameplay/combat/live-collision-phase";
import { CANONICAL_ENGINEERING_SCENARIOS, createProductionCombatSimulation, createProductionReplayWorld } from "../../src/tearbench";
import { createProductionCombatPhases } from "../../src/tearbench/production-combat-phases";

interface Blade { x: number; y: number; angle: number; aimX: number; aimY: number; hookTarget: object | null;
  slingRadius: number; state: string; tipX: number; tipY: number; tipVX: number; tipVY: number;
  tipSpeed: number; throwDmg: number; throwId: number; swingId: number; vx: number; vy: number; wheelSpin: number;
  reversals: readonly { target: object; x: number; y: number }[]; throwBlade(): boolean;
  _releaseHook(player: never): string; _updateHookThrown(dt: number, player: never, platforms: readonly never[]): void;
  _updateWheelCut(dt: number, player: never, platforms: readonly never[]): void;
  _updateReversalState(): void; resolveReversal(target: object): "armed" | "reversal" | null }
interface Enemy { hp: number; stun: number; x: number; y: number; vx: number; vy: number; boundT: number }

function replayWithCharger(weaponId: WeaponId) {
  return createProductionReplayWorld({ seed: `current-weapon-${weaponId}`, weaponId,
    enemies: [{ id: "charger", x: 540, y: CONFIG.world.groundY - CONFIG.enemy.h / 2 }] });
}

describe("source-owned current weapon scenario mechanics", () => {
  it.each(WEAPON_IDS)("binds %s to its canonical scenario and production loadout", (weaponId) => {
    const scenario = CANONICAL_ENGINEERING_SCENARIOS.find((entry) => entry.tags.includes(weaponId) && entry.tags.includes("c40"));
    expect(scenario?.id).toContain(weaponId);
    expect(scenario?.start.weapon).toBe(weaponId);
    expect(getWeapon(weaponId).id).toBe(weaponId);
    expect(createProductionReplayWorld({ seed: `binding-${weaponId}`, weaponId }).run.weaponId).toBe(weaponId);
  });

  it.each(WEAPON_IDS)("executes the actual %s mechanic against production state", (weaponId) => {
    const replay = replayWithCharger(weaponId);
    const phases = createProductionCombatPhases(replay);
    const blade = replay.world.state.blade() as never as Blade;
    const enemy = replay.world.state.enemies()[0] as never as Enemy;
    const player = replay.world.state.player();
    if (weaponId === "sword") {
      blade.state = "held"; blade.angle = 0; blade.x = enemy.x - 70; blade.y = enemy.y;
      blade.tipX = enemy.x + 70; blade.tipY = enemy.y; blade.tipVX = 0; blade.tipVY = 2_000;
      blade.tipSpeed = 2_000; blade.vx = 0; blade.vy = 0; blade.swingId = 1;
      const before = enemy.hp;
      runLiveCollisionPhase(phases.collision, 1 / 120);
      expect(enemy.hp).toBeLessThan(before);
      const origin = blade.reversals[0];
      if (origin === undefined) throw new Error("source Sword contact did not arm a reversal");
      expect(origin.target).toBe(enemy);
      blade.tipX = origin.x + CONFIG.weapons.sword.reversalExitRadius + 2; blade.tipY = origin.y;
      blade._updateReversalState(); blade.swingId = 2; blade.tipX = origin.x + 60;
      blade.tipVX = 0; blade.tipVY = -2_000; blade.tipSpeed = 2_000;
      expect(blade.resolveReversal(enemy)).toBe("reversal");
    } else if (weaponId === "hammer") {
      blade.vx = 1_200; blade.vy = 900; blade.throwDmg = 80;
      const before = enemy.hp;
      phases.collision.lobExplode(enemy.x, enemy.y);
      expect(enemy.hp).toBeLessThan(before);
      expect(enemy.stun).toBeGreaterThan(0);
    } else if (weaponId === "greatsword") {
      blade.angle = Math.PI / 2; blade.x = 120; blade.y = 180;
      blade.tipX = blade.x; blade.tipY = blade.y + CONFIG.blade.length + 30;
      blade.aimX = 300; blade.aimY = 0; blade.tipSpeed = 900;
      const before = blade.angle;
      expect(blade.throwBlade()).toBe(true);
      blade._updateWheelCut(1 / 60, player as never, []);
      expect(blade.state).toBe("flying");
      expect(blade.angle).toBeGreaterThan(before);
      expect(Math.abs(blade.wheelSpin)).toBeGreaterThan(0);
    } else if (weaponId === "chainblade") {
      blade.state = "flying"; blade.x = enemy.x - 30; blade.y = enemy.y;
      blade.tipX = enemy.x; blade.tipY = enemy.y; blade.vx = 600; blade.vy = 0;
      blade.tipVX = 600; blade.tipVY = 0; blade.tipSpeed = 600; blade.throwDmg = 20; blade.throwId = 1;
      runLiveCollisionPhase(phases.collision, 1 / 120);
      expect(blade.state).toBe("hooked");
      expect(blade.hookTarget).toBe(enemy);
      expect(enemy.boundT).toBeGreaterThan(0);
      blade.aimX = CONFIG.weapons.chainblade.minRadius; blade.aimY = 0;
      blade._updateHookThrown(0.1, player as never, []);
      expect(Math.abs(enemy.vx) + Math.abs(enemy.vy)).toBeGreaterThan(0);
      expect(blade._releaseHook(player as never)).toBe("recalled");
      expect(blade.state).toBe("returning");
      expect(blade.hookTarget).toBeNull();
    } else {
      const sequence = new EnvelopeSequencer();
      const simulation = createProductionCombatSimulation<Record<string, unknown>>(replay, { snapshot: (tick) => ({ tick }) });
      simulation.simulationRuntime.reset(0);
      simulation.simulationRuntime.advanceOne([sequence.command(1, { type: "aim", turn: 0, magnitude: 1 } as const),
        sequence.command(1, { type: "weapon", intent: "primary", phase: "pressed" } as const)]);
      const projectiles = replay.world.state.projectiles() as never as { family?: string; weaponId?: string }[];
      expect(projectiles.some((shot) => shot.family === "weaponProjectile" && shot.weaponId === "riftlock")).toBe(true);
    }
  });
});
