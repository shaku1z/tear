import { describe, expect, it, vi } from "vitest";

import { createCampaignChapterBindingSpec, stageCampaignChapterBinding } from
  "../../src/gameplay/campaign/chapter-cinematic-binding";
import type { CampaignChapterTiming } from "../../src/gameplay/campaign/chapter-controller";
import { CinematicTimeline } from "../../src/gameplay/runtime/cinematic-director";
import { stageAt } from "../../src/gameplay/stages";
import { createDetachedWorld, restoreDetachedChapterBinding } from "./detached-world-harness";

const timing: CampaignChapterTiming = Object.freeze({
  loreReveal: 0.1, chapterIn: 0.2, loreExit: 0.3, biomeRevealBrief: 0.4,
  biomeRevealFull: 0.5, readyBrief: 0.6, readyFull: 0.7,
  dialogueDuck: 0.8, biomeRevealDuck: 0.9,
});

describe("detached campaign binding", () => {
  it("restores lifecycle and activates the prepared wave when the chapter completes", () => {
    const detached = createDetachedWorld({ seed: "detached-chapter", mode: "campaign" });
    const spec = createCampaignChapterBindingSpec({ stageIndex: 0, priorOutro: null,
      brief: false, prologueShownBefore: false, timing });
    const staged = stageCampaignChapterBinding(spec, stageAt(0), {
      dispatch: vi.fn(), preparedWave: () => true, activationDeferred: () => true, clear: vi.fn(),
    });
    const source = new CinematicTimeline.Director();
    source.start(staged.binding.script, staged.binding.context);

    restoreDetachedChapterBinding(detached, {
      chapterBinding: spec,
      cinema: source.captureState(),
      lifecycle: { phase: "wave-prepared", sessionId: "detached-session", wave: 1,
        bossWave: false, activationDeferred: true, reward: null, outcome: null, revision: 2 },
    });
    expect(detached.world.lifecycle.snapshot()).toMatchObject({ phase: "wave-prepared", activationDeferred: true });
    expect(detached.world.context.cinema).toMatchObject({ active: true, blocksCombat: true });

    detached.world.context.cinema.complete();

    expect((detached.world.state.run() as never as { chapterState: string }).chapterState).toBe("WAVE_LIVE");
    expect(detached.world.lifecycle.snapshot()).toMatchObject({ phase: "wave-active", activationDeferred: false });
  });
});
