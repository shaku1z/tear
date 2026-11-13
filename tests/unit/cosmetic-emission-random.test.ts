import { describe, expect, it } from "vitest";
import {
  createCosmeticEmissionRandom,
  legacyCosmeticEmissionSnapshot,
  parseCosmeticEmissionRandomSnapshot,
} from "../../src/domain/cosmetic-emission-random";
import { createRunRandom } from "../../src/simulation/run-random";

describe("cosmetic emission entropy", () => {
  it("reuses stable owners/callbacks and restores independent interleaved streams without gameplay draws", () => {
    const a = createCosmeticEmissionRandom(),
      b = createCosmeticEmissionRandom(),
      game = createRunRandom(),
      next = a.next;
    const before = game.streams.snapshot();
    a.resetRun(17);
    b.resetRun(17);
    expect(a.next).toBe(next);
    const saved = a.snapshot();
    const values = [a.next(), a.next(), a.next()];
    b.next();
    b.next();
    a.restore(saved);
    expect([a.next(), a.next(), a.next()]).toEqual(values);
    a.resetRun(17);
    expect(a.snapshot()).toEqual(saved);
    expect(a.next).toBe(next);
    expect(game.streams.snapshot()).toEqual(before);
    expect(b.snapshot().cursor).toBe(2);
  });
  it("derives legacy fallback only from staged facts and retains provenance until new run", () => {
    const a = createCosmeticEmissionRandom(),
      legacy = legacyCosmeticEmissionSnapshot(17, 25);
    a.resetRun(999);
    a.next();
    a.restore(legacy);
    a.next();
    expect(a.snapshot().provenance).toBe("legacy-derived");
    expect(legacyCosmeticEmissionSnapshot(17, 25)).toEqual(legacy);
    expect(legacyCosmeticEmissionSnapshot(17, 26)).not.toEqual(legacy);
    a.resetRun(17);
    expect(a.snapshot().provenance).toBe("run-start");
  });
  it("rejects malformed snapshots before mutation and never invokes accessors", () => {
    const owner = createCosmeticEmissionRandom(),
      saved = owner.snapshot();
    let calls = 0;
    for (const invalid of [
      null,
      {},
      { ...saved, version: 2 },
      { ...saved, algorithm: "other" },
      { ...saved, seed: -1 },
      { ...saved, state: 0x100000000 },
      { ...saved, cursor: 0.5 },
      { ...saved, cursor: Infinity },
      { ...saved, provenance: "other" },
      { ...saved, extra: 1 },
      {
        ...saved,
        get state() {
          calls++;
          return 1;
        },
      },
    ]) {
      expect(() => parseCosmeticEmissionRandomSnapshot(invalid)).toThrow();
      expect(owner.snapshot()).toEqual(saved);
    }
    expect(calls).toBe(0);
    expect(parseCosmeticEmissionRandomSnapshot(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    owner.restore({ ...saved, cursor: Number.MAX_SAFE_INTEGER });
    const exhausted = owner.snapshot();
    expect(() => owner.next()).toThrow(/cursor exhausted/);
    expect(owner.snapshot()).toEqual(exhausted);
  });
});
