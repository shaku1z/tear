import { describe, expect, it } from "vitest";
import { projectLiveActorMechanics, projectLiveBehaviorMode, projectLiveBladeMechanics,
  projectLivePlayerMechanics, projectLiveProjectileMechanics } from "../../src/tearbench/live-observation-actors";
import { validateTearContract } from "../../src/tearbench/validation";

describe("live actor observation projection", () => {
  it("exposes authored Source mode to Class A/B but never Class C", () => {
    const source = { state: "idle", mode: "void" };
    expect(projectLiveBehaviorMode(source, "A")).toBe("void");
    expect(projectLiveBehaviorMode(source, "B")).toBe("void");
    expect(projectLiveBehaviorMode(source, "C")).toBeUndefined();
    expect(projectLiveBehaviorMode({ mode: "" }, "A")).toBeUndefined();
  });

  it("exposes finite Riftlock chamber mechanics to Class A/B but never Class C", () => {
    const riftlock = { riftChambers: 3, riftChamberCooldown: 0.75 };
    expect(projectLiveBladeMechanics(riftlock, "A")).toEqual({ chambers: 3, chamberCooldown: 0.75 });
    expect(projectLiveBladeMechanics(riftlock, "B")).toEqual({ chambers: 3, chamberCooldown: 0.75 });
    expect(projectLiveBladeMechanics(riftlock, "C")).toEqual({});
    expect(projectLiveBladeMechanics({ riftChambers: Number.NaN }, "A")).toEqual({});
  });

  it("projects finite avoidance geometry and timing only for A/B", () => {
    expect(projectLivePlayerMechanics({
      hw: 16, hh: 25, dashTimer: 0.2, dashCd: 0.4, iframe: 0.1, maxDashCharges: 2,
    }, "A")).toEqual({
      halfWidth: 16, halfHeight: 25, dashTimer: 0.2, dashCooldown: 0.4, iframe: 0.1, maxCharges: 2,
    });
    expect(projectLiveActorMechanics({
      hw: 20, hh: 30, contactReach: 12, contactDmg: 18, chargeMult: 1.5,
      auraDmg: 1.2, contactEnabled: false,
    }, "B")).toEqual({
      halfWidth: 20, halfHeight: 30, contactReach: 12, contactDamage: 18,
      chargeMult: 1.5, auraDmg: 1.2, contactEnabled: false,
    });
    expect(projectLivePlayerMechanics({ hw: 16 }, "C")).toEqual({});
    expect(projectLiveActorMechanics({ contactDmg: 18 }, "C")).toEqual({});
  });

  it("projects projectile counterplay without leaking it to Class C", () => {
    const projectile = { r: 11, dmg: 14, counterplay: "jump", unparryable: true };
    expect(projectLiveProjectileMechanics(projectile, "A")).toEqual({
      radius: 11, damage: 14, counterplay: "jump", unparryable: true,
    });
    expect(projectLiveProjectileMechanics(projectile, "C")).toEqual({});
    expect(projectLiveProjectileMechanics({ r: -1, dmg: Number.NaN }, "B")).toEqual({});
  });

  it("rejects negative or non-finite optional avoidance fields", () => {
    const observation = {
      format: "tear-contract", kind: "observation", schemaVersion: 1, tick: 1,
      observationClass: "structured-state",
      player: {
        x: 0, y: 0, vx: 0, vy: 0, hp: 100, maxHp: 100, facing: 1,
        grounded: true, dashCharges: 1, halfWidth: 16,
      },
      blade: { handX: 0, handY: 0, tipX: 1, tipY: 0, vx: 0, vy: 0, tipSpeed: 0, state: "held" },
      entities: [{
        id: "enemy", kind: "charger", x: 10, y: 0, vx: 0, vy: 0,
        halfWidth: 20, contactDamage: 12,
      }],
      run: { mode: "campaign", difficulty: "easy", weapon: "sword", stage: "grounds", wave: 1, score: 0, elapsedTicks: 1 },
      availableActions: ["move"],
    };
    expect(validateTearContract(observation).ok).toBe(true);
    const invalid = {
      ...observation,
      player: { ...observation.player, halfWidth: -1 },
      entities: [{ ...observation.entities[0], contactDamage: Number.POSITIVE_INFINITY }],
    };
    const result = validateTearContract(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.path === "player.halfWidth")).toBe(true);
      expect(result.issues.some((issue) => issue.path === "entities[0].contactDamage")).toBe(true);
    }
  });
});
