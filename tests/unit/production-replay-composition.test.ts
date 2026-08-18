import { describe, expect, it, vi } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { createCampaignChapterBindingSpec, stageCampaignChapterBinding } from "../../src/gameplay/campaign/chapter-cinematic-binding";
import type { CampaignChapterTiming } from "../../src/gameplay/campaign/chapter-controller";
import { CinematicTimeline } from "../../src/gameplay/runtime/cinematic-director";
import { stageAt } from "../../src/gameplay/stages";
import { createProductionReplayWorld, restoreProductionReplayChapterBinding } from "../../src/tearbench";

const timing: CampaignChapterTiming = Object.freeze({
  loreReveal: 0.1, chapterIn: 0.2, loreExit: 0.3, biomeRevealBrief: 0.4,
  biomeRevealFull: 0.5, readyBrief: 0.6, readyFull: 0.7,
  dialogueDuck: 0.8, biomeRevealDuck: 0.9,
});

describe("production replay composition", () => {
  it("restores an active data-bound chapter and activates its prepared wave", () => {
    const replay = createProductionReplayWorld({ seed: "production-replay-chapter", mode: "campaign" });
    const spec = createCampaignChapterBindingSpec({ stageIndex: 0, priorOutro: null,
      brief: false, prologueShownBefore: false, timing });
    const staged = stageCampaignChapterBinding(spec, stageAt(0), {
      dispatch: vi.fn(), preparedWave: () => true, activationDeferred: () => true, clear: vi.fn(),
    });
    const source = new CinematicTimeline.Director(CONFIG);
    source.start(staged.binding.script, staged.binding.context);

    restoreProductionReplayChapterBinding(replay, {
      chapterBinding: spec,
      cinema: source.captureState(),
      lifecycle: { phase: "wave-prepared", sessionId: "production-replay-session", wave: 1,
        bossWave: false, activationDeferred: true, reward: null, outcome: null, revision: 2 },
    });
    expect(replay.world.lifecycle.snapshot()).toMatchObject({ phase: "wave-prepared", activationDeferred: true });
    expect(replay.world.context.cinema).toMatchObject({ active: true, blocksCombat: true });

    replay.world.context.cinema.complete();

    expect(replay.world.state.run()).toMatchObject({ chapterState: "WAVE_LIVE" });
    expect(replay.world.lifecycle.snapshot()).toMatchObject({ phase: "wave-active", activationDeferred: false });
  });
});
