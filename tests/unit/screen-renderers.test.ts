import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { createUi } from "../../src/presentation/ui";
import type {
  ScreenControl, ScreenRenderContext, ScreenUiPort,
} from "../../src/presentation/screens";
import { createLegacyScreenRenderers } from "../../src/presentation/screens";
import { backControl, tabs, verticalMenu } from "../../src/presentation/screens/screen-primitives";

class TestUi implements ScreenUiPort {
  readonly ink = "#000";
  readonly t = {
    type: { wordmark: 80, display: 52, h1: 40, h2: 30, title: 24, lead: 20, body: 16, label: 14, caption: 13, micro: 11 },
    font: { brand: "'Courier New', monospace", display: "sans-serif", body: "monospace", displayWeight: 600, bodyWeight: 400, bodyMediumWeight: 500 },
    alpha: { full: 1, soft: 0.8, muted: 0.6, faint: 0.3 },
    color: { accent: "#13c4d6", muted: "#888", danger: "#e23b3b" },
    metric: { btnH: 52, btnGap: 10 },
  };
  text(): void { return; }
  wordmark(): void { return; }
  displayText(): void { return; }
  title(): void { return; }
  tag(): void { return; }
  header(): void { return; }
  sectionLabel(...values: Parameters<ScreenUiPort["sectionLabel"]>): number { return values[3] + 24; }
  card(): void { return; }
  panel(): void { return; }
  divider(): void { return; }
  bar(): void { return; }
  dim(): void { return; }
  wrappedText(): void { return; }
  accentStrip(): void { return; }
  font(size: number, bold?: boolean): string { return `${bold ? "bold " : ""}${String(size)}px monospace`; }
  fitTitle(): void { return; }
  keyBadge(): void { return; }
  tierPips(): void { return; }
  scrollHint(): void { return; }
  finalReward(): void { return; }
}

function createControlContext(controls: ScreenControl[]): ScreenRenderContext {
  return {
    get canvas(): CanvasRenderingContext2D { throw new Error("canvas should not be read by control-planning tests"); },
    ui: new TestUi(),
    width: 1600, height: 900, time: 0, enterAmount: 1, enterSeconds: 1, deltaSeconds: 1 / 60,
    mouse: { x: -1, y: -1 }, scroll: 0, focus: 0,
    touch: false, reducedMotion: false, screenRectangle: { x: 0, y: 0, w: 1600, h: 900 },
    enqueue(control): void { controls.push(control); },
  };
}

function canvasStub(rectangles?: number[][]): CanvasRenderingContext2D {
  const values = new Map<PropertyKey, unknown>();
  const gradient: CanvasGradient = { addColorStop(): void { return; } };
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_target, property): unknown {
      if (values.has(property)) return values.get(property);
      if (property === "measureText") return (text: string): TextMetrics => ({ width: text.length * 8 } as TextMetrics);
      if (property === "createLinearGradient" || property === "createRadialGradient") return (): CanvasGradient => gradient;
      if (property === "fillRect") return (...args: number[]): void => { rectangles?.push(args); };
      return (): void => { return; };
    },
    set(_target, property, value): boolean { values.set(property, value); return true; },
  });
}

function createRenderContext(controls: ScreenControl[]): ScreenRenderContext {
  return {
    canvas: canvasStub(), ui: new TestUi(), width: 1600, height: 900, time: 0, enterAmount: 1,
    enterSeconds: 1, deltaSeconds: 1 / 60, mouse: { x: -1, y: -1 }, scroll: 0, focus: 0, touch: false, reducedMotion: false, screenRectangle: { x: 0, y: 0, w: 1600, h: 900 },
    enqueue(control): void { controls.push(control); },
  };
}

describe("legacy screen renderer registry", () => {
  it("is exhaustive for every canonical application screen", () => {
    expectTypeOf<ReturnType<typeof createUi>>().toExtend<ScreenUiPort>();
    const registry = createLegacyScreenRenderers(createControlContext([]));
    expect(Object.keys(registry).sort()).toEqual([
      "achievements", "codex", "confirmquit", "continue", "draft", "gameover", "leaderboards",
      "menu", "paused", "pglab", "pgmenu", "playing", "profile", "rename", "replay", "reserve",
      "settings", "setup", "shop", "tierup", "win",
    ]);
    expect(() => { registry.playing({ id: "playing" }); }).not.toThrow();
  });

  it("records semantic navigation and menu actions without coordinating state", () => {
    const controls: ScreenControl[] = [];
    const context = createControlContext(controls);
    backControl(context, { type: "navigate", to: "paused" });
    verticalMenu(context, [
      { label: "RESUME", action: { type: "run.resume" } },
      { label: "MAIN MENU", action: { type: "navigate", to: "confirmquit" } },
    ], 220, 210);
    tabs(context, [
      { id: "audio", label: "AUDIO", selected: true },
      { id: "accessibility", label: "ACCESSIBILITY" },
    ], (id) => ({ type: "settings.selectTab", id }));

    expect(controls.map((control) => control.action)).toEqual([
      { type: "navigate", to: "paused" },
      { type: "run.resume" },
      { type: "navigate", to: "confirmquit" },
      { type: "settings.selectTab", id: "audio" },
      { type: "settings.selectTab", id: "accessibility" },
    ]);
  });

  it("paints menu chrome through the true viewport overscan while keeping controls in the safe composition", () => {
    const rectangles: number[][] = [];
    const controls: ScreenControl[] = [];
    const base = createRenderContext(controls);
    const renderer = createLegacyScreenRenderers({ ...base, canvas: canvasStub(rectangles),
      screenRectangle: { x: -120, y: -40, w: 1840, h: 980 } });
    renderer.menu({ id: "menu", playerName: "Guest", signedIn: false, coins: 0, shards: 0, unlocked: 0,
      modeLabel: "Endless", difficultyLabel: "Normal", biome: "The Grounds" });
    expect(rectangles[0]).toEqual([-120, -40, 920, 980]);
    expect(rectangles).toHaveLength(1);
    expect(controls.find((control) => control.action.type === "navigate" && control.action.to === "setup"))
      .toMatchObject({ x: 100, y: 318, w: 320, h: 86 });
    expect(controls[0]).toMatchObject({ dot: "#8a93a6", ghost: true });
  });

  it("preserves critical legacy labels and the independent audio-control contract", () => {
    const screenFiles = ["menu-setup.ts", "settings-rename.ts", "draft-reserve-tierup.ts", "pause-results.ts"];
    const source = [
      ...screenFiles.map((file) => readFileSync(fileURLToPath(new URL(`../../src/presentation/screens/${file}`, import.meta.url)), "utf8")),
      readFileSync(fileURLToPath(new URL("../../src/presentation/ui-menu.ts", import.meta.url)), "utf8"),
    ].join("\n");
    for (const label of [
      "T E A R", "PLAY", "SHOP", "ACHIEVEMENTS", "LEADERBOARDS", "CODEX", "SETTINGS",
      "BEGIN RUN", "MASTER", "MUSIC", "SOUND EFFECTS", "RESERVE A CARD", "THE WAY OPENS",
      "PAUSED", "QUIT RUN?", "YOU FELL", "DEFEATED", "VICTORY", "THE WORLD, RESTORED",
    ]) expect(source).toContain(label);
    expect(source).not.toMatch(/localStorage|Cloud\.|CG\.|PROFILE\.|META\.|saveSettings|startRun\(/);
  });

  it("preserves setup hit geometry, Boss Test selection, bounties, and the legacy start target", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.setup({ id: "setup", modes: [{ id: "endless", label: "Endless" }], difficulties: [{ id: "normal", label: "Normal" }],
      weapons: ["sword", "chainblade", "ringblade", "scythe"].map((id) => ({ id, label: id })), showDifficulty: true,
      startSummary: "ENDLESS · NORMAL · SWORD", bossChoices: [{ id: "shuffle", label: "SHUFFLE" }, { id: "warden", label: "WARDEN" }] });
    expect(controls.filter((control) => control.action.type === "setup.selectWeapon").map(({ y, h }) => ({ y, h }))).toEqual([
      { y: 168, h: 70 }, { y: 246, h: 70 }, { y: 324, h: 70 }, { y: 402, h: 70 },
    ]);
    expect(controls.find((control) => control.action.type === "setup.start")).toMatchObject({ y: 726, h: 66 });
    expect(controls.filter((control) => control.action.type === "setup.selectBoss")).toHaveLength(2);
  });

  it("flows shop categories by their real contents instead of fixed-height slots", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    const item = (id: string) => ({ id, label: id.toUpperCase(), level: 0, maxLevel: 3, cost: "10c", enabled: true });
    renderer.shop({ id: "shop", coins: 100, ownedLevels: 0, totalLevels: 18, lifetimeEarned: 100,
      sections: [
        { label: "VITALITY", items: [item("v1"), item("v2"), item("v3")] },
        { label: "BLADE", items: [item("b1")] },
        { label: "TEMPO", items: [item("t1")] },
        { label: "FORTUNE", items: [item("f1"), item("f2")] },
      ] });
    const buys = controls.filter((control) => control.action.type === "shop.buy");
    expect(buys.find((control) => control.action.type === "shop.buy" && control.action.id === "v1")?.y).toBe(217);
    expect(buys.find((control) => control.action.type === "shop.buy" && control.action.id === "b1")?.y).toBe(481);
    expect(buys.find((control) => control.action.type === "shop.buy" && control.action.id === "t1")?.y).toBe(217);
    expect(buys.find((control) => control.action.type === "shop.buy" && control.action.id === "f1")?.y).toBe(333);
  });

  it("models Codex guide details and rich profile/achievement surfaces without gameplay callbacks", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.codex({ id: "codex", tab: "guide", tabs: [{ id: "guide", label: "GUIDE", selected: true }], cards: [],
      guide: { controls: [{ keys: ["A", "D"], description: "move" }], controller: ["left stick move"],
        tricks: [{ glyph: "✦", name: "PARRY", points: 15, description: "swing fast" }],
        ladder: [{ name: "S", multiplier: 4, fraction: 1 }], variety: "vary your tricks" } });
    renderer.profile({ id: "profile", tab: "bests", tabs: [{ id: "bests", label: "BESTS" }], name: "Guest", signedIn: false, stats: [],
      passport: { coins: 10, shards: 2, achievements: "3 / 40", canRename: false, canSignIn: true, canSignOut: false, showcases: [] },
      finest: { headline: "WAVE 12 · 9000 PTS", detail: "YOUR FINEST" }, records: [{ mode: "Endless", difficulty: "Hard", wave: "12", time: "03:20", score: "9,000" }] });
    renderer.achievements({ id: "achievements", category: "all", categories: [{ id: "all", label: "ALL 1/2" }], unlocked: 1, total: 2, cards: [],
      shards: 4, resetsIn: "2h", nextUp: "Sharp Start 80%", dailies: [{ label: "PARRY 3", current: 2, goal: 3, reward: "◆ +2", done: false }] });
    expect(controls.map((control) => control.action.type)).toEqual(expect.arrayContaining([
      "codex.selectTab", "profile.selectTab", "profile.openAchievements", "profile.signIn", "achievements.selectCategory",
    ]));
  });

  it("preserves leaderboard podium/replay theatre controls and settings cycle rows", () => {
    const controls: ScreenControl[] = [];
    const renderer = createLegacyScreenRenderers(createRenderContext(controls));
    renderer.leaderboards({ id: "leaderboards", tab: "global", tabs: [{ id: "global", label: "GLOBAL" }],
      modes: [{ id: "endless", label: "ENDLESS" }], difficulties: [{ id: "hard", label: "HARD" }], rows: [],
      podium: [{ rank: 1, name: "Player", detail: "wave 20", color: "#e0a326", replayId: "r1" }], ownRank: "#12 YOU" });
    renderer.replay({ id: "replay", title: "Player · Endless", detail: "wave 20", paused: false, speed: 1,
      elapsed: "01:00", duration: "02:00", progress: 0.5, chapters: [{ fraction: 0.25, boss: true }], infoVisible: true,
      infoRows: [{ label: "SCORE", value: "9000" }], loadout: [{ id: "reach", label: "LONG ARM", footer: "×2" }] });
    renderer.settings({ id: "settings", tab: "controls", tabs: [{ id: "controls", label: "CONTROLS" }], returnTo: "menu",
      sections: [{ label: "CONTROLS", rows: [{ key: "padPreset", label: "Controller preset", value: "STANDARD · RECOMMENDED", kind: "cycle", note: "Balanced shoulders" }] }] });
    expect(controls.map((control) => control.action.type)).toEqual(expect.arrayContaining([
      "leaderboards.selectBoard", "leaderboards.watchReplay", "replay.jumpChapter", "replay.togglePause",
      "replay.restart", "replay.toggleInfo", "replay.exit", "settings.activate",
    ]));
  });

  it("declares every legacy-only parity field needed before old screen ranges can be deleted", () => {
    const contracts = readFileSync(fileURLToPath(new URL("../../src/presentation/screens/contracts.ts", import.meta.url)), "utf8");
    for (const field of [
      "bossChoices", "bounties", "guide", "tierCount", "previewId", "passport", "finest", "records", "journey",
      "dailies", "resetsIn", "nextUp", "podium", "ownRank", "chapters", "infoRows", "loadout", '"cycle"',
    ]) expect(contracts).toContain(field);
  });
});
