import { describe, expect, it } from "vitest";
import { createBladeRenderer } from "../../src/presentation/entities/blade-renderer";
import { createMirrorRenderer } from "../../src/presentation/entities/mirror-renderer";
import { createProjectileRenderer } from "../../src/presentation/entities/projectile-renderer";
import { createEnemyRendererRuntime } from "../../src/presentation/enemies/renderers/enemy-renderer-runtime";
import type { EnemyPresentationPolicy } from "../../src/presentation/enemies/renderers/enemy-renderer-types";

function canvas(styles: string[]): CanvasRenderingContext2D {
  const target = {
    save: () => undefined, restore: () => undefined, beginPath: () => undefined,
  } as Record<PropertyKey, unknown>;
  return new Proxy(target, {
    get(value, property): unknown {
      if (property === "createRadialGradient") return () => ({ addColorStop: () => undefined });
      return value[property] ?? (() => undefined);
    },
    set(value, property, next): boolean {
      if (property === "fillStyle" || property === "strokeStyle") styles.push(String(next));
      value[property] = next;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function renderers(prefix: string) {
  const clock = { sim: 1 };
  const graphics = { low: true };
  const theme = { dark: false, ink: `${prefix}-ink`, rim: `${prefix}-rim` };
  const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
  const colors = {
    armoredShield: `${prefix}-shield`, bladeGlow: `${prefix}-glow`, bladeTrail: `${prefix}-trail`,
    bomber: `${prefix}-bomber`, charger: `${prefix}-charger`, deflected: `${prefix}-deflected`,
    enemyShot: `${prefix}-shot`, eye: `${prefix}-eye`, perfect: `${prefix}-perfect`, slam: `${prefix}-slam`, sludge: `${prefix}-sludge`,
  };
  return {
    blade: createBladeRenderer({
      clock, policy: { colors, juice: { trailAlpha: 0.4 } }, graphics, theme, clamp,
      len: Math.hypot, lerp: (from, to, amount) => from + (to - from) * amount,
    }),
    mirror: createMirrorRenderer({
      clock, policy: { colors, world: { groundY: 700 } }, effects: { burst: () => undefined }, graphics, theme, clamp,
      cosmeticRandom: () => 0.5,
    }),
    projectile: createProjectileRenderer({ clock, policy: { colors, world: { groundY: 700 } }, graphics, theme, clamp,
      accessibility: { highContrast: false, reducedMotion: true } }),
  };
}

function enemyPolicy(prefix: string): EnemyPresentationPolicy {
  return {
    view: { w: 1600, h: 900 }, world: { groundY: 800 },
    colors: {
      armored: `${prefix}-armored`, armoredShield: `${prefix}-shield`, bladeGlow: `${prefix}-glow`, bladeTrail: `${prefix}-trail`,
      bomber: `${prefix}-bomber`, boss: `${prefix}-boss`, charger: `${prefix}-charger`, chimera: `${prefix}-chimera`,
      deflected: `${prefix}-deflected`, enemyShot: `${prefix}-shot`, eye: `${prefix}-eye`, flyer: `${prefix}-flyer`,
      perfect: `${prefix}-perfect`, ranged: `${prefix}-ranged`, slam: `${prefix}-slam`, sludge: `${prefix}-sludge`,
    },
    aldric: { ascendHalfW: 1, chargeWindup: 1, crownfireWindup: 1, overheadRange: 1, overheadWindup: 1, thronefallRise: 1, vaultArc: 1 },
    bossTheater: { introDur: 1 }, chargedShot: { r: 1 }, exotic: { geoWallH: 1, geoWallW: 1, gravReach: 1 },
    source: { beamW: 1, beamWarn: 1, collapseWindup: 1, dashWindup: 1, depthHandW: 1, depthMawW: 1, depthRearAlpha: 1, depthRearScale: 1, voidFormScale: 1, voidWispTell: 1 },
    warden: { batonWindup: 1, lungeWind: 1, lungeWindup: 1, stringWind: 1 },
  };
}

function enemyRuntime(prefix: string) {
  return createEnemyRendererRuntime({
    A11Y: { highContrast: false, reducedMotion: true }, CLOCK: { sim: 1 }, policy: enemyPolicy(prefix),
    GFX: { low: true }, THEME: { dark: false, ink: `${prefix}-ink`, rim: `${prefix}-rim` },
    UI: { font: () => "", tag: () => undefined, t: { type: { caption: 1 } } },
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)), len: Math.hypot,
    lerp: (from, to, amount) => from + (to - from) * amount,
  });
}

describe("entity rendering policies", () => {
  it("keeps Seed Arc landing and projectile cues visible in high contrast with reduced motion and low graphics", () => {
    const styles: string[] = [];
    const renderer = createProjectileRenderer({
      clock: { sim: 2 },
      policy: { colors: {
        bomber: "bomber", charger: "charger", deflected: "deflected", enemyShot: "shot",
        perfect: "perfect", slam: "slam", sludge: "sludge",
      }, world: { groundY: 700 } },
      graphics: { low: true }, theme: { dark: false, ink: "ink" },
      accessibility: { highContrast: true, reducedMotion: true },
      clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
    });
    renderer.draw(canvas(styles), {
      x: 100, y: 200, vx: 20, vy: 30, r: 12, histCount: 0,
      bossAttack: "seed-arc", landingX: 300, landingY: 700, landingT: 0.8,
      deflected: false, perfect: false, charged: false, bomb: false, mine: false, armed: false,
      shock: false, root: 0, mud: false, tint: "green", kind: "orb", sweeper: false,
      crownfire: false, integrity: 0, maxIntegrity: 0, sweeperState: null, spinDir: 1,
      embedded: false, sourceStolen: null, trailPoint: () => undefined,
    });
    expect(styles.filter((style) => style === "#fff36b").length).toBeGreaterThanOrEqual(2);
    expect(styles).toContain("#fff");
  });

  it("keeps Blade, Mirror, and Projectile palette choices local to each renderer set", () => {
    const first = renderers("first"), second = renderers("second");
    const firstStyles: string[] = [], secondStyles: string[] = [];
    const firstSurface = canvas(firstStyles), secondSurface = canvas(secondStyles);

    first.blade.draw(firstSurface, {
      model: "chainblade", state: "held", tension: 1, x: 10, y: 10, tipX: 30, tipY: 10, angle: 0,
      throwSizeMult: 1, finalFree: false, glowV: 0, trail: [], handPos: () => ({ x: 0, y: 0 }), lastHand: () => ({ x: 0, y: 0 }),
    } as never, {} as never);
    second.blade.draw(secondSurface, {
      model: "chainblade", state: "held", tension: 1, x: 10, y: 10, tipX: 30, tipY: 10, angle: 0,
      throwSizeMult: 1, finalFree: false, glowV: 0, trail: [], handPos: () => ({ x: 0, y: 0 }), lastHand: () => ({ x: 0, y: 0 }),
    } as never, {} as never);
    first.mirror.drawHostFallback(firstSurface, { x: 20, y: 30, hw: 5, hh: 8, facing: 1 });
    second.mirror.drawHostFallback(secondSurface, { x: 20, y: 30, hw: 5, hh: 8, facing: 1 });
    first.projectile.draw(firstSurface, { mine: true, armed: false, deflected: false, x: 20, y: 30, r: 8 } as never);
    second.projectile.draw(secondSurface, { mine: true, armed: false, deflected: false, x: 20, y: 30, r: 8 } as never);

    expect(firstStyles).toEqual(expect.arrayContaining(["first-perfect", "first-eye", "first-bomber"]));
    expect(secondStyles).toEqual(expect.arrayContaining(["second-perfect", "second-eye", "second-bomber"]));
  });

  it("keeps legacy enemy cinematic palette policy local to each runtime", () => {
    const firstStyles: string[] = [], secondStyles: string[] = [];
    const pose = { cinematicPose: "colossusCore", cinematicT: 1, color: "#fff", x: 40, y: 50, hw: 20, hh: 30, facing: 1 };

    enemyRuntime("first").drawBossTransformationWorld(canvas(firstStyles), pose as never);
    enemyRuntime("second").drawBossTransformationWorld(canvas(secondStyles), pose as never);

    expect(firstStyles).toContain("first-slam");
    expect(secondStyles).toContain("second-slam");
  });
});
