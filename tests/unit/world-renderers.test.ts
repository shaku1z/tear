import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { createUi } from "../../src/presentation/ui";
import {
  createWorldRenderers,
  type EnemyStatusSnapshot,
  type HudSnapshot,
  type WorldRenderContext,
  type WorldRect,
  type WorldUiPort,
} from "../../src/presentation/world";
import { renderSceneEffects, type SceneEffectsSnapshot } from "../../src/presentation/world/scene-effects";
import {
  formatEnemyLabel,
  renderEntityLayer,
  renderFloaters,
  renderRearEntities,
  type EnemyVisualSnapshot,
} from "../../src/presentation/world/entity-layer";
import { tutorialCardLayout } from "../../src/presentation/world/training-touch";
import { bossHudTop } from "../../src/presentation/world/hud";

interface CanvasCall {
  readonly name: string;
  readonly arguments: readonly unknown[];
}

function canvasRecorder(calls: CanvasCall[]): CanvasRenderingContext2D {
  const values = new Map<PropertyKey, unknown>();
  const gradient: CanvasGradient = {
    addColorStop: (offset: number, color: string): void => {
      calls.push({ name: "addColorStop", arguments: [offset, color] });
    },
  };
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_target, property): unknown {
      if (values.has(property)) return values.get(property);
      if (property === "measureText") return (text: string): TextMetrics => ({ width: text.length * 8 }) as TextMetrics;
      if (property === "createRadialGradient" || property === "createLinearGradient")
        return (...args: unknown[]): CanvasGradient => {
          calls.push({ name: property, arguments: args });
          return gradient;
        };
      return (...args: unknown[]): void => {
        calls.push({ name: String(property), arguments: args });
      };
    },
    set(_target, property, value): boolean {
      values.set(property, value);
      return true;
    },
  });
}

class TestUi implements WorldUiPort {
  readonly calls: CanvasCall[] = [];
  readonly density = { touch: false, compact: false };
  readonly ink = "#101218";
  readonly t = {
    type: { display: 52, h2: 30, title: 24, lead: 20, body: 16, label: 15, caption: 14, micro: 13 },
    alpha: { full: 1, soft: 0.78, muted: 0.66, faint: 0.52 },
    color: {
      accent: "#13c4d6",
      muted: "#62646f",
      paper: "#fff",
      danger: "#e23b3b",
      scrim: "#06070c",
      scrimInk: "#f1eff9",
    },
    metric: {
      bossHudH: 16,
      bossNotchH: 6,
      bossGuardGap: 10,
      bossGuardH: 6,
      barH: 14,
      hudPad: 10,
      hudBarW: 320,
      hudAbilityRows: 4,
    },
    space: { xs: 6, sm: 10, md: 16, lg: 24, xl: 40 },
  };
  font(size: number, bold?: boolean): string {
    return `${bold ? "bold " : ""}${String(size)}px monospace`;
  }
  text(
    _canvas: CanvasRenderingContext2D,
    text: string,
    x?: number,
    y?: number,
    size?: number,
    align?: CanvasTextAlign,
    alpha?: number,
  ): void {
    this.record("text", text, { x, y, size, align, alpha });
  }
  displayText(_canvas: CanvasRenderingContext2D, text: string, x?: number, y?: number, size?: number): void {
    this.record("displayText", text, { x, y, size });
  }
  title(_canvas: CanvasRenderingContext2D, text: string, x?: number, y?: number, size?: number): void {
    this.record("title", text, { x, y, size });
  }
  tag(
    _canvas: CanvasRenderingContext2D,
    text: string,
    x?: number,
    y?: number,
    color?: string,
    align?: CanvasTextAlign,
    size?: number,
  ): void {
    this.record("tag", text, { x, y, color, align, size });
  }
  bossHud(_canvas: CanvasRenderingContext2D, options: Parameters<WorldUiPort["bossHud"]>[1]): void {
    this.record("bossHud", options);
  }
  bossIntro(_canvas: CanvasRenderingContext2D, options: Parameters<WorldUiPort["bossIntro"]>[1]): void {
    this.record("bossIntro", options);
  }
  readable(color: string): string {
    return color;
  }
  fitText(
    _canvas: CanvasRenderingContext2D,
    text: string,
    _maxWidth: number,
    options: Readonly<{ size: number }>,
  ): ReturnType<WorldUiPort["fitText"]> {
    return { size: options.size, lines: [text], truncated: false };
  }
  textBox(
    _canvas: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    _maxWidth: number,
    options?: Readonly<{ size?: number; measureOnly?: boolean; lineHeight?: number }>,
  ): ReturnType<WorldUiPort["textBox"]> {
    const size = options?.size ?? 16,
      lineHeight = options?.lineHeight ?? Math.round(size * 1.5);
    if (options?.measureOnly !== true) this.record("textBox", text, { x, y, size });
    return { size, lines: [text], height: lineHeight, lineHeight };
  }
  keycapSize(): Readonly<{ w: number; h: number }> {
    return { w: 40, h: 22 };
  }
  keycap(_canvas: CanvasRenderingContext2D, key: string, x: number, y: number): number {
    this.record("keycap", key, { x, y });
    return 40;
  }
  sheetRect(): Readonly<{ x: number; y: number; w: number; h: number }> {
    return { x: 180, y: 44, w: 1240, h: 820 };
  }
  sheetFooter(): Readonly<{ y: number; h: number; backX: number }> {
    return { y: 804, h: 48, backX: 690 };
  }
  private record(name: string, ...values: readonly unknown[]): void {
    this.calls.push({ name, arguments: values });
  }
}

function renderContext(canvasCalls: CanvasCall[], ui = new TestUi()): WorldRenderContext {
  return {
    canvas: canvasRecorder(canvasCalls),
    ui,
    width: 1600,
    height: 900,
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    screen: { x: 0, y: 0, w: 1600, h: 900 },
    ink: "#101218",
    darkTheme: false,
    timeSeconds: 1.25,
    lowGraphics: false,
    reducedMotion: false,
    highContrast: false,
  };
}

const enemyStatus: EnemyStatusSnapshot = Object.freeze({
  x: 300,
  y: 400,
  halfWidth: 24,
  halfHeight: 32,
  bleedStacks: 3,
  bleedMaximum: 5,
  burnTime: 1,
  markTime: 1,
  bleedColor: "#c33",
  burnColor: "#f73",
  markColor: "#3df",
});

function hudSnapshot(): HudSnapshot {
  return {
    player: {
      hp: 20,
      maxHp: 100,
      hpFraction: 0.2,
      lagHpFraction: 0.45,
      lowHpPulse: 0.75,
      oneHit: true,
      accent: "#d44",
      dashCharges: 1,
      maxDashCharges: 2,
      dashRechargeFraction: 0.5,
      dashColor: "#3df",
      shield: 1,
      maxShield: 2,
      shieldColor: "#fd3",
      abilities: ["★ LIFELINE", "LONG ARM ×2"],
    },
    run: {
      mode: "endless",
      bossWave: true,
      wave: 12,
      score: 12345,
      timeLabel: "02:34",
      remaining: 1,
      multiplier: 4,
      rank: "S",
      multiplierPop: 0.5,
      comboFraction: 0.6,
      trickColor: "#f4d",
    },
    boss: {
      name: "THE WARDEN",
      epithet: "KEEPER OF THE YARD",
      phaseTag: "LOCKDOWN",
      color: "#e44",
      hpFraction: 0.75,
      phaseMarks: [0.66, 0.33],
      phaseFlash: 0.2,
      guard: 0.5,
      introSweep: 0.8,
    },
  };
}

describe("legacy world presentation renderers", () => {
  it("exposes the complete integration façade and accepts the canonical UI", () => {
    const canonicalUi = null as unknown as ReturnType<typeof createUi>;
    const compatibleUi: WorldUiPort = canonicalUi;
    expectTypeOf(compatibleUi).toExtend<WorldUiPort>();
    const registry = createWorldRenderers(renderContext([]));
    expect(Object.keys(registry).sort()).toEqual([
      "achievementToast",
      "bossIntro",
      "coachMarks",
      "enemyStatus",
      "finaleWorld",
      "hud",
      "pantheonDebug",
      "reticle",
      "stageBanner",
      "touchControls",
      "tutorialCard",
      "waveBanner",
    ]);
  });

  it("characterizes bleed, burn and mark status geometry without mutating the snapshot", () => {
    const calls: CanvasCall[] = [];
    const before = JSON.stringify(enemyStatus);
    createWorldRenderers(renderContext(calls)).enemyStatus(enemyStatus);
    expect(JSON.stringify(enemyStatus)).toBe(before);
    expect(calls.filter((call) => call.name === "ellipse")).toHaveLength(2);
    expect(calls.filter((call) => call.name === "quadraticCurveTo")).toHaveLength(5);
    expect(calls.some((call) => call.name === "stroke")).toBe(true);
  });

  it("preserves vitals, run progress, trick rank and boss theater information", () => {
    const canvasCalls: CanvasCall[] = [];
    const ui = new TestUi();
    const snapshot = hudSnapshot();
    const before = JSON.stringify(snapshot);
    createWorldRenderers(renderContext(canvasCalls, ui)).hud(snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
    const labels = ui.calls.flatMap((call) =>
      call.arguments.filter((value): value is string => typeof value === "string"),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        "ONE-HIT",
        "DASH",
        "★ LIFELINE",
        "LONG ARM ×2",
        "BOSS",
        "12345",
        "02:34",
        "1",
        "×4  S",
        "THE WARDEN",
        "KEEPER OF THE YARD   ·   LOCKDOWN",
        "20 / 100",
      ]),
    );
    const boss = ui.calls.find((call) => call.name === "bossHud");
    expect((boss?.arguments[0] as { readonly frac?: number } | undefined)?.frac).toBeCloseTo(0.6);
    expect(boss?.arguments[0]).toMatchObject({ phaseMarks: [0.66, 0.33], guard: 0.5 });
    expect(canvasCalls.some((call) => call.name === "createRadialGradient")).toBe(true);
  });

  it("draws the HUD as plain text on the scene (no plate, outline or box) and keeps the boss header below the multiplier", () => {
    const ui = new TestUi(),
      canvasCalls: CanvasCall[] = [];
    createWorldRenderers(renderContext(canvasCalls, ui)).hud(hudSnapshot());
    expect(ui.calls.filter((call) => call.name === "hudPlate")).toHaveLength(0);
    expect(canvasCalls.filter((call) => call.name === "strokeText")).toHaveLength(0);
    const words = ui.calls.filter((call) => call.name === "text" || call.name === "tag");
    expect(words.length).toBeGreaterThan(0);
    // Values read at full opacity; only secondary labels step down, and never below the soft role.
    for (const call of words.filter((word) => word.name === "text")) {
      expect((call.arguments[1] as { alpha: number }).alpha).toBeGreaterThanOrEqual(ui.t.alpha.soft);
    }
    const at = (label: string) =>
      ui.calls.find((call) => call.arguments[0] === label)?.arguments[1] as { x: number; y: number };
    expect(at("BOSS")).toMatchObject({ x: 800 });
    const bar = ui.calls.find((call) => call.name === "bossHud")?.arguments[0] as { y: number };
    expect(bar.y).toBe(bossHudTop(renderContext([], ui)) + 10 + 12 + 6 + 13 + 10);
    const bossName = ui.calls.find(
      (call) => call.name === "tag" && (call.arguments[1] as { size: number }).size === ui.t.type.label,
    );
    expect((bossName?.arguments[1] as { y: number }).y).toBeGreaterThan(at("SCORE").y);
  });

  it("anchors the HUD to the visible screen corner and the safe area, not the 16:9 frame", () => {
    const ui = new TestUi(),
      canvasCalls: CanvasCall[] = [];
    const base = renderContext(canvasCalls, ui);
    createWorldRenderers({
      ...base,
      screen: { x: -267, y: -150, w: 2134, h: 1200 },
      safe: { top: 12, right: 0, bottom: 0, left: 30 },
    }).hud(hudSnapshot());
    // The HP bar frame (and so the vitals group) starts at the safe corner plus the HUD inset and padding.
    const frame = canvasCalls.find((call) => call.name === "strokeRect" && call.arguments[2] === ui.t.metric.hudBarW);
    expect(frame?.arguments.slice(0, 2)).toEqual([-267 + 30 + 24 + 10, -150 + 12 + 24 + 10]);
  });

  it("collapses a long ability list into one summary line (the full list lives on the pause screen)", () => {
    const ui = new TestUi(),
      snapshot = hudSnapshot();
    const abilities = Array.from({ length: 32 }, (_, index) => `ABILITY ${String(index)}`);
    createWorldRenderers(renderContext([], ui)).hud({ ...snapshot, player: { ...snapshot.player, abilities } });
    const text = ui.calls.filter((call) => call.name === "text").map((call) => call.arguments[0]);
    expect(text).toContain("32 ABILITIES · PAUSE: ARSENAL");
    expect(text.some((value) => String(value).startsWith("ABILITY "))).toBe(false);
    const short = new TestUi();
    createWorldRenderers(renderContext([], short)).hud({
      ...snapshot,
      player: { ...snapshot.player, abilities: abilities.slice(0, 4) },
    });
    expect(
      short.calls.filter((call) => call.name === "text" && String(call.arguments[0]).startsWith("ABILITY ")),
    ).toHaveLength(4);
  });

  it("draws HUD text only at type tokens", () => {
    const ui = new TestUi();
    createWorldRenderers(renderContext([], ui)).hud(hudSnapshot());
    const tokens = new Set(Object.values(ui.t.type));
    for (const call of ui.calls.filter(
      (entry) => entry.name === "text" || entry.name === "tag" || entry.name === "title",
    )) {
      expect(tokens.has((call.arguments[1] as { size: number }).size)).toBe(true);
    }
  });

  it("keeps tutorial, playground, touch and transient overlay copy intact", () => {
    const canvasCalls: CanvasCall[] = [];
    const ui = new TestUi();
    const renderers = createWorldRenderers(renderContext(canvasCalls, ui));
    renderers.tutorialCard({
      context: "LESSON 2 OF 5",
      title: "DASH THROUGH",
      description: "Avoid damage.",
      keys: ["SHIFT", "SPACE"],
      final: false,
      completedBeat: 0.9,
      progress: { current: 2, goal: 3 },
    });
    renderers.coachMarks({
      marks: [
        {
          mark: {
            id: "playground:help",
            channel: "help",
            tone: "info",
            title: "PLAYGROUND",
            text: "E menu  ·  U abilities",
            keys: [],
            priority: 0,
            seconds: 8,
          },
          alpha: 1,
        },
      ],
      avoid: [],
    });
    renderers.touchControls({
      joystick: { active: true, anchorX: 200, anchorY: 700, dx: 30, dy: -10, radius: 92, homeX: 160, homeY: 760 },
      aim: { x: 0.5, y: -0.25 },
      aimPad: { x: 1300, y: 600, r: 60 },
      buttons: [{ x: 1400, y: 700, radius: 44, label: "JUMP", held: true, prominent: true }],
      onboardingAlpha: 1,
    });
    renderers.achievementToast({
      name: "A SHARP BEGINNING",
      description: "Land the first perfect cut",
      rarityName: "RARE",
      rarityColor: "#b06cff",
      categoryIcon: "◆",
      shards: 5,
      coins: 20,
      reveal: 1,
      placement: "hud",
    });
    const drawn = ui.calls.flatMap((call) =>
      call.arguments.filter((value): value is string => typeof value === "string"),
    );
    expect(drawn).toEqual(
      expect.arrayContaining([
        "DASH THROUGH",
        "Avoid damage.",
        "2 / 3",
        "SHIFT",
        "SPACE",
        "LESSON 2 OF 5",
        "✓",
        "PLAYGROUND",
        "E menu  ·  U abilities",
        "JUMP",
        "◉ MOVE",
        "DRAG TO AIM & SWING ↷",
        "UNLOCKED · RARE",
        "◆ +5  +20c",
        "A SHARP BEGINNING",
      ]),
    );
  });

  it("stacks the tutorial card so the goal, the progress bar and the keys never share a row", () => {
    const ui = new TestUi(),
      calls: CanvasCall[] = [];
    createWorldRenderers(renderContext(calls, ui)).tutorialCard({
      context: "LESSON 2 OF 13",
      title: "JUMP",
      description: "Jump three times. Use the ledges to climb.",
      keys: ["W", "SPACE"],
      final: false,
      completedBeat: 0,
      progress: { current: 1, goal: 3 },
    });
    const keyY = Math.min(
      ...ui.calls.filter((call) => call.name === "keycap").map((call) => (call.arguments[1] as { y: number }).y),
    );
    const description = ui.calls.find((call) => call.name === "textBox")?.arguments[1] as { y: number };
    const bar = calls.find((call) => call.name === "fillRect" && call.arguments[3] === 5);
    expect(Number(bar?.arguments[1])).toBeGreaterThan(description.y);
    expect(keyY).toBeGreaterThan(Number(bar?.arguments[1]) + 5 + 13);
  });

  it("keeps the tutorial card clear of the centered style meter", () => {
    const standard = tutorialCardLayout({ left: 24, right: 1576, top: 24, centerX: 800 }, 200);
    expect(standard.x).toBeGreaterThanOrEqual(800 + 150 + 24);
    expect(standard.x + standard.width).toBeLessThanOrEqual(1576);
    expect(standard.y).toBe(24);

    const narrow = tutorialCardLayout({ left: 24, right: 1000, top: 24, centerX: 512 }, 200);
    expect(narrow.y).toBe(200);
    expect(narrow.x).toBeGreaterThanOrEqual(24);
    expect(narrow.x + narrow.width).toBeLessThanOrEqual(1000);
  });

  it("keeps the rendered boss-practice card below the boss HUD", () => {
    for (const top of [0, 20, 44]) {
      const calls: CanvasCall[] = [],
        ui = new TestUi(),
        base = renderContext(calls, ui);
      const context = { ...base, safe: { ...base.safe, top } };
      const card = createWorldRenderers(context).tutorialCard({
        bossPractice: true,
        context: "BOSS PRACTICE · NO REWARDS",
        title: "ROOTBOUND · PHASE 2",
        description: "Read the boss recovery.",
        keys: [],
        final: false,
        completedBeat: 0,
      });
      expect(card.y).toBeGreaterThanOrEqual(bossHudTop(context) + 3 * ui.t.metric.bossHudH);
      expect(card.x + card.w).toBeLessThanOrEqual(1600);
    }
  });

  it("places achievement toasts by context and never wider than the cap", () => {
    for (const placement of ["hud", "corner", "sheet-footer"] as const) {
      const calls: CanvasCall[] = [],
        ui = new TestUi();
      createWorldRenderers(renderContext(calls, ui)).achievementToast({
        name: "A SHARP BEGINNING",
        description: "Land the first perfect cut",
        rarityName: "RARE",
        rarityColor: "#b06cff",
        categoryIcon: "◆",
        shards: 5,
        coins: 20,
        reveal: 1,
        placement,
        clearTop: 120,
      });
      const surface = calls.find((call) => call.name === "fillRect");
      const [x, y, w, h] = (surface?.arguments ?? []).map(Number);
      expect(w).toBeLessThanOrEqual(360);
      if (placement === "hud") expect(y).toBeGreaterThanOrEqual(120);
      if (placement === "corner") expect((y ?? 0) + (h ?? 0)).toBeLessThanOrEqual(900 - 24);
      if (placement === "sheet-footer") {
        expect(y).toBe(804);
        expect((x ?? 0) + (w ?? 0)).toBeLessThan(690);
      }
    }
  });

  it("renders Source/finale depth and every banner/reticle state through snapshots", () => {
    const canvasCalls: CanvasCall[] = [];
    const ui = new TestUi();
    const renderers = createWorldRenderers(renderContext(canvasCalls, ui));
    renderers.finaleWorld("rear", {
      phase: "cut",
      origin: { x: 800, y: 400 },
      anchors: [{ x: 700, y: 300, radius: 40, depth: 0.5, cut: false }],
      severedIndex: 0,
      restoredColor: true,
      restoring: true,
      restoredGravity: true,
      tearClosed: false,
      restoreAmount: 0.4,
      cutFlash: 1,
      relicProgress: 0.5,
      fragmentCap: 12,
      stageAccents: ["#a11", "#1a1", "#11a"],
      groundY: 760,
      perfectColor: "#3df",
      relicColors: ["#f00", "#0f0", "#00f", "#f0f"],
      blade: { x: 820, y: 420 },
    });
    renderers.waveBanner({
      remainingFraction: 0.5,
      bossWave: false,
      wave: 8,
      waveTag: "HORDE",
      horde: true,
      hordeColor: "#e44",
      normalColor: "#3df",
    });
    const screen: WorldRect = { x: 0, y: 0, w: 1600, h: 900 };
    renderers.bossIntro({
      screen,
      bossName: "THE SOURCE",
      epithet: "BELOW ALL THINGS",
      openingLine: "LOOK BENEATH.",
      color: "#93f",
      elapsed: 0.5,
      duration: 2,
    });
    renderers.stageBanner({
      elapsed: 1,
      mode: "campaign",
      stageIndex: 2,
      stageName: "THE DEEP",
      blurb: "DESCEND.",
      accent: "#3df",
    });
    renderers.reticle({ x: 900, y: 300, power: "slam", slamColor: "#f73", updraftColor: "#3df" });
    const uiLabels = ui.calls.flatMap((call) =>
      call.arguments.filter((value): value is string => typeof value === "string"),
    );
    expect(uiLabels).toEqual(expect.arrayContaining(["WAVE 8", "HORDE", "STAGE 3", "THE DEEP", "DESCEND."]));
    expect(ui.calls.find((call) => call.name === "bossIntro")?.arguments[0]).toMatchObject({
      bossName: "THE SOURCE",
      epithet: "BELOW ALL THINGS",
      openingLine: "LOOK BENEATH.",
    });
    expect(canvasCalls.some((call) => call.name === "fillText" && call.arguments[0] === "⇊")).toBe(true);
  });

  it("contains no gameplay coordination, persistence, audio, input or platform access", () => {
    const files = ["status-debug.ts", "finale.ts", "hud.ts", "training-touch.ts", "overlays.ts"];
    const source = files
      .map((file) =>
        readFileSync(fileURLToPath(new URL(`../../src/presentation/world/${file}`, import.meta.url)), "utf8"),
      )
      .join("\n");
    expect(source).not.toMatch(
      /localStorage|PROFILE\.|META\.|SFX\.|Input\.|CG\.|Cloud\.|startRun\(|setState\(|PROFILE\.save\(/,
    );
  });

  it("renders boss dressing, cracks, ground hazards and every boss-zone visual from an immutable snapshot", () => {
    const canvasCalls: CanvasCall[] = [];
    const snapshot: SceneEffectsSnapshot = Object.freeze({
      width: 1600,
      height: 900,
      groundY: 760,
      timeMilliseconds: 1250,
      lowGraphics: false,
      highContrast: true,
      darkTheme: false,
      ink: "#101218",
      dressing: { bossId: "aldric", color: "#f73" },
      cracks: [{ x: 100, y: 740, w: 80, h: 20, time: 0.2, maximum: 0.8, color: "#e44" }],
      walls: [{ x: 240, y: 754, w: 100, life: 1, maximum: 2 }],
      slowZones: [{ x: 420, y: 760, radius: 70, life: 1 }],
      bossZones: ["searchlight", "cage", "panel", "fire", "seam", "trail", "danger"].map((kind, index) => ({
        x: 300 + index * 130,
        width: 100,
        kind,
        active: true,
        arming: true,
        warning: true,
        warningAmount: 0.9,
        life: 1,
        maximumLife: 2,
        direction: 1,
      })),
      zoneColor: "#d34",
      sludgeColor: "#594",
      slamColor: "#f73",
      bomberColor: "#e52",
      chargerColor: "#f4c",
      defaultZoneWidth: 100,
      seamLife: 2,
      trailLife: 2,
    });
    const before = JSON.stringify(snapshot);

    renderSceneEffects(canvasRecorder(canvasCalls), snapshot);

    expect(JSON.stringify(snapshot)).toBe(before);
    expect(canvasCalls.some((call) => call.name === "createLinearGradient")).toBe(false);
    expect(canvasCalls.some((call) => call.name === "ellipse")).toBe(true);
    expect(canvasCalls.some((call) => call.name === "clip")).toBe(true);
    expect(canvasCalls.some((call) => call.name === "strokeRect")).toBe(true);
    expect(canvasCalls.filter((call) => call.name === "fillRect").length).toBeGreaterThan(20);
  });

  it("renders entity states, support badges, sandbox labels and floaters through presentation callbacks", () => {
    const canvasCalls: CanvasCall[] = [];
    const callbackCalls: string[] = [];
    const enemy = (overrides: Partial<EnemyVisualSnapshot> = {}): EnemyVisualSnapshot => ({
      x: 300,
      y: 400,
      halfWidth: 20,
      halfHeight: 30,
      radius: 24,
      color: "#e44",
      spawnTime: 0,
      flashTime: 0,
      dead: false,
      cinematicPose: false,
      buffs: [],
      label: "War Priest +2",
      draw: () => {
        callbackCalls.push("draw");
      },
      drawRear: () => {
        callbackCalls.push("rear");
      },
      drawTransformation: () => {
        callbackCalls.push("transform");
      },
      drawStatus: () => {
        callbackCalls.push("status");
      },
      ...overrides,
    });
    const enemies = [
      enemy({ spawnTime: 0.2, buffs: ["priest"] }),
      enemy({ x: 500, flashTime: 0.04, cinematicPose: true, buffs: ["herald", "mender", "anchor"] }),
    ];
    const canvas = canvasRecorder(canvasCalls);

    renderRearEntities(canvas, enemies);
    renderEntityLayer(
      canvas,
      enemies,
      { x: 800, y: 500, halfWidth: 18, halfHeight: 28 },
      {
        darkTheme: true,
        sandbox: true,
        buffColors: { priest: "#3df", herald: "#fd3", mender: "#3f6", anchor: "#96f" },
        font: (size, bold) => `${bold ? "bold " : ""}${String(size)}px mono`,
      },
    );
    renderFloaters(canvas, [{ x: 700, y: 300, text: "+100", color: "#fd3", life: 0.75, big: true }]);

    expect(callbackCalls).toEqual(["rear", "rear", "draw", "draw", "transform", "status"]);
    expect(formatEnemyLabel({ kind: "support", supportType: "priest", affixCount: 2 })).toBe("War Priest +2");
    expect(formatEnemyLabel({ kind: "armored", enraged: true })).toBe("Armored*");
    expect(formatEnemyLabel({ kind: "armored", enraged: true, variantName: "Bark Sentinel" })).toBe("Bark Sentinel");
    expect(canvasCalls.some((call) => call.name === "fillText" && call.arguments[0] === "War Priest +2")).toBe(true);
    expect(canvasCalls.some((call) => call.name === "fillText" && call.arguments[0] === "+100")).toBe(true);
    expect(canvasCalls.filter((call) => call.name === "strokeRect").length).toBeGreaterThanOrEqual(3);
  });
});
