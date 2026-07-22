import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { createUi } from "../../src/presentation/ui";
import {
  createLegacyWorldRenderers,
  type EnemyStatusSnapshot,
  type HudSnapshot,
  type LegacyWorldRenderContext,
  type WorldRect,
  type WorldUiPort,
} from "../../src/presentation/world";
import {
  renderSceneEffects,
  type SceneEffectsSnapshot,
} from "../../src/presentation/world/scene-effects";
import {
  formatEnemyLabel,
  renderEntityLayer,
  renderFloaters,
  renderRearEntities,
  type EnemyVisualSnapshot,
} from "../../src/presentation/world/entity-layer";

interface CanvasCall { readonly name: string; readonly arguments: readonly unknown[] }

function canvasRecorder(calls: CanvasCall[]): CanvasRenderingContext2D {
  const values = new Map<PropertyKey, unknown>();
  const gradient: CanvasGradient = { addColorStop: (offset: number, color: string): void => { calls.push({ name: "addColorStop", arguments: [offset, color] }); } };
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_target, property): unknown {
      if (values.has(property)) return values.get(property);
      if (property === "measureText") return (text: string): TextMetrics => ({ width: text.length * 8 } as TextMetrics);
      if (property === "createRadialGradient" || property === "createLinearGradient") return (...args: unknown[]): CanvasGradient => {
        calls.push({ name: property, arguments: args });
        return gradient;
      };
      return (...args: unknown[]): void => { calls.push({ name: String(property), arguments: args }); };
    },
    set(_target, property, value): boolean { values.set(property, value); return true; },
  });
}

class TestUi implements WorldUiPort {
  readonly calls: CanvasCall[] = [];
  readonly t = {
    type: { display: 52, h2: 30, lead: 20, body: 16, label: 14, caption: 13, micro: 11 },
    alpha: { soft: 0.8, faint: 0.3 },
    color: { accent: "#13c4d6", muted: "#888", paper: "#f1eff9" },
    metric: { bossHudH: 16 },
  };
  font(size: number, bold?: boolean): string { return `${bold ? "bold " : ""}${String(size)}px monospace`; }
  text(_canvas: CanvasRenderingContext2D, text: string): void { this.record("text", text); }
  title(_canvas: CanvasRenderingContext2D, text: string): void { this.record("title", text); }
  tag(_canvas: CanvasRenderingContext2D, text: string): void { this.record("tag", text); }
  bossHud(_canvas: CanvasRenderingContext2D, options: Parameters<WorldUiPort["bossHud"]>[1]): void { this.record("bossHud", options); }
  bossIntro(_canvas: CanvasRenderingContext2D, options: Parameters<WorldUiPort["bossIntro"]>[1]): void { this.record("bossIntro", options); }
  private record(name: string, ...values: readonly unknown[]): void { this.calls.push({ name, arguments: values }); }
}

function renderContext(canvasCalls: CanvasCall[], ui = new TestUi()): LegacyWorldRenderContext {
  return {
    canvas: canvasRecorder(canvasCalls), ui, width: 1600, height: 900,
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    screen: { x: 0, y: 0, w: 1600, h: 900 }, ink: "#101218", darkTheme: false,
    timeSeconds: 1.25, lowGraphics: false, reducedMotion: false, highContrast: false,
  };
}

const enemyStatus: EnemyStatusSnapshot = Object.freeze({
  x: 300, y: 400, halfWidth: 24, halfHeight: 32,
  bleedStacks: 3, bleedMaximum: 5, burnTime: 1, markTime: 1,
  bleedColor: "#c33", burnColor: "#f73", markColor: "#3df",
});

function hudSnapshot(): HudSnapshot {
  return {
    player: {
      hp: 20, maxHp: 100, hpFraction: 0.2, lagHpFraction: 0.45, lowHpPulse: 0.75,
      oneHit: true, accent: "#d44", dashCharges: 1, maxDashCharges: 2,
      dashRechargeFraction: 0.5, dashColor: "#3df", shield: 1, maxShield: 2,
      shieldColor: "#fd3", abilities: ["★ LIFELINE", "LONG ARM ×2"],
    },
    run: {
      mode: "endless", bossWave: true, wave: 12, score: 12345, timeLabel: "02:34", remaining: 1,
      multiplier: 4, rank: "S", multiplierPop: 0.5, comboFraction: 0.6, trickColor: "#f4d",
    },
    boss: {
      name: "THE WARDEN", epithet: "KEEPER OF THE YARD", phaseTag: "LOCKDOWN", color: "#e44",
      hpFraction: 0.75, phaseMarks: [0.66, 0.33], phaseFlash: 0.2, guard: 0.5, introSweep: 0.8,
    },
  };
}

describe("legacy world presentation renderers", () => {
  it("exposes the complete integration façade and accepts the canonical UI", () => {
    const canonicalUi = null as unknown as ReturnType<typeof createUi>;
    const compatibleUi: WorldUiPort = canonicalUi;
    expectTypeOf(compatibleUi).toExtend<WorldUiPort>();
    const registry = createLegacyWorldRenderers(renderContext([]));
    expect(Object.keys(registry).sort()).toEqual([
      "achievementToast", "bossIntro", "enemyStatus", "finaleWorld", "hud", "pantheonDebug",
      "playgroundHelp", "reticle", "stageBanner", "touchControls", "tutorialCard", "waveBanner",
    ]);
  });

  it("characterizes bleed, burn and mark status geometry without mutating the snapshot", () => {
    const calls: CanvasCall[] = [];
    const before = JSON.stringify(enemyStatus);
    createLegacyWorldRenderers(renderContext(calls)).enemyStatus(enemyStatus);
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
    createLegacyWorldRenderers(renderContext(canvasCalls, ui)).hud(snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
    const labels = ui.calls.flatMap((call) => call.arguments.filter((value): value is string => typeof value === "string"));
    expect(labels).toEqual(expect.arrayContaining([
      "ONE-HIT", "DASH", "★ LIFELINE", "LONG ARM ×2", "BOSS", "12345", "02:34", "1",
      "×4  S", "THE WARDEN", "KEEPER OF THE YARD   ·   LOCKDOWN",
    ]));
    const boss = ui.calls.find((call) => call.name === "bossHud");
    expect((boss?.arguments[0] as { readonly frac?: number } | undefined)?.frac).toBeCloseTo(0.6);
    expect(boss?.arguments[0]).toMatchObject({ phaseMarks: [0.66, 0.33], guard: 0.5 });
    expect(canvasCalls.some((call) => call.name === "createRadialGradient")).toBe(true);
  });

  it("keeps tutorial, playground, touch and transient overlay copy intact", () => {
    const canvasCalls: CanvasCall[] = [];
    const ui = new TestUi();
    const renderers = createLegacyWorldRenderers(renderContext(canvasCalls, ui));
    renderers.tutorialCard({ lessonIndex: 1, lessonCount: 5, title: "DASH THROUGH", description: "Avoid damage.",
      keys: ["SHIFT", "SPACE"], final: false, completedBeat: 0.9, progress: { current: 2, goal: 3 } });
    renderers.playgroundHelp({ weaponId: "scythe", heldHits: 2, throws: 4, throwHits: 3, perfectParries: 1, breakTriggers: 2 });
    renderers.touchControls({ joystick: { active: true, anchorX: 200, anchorY: 700, dx: 30, dy: -10 },
      aim: { x: 0.5, y: -0.25 }, buttons: [{ x: 1400, y: 700, radius: 44, label: "JUMP", held: true, prominent: true }], onboardingAlpha: 1 });
    renderers.achievementToast({ name: "A SHARP BEGINNING", description: "Land the first perfect cut", rarityName: "RARE",
      rarityColor: "#b06cff", categoryIcon: "◆", shards: 5, coins: 20, reveal: 1 });
    const drawnText = canvasCalls.filter((call) => call.name === "fillText").map((call) => call.arguments[0]);
    expect(drawnText).toEqual(expect.arrayContaining([
      "DASH THROUGH", "N — skip lesson", "✓",
      "TAB / E — build menu   ·   1–8 quick-spawn   ·   T dummy   ·   B boss",
      "JUMP", "◉ MOVE", "DRAG TO AIM & SWING ↷", "UNLOCKED  ·  RARE", "◆ +5  +20c",
    ]));
  });

  it("renders Source/finale depth and every banner/reticle state through snapshots", () => {
    const canvasCalls: CanvasCall[] = [];
    const ui = new TestUi();
    const renderers = createLegacyWorldRenderers(renderContext(canvasCalls, ui));
    renderers.finaleWorld("rear", {
      phase: "cut", origin: { x: 800, y: 400 }, anchors: [{ x: 700, y: 300, radius: 40, depth: 0.5, cut: false }],
      severedIndex: 0, restoredColor: true, restoring: true, restoredGravity: true, tearClosed: false,
      restoreAmount: 0.4, cutFlash: 1, relicProgress: 0.5, fragmentCap: 12,
      stageAccents: ["#a11", "#1a1", "#11a"], groundY: 760, perfectColor: "#3df",
      relicColors: ["#f00", "#0f0", "#00f", "#f0f"], blade: { x: 820, y: 420 },
    });
    renderers.waveBanner({ remainingFraction: 0.5, bossWave: false, wave: 8, waveTag: "HORDE", horde: true, hordeColor: "#e44", normalColor: "#3df" });
    const screen: WorldRect = { x: 0, y: 0, w: 1600, h: 900 };
    renderers.bossIntro({ screen, bossName: "THE SOURCE", epithet: "BELOW ALL THINGS", color: "#93f", elapsed: 0.5, duration: 2 });
    renderers.stageBanner({ elapsed: 1, mode: "campaign", stageIndex: 2, stageName: "THE DEEP", blurb: "DESCEND.", accent: "#3df" });
    renderers.reticle({ x: 900, y: 300, power: "slam", slamColor: "#f73", updraftColor: "#3df" });
    const uiLabels = ui.calls.flatMap((call) => call.arguments.filter((value): value is string => typeof value === "string"));
    expect(uiLabels).toEqual(expect.arrayContaining(["WAVE 8", "HORDE", "STAGE 3", "THE DEEP", "DESCEND."]));
    expect(ui.calls.find((call) => call.name === "bossIntro")?.arguments[0]).toMatchObject({ bossName: "THE SOURCE", epithet: "BELOW ALL THINGS" });
    expect(canvasCalls.some((call) => call.name === "fillText" && call.arguments[0] === "⇊")).toBe(true);
  });

  it("contains no gameplay coordination, persistence, audio, input or platform access", () => {
    const files = ["status-debug.ts", "finale.ts", "hud.ts", "training-touch.ts", "overlays.ts"];
    const source = files.map((file) => readFileSync(fileURLToPath(new URL(`../../src/presentation/world/${file}`, import.meta.url)), "utf8")).join("\n");
    expect(source).not.toMatch(/localStorage|PROFILE\.|META\.|SFX\.|Input\.|CG\.|Cloud\.|startRun\(|setState\(|PROFILE\.save\(/);
  });

  it("renders boss dressing, cracks, ground hazards and every boss-zone visual from an immutable snapshot", () => {
    const canvasCalls: CanvasCall[] = [];
    const snapshot: SceneEffectsSnapshot = Object.freeze({
      width: 1600, height: 900, groundY: 760, timeMilliseconds: 1250,
      lowGraphics: false, highContrast: true, darkTheme: false, ink: "#101218",
      dressing: { bossId: "aldric", color: "#f73" },
      cracks: [{ x: 100, y: 740, w: 80, h: 20, time: 0.2, maximum: 0.8, color: "#e44" }],
      walls: [{ x: 240, y: 754, w: 100, life: 1, maximum: 2 }],
      slowZones: [{ x: 420, y: 760, radius: 70, life: 1 }],
      bossZones: ["searchlight", "cage", "panel", "fire", "seam", "trail", "danger"].map((kind, index) => ({
        x: 300 + index * 130, width: 100, kind, active: true, arming: true,
        warning: true, warningAmount: 0.9, life: 1, maximumLife: 2, direction: 1,
      })),
      zoneColor: "#d34", sludgeColor: "#594", slamColor: "#f73", bomberColor: "#e52",
      chargerColor: "#f4c", defaultZoneWidth: 100, seamLife: 2, trailLife: 2,
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
      x: 300, y: 400, halfWidth: 20, halfHeight: 30, radius: 24, color: "#e44",
      spawnTime: 0, flashTime: 0, dead: false, cinematicPose: false, buffs: [], label: "War Priest +2",
      draw: () => { callbackCalls.push("draw"); }, drawRear: () => { callbackCalls.push("rear"); },
      drawTransformation: () => { callbackCalls.push("transform"); }, drawStatus: () => { callbackCalls.push("status"); },
      ...overrides,
    });
    const enemies = [
      enemy({ spawnTime: 0.2, buffs: ["priest"] }),
      enemy({ x: 500, flashTime: 0.04, cinematicPose: true, buffs: ["herald", "mender", "anchor"] }),
    ];
    const canvas = canvasRecorder(canvasCalls);

    renderRearEntities(canvas, enemies);
    renderEntityLayer(canvas, enemies, { x: 800, y: 500, halfWidth: 18, halfHeight: 28 }, {
      darkTheme: true, sandbox: true,
      buffColors: { priest: "#3df", herald: "#fd3", mender: "#3f6", anchor: "#96f" },
      font: (size, bold) => `${bold ? "bold " : ""}${String(size)}px mono`,
    });
    renderFloaters(canvas, [{ x: 700, y: 300, text: "+100", color: "#fd3", life: 0.75, big: true }]);

    expect(callbackCalls).toEqual(["rear", "rear", "draw", "draw", "transform", "status"]);
    expect(formatEnemyLabel({ kind: "support", supportType: "priest", affixCount: 2 })).toBe("War Priest +2");
    expect(formatEnemyLabel({ kind: "armored", enraged: true })).toBe("Armored*");
    expect(canvasCalls.some((call) => call.name === "fillText" && call.arguments[0] === "War Priest +2")).toBe(true);
    expect(canvasCalls.some((call) => call.name === "fillText" && call.arguments[0] === "+100")).toBe(true);
    expect(canvasCalls.filter((call) => call.name === "strokeRect").length).toBeGreaterThanOrEqual(3);
  });
});
