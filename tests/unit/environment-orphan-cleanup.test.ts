import { describe, expect, it } from "vitest";

import {
  cleanupOrphanedEnvironmentReferences,
  environmentNeedsOrphanCleanup,
} from "../../src/gameplay/environment/environment-cleanup";
import { createEnvironmentRuntime, type EnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { TearGameplayEventBus, type TearGameplayEvent } from "../../src/gameplay/runtime/gameplay-events";

const ACTORS = ["player", "blade", "enemy:1", "enemy:2", "projectile:3"] as const;
const STATES = ["active", "scheduled", "dormant", "expired", "destroyed"] as const;

/** Small deterministic generator so every case is reproducible from its seed. */
function generator(seed: number) {
  let value = seed >>> 0;
  const next = () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 2 ** 32;
  };
  return {
    pick: <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)] as T,
    chance: (probability: number) => next() < probability,
  };
}

function populatedEnvironment(seed: number): EnvironmentRuntime {
  const random = generator(seed);
  const actor = () => (random.chance(0.3) ? null : random.pick(ACTORS));
  const environment = createEnvironmentRuntime({
    stageId: "stage",
    worldId: `cleanup-${String(seed)}`,
    events: new TearGameplayEventBus(() => 0),
  });
  for (let index = 0; index < 3; index += 1) {
    environment.addField({
      kind: "bloom-well",
      geometry: { x: index, y: 0, radius: 10 },
      state: random.pick(STATES),
      stateTick: 0,
      timer: 1,
      ownerId: actor(),
      schedule: null,
      eligibility: { player: true, enemies: true, bosses: false },
      force: null,
      cleanupReason: null,
      ...(random.chance(0.5) ? { bossOwnerId: random.pick(ACTORS) } : {}),
      ...(random.chance(0.5) ? { tethered: [{ actorId: random.pick(ACTORS) }, { actorId: random.pick(ACTORS) }] } : {}),
    });
  }
  environment.addCombatObject({
    kind: "root-link",
    ownerId: actor(),
    targetId: actor(),
    geometry: { x: 1, y: 2 },
    integrity: 2,
    maxIntegrity: 2,
    counterplayTags: ["cut"],
    procEligible: false,
    damageDedupeId: "hit",
    state: random.pick(STATES),
    stateTick: 0,
    cleanupReason: null,
  });
  environment.addRoute({
    kind: "regrowth-link",
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    state: random.pick(STATES),
    stateTick: 0,
    ownerId: actor(),
    cleanupReason: null,
  });
  return environment;
}

function presentActors(seed: number): Set<string> {
  const random = generator(seed * 31 + 7);
  return new Set(ACTORS.filter(() => random.chance(0.7)));
}

describe("environment orphan cleanup precheck", () => {
  it("never skips a pass that would change an entry or prune an actor reference", () => {
    let skipped = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const environment = populatedEnvironment(seed);
      const ids = presentActors(seed);
      const has = { has: (id: string) => id === environment.stageId || ids.has(id) };
      if (environmentNeedsOrphanCleanup(environment.fields(), environment.combatObjects(), environment.routes(), has))
        continue;
      skipped += 1;
      const before = environment.snapshot();
      const after = cleanupOrphanedEnvironmentReferences(before, has, "stage-transition");
      expect(after.fields).toEqual(before.fields);
      after.fields.forEach((entry, index) => {
        expect(entry).toBe(before.fields[index]);
      });
      after.combatObjects.forEach((entry, index) => {
        expect(entry).toBe(before.combatObjects[index]);
      });
      after.routes.forEach((entry, index) => {
        expect(entry).toBe(before.routes[index]);
      });
      for (const entry of before.fields) {
        const references = Object.values(entry)
          .flatMap((value: unknown): readonly unknown[] => (Array.isArray(value) ? (value as unknown[]) : []))
          .flatMap((item: unknown) =>
            typeof item === "object" && item !== null && "actorId" in item ? [String(item.actorId)] : [],
          );
        expect(references.every((actorId) => has.has(actorId))).toBe(true);
      }
    }
    expect(skipped).toBeGreaterThan(20);
  });

  it("publishes cleanup events exactly when the precheck asks for a pass", () => {
    let cleaned = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const events = new TearGameplayEventBus(() => 0);
      const published: TearGameplayEvent[] = [];
      events.subscribe((event) => {
        published.push(event);
      });
      const environment = populatedEnvironment(seed);
      environment.setEventPort(events);
      const ids = presentActors(seed);
      const needed = environmentNeedsOrphanCleanup(
        environment.fields(),
        environment.combatObjects(),
        environment.routes(),
        { has: (id) => id === environment.stageId || ids.has(id) },
      );
      environment.step(1, 1 / 120, () => undefined, ids);
      const cleanups = published.filter(
        (event) => event.kind === "environment" && event.event === "object-cleaned",
      ).length;
      if (!needed) expect(cleanups).toBe(0);
      cleaned += cleanups;
    }
    expect(cleaned).toBeGreaterThan(0);
  });
});
