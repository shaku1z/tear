// Replay PR 5c-1 browser evidence, nightly (about two minutes): a campaign run is one record across its
// stage wins. A stage win is not a run's end, so the record stays open from the opening chapter through
// the first stage's boss and into the second stage, is stored once at the end, and the copy read back
// from the `tear-replays` store verifies from its seed alone. Built test target only
// (`pnpm build:test:standalone`); the legs are in tests/browser-replay-live-legs.js.
//
// The Watch Agent plays a returning player with permanent upgrades bought, so it clears the first stage
// (on a fresh profile it falls in that stage's later waves). The upgrades are saved progress the run
// starts from, so they are in the record's start and the run is still a plain start.
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");
const { recordLiveRun, summary, ONE_STORED_RUN } = require("./browser-replay-live-legs");

const RETURNING_PLAYER_UPGRADES = Object.freeze({
  tough: 8,
  sharp: 8,
  recovery: 6,
  thickskin: 6,
  warding: 2,
  lifeline: 4,
  phoenix: 1,
  secondbreath: 4,
});

withJourney(
  {
    name: "Replay 5c-1: a campaign run is one record across a stage win",
    tutorialSkipped: true,
    deferBoot: true,
    query: { watchagent: "1" },
    storage: {
      tear_meta: JSON.stringify({ lifetimeEarned: 100_000, lifetimeSpent: 0, buy: RETURNING_PLAYER_UPGRADES }),
    },
  },
  async (journey) => {
    const campaign = await recordLiveRun(
      journey,
      { mode: "campaign", difficulty: "easy", weapon: "sword", seed: 515_303, skipCinematics: false },
      (snapshot, stages) => stages.has(1) && snapshot.screen === "playing" && snapshot.fixedTicks > stages.get(1) + 240,
    );
    console.log("campaign across a stage win", JSON.stringify(summary(campaign)));
    assert.ok(
      campaign.record.summary.marks.some((mark) => mark.kind === "boss"),
      "the record does not hold the first stage's boss",
    );
    assert.ok(
      campaign.record.summary.marks.some((mark) => mark.kind === "stage" && mark.value === 1),
      "the record does not reach the second stage",
    );
    assert.deepEqual(campaign.verdict, { status: "verified", tick: campaign.record.run.result.tick });
    assert.deepEqual(campaign.counters, ONE_STORED_RUN);
  },
);
