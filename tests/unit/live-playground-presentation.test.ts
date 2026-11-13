import { describe, expect, it } from "vitest";
import {
  createLivePlaygroundPresentation,
  playgroundMenuSubtitle,
  type PlaygroundPromptDevice,
  type PlaygroundScreenModel,
} from "../../src/gameplay/training/live-playground-presentation";

describe("live playground presentation", () => {
  it("only promises Tab / Esc to a keyboard; touch and controller are pointed at RESUME", () => {
    for (const device of ["mouse", "keyboard"] as const)
      expect(playgroundMenuSubtitle(device)).toBe("Q / E switch tabs · Tab or Esc returns to the arena");
    expect(playgroundMenuSubtitle("gamepad")).toBe("L1 / R1 switch tabs · RESUME returns to the arena");
    expect(playgroundMenuSubtitle("touch")).toBe("RESUME returns to the arena");
    for (const device of ["touch", "gamepad"] as const) expect(playgroundMenuSubtitle(device)).not.toMatch(/Tab|Esc/u);
  });

  it("builds menu and ability-lab models while clamping scroll", () => {
    let scroll = 999,
      device: PlaygroundPromptDevice = "touch",
      subtitle = "";
    let tab = "spawn",
      menu: PlaygroundScreenModel | undefined,
      lab: PlaygroundScreenModel | undefined;
    let menuId = "",
      menuSections = 0,
      labId = "",
      labCanScrollUp = true,
      labCanScrollDown = true;
    const runtime = createLivePlaygroundPresentation({
      run: () => ({
        diff: "normal",
        pgArena: 1,
        pg: { hpMultiplier: 3, count: 1, god: true },
        mods: { owned: { dash: 1 }, tier: { dash: 1 } },
      }),
      inputDevice: () => device,
      oneHit: () => false,
      kinds: ["charger"],
      difficulties: () => [{ id: "normal", label: "Normal" }],
      bosses: [{ id: "warden", name: "Warden" }],
      weapons: () => [{ id: "sword", name: "Sword" }],
      colors: () => ({ charger: "#f00", boss: "#000" }),
      uiAccent: () => "#0ff",
      stageAccent: () => "#fff",
      arenaName: () => "Verdant",
      arenas: () => ["Ashen", "Verdant"],
      tab: () => tab,
      hotkeyKinds: ["charger"],
      selectedWeapon: () => "sword",
      upgrades: () => [{ id: "dash", name: "Dash", desc: "Move", cat: "mobility", tiers: [{}, {}] }],
      abilityColors: () => ({ mobility: { color: "#00f" }, utility: { color: "#888" } }),
      labFilter: () => "all",
      viewportHeight: 900,
      scroll: () => scroll,
      setScroll: (value) => {
        scroll = value;
      },
      renderMenu: (model: PlaygroundScreenModel) => {
        menu = model;
        menuId = model.id;
        menuSections = model.sections.length;
        subtitle = model.subtitle;
      },
      renderLab: (model: PlaygroundScreenModel) => {
        lab = model;
        labId = model.id;
        labCanScrollUp = model.canScrollUp ?? false;
        labCanScrollDown = model.canScrollDown ?? false;
      },
    });
    runtime.renderMenu();
    runtime.renderLab();
    expect(menuId).toBe("pgmenu");
    expect(menuSections).toBeGreaterThan(0);
    expect(subtitle).toBe(playgroundMenuSubtitle("touch"));
    // The subtitle follows the device on every frame, like the other device-worded prompts.
    device = "keyboard";
    runtime.renderMenu();
    expect(subtitle).toBe(playgroundMenuSubtitle("keyboard"));
    expect(labId).toBe("pglab");
    expect(labCanScrollUp).toBe(false);
    expect(labCanScrollDown).toBe(false);
    expect(scroll).toBe(0);
    // One tab on screen at a time; the strip lists every tab with the open one selected.
    expect(menu?.tabs.map((entry) => entry.label)).toEqual([
      "SPAWN",
      "BOSSES",
      "ARENA",
      "WEAPON",
      "RULES",
      "ABILITIES",
    ]);
    expect(menu?.tabs.find((entry) => entry.selected)?.id).toBe("tab:spawn");
    expect(lab?.tabs.find((entry) => entry.selected)?.id).toBe("tab:abilities");
    expect(menu?.sections.map((section) => section.label)).toEqual(["ENEMIES", "HEALTH", "HOW MANY", "DIFFICULTY"]);
    // Keyboard shows each choice's arena shortcut; other devices do not.
    expect(menu?.sections[0]?.choices.map((choice) => choice.sub)).toEqual(["KEY 1", "KEY T"]);
    device = "gamepad";
    runtime.renderMenu();
    expect(menu?.sections[0]?.choices.some((choice) => choice.sub !== undefined)).toBe(false);
    // The arena tab lists the real stages only and marks the current one.
    tab = "arena";
    runtime.renderMenu();
    expect(menu?.sections[0]?.choices.map((choice) => [choice.id, choice.label, choice.selected])).toEqual([
      ["arena:0", "ASHEN", false],
      ["arena:1", "VERDANT", true],
    ]);
  });
});
