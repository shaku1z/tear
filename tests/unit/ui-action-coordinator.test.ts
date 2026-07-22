import { describe, expect, it } from "vitest";

import {
  coordinateUiFrame,
  coordinateUiPointer,
  stepUiTab,
  uiScrollDelta,
  type UiFrameInput,
} from "../../src/app/ui-action-coordinator";

const buttons = [
  { x: 0, y: 0, w: 100, h: 40, label: "ONE" },
  { x: 120, y: 0, w: 100, h: 40, label: "TWO", confirm: true },
  { x: 0, y: 60, w: 100, h: 40, label: "‹ BACK" },
] as const;

function frame(overrides: Partial<UiFrameInput> = {}): UiFrameInput {
  return {
    screen: "menu", buttons, focus: 0, scroll: 0, scrollY: 0, pageUp: false, pageDown: false,
    pointer: { x: -100, y: -100 }, touch: false,
    directions: { left: false, right: false, up: false, down: false },
    previous: false, next: false, pressed: new Set(), padBack: false, confirm: false,
    ...overrides,
  };
}

describe("semantic UI action coordinator", () => {
  it("combines scroll/paging, pointer hover and spatial navigation deterministically", () => {
    expect(uiScrollDelta(5, true, true, 100)).toBe(5);
    const decision = coordinateUiFrame(frame({
      scroll: 5_990, scrollY: 20, pageDown: true,
      pointer: { x: 10, y: 10 }, directions: { left: false, right: true, up: false, down: false },
    }));
    expect(decision.scroll).toBe(6_000);
    expect(decision.focus).toBe(1);
    expect(decision.pointer).toBe("read");
  });

  it("preserves draft and reserve shortcut priority ahead of back, confirm and clicks", () => {
    const draft = coordinateUiFrame(frame({
      screen: "draft", pressed: new Set(["Digit4", "KeyR"]), padBack: true, confirm: true,
    }));
    expect(draft.action).toEqual({ type: "choose-upgrade", index: 3 });
    expect(draft.pointer).toBe("leave");
    expect(draft.consumePadBack).toBe(false);

    const reserve = coordinateUiFrame(frame({ screen: "reserve", pressed: new Set(["Digit2"]) }));
    expect(reserve.action).toEqual({ type: "choose-reserve", index: 1 });
    expect(coordinateUiFrame(frame({ screen: "draft", pressed: new Set(["KeyR"]) }))).toMatchObject({ action: { type: "reroll-draft" } });
  });

  it("routes controller back to an enabled BACK action and confirm to focused action", () => {
    expect(coordinateUiFrame(frame({ padBack: true })).action).toEqual({ type: "activate-button", index: 2, source: "back" });
    expect(coordinateUiFrame(frame({ focus: 1, confirm: true })).action).toEqual({ type: "activate-button", index: 1, source: "confirm" });
  });

  it("keeps touch-confirm cards two-step while mouse and the second touch activate", () => {
    const firstTouch = coordinateUiPointer(buttons, 0, { x: 150, y: 20 }, true);
    expect(firstTouch).toEqual({ focus: 1, action: null, playUiSound: true });
    expect(coordinateUiPointer(buttons, 1, { x: 150, y: 20 }, true).action).toEqual({ type: "activate-button", index: 1, source: "pointer" });
    expect(coordinateUiPointer(buttons, 0, { x: 150, y: 20 }, false).action).toEqual({ type: "activate-button", index: 1, source: "pointer" });
  });

  it("consumes stale clicks when no controls exist and leaves playing input untouched", () => {
    expect(coordinateUiFrame(frame({ buttons: [] })).pointer).toBe("consume");
    expect(coordinateUiFrame(frame({ screen: "playing", scrollY: 50 }))).toMatchObject({ scroll: 0, pointer: "leave" });
  });

  it("steps tabs without wrapping and reports only real changes", () => {
    const tabs = [["a", "A"], ["b", "B"], ["c", "C"]] as const;
    expect(stepUiTab(tabs, "b", false, true)).toEqual({ key: "c", changed: true });
    expect(stepUiTab(tabs, "c", false, true)).toEqual({ key: "c", changed: false });
    expect(stepUiTab(tabs, "missing" as "a", false, true)).toEqual({ key: "b", changed: true });
  });
});
