import { describe, expect, it } from "vitest";
import { createMirrorTypes } from "../../src/gameplay/entities/mirror.ts";

class FakeEnemy {
  constructor(x, y, config) {
    Object.assign(this, { x, y, vx: 0, vy: 0, facing: 1, onGround: true, flash: 0 });
    this.hw = (config.w || 30) / 2;
    this.hh = (config.h || 46) / 2;
    this.hp = this.maxHp = config.hp || 100;
  }
  tickTimers() { return undefined; }
  hit(damage, kx, ky) {
    this.hp -= damage;
    this.vx += kx;
    this.vy += ky;
    return damage;
  }
  drawHpBar() { return undefined; }
}

class FakePlayer {
  constructor(x, y) {
    Object.assign(this, { x, y, vx: 0, vy: 0, hh: 23, hw: 15, onGround: true, dashTimer: 0 });
  }
  update() { return undefined; }
}

class FakeBlade {
  constructor() {
    Object.assign(this, { state: "held", tipSpeed: 0, tipX: 0, tipY: 0, tipVX: 0, tipVY: 0 });
    this.aimPoint = { x: 0, y: 0 };
  }
  aimOverridePoint() { return this.aimPoint; }
  update() { return undefined; }
}

function dependencies(randomValues = [0]) {
  let index = 0;
  return {
    Blade: FakeBlade,
    CLOCK: { sim: 0 },
    CONFIG: {
      echo: { hp: 1000, w: 44, h: 70 },
      blade: { aimRadius: 120, minHitSpeed: 1000 },
      view: { w: 1600 },
      world: { groundY: 780 },
      juice: { zoomBig: 1.1 },
      hitStop: { small: 0.02, big: 0.05 },
      colors: { eye: "#fff" },
    },
    Enemy: FakeEnemy,
    FX: {},
    GAME_RANDOM: { next: () => randomValues[index++ % randomValues.length] },
    GFX: { low: true },
    Player: FakePlayer,
    Projectile: class {
      constructor() { this.kind = "test"; }
      update() { return undefined; }
    },
    SFX: {},
    THEME: { ink: "#111" },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    cosmeticRandom: () => 0.5,
    getWeapon: (id) => ({ id, model: `${id}-model` }),
    lerp: (a, b, t) => a + (b - a) * t,
    lerpAngle: (a, b, t) => a + (b - a) * t,
  };
}

describe("Mirror entity factory", () => {
  it("injects the real actor, blade, weapon catalog, and phase contract", () => {
    const { Mirror, MirrorHost } = createMirrorTypes(dependencies());
    const host = new MirrorHost(500, 600, { weaponId: "hammer", airBonus: true });

    Mirror.attach(host, host._mods);

    expect(Mirror.actor).toBeInstanceOf(FakePlayer);
    expect(Mirror.blade).toBeInstanceOf(FakeBlade);
    expect(Mirror.blade.model).toBe("hammer-model");
    expect(Mirror.airBias).toBe(1);
    expect(Mirror.phase).toBe(1);
    host.hp = host.maxHp * 0.5;
    expect(Mirror.phase).toBe(2);
    host.hp = host.maxHp * 0.2;
    expect(Mirror.phase).toBe(3);
  });

  it("forwards host knockback into the reflected actor while preserving the host body", () => {
    const { Mirror, MirrorHost } = createMirrorTypes(dependencies());
    const host = new MirrorHost(500, 600, null);
    Mirror.attach(host, null);

    const dealt = host.hit(17, 12, -8);

    expect(dealt).toBe(17);
    expect(host.vx).toBe(0);
    expect(host.vy).toBe(0);
    expect(Mirror.actor.vx).toBe(12);
    expect(Mirror.actor.vy).toBe(-8);
    expect(Mirror._stagger).toBeGreaterThanOrEqual(0.1);
  });

  it("uses injected deterministic gameplay randomness for reflection placement", () => {
    const { ReflectionEnemy } = createMirrorTypes(dependencies([0.99, 0.25]));

    const reflection = new ReflectionEnemy(800, 300);

    expect(reflection._corner).toEqual({ x: 1450, y: 500 });
    expect(reflection._bob).toBeCloseTo(0.25 * 6.28);
  });
});
