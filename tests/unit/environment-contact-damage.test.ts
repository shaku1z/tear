/**
 * The one contact damage path: a stage object declares its damage, and the environment runtime applies
 * it once per target while the object is active. No biome feature applies stage-object damage itself.
 */
import { describe, expect, it } from "vitest";

import type { EnvironmentContactTarget } from "../../src/gameplay/environment/environment-contact-damage";
import { createEnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";

const DT = 1 / 120;

function target(hits: { damage: number; sourceX: number; ownerId: string | null }[], overrides = {}) {
  return {
    id: "player",
    x: 50,
    y: 50,
    hw: 10,
    hh: 20,
    invulnerable: false,
    hazardDamageMultiplier: 0.5,
    takeDamage: (damage: number, sourceX: number, ownerId: string | null) => {
      hits.push({ damage, sourceX, ownerId });
    },
    ...overrides,
  } satisfies EnvironmentContactTarget;
}

function rootline(state: "warning" | "active", extra: Record<string, unknown> = {}) {
  return {
    kind: "rootline" as const,
    geometry: { x: 0, y: 40, w: 100, h: 20 },
    state,
    stateTick: 0,
    timer: 0,
    ownerId: "enemy:boss",
    schedule: null,
    eligibility: { player: true, enemies: false, bosses: false },
    force: null,
    cleanupReason: null,
    damage: 20,
    threatening: true,
    hitActorIds: [] as string[],
    ...extra,
  };
}

describe("environment contact damage", () => {
  it("hurts a touching target once while active, scaled only when the object says so", () => {
    const hits: { damage: number; sourceX: number; ownerId: string | null }[] = [];
    const environment = createEnvironmentRuntime({ stageId: "rule-test", worldId: "contact-once" });
    environment.setContactTargets(() => [target(hits)]);
    const scaled = environment.addField(rootline("active", { hazardScaled: true }));
    const plain = environment.addField(rootline("active"));
    for (let tick = 1; tick <= 5; tick += 1) environment.step(tick, DT, () => undefined);
    expect(hits).toEqual([
      { damage: 10, sourceX: 50, ownerId: "enemy:boss" },
      { damage: 20, sourceX: 50, ownerId: "enemy:boss" },
    ]);
    for (const id of [scaled, plain])
      expect(environment.fields().find((field) => field.id === id)).toMatchObject({ hitActorIds: ["player"] });
  });

  it("does not hurt while warning, when harmless, when out of reach or when the target is invulnerable", () => {
    const hits: { damage: number; sourceX: number; ownerId: string | null }[] = [];
    const environment = createEnvironmentRuntime({ stageId: "rule-test", worldId: "contact-none" });
    environment.addField(rootline("warning"));
    environment.addField(rootline("active", { threatening: false }));
    environment.addField(rootline("active", { geometry: { x: 400, y: 40, w: 100, h: 20 } }));
    environment.setContactTargets(() => [target(hits)]);
    environment.step(1, DT, () => undefined);
    environment.setContactTargets(() => [target(hits, { invulnerable: true })]);
    environment.addField(rootline("active"));
    environment.step(2, DT, () => undefined);
    expect(hits).toEqual([]);
  });

  it("measures a route by its path and width, and names the route's first point as the source", () => {
    const hits: { damage: number; sourceX: number; ownerId: string | null }[] = [];
    const environment = createEnvironmentRuntime({ stageId: "rule-test", worldId: "contact-route" });
    environment.setContactTargets(() => [target(hits)]);
    environment.addRoute({
      kind: "ghost-track",
      points: [
        { x: 0, y: 90 },
        { x: 200, y: 90 },
      ],
      width: 24,
      state: "active",
      stateTick: 0,
      ownerId: "enemy:hart",
      cleanupReason: null,
      damage: 16,
      threatening: true,
      hitActorIds: [],
    });
    environment.step(1, DT, () => undefined);
    expect(hits).toEqual([]);
    environment.setContactTargets(() => [target(hits, { y: 62 })]);
    environment.step(2, DT, () => undefined);
    expect(hits).toEqual([{ damage: 16, sourceX: 0, ownerId: "enemy:hart" }]);
  });
});
