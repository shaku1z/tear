import { describe, expect, it, vi } from "vitest";
import { APP_SCREENS, isMenuScreen, isWorldScreen, type AppScreen } from "../../src/domain/screen-catalog";
import { renderRegisteredScreen, type ScreenRendererRegistry } from "../../src/app/interface/screen-registry";

describe("screen registry", () => {
  it("dispatches every application screen through its exact renderer", () => {
    for (const screen of APP_SCREENS) {
      const calls: AppScreen[] = [];
      const registry = Object.fromEntries(APP_SCREENS.map((key) => [key, () => { calls.push(key); }])) as unknown as ScreenRendererRegistry;
      renderRegisteredScreen(screen, registry);
      expect(calls).toEqual([screen]);
    }
  });

  it("classifies menu and world layers without overlap", () => {
    expect(isMenuScreen("settings")).toBe(true);
    expect(isWorldScreen("settings")).toBe(false);
    expect(isWorldScreen("paused")).toBe(true);
    expect(isMenuScreen("paused")).toBe(false);
    expect(isMenuScreen("replay")).toBe(false);
    expect(isWorldScreen("replay")).toBe(false);
  });

  it("does not invoke unrelated renderers", () => {
    const selected = vi.fn();
    const other = vi.fn();
    const registry = Object.fromEntries(APP_SCREENS.map((screen) => [screen, screen === "menu" ? selected : other])) as unknown as ScreenRendererRegistry;
    renderRegisteredScreen("menu", registry);
    expect(selected).toHaveBeenCalledOnce();
    expect(other).not.toHaveBeenCalled();
  });
});
