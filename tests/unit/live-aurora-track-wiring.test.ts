import { describe, expect, it } from "vitest";

import { bindLiveAuroraTrackActors } from "../../src/app/live-aurora-track-wiring";
import type { AuroraTransportActor } from "../../src/gameplay/environment/aurora-track-runtime";

describe("live Aurora Track actor wiring", () => {
  it("projects player intent, thrown blade, enemy mass, boss charge, and deflected projectiles without copies", () => {
    let source: (() => readonly AuroraTransportActor[]) | undefined;
    const environment = {
      addFeature() { /* wiring registration is asserted by the runtime integration tests */ },
      setFeatureActorSource(_featureId: string, _slot: string, value: () => readonly AuroraTransportActor[]) { source = value; },
    };
    const input = { right: () => true, left: () => false };
    const player = { x: 10, y: 20, vx: 30, aiInput: input };
    const blade = { x: 30, y: 20, vx: 500, state: "flying" };
    const influence: unknown[] = [];
    const light = { x: 40, y: 20, vx: 50, weight: 1, cfg: { speed: 100 },
      onAuroraTrackInfluence(direction: -1 | 1, onTrack: boolean) { influence.push([direction, onTrack]); } };
    const heavy = { x: 50, y: 20, vx: 30, weight: 2, cfg: { speed: 80 } };
    const boss = { x: 60, y: 20, vx: 200, weight: 6, isBoss: true, auroraBossChargeActive: true, cfg: { speed: 70 } };
    const deflected = { x: 70, y: 20, vx: 600, dead: false, deflected: true };
    const hostile = { x: 80, y: 20, vx: -300, dead: false, deflected: false };
    bindLiveAuroraTrackActors(environment, () => player, () => blade, () => [light, heavy, boss],
      () => [deflected, hostile], (enemy) => enemy === light ? "enemy:light" : enemy === heavy ? "enemy:heavy" : "enemy:boss",
      (projectile) => projectile === deflected ? "projectile:deflected" : "projectile:hostile",
      { playerAcceleration: 5000, playerMaximumSpeed: 430, bladeAcceleration: 1900, bladeMaximumSpeed: 4600,
        projectileAcceleration: 640, projectileMaximumSpeed: 1900 });
    const actors = source?.() ?? [];
    expect(actors.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: "player", kind: "player" }, { id: "blade", kind: "thrown-blade" },
      { id: "enemy:light", kind: "light-enemy" }, { id: "enemy:heavy", kind: "heavy-enemy" },
      { id: "enemy:boss", kind: "boss-charge" }, { id: "projectile:deflected", kind: "deflected-projectile" },
    ]);
    expect(actors[0]?.intentX).toBe(1);
    if (actors[0] === undefined || actors[1] === undefined || actors[5] === undefined) throw new Error("missing Aurora adapters");
    actors[0].vx = 77; actors[1].vx = 888; actors[5].vx = 999;
    actors[2]?.onInfluenced?.(1, true);
    expect(player.vx).toBe(77);
    expect(blade.vx).toBe(888);
    expect(deflected.vx).toBe(999);
    expect(influence).toEqual([[1, true]]);
  });

  it("does not infer player intent from residual velocity or expose held blades", () => {
    let source: (() => readonly AuroraTransportActor[]) | undefined;
    const player = { x: 0, y: 0, vx: 300 };
    bindLiveAuroraTrackActors({
      addFeature() { /* wiring registration is asserted by the runtime integration tests */ },
      setFeatureActorSource(_featureId: string, _slot: string, value: () => readonly AuroraTransportActor[]) { source = value; },
    }, () => player,
      () => ({ x: 0, y: 0, vx: 0, state: "held" }), () => [], () => [], () => "enemy:none", () => "projectile:none",
      { playerAcceleration: 1, playerMaximumSpeed: 1, bladeAcceleration: 1, bladeMaximumSpeed: 1,
        projectileAcceleration: 1, projectileMaximumSpeed: 1 });
    expect(source?.()).toMatchObject([{ id: "player", intentX: 0 }]);
  });
});
