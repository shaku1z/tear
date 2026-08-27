import { describe, expect, it } from "vitest";

import {
  VERDANT_ROOTSTONE_COLORS,
  drawVerdantRootstone,
  verdantRootstoneState,
  type VerdantRootstoneRenderPolicy,
} from "../../src/presentation/platform-materials/verdant-rootstone";

function render(state: string, policy: Partial<VerdantRootstoneRenderPolicy> = {}) {
  const calls: string[] = [];
  const gradient = { addColorStop: (_offset: number, color: string) => { calls.push(`stop:${color}`); } };
  const context = new Proxy({}, {
    get: (_target, key) => {
      if (key === "createLinearGradient") return () => gradient;
      return () => { calls.push(String(key)); };
    },
    set: (_target, key, value) => { calls.push(`${String(key)}:${String(value)}`); return true; },
  }) as unknown as CanvasRenderingContext2D;
  drawVerdantRootstone(context, { x: 20, y: 30, w: 240, h: 24, arenaState: state, stress: 0.8 }, {
    timeSeconds: 1,
    lowGraphics: false,
    highContrast: false,
    stressRatio: 0.8,
    warningRatio: 0.7,
    reformRatio: 0.6,
    ...policy,
  });
  return calls;
}

describe("verdant-rootstone platform material", () => {
  it("derives presentation state from the existing arena lifecycle", () => {
    expect(verdantRootstoneState({ x: 0, y: 0, w: 1, h: 1 })).toBe("stable");
    expect(verdantRootstoneState({ x: 0, y: 0, w: 1, h: 1, stress: 0.2 })).toBe("stressed");
    for (const state of ["warning", "broken", "reforming"] as const) {
      expect(verdantRootstoneState({ x: 0, y: 0, w: 1, h: 1, arenaState: state })).toBe(state);
    }
  });

  it("renders root grain and wet edges only as presentation details", () => {
    const calls = render("stable");
    expect(calls).toContain(`stop:${VERDANT_ROOTSTONE_COLORS.bodyDeep}`);
    expect(calls).toContain(`fillStyle:${VERDANT_ROOTSTONE_COLORS.moss}`);
    expect(calls).toContain(`fillStyle:${VERDANT_ROOTSTONE_COLORS.wetEdge}`);
    expect(calls).toContain("quadraticCurveTo");
  });

  it("keeps warning geometry in low graphics and strengthens high contrast", () => {
    const calls = render("warning", { lowGraphics: true, highContrast: true });
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
});
