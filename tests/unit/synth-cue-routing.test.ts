import { describe, expect, it } from "vitest";
import {
  SYNTHESIZED_SFX_CUE_ROUTES,
  synthesizedSfxRoute,
} from "../../src/audio/synth-cue-routing";

describe("synthesized SFX cue routing", () => {
  it("keeps the complete authored catalogue on explicit semantic buses", () => {
    expect(Object.keys(SYNTHESIZED_SFX_CUE_ROUTES)).toHaveLength(64);
    expect(new Set(Object.values(SYNTHESIZED_SFX_CUE_ROUTES))).toEqual(
      new Set(["weapons", "enemies", "player", "environment"]),
    );
    expect(SYNTHESIZED_SFX_CUE_ROUTES).toMatchObject({
      swing: "weapons",
      wardenClash: "enemies",
      hurt: "player",
      platformRebuild: "environment",
    });
  });

  it("resolves only declared cue properties", () => {
    expect(synthesizedSfxRoute("parry")).toBe("weapons");
    expect(synthesizedSfxRoute("ui")).toBeUndefined();
    expect(synthesizedSfxRoute("setMusicTheme")).toBeUndefined();
    expect(synthesizedSfxRoute(Symbol("cue"))).toBeUndefined();
  });
});
