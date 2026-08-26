import { describe, expect, it, vi } from "vitest";

import { CONFIG } from "../../src/config/game-config";
import { createCampaignChapterBindingSpec, stageCampaignChapterBinding } from "../../src/gameplay/campaign/chapter-cinematic-binding";
import type { CampaignChapterTiming } from "../../src/gameplay/campaign/chapter-controller";
import { CinematicTimeline } from "../../src/gameplay/runtime/cinematic-director";
import { stageAt } from "../../src/gameplay/stages";
import { captureProductionReplayCheckpoint, createProductionGhostReplayComposition, createProductionReplayWorld, environmentHash, environmentSnapshotToObservation, restoreProductionReplayChapterBinding, restoreProductionReplaySnapshot } from "../../src/tearbench";

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

  it("rebases non-empty foreign environment state and rejects malformed post-rebase state atomically", () => {
    const composition = createProductionGhostReplayComposition({ seed: "production-replay-environment" });
    const source = composition.create(undefined);
    source.replay.world.context.environment.setStage("grounds", "restore");
    source.replay.world.context.environment.addField({ kind: "bloom-well", geometry: { x: 10, y: 20, radius: 25 }, state: "active", stateTick: 3, timer: 0.25, ownerId: null, schedule: null, eligibility: { player: true, enemies: true, bosses: false }, force: null, cleanupReason: null });
    const checkpoint = captureProductionReplayCheckpoint(source.replay, source.combat, source.waveReward, "environment-rollback");
    const sourceEnvironment = source.replay.world.context.environment.snapshot();
    const sourceWorldId = sourceEnvironment.worldId ?? "source-world";
    const foreignWorldId = "foreign-world";
    const hazard = checkpoint.snapshot.state["tear.hazard.v1"] as Readonly<Record<string, unknown>>;
    const foreignFields = (hazard.fields as readonly Readonly<Record<string, unknown>>[]).map((field) => ({ ...field, id: String(field.id).replace(sourceWorldId, foreignWorldId) }));
    const foreignSnapshot = {
      ...checkpoint.snapshot,
      state: Object.freeze({ ...checkpoint.snapshot.state, "tear.hazard.v1": Object.freeze({ ...hazard, worldId: foreignWorldId, fields: foreignFields }) }),
    };
    const target = createProductionReplayWorld({ seed: "production-replay-environment-target", mode: "campaign" });
    restoreProductionReplaySnapshot(target, foreignSnapshot);
    const targetEnvironment = target.world.context.environment.snapshot();
    expect(targetEnvironment.fields).toHaveLength(1);
    expect(environmentHash(targetEnvironment)).toBe(environmentHash(sourceEnvironment));
    expect(environmentSnapshotToObservation(targetEnvironment)).toEqual(environmentSnapshotToObservation(sourceEnvironment));

    const targetBeforeMalformed = target.world.context.environment.snapshot();
    const destinationWorldId = targetBeforeMalformed.worldId;
    if (destinationWorldId === undefined) throw new Error("production replay environment world ID is required");
    const malformedFields = [foreignFields[0], { ...foreignFields[0], id: `${destinationWorldId}:field:1` }];
    const malformed = {
      ...foreignSnapshot,
      state: Object.freeze({ ...foreignSnapshot.state, "tear.hazard.v1": Object.freeze({ ...hazard, worldId: foreignWorldId, fields: malformedFields }) }),
    };
    expect(() => restoreProductionReplaySnapshot(target, malformed)).toThrow(/after rebase|duplicate/u);
    expect(target.world.context.environment.snapshot()).toEqual(targetBeforeMalformed);
  });
});
