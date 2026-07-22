import { describe, expect, it, vi } from "vitest";
import { LiveRunOutcomeController, type LiveOutcomeControllerPort } from "../../src/gameplay/run/live-outcome-controller";
import type { OutcomeRunState, PreparedVictory } from "../../src/gameplay/run/outcome-planner";

function createHarness() {
  let run: OutcomeRunState = {
    mode: "endless", diff: "normal", wave: 4, score: 1200, runTime: 42,
    waveTime: 8, waveKills: 3, wavePeak: 2, waveLog: [], weaponId: "sword",
    damagedThisRun: false,
  };
  let prepared: PreparedVictory | null = null;
  const events: string[] = [];
  const port: LiveOutcomeControllerPort = {
    snapshot: () => run,
    replaceWaveLog: (waveLog) => { run = { ...run, waveLog }; events.push("append-wave"); },
    waveActive: () => true,
    preparedVictory: () => prepared,
    storePreparedVictory: (value) => { prepared = value; events.push("store-prepared"); },
    stopClipper: () => { events.push("stop-clipper"); },
    terminate: (outcome) => { events.push(`terminate:${outcome}`); },
    saveBest: () => { events.push("save-best"); return true; },
    best: () => ({ wave: 4, score: 1200, time: 42 }),
    awardCoins: () => { events.push("award-coins"); return 12; },
    coins: () => 99,
    achievementTracking: () => true,
    economyTelemetry: () => ({ earned: 12 }),
    recordDefeatProgress: () => { events.push("record-defeat"); },
    executeVictoryIntents: () => { events.push("victory-intents"); },
    persistPendingFinale: () => { events.push("pending-finale"); },
    saveProfile: () => { events.push("save-profile"); },
    clearPendingFinale: () => { events.push("clear-finale"); },
    pushCloud: () => { events.push("push-cloud"); },
    present: (outcome) => { events.push(`present:${outcome}`); },
    midgame: (callback) => { events.push("midgame"); callback(); },
    restartCurrentRun: () => { events.push("restart"); },
  };
  return { controller: new LiveRunOutcomeController(port), events, prepared: () => prepared };
}

describe("LiveRunOutcomeController", () => {
  it("persists an active final wave and terminates before presenting defeat", () => {
    const { controller, events } = createHarness();
    const result = controller.defeat();

    expect(result.log).toEqual([{ wave: 4, time: 8, kills: 3, peak: 2, died: true }]);
    expect(events).toEqual([
      "stop-clipper", "append-wave", "terminate:defeat", "save-best", "award-coins",
      "record-defeat", "present:defeat",
    ]);
  });

  it("prepares victory once, persists finale state, and terminates before presentation", () => {
    const { controller, events, prepared } = createHarness();
    controller.prepareVictory(true, true);
    controller.prepareVictory(true, true);

    expect(prepared()).toEqual({ isNew: true, earned: 12, coins: 99 });
    expect(events.filter((event) => event === "save-best")).toHaveLength(1);
    expect(events).toContain("pending-finale");

    events.length = 0;
    controller.victory(true);
    expect(events).toEqual(["clear-finale", "push-cloud", "terminate:victory", "present:victory"]);
  });

  it("defers retry until the portal midgame callback", () => {
    const { controller, events } = createHarness();
    const midgame = vi.fn();
    void midgame;
    controller.retry();
    expect(events).toEqual(["midgame", "restart"]);
  });
});
