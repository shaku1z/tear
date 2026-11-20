import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import { EnvironmentRuntime } from "../../src/gameplay/environment/environment-runtime";
import { ENEMY_IDENTITY_IDS } from "../../src/gameplay/run/content-director";
import { bindBiomeActors } from "../../src/gameplay/environment/biome-actors/bind-biome-actors";
import { createProductionGhostReplayComposition } from "../../src/tearbench/production-replay-composition";

// Rules over all content: whatever live play can build or bind, the production replay world must
// build and bind the same way. A new enemy or biome actor is covered without adding a case here.

function recordActorSourceBindings(run: () => void): string[] {
  const bound: string[] = [];
  const spy = vi.spyOn(EnvironmentRuntime.prototype, "setFeatureActorSource").mockImplementation(function (
    this: EnvironmentRuntime,
    featureId,
    slot,
  ) {
    bound.push(`${featureId}:${slot}`);
  });
  try {
    run();
  } finally {
    spy.mockRestore();
  }
  return bound;
}

describe("production replay covers all live content", () => {
  afterEach(() => vi.restoreAllMocks());

  it("binds every biome actor source that live play binds, in the same order", () => {
    const live = recordActorSourceBindings(() => {
      bindBiomeActors({
        environment: new EnvironmentRuntime("probe", "probe"),
        config: CONFIG,
        player: () => ({}) as never,
        enemies: () => [],
        entityId: (_entity, prefix) => prefix,
      });
    });
    const replay = recordActorSourceBindings(() =>
      createProductionGhostReplayComposition({ seed: "replay-binding-rule", mode: "campaign" }).create(undefined),
    );
    expect(live.length).toBeGreaterThan(0);
    expect(replay).toEqual(live);
  });

  it("constructs every enemy kind in the production replay world", () => {
    const { replay } = createProductionGhostReplayComposition({ seed: "replay-enemy-rule", mode: "campaign" }).create(
      undefined,
    );
    const run = replay.world.state.run();
    // Some identities build a shared kind (priest is a support enemy); the rule is that each one builds.
    for (const kind of ENEMY_IDENTITY_IDS) {
      const enemy = replay.world.entities.createEnemy(kind, 400, CONFIG.world.groundY - 40, run as never);
      expect(typeof enemy.kind, kind).toBe("string");
    }
  });
});
