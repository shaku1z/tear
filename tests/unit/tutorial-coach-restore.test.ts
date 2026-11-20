import { describe, expect, it, vi } from "vitest";
import { CONFIG } from "../../src/config/game-config";
import binding from "../../src/gameplay/training/tutorial-gold-binding.json";
import { loadTutorialGoldCorpus, type TutorialGoldCorpus } from "../../src/gameplay/training/tutorial-gold-reference";
import { TutorialGhostCoach, type TutorialCoachCheckpoint } from "../../src/gameplay/training/tutorial-ghost-coach";
import { loadShippingTutorialGold } from "../../src/gameplay/training/tutorial-gold-shipping";
import committedGold from "../support/tutorial-gold-data-from-disk";

// The game's copy comes through its own loader; the bundler's transform of the JSON is skipped (see the helper).
vi.mock(
  "../../src/gameplay/training/tutorial-gold-reference-data.json",
  () => import("../support/tutorial-gold-data-from-disk"),
);

// The game's copy of the corpus arrives after a lesson starts (tutorial-gold-shipping.ts). This file
// decodes its own copy only to make a real saved coach state; the game's copy stays unloaded until the
// test asks for it.
const own = loadTutorialGoldCorpus(committedGold, binding);
if (own.status !== "ready") throw new Error("committed tutorial gold did not load");
const corpus: TutorialGoldCorpus = own.corpus;

/** A coach state saved mid-demonstration in a game where the corpus had arrived. */
function savedMidDemonstration(lesson: string): TutorialCoachCheckpoint {
  const coach = new TutorialGhostCoach(
    () => corpus,
    CONFIG.blade.minHitSpeed,
    () => true,
  );
  coach.select(lesson, 2);
  expect(coach.play("preview")).toBe(true);
  const reference = corpus.references.find((entry) => entry.lessonId === lesson && entry.curriculumVersion === 2);
  const frame = reference?.frames[0];
  if (!frame) throw new Error(`no ${lesson} reference`);
  const idle = { tick: 0, moveX: 0, moveY: 0, aimTurn: 0, primaryHeld: false };
  for (let tick = 0; tick < 30; tick += 1) coach.observe({ ...frame, tick }, idle, false);
  const saved = coach.capture();
  if (!saved) throw new Error("coach saved nothing");
  return saved;
}

describe("restoring a saved coach state before the demonstrations arrive", () => {
  it("accepts it, keeps it through a capture, and shows it once they arrive", async () => {
    const saved = savedMidDemonstration("move");
    expect(saved).toMatchObject({ visible: true, mode: "preview" });
    const stale = savedMidDemonstration("jump");

    // State Setup restores a whole world at once, the coach included, before any tick has fetched
    // the demonstrations.
    const coach = new TutorialGhostCoach(undefined, CONFIG.blade.minHitSpeed);
    coach.select("move", 2);
    expect(() => {
      coach.restore(saved);
    }).not.toThrow();
    expect(coach.capture()).toEqual(saved);
    expect(coach.view(false, false)).toMatchObject({ available: false, visible: false });
    // A coach whose lesson changes before they arrive drops the state saved for the old lesson.
    const moved = new TutorialGhostCoach(undefined, CONFIG.blade.minHitSpeed);
    moved.select("jump", 2);
    moved.restore(stale);
    moved.select("dash", 2);

    expect(await loadShippingTutorialGold()).toBeDefined();
    coach.select("move", 2);
    expect(coach.capture()).toEqual(saved);
    expect(coach.view(false, false)).toMatchObject({
      available: true,
      visible: true,
      mode: "preview",
      tick: Math.floor(saved.cursor),
      fromTick: saved.from,
      toTick: saved.to,
    });
    moved.select("dash", 2);
    expect(moved.capture()?.reference).not.toBe(stale.reference);
    expect(moved.view(false, false).visible).toBe(false);

    // Once they have arrived, a state saved for another reference is still refused, as before.
    const strict = new TutorialGhostCoach(undefined, CONFIG.blade.minHitSpeed);
    strict.select("dash", 2);
    expect(() => {
      strict.restore(saved);
    }).toThrow("Gold coach reference incompatible");
  });
});
