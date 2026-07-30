import { describe, expect, it } from "vitest";

import { compareTearVisualParity, createTearObservationSession } from "../../src/tearbench";

describe("C25 independently labeled observation channels", () => {
  it("makes Class-C pixels-only and retains an auditable read ledger", () => {
    const session = createTearObservationSession({
      executionClass: "black-box", observationClass: "pixel-only",
      enabled: { pixel: true, "semantic-ui": false, "structured-state": false, events: false },
    });
    session.read("pixel", 5, "detect visible menu affordance");
    expect(session.records()).toEqual([{ channel: "pixel", tick: 5, purpose: "detect visible menu affordance" }]);
    expect(() => { session.read("structured-state", 6, "forbidden state read"); }).toThrow("disabled observation channel");
    expect(() => createTearObservationSession({
      executionClass: "black-box", observationClass: "pixel-only",
      enabled: { pixel: true, "semantic-ui": true, "structured-state": false, events: false },
    })).toThrow("pixels only");
  });

  it("reports independently captured visual/semantic/structured disagreement", () => {
    const matching = { screen: "draft", controls: ["left-card", "middle-card"] };
    expect(compareTearVisualParity({ name: "visible-draft", pixel: { ...matching, confidence: 0.9 }, semanticUi: matching, structured: matching, events: matching }))
      .toMatchObject({ passed: true, mismatches: [] });
    expect(compareTearVisualParity({ name: "occluded-draft", pixel: { screen: "playing", controls: [], confidence: 0.4 }, semanticUi: matching }))
      .toEqual({ name: "occluded-draft", passed: false, mismatches: ["semantic-ui.screen", "semantic-ui.controls", "pixel.confidence"] });
  });
});
