import { describe, expect, it } from "vitest";
import { createLivePlaygroundPresentation, type PlaygroundScreenModel } from "../../src/gameplay/training/live-playground-presentation";

describe("live playground presentation", () => {
  it("builds menu and ability-lab models while clamping scroll", () => {
    let scroll = 999;
    let menuId = "", menuSections = 0, labId = "", labCanScrollUp = true, labCanScrollDown = true;
    const runtime = createLivePlaygroundPresentation({
      run: () => ({ diff: "normal", pgArena: -1, pg: { hpMultiplier: 3, count: 1, god: true },
        mods: { owned: { dash: 1 }, tier: { dash: 1 } } }),
      oneHit: () => false, kinds: ["charger"], difficulties: () => [{ id: "normal", label: "Normal" }],
      bosses: [{ id: "warden", name: "Warden" }], weapons: () => [{ id: "sword", name: "Sword" }],
      colors: () => ({ charger: "#f00", boss: "#000" }), uiAccent: () => "#0ff", stageAccent: () => "#fff",
      arenaName: () => "Training", selectedWeapon: () => "sword",
      upgrades: () => [{ id: "dash", name: "Dash", desc: "Move", cat: "mobility", tiers: [{}, {}] }],
      abilityColors: () => ({ mobility: { color: "#00f" }, utility: { color: "#888" } }), labFilter: () => "all",
      viewportHeight: 900, scroll: () => scroll, setScroll: (value) => { scroll = value; },
      renderMenu: (model: PlaygroundScreenModel) => { menuId = model.id; menuSections = model.sections.length; },
      renderLab: (model: PlaygroundScreenModel) => { labId = model.id; labCanScrollUp = model.canScrollUp ?? false; labCanScrollDown = model.canScrollDown ?? false; },
    });
    runtime.renderMenu(); runtime.renderLab();
    expect(menuId).toBe("pgmenu"); expect(menuSections).toBeGreaterThan(0);
    expect(labId).toBe("pglab"); expect(labCanScrollUp).toBe(false); expect(labCanScrollDown).toBe(false);
    expect(scroll).toBe(0);
  });
});
