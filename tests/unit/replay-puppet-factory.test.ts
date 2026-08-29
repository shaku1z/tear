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

  it("fails closed for unknown or cross-family stable variant identities", () => {
    const factories = {
      boss: () => puppet("charger"), charger: () => puppet("charger"), ranged: () => puppet("ranged"),
      flyer: () => puppet("flyer"), bomber: () => puppet("bomber"), armored: () => puppet("armored"),
      support: () => puppet("support"), wraith: () => puppet("wraith"), chimera: () => puppet("chimera"),
    };
    expect(createReplayPuppet({ k: "ranged", vid: "does-not-exist" }, factories, { ranged: [] }, vi.fn())).toBeNull();
    expect(createReplayPuppet({ k: "ranged", vid: "briar-stalker" }, factories,
      { ranged: [], charger: [{ id: "briar-stalker", name: "Briar Stalker" }] }, vi.fn())).toBeNull();
  });
});
