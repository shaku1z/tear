import { describe, expect, it, vi } from "vitest";
import { createReplayPuppet, type ReplayPuppetSource } from "../../src/presentation/replay-puppet-factory";

function puppet(kind: string): ReplayPuppetSource {
  return { kind, x: 0, y: 0, hp: 7, hpDisplay: 0, spawnT: 1, draw: vi.fn() };
}

describe("replay puppet factory", () => {
  it("constructs the recorded kind and safely applies a variant", () => {
    const apply = vi.fn(), ranged = vi.fn(() => puppet("ranged"));
    const fallback = () => puppet("charger");
    const result = createReplayPuppet({ k: "ranged", vn: "Marksman" }, {
      boss: fallback, charger: fallback, ranged, flyer: fallback, bomber: fallback, armored: fallback,
      support: fallback, wraith: fallback, chimera: fallback,
    }, { ranged: [{ name: "Marksman" }] }, apply);
    expect(ranged).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ spawnT: 0, hpDisplay: 7 });
  });
});
