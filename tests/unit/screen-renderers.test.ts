import { practiceBossCatalog } from "../../src/gameplay/training/practice-boss-catalog";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { createUi } from "../../src/presentation/ui";
import type { ScreenControl, ScreenRenderContext, ScreenUiPort } from "../../src/presentation/screens";
import { createScreenRenderers } from "../../src/presentation/screens";
import { buildMusicScreenView } from "../../src/presentation/music-snapshots";
import { validateMusicRoutingManifest } from "../../src/audio/music/music-routing-validate";
import { parseMusicCatalog } from "../../src/audio/music/catalog";
import { buildMusicLibrary, publishMusicLibrary } from "../../src/audio/music/library";
import { setMusicProgressFacts } from "../../src/audio/music/music-source";
import { progressFacts } from "../../src/domain/progress-facts";
import { TEST_CHANNELS, index as musicIndex } from "./music-backend-harness";
import { campaignDraftGuidance } from "../../src/app/run/run-screen-adapters";
import { buildShopSnapshot, SHOP_LIST_TOP } from "../../src/presentation/shop-snapshot";
import { DESKTOP } from "../../src/presentation/screens/codex-shop-metrics";
import { CONFIG } from "../../src/config/game-config";
import { TutorialController } from "../../src/gameplay/training/tutorial-controller";
import { AppStateController } from "../../src/app/interface/app-state-controller";
import {
  createLiveScreenActionBindings,
  type ScreenActionBindingPorts,
} from "../../src/app/interface/screen-action-bindings";
import { createSurfaceAvailability } from "../../src/domain/surface-availability";
import { backControl, tabs, verticalMenu } from "../../src/presentation/screens/screen-primitives";
import { keyboardLabel } from "../../src/domain/keyboard-bindings";

class TestUi implements ScreenUiPort {
  readonly ink = "#000";
  readonly density = { touch: false, compact: false };
  readonly t = {
    type: {
      wordmark: 80,
      display: 52,
      h1: 40,
      h2: 30,
      title: 24,
      lead: 20,
      body: 16,
      label: 15,
      caption: 14,
      micro: 13,
    },
    font: {
      brand: "'Courier New', monospace",
      display: "sans-serif",
      body: "monospace",
      displayWeight: 600,
      bodyWeight: 400,
      bodyMediumWeight: 500,
    },
    alpha: { full: 1, soft: 0.78, muted: 0.66, faint: 0.52, rail: 0.9, railMid: 0.6, sheet: 0.96 },
    color: {
      accent: "#13c4d6",
      muted: "#62646f",
      danger: "#e23b3b",
      paper: "#fff",
      rail: "#06070c",
      railInk: "#f1eff9",
      unique: "#13c4d6",
    },
    metric: {
      btnH: 48,
      btnW: 300,
      panelPad: 14,
      btnGap: 12,
      pageTitleY: 92,
      pageBodyTop: 156,
      backW: 220,
      settingsRowH: 58,
      settingsControlW: 252,
      settingsControlH: 42,
      settingsStepperW: 54,
      minTarget: 32,
      listRowH: 46,
      railFadeW: 800,
      railFadeMid: 0.56,
    },
    space: { xs: 6, sm: 10, md: 16, lg: 24, xl: 40 },
  };
  sheetRect(): Readonly<{ x: number; y: number; w: number; h: number }> {
    return { x: 180, y: 44, w: 1240, h: 820 };
  }
  sheetFooter(): Readonly<{ y: number; h: number; backX: number }> {
    return { y: 44 + 820 - 48 - 12, h: 48, backX: 690 };
  }
  readable(color: string): string {
    return color;
  }
  textBox(...values: Parameters<ScreenUiPort["textBox"]>): ReturnType<ScreenUiPort["textBox"]> {
    const size = values[5]?.size ?? 16,
      lineHeight = values[5]?.lineHeight ?? Math.round(size * 1.5);
    return {
      size,
      lines: [values[1]],
      truncated: false,
      overflow: false,
      height: lineHeight,
      lastBaseline: values[3],
      lineHeight,
    };
  }
  fitText(...values: Parameters<ScreenUiPort["fitText"]>): ReturnType<ScreenUiPort["fitText"]> {
    return { size: values[3].size, lines: [values[1]], truncated: false, overflow: false };
  }
  buttonFitWidth(...values: Parameters<ScreenUiPort["buttonFitWidth"]>): number {
    return values[0].measureText(values[1].label).width + 16;
  }
  buttonFitHeight(...values: Parameters<ScreenUiPort["buttonFitHeight"]>): number {
    return values[1].sub === undefined ? this.t.metric.listRowH : this.t.metric.listRowH + 8;
  }
  emptyState(...values: Parameters<ScreenUiPort["emptyState"]>): number {
    return values[4] + 60;
  }
  text(): void {
    return;
  }
  wordmark(): void {
    return;
  }
  displayText(): void {
    return;
  }
  title(): void {
    return;
  }
  tag(): void {
    return;
  }
  keyLegend(...values: Parameters<ScreenUiPort["keyLegend"]>): number {
    return values[0].measureText(values[1]).width;
  }
  header(): void {
    return;
  }
  sectionLabel(...values: Parameters<ScreenUiPort["sectionLabel"]>): number {
    return values[3] + 24;
  }
  card(): void {
    return;
  }
  panel(): void {
    return;
  }
  divider(): void {
    return;
  }
  bar(): void {
    return;
  }
  dim(): void {
    return;
  }
  wrappedText(): void {
    return;
  }
  accentStrip(): void {
    return;
  }
  font(size: number, bold?: boolean): string {
    return `${bold ? "bold " : ""}${String(size)}px monospace`;
  }
  fitTitle(): void {
    return;
  }
  spine(): void {
    return;
  }
  badge(): number {
    return 48;
  }
  avatar(): void {
    return;
  }
  seal(): void {
    return;
  }
  pips(): void {
    return;
  }
  tabs(
    _context: CanvasRenderingContext2D,
    _id: string,
    labels: string[],
    _active: number,
    y: number,
    push?: Parameters<ScreenUiPort["tabs"]>[5],
  ): void {
    labels.forEach((label, index) => {
      push?.({ x: 650 + index * 150, y, w: 150, h: 34, label, _tab: index, _hideBox: true });
    });
  }
  keyBadge(): void {
    return;
  }
  tierPips(): void {
    return;
  }
  scrollHint(): void {
    return;
  }
  finalReward(): ReturnType<ScreenUiPort["finalReward"]> {
    return { x: 420, y: 241, w: 760, h: 418, actionsY: 577 };
  }
}

function createControlContext(controls: ScreenControl[]): ScreenRenderContext {
  return {
    canvas: canvasStub(),
    ui: new TestUi(),
    width: 1600,
    height: 900,
    time: 0,
    enterAmount: 1,
    enterSeconds: 1,
    deltaSeconds: 1 / 60,
    mouse: { x: -1, y: -1 },
    scroll: 0,
    focus: 0,
    touch: false,
    reducedMotion: false,
    pixelScale: 1,
    screenRectangle: { x: 0, y: 0, w: 1600, h: 900 },
    safeInsets: { l: 0, r: 0, t: 0, b: 0 },
    enqueue(control): void {
      controls.push(control);
    },
  };
}

function canvasStub(rectangles?: number[][]): CanvasRenderingContext2D {
  const values = new Map<PropertyKey, unknown>();
  const gradient: CanvasGradient = {
    addColorStop(): void {
      return;
    },
  };
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_target, property): unknown {
      if (values.has(property)) return values.get(property);
      if (property === "measureText") return (text: string): TextMetrics => ({ width: text.length * 8 }) as TextMetrics;
      if (property === "createLinearGradient" || property === "createRadialGradient")
        return (): CanvasGradient => gradient;
      if (property === "fillRect")
        return (...args: number[]): void => {
          rectangles?.push(args);
        };
      return (): void => {
        return;
      };
    },
    set(_target, property, value): boolean {
      values.set(property, value);
      return true;
    },
  });
}

function createRenderContext(controls: ScreenControl[]): ScreenRenderContext {
  return {
    canvas: canvasStub(),
    ui: new TestUi(),
    width: 1600,
    height: 900,
    time: 0,
    enterAmount: 1,
    enterSeconds: 1,
    deltaSeconds: 1 / 60,
    mouse: { x: -1, y: -1 },
    scroll: 0,
    focus: 0,
    touch: false,
    reducedMotion: false,
    pixelScale: 1,
    screenRectangle: { x: 0, y: 0, w: 1600, h: 900 },
    safeInsets: { l: 0, r: 0, t: 0, b: 0 },
    enqueue(control): void {
      controls.push(control);
    },
  };
}

describe("legacy screen renderer registry", () => {
  it("keeps every boss phase reachable by scrolling the Drills list at 800 by 360", () => {
    const controller = new TutorialController(CONFIG);
    controller.openPractice(800, 1);
    const found: string[] = [];
    // The list scrolls over its measured extent (the shared scrolling list clamps past the end).
    for (let scroll = 0; scroll <= 2400; scroll += 24) {
      // A small landscape touch screen runs the compact density (tutorial pause uses its tight composition).
      const controls: ScreenControl[] = [],
        context = createRenderContext(controls);
      const ui = new TestUi();
      Object.assign(ui, { density: { touch: true, compact: true } });
      const renderer = createScreenRenderers({ ...context, ui, width: 800, height: 360, scroll });
      renderer.paused({
        id: "paused",
        tutorial: { ...controller.session(), practiceTab: "bosses", bossCatalog: practiceBossCatalog(() => 1) },
      } as Parameters<typeof renderer.paused>[0]);
      expect(controls.every((control) => control.y >= 0 && control.y + control.h <= 360 && control.h >= 24)).toBe(true);
      found.push(
        ...controls
          .filter((control) => control.action.type === "tutorial.action" && control.action.command === "select-boss")
          .map((control) => control.label),
      );
    }
    expect(new Set(found).size).toBe(18);
  });

  it("keeps local Vault controls stable below the import toolbar", () => {
    const controls: ScreenControl[] = [],
      renderer = createScreenRenderers(createControlContext(controls));
    const local = {
      id: "profile" as const,
      tab: "vault",
      tabs: [],
      name: "Guest",
      signedIn: false,
      stats: [],
      archive: { status: "idle" as const, detail: "Local files", canPick: true },
      replays: [
        {
          id: "local-source",
          title: "Local capsule",
          detail: "Local bytes",
          canDownloadArchive: true,
          available: true,
        },
      ],
    };
    renderer.profile(local);
    // The vault toolbar sits under the tabs (y 306); rows start below it (306 + 62).
    expect(controls.find((control) => control.label === "DOWNLOAD")).toMatchObject({
      x: 968,
      y: 430,
      action: { id: "local-source" },
    });
  });
  it("pauses the Tutorial on the current lesson with plain actions and only reached lessons", () => {
    const controls: ScreenControl[] = [],
      context = createRenderContext(controls),
      title = vi.spyOn(context.ui, "title");
    const renderer = createScreenRenderers(context),
      controller = new TutorialController(CONFIG);
    controller.start(1600);
    renderer.paused({ id: "paused", abilities: [], progress: [], tutorial: controller.session() });
    expect(title).toHaveBeenCalledWith(
      expect.anything(),
      "TUTORIAL",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    const labels = controls.map((control) => control.label);
    expect(labels.slice(0, 3)).toEqual(["RESUME", "RESTART LESSON", "SKIP LESSON"]);
    expect(labels).toEqual(expect.arrayContaining(["SETTINGS", "MAIN MENU"]));
    expect(labels.some((label) => /LOCKED|LESSON HELP|DIAGNOSTIC|PLAYBACK|UNFINISHED/.test(label))).toBe(false);
    expect(
      controls.filter((control) => control.action.type === "tutorial.action" && control.action.command === "select"),
    ).toHaveLength(1);
    expect(controls.find((control) => control.label === "SKIP LESSON")?.action).toEqual({
      type: "tutorial.action",
      command: "skip",
    });
    controls.length = 0;
    renderer.paused({
      id: "paused",
      abilities: [],
      progress: [],
      tutorial: { ...controller.session(), phase: "free-practice", courseCompleted: true },
    });
    expect(controls[0]).toMatchObject({ label: "START A RUN", action: { type: "run.quit", next: "setup" } });
    expect(controls[1]?.label).toBe("KEEP PRACTICING");
    expect(controls.some((control) => control.label === "SKIP LESSON")).toBe(false);
  });
  it("offers explicit unlocked Drills without labeling unknown historical lessons as learned", () => {
    const controls: ScreenControl[] = [],
      context = createRenderContext(controls),
      title = vi.spyOn(context.ui, "title"),
      copy = vi.fn<CanvasRenderingContext2D["fillText"]>();
    context.canvas.fillText = copy;
    const renderer = createScreenRenderers(context),
      controller = new TutorialController(CONFIG);
    controller.openPractice(1600, 1);
    renderer.paused({ id: "paused", abilities: [], progress: [], tutorial: controller.session() });
    expect(title).toHaveBeenCalledWith(
      expect.anything(),
      "DRILLS",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    const exercises = controls.filter(
      (control) => control.action.type === "tutorial.action" && control.action.command === "select",
    );
    expect(exercises).toHaveLength(13);
    // One tab row, the hubs' shared strip (hit boxes only), replaces the three mode buttons.
    const tabs = controls.filter(
      (control) => control.action.type === "tutorial.action" && control.action.command === "tab",
    );
    expect(
      tabs.map((control) => [
        control.action.type === "tutorial.action" && control.action.command === "tab" && control.action.tab,
        control.hiddenBox,
      ]),
    ).toEqual([
      ["lessons", true],
      ["weapons", true],
      ["enemies", true],
      ["bosses", true],
    ]);
    expect(controller.session().practiceTab).toBe("lessons");
    expect(controls.some((control) => /ANNEXES|CATALOG|BOSS PRACTICE|BASELINE EXERCISES/u.test(control.label))).toBe(
      false,
    );
    expect(
      exercises.every(
        (control) => control.enabled && !control.label.includes("✓") && !control.label.includes("LOCKED"),
      ),
    ).toBe(true);
    controls.length = 0;
    renderer.paused({
      id: "paused",
      abilities: [],
      progress: [],
      tutorial: {
        ...controller.session(),
        coach: {
          available: true,
          visible: false,
          mode: "comparison",
          rate: 0.5,
          diagnosis: "Valid objective recorded.",
          canCompare: true,
          reducedMotion: true,
          tick: 0,
          fromTick: 0,
          toTick: 10,
        },
      },
    });
    expect(
      controls.filter((control) => control.action.type === "tutorial.action").map((control) => control.label),
    ).toEqual(expect.arrayContaining(["SHOW DEMO", "DEMO SPEED 0.5×", "COMPARE WITH DEMO"]));
    expect(
      controls
        .filter((control) => control.label === "COMPARE WITH DEMO")
        .every((control) => control.y + control.h <= context.height),
    ).toBe(true);
    controls.length = 0;
    controller.showPracticeTab("weapons");
    controller.selectAnnex("hammer");
    renderer.paused({ id: "paused", abilities: [], progress: [], tutorial: controller.session() });
    expect(
      controls
        .filter((control) => control.action.type === "tutorial.action" && control.action.command === "select-annex")
        .map((control) => control.label),
    ).toEqual(["SWORD", "HAMMER", "GREATSWORD", "CHAINBLADE", "RIFTLOCK"]);
    expect(controls.some((control) => control.label === "SHOW DEMO")).toBe(false);
    controls.length = 0;
    copy.mockClear();
    controller.showPracticeTab("enemies");
    renderer.paused({
      id: "paused",
      abilities: [],
      progress: [],
      tutorial: {
        ...controller.session(),
        enemyCatalog: [
          { id: "charger", title: "CHARGER", knowledge: "confirmed-defeated", canPractice: true },
          { id: "mender", title: "MENDER", knowledge: "unknown", canPractice: false },
        ],
      },
    });
    expect(controls.find((control) => control.label === "CHARGER")).toMatchObject({
      enabled: true,
      sub: "DEFEATED",
      action: { command: "select-enemy", lessonId: "charger" },
    });
    expect(controls.find((control) => control.label === "MENDER")).toMatchObject({
      enabled: false,
      sub: "NOT MET YET",
    });
    expect(controls.some((control) => control.label === "SHOW DEMO")).toBe(false);
    expect(copy.mock.calls.map(([line]) => line).join(" ")).toContain(
      "Opponents you have met in a run are listed here.",
    );
    expect(copy.mock.calls.map(([line]) => line).join(" ")).not.toContain("slam");
    const lastRowBottom = Math.max(
      ...controls
        .filter((control) => control.action.type === "tutorial.action" && control.action.command === "select-enemy")
        .map((control) => control.y + control.h),
    );
    // The help starts under the list, a gap clear of its last row (its first line's top below it).
    expect(
      copy.mock.calls.every(([, , y]) => y - context.ui.t.type.caption >= lastRowBottom + context.ui.t.space.sm),
    ).toBe(true);
    expect(context.canvas.textBaseline).toBe("alphabetic");
    controls.length = 0;
    renderer.menu({
      id: "menu",
      playerName: "Guest",
      signedIn: false,
      coins: 0,
      shards: 0,
      unlocked: 0,
      modeLabel: "Tutorial",
      difficultyLabel: "Normal",
      practiceAvailable: true,
    });
    expect(controls.find((control) => control.label === "DRILLS")?.action).toEqual({
      type: "tutorial.action",
      command: "open-practice",
    });
  });
  it("wraps onboarding at body size above cards without adding or moving controls at standard and small landscape sizes", () => {
    for (const [width, height] of [
      [1600, 900],
      [844, 414],
    ] as const) {
      const controls: ScreenControl[] = [],
        lines: { text: string; x: number; y: number; width: number; font: string }[] = [];
      const base = createRenderContext(controls),
        ui: ScreenUiPort = new TestUi(),
        canvas = base.canvas;
      canvas.measureText = (text) => ({ width: text.length * 9.6 }) as TextMetrics;
      const measuredBox = ui.textBox.bind(ui);
      ui.textBox = (...args: Parameters<ScreenUiPort["textBox"]>) => {
        const box = measuredBox(...args);
        if (args[5]?.measureOnly !== true)
          lines.push({
            text: args[1],
            x: args[2],
            y: args[3],
            width: canvas.measureText(args[1]).width,
            font: ui.font(box.size),
          });
        return box;
      };
      const hints: { text: string; y: number; size: number | undefined }[] = [];
      ui.text = (...args: Parameters<ScreenUiPort["text"]>) => {
        hints.push({ text: args[1], y: args[3], size: args[4] });
      };
      const renderer = createScreenRenderers({ ...base, width, height, ui, canvas });
      const draft = { id: "draft" as const, wave: 1, rerolls: 0, cards: [{ id: "speed", label: "SPEED" }] };
      renderer.draft(draft);
      const draftControls = [...controls];
      // The reroll button names the key the binding table gives it.
      expect(draftControls.map((control) => control.label)).toContain(`⟳  REROLL · 0  [${keyboardLabel("reroll")}]`);
      controls.length = 0;
      lines.length = 0;
      renderer.draft({ ...draft, onboarding: campaignDraftGuidance("campaign", 1, 0, 0) ?? "" });
      // The guidance adds no control: the action row stays put and the deck starts under the wrapped copy.
      expect(controls.map((control) => control.action)).toEqual(draftControls.map((control) => control.action));
      expect(controls.filter((control) => !control.hiddenBox)).toEqual(
        draftControls.filter((control) => !control.hiddenBox),
      );
      const guidance = lines.find((line) => line.text.includes("this run only"));
      expect(guidance?.font.startsWith("16px")).toBe(true);
      expect(controls.filter((control) => control.hiddenBox).every((card) => card.y > (guidance?.y ?? 0))).toBe(true);
      controls.length = 0;
      lines.length = 0;
      const shop = buildShopSnapshot({
        tab: "upgrades",
        items: [{ id: "hp", cat: "vit", name: "HP", maxLevel: 2, desc: "health" }],
        realCoins: 0,
        displayedCoins: 0,
        lifetimeEarned: 0,
        shopBuys: 0,
        lifetimeSpent: 0,
        height,
        scroll: 0,
        now: 0,
        level: () => 0,
        cost: () => 325,
        canBuy: () => false,
      }).view;
      const unguided = { ...shop };
      delete unguided.onboarding;
      renderer.shop(unguided);
      const shopControls = [...controls];
      controls.length = 0;
      renderer.shop(shop);
      expect(controls).toEqual(shopControls);
      // The first-run hint takes the status row under the tabs, at caption size, above the list.
      const hint = hints.find((entry) => entry.text.includes("Buying is optional"));
      expect(hint).toMatchObject({ size: ui.t.type.caption });
      expect((hint?.y ?? 0) > DESKTOP.shop.statusTop && (hint?.y ?? 0) < SHOP_LIST_TOP).toBe(true);
    }
  });
  it("is exhaustive for every canonical application screen", () => {
    expectTypeOf<ReturnType<typeof createUi>>().toExtend<ScreenUiPort>();
    const registry = createScreenRenderers(createControlContext([]));
    expect(Object.keys(registry).sort()).toEqual([
      "achievements",
      "codex",
      "confirmquit",
      "continue",
      "draft",
      "gameover",
      "leaderboards",
      "menu",
      "music",
      "paused",
      "pglab",
      "pgmenu",
      "playing",
      "profile",
      "rename",
      "replay",
      "reserve",
      "settings",
      "setup",
      "shop",
      "tierup",
      "win",
    ]);
    expect(() => {
      registry.playing({ id: "playing" });
    }).not.toThrow();
  });

  it("draws MUSIC: a rail, Home's shelves, a collection's page, Settings and the transport", () => {
    const controls: ScreenControl[] = [];
    let written = -1;
    const music = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../public/audio/music.json", import.meta.url)), "utf8"),
    ) as { catalog: unknown; routing: unknown };
    const catalog = parseMusicCatalog(music.catalog);
    const library = buildMusicLibrary(
      catalog,
      validateMusicRoutingManifest(music.routing),
      Object.fromEntries(catalog.works.map((work) => [work.id, 30])),
    );
    const view = (page: string) =>
      buildMusicScreenView({
        settings: {},
        library,
        nowPlaying: { workId: "fillet", title: "Fillet", since: 1 },
        preview: "fillet",
        page,
        queue: ["fillet", "spring"],
        now: 15_001,
      });
    const context = { ...createRenderContext(controls), scroll: 0, setScroll: (value: number) => (written = value) };
    const types = () => controls.map((control) => control.action);
    createScreenRenderers(context).music(view("home"));
    // The rail: Home · Songs · Settings, then every stage; the Stages shelf opens the same pages.
    for (const tab of ["home", "songs", "settings"])
      expect(types()).toContainEqual({ type: "navigate", to: "music", tab });
    const stageOpens = types().filter(
      (action) => action.type === "navigate" && action.tab?.startsWith("collection:stage:"),
    );
    expect(stageOpens.length).toBeGreaterThan(6);
    // Now playing (STOP while previewing) and the transport's ◀◀ ■ ▶▶.
    expect(controls.filter((control) => control.action.type === "music.stopPreview").map((c) => c.label)).toEqual([
      "■  STOP",
      "■",
    ]);
    expect(controls.filter((control) => control.action.type === "music.step").map((c) => c.label)).toEqual([
      "◀◀",
      "▶▶",
    ]);
    expect(types()).toContainEqual({ type: "navigate.back" });
    for (const control of controls) expect(control.y + control.h).toBeLessThanOrEqual(900);

    // A stage's page: the crumb back, PLAY over the stage's songs, one row per song with that queue.
    controls.length = 0;
    createScreenRenderers(context).music(view("collection:stage:the-voidspire"));
    // The crumb, the rail's Home and BACK all lead up to Home.
    const toHome = controls.filter(
      (c) => c.action.type === "navigate" && c.action.to === "music" && c.action.tab === "home",
    );
    expect(toHome).toHaveLength(3);
    const queue = ["looking-out", "reflection-of-the-bladeless"];
    expect(controls.find((control) => control.label === "▶  PLAY")?.action).toEqual({
      type: "music.preview",
      id: "looking-out",
      queue,
    });
    expect(types()).toContainEqual({ type: "music.preview", id: "reflection-of-the-bladeless", queue });

    // Songs scrolls its whole list; the scroll is clamped to it.
    controls.length = 0;
    createScreenRenderers({ ...context, scroll: 10_000 }).music(view("songs"));
    expect(written).toBeGreaterThan(0);
    expect(written).toBeLessThan(10_000);

    controls.length = 0;
    createScreenRenderers(context).music(view("settings"));
    // Music (the pick) and Soundtrack behavior.
    expect(controls.filter((control) => control.action.type === "settings.activate")).toHaveLength(2);
  });

  it("draws the Radio: a row per channel the player can tune to, PLAY to pick it, STOP on the pick; ▶▶ moves it on", () => {
    const controls: ScreenControl[] = [];
    setMusicProgressFacts(() => progressFacts({ stats: {}, ach: {} }));
    const library = publishMusicLibrary(
      parseMusicCatalog({ ...musicIndex.catalog, ...TEST_CHANNELS }),
      validateMusicRoutingManifest(musicIndex.routing),
    );
    const view = (menuMusic: string, channel: Readonly<{ channelId: string; channelName: string }> | null) =>
      buildMusicScreenView({
        settings: { menuMusic },
        library,
        nowPlaying: { workId: "fillet", title: "Fillet", since: 1, ...channel },
        preview: null,
        page: "radio",
        now: 15_001,
      });
    const context = { ...createRenderContext(controls), scroll: 0, setScroll: () => undefined };
    const picks = () => controls.filter((control) => control.action.type === "music.pick");

    createScreenRenderers(context).music(view("default", null));
    expect(controls.map((control) => control.action)).toContainEqual({ type: "navigate", to: "music", tab: "radio" });
    // A new player can tune to Calm only: Bosses holds nothing found, My mix and Odd cannot be honoured.
    expect(picks().map((control) => [control.label, control.action])).toEqual([
      ["▶  PLAY", { type: "music.pick", value: "channel:calm" }],
    ]);
    expect(controls.some((control) => control.action.type === "music.next")).toBe(false);

    controls.length = 0;
    createScreenRenderers(context).music(view("channel:calm", { channelId: "calm", channelName: "Calm" }));
    expect(picks().map((control) => [control.label, control.action])).toEqual([
      ["■  STOP", { type: "music.pick", value: "default" }],
    ]);
    expect(controls.filter((control) => control.action.type === "music.next").map((control) => control.label)).toEqual([
      "▶▶",
    ]);
    for (const control of controls) expect(control.y + control.h).toBeLessThanOrEqual(900);
    setMusicProgressFacts(null);
  });

  it("records semantic navigation and menu actions without coordinating state", () => {
    const controls: ScreenControl[] = [];
    const context = createControlContext(controls);
    backControl(context, { type: "navigate", to: "paused" });
    verticalMenu(
      context,
      [
        { label: "RESUME", action: { type: "run.resume" } },
        { label: "MAIN MENU", action: { type: "navigate", to: "confirmquit" } },
      ],
      220,
      210,
    );
    tabs(
      context,
      [
        { id: "audio", label: "AUDIO", selected: true },
        { id: "accessibility", label: "ACCESSIBILITY" },
      ],
      (id) => ({ type: "settings.selectTab", id }),
    );

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
    const renderer = createScreenRenderers({
      ...base,
      canvas: canvasStub(rectangles),
      screenRectangle: { x: -120, y: -40, w: 1840, h: 980 },
    });
    renderer.menu({
      id: "menu",
      playerName: "Guest",
      signedIn: false,
      coins: 0,
      shards: 0,
      unlocked: 0,
      modeLabel: "Endless",
      difficultyLabel: "Normal",
      biome: "The Grounds",
    });
    // The rail anchors to the true left edge (x = viewport.x + 100); its soft fade starts at
    // the physical edge and runs `railFadeW` (800) into the scene, the same falloff as at 16:9.
    expect(rectangles[0]).toEqual([-120, -40, 800, 980]);
    expect(rectangles).toHaveLength(1);
    expect(
      controls.find((control) => control.action.type === "navigate" && control.action.to === "setup"),
    ).toMatchObject({ x: -20, y: 318, w: 320, h: 86 });
    controls.length = 0;
    createScreenRenderers({ ...base, touch: true, screenRectangle: { x: -120, y: -40, w: 1840, h: 980 } }).menu({
      id: "menu",
      playerName: "Guest",
      signedIn: false,
      coins: 0,
      shards: 0,
      unlocked: 0,
      modeLabel: "Endless",
      difficultyLabel: "Normal",
    });
    // Touch anchors to the same true left edge (the old centre zoom is gone; density scales the type instead).
    expect(
      controls.find((control) => control.action.type === "navigate" && control.action.to === "setup"),
    ).toMatchObject({ x: -20 });
    expect(controls[0]).toMatchObject({ dot: "#8a93a6", ghost: true });
  });

  it("preserves critical legacy labels and the independent audio-control contract", () => {
    const screenFiles = [
      "menu-setup.ts",
      "settings-rename.ts",
      "draft-reserve-tierup.ts",
      "pause-results.ts",
      "codex-shop.ts",
      "codex-shop-metrics.ts",
      "profile-achievements.ts",
    ];
    const source = [
      ...screenFiles.map((file) =>
        readFileSync(fileURLToPath(new URL(`../../src/presentation/screens/${file}`, import.meta.url)), "utf8"),
      ),
      readFileSync(fileURLToPath(new URL("../../src/presentation/ui-menu.ts", import.meta.url)), "utf8"),
    ].join("\n");
    for (const label of [
      "T E A R",
      "PLAY",
      "SHOP",
      "ACHIEVEMENTS",
      "LEADERBOARDS",
      "CODEX",
      "SETTINGS",
      "START",
      "MASTER",
      "MUSIC",
      "SOUND EFFECTS",
      "RESERVE A CARD",
      "THE WAY OPENS",
      "click to step through tiers",
      "DAILY CHALLENGES",
      "PAUSED",
      "QUIT RUN?",
      "YOU FELL",
      "DEFEATED",
      "VICTORY",
      "THE WORLD, RESTORED",
    ])
      expect(source).toContain(label);
    expect(source).toContain("ui.avatar");
    expect(source).toContain("ui.seal");
    expect(source).toContain("ui.pips");
    expect(source).not.toMatch(/localStorage|Cloud\.|CG\.|PROFILE\.|META\.|saveSettings|startRun\(/);
  });

  it("preserves setup hit geometry, Boss Test selection, bounties, and the legacy start target", () => {
    const controls: ScreenControl[] = [];
    const renderer = createScreenRenderers(createRenderContext(controls));
    renderer.setup({
      id: "setup",
      modes: ["endless", "rush", "daily", "boss"].map((id) => ({ id, label: id })),
      difficulties: ["easy", "normal", "hard", "tear"].map((id) => ({ id, label: id })),
      weapons: ["sword", "chainblade", "riftlock", "scythe"].map((id) => ({ id, label: id })),
      showDifficulty: true,
      startGlyph: "▢",
      startSummary: "ENDLESS · NORMAL · SWORD",
      bossChoices: [
        { id: "shuffle", label: "SHUFFLE" },
        { id: "warden", label: "WARDEN" },
      ],
    });
    const sharedGrid = [
      { y: 168, h: 56 },
      { y: 228, h: 56 },
      { y: 288, h: 56 },
      { y: 348, h: 56 },
    ];
    for (const action of ["setup.selectMode", "setup.selectDifficulty", "setup.selectWeapon"]) {
      expect(controls.filter((control) => control.action.type === action).map(({ y, h }) => ({ y, h }))).toEqual(
        sharedGrid,
      );
    }
    expect(controls.find((control) => control.action.type === "setup.start")).toMatchObject({
      y: 722,
      h: 58,
      label: "START",
      glyph: "▢",
    });
    expect(controls.filter((control) => control.action.type === "setup.selectBoss")).toHaveLength(2);
  });

  it("flows shop categories by their real contents instead of fixed-height slots", () => {
    const controls: ScreenControl[] = [];
    const renderer = createScreenRenderers(createRenderContext(controls));
    const item = (id: string) => ({ id, label: id.toUpperCase(), level: 0, maxLevel: 3, cost: "10c", enabled: true });
    renderer.shop({
      id: "shop",
      tab: "upgrades",
      tabs: [],
      coins: 100,
      ownedLevels: 0,
      totalLevels: 18,
      lifetimeEarned: 100,
      sections: [
        { label: "VITALITY", items: [item("v1"), item("v2"), item("v3")] },
        { label: "BLADE", items: [item("b1")] },
        { label: "TEMPO", items: [item("t1")] },
        { label: "FORTUNE", items: [item("f1"), item("f2")] },
      ],
    });
    const buyY = (id: string) =>
      controls.find((control) => control.action.type === "shop.buy" && control.action.id === id)?.y ?? Number.NaN;
    // 88 px rows (two-line descriptions), 14 px between categories; columns flow independently.
    // A category label takes the shop's fixed head (the game's sectionLabel always advances 18 px),
    // not this test UI's 24 px advance. The first BUY sits a fixed distance under the list top.
    const first = SHOP_LIST_TOP + 57;
    expect(buyY("v1")).toBe(first);
    expect(buyY("b1")).toBe(first + 302);
    expect(buyY("t1")).toBe(first);
    expect(buyY("f1")).toBe(first + 126);
  });

  it("models Codex guide details and rich profile/achievement surfaces without gameplay callbacks", () => {
    const controls: ScreenControl[] = [];
    const renderer = createScreenRenderers(createRenderContext(controls));
    renderer.codex({
      id: "codex",
      tab: "guide",
      tabs: [{ id: "guide", label: "GUIDE", selected: true }],
      cards: [],
      guide: {
        controls: [{ keys: ["A", "D"], description: "move" }],
        controller: ["left stick move"],
        tricks: [{ glyph: "✦", name: "PARRY", points: 15, description: "swing fast" }],
        ladder: [{ name: "S", multiplier: 4, fraction: 1 }],
        variety: "vary your tricks",
      },
    });
    renderer.profile({
      id: "profile",
      tab: "bests",
      tabs: [{ id: "bests", label: "BESTS" }],
      name: "Guest",
      signedIn: false,
      stats: [],
      passport: {
        coins: 10,
        shards: 2,
        achievements: "3 / 40",
        canRename: false,
        canSignIn: true,
        canSignOut: false,
        showcases: [],
      },
      finest: { headline: "WAVE 12 · 9000 PTS", detail: "YOUR FINEST" },
      records: [{ mode: "Endless", difficulty: "Hard", wave: "12", time: "03:20", score: "9,000" }],
    });
    renderer.achievements({
      id: "achievements",
      category: "all",
      categories: [{ id: "all", label: "ALL 1/2" }],
      unlocked: 1,
      total: 2,
      cards: [],
      shards: 4,
      resetsIn: "2h",
      nextUp: "Sharp Start 80%",
      dailies: [{ label: "PARRY 3", current: 2, goal: 3, reward: "◆ +2", done: false }],
    });
    expect(controls.map((control) => control.action.type)).toEqual(
      expect.arrayContaining([
        "codex.selectTab",
        "profile.selectTab",
        "profile.openAchievements",
        "profile.signIn",
        "achievements.selectCategory",
      ]),
    );
  });

  it("preserves leaderboard podium/replay theatre controls and settings cycle rows", () => {
    const controls: ScreenControl[] = [];
    const renderer = createScreenRenderers(createRenderContext(controls));
    renderer.leaderboards({
      id: "leaderboards",
      tab: "global",
      tabs: [{ id: "global", label: "GLOBAL" }],
      modes: [{ id: "endless", label: "ENDLESS" }],
      difficulties: [{ id: "hard", label: "HARD" }],
      rows: [],
      podium: [{ rank: 1, name: "Player", detail: "wave 20", color: "#e0a326", replayId: "r1" }],
      ownRank: "#12 YOU",
    });
    renderer.replay({
      id: "replay",
      title: "Player · Endless",
      detail: "wave 20",
      paused: false,
      speed: 1,
      elapsed: "01:00",
      duration: "02:00",
      progress: 0.5,
      chapters: [{ fraction: 0.25, boss: true }],
      infoVisible: true,
      infoRows: [{ label: "SCORE", value: "9000" }],
      loadout: [{ id: "reach", label: "LONG ARM", footer: "×2" }],
    });
    renderer.replay({
      id: "replay",
      title: "GHOST 3 THEATER",
      detail: "verified",
      paused: true,
      speed: 1,
      elapsed: "TICK 120",
      duration: "TICK 240",
      progress: 0.5,
      theater: true,
      practiceAvailable: true,
    });
    renderer.settings({
      id: "settings",
      tab: "controls",
      tabs: [{ id: "controls", label: "CONTROLS" }],
      sections: [
        {
          label: "CONTROLS",
          rows: [
            {
              key: "padPreset",
              label: "Controller preset",
              value: "STANDARD · RECOMMENDED",
              kind: "cycle",
              note: "Balanced shoulders",
            },
          ],
        },
      ],
    });
    expect(controls.map((control) => control.action.type)).toEqual(
      expect.arrayContaining([
        "leaderboards.selectBoard",
        "leaderboards.watchReplay",
        "replay.jumpChapter",
        "replay.togglePause",
        "replay.restart",
        "replay.practice",
        "replay.runDna.toggle",
        "replay.toggleInfo",
        "replay.exit",
        "settings.activate",
      ]),
    );
    expect(controls.find((control) => control.action.type === "leaderboards.selectTab")).toMatchObject({
      y: 124,
      h: 34,
      hiddenBox: true,
    });
    expect(
      controls.find(
        (control) => control.action.type === "leaderboards.selectBoard" && control.action.id === "mode:endless",
      ),
    ).toMatchObject({ y: 198, w: 190, h: 34, chip: true });
    expect(controls.find((control) => control.action.type === "leaderboards.watchReplay")).toMatchObject({
      x: 872,
      y: 392,
      w: 48,
      h: 30,
    });
    expect(controls.find((control) => control.action.type === "replay.togglePause")).toMatchObject({
      x: 292,
      y: 834,
      w: 96,
      h: 44,
    });
    expect(controls.find((control) => control.action.type === "replay.practice")).toMatchObject({
      x: 644,
      y: 834,
      w: 180,
      h: 44,
      enabled: true,
    });
  });

  it("draws a read-only settings row without a control to press", () => {
    const controls: ScreenControl[] = [];
    createScreenRenderers(createRenderContext(controls)).settings({
      id: "settings",
      tab: "general",
      tabs: [{ id: "general", label: "GENERAL" }],
      sections: [
        {
          label: "GENERAL",
          rows: [
            { key: "terms", label: "Terms of Service", value: "OPEN", kind: "cycle" },
            { key: "version", label: "Version", value: "v0.1.0 · 820e8e9", kind: "info" },
          ],
        },
      ],
    });
    const keys = controls.flatMap((control) => ("key" in control.action ? [control.action.key] : []));
    expect(keys).toContain("terms");
    expect(keys).not.toContain("version");
  });

  it("uses the oracle replay-vault row geometry and a profile-specific watch intent", () => {
    const controls: ScreenControl[] = [];
    const renderer = createScreenRenderers(createRenderContext(controls));
    renderer.profile({
      id: "profile",
      tab: "replays",
      tabs: [{ id: "replays", label: "REPLAYS", selected: true }],
      name: "Guest",
      signedIn: false,
      stats: [],
      replays: [
        {
          id: "local-1",
          title: "You — Endless · normal",
          detail: "wave 4 · 900 pts",
          available: true,
          local: true,
          pinned: false,
          shared: false,
        },
      ],
    });
    expect(controls.find((control) => control.action.type === "profile.watchReplay")).toMatchObject({
      x: 968,
      y: 324,
      w: 110,
      h: 40,
    });
    expect(controls.find((control) => control.action.type === "profile.pinReplay")).toMatchObject({
      x: 1086,
      y: 324,
      w: 78,
      h: 40,
    });
  });

  it("renders Ghost Vault custody rows without exposing legacy replay mutations", () => {
    const controls: ScreenControl[] = [];
    const renderer = createScreenRenderers(createRenderContext(controls));
    renderer.profile({
      id: "profile",
      tab: "vault",
      tabs: [{ id: "vault", label: "VAULT", selected: true }],
      name: "Guest",
      signedIn: false,
      stats: [],
      replays: [
        {
          id: "capsule:run-1",
          title: "Ghost V3 - COACHING",
          detail: "COMPLETE - 3 CHUNKS",
          available: false,
          badge: "DURABLE CAPSULE",
        },
      ],
    });
    expect(controls.find((control) => control.action.type === "profile.watchGhostCapsule")).toMatchObject({
      enabled: false,
      label: "◆ THEATER",
      action: { type: "profile.watchGhostCapsule", id: "capsule:run-1" },
    });
    expect(controls.some((control) => control.action.type === "profile.pinReplay")).toBe(false);
    expect(controls.some((control) => control.action.type === "profile.deleteReplay")).toBe(false);
  });

  it("keeps archive selection and exact restore controls outside the empty/populated Vault row clip", () => {
    for (const populated of [false, true]) {
      const controls: ScreenControl[] = [],
        renderer = createScreenRenderers(createRenderContext(controls));
      renderer.profile({
        id: "profile",
        tab: "vault",
        tabs: [],
        name: "Guest",
        signedIn: false,
        stats: [],
        replays: populated
          ? [{ id: "healthy", title: "Ghost", detail: "Complete", available: true, canDownloadArchive: true }]
          : [],
        archive: {
          status: "ready",
          detail: "Preview only",
          canPick: true,
          jobId: "intent",
          revision: 7,
          canReselect: true,
          canRestore: true,
          canCancel: true,
        },
      });
      expect(controls.find((control) => control.action.type === "profile.pickGhostArchive")).toMatchObject({
        y: 306,
        enabled: true,
      });
      expect(controls.find((control) => control.action.type === "profile.restoreGhostArchive")).toMatchObject({
        y: 306,
        action: { id: "intent", revision: 7 },
      });
      expect(controls.find((control) => control.action.type === "profile.cancelGhostRestore")).toMatchObject({
        action: { id: "intent", revision: 7 },
      });
      if (populated)
        expect(controls.find((control) => control.action.type === "profile.downloadGhostArchive")).toMatchObject({
          y: 452,
          w: 116,
        });
    }
  });
  it("offers a separate linked-pair download and named RESTORE BOTH while keeping the single download", () => {
    const controls: ScreenControl[] = [],
      renderer = createScreenRenderers(createRenderContext(controls));
    renderer.profile({
      id: "profile",
      tab: "vault",
      tabs: [],
      name: "Guest",
      signedIn: false,
      stats: [],
      replays: [
        {
          id: "parent",
          title: "Scored run",
          detail: "Complete",
          available: true,
          canDownloadArchive: true,
          canDownloadLinkedPair: true,
        },
      ],
      archive: {
        status: "ready",
        detail: "Validated pair",
        canPick: true,
        jobId: "pair",
        revision: 0,
        canRestore: true,
        pairedCapsuleIds: ["parent", "finale"],
      },
    });
    const downloads = controls.filter((control) => control.action.type === "profile.downloadGhostArchive");
    expect(downloads).toHaveLength(2);
    expect(downloads.find((c) => c.label === "DOWNLOAD")).toMatchObject({ action: { id: "parent" } });
    expect(downloads.find((c) => c.label === "DOWNLOAD RUN + FINALE")).toMatchObject({
      action: { id: "parent", paired: true },
    });
    expect(controls.find((c) => c.action.type === "profile.restoreGhostArchive")).toMatchObject({
      label: "RESTORE BOTH",
      action: { id: "pair", revision: 0 },
    });
    for (const control of downloads) expect(control.y + control.h).toBeLessThanOrEqual(790);
  });
  it("C39 review: clips scrolled row hit/focus rectangles while fixed archive controls remain reachable", () => {
    for (const tab of ["vault", "replays"]) {
      const controls: ScreenControl[] = [],
        context = createRenderContext(controls),
        renderer = createScreenRenderers({ ...context, scroll: 96 });
      renderer.profile({
        id: "profile",
        tab,
        tabs: [],
        name: "Guest",
        signedIn: false,
        stats: [],
        replays: Array.from({ length: 8 }, (_, index) => ({
          id: `row-${String(index)}`,
          title: "Ghost",
          detail: "Complete",
          available: true,
          canDownloadArchive: true,
          local: tab === "replays",
        })),
        ...(tab === "vault"
          ? {
              archive: {
                status: "ready" as const,
                detail: "Preview",
                canPick: true,
                jobId: "intent",
                revision: 7,
                canReselect: true,
                canRestore: true,
                canCancel: true,
              },
            }
          : {}),
      });
      const rowTypes = new Set([
        "profile.watchGhostCapsule",
        "profile.downloadGhostArchive",
        "profile.compareGhostCapsule",
        "profile.openGhostComparison",
        "profile.repairGhostCapsule",
        "profile.watchReplay",
        "profile.pinReplay",
        "profile.publishReplay",
        "profile.deleteReplay",
      ]);
      const rows = controls.filter((control) => rowTypes.has(control.action.type)),
        top = tab === "vault" ? 390 : 306,
        bottom = context.height - 110;
      expect(rows.filter((control) => control.y < top || control.y + control.h > bottom)).toEqual([]);
      expect(
        rows.some(
          (control) =>
            control.action.type === (tab === "vault" ? "profile.downloadGhostArchive" : "profile.watchReplay"),
        ),
      ).toBe(true);
      if (tab === "vault")
        for (const type of [
          "profile.pickGhostArchive",
          "profile.reselectGhostArchive",
          "profile.restoreGhostArchive",
          "profile.cancelGhostRestore",
        ])
          expect(controls.find((control) => control.action.type === type)).toMatchObject({ y: 306 });
    }
  });

  it("offers healthy complete archive download despite Theater refusal and shows unsupported file capability", () => {
    const controls: ScreenControl[] = [],
      renderer = createScreenRenderers(createRenderContext(controls));
    renderer.profile({
      id: "profile",
      tab: "vault",
      tabs: [],
      name: "Guest",
      signedIn: false,
      stats: [],
      replays: [
        {
          id: "historical",
          title: "Ghost",
          detail: "Healthy complete",
          available: false,
          theaterUnavailable: true,
          canDownloadArchive: true,
        },
      ],
      archive: { status: "unavailable", detail: "Local storage unavailable", canPick: false },
    });
    expect(controls.find((control) => control.action.type === "profile.pickGhostArchive")).toMatchObject({
      enabled: false,
    });
    expect(controls.find((control) => control.action.type === "profile.downloadGhostArchive")).toMatchObject({
      label: "DOWNLOAD",
      action: { id: "historical" },
    });
    expect(controls.find((control) => control.action.type === "profile.watchGhostCapsule")).toMatchObject({
      enabled: false,
    });
    expect(controls.some((control) => control.action.type === "profile.restoreGhostArchive")).toBe(false);
  });

  it("routes a healthy Ghost Vault capsule to Theater through a distinct semantic action", () => {
    const controls: ScreenControl[] = [];
    const renderer = createScreenRenderers(createRenderContext(controls));
    renderer.profile({
      id: "profile",
      tab: "vault",
      tabs: [{ id: "vault", label: "VAULT", selected: true }],
      name: "Guest",
      signedIn: false,
      stats: [],
      replays: [
        {
          id: "verified-capsule",
          title: "Ghost V3 - COACHING",
          detail: "COMPLETE - 3 CHUNKS - HEALTHY",
          available: true,
          badge: "DURABLE CAPSULE",
        },
      ],
    });
    expect(controls.find((control) => control.action.type === "profile.watchGhostCapsule")).toMatchObject({
      enabled: true,
      label: "◆ THEATER",
      action: { type: "profile.watchGhostCapsule", id: "verified-capsule" },
    });
  });

  it("renders a refused Ghost Theater route as disabled without exposing decoder detail", () => {
    const controls: ScreenControl[] = [];
    const renderer = createScreenRenderers(createRenderContext(controls));
    renderer.profile({
      id: "profile",
      tab: "vault",
      tabs: [{ id: "vault", label: "VAULT", selected: true }],
      name: "Guest",
      signedIn: false,
      stats: [],
      replays: [
        {
          id: "refused-capsule",
          title: "Ghost V3 - COACHING",
          detail: "COMPLETE - 3 CHUNKS - HEALTHY",
          available: false,
          theaterUnavailable: true,
          badge: "DURABLE CAPSULE",
        },
      ],
    });
    expect(controls.find((control) => control.action.type === "profile.watchGhostCapsule")).toMatchObject({
      label: "CAN'T PLAY",
      enabled: false,
    });
    expect(JSON.stringify(controls)).not.toContain("codec restore rejected");
  });

  it("offers a semantic repair action only for an unhealthy Vault capsule", () => {
    const controls: ScreenControl[] = [];
    const renderer = createScreenRenderers(createRenderContext(controls));
    renderer.profile({
      id: "profile",
      tab: "vault",
      tabs: [{ id: "vault", label: "VAULT", selected: true }],
      name: "Guest",
      signedIn: false,
      stats: [],
      replays: [
        {
          id: "damaged-capsule",
          title: "Ghost V3 - COACHING",
          detail: "COMPLETE - 3 CHUNKS - NEEDS REPAIR",
          available: false,
          repairable: true,
          badge: "DURABLE CAPSULE",
        },
      ],
    });
    expect(controls.find((control) => control.action.type === "profile.repairGhostCapsule")).toMatchObject({
      label: "REPAIR",
      x: 968,
      y: 324,
      w: 110,
      h: 40,
      action: { type: "profile.repairGhostCapsule", id: "damaged-capsule" },
    });
    expect(controls.some((control) => control.action.type === "profile.watchReplay")).toBe(false);
  });

  it("declares every legacy-only parity field needed before old screen ranges can be deleted", () => {
    const contracts = readFileSync(
      fileURLToPath(new URL("../../src/presentation/screens/contracts.ts", import.meta.url)),
      "utf8",
    );
    for (const field of [
      "bossChoices",
      "bounties",
      "guide",
      "tierCount",
      "previewId",
      "passport",
      "finest",
      "records",
      "journey",
      "dailies",
      "resetsIn",
      "nextUp",
      "podium",
      "ownRank",
      "chapters",
      "infoRows",
      "loadout",
      '"cycle"',
    ])
      expect(contracts).toContain(field);
  });
});

describe("release and engineering surface rendering", () => {
  const menuView = {
    id: "menu" as const,
    playerName: "Guest",
    signedIn: false,
    coins: 0,
    shards: 0,
    unlocked: 0,
    modeLabel: "Endless",
    difficultyLabel: "Normal",
    nowPlaying: { label: "NOW PLAYING", detail: "Grounds" },
  };
  it("seats the music row directly under SETTINGS", () => {
    const controls: ScreenControl[] = [];
    createScreenRenderers(createRenderContext(controls)).menu(menuView);
    const settings = controls.find((control) => control.label === "SETTINGS"),
      music = controls.find((control) => control.glyph === "♪");
    expect(settings).toMatchObject({ y: 670, h: 52 });
    expect(music).toMatchObject({
      x: 100,
      y: 731,
      h: 46,
      action: { type: "navigate", to: "music", resetScroll: true },
    });
    // The footer tagline is drawn at height - 46; the release music row ends well above it.
    expect((music?.y ?? 0) + (music?.h ?? 0)).toBeLessThan(900 - 46 - 20);
  });
  it("renders a release setup with no DEV section, no race control and a centred START", () => {
    const controls: ScreenControl[] = [],
      sectionLabels: string[] = [];
    const context = createRenderContext(controls),
      ui = new TestUi();
    ui.sectionLabel = (...values: Parameters<ScreenUiPort["sectionLabel"]>) => {
      sectionLabels.push(values[1]);
      return values[3] + 24;
    };
    const base = {
      id: "setup" as const,
      modes: [{ id: "endless", label: "Endless", selected: true }],
      difficulties: [{ id: "normal", label: "Normal", selected: true }],
      weapons: [{ id: "sword", label: "Sword", selected: true }],
      showDifficulty: true,
      startGlyph: "▢",
      startSummary: "ENDLESS · NORMAL · SWORD",
    };
    createScreenRenderers({ ...context, ui }).setup(base);
    expect(sectionLabels).toEqual(["MODE", "DIFFICULTY", "WEAPON"]);
    expect(controls.some((control) => control.action.type === "setup.start" && control.action.race === true)).toBe(
      false,
    );
    const start = controls.find((control) => control.action.type === "setup.start");
    expect((start?.x ?? 0) + (start?.w ?? 0) / 2).toBe(800);
    controls.length = 0;
    sectionLabels.length = 0;
    createScreenRenderers({ ...context, ui }).setup({
      ...base,
      raceAvailable: true,
      modes: [...base.modes, { id: "bossonly", label: "Boss Test", debug: true }],
    });
    expect(sectionLabels).toContain("DEV");
    expect(
      controls.find((control) => control.action.type === "setup.start" && control.action.race === true),
    ).toMatchObject({ label: "CREATE SEED-LOCKED RACE" });
  });
  it("closes up the Career command row when a command surface is unavailable", () => {
    const controls: ScreenControl[] = [];
    const hidden = new Set(["race"]);
    const context: ScreenRenderContext = {
      ...createRenderContext(controls),
      available: (action) => action.type !== "career.control" || !hidden.has(action.command),
    };
    const entry = {
      kind: "capsule",
      present: true,
      mode: "endless",
      weapon: "sword",
      result: "defeat",
      wave: 3,
      score: 10,
      date: "2026-11-11",
      dna: {},
      actor: "human",
      verified: "receipts",
      seconds: 1,
      damage: 1,
      categories: [],
      composition: {},
      loadout: [],
      abilities: [],
      bosses: [],
      style: null,
      nearMiss: [],
      gameVersion: "0.1.0",
      unavailable: [],
      beatAttempt: false,
      assisted: false,
    };
    createScreenRenderers(context).profile({
      id: "profile",
      tab: "career",
      tabs: [],
      name: "Guest",
      signedIn: false,
      stats: [],
      career: {
        status: "ready",
        indexing: false,
        message: "",
        query: { view: "history", sort: "newest" },
        rows: [],
        confirming: false,
        selected: { entry, notes: { tags: [], retention: "normal" }, detail: "Recorded" },
        retained: 1,
        known: 1,
        total: 1,
        page: 0,
        pages: 1,
      },
    } as never);
    const row = controls.filter(
      (control) =>
        control.action.type === "career.control" &&
        ["watch", "challenge", "download", "chase", "race"].includes(control.action.command),
    );
    expect(row.map((control) => control.label)).toEqual(["THEATER", "CHALLENGE", "DOWNLOAD", "CHASE BEST"]);
    // The page pattern content column is 1120 wide.
    expect(row[3]).toMatchObject({ w: (1120 - 3 * 8) / 4 });
  });
});

describe("leaving the tutorial on purpose", () => {
  it("walks SKIP TUTORIAL from the course pause to the run setup through allowed screens only", () => {
    // The real screen rules: a screen change they do not allow throws, as it stops the live game.
    const app = new AppStateController(createSurfaceAvailability("engineering"));
    app.transition("playing");
    app.transition("paused");
    const kept = { skipped: false, mode: "" };
    const ports: Partial<ScreenActionBindingPorts> = {
      setScreen: (screen) => void app.transition(screen),
      // Ending a run returns to the main menu, as the live run adapter does.
      quitRun: () => void app.transition("menu"),
      skipTutorial: () => {
        kept.skipped = true;
      },
      setSetupSelection: (kind, id) => {
        if (kind === "mode") kept.mode = id;
      },
    };
    const dispatch = createLiveScreenActionBindings(ports as ScreenActionBindingPorts);
    const controller = new TutorialController(CONFIG);
    controller.start(1600);
    const drawn = (): ScreenControl[] => {
      const controls: ScreenControl[] = [],
        renderer = createScreenRenderers(createControlContext(controls));
      if (app.screen === "paused")
        renderer.paused({ id: "paused", abilities: [], progress: [], tutorial: controller.session() });
      else if (app.screen === "confirmquit") renderer.confirmquit({ id: "confirmquit", tutorial: "course" });
      return controls;
    };
    // The player presses SKIP TUTORIAL where it is drawn, reached through MAIN MENU if the pause lacks it.
    const pressed: string[] = [];
    for (let step = 0; step < 3 && !kept.skipped; step += 1) {
      const controls = drawn(),
        control =
          controls.find((entry) => entry.label === "SKIP TUTORIAL") ??
          controls.find((entry) => entry.label === "MAIN MENU");
      if (control === undefined) break;
      pressed.push(`${app.screen}: ${control.label}`);
      dispatch(control.action);
    }
    expect(app.screen).toBe("setup");
    expect(kept).toEqual({ skipped: true, mode: "campaign" });
    // Skipping ends the run as MAIN MENU > QUIT does: through the confirm, never from the pause.
    expect(pressed).toEqual(["paused: MAIN MENU", "confirmquit: SKIP TUTORIAL"]);
  });
});
