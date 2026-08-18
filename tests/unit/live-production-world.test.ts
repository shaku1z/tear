import { describe, expect, it } from "vitest";

import { createLiveProductionWorld } from "../../src/app/live-production-world";
import type { GameRuntimeDependencies } from "../../src/app/game-runtime-dependencies";
import { createTearWorldClock } from "../../src/gameplay/runtime/tear-world-clock";
import { createTearWorldConfiguration } from "../../src/gameplay/runtime/tear-world-configuration";
import { createRunRandom } from "../../src/simulation/run-random";
import { createParticleSystem } from "../../src/presentation/particles";
import { CinematicTimeline } from "../../src/gameplay/runtime/cinematic-director";

function createConfiguration() {
  return createTearWorldConfiguration({} as GameRuntimeDependencies["CONFIG"]);
}

function createDependencies(config: GameRuntimeDependencies["CONFIG"]) {
  const random = createRunRandom();
  return {
    CONFIG: config, CLOCK: createTearWorldClock(), GAME_RANDOM: random.service, GAME_RANDOM_STREAMS: random.streams,
    FX: createParticleSystem({ effects: { highBudget: 1, lowBudget: 1, cullMargin: 0 },
      lowGraphics: () => false, reducedMotion: () => false, random: () => 0.5 }),
    Backdrop: { resetFx: () => undefined }, Mirror: { active: false, host: null }, BOSSFX: { q: [] },
    Cinematics: CinematicTimeline,
  } as unknown as GameRuntimeDependencies;
}

describe("live production world", () => {
  it("creates the live session and matching-config world as one immutable root", () => {
    const configuration = createConfiguration();
    const production = createLiveProductionWorld({
      dependencies: createDependencies(configuration.value), configuration,
    });

    production.session.setSelectedWeapon("hammer");
    production.world.state.setEnemies([{ id: "enemy" }] as never);

    expect(production.world.state.selectedWeapon()).toBe("hammer");
    expect(production.world.context.services.configuration).toBe(configuration);
    expect(production.world.state.enemies()).toEqual([{ id: "enemy" }]);
    expect(Object.isFrozen(production)).toBe(true);
  });

  it("keeps each production root's session, world state, and configuration apart", () => {
    const firstConfig = createConfiguration();
    const secondConfig = createConfiguration();
    const first = createLiveProductionWorld({ dependencies: createDependencies(firstConfig.value), configuration: firstConfig });
    const second = createLiveProductionWorld({ dependencies: createDependencies(secondConfig.value), configuration: secondConfig });

    first.session.setSelectedWeapon("greatsword");
    first.world.context.transient.impact.shake = 4;

    expect(second.session.selectedWeapon()).toBe("sword");
    expect(second.world.context.transient.impact.shake).toBe(0);
    expect(first.world.context.services.configuration).not.toBe(second.world.context.services.configuration);
  });

  it("rejects split runtime and world configuration references before construction", () => {
    const configuration = createConfiguration();

    expect(() => createLiveProductionWorld({
      dependencies: createDependencies({} as GameRuntimeDependencies["CONFIG"]), configuration,
    })).toThrow("dependencies.CONFIG");
  });
});
