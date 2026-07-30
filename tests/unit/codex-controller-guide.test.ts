import { describe, expect, it } from "vitest";
import { buildCodexGuide } from "../../src/presentation/codex-snapshots";

describe("Codex controller guide", () => {
  it("uses the active bindings and glyph family for every controller action", () => {
    const guide = buildCodexGuide({
      hit: 1, throwHit: 2, deflect: 3, launch: 4, slam: 5, updraft: 6, superslam: 7, parry: 8,
    }, [{ name: "NICE", at: 1, mult: 1 }], {
      jump: "✕", dash: "◯", throw: "▢", tether: "L1", pause: "Options",
    });
    expect(guide.controller[1]).toBe("✕ jump · ◯ dash · ▢ throw · L1 tether · Options pause");
  });
});
