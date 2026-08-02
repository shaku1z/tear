import { describe, expect, it } from "vitest";

import { createLiveWorldComposition, type LiveWorldSessionPort } from "../../src/app/live-world-composition";
import type { GameRuntimeDependencies } from "../../src/app/game-runtime-dependencies";
import { createParticleSystem } from "../../src/presentation/particles";
import { createRunRandom } from "../../src/simulation/run-random";
import { createTearWorldClock } from "../../src/gameplay/runtime/tear-world-clock";
import { CinematicTimeline } from "../../src/gameplay/runtime/cinematic-director";
import { createTearWorldConfiguration } from "../../src/gameplay/runtime/tear-world-configuration";

function createWorldDependencies() {
  const random = createRunRandom();
  const clock = createTearWorldClock();
  const dependencies = {
    CLOCK: clock, GAME_RANDOM: random.service, GAME_RANDOM_STREAMS: random.streams,
    FX: createParticleSystem({
      effects: { highBudget: 1, lowBudget: 1, cullMargin: 0 },
      lowGraphics: () => false, reducedMotion: () => false, random: () => 0.5,
    }), Backdrop: { resetFx: () => undefined },
    Mirror: { active: true, host: {} }, BOSSFX: { q: [{ kind: "queued" }] },
    Cinematics: CinematicTimeline,
  } as unknown as GameRuntimeDependencies;
  return { dependencies, clock, random };
}

function createSession(): LiveWorldSessionPort {
  let weapon = "sword";
  return {
    selectedWeapon: () => weapon, setSelectedWeapon: (value) => { weapon = value; },
    outcome: () => null, setOutcome: () => undefined,
    lastRecording: () => null, setLastRecording: () => undefined,
    lastVaultId: () => null, setLastVaultId: () => undefined,
    winSeconds: () => 0, setWinSeconds: () => undefined,
  };
}

function createConfiguration() {
  return createTearWorldConfiguration({} as GameRuntimeDependencies["CONFIG"]);
}

describe("live world composition", () => {
  it("builds one world's state, entities, lifecycle, and context together", () => {
    const { dependencies, clock } = createWorldDependencies();

    const world = createLiveWorldComposition({
      dependencies, session: createSession(), configuration: createConfiguration(),
    });
    world.context.services.clock.advance(0.25);

    expect(world.state.enemies()).toEqual([]);
    expect(world.state.run()).toBeNull();
    expect(world.lifecycle.phase).toBe(world.context.lifecycle.phase);
    expect(clock.sim).toBe(0.25);
    expect(world.context.transient.impact).toEqual({ hitStop: 0, slowMotion: 0, shake: 0 });
    expect(world.context.cinema).toBeInstanceOf(CinematicTimeline.Director);
    expect(typeof world.entities.createPlayer).toBe("function");
    expect(Object.isFrozen(world)).toBe(true);
  });

  it("mirrors replaced world values to the host without giving up ownership", () => {
    const { dependencies } = createWorldDependencies();
    const seen: Record<string, unknown> = {};
    const world = createLiveWorldComposition({
      dependencies, session: createSession(), configuration: createConfiguration(),
      mirrors: {
        enemies: (value) => { seen.enemies = value; },
        bossBeat: (value) => { seen.bossBeat = value; },
        player: (value) => { seen.player = value; },
      },
    });

    const player = { id: "player" };
    world.state.setPlayer(player as never);
    world.state.setEnemies([{ id: "enemy" }] as never);
    world.state.setBossBeat(null);

    expect(seen.player).toBe(player);
    expect(seen.enemies).toBe(world.state.enemies());
    expect(seen.bossBeat).toBeNull();
    // The world keeps the array it owns rather than the caller's instance.
    expect(world.state.enemies()).toEqual([{ id: "enemy" }]);
  });

  it("keeps two worlds' state and transient records apart", () => {
    const first = createLiveWorldComposition({
      dependencies: createWorldDependencies().dependencies, session: createSession(),
      configuration: createConfiguration(),
    });
    const second = createLiveWorldComposition({
      dependencies: createWorldDependencies().dependencies, session: createSession(),
      configuration: createConfiguration(),
    });

    first.state.setEnemies([{ id: "enemy" }] as never);
    first.context.transient.impact.shake = 4;

    expect(second.state.enemies()).toEqual([]);
    expect(second.context.transient.impact.shake).toBe(0);
    expect(first.entities).not.toBe(second.entities);
    expect(first.lifecycle).not.toBe(second.lifecycle);
    expect(first.context.cinema).not.toBe(second.context.cinema);
  });

  it("keeps transient combat collections in world state", () => {
    const { dependencies } = createWorldDependencies();
    const world = createLiveWorldComposition({
      dependencies, session: createSession(), configuration: createConfiguration(),
    });

    world.state.setFloaters([{ id: "floater" }] as never);
    world.state.setSlowZones([{ id: "slow-zone" }] as never);
    world.state.setTemporaryWalls([{ id: "wall" }] as never);

    expect(world.state.floaters()).toEqual([{ id: "floater" }]);
    expect(world.state.slowZones()).toEqual([{ id: "slow-zone" }]);
    expect(world.state.temporaryWalls()).toEqual([{ id: "wall" }]);
  });

  it("keeps boss cinematic state in world state", () => {
    const { dependencies } = createWorldDependencies();
    const world = createLiveWorldComposition({
      dependencies, session: createSession(), configuration: createConfiguration(),
    });
    const intro = { boss: { id: "boss" }, t: 0.2, dur: 1, delay: 0.5 } as never;
    const beat = { text: "WARDEN", color: "#fff", t: 1, dur: 1 } as never;

    world.state.setBossIntro(intro);
    world.state.setBossBeat(beat);

    expect(world.state.bossIntro()).toBe(intro);
    expect(world.state.bossBeat()).toBe(beat);
  });
});
