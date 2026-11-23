// A real run's replay, end to end, as a player keeps and moves it (built test target only,
// `pnpm build:test:standalone`):
//
// 1. A One-Hit run is played live by the Watch Agent until the player dies. The game's own run end keeps it
//    (the production recorder), so the record's summary comes from the live run, not from a test hook.
// 2. The record is read back from the `tear-replays` store as stored, and it verifies from its seed.
// 3. On Profile → REPLAYS the player presses DOWNLOAD (the file is the stored record), DELETE (the run is
//    gone from the store), then IMPORT A REPLAY FILE with the downloaded file (the run is back, unchanged,
//    and still verifies).
// 4. WATCH on the imported row plays it at once; the replay bar pauses it, doubles the speed and jumps
//    between chapters, the arrow keys seek five seconds, and PRACTICE starts a live run at the shown moment.
//
// Never reads the run's totals from the canonical state: a record whose live summary disagrees with what
// verify derives fails step 2.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS } = require("./browser-waits");

const SEED = 707_401;
const BATCH_TICKS = 60;
const MAX_BATCHES = 300;
const TICKS_PER_SECOND = 120;

withJourney(
  {
    name: "Replay file round trip: a kept One-Hit run downloads, imports and verifies",
    tutorialSkipped: true,
    deferBoot: true,
    recordFrames: true,
    query: { watchagent: "1" },
  },
  async ({ page, boot, waitScreen, labelPoint }) => {
    await boot();
    await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__ && window.__TEAR_REPLAY_TAP__, undefined, {
      timeout: STATE_WAIT_MS,
    });
    await page.evaluate(() => window.__TEAR_REPLAY_TAP__.arm());
    let snapshot = await page.evaluate(
      (seed) =>
        window.__TEAR_WATCH_AGENT__.start({
          mode: "endless",
          difficulty: "onehit",
          weapon: "sword",
          seed,
          skipCinematics: true,
        }),
      SEED,
    );
    const died = (value) => value.transitions.some((transition) => transition.screen === "gameover");
    for (let batch = 0; batch < MAX_BATCHES && snapshot.status === "running" && !died(snapshot); batch += 1)
      snapshot = await page.evaluate((ticks) => window.__TEAR_WATCH_AGENT__.runAsync(ticks), BATCH_TICKS);
    await page.evaluate(() => window.__TEAR_WATCH_AGENT__.stop());
    assert.ok(died(snapshot), `the One-Hit run did not end in a death (${snapshot.status}, ${snapshot.screen})`);

    // 2. As stored, it verifies.
    const storedEntry = async () => {
      const entries = await page.evaluate(() => window.__TEAR_REPLAY_TAP__.stored());
      assert.ok(Array.isArray(entries), `the store did not open (${JSON.stringify(entries)})`);
      return entries.find((entry) => entry.key.endsWith(`:${SEED}`));
    };
    const storedRecord = async (key) => {
      const read = await page.evaluate((id) => window.__TEAR_REPLAY_TAP__.storedRecord(id), key);
      assert.ok(read?.ok, `the stored record did not read back (${JSON.stringify(read)})`);
      return read.record;
    };
    // The game writes the kept run after the death screen opens.
    await page.waitForFunction(
      (seed) =>
        window.__TEAR_REPLAY_TAP__
          .stored()
          .then((entries) => Array.isArray(entries) && entries.some((stored) => stored.key.endsWith(`:${seed}`))),
      SEED,
      { timeout: STATE_WAIT_MS, polling: 250 },
    );
    const entry = await storedEntry();
    assert.ok(entry, "the game did not keep the run");
    const record = await storedRecord(entry.key);
    const seconds = record.run.result.tick / TICKS_PER_SECOND;
    assert.ok(
      Math.abs(record.summary.time - seconds) < 0.05,
      `the summary time ${record.summary.time} is not the run's ${seconds.toFixed(3)} s`,
    );
    assert.deepEqual(await page.evaluate((value) => window.__TEAR_REPLAY_TAP__.verify(value), record), {
      status: "verified",
      tick: record.run.result.tick,
    });

    // 3. DOWNLOAD, DELETE, IMPORT on Profile → REPLAYS.
    await boot();
    await page.mouse.click(260, 266); // The profile card on the main menu.
    await waitScreen("profile");
    const click = async (label) => {
      const point = await labelPoint(label);
      await page.mouse.click(point.x, point.y);
    };
    await click("REPLAYS");
    const [download] = await Promise.all([page.waitForEvent("download"), click("DOWNLOAD")]);
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "tear-replay-file-"));
    try {
      const file = path.join(folder, download.suggestedFilename());
      await download.saveAs(file);
      assert.match(download.suggestedFilename(), /^tear-replay-.*\.json$/u);
      assert.deepEqual(
        JSON.parse(fs.readFileSync(file, "utf8")),
        record,
        "the downloaded file is not the stored record",
      );

      await click("✕");
      await page.waitForFunction(
        (seed) =>
          window.__TEAR_REPLAY_TAP__
            .stored()
            .then((entries) => Array.isArray(entries) && !entries.some((stored) => stored.key.endsWith(`:${seed}`))),
        SEED,
        { timeout: STATE_WAIT_MS, polling: 250 },
      );

      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), click("IMPORT A REPLAY FILE")]);
      await chooser.setFiles(file);
      await page.waitForFunction(
        (seed) =>
          window.__TEAR_REPLAY_TAP__
            .stored()
            .then((entries) => Array.isArray(entries) && entries.some((stored) => stored.key.endsWith(`:${seed}`))),
        SEED,
        { timeout: STATE_WAIT_MS, polling: 250 },
      );
      const imported = await storedRecord((await storedEntry()).key);
      assert.deepEqual(imported, record, "the imported run is not the run that was downloaded");
      assert.deepEqual(await page.evaluate((value) => window.__TEAR_REPLAY_TAP__.verify(value), imported), {
        status: "verified",
        tick: imported.run.result.tick,
      });
      // 4. WATCH plays the run at once; the replay bar pauses it, doubles its speed and jumps between its
      //    chapters, the arrow keys seek, and PRACTICE starts a live run at the shown moment.
      const shownIs = (expected, message) =>
        page
          .waitForFunction(
            (want) => {
              const shown = window.__TEAR_REPLAY_TAP__.shown();
              return shown !== undefined && Object.entries(want).every(([key, value]) => shown[key] === value);
            },
            expected,
            { timeout: STATE_WAIT_MS },
          )
          .catch(async (error) => {
            const shown = await page.evaluate(() => window.__TEAR_REPLAY_TAP__.shown());
            throw new Error(`${message}: shows ${JSON.stringify(shown)}, wanted ${JSON.stringify(expected)}`, {
              cause: error,
            });
          });
      await click("WATCH");
      await waitScreen("replay");
      await shownIs({ paused: false }, "WATCH did not play at once");
      await click("❚❚");
      await shownIs({ paused: true }, "the pause control did not pause");
      const pausedAt = (await page.evaluate(() => window.__TEAR_REPLAY_TAP__.shown())).tick;
      await click("1×");
      await shownIs({ speed: 2, tick: pausedAt }, "the speed control did not double the speed of the paused replay");
      const last = record.run.result.tick;
      const chapters = [...new Set(record.summary.marks.map((mark) => mark.tick))]
        .filter((tick) => tick <= last)
        .sort((left, right) => left - right);
      const forward = chapters.find((tick) => tick > pausedAt) ?? pausedAt;
      await click("▶|");
      await shownIs({ tick: forward }, "the next-chapter control did not go to the next chapter");
      const back = [...chapters].reverse().find((tick) => tick < forward) ?? forward;
      await click("|◀");
      await shownIs({ tick: back }, "the previous-chapter control did not go to the chapter before");
      const later = Math.min(last, back + 5 * TICKS_PER_SECOND);
      await page.keyboard.press("ArrowRight");
      await shownIs({ tick: later }, "ArrowRight did not seek five seconds on");
      await page.keyboard.press("ArrowLeft");
      await shownIs({ tick: Math.max(0, later - 5 * TICKS_PER_SECOND) }, "ArrowLeft did not seek five seconds back");
      await click("PRACTICE");
      await waitScreen("playing");
      console.log("watched", JSON.stringify({ pausedAt, forward, back, chapters: chapters.length, last }));
      console.log(
        "kept, downloaded, imported and verified",
        JSON.stringify({ ticks: record.run.result.tick, summary: { ...record.summary, marks: undefined } }),
      );
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  },
)
  .then(() => console.log("browser replay file round trip passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
