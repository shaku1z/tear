import { describe, expect, it } from "vitest";
import { hudType } from "../../src/presentation/world/hud";
import type { WorldRenderContext } from "../../src/presentation/world/contracts";
import { contrastRatio, darkenToContrast, inkIsLight } from "../../src/presentation/ui-color";
import { STAGE_IDS, stageDefinition } from "../../src/gameplay/stages";

const authored = { wordmark: 80, display: 52, h1: 40, h2: 30, title: 24, lead: 20, body: 16, label: 15, caption: 14, micro: 13 };
/** A light sky (luminance above one half) keeps the dark ink, where accent labels are darkened. */
const lightSky = (background: string): boolean => inkIsLight(background);
const hudContext = (cssPerLogicalPixel: number, type: Record<string, number> = authored) =>
  ({ ui: { t: { type } }, cssPerLogicalPixel }) as unknown as WorldRenderContext;

describe("HUD legibility", () => {
  it("keeps the authored HUD ramp at 1280x720 and above", () => {
    for (const scale of [1, 0.8]) expect(hudType(hudContext(scale))).toEqual(authored);
  });

  it("lifts the whole HUD ramp in a 1024x768 window so micro reads at the 1280x720 size or larger", () => {
    const scale = 1024 / 1600, lifted = hudType(hudContext(scale));
    expect(lifted.micro * scale).toBeGreaterThanOrEqual(10.4);
    expect(lifted.body).toBeGreaterThan(authored.body);
    expect(lifted.h2).toBeGreaterThan(lifted.lead);
    expect(lifted.lead).toBeGreaterThan(lifted.micro);
  });

  it("leaves the touch ramp alone (it is already at the 11 CSS px floor)", () => {
    const phone = { ...authored, micro: 26, body: 28, lead: 30, h2: 35 };
    expect(hudType(hudContext(390 / 900, phone))).toEqual(phone);
  });

  it("darkens the stage banner label (ENTERING, STAGE n) to 4.5:1 on every light stage sky", () => {
    for (const id of STAGE_IDS) {
      const stage = stageDefinition(id);
      // A dark sky (the Tear) flips the ink to light, where `readable` passes the accent through.
      if (lightSky(stage.bg)) {
        const label = darkenToContrast(stage.accent, "#ffffff", 6);
        expect(contrastRatio(label, stage.bg), `${id} banner label on ${stage.bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("clears 4.5:1 on the warm sun glow behind the Grounds banner", () => {
    for (const id of STAGE_IDS) {
      const stage = stageDefinition(id);
      if (!lightSky(stage.bg)) continue;
      // The sun glow behind the Grounds title measured #fef3e9 in a 1600x900 capture.
      expect(contrastRatio(darkenToContrast(stage.accent, "#ffffff", 6), "#fef3e9"), `${id} banner label on the sun glow`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
