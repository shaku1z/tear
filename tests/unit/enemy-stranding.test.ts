import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { PUBLISHED_ENEMY_IDENTITY_IDS } from "../../src/gameplay/run/content-director";
import { VARIANTS, applyVariant, type EnemyVariant } from "../../src/gameplay/variants";
import {
  STANDARD_ACTOR_FACTORIES,
  createEnemyHarness,
  createStandardActor,
  updateActor,
  type BehaviorActor,
} from "./enemy-test-harness";

// The rule: no enemy is left stranded by a launch. Whatever an enemy is doing when a launcher swing throws it upward
// (the blade sets its vertical speed to launchPower over its weight), it stays inside the arena and is acting again
// a few seconds later. Found on 2026-11-20: a Dive Bomber launched mid-dive stayed in its dive for good, pinned in
// the top corner of the arena and out of the scripted player's reach, and an easy Adventure run sat on wave 24 for
// 45 minutes.

const TICKS_PER_SECOND = 120;
/** How long each enemy is watched, unlaunched, for the things it does. */
const WATCHED_TICKS = 10 * TICKS_PER_SECOND;
/** How long a launched enemy gets to come back. */
const RECOVERY_TICKS = 6 * TICKS_PER_SECOND;
/** An enemy whose every field but its age stays the same this long, firing nothing, is stranded. */
const STRANDED_TICKS = 2 * TICKS_PER_SECOND;

type Kind = keyof typeof STANDARD_ACTOR_FACTORIES;

const KINDS = (Object.keys(STANDARD_ACTOR_FACTORIES) as Kind[]).filter((kind) =>
  PUBLISHED_ENEMY_IDENTITY_IDS.includes(kind),
);

/** What the enemy is doing, as its own state fields name it. */
function doing(actor: BehaviorActor): string {
  const state = (actor as { state?: unknown }).state;
  return `${typeof state === "string" ? state : "-"}/${actor.atk}`;
}

/** Every plain field of the enemy except its age, which counts up whatever it does. */
function fields(actor: BehaviorActor): string {
  return JSON.stringify(
    Object.entries(actor).filter(
      ([key, value]) => key !== "aliveT" && (value === null || ["number", "string", "boolean"].includes(typeof value)),
    ),
  );
}

function play(kind: Kind, variant: EnemyVariant | null, launchTick: number | null) {
  const harness = createEnemyHarness([0.2, 0.7, 0.4]);
  const actor = createStandardActor(kind, harness.types);
  if (variant !== null) applyVariant(actor, variant);
  const shots: InstanceType<typeof harness.Projectile>[] = [];
  /** The first tick of each thing the enemy does. */
  const began = new Map<string, number>();
  const end = launchTick === null ? WATCHED_TICKS : launchTick + RECOVERY_TICKS;
  let unchangedTicks = 0;
  let before = "";
  let shotsBefore = 0;
  for (let tick = 0; tick < end; tick += 1) {
    if (tick === launchTick) actor.vy = -CONFIG.blade.launchPower / actor.weight;
    updateActor(actor, 1, harness.platforms, harness.player, shots);
    if (!began.has(doing(actor))) began.set(doing(actor), tick + 1);
    if (tick < end - STRANDED_TICKS) continue;
    const now = fields(actor);
    unchangedTicks = now === before && shots.length === shotsBefore ? unchangedTicks + 1 : 0;
    before = now;
    shotsBefore = shots.length;
  }
  return { actor, began, stranded: unchangedTicks >= STRANDED_TICKS - 1 };
}

describe("no enemy is stranded by a launch", () => {
  it("every enemy kind and variant, launched at the start of each thing it does, stays in the arena and acts again", () => {
    const stranded: string[] = [];
    let launches = 0;
    for (const kind of KINDS) {
      for (const variant of VARIANTS[kind] ?? [null]) {
        const name = variant === null ? kind : `${kind}/${variant.id}`;
        const watched = play(kind, variant, null);
        expect(watched.stranded, `${name} unlaunched`).toBe(false);
        for (const [what, tick] of watched.began) {
          if (tick >= WATCHED_TICKS) continue;
          launches += 1;
          const { actor, stranded: left } = play(kind, variant, tick);
          const where = `${name} launched in ${what} at tick ${String(tick)}`;
          expect(actor.x, where).toBeGreaterThanOrEqual(actor.hw);
          expect(actor.x, where).toBeLessThanOrEqual(CONFIG.view.w - actor.hw);
          expect(actor.y, where).toBeGreaterThanOrEqual(actor.hh);
          expect(actor.y, where).toBeLessThanOrEqual(CONFIG.world.groundY - actor.hh);
          if (left) stranded.push(`${where}: left in ${doing(actor)} at ${actor.x.toFixed(0)}, ${actor.y.toFixed(0)}`);
        }
      }
    }
    expect(stranded).toEqual([]);
    // Every kind is launched in more than one thing it does: the list above is not empty by accident.
    expect(launches).toBeGreaterThan(KINDS.length * 2);
  }, 60_000);
});
