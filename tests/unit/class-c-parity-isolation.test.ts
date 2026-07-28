import { describe, expect, it } from "vitest";

import { TearClassCVisualPolicy, type TearPixelTemporalObservation } from "../../src/agents";
import { compareTearVisualParity, createTearObservationSession } from "../../src/tearbench";

function visiblePixels(kind: TearPixelTemporalObservation["observation"]["kind"]): TearPixelTemporalObservation {
  return {
    observation: {
      kind,
      confidence: 0.9,
      calibration: { bounds: { x: 0, y: 0, width: 1600, height: 900 }, scaleX: 1, scaleY: 1, confidence: 1 },
      brightRegions: [],
      topBandDensity: 0,
      centreBandDensity: 0,
      bottomBandDensity: 0,
    },
    world: { motionEnergy: 0, motionRegions: [] },
    frameDifference: 0,
    stable: true,
    occluded: false,
    trackedFrames: 2,
  };
}

describe("C25 test-only visual parity isolation", () => {
  it("detects a pixel/structured divergence after the Class-C policy has run without oracle reads", () => {
    const classC = createTearObservationSession({
      executionClass: "black-box",
      observationClass: "pixel-only",
      enabled: { pixel: true, "semantic-ui": false, "structured-state": false, events: false },
    });
    const policy = new TearClassCVisualPolicy();

    classC.read("pixel", 41, "classify visible menu before physical input");
    policy.decide(visiblePixels("menu-like"));
    classC.read("pixel", 42, "classify visible frame before physical input");
    const decision = policy.decide(visiblePixels("playing-like"));
    expect(decision.intents).toContainEqual({ device: "keyboard-mouse", type: "key", code: "KeyD", phase: "down" });
    expect(classC.records()).toEqual([
      { channel: "pixel", tick: 41, purpose: "classify visible menu before physical input" },
      { channel: "pixel", tick: 42, purpose: "classify visible frame before physical input" },
    ]);

    // This is an engineering-only observer gathered *after* the policy decision.
    // It represents a stale structured report, so parity must fail rather than
    // silently correcting the pixel-only policy with an oracle answer.
    const engineering = createTearObservationSession({
      executionClass: "engineering",
      observationClass: "structured-state",
      enabled: { pixel: false, "semantic-ui": true, "structured-state": true, events: true },
    });
    engineering.read("semantic-ui", 42, "test-only semantic surface comparison");
    engineering.read("structured-state", 42, "test-only runtime state comparison");
    const parity = compareTearVisualParity({
      name: "stale-structured-report",
      pixel: { screen: "playing", controls: ["combat-surface"], confidence: 0.9 },
      semanticUi: { screen: "menu", controls: ["start-run"] },
      structured: { screen: "menu", controls: ["start-run"] },
    });

    expect(parity).toEqual({
      name: "stale-structured-report",
      passed: false,
      mismatches: ["semantic-ui.screen", "semantic-ui.controls", "structured-state.screen", "structured-state.controls"],
    });
    expect(engineering.records()).toHaveLength(2);
    expect(() => {
      classC.read("structured-state", 43, "attempt to repair policy with state");
    }).toThrow("disabled observation channel");
    expect(classC.records()).toEqual([
      { channel: "pixel", tick: 41, purpose: "classify visible menu before physical input" },
      { channel: "pixel", tick: 42, purpose: "classify visible frame before physical input" },
    ]);
  });
});
