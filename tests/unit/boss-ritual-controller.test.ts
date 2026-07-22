import { describe, expect, it } from "vitest";

import {
  BossRitualController,
  type BossRitualActor,
  type BossRitualOptions,
  type BossRitualPlatform,
} from "../../src/gameplay/entities/boss-ritual-controller";

function actor(): BossRitualActor {
  return {
    color: "#fff", bossName: "Aldric", bossId: "warden", facing: 1,
    x: 100, y: 50, vx: 4, vy: -3, cinematicT: 0,
    cinematicPose: "aldricCrownfall", cinematicColor: "#0ff", cinematicRequest: { pending: true },
    crown: { x: 120, y: 80, rot: 0.25, vx: 8, vy: 4, state: "worn" },
  };
}

function options(platforms: readonly BossRitualPlatform[] = []): BossRitualOptions {
  return { platforms, groundY: 500, bomberColor: "#f06", dialogueDuck: 0.35, brief: false };
}

describe("BossRitualController", () => {
  it("builds the authored timing sequence and initializes combat-safe state", () => {
    const controller = new BossRitualController();
    const owner = actor();
    const started = controller.begin(owner, {
      id: "aldric-crownfall", pose: "aldricCrownfall", crownFall: true,
      sfx: "transform", line: "The crown decides.",
    }, options());

    expect(owner.cinematicRequest).toBeNull();
    expect(started.sequence.beats.map(({ id, duration }) => [id, duration])).toEqual([
      ["anticipation", 0.34], ["reveal", 0.78], ["declaration", undefined],
      ["resolve", 0.86], ["grace", 0.45],
    ]);
    expect(controller.start(started.context, options())).toEqual([
      { type: "clear-boss-projectiles" },
      { type: "music-duck", amount: 0.35, duration: 0.18 },
      { type: "sound", cue: "transform" },
    ]);
    expect(owner.vx).toBe(0);
    expect(owner.vy).toBe(0);
  });

  it("lands the crown on the nearest authored platform and fractures it once", () => {
    const controller = new BossRitualController();
    const owner = actor();
    const platform: BossRitualPlatform = { x: 80, y: 220, w: 160, floor: true, arenaPlatId: "center" };
    const configured = options([platform]);
    const started = controller.begin(owner, {
      id: "aldric-crownfall", pose: "aldricCrownfall", crownFall: true,
    }, configured);

    controller.start(started.context, configured);
    const impact = controller.updateBeat(started.context, "reveal", 0.78, 1, 0, false);

    expect(owner.crown).toMatchObject({ x: 162, y: 210, state: "fallen", restPlatform: platform });
    expect(platform.arenaFractureRequest).toEqual({ reason: "crownfall", color: "#f06" });
    expect(impact).toEqual([{ type: "sound", cue: "aldricCrownFall" }]);
    expect(controller.updateBeat(started.context, "declaration", 0, 0, 1, false)).toEqual([]);
  });

  it("preserves completion side effects and resets cinematic presentation", () => {
    const controller = new BossRitualController();
    const owner = actor();
    const configured = options();
    const started = controller.begin(owner, {
      id: "warden-break", pose: "wardenBreak", after: "throwShield", firstVertical: true,
    }, configured);

    controller.start(started.context, configured);
    expect(controller.enterBeat(started.context, "declaration")).toEqual([{ type: "sound", cue: "warden" }]);
    expect(controller.complete(started.context, false)).toEqual([
      { type: "throw-shield" }, { type: "resolve-first-vertical" },
      { type: "store-seen", key: "tear.cinematic.warden-break" },
      { type: "music-duck", amount: 1, duration: 0.55 },
    ]);
    expect(owner).toMatchObject({ cinematicPose: null, cinematicColor: null, cinematicT: 0 });
  });

  it("snaps crown motion under reduced motion and restores audio on cancellation", () => {
    const controller = new BossRitualController();
    const owner = actor();
    const configured = options();
    const started = controller.begin(owner, { id: "crown", crownFall: true }, configured);
    controller.start(started.context, configured);

    controller.updateBeat(started.context, "reveal", 0.3, 0.5, 0, true);
    expect(owner.crown).toMatchObject({ x: 120, y: 80, state: "airborne" });
    expect(controller.cancel(started.context)).toEqual([{ type: "music-duck", amount: 1, duration: 0.25 }]);
    expect(owner.cinematicT).toBe(0);
  });
});
