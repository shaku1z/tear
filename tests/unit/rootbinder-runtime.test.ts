import { describe, expect, it } from "vitest";
import {
  ROOTBINDER_RULES,
  advanceRootbinder,
  chooseRootTargets,
  createRootLink,
  createRootbinderState,
  rootbinderIsOpen,
  rootbinderStandsStill,
  rootbinderWindup,
  uprootRootbinder,
  type RootbinderAlly,
  type RootbinderPhase,
} from "../../src/gameplay/entities/rootbinder-runtime";

const RULES = ROOTBINDER_RULES;
const FAR = { playerDistance: RULES.standoff, links: 0 };
const NEAR = { playerDistance: RULES.standoff - 1, links: 0 };
const planted = () => advanceRootbinder(createRootbinderState(), RULES.walkTicks + RULES.plantWindupTicks, FAR);
const ally = (id: string, x: number, rootable = true): RootbinderAlly => ({ id, x, y: 0, rootable });

describe("Rootbinder phases", () => {
  it("walks, winds up and plants on exact ticks when the player is far enough", () => {
    let state = createRootbinderState();
    state = advanceRootbinder(state, RULES.walkTicks - 1, FAR);
    expect(state.state).toBe("walk");
    state = advanceRootbinder(state, 1, FAR);
    expect(state).toMatchObject({ state: "plant-windup", stateTick: RULES.walkTicks });
    state = advanceRootbinder(state, RULES.plantWindupTicks - 1, FAR);
    expect(state.state).toBe("plant-windup");
    expect(advanceRootbinder(state, 1, FAR).state).toBe("planted");
  });

  it("keeps walking while the player is close, and plants anyway after the longest walk", () => {
    let state = advanceRootbinder(createRootbinderState(), RULES.maxWalkTicks - 1, NEAR);
    expect(state.state).toBe("walk");
    state = advanceRootbinder(state, 1, NEAR);
    expect(state.state).toBe("plant-windup");
  });

  it("stays planted for as long as it holds a root, and pulls up after standing idle", () => {
    const held = advanceRootbinder(planted(), RULES.idlePlantedTicks * 3, { ...FAR, links: 1 });
    expect(held.state).toBe("planted");
    expect(advanceRootbinder(held, RULES.idlePlantedTicks - 1, FAR).state).toBe("planted");
    expect(advanceRootbinder(held, RULES.idlePlantedTicks, FAR).state).toBe("walk");
  });

  it("is uprooted only while planting or planted, then recovers before it may plant again", () => {
    expect(uprootRootbinder(createRootbinderState()).state).toBe("walk");
    const winding = advanceRootbinder(createRootbinderState(), RULES.walkTicks, FAR);
    expect(uprootRootbinder(winding).state).toBe("uprooted");
    let state = uprootRootbinder(planted());
    expect(state.state).toBe("uprooted");
    expect(uprootRootbinder(state)).toBe(state);
    state = advanceRootbinder(state, RULES.uprootedTicks, FAR);
    expect(state.state).toBe("recover");
    expect(advanceRootbinder(state, RULES.recoverTicks - 1, FAR).state).toBe("recover");
    expect(advanceRootbinder(state, RULES.recoverTicks, FAR).state).toBe("walk");
  });

  it("is the same whether advanced in one call or tick by tick, and rejects a bad tick count", () => {
    let stepped = createRootbinderState();
    for (let tick = 0; tick < 500; tick += 1) stepped = advanceRootbinder(stepped, 1, FAR);
    expect(stepped).toEqual(advanceRootbinder(createRootbinderState(), 500, FAR));
    expect(() => advanceRootbinder(createRootbinderState(), -1, FAR)).toThrow(RangeError);
    expect(() => advanceRootbinder(createRootbinderState(), 0.5, FAR)).toThrow(RangeError);
  });

  it("names the phases in which it stands still and in which it is open, and how far its wind-up is", () => {
    const phases: readonly RootbinderPhase[] = ["walk", "plant-windup", "planted", "uprooted", "recover"];
    expect(phases.filter(rootbinderStandsStill)).toEqual(["plant-windup", "planted", "uprooted"]);
    expect(phases.filter(rootbinderIsOpen)).toEqual(["planted", "uprooted"]);
    const winding = advanceRootbinder(createRootbinderState(), RULES.walkTicks + RULES.plantWindupTicks / 2, FAR);
    expect(rootbinderWindup(winding)).toBe(0.5);
    expect(rootbinderWindup(createRootbinderState())).toBe(0);
    expect(rootbinderWindup(planted())).toBe(0);
  });

  it("gives the player a wind-up long enough to read", () => {
    expect(RULES.plantWindupTicks / RULES.ticksPerSecond).toBeGreaterThanOrEqual(0.45);
  });
});

describe("Rootbinder root targets", () => {
  const source = { x: 0, y: 0 };

  it("takes the nearest rootable allies in reach, up to the free places", () => {
    const allies = [ally("c", 300), ally("a", 100), ally("b", 200), ally("far", RULES.linkReach + 1)];
    expect(chooseRootTargets(source, allies, new Set(), 2).map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(chooseRootTargets(source, allies, new Set(), 9).map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(chooseRootTargets(source, allies, new Set(), 0)).toEqual([]);
  });

  it("skips an ally that cannot be rooted or that a root already holds", () => {
    const allies = [ally("a", 100, false), ally("b", 200), ally("c", 300)];
    expect(chooseRootTargets(source, allies, new Set(["b"]), 2).map((entry) => entry.id)).toEqual(["c"]);
  });

  it("breaks a tie by id, whatever order the allies come in", () => {
    const one = [ally("b", 100), ally("a", -100)];
    const other = [...one].reverse();
    expect(chooseRootTargets(source, one, new Set(), 1).map((entry) => entry.id)).toEqual(["a"]);
    expect(chooseRootTargets(source, other, new Set(), 1).map((entry) => entry.id)).toEqual(["a"]);
  });

  it("makes each root the shared severable root-link, live at once and cut by one hit", () => {
    const link = createRootLink({ id: "r:1", ownerId: "binder", tick: 7, source }, ally("a", 100));
    expect(link).toMatchObject({
      kind: "root-link",
      ownerId: "binder",
      targetId: "a",
      state: "active",
      stateTick: 7,
      integrity: 1,
      cleanupReason: null,
    });
    expect(link.geometry.points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });
});
