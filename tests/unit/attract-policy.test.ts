import { describe, expect, it } from "vitest";
import { clamp } from "../../src/domain/geometry";
import { STAGES } from "../../src/gameplay/stages";
import { createAttract, type AttractDependencies, type AttractVisualPolicy } from "../../src/presentation/attract-runtime";
import type { ParticleSystem } from "../../src/presentation/particles";

class PlayerStub {
  aiInput: unknown;
  dashCharges = 1;
  facing = 1;
  hh = 25;
  hp = 1;
  maxHp = 1;
  onGround = true;
  constructor(public x: number, public y: number) {}
  update(): void { void 0; }
  draw(): void { void 0; }
}

class BladeStub {
  aimOverride: { x: number; y: number } | undefined;
  tipSpeed = 0;
  x = 0;
  y = 0;
  tipX = 0;
  tipY = 0;
  update(): void { void 0; }
  draw(): void { void 0; }
}

function policy(
  width: number,
  height: number,
  prefix: string,
  random: () => number = () => 0.5,
): AttractVisualPolicy {
  return {
    view: { w: width, h: height }, world: { gravity: 1000, groundY: height - 20 },
    blade: { aimRadius: 80, minHitSpeed: 900 }, overscan: { x: 9 }, lowGraphics: () => false, random,
    colors: {
      charger: `${prefix}-charger`, ranged: `${prefix}-ranged`, bomber: `${prefix}-bomber`,
      armored: `${prefix}-armored`, flyer: `${prefix}-flyer`, wraith: `${prefix}-wraith`, perfect: `${prefix}-perfect`,
    },
    theme: { dark: false, ink: `${prefix}-ink`, rim: `${prefix}-rim`, set: () => undefined },
  };
}

function dependencies(visualPolicy: AttractVisualPolicy, effects: string[][]): AttractDependencies {
  const fx = {
    reset: () => undefined, update: () => undefined, draw: () => undefined,
    death: (...values: unknown[]) => { effects.push(["death", ...values.map(String)]); },
    burst: (...values: unknown[]) => { effects.push(["burst", ...values.map(String)]); },
    explode: (...values: unknown[]) => { effects.push(["explode", ...values.map(String)]); },
    flash: (...values: unknown[]) => { effects.push(["flash", ...values.map(String)]); },
    ghost: (...values: unknown[]) => { effects.push(["ghost", ...values.map(String)]); },
  } as unknown as ParticleSystem;
  return {
    Backdrop: { fillFull: () => undefined, draw: () => undefined, platform: () => undefined, post: () => undefined },
    Blade: BladeStub as unknown as AttractDependencies["Blade"], FX: fx,
    Player: PlayerStub as unknown as AttractDependencies["Player"], STAGES,
    policy: visualPolicy, clamp,
  };
}

describe("attract visual policy", () => {
  it("keeps view, world layout, and palette effects local to each controller", () => {
    const firstEffects: string[][] = [], secondEffects: string[][] = [];
    const first = createAttract(dependencies(policy(400, 300, "first"), firstEffects));
    const second = createAttract(dependencies(policy(700, 500, "second"), secondEffects));

    first.reset();
    second.reset();
    first._explode(10, 20);
    second._explode(10, 20);

    expect(first).toMatchObject({ W: 400, H: 300, GY: 280 });
    expect(second).toMatchObject({ W: 700, H: 500, GY: 480 });
    expect(first.platforms[0]).toMatchObject({ x: 0, y: 280, w: 400, h: 20, floor: true });
    expect(second.platforms[0]).toMatchObject({ x: 0, y: 480, w: 700, h: 20, floor: true });
    expect(first.foes.every((foe) => foe.color.startsWith("first-"))).toBe(true);
    expect(second.foes.every((foe) => foe.color.startsWith("second-"))).toBe(true);
    expect(firstEffects).toContainEqual(["explode", "10", "20", "first-bomber", "1.3"]);
    expect(secondEffects).toContainEqual(["explode", "10", "20", "second-bomber", "1.3"]);
  });

  it("uses the visual policy's local cosmetic entropy", () => {
    let firstCalls = 0;
    let secondCalls = 0;
    const first = createAttract(dependencies(policy(400, 300, "first", () => {
      firstCalls += 1;
      return 0.1;
    }), []));
    const second = createAttract(dependencies(policy(400, 300, "second", () => {
      secondCalls += 1;
      return 0.9;
    }), []));

    first.reset();
    second.reset();

    expect(firstCalls).toBeGreaterThan(1);
    expect(secondCalls).toBeGreaterThan(1);
    expect(first.foes.every((foe) => foe.kind === "charger")).toBe(true);
    expect(second.foes.every((foe) => foe.kind === "wraith")).toBe(true);
  });
});
