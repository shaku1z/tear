// Replay PR 5b-3 and 5c-1 browser evidence, on every pull request: the production live replay recorder
// (src/app/replay/live-replay-production.ts) records a live run, keeps it on this device in the
// `tear-replays` IndexedDB database, and the record read back from there verifies from its seed alone in
// the detached world, with no keyframes. Built test target only (`pnpm build:test:standalone`). The legs
// are in tests/browser-replay-live-legs.js; a campaign run across a stage win is the nightly
// tests/browser-replay-campaign-stages.js.
//
// - Cold leg: a run started straight after boot, before anything waits for the recorder. A run that
//   starts before the recorder's code has loaded is not recorded and is counted (`notLoaded`); run start
//   never waits for it. The leg reports which happened.
// - Campaign leg: the opening chapter skipped by a held confirm, wave 1 cleared and a draft card taken,
//   then on into wave 2.
// - Boss Rush leg: a run that opens on the boss arrival.
//
// Each warm leg's record must hold its scene frames (campaign) and its draft pick as an action, be
// stored, and verify as read back from the store.
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");
const { coldRun, recordLiveRun, summary, ONE_STORED_RUN } = require("./browser-replay-live-legs");

withJourney(
  {
    name: "Replay 5c-1: a live run is recorded, stored and verifies from its seed",
    tutorialSkipped: true,
    deferBoot: true,
    query: { watchagent: "1" },
  },
  async (journey) => {
    const cold = await coldRun(journey);
    console.log("cold first run", JSON.stringify(cold));
    // Either the recorder had loaded (recorded) or it had not (counted); never both, never neither.
    assert.equal(cold.recording, cold.counters.notLoaded === 0, "a cold run was neither recorded nor counted");

    const campaign = await recordLiveRun(
      journey,
      { mode: "campaign", difficulty: "easy", weapon: "sword", seed: 515_303, skipCinematics: false },
      (snapshot) =>
        snapshot.draftPicks.length > 0 &&
        snapshot.screen === "playing" &&
        snapshot.fixedTicks > snapshot.draftPicks[0].tick + 240,
    );
    console.log("campaign", JSON.stringify(summary(campaign)));
    assert.ok(campaign.record.run.frames.length > 0, "the chapter's live frames were not recorded");
    assert.ok(
      campaign.record.run.frames.some((frame) => frame.confirm.key),
      "the held confirm that skips the chapter was not recorded",
    );
    assert.ok(
      campaign.record.run.actions.some((action) => action.command.type === "draft-choice"),
      "the draft pick was not recorded as an action",
    );
    assert.deepEqual(campaign.verdict, { status: "verified", tick: campaign.record.run.result.tick });
    assert.deepEqual(campaign.counters, ONE_STORED_RUN);

    const bossRush = await recordLiveRun(
      journey,
      { mode: "bossonly", difficulty: "easy", weapon: "sword", boss: "warden", seed: 515_304, skipCinematics: false },
      (snapshot) => snapshot.fixedTicks >= 1_800,
    );
    console.log("boss rush", JSON.stringify(summary(bossRush)));
    assert.ok(
      bossRush.record.summary.marks.some((mark) => mark.kind === "boss"),
      "the Boss Rush run did not reach its boss",
    );
    assert.deepEqual(bossRush.verdict, { status: "verified", tick: bossRush.record.run.result.tick });
    assert.deepEqual(bossRush.counters, ONE_STORED_RUN);
  },
);
