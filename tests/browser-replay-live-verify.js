// Replay PR 5b-3 browser evidence: a live run, recorded through the live replay tap
// (src/app/replay/live-replay-tap.ts), verifies from its seed alone in the detached world, with no
// keyframes. Built test target only (`pnpm build:test:standalone`).
//
// The live game runs as a player plays it. The scripted Watch Agent plays through the real setup
// screen, the real frame coordinator and the real reward screens. The test holds the confirm key, as a
// player does, to skip the opening chapter (HOLD TO SKIP CHAPTER), so the scene ends on live frames and
// confirm presses: the record's one frame-clock exception.
//
// - Campaign leg: the opening chapter, wave 1 cleared and a draft card taken, then on into wave 2.
// - Boss Rush leg: a run that opens on the boss arrival.
//
// Each record must hold its scene frames (campaign) and its draft pick as an action, and verify.
const assert = require("node:assert/strict");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS } = require("./browser-waits");

const BATCH_TICKS = 60;
const MAX_BATCHES = 1_500;

async function recordLiveRun(page, options, done) {
  await page.evaluate(() => {
    window.__TEAR_REPLAY_TAP__.arm();
  });
  let snapshot = await page.evaluate((start) => window.__TEAR_WATCH_AGENT__.start(start), options);
  let holding = false;
  let sceneBatches = 0;
  for (let batch = 0; batch < MAX_BATCHES && snapshot.status === "running" && !done(snapshot); batch += 1) {
    // Hold confirm through the scene once it has shown for a batch (the hold arms on a released key).
    if (snapshot.screen === "cinematic") sceneBatches += 1;
    if (snapshot.screen === "cinematic" && sceneBatches > 1 && !holding) {
      await page.keyboard.down("Enter");
      holding = true;
    } else if (snapshot.screen !== "cinematic" && holding) {
      await page.keyboard.up("Enter");
      holding = false;
    }
    snapshot = await page.evaluate((ticks) => window.__TEAR_WATCH_AGENT__.runAsync(ticks), BATCH_TICKS);
  }
  if (holding) await page.keyboard.up("Enter");
  assert.ok(done(snapshot), `${options.mode}: the run did not reach its goal (${JSON.stringify(snapshot.status)})`);
  await page.evaluate(() => window.__TEAR_WATCH_AGENT__.stop());
  const record = await page.evaluate(() => window.__TEAR_REPLAY_TAP__.finish());
  assert.ok(record, `${options.mode}: the tap recorded no run`);
  const verdict = await page.evaluate((value) => window.__TEAR_REPLAY_TAP__.verify(value), record);
  return { record, verdict, snapshot };
}

function summary(record) {
  return {
    ticks: record.run.result.tick,
    actions: record.run.actions.length,
    frames: record.run.frames.length,
    framesWithConfirm: record.run.frames.filter((frame) => frame.confirm.key).length,
    draftActions: record.run.actions.filter((action) => action.command.type === "draft-choice").length,
    marks: record.summary.marks,
    bytes: JSON.stringify(record).length,
  };
}

withJourney(
  { name: "Replay 5b-3: a live run verifies from its seed", tutorialSkipped: true, query: { watchagent: "1" } },
  async ({ page }) => {
    await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__ && window.__TEAR_REPLAY_TAP__, undefined, {
      timeout: STATE_WAIT_MS,
    });

    const campaign = await recordLiveRun(
      page,
      { mode: "campaign", difficulty: "easy", weapon: "sword", seed: 515_303, skipCinematics: false },
      (snapshot) =>
        snapshot.draftPicks.length > 0 &&
        snapshot.screen === "playing" &&
        snapshot.fixedTicks > snapshot.draftPicks[0].tick + 240,
    );
    console.log("campaign", JSON.stringify({ ...summary(campaign.record), verdict: campaign.verdict }));
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

    const bossRush = await recordLiveRun(
      page,
      { mode: "bossonly", difficulty: "easy", weapon: "sword", boss: "warden", seed: 515_304, skipCinematics: false },
      (snapshot) => snapshot.fixedTicks >= 1_800,
    );
    console.log("boss rush", JSON.stringify({ ...summary(bossRush.record), verdict: bossRush.verdict }));
    assert.ok(
      bossRush.record.summary.marks.some((mark) => mark.kind === "boss"),
      "the Boss Rush run did not reach its boss",
    );
    assert.deepEqual(bossRush.verdict, { status: "verified", tick: bossRush.record.run.result.tick });
  },
);
