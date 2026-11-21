import { describe, expect, it, vi } from "vitest";
import { createParticleSystem } from "../../src/presentation/particles";
import { createLiveParticlePresentationState } from "../../src/app/world/detached/particle-state";
import { createCosmeticEmissionRandom } from "../../src/domain/cosmetic-emission-random";
import { DEFAULT_COSMETIC_LOOKS } from "../../src/presentation/cosmetic-defaults";

describe("live particle presentation owner", () => {
  it("prepares legacy v1/absence only from staged seed/tick, without changing outgoing entropy", () => {
    const entropy = createCosmeticEmissionRandom(),
      effects = { highBudget: 4, lowBudget: 1, cullMargin: 180 };
    const fx = createParticleSystem({
      looks: DEFAULT_COSMETIC_LOOKS,
      effects,
      lowGraphics: () => false,
      reducedMotion: () => false,
      random: entropy.next,
    });
    const owner = createLiveParticlePresentationState(
      fx,
      () => ({ effects, lowGraphics: false, reducedMotion: false }),
      entropy,
    );
    fx.spark(1, 2, 1, 0);
    const current = owner.capture();
    const legacy = {
      version: 1 as const,
      list: current.list,
      view: current.view,
      replacementCursor: current.replacementCursor,
      policy: current.policy,
    };
    const before = owner.capture(),
      prepared = owner.prepare(legacy, 17, 25);
    expect(owner.capture()).toEqual(before);
    entropy.resetRun(999);
    entropy.next();
    expect(owner.prepare(legacy, 17, 25)).toEqual(prepared);
    owner.restore(prepared);
    expect(owner.capture().list).toEqual(legacy.list);
    expect(entropy.snapshot().provenance).toBe("legacy-derived");
    fx.spark(1, 2, 1, 0);
    expect(entropy.snapshot().provenance).toBe("legacy-derived");
    const absent = owner.prepare(undefined, 17, 25);
    expect(absent.entropy).toEqual(prepared.entropy);
    entropy.resetRun(17);
    expect(entropy.snapshot().provenance).toBe("run-start");
  });
  it("restores three actual fixed steps exactly, retaining owners and mutable clones without emissions or entropy", () => {
    const entropy = createCosmeticEmissionRandom(),
      random = vi.fn(entropy.next),
      effects = { highBudget: 10, lowBudget: 1, cullMargin: 180 };
    const fx = createParticleSystem({
      looks: DEFAULT_COSMETIC_LOOKS,
      effects,
      lowGraphics: () => false,
      reducedMotion: () => false,
      random,
    });
    const owner = createLiveParticlePresentationState(
      fx,
      () => ({ effects, lowGraphics: false, reducedMotion: false }),
      entropy,
    );
    fx.spark(800, 775, 1, -1);
    fx.drip(800, 775);
    fx.setViewRect({ left: 0, top: 0, right: 1200, bottom: 900 });
    const saved = owner.capture(),
      list = fx.list,
      view = fx.view,
      first = fx.list[0];
    const emit = vi.spyOn(fx, "_emit"),
      reset = vi.spyOn(fx, "reset");
    random.mockClear();
    for (let i = 0; i < 3; i++) fx.update(1 / 120);
    expect(owner.capture()).not.toEqual(saved);
    owner.restore(owner.prepare(saved, 17, 0));
    expect(owner.capture()).toEqual(saved);
    expect(fx.list).toBe(list);
    expect(fx.view).toBe(view);
    expect(fx.list[0]).not.toBe(first);
    expect(Object.isFrozen(fx.list[0])).toBe(false);
    fx.update(1 / 120);
    expect(owner.capture()).not.toEqual(saved);
    expect(saved.list[0]?.x).toBe(800);
    expect(random).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    owner.restore(owner.prepare(undefined, 17, 0));
    expect(fx.list).toBe(list);
    expect(fx.list).toEqual([]);
    expect(fx.view).toBeNull();
    expect(fx._replacementCursor).toBe(0);
  });

  it("retains data under changed user settings without restoring settings or claiming equal future decay", () => {
    let lowGraphics = false,
      reducedMotion = false;
    const effects = { highBudget: 4, lowBudget: 1, cullMargin: 180 };
    const fx = createParticleSystem({
      looks: DEFAULT_COSMETIC_LOOKS,
      effects,
      lowGraphics: () => lowGraphics,
      reducedMotion: () => reducedMotion,
      random: () => 0.5,
    });
    const owner = createLiveParticlePresentationState(
      fx,
      () => ({ effects, lowGraphics, reducedMotion }),
      createCosmeticEmissionRandom(),
    );
    fx.spark(1, 2, 1, 0);
    fx.ring(1, 2);
    const saved = owner.capture();
    lowGraphics = true;
    reducedMotion = true;
    fx.update(1 / 120);
    owner.restore(owner.prepare(saved, 17, 0));
    expect(owner.capture().list).toEqual(saved.list);
    expect(owner.capture().policy).toMatchObject({ lowGraphics: true, reducedMotion: true });
    expect(lowGraphics).toBe(true);
    expect(reducedMotion).toBe(true);
    owner.restore(owner.prepare({ ...saved, view: null }, 17, 0));
    expect(fx.view).toBeNull();
  });
});
