import { describe, expect, it } from "vitest";
import { CONFIG, OVERSCAN } from "../../src/config/game-config";
import { clamp } from "../../src/domain/geometry";
import { createTearWorldClock } from "../../src/gameplay/runtime/tear-world-clock";
import { createUi } from "../../src/presentation/ui";
import { runContentSurface } from "../../src/presentation/screens/run-overlay-panels";
import type { ScreenRenderContext } from "../../src/presentation/screens/contracts";

describe("run overlay content surface", () => {
  it("fills content on a fully opaque panel over the translucent scrim", () => {
    const ui = createUi({
      CLOCK: createTearWorldClock(),
      presentation: { view: CONFIG.view, colors: CONFIG.colors, overscan: OVERSCAN },
      clamp,
      Input: { mode: "mouse" },
    });
    const fills: number[] = [];
    const values = new Map<PropertyKey, unknown>([["globalAlpha", 1]]);
    const canvas = new Proxy({} as CanvasRenderingContext2D, {
      get: (_target, property) =>
        property === "fillRect"
          ? () => fills.push(values.get("globalAlpha") as number)
          : (values.get(property) ?? (() => undefined)),
      set: (_target, property, value) => {
        values.set(property, value);
        return true;
      },
    });
    runContentSurface({ canvas, ui } as unknown as ScreenRenderContext, 10, 10, 100, 100);
    expect(fills).toEqual([1]);
    expect(ui.t.alpha.overlay).toBeLessThan(1);
  });
});
