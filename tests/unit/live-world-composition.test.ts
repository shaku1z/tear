import { describe, expect, it } from "vitest";

import { createLiveWorldComposition, type LiveWorldSessionPort } from "../../src/app/world/world-composition";
import type { GameRuntimeDependencies } from "../../src/app/shell/game-runtime-dependencies";
import { createParticleSystem } from "../../src/presentation/particles";
import { createRunRandom } from "../../src/simulation/run-random";
import { createTearWorldClock } from "../../src/gameplay/runtime/tear-world-clock";
import { CinematicTimeline } from "../../src/gameplay/runtime/cinematic-director";
import { createTearWorldConfiguration } from "../../src/gameplay/runtime/tear-world-configuration";
import { createTearWorldComposition } from "../../src/gameplay/runtime/tear-world-composition";
import { createLiveWorldServices } from "../../src/app/world/world-context";
import { MusicDirector } from "../../src/audio/music-director";
import { createCosmeticEmissionRandom } from "../../src/domain/cosmetic-emission-random";
import { createProductionReplayWorld } from "../../src/tearbench/production-world-factory";
import type { TearGameplayEventPort } from "../../src/gameplay/runtime/gameplay-events";
import { DEFAULT_COSMETIC_LOOKS } from "../../src/presentation/cosmetic-defaults";

function createWorldDependencies() {
  const random = createRunRandom();
  const clock = createTearWorldClock();
  const dependencies = {
    CLOCK: clock,
    GAME_RANDOM: random.service,
    GAME_RANDOM_STREAMS: random.streams,
    FX: createParticleSystem({
      looks: DEFAULT_COSMETIC_LOOKS,
      effects: { highBudget: 1, lowBudget: 1, cullMargin: 0 },
      lowGraphics: () => false,
      reducedMotion: () => false,
      random: () => 0.5,
    }),
    Backdrop: { resetFx: () => undefined },
    Mirror: { active: true, host: {} },
    BOSSFX: { q: [{ kind: "queued" }] },
    Cinematics: CinematicTimeline,
  } as unknown as GameRuntimeDependencies;
  return { dependencies, clock, random };
}

function createSession(): LiveWorldSessionPort {
  let weapon = "sword";
  return {
    selectedWeapon: () => weapon,
    setSelectedWeapon: (value) => {
      weapon = value;
    },
    outcome: () => null,
    setOutcome: () => undefined,
    lastRecording: () => null,
    setLastRecording: () => undefined,
    lastVaultId: () => null,
    setLastVaultId: () => undefined,
    winSeconds: () => 0,
    setWinSeconds: () => undefined,
  };
}

function createConfiguration() {
  return createTearWorldConfiguration({} as GameRuntimeDependencies["CONFIG"]);
}

/** The live production-world root's options (src/app/shell/production-world.ts). */
const LIVE = Object.freeze({ publishEnvironmentEvents: true, musicDirection: true } as const);
/** The detached TearBench replay world's options (src/tearbench/production-world-factory.ts). */
const DETACHED = Object.freeze({ publishEnvironmentEvents: false, musicDirection: false } as const);

function withEventBus(dependencies: GameRuntimeDependencies) {
  const GAMEPLAY_EVENTS = { emit: () => undefined };
  return { ...dependencies, GAMEPLAY_EVENTS } as unknown as GameRuntimeDependencies;
}

/** Everything a world constructor could observably touch on its shared dependencies. */
function sharedObservables(dependencies: GameRuntimeDependencies) {
  const d = dependencies as unknown as {
    CLOCK: { sim: number };
    GAME_RANDOM_STREAMS: { snapshot(): unknown };
    FX: { list: readonly unknown[] };
    Mirror: { active: boolean; host: unknown };
    BOSSFX: { q: readonly unknown[] };
  };
  return JSON.stringify({
    clock: d.CLOCK.sim,
    random: d.GAME_RANDOM_STREAMS.snapshot(),
    effects: d.FX.list.length,
    mirror: [d.Mirror.active, d.Mirror.host],
    bossFeedback: d.BOSSFX.q.length,
  });
}

describe("live world composition", () => {
  it("builds one world's state, entities, lifecycle, and context together", () => {
    const { dependencies, clock } = createWorldDependencies();

    const world = createLiveWorldComposition({
      dependencies,
      session: createSession(),
      configuration: createConfiguration(),
      ...LIVE,
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
      dependencies,
      session: createSession(),
      configuration: createConfiguration(),
      ...LIVE,
      mirrors: {
        enemies: (value) => {
          seen.enemies = value;
        },
        bossBeat: (value) => {
          seen.bossBeat = value;
        },
        player: (value) => {
          seen.player = value;
        },
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
      dependencies: createWorldDependencies().dependencies,
      session: createSession(),
      configuration: createConfiguration(),
      ...LIVE,
    });
    const second = createLiveWorldComposition({
      dependencies: createWorldDependencies().dependencies,
      session: createSession(),
      configuration: createConfiguration(),
      ...LIVE,
    });

    first.state.setEnemies([{ id: "enemy" }] as never);
    first.context.transient.impact.shake = 4;

    expect(second.state.enemies()).toEqual([]);
    expect(second.context.transient.impact.shake).toBe(0);
    expect(first.entities).not.toBe(second.entities);
    expect(first.lifecycle).not.toBe(second.lifecycle);
    expect(first.music).not.toBe(second.music);
    expect(first.music.active).toBe(false);
    expect(second.music.active).toBe(false);
    expect(first.context.cinema).not.toBe(second.context.cinema);
  });

  it("keeps transient combat collections in world state", () => {
    const { dependencies } = createWorldDependencies();
    const world = createLiveWorldComposition({
      dependencies,
      session: createSession(),
      configuration: createConfiguration(),
      ...LIVE,
    });

    world.state.setFloaters([{ id: "floater" }] as never);
    world.state.setSlowZones([{ id: "slow-zone" }] as never);
    world.state.setTemporaryWalls([{ id: "wall" }] as never);

    expect(world.state.floaters()).toEqual([{ id: "floater" }]);
    expect(world.state.slowZones()).toEqual([{ id: "slow-zone" }]);
    expect(world.state.temporaryWalls()).toEqual([{ id: "wall" }]);
  });

  it("keeps actor collections in world state", () => {
    const { dependencies } = createWorldDependencies();
    const world = createLiveWorldComposition({
      dependencies,
      session: createSession(),
      configuration: createConfiguration(),
      ...LIVE,
    });

    world.state.setEnemies([{ id: "enemy" }] as never);
    world.state.setProjectiles([{ id: "projectile" }] as never);

    expect(world.state.enemies()).toEqual([{ id: "enemy" }]);
    expect(world.state.projectiles()).toEqual([{ id: "projectile" }]);
  });

  it("keeps the live run in world state", () => {
    const { dependencies } = createWorldDependencies();
    const world = createLiveWorldComposition({
      dependencies,
      session: createSession(),
      configuration: createConfiguration(),
      ...LIVE,
    });
    const run = { id: "run" } as never;

    world.state.setRun(run);

    expect(world.state.run()).toBe(run);
  });

  it("keeps the live blade in world state", () => {
    const { dependencies } = createWorldDependencies();
    const world = createLiveWorldComposition({
      dependencies,
      session: createSession(),
      configuration: createConfiguration(),
      ...LIVE,
    });
    const blade = { id: "blade" } as never;

    world.state.setBlade(blade);

    expect(world.state.blade()).toBe(blade);
  });

  it("keeps the live player in world state", () => {
    const { dependencies } = createWorldDependencies();
    const world = createLiveWorldComposition({
      dependencies,
      session: createSession(),
      configuration: createConfiguration(),
      ...LIVE,
    });
    const player = { id: "player" } as never;

    world.state.setPlayer(player);

    expect(world.state.player()).toBe(player);
  });

  it("keeps boss cinematic state in world state", () => {
    const { dependencies } = createWorldDependencies();
    const world = createLiveWorldComposition({
      dependencies,
      session: createSession(),
      configuration: createConfiguration(),
      ...LIVE,
    });
    const intro = { boss: { id: "boss" }, t: 0.2, dur: 1, delay: 0.5 } as never;
    const beat = { text: "WARDEN", color: "#fff", t: 1, dur: 1 } as never;

    world.state.setBossIntro(intro);
    world.state.setBossBeat(beat);

    expect(world.state.bossIntro()).toBe(intro);
    expect(world.state.bossBeat()).toBe(beat);
  });
});

describe("one world constructor for live and detached worlds", () => {
  it("publishes environment facts and directs music only when the options ask for it", () => {
    const live = withEventBus(createWorldDependencies().dependencies);
    const detached = withEventBus(createWorldDependencies().dependencies);
    const liveWorld = createLiveWorldComposition({
      dependencies: live,
      session: createSession(),
      configuration: createConfiguration(),
      ...LIVE,
    });
    const detachedWorld = createLiveWorldComposition({
      dependencies: detached,
      session: createSession(),
      configuration: createConfiguration(),
      ...DETACHED,
    });

    expect(liveWorld.environment.events).toBe(live.GAMEPLAY_EVENTS);
    expect(liveWorld.music).toBeInstanceOf(MusicDirector);
    expect(detachedWorld.environment.events).toBeUndefined();
    expect(detachedWorld.music).toBeNull();
    for (const world of [liveWorld, detachedWorld]) {
      expect(world.context.environment).toBe(world.environment);
      expect(world.context.cinema).toBeInstanceOf(CinematicTimeline.Director);
    }
  });

  it("builds the TearBench replay world through the same constructor with detached options", () => {
    const emitted: unknown[] = [];
    const gameplayEvents = {
      emit: (event: unknown) => {
        emitted.push(event);
      },
    } as unknown as TearGameplayEventPort;
    const replay = createProductionReplayWorld({ seed: "one-constructor", gameplayEvents });

    expect(replay.world.music).toBeNull();
    expect(replay.world.environment.events).toBeUndefined();
    expect(replay.world.context.environment).toBe(replay.world.environment);
    expect(Object.keys(replay.world).sort()).toEqual([
      "context",
      "dispose",
      "entities",
      "environment",
      "lifecycle",
      "music",
      "state",
    ]);
    replay.world.environment.setStage("verdant", "stage-transition");
    expect(emitted).toEqual([]);
  });

  it("constructs without touching shared clock, random, effects, mirror or boss feedback", () => {
    for (const options of [LIVE, DETACHED]) {
      const { dependencies, random } = createWorldDependencies();
      random.streams.reset(1234);
      random.streams.stream("enemy-ai").next();
      const before = sharedObservables(dependencies);
      createLiveWorldComposition({
        dependencies: withEventBus(dependencies),
        session: createSession(),
        configuration: createConfiguration(),
        ...options,
      });
      expect(sharedObservables(dependencies)).toBe(before);
    }
  });

  it("services-before-cinema and cinema-before-services build indistinguishable worlds", () => {
    // The detached world used to build services before the cinema; the one
    // constructor builds the cinema first. Neither constructor draws random
    // numbers, allocates ids or registers listeners, so the order is not
    // observable and needs no option.
    const build = (order: "services-first" | "cinema-first") => {
      const base = createWorldDependencies();
      const { random, clock } = base;
      const cosmeticEmissionRandom = createCosmeticEmissionRandom();
      const dependencies = { ...base.dependencies, cosmeticEmissionRandom } as unknown as GameRuntimeDependencies;
      const configuration = createConfiguration();
      const cinemaOf = () => new CinematicTimeline.Director(configuration.value);
      const servicesOf = () => createLiveWorldServices({ dependencies, configuration });
      const [services, cinema] =
        order === "services-first"
          ? (() => {
              const s = servicesOf();
              return [s, cinemaOf()] as const;
            })()
          : (() => {
              const c = cinemaOf();
              return [servicesOf(), c] as const;
            })();
      const world = createTearWorldComposition({ state: {}, entities: {}, services, cinema, worldId: "order" });
      world.context.services.random.resetRun(77);
      world.context.services.clock.advance(0.5);
      return JSON.stringify({
        draws: [0, 1, 2].map(() => random.streams.stream("boss").next()),
        snapshot: random.streams.snapshot(),
        cosmetic: [0, 1].map(() => cosmeticEmissionRandom.next()),
        clock: clock.sim,
        cinema: world.context.cinema.captureState(),
        environment: world.environment.snapshot(),
      });
    };
    expect(build("services-first")).toBe(build("cinema-first"));
  });
});
