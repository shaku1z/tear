import { describe, expect, it } from "vitest";

import { TearClassCVisualPolicy, type TearPixelTemporalObservation } from "../../src/agents";

function observation(kind: TearPixelTemporalObservation["observation"]["kind"], confidence = 0.9): TearPixelTemporalObservation {
  return {
    observation: {
      kind, confidence,
      calibration: { bounds: { x: 0, y: 0, width: 1600, height: 900 }, scaleX: 1, scaleY: 1, confidence: 1 },
      brightRegions: [], topBandDensity: 0, centreBandDensity: 0, bottomBandDensity: 0,
    },
    world: { motionEnergy: 0, motionRegions: [] }, frameDifference: 0, stable: true, occluded: false, trackedFrames: 2,
  };
}

describe("C25 Class-C visual policy", () => {
  it("accepts only pixel observations and emits literal browser-valid gestures", () => {
    const policy = new TearClassCVisualPolicy();
    const open = policy.decide(observation("menu-like"));
    expect(open).toMatchObject({ stage: "opening-menu", reason: "visible-menu-primary-affordance" });
    expect(open.intents).toEqual(expect.arrayContaining([
      { device: "keyboard-mouse", type: "pointer", x: 260, y: 360, button: 0, phase: "down" },
    ]));
    const firstSetup = policy.decide(observation("setup-like"));
    expect(firstSetup.intents).toContainEqual({ device: "keyboard-mouse", type: "pointer", x: 430, y: 195, button: 0, phase: "down" });
    const combat = policy.decide(observation("playing-like"));
    expect(combat.intents).toContainEqual({ device: "keyboard-mouse", type: "key", code: "KeyD", phase: "down" });
    expect(combat.intents).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: "action" })]));
  });

  it("does not guess through an occluded or low-confidence frame", () => {
    const policy = new TearClassCVisualPolicy();
    expect(policy.decide({ ...observation("menu-like", 0.3), occluded: true })).toMatchObject({
      reason: "visual-surface-occluded-or-low-confidence", intents: [], stage: "boot",
    });
  });

  it("can emit player-valid touch rather than pretending a touch tap is a mouse click", () => {
    const policy = new TearClassCVisualPolicy("touch");
    expect(policy.decide(observation("menu-like")).intents).toEqual([
      { device: "touch", type: "touch", x: 260, y: 360, identifier: 1, phase: "start" },
      { device: "touch", type: "touch", x: 260, y: 360, identifier: 1, phase: "end" },
    ]);
  });

  it("uses a visible terminal action stack for touch menu return and refuses an unseen stack", () => {
    const policy = new TearClassCVisualPolicy("touch");
    policy.decide(observation("menu-like"));
    policy.decide(observation("playing-like"));
    expect(policy.decide(observation("terminal-like"))).toMatchObject({ reason: "visible-terminal-awaiting-touch-return-affordance", intents: [] });
    const terminal = policy.decide({
      ...observation("terminal-like"),
      observation: { ...observation("terminal-like").observation, brightRegions: [{ x: 80, y: 328, width: 286, height: 50, density: 0.08, confidence: 1 }] },
    });
    expect(terminal).toMatchObject({ stage: "returning-menu", reason: "visible-terminal-touch-menu-affordance" });
    expect(terminal.intents).toEqual([
      { device: "touch", type: "touch", x: 223, y: 418, identifier: 1, phase: "start" },
      { device: "touch", type: "touch", x: 223, y: 418, identifier: 1, phase: "end" },
    ]);
  });

  it("aims from a detected moving image region instead of an entity or state ID", () => {
    const policy = new TearClassCVisualPolicy();
    policy.decide(observation("menu-like"));
    const playing = observation("playing-like");
    const decision = policy.decide({
      ...playing,
      world: { motionEnergy: 0.3, motionRegions: [{ x: 300, y: 300, width: 100, height: 80, density: 0.8, confidence: 0.9 }] },
    });
    expect(decision.intents).toContainEqual({ device: "keyboard-mouse", type: "pointer", x: 350, y: 340, button: 0, phase: "move" });
  });

  it("selects a visible card frame and returns from a visible terminal by physical keyboard navigation", () => {
    const policy = new TearClassCVisualPolicy();
    policy.decide(observation("menu-like"));
    policy.decide(observation("playing-like"));
    const draft = policy.decide({
      ...observation("draft-like"),
      observation: { ...observation("draft-like").observation, brightRegions: [{ x: 160, y: 240, width: 280, height: 390, density: 0.05, confidence: 1 }] },
    });
    expect(draft).toMatchObject({ stage: "selecting-reward", reason: "visible-draft-like-affordance" });
    expect(draft.intents).toEqual([
      { device: "keyboard-mouse", type: "key", code: "Digit1", phase: "down" },
      { device: "keyboard-mouse", type: "key", code: "Digit1", phase: "up" },
    ]);
    const terminal = policy.decide(observation("terminal-like"));
    expect(terminal).toMatchObject({ stage: "returning-menu", reason: "visible-terminal-keyboard-menu-navigation" });
    expect(terminal.intents).toEqual(expect.arrayContaining([
      { device: "keyboard-mouse", type: "key", code: "ArrowDown", phase: "down" },
      { device: "keyboard-mouse", type: "key", code: "Enter", phase: "down" },
    ]));
    expect(policy.decide(observation("menu-like"))).toMatchObject({ stage: "boot", reason: "visible-menu-return-complete" });
  });
});
