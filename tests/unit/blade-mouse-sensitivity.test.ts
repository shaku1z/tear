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
});
