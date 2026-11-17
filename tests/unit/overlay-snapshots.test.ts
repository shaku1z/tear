import { describe, expect, it } from "vitest";
import {
  buildReticleSnapshot,
  buildTutorialCardSnapshot,
  buildWaveBannerSnapshot,
} from "../../src/presentation/world/overlay-snapshots";

describe("world overlay snapshots", () => {
  it("normalizes tutorial progress and wave fractions", () => {
    const cut = { context: "LESSON 4 OF 13", title: "CUT", goal: "Land six cuts.", final: false };
    expect(buildTutorialCardSnapshot(cut, ["MOUSE"], [2, 3], 0).progress).toEqual({ current: 2, goal: 3 });
    expect(buildTutorialCardSnapshot({ ...cut, final: true }, [], [2, 3], 0).progress).toBeUndefined();
    expect(buildTutorialCardSnapshot(cut, [], undefined, 0)).toMatchObject({
      context: "LESSON 4 OF 13",
      description: "Land six cuts.",
    });
    expect(
      buildWaveBannerSnapshot({
        remainingSeconds: 1,
        duration: 2,
        bossWave: false,
        wave: 2,
        horde: false,
        hordeColor: "#f00",
        normalColor: "#0ff",
      }).remainingFraction,
    ).toBe(0.5);
  });
  it("derives reticle power from the same velocity thresholds", () => {
    expect(
      buildReticleSnapshot({
        blade: { reticleX: 1, reticleY: 2, state: "held", tipVY: 10 },
        airborne: true,
        playerVerticalSpeed: 10,
        slamMinDownSpeed: 10,
        slamPowerSpeed: 10,
        slamEmpowerAt: 0.5,
        launchMinUpSpeed: 10,
        risingSpeedReference: 10,
        slamColor: "#f00",
        updraftColor: "#0ff",
      }).power,
    ).toBe("slam");
  });
});
