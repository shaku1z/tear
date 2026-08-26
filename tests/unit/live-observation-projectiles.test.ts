import { describe, expect, it } from "vitest";
import { projectLiveProjectiles } from "../../src/tearbench/live-observation-projectiles";

const player = { x: 0, y: 0, vx: 0, vy: 0, hp: 100, maxHp: 100, facing: 1, onGround: true, dashCharges: 1 };
const projectile = (overrides: Record<string, unknown> = {}) => ({
  x: 100, y: 50, vx: -20, vy: 0, dead: false, family: "ordinaryProjectile", counterplay: "deflect", ...overrides,
});

describe("source-owned projectile identity", () => {
  it("projects verified player ownership", () => {
    expect(projectLiveProjectiles([projectile({ playerOwned: true })], player, "A")[0]).toMatchObject({ ownerId: "player" });
  });
  it("does not invent unavailable enemy ownership", () => {
    expect(projectLiveProjectiles([projectile({ sourceEnemyId: "enemy:7" })], player, "A")[0]).not.toHaveProperty("ownerId");
  });
  it("accepts an enemy owner only through a verified production resolver", () => {
    const [observed] = projectLiveProjectiles([projectile({ sourceEnemyId: "enemy:7" })], player, "A",
      (source) => source.sourceEnemyId === "enemy:7" ? "enemy:7" : undefined);
    expect(observed).toMatchObject({ ownerId: "enemy:7" });
  });
});
