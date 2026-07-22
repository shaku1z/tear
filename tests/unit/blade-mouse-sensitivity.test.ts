import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { clamp, len, lerp, lerpAngle } from "../../src/domain/geometry";
import { createBlade } from "../../src/gameplay/entities/blade";

describe("blade mouse sensitivity contract", () => {
  it("scales captured relative mouse deltas using the applied sensitivity", () => {
    const config = structuredClone(CONFIG);
    config.blade.aimSensitivity = 0.4;
    const Input = {
      touchAim: false,
      stickAim: null,
      locked: true,
      mouseX: 0,
      mouseY: 0,
      tetherHeld: false,
      consumeDelta: () => ({ x: 10, y: -5 }),
    };
    const Blade = createBlade({
      CLOCK: { sim: 0 },
      CONFIG: config,
      Input,
      presentation: { draw: () => undefined },
      clamp,
      len,
      lerp,
      lerpAngle,
    });
    const blade = new Blade();
    blade.aimX = 0;
    blade.aimY = 0;

    blade._updateAim({ x: 0, y: 0 }, 1 / 60);

    expect(blade.aimX).toBeCloseTo(4);
    expect(blade.aimY).toBeCloseTo(-2);
  });

  it("samples captured mouse movement before a recorded aim override is applied", () => {
    const config = structuredClone(CONFIG);
    config.blade.aimSensitivity = 0.4;
    let consumed = 0;
    const Blade = createBlade({
      CLOCK: { sim: 0 }, CONFIG: config,
      Input: { touchAim: false, stickAim: null, locked: true, mouseX: 0, mouseY: 0, tetherHeld: false,
        consumeDelta: () => { consumed += 1; return { x: 10, y: -5 }; } },
      presentation: { draw: () => undefined }, clamp, len, lerp, lerpAngle,
    });
    const blade = new Blade();
    blade.aimX = 0; blade.aimY = -80;
    blade.aimOverride = { x: -500, y: 500 };

    const sampled = blade.captureDeviceAim({ x: 100, y: 100 });

    expect(sampled).toEqual({ x: 4, y: -82 });
    expect(consumed).toBe(1);
  });
});
