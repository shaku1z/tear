import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import type { Loadout } from "../../src/domain/cosmetic-types";
import type { BladeRenderSnapshot } from "../../src/gameplay/entities/blade-contracts";
import { COSMETIC_CATALOG } from "../../src/gameplay/progression/cosmetic-catalog";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import { createCosmeticWardrobe, type CosmeticWardrobe } from "../../src/presentation/cosmetic-styles";
import { createBladeRenderer } from "../../src/presentation/entities/blade-renderer";

/**
 * The blade draw path with the default style must draw exactly what the renderer drew before cosmetics: the
 * committed list of canvas calls was recorded from that renderer. Regenerate it only for a deliberate change to
 * the game's own blade look: TEAR_BLADE_DRAW_WRITE=1 pnpm exec vitest run tests/unit/cosmetic-blade-draw.test.ts
 */
const FIXTURE = new URL("../fixtures/blade-default-draw-calls.json", import.meta.url);
const INK = { light: "#0a0a0a", dark: "#ecebf6" } as const;
const STATE_KEYS = [
  "fillStyle",
  "strokeStyle",
  "globalAlpha",
  "lineWidth",
  "shadowBlur",
  "shadowColor",
  "globalCompositeOperation",
] as const;
type CanvasState = Record<(typeof STATE_KEYS)[number], string | number>;

const round = (value: unknown): unknown => (typeof value === "number" ? Math.round(value * 1e4) / 1e4 : value);

/** A canvas that writes one line per call: path calls with their arguments, paints with the state they drew in. */
function recordingCanvas() {
  const calls: string[] = [];
  let state: CanvasState = {
    fillStyle: "#000000",
    strokeStyle: "#000000",
    globalAlpha: 1,
    lineWidth: 1,
    shadowBlur: 0,
    shadowColor: "",
    globalCompositeOperation: "source-over",
  };
  const stack: CanvasState[] = [];
  const record =
    (name: string, paints: boolean) =>
    (...args: unknown[]): void => {
      const painted = paints ? ` | ${STATE_KEYS.map((key) => String(round(state[key]))).join(" ")}` : "";
      calls.push(`${name}(${args.map((arg) => String(round(arg))).join(",")})${painted}`);
    };
  const surface: Record<string, unknown> = {
    save: () => {
      stack.push({ ...state });
    },
    restore: () => {
      state = stack.pop() ?? state;
    },
    lineCap: "butt",
    lineJoin: "miter",
  };
  for (const name of ["beginPath", "closePath", "moveTo", "lineTo", "arc", "ellipse", "rect", "translate", "rotate"])
    surface[name] = record(name, false);
  for (const name of ["setLineDash"]) surface[name] = record(name, false);
  for (const name of ["fill", "stroke", "fillRect", "strokeRect"]) surface[name] = record(name, true);
  for (const key of STATE_KEYS)
    Object.defineProperty(surface, key, {
      get: () => state[key],
      set: (value: string | number) => {
        state[key] = value;
      },
    });
  return { surface, calls };
}

const TRAIL = Array.from({ length: 9 }, (_, index) => ({
  hx: 100 + index * 6,
  hy: 120 - index * 3,
  tx: 150 + index * 9 + index * index,
  ty: 70 - index * 7,
}));

function blade(model: string, extra: Partial<BladeRenderSnapshot> = {}): BladeRenderSnapshot {
  const hand = { x: 100, y: 100 };
  return {
    x: 104,
    y: 108,
    angle: -0.6,
    tipX: 160,
    tipY: 70,
    glowV: 0.6,
    state: "held",
    throwSizeMult: 1,
    model,
    trail: TRAIL,
    tension: 0.4,
    riftChambers: 2,
    riftChamberCooldown: 0,
    chainPoints: [],
    reversals: [],
    finalFree: false,
    hostile: false,
    stolenBy: null,
    handPos: () => hand,
    lastHand: () => hand,
    actionPoint: () => ({ x: 160, y: 70 }),
    actionRange: () => 300,
    ...extra,
  };
}

type Scene = Readonly<{ name: string; blade: BladeRenderSnapshot; dark: boolean; low: boolean }>;

function scenes(): Scene[] {
  const output: Scene[] = [];
  for (const model of WEAPON_IDS)
    for (const dark of [false, true])
      for (const low of [false, true])
        output.push({
          name: `${model} ${dark ? "dark" : "light"} ${low ? "low" : "full"}`,
          blade: blade(model),
          dark,
          low,
        });
  output.push(
    { name: "restored trail dark", blade: blade("sword", { restoredTrail: true }), dark: true, low: false },
    {
      name: "own colours light",
      blade: blade("sword", { trailColor: "#b06cff", glowColor: "#c98cff" }),
      dark: false,
      low: false,
    },
    { name: "thrown riftlock dark", blade: blade("riftlock", { state: "flying" }), dark: true, low: false },
  );
  return output;
}

function draw(scene: Scene, wardrobe: CosmeticWardrobe): string[] {
  const canvas = recordingCanvas();
  createBladeRenderer({
    clock: { sim: 0 },
    policy: { colors: CONFIG.colors, juice: CONFIG.juice },
    graphics: { low: scene.low },
    theme: { dark: scene.dark, ink: scene.dark ? INK.dark : INK.light, rim: "rim" },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    len: Math.hypot,
    lerp: (from, to, amount) => from + (to - from) * amount,
    looks: wardrobe,
  }).draw(canvas.surface, scene.blade, { x: 100, y: 100, vx: 0, vy: 0, facing: 1 });
  return canvas.calls;
}

const fresh = (): CosmeticWardrobe => createCosmeticWardrobe(COSMETIC_CATALOG, () => false);
const wearing = (scene: Scene, loadout: Loadout, calm = false): string[] => {
  const wardrobe = createCosmeticWardrobe(COSMETIC_CATALOG, () => calm);
  wardrobe.wear(scene.blade, loadout);
  return draw(scene, wardrobe);
};
const paints = (calls: readonly string[]): string[] => calls.filter((call) => call.includes(" | "));

describe("blade draw path with cosmetics", () => {
  it("draws the default style exactly as the committed calls", () => {
    const drawn = Object.fromEntries(scenes().map((scene) => [scene.name, draw(scene, fresh())]));
    if (process.env.TEAR_BLADE_DRAW_WRITE === "1") writeFileSync(FIXTURE, `${JSON.stringify(drawn, null, 1)}\n`);
    expect(drawn).toEqual(JSON.parse(readFileSync(FIXTURE, "utf8")));
  });

  it("draws a blade nobody wears with the default look, whatever the wearer has on", () => {
    const scene = scenes()[1];
    if (!scene) throw new Error("no scene");
    const wardrobe = fresh();
    wardrobe.wear({}, { trail: "trail_heartwood", blade: "blade_moonsteel" });
    expect(draw(scene, wardrobe)).toEqual(draw(scene, fresh()));
  });

  it("colours the wearer's trail and tip glow from the worn items", () => {
    const scene: Scene = { name: "worn", blade: blade("sword"), dark: false, low: false };
    const fills = paints(wearing(scene, { trail: "trail_tidewater", blade: "blade_moonsteel" })).join("\n");
    expect(fills).toContain("fill() | #2f7bd6");
    expect(fills).toContain("fill() | #0f9fb0");
    expect(fills).toContain("fill() | #7a4ff0");
    expect(fills).not.toContain(`fill() | ${CONFIG.colors.bladeTrail} `);
  });

  it("keeps the tip edge of a wider trail where it was, so reach never looks longer", () => {
    const scene: Scene = { name: "wide", blade: blade("sword"), dark: false, low: false };
    const tips = (calls: readonly string[]): string[] =>
      calls.filter((call, index) => call.startsWith("lineTo") && calls[index - 1]?.startsWith("moveTo"));
    const plain = wearing(scene, { trail: "trail_dusk" });
    const wide = wearing(scene, { trail: "trail_heartwood" });
    expect(tips(wide)).toEqual(tips(plain));
    expect(wide.filter((call) => call.startsWith("moveTo"))).not.toEqual(
      plain.filter((call) => call.startsWith("moveTo")),
    );
  });

  it("never blurs a worn trail, so a cosmetic costs no more to draw than the default", () => {
    const dark: Scene = { name: "dark", blade: blade("sword"), dark: true, low: false };
    const blurs = (calls: readonly string[]): string[] => [
      ...new Set(paints(calls).map((call) => call.split(" | ")[1]?.split(" ")[STATE_KEYS.indexOf("shadowBlur")] ?? "")),
    ];
    expect(blurs(wearing(dark, { trail: "trail_heartwood", blade: "blade_moonsteel" }))).toEqual(
      blurs(draw(dark, fresh())),
    );
  });

  it("shows the authored look while an authored beat plays, and the cosmetic again after it", () => {
    const scene: Scene = { name: "finale", blade: blade("sword", { restoredTrail: true }), dark: true, low: false };
    const wardrobe = fresh();
    wardrobe.wear(scene.blade, { trail: "trail_dusk" });
    expect(paints(draw(scene, wardrobe)).join("\n")).toContain("#7a4ff0");
    wardrobe.authored(true);
    expect(draw(scene, wardrobe)).toEqual(draw(scene, fresh()));
    wardrobe.authored(false);
    expect(paints(draw(scene, wardrobe)).join("\n")).toContain("#7a4ff0");
  });
});
