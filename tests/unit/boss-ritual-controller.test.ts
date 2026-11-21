import { describe, expect, it } from "vitest";

import {
  BossRitualController,
  type BossRitualActor,
  type BossRitualOptions,
} from "../../src/gameplay/entities/boss-ritual-controller";

function actor(): BossRitualActor {
  return {
    color: "#fff",
    bossName: "Rootbound",
    bossId: "rootbound",
    facing: 1,
    x: 100,
    y: 50,
    vx: 4,
    vy: -3,
    cinematicT: 0,
    cinematicPose: "rootboundGraft",
    cinematicColor: "#0ff",
    cinematicRequest: { pending: true },
  };
}

function options(): BossRitualOptions {
  return { platforms: [], groundY: 500, bomberColor: "#f06", dialogueDuck: 0.35, brief: false };
}

describe("BossRitualController", () => {
  it("builds the authored timing sequence and initializes combat-safe state", () => {
    const controller = new BossRitualController();
    const owner = actor();
    const started = controller.begin(
      owner,
      { id: "rootbound-garden-remembers", pose: "rootboundGraft", sfx: "slam", line: "Stay." },
      options(),
    );

    expect(owner.cinematicRequest).toBeNull();
    expect(started.sequence.beats.map(({ id, duration }) => [id, duration])).toEqual([
      ["anticipation", 0.32],
      ["reveal", 0.7],
      ["declaration", undefined],
      ["resolve", 0.66],
      ["grace", 0.45],
    ]);
    expect(controller.start(started.context, options())).toEqual([
      { type: "clear-boss-projectiles" },
      { type: "music-duck", amount: 0.35, duration: 0.18 },
      { type: "sound", cue: "slam" },
    ]);
    expect(owner.vx).toBe(0);
    expect(owner.vy).toBe(0);
  });

  it("advances the pose through its beats without side effects", () => {
    const controller = new BossRitualController();
    const owner = actor();
    const configured = options();
    const started = controller.begin(owner, { id: "rootbound-garden-remembers", pose: "rootboundGraft" }, configured);
    controller.start(started.context, configured);

    expect(controller.updateBeat(started.context, "anticipation", 0.32, 1, 0)).toEqual([]);
    expect(owner.cinematicT).toBeCloseTo(0.22);
    expect(controller.updateBeat(started.context, "reveal", 0.7, 1, 0)).toEqual([]);
    expect(owner.cinematicT).toBeCloseTo(0.82);
    expect(controller.updateBeat(started.context, "resolve", 0, 1, 0)).toEqual([]);
    expect(owner.cinematicT).toBeCloseTo(1);
  });

  it("preserves completion side effects and resets cinematic presentation", () => {
    const controller = new BossRitualController();
    const owner = actor();
    const configured = options();
    const started = controller.begin(owner, { id: "rootbound-garden-remembers", pose: "rootboundGraft" }, configured);

    controller.start(started.context, configured);
    expect(controller.enterBeat(started.context, "declaration")).toEqual([{ type: "sound", cue: "rootbound" }]);
    expect(controller.complete(started.context)).toEqual([
      { type: "store-seen", key: "tear.cinematic.rootbound-garden-remembers" },
      { type: "music-duck", amount: 1, duration: 0.55 },
    ]);
    expect(owner).toMatchObject({ cinematicPose: null, cinematicColor: null, cinematicT: 0 });
  });

  it("restores audio on cancellation", () => {
    const controller = new BossRitualController();
    const owner = actor();
    const configured = options();
    const started = controller.begin(owner, { id: "rootbound-garden-remembers", pose: "rootboundGraft" }, configured);
    controller.start(started.context, configured);

    expect(controller.cancel(started.context)).toEqual([{ type: "music-duck", amount: 1, duration: 0.25 }]);
    expect(owner.cinematicT).toBe(0);
  });
});
