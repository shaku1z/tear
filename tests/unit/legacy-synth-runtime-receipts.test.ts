import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const storage = new class implements Storage {
  readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}();

describe("legacy synth synchronous scheduling receipts", () => {
  beforeAll(() => { vi.stubGlobal("window", { localStorage: storage }); });
  afterAll(() => { vi.unstubAllGlobals(); });

  it("distinguishes routed finale cue calls from graph scheduling without a context", async () => {
    const { SFX } = await import("../../src/audio/legacy-synth-runtime");
    const operations = ["final-cut", "final-relic", "final-restore", "final-silence"] as const;
    const receipts = operations.map((operation, index) => SFX.dispatchFinaleCueForReceipt(operation, index));

    expect(receipts).toEqual(operations.map(() => ({
      kind: "cue", route: "environment", context: "unbound", scheduling: "no-context",
      attempted: 0, accepted: 0,
    })));
    expect(receipts.every(Object.isFrozen)).toBe(true);
  });

  it("reports logical mix targets separately from unavailable graph automation", async () => {
    const { SFX } = await import("../../src/audio/legacy-synth-runtime");

    expect(SFX.setVoidDescentForReceipt(2, 0)).toEqual({
      kind: "mix", context: "unbound", logicalBefore: 0, logicalAfter: 1,
      normalizedDuration: 0.22, scheduling: "logical-target-only",
    });
    expect(SFX.setMusicDuckForReceipt(-1, 0)).toEqual({
      kind: "mix", context: "unbound", logicalBefore: 1, logicalAfter: 0,
      normalizedDuration: 0.18, scheduling: "logical-target-only",
    });
  });
});
