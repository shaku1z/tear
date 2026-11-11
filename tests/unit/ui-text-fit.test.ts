import { describe, expect, it } from "vitest";
import { ellipsizeLine, fitTextLayout, wrapWords } from "../../src/presentation/ui-text-fit";
import { contrastRatio, darkenToContrast, inkIsLight } from "../../src/presentation/ui-color";

// Monospace stand-in: every glyph is 0.6 × the font size wide (Courier's advance).
const mono = (text: string, size: number): number => text.length * size * 0.6;

describe("shared text fitting rule", () => {
  it("keeps text that fits at its requested size on one line", () => {
    expect(fitTextLayout(mono, "SHOP", 200, { size: 20 })).toEqual({ size: 20, lines: ["SHOP"], truncated: false, overflow: false });
  });

  it("steps the size down to the floor before wrapping", () => {
    // 12 chars × 20 × 0.6 = 144 > 130; at 18 px it is 129.6 and fits.
    expect(fitTextLayout(mono, "ACHIEVEMENTS", 130, { size: 20, floor: 13, maxLines: 2 })).toMatchObject({ size: 18, lines: ["ACHIEVEMENTS"] });
  });

  it("wraps to two lines at the floor when shrinking alone is not enough", () => {
    const layout = fitTextLayout(mono, "TRAINING OPERATIONS CENTRE", 140, { size: 20, floor: 13, maxLines: 2 });
    expect(layout.size).toBe(13);
    expect(layout.lines).toEqual(["TRAINING", "OPERATIONS CENTRE"]);
    expect(layout.truncated).toBe(false);
  });

  it("ellipsizes only as the last resort", () => {
    const layout = fitTextLayout(mono, "a very long description that cannot possibly fit in two short lines", 120, { size: 13, maxLines: 2 });
    expect(layout.lines).toHaveLength(2);
    expect(layout.truncated).toBe(true);
    expect(layout.lines[1]?.endsWith("…")).toBe(true);
    for (const line of layout.lines) expect(mono(line, layout.size)).toBeLessThanOrEqual(120);
  });

  it("never ellipsizes a navigation label (it reports the overflow instead)", () => {
    const layout = fitTextLayout(mono, "LEADERBOARDS", 40, { size: 20, floor: 13, ellipsis: false });
    expect(layout.lines).toEqual(["LEADERBOARDS"]);
    expect(layout.overflow).toBe(true);
    expect(layout.truncated).toBe(false);
  });

  it("wraps prose first when asked, keeping the requested size", () => {
    const layout = fitTextLayout(mono, "Closes the gap and commits a telegraphed charge", 200, { size: 13, floor: 11, maxLines: 4, wrapFirst: true });
    expect(layout.size).toBe(13);
    expect(layout.lines.length).toBeGreaterThan(1);
    for (const line of layout.lines) expect(mono(line, 13)).toBeLessThanOrEqual(200);
  });

  it("wraps on explicit newlines and keeps long single words whole", () => {
    expect(wrapWords(mono, "Handling 5\nWeak: slow", 500, 10)).toEqual(["Handling 5", "Weak: slow"]);
    expect(wrapWords(mono, "Supercalifragilistic x", 30, 10)).toEqual(["Supercalifragilistic", "x"]);
    expect(ellipsizeLine(mono, "abcdefghij", 36, 10)).toBe("abcde…");
  });
});

describe("guaranteed-contrast colour helpers", () => {
  it("identifies light inks", () => {
    expect(inkIsLight("#f1eff9")).toBe(true);
    expect(inkIsLight("#000")).toBe(false);
    expect(inkIsLight("rgba(0,0,0,1)")).toBe(false);
  });

  it("darkens palette hues until they read on paper", () => {
    for (const hue of ["#13c4d6", "#e0a326", "#2f9e6b", "#b06cff"]) {
      const readable = darkenToContrast(hue, "#ffffff", 4.5);
      expect(contrastRatio(readable, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
    expect(darkenToContrast("#111111", "#ffffff")).toBe("#111111");
  });
});
