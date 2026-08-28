import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { clamp, len, lerp, lerpAngle } from "../../src/domain/geometry";
import { resolveHeldEnvironmentWeaponContacts } from "../../src/gameplay/combat/environment-weapon-contact-runtime";
import { createBlade } from "../../src/gameplay/entities/blade";
import { EnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import type { EnvironmentCombatObjectState } from "../../src/gameplay/environment/environment-contracts";
import { getWeapon } from "../../src/gameplay/weapons";

function makeBlade(weaponId: "sword" | "hammer") {
  const config = structuredClone(CONFIG);
  const Blade = createBlade({
    CLOCK: { sim: 0 }, CONFIG: config,
    Input: { touchAim: false, stickAim: null, locked: false, mouseX: 0, mouseY: 0, tetherHeld: false,
      consumeDelta: () => ({ x: 0, y: 0 }) },
    presentation: { draw: () => undefined }, clamp, len, lerp, lerpAngle,
  });
  const blade = new Blade(), weapon = getWeapon(weaponId);
  blade.weapon = weapon; blade.model = weapon.model; weapon.onReset?.({ blade });
  return { blade, config };
}

function object(id: string, kind: "root-link" | "graft-anchor", geometry: EnvironmentCombatObjectState["geometry"], integrity = 1): EnvironmentCombatObjectState {
  return Object.freeze({
    id, factoryId: kind, kind, ownerId: "rootbound", targetId: null, geometry,
    integrity, maxIntegrity: integrity, counterplayTags: kind === "graft-anchor"
      ? Object.freeze(["cut", "break", "projectile-cut"])
      : Object.freeze(["cut", "break"]),
    procEligible: false, damageDedupeId: `${id}:damage`, state: "active", stateTick: 1, cleanupReason: null,
  });
}

describe("environment weapon contact runtime", () => {
  it("routes Sword cuts through object capabilities without creating Reversal or Threadcut targets", () => {
    const environment = new EnvironmentRuntime("verdant-sanctum", "sword-contact");
    environment.addCombatObject(object("network-link", "root-link", {
      x: 20, y: 0, points: Object.freeze([{ x: 20, y: -20 }, { x: 20, y: 20 }]),
    }));
    environment.addCombatObject(object("graft", "graft-anchor", { x: 35, y: -8, w: 16, h: 16 }, 40));
    environment.addCombatObject(object("regrowth-link", "root-link", {
      x: 60, y: 0, points: Object.freeze([{ x: 60, y: -20 }, { x: 60, y: 20 }]),
    }));
    const reversals: object[] = [];
    const threadcutRoute: object[] = [];
    const blade = {
      state: "held", weapon: getWeapon("sword"), swingId: 7,
      damageAt: () => 20, reversals, threadcutRoute,
    };

    const result = resolveHeldEnvironmentWeaponContacts({
      environment, blade, segment: { x1: 0, y1: 0, x2: 80, y2: 0, pad: 4 }, tick: 12,
    });

    expect(result).toMatchObject({ considered: 3, accepted: 3, damaged: 3, destroyed: 2 });
    expect(environment.combatObjects().map(({ id, integrity, state }) => ({ id, integrity, state }))).toEqual([
      { id: "network-link", integrity: 0, state: "destroyed" },
      { id: "graft", integrity: 20, state: "active" },
      { id: "regrowth-link", integrity: 0, state: "destroyed" },
    ]);
    expect(reversals).toEqual([]);
    expect(threadcutRoute).toEqual([]);
  });

  it("uses Hammer Break pressure without changing its Meteor flight and catch route", () => {
    const environment = new EnvironmentRuntime("verdant-sanctum", "hammer-contact");
    environment.addCombatObject(object("network-link", "root-link", {
      x: 20, y: 0, points: Object.freeze([{ x: 20, y: -20 }, { x: 20, y: 20 }]),
    }));
    environment.addCombatObject(object("graft", "graft-anchor", { x: 35, y: -8, w: 16, h: 16 }, 60));
    environment.addCombatObject(object("regrowth-link", "root-link", {
      x: 60, y: 0, points: Object.freeze([{ x: 60, y: -20 }, { x: 60, y: 20 }]),
    }));
    const { blade, config } = makeBlade("hammer");
    blade.state = "held"; blade.x = 0; blade.y = 0; blade.tipX = 80; blade.tipY = 0;
    blade.angle = 0; blade.vx = 900; blade.vy = 0; blade.tipVX = 0; blade.tipVY = 1800; blade.tipSpeed = 1800;
    blade.swingId = 4; blade.aimX = 300; blade.aimY = -120;

    const contact = resolveHeldEnvironmentWeaponContacts({
      environment, blade, segment: blade.heldCollisionSegment({} as never), tick: 20,
    });
    expect(contact).toMatchObject({ accepted: 3, damaged: 3, destroyed: 2 });
    expect(environment.combatObjects().find(({ id }) => id === "graft")?.integrity).toBeLessThan(60);
    expect(blade.state).toBe("held");

    const player = { x: 0, y: 0, vx: 0, vy: 0, facing: 1 };
    expect(blade.throwBlade()).toBe(true);
    expect(blade.state).toBe("flying");
    expect(blade.throwGravity).toBe(config.weapons.hammer.meteorGravity);
    const vy = blade.vy;
    blade._updateBallisticThrown(1 / 120, player, []);
    expect(blade.vy).toBeGreaterThan(vy);
    blade.state = "embedded"; blade.x = 10; blade.y = 0;
    expect(blade.tryRecall(player)).toBe("recalled");
    expect(blade.state).toBe("returning");
    blade.x = 0; blade.y = 0;
    blade._updateBallisticThrown(1 / 120, player, []);
    expect(blade.state).toBe("held");
  });
});
