// Replay PR 5b-3 and 5c-1 browser evidence: the production live replay recorder
// (src/app/replay/live-replay-production.ts) records a live run, keeps it on this device in the
// `tear-replays` IndexedDB database, and the record read back from there verifies from its seed alone in
// the detached world, with no keyframes. Built test target only (`pnpm build:test:standalone`).
//
// The live game runs as a player plays it. The scripted Watch Agent plays through the real setup
// screen, the real frame coordinator and the real reward screens. The test holds the confirm key, as a
// player does, to skip the opening chapter (HOLD TO SKIP CHAPTER), so the scene ends on live frames and
// confirm presses: the record's one frame-clock exception.
//
// - Cold leg: a run started straight after boot, before anything waits for the recorder. A run that
//   starts before the recorder's code has loaded is not recorded and is counted (`notLoaded`); run start
//   never waits for it. The leg reports which happened.
// - Campaign leg: the opening chapter, wave 1 cleared and a draft card taken, the first stage won, and on
//   into the second stage. A stage win is not a run's end, so one record holds both stages.
// - Boss Rush leg: a run that opens on the boss arrival.
//
// Each warm leg's record must hold its scene frames (campaign) and its draft pick as an action, be
// stored, and verify as read back from the store. Each warm leg also times every call into the tap and
// the store write at the run's end, and reports them (`cost`).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS } = require("./browser-waits");

const BATCH_TICKS = 60;
const MAX_BATCHES = 1_500;

async function bootToMenu({ page, boot }) {
  await boot();
  await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__ && window.__TEAR_REPLAY_TAP__, undefined, {
    timeout: STATE_WAIT_MS,
  });
}

// A run started at once after boot: is it recorded, or counted as started before the recorder loaded?
async function coldRun(journey) {
  const { page } = journey;
  await bootToMenu(journey);
  const options = { mode: "endless", difficulty: "easy", weapon: "sword", seed: 515_305, skipCinematics: true };
  await page.evaluate((start) => window.__TEAR_WATCH_AGENT__.start(start), options);
  // The agent starts the run through the setup screen on its first ticks, not in start().
  let snapshot = await page.evaluate((ticks) => window.__TEAR_WATCH_AGENT__.runAsync(ticks), BATCH_TICKS);
  for (let batch = 0; batch < 20 && snapshot.status === "running" && snapshot.screen !== "playing"; batch += 1)
    snapshot = await page.evaluate((ticks) => window.__TEAR_WATCH_AGENT__.runAsync(ticks), BATCH_TICKS);
  assert.equal(snapshot.screen, "playing", `the cold run did not start (${JSON.stringify(snapshot.status)})`);
  const recording = await page.evaluate(() => window.__TEAR_REPLAY_TAP__.recording());
  await page.evaluate(() => window.__TEAR_WATCH_AGENT__.stop());
  const counters = await page.evaluate(() => window.__TEAR_REPLAY_TAP__.counters());
  return { recording, counters };
}

// Each warm leg starts from a fresh boot on the main menu, where the Watch Agent starts, and waits for
// the recorder before the run starts.
async function recordLiveRun(journey, options, done) {
  const { page } = journey;
  await bootToMenu(journey);
  await page.evaluate(() => window.__TEAR_REPLAY_TAP__.arm());
  let snapshot = await page.evaluate((start) => window.__TEAR_WATCH_AGENT__.start(start), options);
  let holding = false;
  let sceneBatches = 0;
  let profiled = false;
  // The tick each stage was first seen on.
  const stages = new Map([[0, 0]]);
  for (let batch = 0; batch < MAX_BATCHES && snapshot.status === "running" && !done(snapshot, stages); batch += 1) {
    // Hold confirm through a scene once it has shown for a batch (the hold arms on a released key).
    const { scene, stage, recording } = await page.evaluate(() => ({
      scene: window.__TEAR_REPLAY_TAP__.scene(),
      stage: window.__TEAR_REPLAY_TAP__.stage(),
      recording: window.__TEAR_REPLAY_TAP__.recording(),
    }));
    if (!stages.has(stage)) stages.set(stage, snapshot.fixedTicks);
    if (recording && !profiled) profiled = await page.evaluate(() => window.__TEAR_REPLAY_TAP__.profile());
    sceneBatches = scene ? sceneBatches + 1 : 0;
    if (scene && sceneBatches > 1 && !holding) {
      await page.keyboard.down("Enter");
      holding = true;
    } else if (!scene && holding) {
      await page.keyboard.up("Enter");
      holding = false;
    }
    snapshot = await page.evaluate((ticks) => window.__TEAR_WATCH_AGENT__.runAsync(ticks), BATCH_TICKS);
  }
  if (holding) await page.keyboard.up("Enter");
  assert.ok(
    done(snapshot, stages),
    `${options.mode}: the run did not reach its goal (${JSON.stringify(snapshot.status)}, stages ${JSON.stringify([...stages])})`,
  );
  await page.evaluate(() => window.__TEAR_WATCH_AGENT__.stop());
  assert.ok(await page.evaluate(() => window.__TEAR_REPLAY_TAP__.recording()), `${options.mode}: no run recorded`);
  const timings = await page.evaluate(() => window.__TEAR_REPLAY_TAP__.timings());
  // End it as a kept run's outcome does, then read it back from the store.
  const runEnd = await page.evaluate(() => window.__TEAR_REPLAY_TAP__.keep());
  const entries = await page.evaluate(() => window.__TEAR_REPLAY_TAP__.stored());
  // The page keeps its IndexedDB across boots, so the store holds every earlier leg's record too.
  const entry = Array.isArray(entries) ? entries.find((stored) => stored.key.endsWith(`:${options.seed}`)) : undefined;
  assert.ok(entry, `${options.mode}: not stored (${JSON.stringify(entries)})`);
  const read = await page.evaluate((key) => window.__TEAR_REPLAY_TAP__.storedRecord(key), entry.key);
  assert.ok(read?.ok, `${options.mode}: the stored record did not read back (${JSON.stringify(read)})`);
  const { record } = read;
  // The share of the store write that is turning the record into text.
  const stringifyMs = await page.evaluate((value) => {
    const started = performance.now();
    JSON.stringify(value);
    return performance.now() - started;
  }, record);
  const verdict = await page.evaluate((value) => window.__TEAR_REPLAY_TAP__.verify(value), record);
  const counters = await page.evaluate(() => window.__TEAR_REPLAY_TAP__.counters());
  // TEAR_REPLAY_DUMP=<folder outside the repository> keeps each record for a look at a difference.
  if (process.env.TEAR_REPLAY_DUMP)
    fs.writeFileSync(`${process.env.TEAR_REPLAY_DUMP}/${options.mode}.json`, JSON.stringify({ record, verdict }));
  return { record, verdict, snapshot, entry, counters, cost: { timings, runEnd, stringifyMs } };
}

function summary(leg) {
  const { record } = leg;
  return {
    ticks: record.run.result.tick,
    actions: record.run.actions.length,
    frames: record.run.frames.length,
    framesWithConfirm: record.run.frames.filter((frame) => frame.confirm.key).length,
    draftActions: record.run.actions.filter((action) => action.command.type === "draft-choice").length,
    marks: record.summary.marks,
    storedBytes: leg.entry.bytes,
    counters: leg.counters,
    cost: leg.cost,
  };
}

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
      (snapshot, stages) =>
        snapshot.draftPicks.length > 0 &&
        stages.has(1) &&
        snapshot.screen === "playing" &&
        snapshot.fixedTicks > stages.get(1) + 240,
    );
    console.log("campaign", JSON.stringify({ ...summary(campaign), verdict: campaign.verdict }));
    assert.ok(campaign.record.run.frames.length > 0, "the chapter's live frames were not recorded");
    assert.ok(
      campaign.record.run.frames.some((frame) => frame.confirm.key),
      "the held confirm that skips the chapter was not recorded",
    );
    assert.ok(
      campaign.record.run.actions.some((action) => action.command.type === "draft-choice"),
      "the draft pick was not recorded as an action",
    );
    assert.ok(
      campaign.record.summary.marks.some((mark) => mark.kind === "stage" && mark.value === 1),
      "the record does not reach the second stage",
    );
    assert.deepEqual(campaign.verdict, { status: "verified", tick: campaign.record.run.result.tick });
    assert.deepEqual(campaign.counters, {
      notLoaded: 0,
      recorded: 1,
      stored: 1,
      evicted: 0,
      oversized: 0,
      tapErrors: 0,
      storeFailures: {},
    });

    const bossRush = await recordLiveRun(
      journey,
      { mode: "bossonly", difficulty: "easy", weapon: "sword", boss: "warden", seed: 515_304, skipCinematics: false },
      (snapshot) => snapshot.fixedTicks >= 1_800,
    );
    console.log("boss rush", JSON.stringify({ ...summary(bossRush), verdict: bossRush.verdict }));
    assert.ok(
      bossRush.record.summary.marks.some((mark) => mark.kind === "boss"),
      "the Boss Rush run did not reach its boss",
    );
    assert.deepEqual(bossRush.verdict, { status: "verified", tick: bossRush.record.run.result.tick });
    assert.equal(bossRush.counters.tapErrors, 0);
  },
);
