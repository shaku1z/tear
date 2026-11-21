import { describe, expect, it, vi } from "vitest";
import binding from "../../src/gameplay/training/tutorial-gold-binding.json";
import type { LiveTutorialRuntime } from "../../src/gameplay/training/live-tutorial-runtime";
import { createLiveTrainingHost, type LiveTrainingHostContext } from "../../src/app/training/training-host";
import { createTrainingCallouts } from "../../src/app/training/training-coach";
import {
  loadShippingTutorialGold,
  shippingTutorialGold,
  shippingTutorialGoldStatus,
} from "../../src/gameplay/training/tutorial-gold-shipping";
import { generateTutorialGold } from "../../src/tearbench/tutorial-gold-generation";

// Every fetch of the corpus fails in this file, as it does for a player who loses the connection.
vi.mock("../../src/gameplay/training/tutorial-gold-reference-data.json", () => {
  throw new TypeError("Failed to fetch dynamically imported module");
});
// The host's training code, without the rest of the game: only what the tutorial start touches.
const tutorial = { start: vi.fn(), update: vi.fn(), openPractice: vi.fn(() => true), bindBossPractice: vi.fn() };
vi.mock("../../src/app/training/training-host-runtime", () => ({
  createLiveTrainingHostRuntime: () => ({ tutorial: tutorial as unknown as LiveTutorialRuntime }),
}));

describe("the tutorial without its demonstration corpus", () => {
  it("starts the tutorial before the corpus is asked for, and asks for it once the lesson is played", async () => {
    const host = createLiveTrainingHost({
      dependencies: { tutorialCompletionPersistence: undefined },
      state: { player: () => undefined },
      callouts: createTrainingCallouts(),
    } as unknown as LiveTrainingHostContext);
    const statusAtStart: string[] = [];
    await host.startTutorial(() => {
      statusAtStart.push(shippingTutorialGoldStatus());
    });
    expect(statusAtStart).toEqual(["idle"]);
    expect(shippingTutorialGoldStatus()).toBe("idle");

    host.tutorial.update(1 / 120);
    expect(shippingTutorialGoldStatus()).toBe("loading");
    expect(tutorial.update).toHaveBeenCalledOnce();
    expect(await loadShippingTutorialGold()).toBeUndefined();
    expect(shippingTutorialGoldStatus()).toBe("failed");
    expect(shippingTutorialGold()).toBeUndefined();

    // A failed load is not asked for again every tick; the next session asks once more.
    host.tutorial.update(1 / 120);
    expect(shippingTutorialGoldStatus()).toBe("failed");
    await host.startTutorial(() => undefined);
    host.tutorial.update(1 / 120);
    expect(shippingTutorialGoldStatus()).toBe("loading");
    await loadShippingTutorialGold();
  });

  it("still lets every lesson complete, playing exactly as it does with the corpus", () => {
    expect(shippingTutorialGold()).toBeUndefined();
    // Drives all thirteen lessons and the legacy Field Test through production physics; it throws
    // unless every one reaches its objective. The same play makes the same gold as the committed one.
    const generated = generateTutorialGold();
    expect(generated.corpus.references).toHaveLength(14);
    expect(generated.binding).toEqual(binding);
    // The same full-course drive as the gold test in tutorial-production-ghost.test.ts, with its time limit.
  }, 120000);
});
