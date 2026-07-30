import { describe, expect, it } from "vitest";

import {
  ControllerAgentAdapter,
  JOURNEY_MODE_CONTRACTS,
  KeyboardMouseAgentAdapter,
  TearJourneyDirector,
  TouchAgentAdapter,
  compareUiObservations,
  createWatchOverlay,
  evaluateJourneyCertification,
} from "../../src/agents";

describe("visible journey director", () => {
  it("tracks the canonical menu-to-menu Adventure lifecycle", () => {
    const director = new TearJourneyDirector(100);
    const observations = [
      { tick: 0, screen: "menu" },
      { tick: 1, screen: "setup" },
      { tick: 2, screen: "playing", mode: "campaign", difficulty: "easy", wave: 1 },
      { tick: 3, screen: "draft", choices: ["power"] },
      { tick: 4, screen: "playing", wave: 2 },
      { tick: 5, screen: "playing", wave: 10, bossActive: true },
      { tick: 6, screen: "tierup", choices: ["evolution"] },
      { tick: 7, screen: "win" },
      { tick: 8, screen: "replay", replayAvailable: true },
      { tick: 9, screen: "menu" },
    ];
    const decisions = observations.map((entry) => director.decide(entry));
    expect(decisions[3]?.actions).toContainEqual({ type: "draft-choice", choiceId: "power" });
    expect(decisions[6]?.actions).toContainEqual({ type: "tier-up-choice", choiceId: "evolution" });
    expect(director.stage).toBe("returned-menu");
    expect(director.transitions.map((entry) => entry.to)).toEqual([
      "setup", "playing-wave-1", "draft-1", "playing-wave-2", "boss", "evolution", "result", "replay", "returned-menu",
    ]);
  });

  it("fails a stalled transition through the watchdog", () => {
    const director = new TearJourneyDirector(3);
    director.decide({ tick: 0, screen: "menu" });
    expect(director.decide({ tick: 4, screen: "menu" })).toMatchObject({ stage: "failed", timedOut: true });
  });

  it("keeps engineering evidence distinct from statistical black-box certification", () => {
    const engineering = evaluateJourneyCertification("engineering", "structured-state", Array.from({ length: 40 }, () => true));
    expect(engineering).toMatchObject({ completionRate: 1, certified: false, label: "engineering-evidence-only" });
    const insufficient = evaluateJourneyCertification("black-box", "pixel-only", Array.from({ length: 20 }, () => true));
    expect(insufficient.certified).toBe(false);
    const certified = evaluateJourneyCertification("black-box", "pixel-only", [
      ...Array.from({ length: 28 }, () => true),
      false,
      false,
    ]);
    expect(certified).toMatchObject({ attempts: 30, successes: 28, certified: true, label: "black-box-certified" });
  });

  it("defines all mode contracts and translates physical device actions", () => {
    expect(JOURNEY_MODE_CONTRACTS.map((entry) => entry.id)).toEqual([
      "tutorial", "adventure", "endless", "gauntlet", "playground", "boss-test", "enemy-test",
    ]);
    const action = { type: "move", x: 1_000, y: 0 } as const;
    expect(new KeyboardMouseAgentAdapter().translate(action)[0]).toMatchObject({ device: "keyboard-mouse", code: "KeyD" });
    expect(new ControllerAgentAdapter().translate(action)[0]).toMatchObject({ device: "controller", value: 1 });
    expect(new TouchAgentAdapter().translate(action)[0]).toMatchObject({ device: "touch", value: 1 });
  });

  it("checks structured, semantic, and pixel UI parity and builds watch overlays", () => {
    const ui = { screen: "draft", focusedId: "power", actions: ["power", "guard"] };
    expect(compareUiObservations(ui, ui, ui)).toEqual({ equal: true, mismatches: [] });
    const overlay = createWatchOverlay(true, {
      stage: "boss", objective: "defeat-boss", maneuver: "parry", confidence: 0.86,
    });
    expect(overlay).toMatchObject({ visible: true, title: "TEARBOT WATCH" });
    expect(overlay.lines).toContain("Confidence: 86%");
  });
});
