import { describe, expect, it, vi } from "vitest";
import { createParticleSystem } from "../../src/presentation/particles";
import { createLiveParticlePresentationState } from "../../src/app/live-particle-presentation-state";

describe("live particle presentation owner", () => {
  it("restores three actual fixed steps exactly, retaining owners and mutable clones without emissions or entropy", () => {
    const random = vi.fn(() => 0.5), effects = { highBudget: 10, lowBudget: 1, cullMargin: 180 };
    const fx = createParticleSystem({ effects, lowGraphics: () => false, reducedMotion: () => false, random });
    const owner = createLiveParticlePresentationState(fx, () => ({ effects, lowGraphics: false, reducedMotion: false }));
    fx.spark(800, 775, 1, -1); fx.drip(800, 775); fx.setViewRect({ left: 0, top: 0, right: 1200, bottom: 900 });
    const saved = owner.capture(), list = fx.list, view = fx.view, first = fx.list[0];
    const emit = vi.spyOn(fx, "_emit"), reset = vi.spyOn(fx, "reset"); random.mockClear();
    for (let i = 0; i < 3; i++) fx.update(1 / 120);
    expect(owner.capture()).not.toEqual(saved);
    owner.restore(saved);
    expect(owner.capture()).toEqual(saved); expect(fx.list).toBe(list); expect(fx.view).toBe(view); expect(fx.list[0]).not.toBe(first);
    expect(Object.isFrozen(fx.list[0])).toBe(false); fx.update(1 / 120);
    expect(owner.capture()).not.toEqual(saved); expect(saved.list[0]?.x).toBe(800);
    expect(random).not.toHaveBeenCalled(); expect(emit).not.toHaveBeenCalled(); expect(reset).not.toHaveBeenCalled();
    owner.restore(undefined); expect(fx.list).toBe(list); expect(fx.list).toEqual([]); expect(fx.view).toBeNull(); expect(fx._replacementCursor).toBe(0);
  });

  it("retains data under changed user settings without restoring settings or claiming equal future decay", () => {
    let lowGraphics = false, reducedMotion = false;
    const effects = { highBudget: 4, lowBudget: 1, cullMargin: 180 };
    const fx = createParticleSystem({ effects, lowGraphics: () => lowGraphics, reducedMotion: () => reducedMotion, random: () => 0.5 });
    const owner = createLiveParticlePresentationState(fx, () => ({ effects, lowGraphics, reducedMotion }));
    fx.spark(1, 2, 1, 0); fx.ring(1, 2); const saved = owner.capture();
    lowGraphics = true; reducedMotion = true; fx.update(1 / 120); owner.restore(saved);
    expect(owner.capture().list).toEqual(saved.list); expect(owner.capture().policy).toMatchObject({ lowGraphics: true, reducedMotion: true });
    expect(lowGraphics).toBe(true); expect(reducedMotion).toBe(true);
    owner.restore({ ...saved, view: null }); expect(fx.view).toBeNull();
  });
});
