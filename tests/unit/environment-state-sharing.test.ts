import { describe, expect, it } from "vitest";
import { createEnvironmentState, isEnvironmentOwnedData } from "../../src/gameplay/environment/environment-state";
import { buildEnvironmentPresentationSnapshot } from "../../src/gameplay/environment/presentation-snapshot";
import type { EnvironmentFieldState, EnvironmentSnapshot } from "../../src/gameplay/environment/environment-contracts";

/** The previous admission copy: every entry graph is rebuilt and frozen on every add, update and replace. */
function eagerFreeze(value: unknown): unknown {
  if (Array.isArray(value)) {
    const copy = new Array<unknown>(value.length);
    for (let index = 0; index < value.length; index += 1) if (index in value) copy[index] = eagerFreeze(value[index]);
    return Object.freeze(copy);
  }
  if (typeof value !== "object" || value === null) return value;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value)) copy[key] = eagerFreeze((value as Record<string, unknown>)[key]);
  return Object.freeze(copy);
}

function only<T>(values: readonly T[]): T {
  const [value] = values;
  if (value === undefined || values.length !== 1) throw new Error("expected exactly one entry");
  return value;
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}

const field = (): Omit<EnvironmentFieldState, "id"> & { authored: { points: { x: number; y: number }[]; tags: string[] } } => ({
  kind: "rootline", geometry: { x: 1, y: 2, w: 3, h: 4 }, state: "warning", stateTick: 0, timer: 0, ownerId: "owner",
  schedule: { startTick: 0, endTick: 90 }, eligibility: { player: true, enemies: false, bosses: false }, force: null, cleanupReason: null,
  authored: { points: [{ x: 0, y: 0 }, { x: 5, y: 6 }], tags: ["a"] },
});

describe("environment state admission copies once", () => {
  it("matches the eager per-update deep copy over a seeded update sequence, and callers keep no alias", () => {
    let seed = 0x5eed;
    const random = { next: () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; } };
    const state = createEnvironmentState("stage", "world");
    const id = state.addField(field());
    let eager = eagerFreeze({ ...field(), id }) as EnvironmentFieldState;
    for (let step = 0; step < 400; step += 1) {
      const current = only(state.fields());
      const roll = random.next();
      // Patches mix fresh caller objects (which the caller then mutates) and whole spread entries, as the biomes do.
      const patch: Record<string, unknown> = roll < 0.25
        ? { geometry: { x: step, y: 2, w: 3, h: 4, points: [{ x: step, y: 1 }] } }
        : roll < 0.5 ? { ...current, timer: step / 120 }
          : roll < 0.75 ? { state: step % 2 === 0 ? "active" : "cooldown", stateTick: step, authored: { points: [{ x: step, y: step }], tags: ["b", "c"] } }
            : { cleanupReason: null, extra: { nested: [step, { deep: [step] }] } };
      state.updateField(id, patch);
      eager = eagerFreeze({ ...eager, ...patch, id }) as EnvironmentFieldState;
      for (const value of Object.values(patch)) {
        if (typeof value === "object" && value !== null && !Object.isFrozen(value)) Object.assign(value, { x: -1, mutated: true });
      }
      const admitted = only(state.fields());
      expect(admitted).toEqual(eager);
      expect(Object.keys(admitted)).toEqual(Object.keys(eager));
      expectDeepFrozen(admitted);
    }
  });

  it("shares unchanged nested graphs between revisions and replays snapshots without copying admitted data", () => {
    const state = createEnvironmentState("stage", "world");
    const id = state.addField(field());
    const before = only(state.fields());
    state.updateField(id, { timer: 1 });
    const after = only(state.fields());
    expect(after).not.toBe(before);
    expect(after.geometry).toBe(before.geometry);
    expect(isEnvironmentOwnedData(after.geometry)).toBe(true);
    const snapshot = state.snapshot();
    const replica = createEnvironmentState("stage", "world");
    replica.replace(snapshot);
    expect(replica.fields()).toEqual(snapshot.fields);
    expect(replica.fields()[0]).toBe(snapshot.fields[0]);
  });

  it("still copies data that was never admitted", () => {
    const loose = { x: 1, y: 2 };
    expect(isEnvironmentOwnedData(loose)).toBe(false);
    expect(isEnvironmentOwnedData(Object.freeze({ x: 1 }))).toBe(false);
    const state = createEnvironmentState("stage", "world");
    const id = state.addField({ ...field(), geometry: loose });
    expect(state.fields().find((entry) => entry.id === id)?.geometry).not.toBe(loose);
  });
});

describe("environment presentation shares admitted data", () => {
  const structuredReference = (snapshot: EnvironmentSnapshot): unknown => JSON.parse(JSON.stringify(buildEnvironmentPresentationSnapshot(
    structuredClone({ ...snapshot, fields: snapshot.fields.map((entry) => ({ ...entry })), combatObjects: [...snapshot.combatObjects], routes: [...snapshot.routes] }))));

  it("equals the cloned projection and is immutable all the way down", () => {
    const state = createEnvironmentState("stage", "world");
    state.addField(field());
    state.addCombatObject({ kind: "root-link", ownerId: "owner", targetId: null, geometry: { x: 1, y: 2, points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }, state: "active", stateTick: 0,
      integrity: 2, maxIntegrity: 4, counterplayTags: ["cut"], procEligible: false, damageDedupeId: "link", cleanupReason: null, links: [{ id: "x" }] } as never);
    const snapshot = state.snapshot();
    const view = buildEnvironmentPresentationSnapshot(snapshot);
    expect(JSON.parse(JSON.stringify(view))).toEqual(structuredReference(snapshot));
    expectDeepFrozen(view);
    expect(view.fields[0]?.authored).toBe(snapshot.fields[0] && (snapshot.fields[0] as unknown as { authored: unknown }).authored);
  });

  it("clones authored details of a snapshot assembled outside a state, so the view never aliases caller data", () => {
    const authored = { points: [{ x: 0, y: 0 }], tags: ["a"] };
    const view = buildEnvironmentPresentationSnapshot({ stageId: "stage", fields: [{ ...field(), id: "f", authored } as EnvironmentFieldState], combatObjects: [], routes: [] });
    only(authored.points).x = 99;
    expect(view.fields[0]?.authored).toEqual({ points: [{ x: 0, y: 0 }], tags: ["a"] });
  });
});
