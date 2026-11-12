import { describe, expect, it } from "vitest";
import { densityTokens, isCompactDensity } from "../../src/presentation/ui-density";
import { touchControlAt, touchControlLayout } from "../../src/input/touch-control-layout";

const base = {
  type: { wordmark: 80, display: 52, h1: 40, h2: 30, title: 24, lead: 20, body: 16, label: 15, caption: 14, micro: 13 },
  metric: { btnH: 48, btnW: 300, btnGap: 12, chipH: 28, chipW: 96, settingsRowH: 58, settingsControlW: 252, settingsControlH: 42, settingsStepperW: 54, minTarget: 32 },
};
// 844x390 phone and 1180x820 tablet, logical frame 1600x900 fitted by height / width.
const phone = 390 / 900, tablet = 1180 / 1600;
const textRoles = ["micro", "caption", "label", "body", "lead", "title", "h2", "h1", "display"] as const;
const targetMetrics = ["btnH", "chipH", "settingsControlH", "settingsStepperW", "minTarget"] as const;

describe("interface density", () => {
  it("keeps the authored tokens on desktop", () => {
    expect(densityTokens(base, { touch: false, cssPerLogicalPixel: 0.8 })).toEqual(base);
  });

  it("guarantees 11 CSS px text and 44 CSS px targets on a phone and keeps the ramp ordered", () => {
    const live = densityTokens(base, { touch: true, cssPerLogicalPixel: phone });
    for (const role of textRoles) expect((live.type[role] ?? 0) * phone).toBeGreaterThanOrEqual(11);
    for (const key of targetMetrics) expect((live.metric[key] ?? 0) * phone).toBeGreaterThanOrEqual(44);
    for (let index = 1; index < textRoles.length; index++) {
      expect(live.type[textRoles[index] ?? "micro"]).toBeGreaterThanOrEqual(live.type[textRoles[index - 1] ?? "micro"] ?? 0);
    }
    expect(isCompactDensity({ touch: true, cssPerLogicalPixel: phone })).toBe(true);
  });

  it("resolves a tablet to the plain touch profile, and floors can be withheld per screen", () => {
    const live = densityTokens(base, { touch: true, cssPerLogicalPixel: tablet });
    expect(live.type.micro).toBe(16);
    expect(live.metric.btnH).toBe(60);
    expect(isCompactDensity({ touch: true, cssPerLogicalPixel: tablet })).toBe(false);
    expect(densityTokens(base, { touch: true, cssPerLogicalPixel: phone }, false).type.micro).toBe(16);
  });
});

describe("touch control layout (single owner of drawn and hit geometry)", () => {
  const viewport = (overscanX: number, overscanY: number, css: number) => ({
    width: 1600, height: 900, overscanX, overscanY, safe: { l: 0, r: 0, t: 0, b: 0 }, cssPerLogicalPixel: css,
  });

  it("anchors the thumb controls to the real screen edges on a tablet", () => {
    const layout = touchControlLayout(viewport(0, 106, tablet));
    const bottom = 900 + 106;
    expect(layout.jump.y + layout.jump.r).toBeGreaterThan(bottom - 40);
    expect(layout.jump.y + layout.jump.r).toBeLessThanOrEqual(bottom);
    expect(layout.dash.x + layout.dash.r).toBeLessThan(layout.jump.x - layout.jump.r);
    expect(layout.pause.y - layout.pause.r).toBeGreaterThanOrEqual(-106);
  });

  it("sizes every control to at least the 44 CSS px target and hit-tests exactly the drawn circles", () => {
    const layout = touchControlLayout(viewport(174, 0, phone));
    for (const name of ["jump", "dash", "throwB", "pause"] as const) {
      const control = layout[name];
      expect(control.r * 2 * phone).toBeGreaterThanOrEqual(44);
      expect(touchControlAt(layout, control.x + control.r - 0.5, control.y)).toBe(name);
      expect(touchControlAt(layout, control.x + control.r + 1, control.y)).not.toBe(name);
    }
    expect(layout.joystickZoneRight).toBeCloseTo(-174 + 1948 * 0.42);
  });
});
