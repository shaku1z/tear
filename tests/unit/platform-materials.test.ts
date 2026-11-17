import { describe, expect, it, vi } from "vitest";

import {
  VERDANT_ROOTSTONE_COLORS,
  drawVerdantRootstone,
  verdantRootstoneState,
  type VerdantRootstoneRenderPolicy,
} from "../../src/presentation/platform-materials/verdant-rootstone";
import {
  PALE_ICE_COLORS,
  PALE_ICE_DETAIL_LIMITS,
  drawPaleIce,
  paleIceState,
  type PaleIceRenderPolicy,
} from "../../src/presentation/platform-materials/pale-ice";

function render(
  state: string,
  policy: Partial<VerdantRootstoneRenderPolicy> = {},
  material?: Parameters<typeof drawVerdantRootstone>[3],
) {
  const calls: string[] = [];
  const gradient = {
    addColorStop: (_offset: number, color: string) => {
      calls.push(`stop:${color}`);
    },
  };
  const context = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === "createLinearGradient") return () => gradient;
        return () => {
          calls.push(String(key));
        };
      },
      set: (_target, key, value) => {
        calls.push(`${String(key)}:${String(value)}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  drawVerdantRootstone(
    context,
    { x: 20, y: 30, w: 240, h: 24, arenaState: state, stress: 0.8 },
    {
      timeSeconds: 1,
      lowGraphics: false,
      highContrast: false,
      reducedMotion: false,
      flashScale: 1,
      stressRatio: 0.8,
      warningRatio: 0.7,
      reformRatio: 0.6,
      ...policy,
    },
    material,
  );
  return calls;
}

describe("verdant-rootstone platform material", () => {
  it("uses prepared stone for surfaces and fragments while retaining warning and hollow reform cues", () => {
    const draw = vi.fn(() => true);
    const stable = render("stable", { floor: true }, { draw });
    expect(draw).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ x: 20, y: 30, w: 240, h: 24 }),
      true,
    );
    expect(stable).not.toContain(`fillStyle:${VERDANT_ROOTSTONE_COLORS.wetEdge}`);
    const warning = render("warning", { highContrast: true, flashScale: 0 }, { draw });
    expect(warning).toContain(`strokeStyle:${VERDANT_ROOTSTONE_COLORS.highContrastWarning}`);
    draw.mockClear();
    render("broken", {}, { draw });
    expect(draw).toHaveBeenCalledTimes(5);
    draw.mockClear();
    render("reforming", {}, { draw });
    expect(draw).not.toHaveBeenCalled();
    expect(render("stable", {}, { draw: () => false })).toEqual(render("stable"));
  });

  it("derives presentation state from the existing arena lifecycle", () => {
    expect(verdantRootstoneState({ x: 0, y: 0, w: 1, h: 1 })).toBe("stable");
    expect(verdantRootstoneState({ x: 0, y: 0, w: 1, h: 1, stress: 0.2 })).toBe("stressed");
    for (const state of ["warning", "broken", "reforming"] as const) {
      expect(verdantRootstoneState({ x: 0, y: 0, w: 1, h: 1, arenaState: state })).toBe(state);
    }
  });

  it("renders dark-teal strata, pale warmth, wet edges, and sparse gold seams only inside the source rectangle", () => {
    const calls = render("stable");
    expect(calls).toContain(`stop:${VERDANT_ROOTSTONE_COLORS.bodyDeep}`);
    expect(calls).toContain(`fillStyle:${VERDANT_ROOTSTONE_COLORS.moss}`);
    expect(calls).toContain(`fillStyle:${VERDANT_ROOTSTONE_COLORS.paleWarm}`);
    expect(calls).toContain(`fillStyle:${VERDANT_ROOTSTONE_COLORS.wetEdge}`);
    expect(calls).toContain(`strokeStyle:${VERDANT_ROOTSTONE_COLORS.ink}`);
    expect(calls).toContain(`strokeStyle:${VERDANT_ROOTSTONE_COLORS.preservationGold}`);
    expect(calls.filter((entry) => entry === "fill")).toHaveLength(4);
    expect(calls).toContain("clip");
  });

  it("keeps warning geometry in low graphics and strengthens high contrast", () => {
    const calls = render("warning", { lowGraphics: true, highContrast: true, reducedMotion: true, flashScale: 0 });
    expect(calls).toContain(`strokeStyle:${VERDANT_ROOTSTONE_COLORS.highContrastWarning}`);
    expect(calls).toContain("stroke");
    expect(calls.filter((entry) => entry === "setLineDash")).toHaveLength(2);
    expect(calls).not.toContain("quadraticCurveTo");
  });

  it("draws bounded broken fragments and reforming outlines", () => {
    expect(render("broken").filter((entry) => entry === "fillRect")).toHaveLength(5);
    const reforming = render("reforming");
    expect(reforming).toContain("strokeRect");
    expect(reforming.filter((entry) => entry === "quadraticCurveTo")).toHaveLength(4);
  });

  it("keeps reforming outlines readable without making the unavailable surface solid", () => {
    const normal = render("reforming", { reformRatio: 0 });
    expect(normal.filter((entry) => entry === "strokeRect")).toHaveLength(2);
    expect(normal).toContain(`strokeStyle:${VERDANT_ROOTSTONE_COLORS.bodyDeep}`);
    expect(normal).toContain("globalAlpha:0.65");
    expect(normal).not.toContain("fillRect");
    const accessible = render("reforming", {
      highContrast: true,
      lowGraphics: true,
      reducedMotion: true,
      flashScale: 0,
      reformRatio: 0,
    });
    expect(accessible).toContain(`strokeStyle:${VERDANT_ROOTSTONE_COLORS.paleWarm}`);
    expect(accessible).toContain(`strokeStyle:${VERDANT_ROOTSTONE_COLORS.highContrastWarning}`);
    expect(accessible).toContain("globalAlpha:1");
    expect(accessible).not.toContain("fillRect");
    expect(accessible).toEqual(
      render("reforming", {
        highContrast: true,
        lowGraphics: true,
        reducedMotion: true,
        flashScale: 0,
        reformRatio: 0,
        timeSeconds: 100,
      }),
    );
  });
});

function renderPale(
  state: string,
  policy: Partial<PaleIceRenderPolicy> = {},
  texture?: Parameters<typeof drawPaleIce>[3],
) {
  const calls: string[] = [];
  const gradient = {
    addColorStop: (_offset: number, color: string) => {
      calls.push(`stop:${color}`);
    },
  };
  const context = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === "createLinearGradient") return () => gradient;
        return () => {
          calls.push(String(key));
        };
      },
      set: (_target, key, value) => {
        calls.push(`${String(key)}:${String(value)}`);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  drawPaleIce(
    context,
    { x: 20, y: 30, w: 420, h: 28, arenaState: state, stress: 0.8 },
    {
      timeSeconds: 1,
      lowGraphics: false,
      highContrast: false,
      reducedMotion: false,
      flashScale: 1,
      stressRatio: 0.8,
      warningRatio: 0.7,
      reformRatio: 0.6,
      ...policy,
    },
    texture,
  );
  return calls;
}

describe("pale-ice platform material", () => {
  it("fills its body from a scene texture when one is ready, keeping the snow edge", () => {
    const draw = vi.fn(() => true);
    const textured = renderPale("stable", { floor: true }, { draw });
    expect(draw).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ x: 20, y: 30 }), true);
    expect(textured).not.toContain(`stop:${PALE_ICE_COLORS.bodyDeep}`);
    expect(textured).toContain(`fillStyle:${PALE_ICE_COLORS.snow}`);
    expect(renderPale("stable", {}, { draw: () => false })).toEqual(renderPale("stable"));
  });

  it("derives presentation state from the existing arena lifecycle", () => {
    expect(paleIceState({ x: 0, y: 0, w: 1, h: 1 })).toBe("stable");
    expect(paleIceState({ x: 0, y: 0, w: 1, h: 1, stress: 0.2 })).toBe("stressed");
    for (const state of ["warning", "broken", "reforming"] as const) {
      expect(paleIceState({ x: 0, y: 0, w: 1, h: 1, arenaState: state })).toBe(state);
    }
  });

  it("renders the deep body, snow contact plane, cyan edge, and pink reflection", () => {
    const calls = renderPale("stable");
    expect(calls).toContain(`stop:${PALE_ICE_COLORS.bodyDeep}`);
    expect(calls).toContain(`fillStyle:${PALE_ICE_COLORS.snow}`);
    expect(calls).toContain(`fillStyle:${PALE_ICE_COLORS.iceEdge}`);
    expect(calls).toContain(`fillStyle:${PALE_ICE_COLORS.reflection}`);
  });

  it("bounds icicles and retains structural fractures in low graphics", () => {
    const full = renderPale("stable");
    const low = renderPale("stable", { lowGraphics: true });
    const icicles = full.filter((entry) => entry === "fill").length;
    expect(icicles).toBeGreaterThan(0);
    expect(icicles).toBeLessThanOrEqual(PALE_ICE_DETAIL_LIMITS.icicles);
    expect(low.filter((entry) => entry === "fill")).toHaveLength(0);
    expect(full).toContain("stroke");
    expect(low).toContain("stroke");
  });

  it("keeps a static high-contrast warning and bounded lifecycle fragments", () => {
    const warning = renderPale("warning", { highContrast: true, reducedMotion: true, flashScale: 0 });
    expect(warning).toContain(`strokeStyle:${PALE_ICE_COLORS.highContrastWarning}`);
    expect(warning.filter((entry) => entry === "strokeRect")).toHaveLength(2);
    expect(renderPale("broken").filter((entry) => entry === "fillRect")).toHaveLength(6);
    expect(renderPale("reforming")).toContain("strokeRect");
  });
});
