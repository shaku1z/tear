import { describe, expect, it, vi } from "vitest";

import {
  clearPreparedOrActiveDebugWave,
  installLiveDebugHarness,
  type DebugLifecycle,
  type LiveDebugHarnessContext,
} from "../../src/app/engineering/debug-harness";
import { RunLifecycleController } from "../../src/gameplay/run/lifecycle";
import { createParticleSystem, type ParticleSystem } from "../../src/presentation/particles";
import { CONFIG } from "../../src/config/game-config";
import { createCosmeticEmissionRandom } from "../../src/domain/cosmetic-emission-random";
import { DEFAULT_COSMETIC_LOOKS } from "../../src/presentation/cosmetic-defaults";

const variantFields = {
  spark: { vx: 2, vy: -3 },
  ring: { r: 6 },
  ribbon: { x1: 5, y1: 6 },
  edgeTrace: { x1: 5, y1: 6, thickness: 2 },
  contactMark: { tx: 1, ty: 0, length: 8, thickness: 2 },
  groundPulse: { nx: 0, ny: 1, halfWidth: 12 },
  muzzleWedge: { dx: 1, dy: 0, length: 12, halfWidth: 3 },
  shard: { vx: 2, vy: -3, rot: 0.2, spin: -2, size: 6 },
  flash: { r: 9 },
  shock: { r: 9, vr: 4, thick: 2 },
  smoke: { vx: 2, vy: -3, size: 6 },
  ghost: { hw: 16, hh: 25 },
  ember: { vx: 2, vy: -3, size: 6 },
  drip: { vx: 2, vy: -3, size: 6 },
};
function particleFixture(enabled = true, realOwner?: ParticleSystem, lowGraphics = true) {
  const list: Record<string, unknown>[] = [{ type: "spark", x: 800, y: 775, life: 0.2, max: 0.34, vx: 2, vy: -3 }];
  const fakeOwner = {
    list,
    view: null as null | { left: number; top: number; right: number; bottom: number },
    _replacementCursor: 219,
  };
  const fx = realOwner ? (realOwner as unknown as typeof fakeOwner) : fakeOwner;
  const player = {
    x: 800,
    y: 775,
    vy: -260,
    hw: 16,
    hh: 25,
    facing: 1,
    onGround: true,
    iframe: 0.9,
    dashTimer: 0,
    cinematicGraceT: 0,
  };
  const blade = {
    x: 880,
    y: 770,
    tipX: 978,
    tipY: 775,
    angle: 0.03,
    state: "held",
    model: "sword",
    trail: [],
    chainPoints: [],
    reversals: [],
  };
  const effects = { highBudget: 320, lowBudget: 110, cullMargin: 180 };
  const entropy = createCosmeticEmissionRandom();
  let api: Record<string, unknown> | undefined;
  const context = {
    enabled,
    dependencies: {
      FX: fx,
      CONFIG: { effects, blade: { handOffsetX: 5, handOffsetY: -5 }, colors: { eye: "#fff", perfect: "#abc" } },
      GFX: { low: lowGraphics },
      A11Y: { reducedMotion: false, highContrast: true, flashScale: 0.5 },
      CLOCK: { sim: 1.25 },
      cosmeticEmissionRandom: entropy,
      THEME: { dark: false, ink: "#000", rim: "#fff" },
    },
    state: { player: () => player, blade: () => blade },
    install: (value: object) => {
      api = value as Record<string, unknown>;
    },
  } as unknown as LiveDebugHarnessContext;
  installLiveDebugHarness(context);
  const read = () => {
    const observer = api?.presentationDiagnostics;
    if (typeof observer !== "function") throw new Error("observer missing");
    return Reflect.apply(observer, api, []) as {
      particles: typeof fx;
      policy: { effects: object; settings: object; entropyOwner: string };
      renderInputs: { player: typeof player; blade: typeof blade };
    };
  };
  return { fx, player, blade, effects, entropy, read, api: () => api };
}

describe("read-only live particle diagnostics", () => {
  it("observes real owner damage burst/drips without entropy, admission, update or draw calls", () => {
    const random = vi.fn(() => 0.5);
    const owner = createParticleSystem({
      looks: DEFAULT_COSMETIC_LOOKS,
      effects: CONFIG.effects,
      lowGraphics: () => false,
      reducedMotion: () => false,
      random,
    });
    owner.setViewRect({ left: 0, top: 0, right: 1600, bottom: 900 });
    expect(owner.burst(800, 775, 1, -0.5, 9, "#e23b3b")).toMatchObject({ accepted: true, requested: 9, emitted: 9 });
    owner.drip(800, 779);
    owner.drip(794, 769);
    expect(owner.list).toHaveLength(11);
    const before = structuredClone({
      list: owner.list,
      view: owner.view,
      _replacementCursor: owner._replacementCursor,
    });
    const listReference = owner.list,
      viewReference = owner.view,
      entropyCalls = random.mock.calls.length;
    expect(entropyCalls).toBeGreaterThan(0);
    const admission = vi.spyOn(owner, "_emit"),
      update = vi.spyOn(owner, "update"),
      draw = vi.spyOn(owner, "draw");
    try {
      const fixture = particleFixture(true, owner, false);
      expect(fixture.fx).toBe(owner);
      const first = fixture.read(),
        second = fixture.read();
      expect(first.particles).toEqual(before);
      expect(second.particles).toEqual(before);
      const particle = first.particles.list[0];
      if (particle) particle.x = 999;
      first.particles.list.reverse();
      first.particles._replacementCursor = 999;
      if (first.particles.view) first.particles.view.left = 999;
      expect(fixture.read().particles).toEqual(before);
      expect(owner.list).toBe(listReference);
      expect(owner.view).toBe(viewReference);
      expect({ list: owner.list, view: owner.view, _replacementCursor: owner._replacementCursor }).toEqual(before);
      expect(random).toHaveBeenCalledTimes(entropyCalls);
      for (const callback of [admission, update, draw]) expect(callback).not.toHaveBeenCalled();
    } finally {
      admission.mockRestore();
      update.mockRestore();
      draw.mockRestore();
    }
  });
  it.each(Object.entries(variantFields))("preserves raw %s fields and optional color/priority", (type, fields) => {
    const fixture = particleFixture();
    fixture.fx.list[0] = { type, x: -3, y: 4, life: 0.2, max: 0.34, col: null, priority: "combat", ...fields };
    expect(fixture.read().particles).toEqual(fixture.fx);
    expect(fixture.read().policy).toEqual({
      effects: { highBudget: 320, lowBudget: 110, cullMargin: 180 },
      settings: { lowGraphics: true, reducedMotion: false, highContrast: true, flashScale: 0.5 },
      entropyOwner: "per-world cosmetic emission; particlesPresentation.v2",
      entropy: fixture.entropy.snapshot(),
    });
  });
  it("preserves optional absence, order, view and cursor greater than list length without calling entropy", () => {
    const fixture = particleFixture();
    fixture.fx.view = { left: -10, top: -20, right: 1600, bottom: 900 };
    fixture.fx.list.push({ type: "ring", x: 4, y: 5, life: 0.3, max: 0.32, r: 8, col: "#fff", priority: "hazard" });
    const before = structuredClone(fixture.fx),
      random = vi.spyOn(Math, "random");
    try {
      const first = fixture.read(),
        second = fixture.read();
      expect(first).toEqual(second);
      expect(random).not.toHaveBeenCalled();
      const firstParticle = first.particles.list[0];
      if (firstParticle) firstParticle.x = 999;
      first.particles.list.reverse();
      if (first.particles.view) first.particles.view.left = 99;
      first.renderInputs.player.x = 999;
      first.renderInputs.blade.x = 999;
      expect(fixture.fx).toEqual(before);
      expect(fixture.player.x).toBe(800);
      expect(fixture.blade.x).toBe(880);
      expect(fixture.read().particles).toEqual(before);
    } finally {
      random.mockRestore();
    }
  });
  it("uses the maximum policy capacity for retained high-mode particles in low mode", () => {
    const fixture = particleFixture(),
      particle = fixture.fx.list[0];
    fixture.fx.list = Array.from({ length: 320 }, () => ({ ...particle }));
    expect(fixture.read().particles.list).toHaveLength(320);
    fixture.fx.list.push({ ...particle });
    expect(() => fixture.read()).toThrow(/invalid particle diagnostic/);
  });
  it.each([0, 1])("observes renderer arrays independently of valid FX budget %s", (budget) => {
    const fixture = particleFixture();
    fixture.effects.highBudget = budget;
    fixture.effects.lowBudget = budget;
    fixture.fx.list.length = budget;
    const trail = Array.from({ length: 14 }, () => ({ hx: 1, hy: 2, tx: 3, ty: 4 }));
    Reflect.set(fixture.blade, "trail", trail);
    Reflect.set(fixture.blade, "chainPoints", [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    Reflect.set(fixture.blade, "reversals", [{ x: 1, y: 2, directionX: 1, directionY: 0, exited: false }]);
    expect(fixture.read().renderInputs.blade.trail).toEqual(trail);
  });
  it.each([NaN, Infinity, () => 1, "accessor"])("rejects malformed particle data %s", (value) => {
    const fixture = particleFixture();
    if (value === "accessor")
      Object.defineProperty(fixture.fx.list[0] ?? {}, "x", {
        get: () => {
          throw new Error("must not run getter");
        },
        enumerable: true,
      });
    else Reflect.set(fixture.fx.list[0] ?? {}, "x", value);
    expect(() => fixture.read()).toThrow(/invalid particle diagnostic/);
  });
  it("rejects unknown fields/types and malformed view/cursor instead of truncating", () => {
    const fixture = particleFixture();
    Reflect.set(fixture.fx.list[0] ?? {}, "extra", 1);
    expect(() => fixture.read()).toThrow(/invalid particle diagnostic/);
    fixture.fx.list = [{ type: "unsupported", x: 0, y: 0, life: 1, max: 1 }];
    expect(() => fixture.read()).toThrow(/invalid particle diagnostic/);
    fixture.fx.list = [];
    fixture.fx._replacementCursor = -1;
    expect(() => fixture.read()).toThrow(/invalid particle diagnostic/);
    fixture.fx._replacementCursor = 219;
    fixture.fx.view = { left: 10, top: 0, right: -1, bottom: 10 };
    expect(() => fixture.read()).toThrow(/invalid particle diagnostic/);
  });
  it("rejects hidden fields, array accessors and nonfinite renderer inputs without reading accessors", () => {
    const fixture = particleFixture(),
      getter = vi.fn(() => 1);
    Object.defineProperty(fixture.fx.list[0] ?? {}, "hidden", { value: () => 1 });
    expect(() => fixture.read()).toThrow(/invalid particle diagnostic/);
    fixture.fx.list = [{ type: "ring", x: 0, y: 0, life: 0.2, max: 0.3, r: 4 }];
    Object.defineProperty(fixture.fx.list, "0", { get: getter, enumerable: true });
    expect(() => fixture.read()).toThrow(/invalid particle diagnostic/);
    expect(getter).not.toHaveBeenCalled();
    fixture.fx.list = [];
    fixture.player.x = NaN;
    expect(() => fixture.read()).toThrow(/invalid particle diagnostic/);
  });
  it("does not install any observer when debug is disabled", () => {
    expect(particleFixture(false).api()).toBeUndefined();
  });
});

function debugLifecycle(controller: RunLifecycleController): DebugLifecycle {
  return {
    get phase() {
      return controller.phase;
    },
    activateWave() {
      controller.activateWave();
    },
    clearWave() {
      controller.clearWave();
    },
    prepareReward(reward) {
      controller.prepareReward(reward);
    },
    terminate(outcome) {
      controller.terminate(outcome);
    },
  };
}

describe("live debug journey wave preparation", () => {
  it("activates a deferred prepared wave before clearing it", () => {
    const controller = new RunLifecycleController();
    controller.start("agent-journey");
    controller.prepareWave(1, false, true);

    clearPreparedOrActiveDebugWave(debugLifecycle(controller));

    expect(controller.snapshot()).toMatchObject({
      phase: "wave-cleared",
      activationDeferred: false,
      revision: 4,
    });
  });

  it("clears an already active wave and rejects unrelated phases", () => {
    const active = new RunLifecycleController();
    active.start("active");
    active.prepareWave(1, false, false);
    active.activateWave();
    clearPreparedOrActiveDebugWave(debugLifecycle(active));
    expect(active.phase).toBe("wave-cleared");

    const preparing = new RunLifecycleController();
    preparing.start("preparing");
    expect(() => {
      clearPreparedOrActiveDebugWave(debugLifecycle(preparing));
    }).toThrow("active or prepared");
  });
});
