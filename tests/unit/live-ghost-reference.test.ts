import { createLiveGhostChase } from "../../src/app/live-ghost-chase-composition";
import { describe, expect, it, vi } from "vitest";
import { createLiveGhostReferenceController, type GhostChaseLiveState } from "../../src/app/live-ghost-reference-controller";
import type { GhostLiveReference, GhostReferenceFrame } from "../../src/ghost/live-ghost-reference-data";
import { readGhostRunAssistance } from "../../src/gameplay/run/ghost-assistance";

// Pure controller values. Actual actor/physics custody is exercised by the existing recorded-source control.
function fixture(): GhostLiveReference {
  const assistance = readGhostRunAssistance({ format: "tear-ghost-chase", version: 1, sourceId: "source", sourceManifestHash: "a".repeat(16), sourceRoot: "b".repeat(16), actor: "unknown", coachEnabled: true, ghostVisible: true, competitiveEligible: false });
  if (!assistance) throw new Error("fixture disposition");
  const frame: GhostReferenceFrame = { tick: 0, time: 0, stage: 0, wave: 1, score: 20, hp: 90, maxHp: 100, waveTime: 0, arena: "arena", blocked: false,
    player: { x: 30, y: 40, hw: 10, hh: 20, facing: 1 }, blade: { x: 30, y: 40, tipX: 55, tipY: 45, state: "held" } };
  return { version: 1, assistance, mode: "endless", difficulty: "normal", weapon: "sword", seed: "source-seed",
    build: { version: "1", revision: "r", target: "test", rulesetVersion: "v", contentHash: "c", configHash: "config" },
    frames: [frame, { ...frame, tick: 120, time: 1, waveTime: 1 }], splits: [{ tick: 0, time: 0, stage: 0, wave: 1, event: "start" }] };
}
const state = (reference: GhostLiveReference): GhostChaseLiveState => ({ runId: 71, mode: "endless", difficulty: "normal", weapon: "sword", time: .5, waveTime: .5, stage: 0, wave: 1,
  score: 40, hp: 80, maxHp: 120, arena: "arena", blocked: false, assistance: reference.assistance });

describe("live Chase reference ownership", () => {
  it("keeps the normal reference catalog readable before any run exists", () => {
    const player = vi.fn((): never => { throw new Error("No live actor in menu"); });
    const chase = createLiveGhostChase({ factory: undefined, ui: { font: () => "", t: { type: { micro: 12 }, color: { cinema: "", cinemaInk: "", accent: "" } } }, run: () => null,
      player, stage: () => 0, platforms: () => [], blocked: () => true, prepareStart: () => undefined, start: () => undefined });
    expect(chase.snapshot()).toMatchObject({ active: false, message: "" }); expect(player).not.toHaveBeenCalled();
  });
  it("shows native-unit comparisons, keeps splits through hiding/divergence and clears on replaced run", async () => {
    const reference = fixture();
    const controller = createLiveGhostReferenceController({ prepare: () => Promise.resolve(reference), current: () => Promise.resolve(true), start: () => { controller.installed(71); } });
    await controller.choose("source"); controller.configuration("config"); const live = state(reference);
    controller.boundary({ ...live, time: .25 }, "start"); controller.observe(live);
    expect(controller.snapshot(live)).toMatchObject({ active: true, visible: true, hp: -10, ownHp: "80/120", referenceHp: "90/100", score: 20, wave: 0, time: .25 });
    controller.toggle(); expect(controller.snapshot(live).pose).toBeUndefined(); expect(controller.snapshot(live).time).toBe(.25);
    controller.toggle(); controller.observe({ ...live, arena: "different" }); expect(controller.snapshot(live).pose).toBeUndefined(); expect(controller.snapshot(live).time).toBe(.25);
    expect(controller.snapshot(live).message).toContain("Different encounter"); expect(reference.assistance.competitiveEligible).toBe(false);
    controller.observe({ ...live, runId: 72 }); expect(controller.snapshot().active).toBe(false);
  });
  it("refuses source drift and cannot adopt an async selection cancelled before launch", async () => {
    const reference = fixture(), start = vi.fn(), prepareStart = vi.fn();
    const refused = createLiveGhostReferenceController({ prepare: () => Promise.resolve(reference), current: () => Promise.resolve(false), prepareStart, start });
    await refused.choose("source"); expect(start).not.toHaveBeenCalled(); expect(refused.snapshot().active).toBe(false);
    const replaced = createLiveGhostReferenceController({ prepare: () => Promise.resolve(reference), current: () => Promise.resolve(true), start });
    await replaced.choose("source", "c".repeat(16)); expect(start).not.toHaveBeenCalled(); expect(replaced.snapshot().message).toContain("identity changed");
    let resolve: (value: GhostLiveReference) => void = () => undefined;
    const delayed = createLiveGhostReferenceController({ prepare: () => new Promise((done) => { resolve = done; }), current: () => Promise.resolve(true), prepareStart, start });
    const work = delayed.choose("source"); delayed.cancelPreparation(); resolve(reference); await work;
    expect(prepareStart).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled(); expect(delayed.snapshot().active).toBe(false); expect(delayed.takeSetupLaunch()).toBe(false);
  });
});
