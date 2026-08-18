import { describe, expect, it } from "vitest";

import { createTearWorldTransientState } from "../../src/gameplay/runtime/tear-world-transient-state";

describe("Tear world transient state", () => {
  it("starts every world from the same neutral opening and impact defaults", () => {
    const transient = createTearWorldTransientState();

    expect(transient.protection).toEqual({ active: false, lastMode: null });
    expect(transient.opening).toEqual({ throwCooldown: 0, wasDashing: false, wasSwinging: false,
      wasOnGround: true, dashGhostTime: 0, landingVelocity: 0 });
    expect(transient.impact).toEqual({ hitStop: 0, slowMotion: 0, shake: 0 });
    expect(transient.feel).toEqual({ timeScale: 1, zoom: 1, flash: 0, bannerSeconds: 0,
      worldZoom: 1, worldZoomTarget: 1, rankPopupSeconds: 0, rankPopupText: "" });
    expect(Object.isFrozen(transient)).toBe(true);
  });

  it("restores dilation and framing on run reset without clearing the rank popup", () => {
    const transient = createTearWorldTransientState();
    const feel = transient.feel;

    Object.assign(feel, { timeScale: 0.2, zoom: 1.4, flash: 0.8, bannerSeconds: 2,
      worldZoom: 0.6, worldZoomTarget: 0.6, rankPopupSeconds: 0.9, rankPopupText: "SSS" });
    transient.resetFeel();

    expect(feel).toBe(transient.feel);
    expect(feel).toEqual({ timeScale: 1, zoom: 1, flash: 0, bannerSeconds: 0,
      worldZoom: 1, worldZoomTarget: 1, rankPopupSeconds: 0.9, rankPopupText: "SSS" });
  });

  it("assigns into the owned records so existing readers never hold a stale object", () => {
    const transient = createTearWorldTransientState();
    const protection = transient.protection;
    const opening = transient.opening;
    const impact = transient.impact;

    transient.assignProtection({ active: true, lastMode: "sever" });
    transient.assignOpening({ throwCooldown: 0.4, wasDashing: true, wasSwinging: true, wasOnGround: false,
      dashGhostTime: 0.2, landingVelocity: 900 });
    transient.assignImpact({ hitStop: 0.05, slowMotion: 0.75, shake: 8 });

    expect(protection).toBe(transient.protection);
    expect(protection).toEqual({ active: true, lastMode: "sever" });
    expect(opening.throwCooldown).toBe(0.4);
    expect(opening.landingVelocity).toBe(900);
    expect(impact).toEqual({ hitStop: 0.05, slowMotion: 0.75, shake: 8 });
  });

  it("keeps two worlds isolated and does not retain the seeded option objects", () => {
    const seed = { hitStop: 1, slowMotion: 2, shake: 3 };
    const first = createTearWorldTransientState({ impact: seed, opening: { throwCooldown: 5, wasDashing: true,
      wasSwinging: false, wasOnGround: false, dashGhostTime: 1, landingVelocity: 2 } });
    const second = createTearWorldTransientState();

    first.assignImpact({ hitStop: 9, slowMotion: 9, shake: 9 });

    first.feel.worldZoom = 0.5;

    expect(seed).toEqual({ hitStop: 1, slowMotion: 2, shake: 3 });
    expect(first.opening.throwCooldown).toBe(5);
    expect(second.impact).toEqual({ hitStop: 0, slowMotion: 0, shake: 0 });
    expect(second.opening.throwCooldown).toBe(0);
    expect(second.feel.worldZoom).toBe(1);
  });
});
