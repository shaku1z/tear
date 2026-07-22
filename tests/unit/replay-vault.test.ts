import { describe, expect, it } from "vitest";
import { LegacyReplayVault, type ReplayStore } from "../../src/replay/legacy-compat";
import { buildVisualReplayPacket, type VisualRecordingV2 } from "../../src/replay/visual-replay";

function packet(): ReturnType<typeof buildVisualReplayPacket> {
  const positions = Array.from({ length: 20 }, (_, index) => index);
  const recording: VisualRecordingV2 = {
    v: 2, dt: 0.1, edt: 0.25, px: positions, py: positions, tx: positions, ty: positions, fc: positions.map(() => 1),
    stages: [], waves: [], spawns: [], esamp: [], deaths: [], events: [], loadout: [], thumb: null,
  };
  return buildVisualReplayPacket(recording, {
    rulesetVersion: "rules", build: { version: "test", revision: "test", target: "test" },
    runId: "run", seed: "seed", ticksPerSecond: 60, tearScore: { enabled: false, reason: "disabled" },
  }, []);
}

function memoryStore(): { readonly store: ReplayStore; readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return { store: { get: (key) => values.get(key) ?? null, set: (key, value) => { values.set(key, value); } }, values };
}

describe("LegacyReplayVault", () => {
  it("recovers from a corrupted index and rejects corrupted replay blobs", () => {
    const { store, values } = memoryStore();
    values.set("tear_vault_index", "not-json");
    const vault = new LegacyReplayVault(store, () => 1, () => 0.5);
    expect(vault.index()).toEqual([]);
    values.set("tear_vault_bad", JSON.stringify({ v: 2, px: [1], py: [1] }));
    expect(vault.get("bad")).toBeNull();
  });

  it("keeps only twelve unpinned recordings and removes evicted blobs", () => {
    const { store, values } = memoryStore();
    let now = 1;
    const vault = new LegacyReplayVault(store, () => now++, () => 0.5);
    const ids = Array.from({ length: 14 }, () => vault.add(packet(), {}));
    expect(vault.index()).toHaveLength(12);
    expect(ids.slice(0, 2).every((id) => id !== null && values.get(`tear_vault_${id}`) === "")).toBe(true);
  });

  it("enforces the pinned limit without unpinning existing keepers", () => {
    const { store } = memoryStore();
    let now = 1;
    const vault = new LegacyReplayVault(store, () => now++, () => 0.25);
    const ids = Array.from({ length: 11 }, () => vault.add(packet(), {}));
    for (const id of ids.slice(0, 10)) expect(id && vault.pin(id, true)).toBe(true);
    expect(ids[10] && vault.pin(ids[10], true)).toBe(false);
    expect(vault.index().filter((entry) => entry.pin)).toHaveLength(10);
  });

  it("fails safely when recording storage is full", () => {
    const store: ReplayStore = { get: () => null, set: (key) => { if (key.startsWith("tear_vault_v")) throw new Error("quota"); } };
    const vault = new LegacyReplayVault(store, () => 1, () => 0.5);
    expect(vault.add(packet(), {})).toBeNull();
    expect(vault.index()).toEqual([]);
  });

  it("round-trips canonical recordings and rejects a corrupted verification hash", () => {
    const { store, values } = memoryStore();
    const vault = new LegacyReplayVault(store, () => 1, () => 0.5);
    const id = vault.add(packet(), { score: 10 });
    expect(id).not.toBeNull();
    expect(id && vault.get(id)).toMatchObject({ format: "tear-replay", rulesetVersion: "rules" });
    if (id !== null) {
      const stored = JSON.parse(values.get(`tear_vault_${id}`) ?? "{}") as Record<string, unknown>;
      stored.final = { tick: 0, stateHash: "corrupt" };
      values.set(`tear_vault_${id}`, JSON.stringify(stored));
      expect(vault.get(id)).toBeNull();
    }
  });
});
