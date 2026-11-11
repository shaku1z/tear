import { describe, expect, it } from "vitest";

import {
  advanceUiConfirmArming,
  coordinateUiFrame,
  coordinateUiPointer,
  stepUiTab,
  UI_CONFIRM_SETTLE_SECONDS,
  uiConfirmGate,
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
    screen: "menu", screenAgeSeconds: 10, confirmReleasedSinceOpen: true, buttons, focus: 0, scroll: 0, scrollY: 0, pageUp: false, pageDown: false,
    pointer: { x: -100, y: -100 }, touch: false,
    directions: { left: false, right: false, up: false, down: false },
    previous: false, next: false, pressed: new Set(), back: false, confirm: false, context1: false,
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
      screen: "draft", pressed: new Set(["Digit4", "KeyR"]), back: true, confirm: true,
    }));
    expect(draft.action).toEqual({ type: "choose-upgrade", index: 3 });
    expect(draft.pointer).toBe("leave");
    expect(draft.consumeBack).toBe(false);

    const reserve = coordinateUiFrame(frame({ screen: "reserve", pressed: new Set(["Digit2"]) }));
    expect(reserve.action).toEqual({ type: "choose-reserve", index: 1 });
    expect(coordinateUiFrame(frame({ screen: "draft", pressed: new Set(["KeyR"]) }))).toMatchObject({ action: { type: "reroll-draft" } });
  });

  it("routes controller back to an enabled BACK action and confirm to focused action", () => {
    expect(coordinateUiFrame(frame({ back: true })).action).toEqual({ type: "activate-button", index: 2, source: "back" });
    expect(coordinateUiFrame(frame({ focus: 1, confirm: true })).action).toEqual({ type: "activate-button", index: 1, source: "confirm" });
  });

  it("routes the controller primary context shortcut directly to START on setup", () => {
    const setupButtons = [
      { x: 0, y: 0, w: 100, h: 40, label: "MODE" },
      { x: 0, y: 60, w: 100, h: 40, label: "START" },
      { x: 0, y: 120, w: 100, h: 40, label: "BACK" },
    ] as const;
    expect(coordinateUiFrame(frame({
      screen: "setup", buttons: setupButtons, focus: 0, context1: true,
    })).action).toEqual({ type: "activate-button", index: 1, source: "confirm" });
  });

  it("lets pointer hover move focus in every input modality (source handleUI contract)", () => {
    const decision = coordinateUiFrame(frame({
      focus: 1, pointer: { x: 10, y: 10 },
    }));
    expect(decision.focus).toBe(0);
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

describe("confirm arming on screens that interrupt play", () => {
  const cards = [
    { x: 0, y: 0, w: 100, h: 200, label: "", confirm: true },
    { x: 120, y: 0, w: 100, h: 200, label: "", confirm: true },
    { x: 240, y: 0, w: 100, h: 200, label: "", confirm: true },
  ] as const;
  const settled = UI_CONFIRM_SETTLE_SECONDS + 0.01;
  const early = UI_CONFIRM_SETTLE_SECONDS - 0.01;

  it("tracks screen age and a release since the screen opened", () => {
    const opened = advanceUiConfirmArming(null, "draft", 5, true);
    expect(opened).toEqual({ screen: "draft", openedAtSeconds: 5, releasedSinceOpen: false });
    const stillHeld = advanceUiConfirmArming(opened, "draft", 5.5, true);
    expect(stillHeld).toBe(opened);
    const released = advanceUiConfirmArming(stillHeld, "draft", 5.6, false);
    expect(released).toEqual({ screen: "draft", openedAtSeconds: 5, releasedSinceOpen: true });
    expect(advanceUiConfirmArming(released, "draft", 6, true)).toBe(released);
    expect(advanceUiConfirmArming(released, "gameover", 7, false))
      .toEqual({ screen: "gameover", openedAtSeconds: 7, releasedSinceOpen: true });
  });

  it("requires both a release and the settle time before keyboard or controller confirm acts", () => {
    for (const screen of ["draft", "reserve", "tierup", "gameover", "win", "continue", "paused", "confirmquit"]) {
      expect(uiConfirmGate(screen, settled, false).confirm, `${screen} held`).toBe(false);
      expect(uiConfirmGate(screen, early, true).confirm, `${screen} early`).toBe(false);
      expect(uiConfirmGate(screen, settled, true).confirm, `${screen} armed`).toBe(true);
    }
    for (const screen of ["menu", "setup", "shop", "settings", "codex"]) {
      expect(uiConfirmGate(screen, 0, false)).toEqual({ confirm: true, pointer: true });
    }
  });

  it("ignores a confirm that arrives while the draft is still settling, then picks after arming", () => {
    const base = { screen: "draft", buttons: cards, focus: 0, confirm: true } as const;
    const held = coordinateUiFrame(frame({ ...base, screenAgeSeconds: settled, confirmReleasedSinceOpen: false }));
    expect(held.action).toBeNull();
    const tooSoon = coordinateUiFrame(frame({ ...base, screenAgeSeconds: early, confirmReleasedSinceOpen: true }));
    expect(tooSoon.action).toBeNull();
    const armed = coordinateUiFrame(frame({ ...base, screenAgeSeconds: settled, confirmReleasedSinceOpen: true }));
    expect(armed.action).toEqual({ type: "activate-button", index: 0, source: "confirm" });
  });

  it("keeps navigation live during the settle window", () => {
    const decision = coordinateUiFrame(frame({
      screen: "draft", buttons: cards, focus: 0, screenAgeSeconds: 0, confirmReleasedSinceOpen: false,
      directions: { left: false, right: true, up: false, down: false }, confirm: true,
    }));
    expect(decision.focus).toBe(1);
    expect(decision.action).toBeNull();
    const hovered = coordinateUiFrame(frame({
      screen: "gameover", buttons, focus: 0, screenAgeSeconds: 0, confirmReleasedSinceOpen: false, pointer: { x: 150, y: 20 },
    }));
    expect(hovered.focus).toBe(1);
  });

  it("gates number-key picks on draft, reserve and tier-up with the same arming", () => {
    const settling = { screenAgeSeconds: 0.1, confirmReleasedSinceOpen: true } as const;
    for (const screen of ["draft", "reserve", "tierup"]) {
      expect(coordinateUiFrame(frame({ screen, buttons: cards, pressed: new Set(["Digit2"]), ...settling })).action).toBeNull();
    }
    expect(coordinateUiFrame(frame({ screen: "draft", buttons: cards, pressed: new Set(["KeyR"]), ...settling })).action).toBeNull();
    expect(coordinateUiFrame(frame({ screen: "tierup", buttons: cards, pressed: new Set(["Digit2"]) })).action)
      .toEqual({ type: "choose-tier", index: 1 });
    expect(coordinateUiFrame(frame({ screen: "tierup", buttons: cards, pressed: new Set(["Digit4"]) })).action)
      .toEqual({ type: "choose-tier", index: 3 });
  });

  it("discards pointer clicks on reward and results screens until the settle time passes", () => {
    for (const screen of ["draft", "reserve", "tierup", "gameover", "win", "continue"]) {
      expect(coordinateUiFrame(frame({ screen, screenAgeSeconds: early })).pointer, screen).toBe("consume");
      expect(coordinateUiFrame(frame({ screen, screenAgeSeconds: settled, confirmReleasedSinceOpen: false })).pointer, screen).toBe("read");
    }
    expect(coordinateUiFrame(frame({ screen: "paused", screenAgeSeconds: 0 })).pointer).toBe("read");
    expect(coordinateUiFrame(frame({ screen: "menu", screenAgeSeconds: 0 })).pointer).toBe("read");
  });

  it("routes semantic back (Escape, Backspace or controller) to BACK even while settling", () => {
    const decision = coordinateUiFrame(frame({ screen: "shop", back: true, screenAgeSeconds: 0, confirmReleasedSinceOpen: false }));
    expect(decision.action).toEqual({ type: "activate-button", index: 2, source: "back" });
    expect(decision.consumeBack).toBe(true);
    const nowhere = coordinateUiFrame(frame({ screen: "paused", back: true, buttons: cards }));
    expect(nowhere.action).toBeNull();
    expect(nowhere.consumeBack).toBe(true);
  });
});
