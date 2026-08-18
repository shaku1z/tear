import { describe, expect, it, vi } from "vitest";
import { LiveRunOutcomeController, type LiveOutcomeControllerPort } from "../../src/gameplay/run/live-outcome-controller";
import type { OutcomeRunState, PreparedVictory } from "../../src/gameplay/run/outcome-planner";
import { createOutcomeChronologyJournal } from "../../src/gameplay/run/outcome-chronology-journal";

function createHarness(options: Readonly<{ achievementTracking?: boolean; timeline?: string[] }> = {}) {
  let run: OutcomeRunState = {
    mode: "endless", diff: "normal", wave: 4, score: 1200, runTime: 42,
    waveTime: 8, waveKills: 3, wavePeak: 2, waveLog: [], weaponId: "sword",
    damagedThisRun: false,
  };
  let prepared: PreparedVictory | null = null;
  const events: string[] = [];
  const trace = (event: string): void => { options.timeline?.push(event); };
  const chronology = createOutcomeChronologyJournal();
  const port: LiveOutcomeControllerPort = {
    snapshot: () => run,
    replaceWaveLog: (waveLog) => { run = { ...run, waveLog }; events.push("append-wave"); },
    waveActive: () => true,
    preparedVictory: () => prepared,
    storePreparedVictory: (value) => { prepared = value; events.push("store-prepared"); },
    stopClipper: () => { events.push("stop-clipper"); trace("returned:stop-clipper"); },
    terminate: (outcome) => { events.push(`terminate:${outcome}`); trace(`returned:terminate:${outcome}`); },
    saveBest: () => { events.push("save-best"); trace("returned:save-best"); return true; },
    best: () => { trace("returned:best"); return { wave: 4, score: 1200, time: 42 }; },
    awardCoins: () => { events.push("award-coins"); trace("returned:award-coins"); return 12; },
    coins: () => { trace("returned:coins"); return 99; },
    achievementTracking: () => { trace("returned:achievement-policy"); return options.achievementTracking ?? true; },
    economyTelemetry: () => { trace("returned:economy-telemetry"); return { earned: 12 }; },
    recordDefeatProgress: () => { events.push("record-defeat"); trace("returned:defeat-progression"); },
    publishTerminal: (outcome) => { events.push(`event:${outcome}`); trace(`returned:terminal:${outcome}`); },
    executeVictoryIntents: () => { events.push("victory-intents"); trace("returned:victory-intents"); },
    persistPendingFinale: () => { events.push("pending-finale"); trace("returned:pending-finale-write"); },
    saveProfile: () => { events.push("save-profile"); trace("returned:profile-save"); },
    clearPendingFinale: () => { events.push("clear-finale"); trace("returned:pending-finale-clear"); },
    pushCloud: () => { events.push("push-cloud"); trace("returned:cloud-push"); },
    present: (outcome) => { events.push(`present:${outcome}`); trace(`returned:present:${outcome}`); },
    midgame: (callback) => { events.push("midgame"); callback(); },
    restartCurrentRun: () => { events.push("restart"); },
    observeOutcomeChronology: (effect) => {
      trace(`receipt:${effect.type}`);
      chronology.record(effect);
    },
  };
  return { controller: new LiveRunOutcomeController(port), events, chronology, prepared: () => prepared };
}

describe("LiveRunOutcomeController", () => {
  it("persists an active final wave and terminates before presenting defeat", () => {
    const { controller, events } = createHarness();
    const result = controller.defeat();

    expect(result.log).toEqual([{ wave: 4, time: 8, kills: 3, peak: 2, died: true }]);
    expect(events).toEqual([
      "stop-clipper", "append-wave", "terminate:defeat", "event:defeat", "save-best", "award-coins",
      "record-defeat", "present:defeat",
    ]);
  });

  it("prepares victory once, requests finale state, and terminates before presentation dispatch", () => {
    const { controller, events, chronology, prepared } = createHarness();
    controller.prepareVictory(true, true);
    controller.prepareVictory(true, true);

    expect(prepared()).toEqual({ isNew: true, earned: 12, coins: 99 });
    expect(events.filter((event) => event === "save-best")).toHaveLength(1);
    expect(events.filter((event) => event === "event:victory")).toHaveLength(1);
    expect(events).toContain("pending-finale");

    events.length = 0;
    controller.victory(true);
    expect(events).toEqual(["clear-finale", "push-cloud", "terminate:victory", "present:victory"]);
    expect(chronology.entries().map((entry) => entry.effect.type)).toEqual([
      "outcome.stop-clipper", "outcome.score-newness-decided", "outcome.coins-awarded", "outcome.wallet-read",
      "outcome.terminal-published", "outcome.achievement-policy-read", "outcome.economy-telemetry-read",
      "outcome.victory-intents-dispatched", "outcome.prepared-stored", "outcome.best-read",
      "outcome.pending-finale-write-requested", "outcome.achievement-policy-read", "outcome.cloud-push-requested",
      "outcome.prepared-cache-hit", "outcome.prepared-cache-hit", "outcome.best-read",
      "outcome.pending-finale-clear-requested", "outcome.achievement-policy-read", "outcome.cloud-push-requested",
      "outcome.lifecycle-terminated", "outcome.presentation-dispatched",
    ]);
    expect(chronology.entries().at(10)?.effect).toMatchObject({
      type: "outcome.pending-finale-write-requested",
      record: { mode: "endless", wave: 4, score: 1200, earned: 12, coins: 99 },
    });
    expect(chronology.entries().at(-1)?.effect).toMatchObject({
      type: "outcome.presentation-dispatched",
      outcome: "victory",
      result: { win: true, campaign: true, earned: 12, coins: 99 },
    });
  });

  it("records each terminal adapter result only after its adapter returns", () => {
    const timeline: string[] = [];
    const { controller, chronology } = createHarness({ timeline });
    controller.defeat();

    expect(chronology.entries().map((entry) => entry.effect.type)).toEqual([
      "outcome.stop-clipper", "outcome.lifecycle-terminated", "outcome.terminal-published",
      "outcome.score-newness-decided", "outcome.coins-awarded", "outcome.wallet-read",
      "outcome.achievement-policy-read", "outcome.defeat-progression-dispatched", "outcome.best-read",
      "outcome.presentation-dispatched",
    ]);
    expect(chronology.entries().slice(3, 6).map((entry) => entry.effect)).toMatchObject([
      { type: "outcome.score-newness-decided", isNew: true },
      { type: "outcome.coins-awarded", score: 1200, earned: 12 },
      { type: "outcome.wallet-read", coins: 99 },
    ]);
    expect(timeline).toEqual([
      "returned:stop-clipper", "receipt:outcome.stop-clipper",
      "returned:terminate:defeat", "receipt:outcome.lifecycle-terminated",
      "returned:terminal:defeat", "receipt:outcome.terminal-published",
      "returned:save-best", "receipt:outcome.score-newness-decided",
      "returned:award-coins", "receipt:outcome.coins-awarded",
      "returned:coins", "receipt:outcome.wallet-read",
      "returned:achievement-policy", "receipt:outcome.achievement-policy-read",
      "returned:defeat-progression", "receipt:outcome.defeat-progression-dispatched",
      "returned:best", "receipt:outcome.best-read",
      "returned:present:defeat", "receipt:outcome.presentation-dispatched",
    ]);
  });

  it("records a disabled achievement policy without dispatching achievement intents or cloud requests", () => {
    const { controller, events, chronology } = createHarness({ achievementTracking: false });
    controller.prepareVictory(false, false);

    expect(events).toContain("save-profile");
    expect(events).not.toContain("push-cloud");
    expect(chronology.entries().map((entry) => entry.effect)).toContainEqual({
      type: "outcome.achievement-policy-read", enabled: false,
    });
    expect(chronology.entries().map((entry) => entry.effect)).toContainEqual({
      type: "outcome.victory-intents-dispatched", intents: [],
    });
    expect(chronology.entries().map((entry) => entry.effect.type)).toContain("outcome.profile-save-requested");
  });

  it("defers retry until the portal midgame callback", () => {
    const { controller, events } = createHarness();
    const midgame = vi.fn();
    void midgame;
    controller.retry();
    expect(events).toEqual(["midgame", "restart"]);
  });
});
