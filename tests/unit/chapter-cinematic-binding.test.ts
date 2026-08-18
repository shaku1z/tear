import { describe, expect, it, vi } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import {
  captureCampaignChapterBindingSpec,
  createCampaignChapterBindingSpec,
  parseCampaignChapterBindingSpec,
  stageCampaignChapterBinding,
} from "../../src/gameplay/campaign/chapter-cinematic-binding";
import type { CampaignChapterTiming, CampaignStage } from
  "../../src/gameplay/campaign/chapter-controller";
import { CinematicTimeline } from "../../src/gameplay/runtime/cinematic-director";

const timing: CampaignChapterTiming = Object.freeze({
  loreReveal: 0.1, chapterIn: 0.2, loreExit: 0.3, biomeRevealBrief: 0.4,
  biomeRevealFull: 0.5, readyBrief: 0.6, readyFull: 0.7,
  dialogueDuck: 0.8, biomeRevealDuck: 0.9,
});

const stage: CampaignStage = Object.freeze({
  name: "The Verge", blurb: "Descend.", accent: "#abcdef",
  chapter: Object.freeze({
    number: 1, symbol: "I", title: "First Cut", intro: "The Tear opens.",
    pages: Object.freeze([{ label: "THE VERGE", text: "Keep moving." }]),
  }),
});

function spec() {
  return createCampaignChapterBindingSpec({
    stageIndex: 0, priorOutro: null, brief: false, prologueShownBefore: false, timing,
  });
}

describe("portable campaign chapter binding", () => {
  it("rebuilds the same script and silently restores an active director position", () => {
    const dispatch = vi.fn();
    const staged = stageCampaignChapterBinding(spec(), stage, {
      dispatch, preparedWave: () => true, activationDeferred: () => true, clear: vi.fn(),
    });
    const source = new CinematicTimeline.Director(CONFIG);
    source.start(staged.binding.script, staged.binding.context);
    source.update(0.05);
    const snapshot = source.captureState();
    dispatch.mockClear();

    const reconstructed = stageCampaignChapterBinding(
      captureCampaignChapterBindingSpec(staged.spec, staged.flow), stage,
      { dispatch, preparedWave: () => true, activationDeferred: () => true, clear: vi.fn() },
    );
    const restored = new CinematicTimeline.Director(CONFIG);
    restored.restoreState(snapshot, reconstructed.binding);

    expect(dispatch).not.toHaveBeenCalled();
    expect(restored.captureState()).toEqual(snapshot);
    expect(reconstructed.binding.script.revision).toMatch(/^tear\.campaign-chapter-binding\.v1:[0-9a-f]{16}$/);
  });

  it("round-trips flow position without serializing callbacks", () => {
    const staged = stageCampaignChapterBinding(spec(), stage, {
      dispatch: vi.fn(), preparedWave: () => true, activationDeferred: () => true, clear: vi.fn(),
    });
    staged.controller.enterBeat("page-2");
    const parsed = parseCampaignChapterBindingSpec(captureCampaignChapterBindingSpec(staged.spec, staged.flow));

    expect(parsed).toMatchObject({ flowState: "LORE_READ", page: 2, stageIndex: 0 });
    expect(JSON.stringify(parsed)).not.toContain("function");
  });

  it("continues through injected intents and clears the binding exactly once", () => {
    const dispatch = vi.fn(); const clear = vi.fn();
    const reconstructed = stageCampaignChapterBinding(spec(), stage, {
      dispatch, preparedWave: () => true, activationDeferred: () => true, clear,
    });
    const source = new CinematicTimeline.Director(CONFIG);
    source.start(reconstructed.binding.script, reconstructed.binding.context);
    const restored = new CinematicTimeline.Director(CONFIG);
    dispatch.mockClear();
    restored.restoreState(source.captureState(), reconstructed.binding);

    expect(restored.skipTo("reveal")).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ type: "chapter-state", state: "BIOME_REVEAL" }),
    ]));
    restored.complete();
    expect(dispatch).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ type: "activate-prepared-wave" }),
    ]));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed timing and impossible reconstructed page positions", () => {
    expect(() => parseCampaignChapterBindingSpec({ ...spec(), timing: { ...timing, loreReveal: -1 } }))
      .toThrow(/timing loreReveal/);
    expect(() => stageCampaignChapterBinding({ ...spec(), flowState: "LORE_READ", page: 999 }, stage, {
      dispatch: vi.fn(), preparedWave: () => true, activationDeferred: () => true, clear: vi.fn(),
    })).toThrow(/page is outside/);
  });

  it("rejects a same-id chapter whose reconstructed content changed", () => {
    const original = stageCampaignChapterBinding(spec(), stage, {
      dispatch: vi.fn(), preparedWave: () => true, activationDeferred: () => true, clear: vi.fn(),
    });
    const source = new CinematicTimeline.Director(CONFIG);
    source.start(original.binding.script, original.binding.context);
    const changedStage: CampaignStage = { ...stage, chapter: { ...stage.chapter,
      pages: [{ label: "THE VERGE", text: "Changed content." }] } };
    const changed = stageCampaignChapterBinding(spec(), changedStage, {
      dispatch: vi.fn(), preparedWave: () => true, activationDeferred: () => true, clear: vi.fn(),
    });
    expect(() => { new CinematicTimeline.Director(CONFIG).restoreState(source.captureState(), changed.binding); })
      .toThrow(/script chapter-0 is unavailable/);
  });
});
