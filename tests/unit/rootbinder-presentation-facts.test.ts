import { describe, expect, it } from "vitest";
import {
  ROOTBINDER_RULES,
  advanceRootbinder,
  createRootLink,
  createRootbinderState,
  uprootRootbinder,
} from "../../src/gameplay/entities/rootbinder-runtime";
import { projectRootbinderPresentation } from "../../src/gameplay/environment/rootbinder-presentation-facts";

const FAR = { playerDistance: ROOTBINDER_RULES.standoff, links: 0 };
const at = { x: 400, y: 600 };
const root = (id: string, x: number) =>
  createRootLink({ id, ownerId: "binder", tick: 0, source: at }, { id: `ally:${id}`, x, y: 600, rootable: true });

describe("Rootbinder presentation facts", () => {
  it("draws the Rootbinder where it stands now, with one line per live root", () => {
    const state = advanceRootbinder(
      createRootbinderState(),
      ROOTBINDER_RULES.walkTicks + ROOTBINDER_RULES.plantWindupTicks,
      FAR,
    );
    const cut = { ...root("b", 600), state: "destroyed" as const };
    const facts = projectRootbinderPresentation({ ...at, state }, [root("a", 500), cut]);
    expect(facts.sourceNode).toEqual({ x: 400, y: 600, color: "gold" });
    expect(facts).toMatchObject({ planted: true, windup: 0, uprooted: false });
    expect(facts.roots).toHaveLength(1);
    expect(facts.roots[0]?.points?.[1]).toEqual({ x: 500, y: 600 });
  });

  it("shows the wind-up as a warning that grows, and the uprooted stun", () => {
    const walking = createRootbinderState();
    expect(projectRootbinderPresentation({ ...at, state: walking }, [])).toMatchObject({ planted: false, windup: 0 });
    const winding = advanceRootbinder(walking, ROOTBINDER_RULES.walkTicks + ROOTBINDER_RULES.plantWindupTicks / 2, FAR);
    expect(projectRootbinderPresentation({ ...at, state: winding }, [])).toMatchObject({ planted: true, windup: 0.5 });
    const uprooted = uprootRootbinder(winding);
    expect(projectRootbinderPresentation({ ...at, state: uprooted }, [])).toMatchObject({
      planted: true,
      windup: 0,
      uprooted: true,
    });
  });

  it("keeps every gameplay mark under the accessibility settings", () => {
    const state = advanceRootbinder(createRootbinderState(), ROOTBINDER_RULES.walkTicks + 1, FAR);
    const plain = projectRootbinderPresentation({ ...at, state }, [root("a", 500)]);
    const adjusted = projectRootbinderPresentation({ ...at, state }, [root("a", 500)], {
      highContrast: true,
      reducedMotion: true,
      lowGraphics: true,
      audioEnabled: false,
    });
    expect(adjusted).toMatchObject({ highContrast: true, lowGraphics: true, motionScale: 0, audioEnabled: false });
    expect(adjusted.roots).toEqual(plain.roots);
    expect(adjusted.windup).toBe(plain.windup);
  });
});
