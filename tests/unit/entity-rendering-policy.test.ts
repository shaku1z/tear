import { describe, expect, it } from "vitest";
import { createBladeRenderer } from "../../src/presentation/entities/blade-renderer";
import { createMirrorRenderer } from "../../src/presentation/entities/mirror-renderer";
import { createProjectileRenderer } from "../../src/presentation/entities/projectile-renderer";

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
    projectile: createProjectileRenderer({ clock, policy: { colors, world: { groundY: 700 } }, graphics, theme, clamp }),
  };
}

describe("entity rendering policies", () => {
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
});
