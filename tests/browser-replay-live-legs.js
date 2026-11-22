// The legs the live replay browser tests play (tests/browser-replay-live-verify.js on every pull request),
// over the `__TEAR_REPLAY_TAP__` test-build inspector
// (src/app/engineering/replay-tap-inspector.ts) and the scripted Watch Agent.
//
// The live game runs as a player plays it. The Watch Agent plays through the real setup screen, the real
// frame coordinator and the real reward screens. A leg holds the confirm key, as a player does, to skip a
// chapter (HOLD TO SKIP CHAPTER), so a scene ends on live frames and confirm presses: the record's one
// frame-clock exception.
const assert = require("node:assert/strict");
const fs = require("node:fs");
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

// A warm leg starts from a fresh boot on the main menu, where the Watch Agent starts, waits for the
// recorder before the run starts, plays until `done(snapshot, stages)`, then ends the run as a kept run's
// outcome does, reads the record back from the store and verifies that copy. It also times every call
// into the tap and the store write at the run's end (`cost`).
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
  const reached = {
    status: snapshot.status,
    reason: snapshot.terminalReason,
    screen: snapshot.screen,
    wave: snapshot.wave,
    hp: snapshot.hp,
    ticks: snapshot.fixedTicks,
    stages: [...stages],
  };
  assert.ok(done(snapshot, stages), `${options.mode}: the run did not reach its goal (${JSON.stringify(reached)})`);
  await page.evaluate(() => window.__TEAR_WATCH_AGENT__.stop());
  const tapError = await page.evaluate(() => window.__TEAR_REPLAY_TAP__.tapError());
  assert.equal(tapError, null, `${options.mode}: the recorder threw`);
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
    verdict: leg.verdict,
  };
}

/** The counters of a boot that recorded and stored exactly one run, with nothing failing. */
const ONE_STORED_RUN = Object.freeze({
  notLoaded: 0,
  recorded: 1,
  stored: 1,
  evicted: 0,
  oversized: 0,
  tapErrors: 0,
  storeFailures: {},
});

module.exports = { coldRun, recordLiveRun, summary, ONE_STORED_RUN };
