import { describe, expect, it, vi } from "vitest";
import { renderButtonLayer, type CanvasUiButton } from "../../src/presentation/screens/button-layer";

describe("canvas button presentation layer", () => {
  it("preserves hover/focus animation, hidden rows and chip routing", () => {
    const save = vi.fn();
    const context = { globalAlpha: 1, save, restore: vi.fn(), translate: vi.fn(), scale: vi.fn() } as unknown as CanvasRenderingContext2D;
    const buttons: CanvasUiButton[] = [
      { x: 0, y: 0, w: 100, h: 40, label: "BUTTON" },
      { x: 120, y: 0, w: 100, h: 40, label: "CHIP", chip: true },
      { x: 0, y: 60, w: 100, h: 40, label: "HIDDEN", _hideBox: true },
    ];
    const buttonRenderer = vi.fn(), chipRenderer = vi.fn();
    const ui = {
      pointIn: (button: CanvasUiButton, x: number, y: number) => x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h,
      chip: chipRenderer, button: buttonRenderer,
    };
    const hoverAnimation: Record<string, number> = {};
    renderButtonLayer({ context, buttons, focus: 1, pointerX: 20, pointerY: 20, pointerActive: true, deltaSeconds: 1 / 60,
      enterSeconds: 1, hoverAnimation, ui, entranceEase: () => 1 });
    expect(buttonRenderer).toHaveBeenCalledWith(context, buttons[0], true);
    expect(chipRenderer).toHaveBeenCalledWith(context, buttons[1], true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(buttons[0]?._a).toBeGreaterThan(0);
    expect(hoverAnimation["BUTTON@0,0"]).toBe(buttons[0]?._a);
  });

  it("ignores stale pointer hover when another input modality owns the UI", () => {
    const context = { globalAlpha: 1, save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn() } as unknown as CanvasRenderingContext2D;
    const button = { x: 0, y: 0, w: 100, h: 40, label: "BUTTON" };
    const draw = vi.fn();
    renderButtonLayer({ context, buttons: [button], focus: -1, pointerX: 20, pointerY: 20,
      pointerActive: false, deltaSeconds: 1 / 60, enterSeconds: 1, hoverAnimation: {},
      ui: { pointIn: () => true, chip: vi.fn(), button: draw }, entranceEase: () => 1 });
    expect(draw).toHaveBeenCalledWith(context, button, false);
  });
});
