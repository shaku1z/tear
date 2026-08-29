import { describe, expect, it } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { MODE_CATALOG } from "../../src/gameplay/run/mode-catalog";
import { stableVerificationHash } from "../../src/replay/hash";

function legacyRuntimeMode(mode: (typeof MODE_CATALOG)[number]) {
  return {
    id: mode.id,
    label: mode.label,
    blurb: mode.blurb,
    enabled: mode.enabled,
    ...(mode.training ? { training: true } : {}),
    ...(mode.bossOnly ? { bossOnly: true } : {}),
    ...(mode.sandbox ? { sandbox: true } : {}),
    ...(mode.id === "bossonly" || mode.id === "sandbox" ? { debug: true } : {}),
  };
}

describe("runtime mode configuration projection", () => {
  it("keeps CONFIG.modes in the legacy runtime shape while using MODE_CATALOG as authority", () => {
    expect(CONFIG.modes).toEqual(MODE_CATALOG.map(legacyRuntimeMode));
    expect(CONFIG.modes.map((mode) => Object.keys(mode))).toEqual([
      ["id", "label", "blurb", "enabled"],
      ["id", "label", "blurb", "enabled"],
      ["id", "label", "blurb", "enabled"],
      ["id", "label", "blurb", "enabled", "training"],
      ["id", "label", "blurb", "enabled", "training"],
      ["id", "label", "blurb", "enabled", "bossOnly", "debug"],
      ["id", "label", "blurb", "enabled", "sandbox", "debug"],
    ]);
    expect(CONFIG.modes.every((mode) => !("order" in mode) && !("classification" in mode))).toBe(true);
    expect(stableVerificationHash(CONFIG.modes)).toBe("b5bfc820c49c6615");
  });
});
