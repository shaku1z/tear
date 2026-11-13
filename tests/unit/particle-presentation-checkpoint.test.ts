import { describe, expect, it } from "vitest";
import { createParticleSystem } from "../../src/presentation/particles";
import { parseParticlePresentationCheckpoint, validateParticlePresentationBinding } from "../../src/tearbench/particle-presentation-checkpoint";
import { createCosmeticEmissionRandom } from "../../src/domain/cosmetic-emission-random";

function fixture(highBudget = 32, lowBudget = 2) {
  let draws = 0, low = false;
  const effects = { highBudget, lowBudget, cullMargin: 180 };
  const fx = createParticleSystem({ effects, lowGraphics: () => low, reducedMotion: () => false, random: () => { draws++; return 0.5; } });
  const capture = () => ({ version: 1, list: fx.list, view: fx.view, replacementCursor: fx._replacementCursor,
    policy: { effects, lowGraphics: low, reducedMotion: false } });
  return { fx, capture, draws: () => draws, low: () => { low = true; } };
}

describe("particle presentation checkpoint", () => {
  it("requires versioned entropy in v2 while keeping v1 strict and unchanged", () => {
    const f = fixture(), legacy = f.capture(), entropy = createCosmeticEmissionRandom().snapshot();
    const current = { ...legacy, version: 2, entropy };
    expect(parseParticlePresentationCheckpoint(current)).toEqual(current);
    expect(parseParticlePresentationCheckpoint(legacy)).toEqual(legacy);
    for (const invalid of [{ ...legacy, entropy }, { ...current, entropy: undefined }, { ...current, entropy: { ...entropy, cursor: -1 } },
      { ...current, version: 3 }, { ...current, entropy: { ...entropy, algorithm: "other" } }]) expect(() => parseParticlePresentationCheckpoint(invalid)).toThrow();
  });
  it("detaches every actual particle variant, optional/null fields and source policy without entropy", () => {
    const f = fixture(), fx = f.fx;
    fx.spark(1, 2, 0, 1); fx.ring(1, 2); fx.ribbon(1, 2, 3, 4);
    fx.edgeTrace(1, 2, 3, 4, 2, 0.1, "red"); fx.contactMark(1, 2, 1, 0, 8, 2, 0.1, "red");
    fx.groundPulse(1, 2, 0, 1, 8, 0.1, "red"); fx.muzzleWedge(1, 2, 1, 0, 12, 3, 0.1, "red");
    fx.shard(1, 2); fx.flash(1, 2); fx.shockwave(1, 2); fx.smoke(1, 2); fx.ghost(1, 2, 5, 6); fx.ember(1, 2); fx.drip(1, 2);
    const first = fx.list[0]; if (first) { delete first.col; delete first.priority; }
    fx.setViewRect({ left: -50, top: -60, right: 100, bottom: 200 });
    const before = f.draws(), parsed = parseParticlePresentationCheckpoint(f.capture());
    expect(parsed?.list.map((p) => p.type)).toEqual(["spark", "ring", "ribbon", "edgeTrace", "contactMark", "groundPulse", "muzzleWedge", "shard", "flash", "shock", "smoke", "ghost", "ember", "drip"]);
    expect(parsed).toEqual(f.capture()); expect(parsed?.list[0]).not.toHaveProperty("col");
    expect(parsed?.list[11]).toHaveProperty("col", null);
    expect(parseParticlePresentationCheckpoint(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    if (first) first.x = 99; if (fx.view) fx.view.left = 99;
    expect(parsed?.list[0]?.x).toBe(1); expect(parsed?.view?.left).toBe(-50); expect(f.draws()).toBe(before);
  });

  it.each([0, 1, 1.25])("respects actual numeric admission for budget %s", (budget) => {
    const f = fixture(budget, budget);
    for (let i = 0; i < 4; i++) f.fx.ring(i, 0);
    expect(f.fx.list).toHaveLength(Math.ceil(budget));
    expect(parseParticlePresentationCheckpoint(f.capture())?.list).toHaveLength(Math.ceil(budget));
  });

  it("retains high-to-low history, compacted cursor and finite unnormalized data", () => {
    const f = fixture(4, 1); for (let i = 0; i < 4; i++) f.fx.ring(i, 0);
    f.low(); f.fx._replacementCursor = 3;
    const first = f.fx.list[0]; if (first) { first.life = 3; first.max = 1; }
    expect(parseParticlePresentationCheckpoint(f.capture())?.list).toHaveLength(4);
    f.fx.list.splice(1);
    expect(parseParticlePresentationCheckpoint(f.capture())?.replacementCursor).toBe(3);
    const inverse = fixture(1, 3); inverse.low();
    for (let i = 0; i < 3; i++) inverse.fx.ring(i, 0);
    expect(parseParticlePresentationCheckpoint(inverse.capture())?.list).toHaveLength(3);
  });

  it("rejects malformed data/accessors without executing them, and binds tuning rather than user flags", () => {
    const f = fixture(); f.fx.ring(1, 2);
    const saved = f.capture(); let reads = 0;
    const accessor = { ...saved, get list() { reads++; return []; } };
    expect(() => parseParticlePresentationCheckpoint(accessor)).toThrow(/accessors/); expect(reads).toBe(0);
    const particle = { ...f.fx.list[0], get x() { reads++; return 1; } };
    expect(() => parseParticlePresentationCheckpoint({ ...saved, list: [particle] })).toThrow(/accessors/); expect(reads).toBe(0);
    const list = [f.fx.list[0]]; Object.defineProperty(list, "0", { get() { reads++; return {}; } });
    expect(() => parseParticlePresentationCheckpoint({ ...saved, list })).toThrow(/accessors/); expect(reads).toBe(0);
    for (const invalid of [null, { ...saved, version: 2 }, { ...saved, replacementCursor: -1 }, { ...saved, extra: 1 },
      { ...saved, list: [{ ...f.fx.list[0], x: NaN }] }, { ...saved, list: [{ ...f.fx.list[0], type: "other" }] },
      { ...saved, list: [{ ...f.fx.list[0], col: undefined }] }, { ...saved, list: [{ ...f.fx.list[0], priority: "other" }] },
      { ...saved, list: [{ ...f.fx.list[0], fn: () => 1 }] }, { ...saved, policy: { ...saved.policy, effects: { ...saved.policy.effects, highBudget: Infinity } } }]) {
      expect(() => parseParticlePresentationCheckpoint(invalid)).toThrow();
    }
    expect(parseParticlePresentationCheckpoint(undefined)).toBeUndefined();
    const parsed = parseParticlePresentationCheckpoint(saved);
    expect(() => { validateParticlePresentationBinding(parsed, saved.policy.effects); }).not.toThrow();
    expect(() => { validateParticlePresentationBinding(parsed, { ...saved.policy.effects, lowBudget: 1 }); }).toThrow(/candidate configuration/);
  });

  it("rejects over-capacity, sparse and extended arrays without truncation", () => {
    const f = fixture(1, 1); f.fx.ring(1, 2); const saved = f.capture();
    const extended = Object.assign([...f.fx.list], { extension: true });
    for (const list of [[...f.fx.list, ...f.fx.list], new Array<unknown>(1), extended]) {
      expect(() => parseParticlePresentationCheckpoint({ ...saved, list })).toThrow();
    }
    expect(f.fx.list).toHaveLength(1);
  });
});
