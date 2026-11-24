/**
 * Every enemy the game can put in a world is drawn: it has a renderer, or the environment layer draws it.
 * The world builder (src/app/world/world-presentation-adapters.ts) refuses any other enemy on every frame, so a
 * kind added with neither must fail here, not in a player's game.
 *
 * The kinds: every world enemy is built by `createEnemy`, whose catalog refuses any id outside
 * TEAR_WORLD_ENTITY_FACTORY_IDS (src/gameplay/runtime/tear-world-entity-construction.ts). That list covers the wave
 * enemies, the bosses, the bosses' summons (the Mirror's reflections, the Unmake's void wisps) and the stage
 * spawns (supports, the Rootbinder). Each id is built through the production factory of a replay world whose
 * presentation is installed, as live play installs it, bare and with each of its variants.
 */
import { describe, expect, it } from "vitest";

import { createProductionGhostReplayComposition } from "../../src/app/world/detached/replay-composition";
import { isEnvironmentDrawnEnemy } from "../../src/app/world/environment-layer";
import { isDrawableEnemy } from "../../src/app/world/world-presentation-adapters";
import { TEAR_WORLD_ENTITY_FACTORY_IDS } from "../../src/gameplay/runtime/tear-world-entity-construction";
import { scenarioRunSeed } from "../../src/gameplay/run/run-start-choices";
import { VARIANTS, applyVariant } from "../../src/gameplay/variants";
import { replayPresentation } from "../support/replay-presentation";

function world() {
  const session = createProductionGhostReplayComposition({
    runSeed: scenarioRunSeed("enemy-renderer-coverage"),
    ...replayPresentation([]),
  }).create(undefined);
  return session.replay.world;
}

describe("enemy renderers", () => {
  it("draws every enemy kind the game can spawn, with each of its variants", () => {
    const { entities, state } = world();
    const undrawn: string[] = [];
    let checked = 0;
    for (const id of TEAR_WORLD_ENTITY_FACTORY_IDS) {
      for (const variant of [undefined, ...(VARIANTS[id] ?? [])]) {
        const enemy = entities.createEnemy(id, 400, 300, state.run() as never);
        applyVariant(enemy, variant);
        checked += 1;
        if (!isDrawableEnemy(enemy) && !isEnvironmentDrawnEnemy(enemy))
          undrawn.push(`${id}${variant === undefined ? "" : `:${variant.id}`} (kind ${enemy.kind})`);
      }
    }
    expect(undrawn, "enemies with no renderer that the environment layer does not draw").toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(TEAR_WORLD_ENTITY_FACTORY_IDS.length);
  });

  it("fails for a kind with neither a renderer nor an environment drawing", () => {
    const { entities, state } = world();
    const enemy = entities.createEnemy("charger", 400, 300, state.run() as never);
    Reflect.defineProperty(enemy, "draw", { value: undefined });
    Reflect.set(enemy, "kind", "new-undrawn-kind");
    expect(isDrawableEnemy(enemy) || isEnvironmentDrawnEnemy(enemy)).toBe(false);
  });
});
