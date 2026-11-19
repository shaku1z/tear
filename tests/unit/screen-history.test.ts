import { describe, expect, it } from "vitest";
import { createScreenHistory } from "../../src/app/interface/screen-history";

const at = (screen: string, focus = 0, scroll = 0) => ({ screen, focus, scroll });
const ROOTS = ["menu", "playing"];

describe("screen history", () => {
  it("returns BACK to the screen a page was opened from, not always the main menu", () => {
    const history = createScreenHistory(ROOTS);
    history.move(at("menu", 4), "settings");
    history.move(at("settings", 7, 120), "codex");
    expect(history.backTarget()).toBe("settings");
    expect(history.move(at("codex", 2), "settings")).toEqual(at("settings", 7, 120));
    expect(history.backTarget()).toBe("menu");
    expect(history.move(at("settings", 7), "menu")).toEqual(at("menu", 4));
    expect(history.backTarget()).toBeUndefined();
  });

  it("restores the control left from on an explicit return too, and drops the screens after it", () => {
    const history = createScreenHistory(ROOTS);
    history.move(at("menu", 3), "settings");
    history.move(at("settings", 1), "codex");
    expect(history.move(at("codex", 0), "menu")).toEqual(at("menu", 3));
    expect(history.backTarget()).toBeUndefined();
  });

  it("starts over at a root, so a pause and its confirm form their own short chain", () => {
    const history = createScreenHistory(ROOTS);
    history.move(at("menu", 2), "setup");
    expect(history.move(at("setup", 5), "playing")).toBeUndefined();
    expect(history.backTarget()).toBeUndefined();
    history.move(at("playing"), "paused");
    history.move(at("paused", 6), "confirmquit");
    expect(history.move(at("confirmquit", 1), "paused")).toEqual(at("paused", 6));
    expect(history.backTarget()).toBe("playing");
    history.move(at("paused", 6), "gameover");
    expect(history.move(at("gameover", 0), "menu")).toBeUndefined();
    expect(history.backTarget()).toBeUndefined();
  });

  it("stays bounded on a chain that never returns", () => {
    const history = createScreenHistory(ROOTS);
    for (let step = 0; step < 100; step += 1) history.move(at(`s${step}`, step), `s${step + 1}`);
    let depth = 0;
    while (history.backTarget() !== undefined && depth < 100) {
      history.move(at("x"), history.backTarget() ?? "x");
      depth += 1;
    }
    expect(depth).toBeLessThanOrEqual(24);
  });
});
