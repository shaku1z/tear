import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { MusicCatalog } from "../../src/audio/music/catalog";
import { createStationState } from "../../src/audio/music/station";
import {
  DEFAULT_LOADOUT,
  effectivePolicy,
  prefersInstrumental,
  resolveSlot,
  slotForBiome,
  type AdvancedLoadout,
} from "../../src/audio/music/advanced-loadout";

const catalog = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../public/audio/catalog.json"), "utf8"),
) as MusicCatalog;

const opts = (seed = 1) => ({
  catalog, context: "gameplay" as const, stationState: createStationState(), seed,
  isLoaded: () => true,
});

describe("advanced loadout", () => {
  it("defaults every slot to canonical", () => {
    expect(effectivePolicy(DEFAULT_LOADOUT, "gameplay")).toEqual({ type: "canonical" });
    expect(resolveSlot(DEFAULT_LOADOUT, "the-tear", opts()).kind).toBe("canonical");
  });

  it("inherits a biome slot from gameplay", () => {
    const loadout: AdvancedLoadout = {
      slots: { gameplay: { type: "station", stationId: "cutline" }, "the-grounds": { type: "inherit" } },
      vocals: "allow",
    };
    expect(effectivePolicy(loadout, "the-grounds")).toEqual({ type: "station", stationId: "cutline" });
  });

  it("lets a biome override its parent", () => {
    const loadout: AdvancedLoadout = {
      slots: { gameplay: { type: "canonical" }, "the-tear": { type: "work", workId: "the-source" } },
      vocals: "allow",
    };
    const res = resolveSlot(loadout, "the-tear", opts());
    expect(res).toMatchObject({ kind: "work", workId: "the-source" });
  });

  it("falls back to canonical when the chosen work is not loaded", () => {
    const loadout: AdvancedLoadout = { slots: { gameplay: { type: "work", workId: "beserker" } }, vocals: "allow" };
    const res = resolveSlot(loadout, "gameplay", { ...opts(), isLoaded: () => false });
    expect(res.kind).toBe("canonical");
  });

  it("honours an explicit off", () => {
    const loadout: AdvancedLoadout = { slots: { gameplay: { type: "off" } }, vocals: "allow" };
    expect(resolveSlot(loadout, "gameplay", opts()).kind).toBe("off");
  });

  it("picks deterministically from a weighted pool", () => {
    const loadout: AdvancedLoadout = {
      slots: { gameplay: { type: "weighted-pool", entries: [
        { workId: "beserker", weight: 3 }, { workId: "the-source", weight: 1 },
      ] } },
      vocals: "allow",
    };
    const a = resolveSlot(loadout, "gameplay", opts(99));
    const b = resolveSlot(loadout, "gameplay", opts(99));
    expect(a).toEqual(b);
    expect(["beserker", "the-source"]).toContain(a.workId);
  });

  it("ignores zero-weight pool entries", () => {
    const loadout: AdvancedLoadout = {
      slots: { gameplay: { type: "weighted-pool", entries: [
        { workId: "beserker", weight: 0 }, { workId: "the-source", weight: 1 },
      ] } },
      vocals: "allow",
    };
    for (const seed of [1, 2, 3, 7, 11]) {
      expect(resolveSlot(loadout, "gameplay", opts(seed)).workId).toBe("the-source");
    }
  });

  it("applies the vocal policy per context", () => {
    expect(prefersInstrumental("instrumental-in-combat", "gameplay")).toBe(true);
    expect(prefersInstrumental("instrumental-in-combat", "menu")).toBe(false);
    expect(prefersInstrumental("never", "menu")).toBe(true);
    expect(prefersInstrumental("allow", "boss")).toBe(false);
  });

  it("maps stage names onto biome slots", () => {
    expect(slotForBiome("The Crimson Fields")).toBe("the-crimson-fields");
    expect(slotForBiome("menu")).toBeNull();
  });
});
