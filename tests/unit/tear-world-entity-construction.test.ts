import { describe, expect, it } from "vitest";

import {
  createTearWorldEntityConstructionCatalog,
  type TearWorldEntityConstructionPort,
} from "../../src/gameplay/runtime/tear-world-entity-construction";

interface FixtureRun { readonly id: string; }
interface FixturePlayer { readonly kind: "player"; readonly x: number; readonly y: number; }
interface FixtureBlade { readonly kind: "blade"; }
interface FixtureEnemy { readonly kind: string; readonly x: number; readonly y: number; readonly constructedRun: FixtureRun; }
interface FixtureProjectile { readonly kind: "projectile"; readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; }

describe("Tear world entity-construction catalog", () => {
  it("selects registered factories without changing caller placement or construction run", () => {
    const calls: Readonly<{ id: string; x: number; y: number; run: FixtureRun }>[] = [];
    const finalized: Readonly<{ id: string; enemy: FixtureEnemy; run: FixtureRun }>[] = [];
    const catalog: TearWorldEntityConstructionPort<FixtureRun, FixturePlayer, FixtureBlade, FixtureEnemy, FixtureProjectile> =
      createTearWorldEntityConstructionCatalog({
        createPlayer: (x, y) => ({ kind: "player", x, y }),
        createBlade: () => ({ kind: "blade" }),
        enemyFactories: {
          charger: { create(x, y, run) { calls.push({ id: "charger", x, y, run }); return { kind: "charger", x, y, constructedRun: run }; } },
          echo: { create(x, y, run) { calls.push({ id: "echo", x, y, run }); return { kind: "echo", x, y, constructedRun: run }; } },
        },
        createProjectile: (x, y, vx, vy) => ({ kind: "projectile", x, y, vx, vy }),
        finalizeEnemy: (id, enemy, run) => { finalized.push({ id, enemy, run }); },
      });
    const constructionRun = { id: "construction" };
    const finalRun = { id: "final" };

    expect(catalog.createPlayer(12, 34)).toEqual({ kind: "player", x: 12, y: 34 });
    expect(catalog.createBlade()).toEqual({ kind: "blade" });
    expect(catalog.createProjectile(1, 2, -3, 4)).toEqual({ kind: "projectile", x: 1, y: 2, vx: -3, vy: 4 });
    const echo = catalog.createEnemy("echo", 56, 78, constructionRun);
    catalog.finalizeEnemy?.("echo", echo, finalRun);

    expect(calls).toEqual([{ id: "echo", x: 56, y: 78, run: constructionRun }]);
    expect(finalized).toEqual([{ id: "echo", enemy: echo, run: finalRun }]);
    expect(Object.isFrozen(catalog)).toBe(true);
  });

  it("fails closed for unknown and unavailable factory IDs", () => {
    const catalog = createTearWorldEntityConstructionCatalog<FixtureRun, FixturePlayer, FixtureBlade, FixtureEnemy, FixtureProjectile>({
      createPlayer: (x, y) => ({ kind: "player", x, y }),
      createBlade: () => ({ kind: "blade" }),
      enemyFactories: {},
      createProjectile: (x, y, vx, vy) => ({ kind: "projectile", x, y, vx, vy }),
    });
    const run = { id: "fixture" };

    expect(() => catalog.createEnemy("not-a-tear-actor", 0, 0, run)).toThrow(/unsupported Tear world entity factory/);
    expect(() => catalog.createEnemy("charger", 0, 0, run)).toThrow(/unavailable Tear world entity factory/);
  });
});
