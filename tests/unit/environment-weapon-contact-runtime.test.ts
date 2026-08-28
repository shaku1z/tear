import { describe, expect, it } from "vitest";

import { resolveHeldEnvironmentWeaponContacts } from "../../src/gameplay/combat/environment-weapon-contact-runtime";
import { EnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import type { EnvironmentCombatObjectState } from "../../src/gameplay/environment/environment-contracts";
import { getWeapon } from "../../src/gameplay/weapons";

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
});
