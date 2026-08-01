import { describe, expect, it } from "vitest";

import {
  createTearWorldSimulationFactories,
  type TearWorldEntityPresentationPorts,
  type TearWorldSimulationFactoryOptions,
} from "../../src/gameplay/runtime/tear-world-simulation-factories";
import { CONFIG, GFX } from "../../src/config/game-config";
import { aabbOverlap, clamp, len, lerp, lerpAngle, segPointDist, segSegmentDist } from "../../src/domain/geometry";

type Options = TearWorldSimulationFactoryOptions;

function noOpPresentation(onInstall: () => void = () => undefined): TearWorldEntityPresentationPorts {
  return Object.freeze({
    blade: { draw: () => undefined },
    player: { draw: () => undefined },
    projectile: { draw: () => undefined },
    enemy: Object.freeze({ port: { drawBossTransformationWorld: () => undefined }, install: onInstall }),
    mirror: {
      drawMirror: () => undefined, drawHostFallback: () => undefined,
      drawReflection: () => undefined, saberLockSparks: () => undefined,
    },
  });
}

function createWorldServices(clockSeconds: number): { options: Options; effects: string[]; clock: { sim: number } } {
  const effects: string[] = [];
  const clock = { sim: clockSeconds };
  const sink = new Proxy({}, { get: (_target, key) => () => { effects.push(String(key)); } });
  const options = {
    clock, config: CONFIG, graphics: GFX,
    effects: sink as Options["effects"],
    sound: sink as Options["sound"],
    input: { keys: {}, mouse: { x: 0, y: 0 }, semantic: sink } as unknown as Options["input"],
    random: { enemyAi: { next: () => 0.5 }, boss: { next: () => 0.5 } } as Options["random"],
    presentation: noOpPresentation(),
    geometry: { aabbOverlap, clamp, len, lerp, lerpAngle, segPointDist, segSegmentDist },
    cosmeticRandom: () => 0.5,
  } satisfies Options;
  return { options, effects, clock };
}

describe("live world simulation factories", () => {
  it("builds two independent worlds whose entity constructors capture their own clock", () => {
    const first = createWorldServices(5);
    const second = createWorldServices(9);

    const worldA = createTearWorldSimulationFactories(first.options);
    const worldB = createTearWorldSimulationFactories(second.options);
    const chargerA = new worldA.enemyTypes.Charger(360, CONFIG.world.groundY - CONFIG.enemy.h / 2);
    const chargerB = new worldB.enemyTypes.Charger(360, CONFIG.world.groundY - CONFIG.enemy.h / 2);
    chargerA.applyBleed(1);
    chargerB.applyBleed(1);

    // A shared module clock would have stamped both enemies with one value.
    expect(chargerA.firstPlayerDamageAt).toBe(5);
    expect(chargerB.firstPlayerDamageAt).toBe(9);
    first.clock.sim = 41;
    const laterA = new worldA.enemyTypes.Charger(360, CONFIG.world.groundY - CONFIG.enemy.h / 2);
    laterA.applyBleed(1);
    expect(laterA.firstPlayerDamageAt).toBe(41);
    expect(chargerB.firstPlayerDamageAt).toBe(9);
  });

  it("gives each world its own constructors and boss feedback queue", () => {
    const worldA = createTearWorldSimulationFactories(createWorldServices(0).options);
    const worldB = createTearWorldSimulationFactories(createWorldServices(0).options);

    worldA.enemyTypes.BOSSFX.q.push({ kind: "test" } as never);

    expect(worldA.enemyTypes.Charger).not.toBe(worldB.enemyTypes.Charger);
    expect(worldA.Blade).not.toBe(worldB.Blade);
    expect(worldA.Player).not.toBe(worldB.Player);
    expect(worldA.Projectile).not.toBe(worldB.Projectile);
    expect(worldA.mirrorTypes.MirrorHost).not.toBe(worldB.mirrorTypes.MirrorHost);
    expect(worldA.enemyTypes.BOSSFX.q).toHaveLength(1);
    expect(worldB.enemyTypes.BOSSFX.q).toHaveLength(0);
    expect(Object.isFrozen(worldA)).toBe(true);
  });

  it("installs the caller-owned structural enemy presentation port once", () => {
    let installs = 0;
    const fixture = createWorldServices(0);
    const options = { ...fixture.options, presentation: noOpPresentation(() => { installs++; }) } satisfies Options;

    createTearWorldSimulationFactories(options);

    expect(installs).toBe(1);
  });
});
