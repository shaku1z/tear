// Replay overhaul 7c-2 browser evidence: a replay shows what live play showed. For each weapon, a scripted
// segment of an Endless run holds the blade's tether, throws it, recalls it while thrown (the weapon's throw
// ability: Threadcut, the Hammer's return, the Wheel's return, the Chainblade's hook, the Riftlock's capture)
// and throws and recalls again. The game's canvas is captured at fixed ticks and at each of those moments.
// The run is kept, opened on the replay screen through WATCH, and the replay's frame at each captured tick is
// drawn as play lays out the canvas (src/app/replay/replay-screen.ts `drawAsPlayed`, without the replay's
// bars). Each pair must match: no pixel may differ by more than the channel tolerance. Built test target only
// (`pnpm build:test:standalone`).
//
// Layers drawn only for the one playing (src/app/world/overlay-audience.ts) are left out of play by the
// player's own settings: no screen shake and no parry flash.
//
// TEAR_REPLAY_PARITY_DUMP=<folder outside the repository> writes each pair that differs, and the pixels
// that differ, as PNG files.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { withJourney } = require("./browser-journey-harness");
const { STATE_WAIT_MS } = require("./browser-waits");
const { bootToMenu } = require("./browser-replay-live-legs");

const WEAPONS = Object.freeze(["sword", "hammer", "greatsword", "chainblade", "riftlock"]);
const FIRST_SEED = 515_410;
/** A pixel differs when one of its channels differs by more than this. */
const CHANNEL_TOLERANCE = 32;
/**
 * The share of a frame's pixels that may differ: none. Play and the replay draw the same world with the same
 * code in the same browser; with attack presentation shared (replay overhaul 7c-3) every captured frame of
 * every weapon matched exactly, where 0.2% was allowed before.
 */
const PIXEL_SHARE_TOLERANCE = 0;
/** A capture this often, in simulation ticks, as well as at each scripted moment. */
const EVERY_TICKS = 60;
const SEGMENT_FRAMES = 300;
const MAX_CAPTURES = 24;

const press = (intent) => ({ type: "weapon", intent, phase: "pressed" });
const release = (intent) => ({ type: "weapon", intent, phase: "released" });
const aim = (turn) => ({ type: "aim", turn: ((turn % 1_000_000) + 1_000_000) % 1_000_000 });

/**
 * The segment, by frame of play (one frame is two simulation ticks): what is pushed on that frame, and the
 * moment it names, which is captured.
 */
function script() {
  const steps = [{ frame: 0, actions: [release("primary"), { type: "move", x: 0, y: 0 }, aim(0)] }];
  // Hold the tether in (primary held) through a slash from up-right to down-right.
  steps.push({ frame: 20, actions: [press("primary")], moment: "tether held" });
  for (let frame = 21; frame <= 60; frame += 1) steps.push({ frame, actions: [aim(-125_000 + (frame - 20) * 6_250)] });
  steps.push({ frame: 61, actions: [release("primary")] });
  // Throw a little above level, then recall while it flies: the weapon's throw ability.
  steps.push({ frame: 80, actions: [aim(-40_000), press("throw")], moment: "throw" });
  steps.push({ frame: 81, actions: [release("throw")] });
  steps.push({ frame: 100, actions: [press("recall")], moment: "ability" });
  steps.push({ frame: 101, actions: [release("recall")] });
  steps.push({ frame: 160, actions: [press("recall")] });
  steps.push({ frame: 161, actions: [release("recall")] });
  // Throw down into the floor, and recall it from there.
  steps.push({ frame: 200, actions: [aim(125_000), press("throw")], moment: "throw down" });
  steps.push({ frame: 201, actions: [release("throw")] });
  steps.push({ frame: 230, actions: [press("recall")], moment: "recall" });
  steps.push({ frame: 231, actions: [release("recall")] });
  return steps;
}

async function startRun(page, options) {
  await page.evaluate(() => window.__TEAR_REPLAY_TAP__.arm());
  let snapshot = await page.evaluate((start) => window.__TEAR_WATCH_AGENT__.start(start), options);
  for (let batch = 0; batch < 40 && snapshot.status === "running" && snapshot.screen !== "playing"; batch += 1)
    snapshot = await page.evaluate(() => window.__TEAR_WATCH_AGENT__.runAsync(10));
  assert.equal(snapshot.screen, "playing", `${options.weapon}: the run did not start (${snapshot.status})`);
  assert.ok(await page.evaluate(() => window.__TEAR_REPLAY_TAP__.recording()), `${options.weapon}: not recorded`);
}

/** Plays the segment a frame at a time and keeps the canvas at each capture in the page. */
function playSegment(page, weapon) {
  return page.evaluate(
    async ({ steps, frames, every, maxCaptures }) => {
      const agent = window.__TEAR_WATCH_AGENT__,
        tap = window.__TEAR_REPLAY_TAP__;
      const live = new Map();
      window.__TEAR_PARITY_LIVE__ = live;
      const captures = [];
      let snapshot = agent.snapshot();
      const capture = (moment) => {
        if (snapshot.screen !== "playing" || live.has(snapshot.tick) || live.size >= maxCaptures) return;
        live.set(snapshot.tick, tap.liveFrame());
        captures.push({ tick: snapshot.tick, moment });
      };
      let seenTransitions = snapshot.bladeStateTransitions.length,
        contracted = false,
        lastRegular = Number.NEGATIVE_INFINITY;
      const statesCaptured = new Map();
      for (let frame = 0; frame < frames && snapshot.status === "running"; frame += 1) {
        const now = steps.filter((step) => step.frame === frame);
        for (const step of now) agent.steer(step.actions);
        snapshot = await agent.runAsync(1);
        for (const step of now) if (step.moment !== undefined) capture(step.moment);
        for (const transition of snapshot.bladeStateTransitions.slice(seenTransitions)) {
          const count = statesCaptured.get(transition.state) ?? 0;
          statesCaptured.set(transition.state, count + 1);
          if (count < 2) capture(`blade ${transition.state}`);
        }
        seenTransitions = snapshot.bladeStateTransitions.length;
        if (!contracted && snapshot.bladeTether.contracted) {
          contracted = true;
          capture("tether in");
        }
        if (snapshot.tick - lastRegular >= every) {
          lastRegular = snapshot.tick;
          capture("every");
        }
      }
      agent.steer(null);
      return {
        status: snapshot.status,
        screen: snapshot.screen,
        tick: snapshot.tick,
        hp: snapshot.hp,
        bladeStates: snapshot.bladeStates,
        transitions: snapshot.bladeStateTransitions.map((entry) => `${entry.tick}:${entry.state}`),
        tether: snapshot.bladeTether,
        captures,
      };
    },
    { steps: script(), frames: SEGMENT_FRAMES, every: EVERY_TICKS, maxCaptures: MAX_CAPTURES, weapon },
  );
}

/** Ends the run as a kept run, goes to the menu as a player does, and opens it through WATCH. */
async function keepAndWatch(page, seed) {
  await page.evaluate(() => window.__TEAR_WATCH_AGENT__.stop());
  assert.equal(await page.evaluate(() => window.__TEAR_REPLAY_TAP__.tapError()), null, "the recorder threw");
  await page.evaluate(() => window.__TEAR_REPLAY_TAP__.keep());
  const entries = await page.evaluate(() => window.__TEAR_REPLAY_TAP__.stored());
  const entry = Array.isArray(entries) ? entries.find((stored) => stored.key.endsWith(`:${seed}`)) : undefined;
  assert.ok(entry, `not stored (${JSON.stringify(entries)})`);
  const read = await page.evaluate((key) => window.__TEAR_REPLAY_TAP__.storedRecord(key), entry.key);
  assert.ok(read?.ok, `the stored record did not read back (${JSON.stringify(read)})`);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__.snapshot?.().screen === "paused", undefined, {
    timeout: STATE_WAIT_MS,
  });
  await page.evaluate(() => window.__TEAR_REPLAY_TAP__.quit());
  await page.waitForFunction(() => window.__TEAR_WATCH_AGENT__.snapshot?.().screen === "menu", undefined, {
    timeout: STATE_WAIT_MS,
  });
  assert.equal(await page.evaluate((value) => window.__TEAR_REPLAY_TAP__.watchKept(value), seed), true);
  return read.record;
}

/** Draws the replay at each captured tick and compares it with the live canvas there, in the page. */
function compare(page, dump) {
  return page.evaluate(
    ({ channel, dump }) => {
      const tap = window.__TEAR_REPLAY_TAP__,
        live = window.__TEAR_PARITY_LIVE__;
      const png = (image) => {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d").putImageData(image, 0, 0);
        return canvas.toDataURL("image/png");
      };
      const results = [];
      for (const tick of [...live.keys()].sort((left, right) => left - right)) {
        const played = live.get(tick),
          replayed = tap.replayFrame(tick);
        if (played === null || replayed === null) {
          results.push({ tick, missing: played === null ? "live" : "replay" });
          continue;
        }
        const mask = dump ? new ImageData(played.width, played.height) : null;
        let differing = 0;
        let left = played.width,
          top = played.height,
          right = -1,
          bottom = -1;
        for (let index = 0; index < played.data.length; index += 4) {
          const differs =
            Math.abs(played.data[index] - replayed.data[index]) > channel ||
            Math.abs(played.data[index + 1] - replayed.data[index + 1]) > channel ||
            Math.abs(played.data[index + 2] - replayed.data[index + 2]) > channel;
          if (!differs) continue;
          differing += 1;
          const pixel = index / 4,
            x = pixel % played.width,
            y = Math.floor(pixel / played.width);
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
          if (mask !== null) {
            mask.data[index] = 255;
            mask.data[index + 3] = 255;
          }
        }
        const share = differing / (played.width * played.height);
        results.push({
          tick,
          share,
          box: differing === 0 ? null : [left, top, right, bottom],
          ...(dump && differing > 0 ? { images: { live: png(played), replay: png(replayed), mask: png(mask) } } : {}),
        });
      }
      window.__TEAR_PARITY_LIVE__ = undefined;
      return results;
    },
    { channel: CHANNEL_TOLERANCE, dump },
  );
}

function writeDump(folder, weapon, results) {
  for (const result of results) {
    if (result.images === undefined) continue;
    for (const [name, url] of Object.entries(result.images))
      fs.writeFileSync(
        path.join(folder, `${weapon}-${String(result.tick).padStart(5, "0")}-${name}.png`),
        Buffer.from(url.slice(url.indexOf(",") + 1), "base64"),
      );
    delete result.images;
  }
}

withJourney(
  {
    name: "Replay 7c-2: the replay of each weapon's run shows what live play showed",
    tutorialSkipped: true,
    deferBoot: true,
    debugApi: false,
    query: { watchagent: "1" },
    storage: { tear_settings: JSON.stringify({ shake: 0, flash: 0 }) },
  },
  async (journey) => {
    const { page } = journey;
    const dump = process.env.TEAR_REPLAY_PARITY_DUMP;
    if (dump) fs.mkdirSync(dump, { recursive: true });
    const failures = [];
    for (const [index, weapon] of WEAPONS.entries()) {
      const seed = FIRST_SEED + index;
      await bootToMenu(journey);
      await startRun(page, { mode: "endless", difficulty: "easy", weapon, seed, skipCinematics: true });
      const segment = await playSegment(page, weapon);
      const record = await keepAndWatch(page, seed);
      const results = await compare(page, Boolean(dump));
      if (dump) writeDump(dump, weapon, results);
      const commands = record.run.actions.map((action) => action.command);
      const used = (intent) => commands.some((command) => command.type === "weapon" && command.intent === intent);
      const worst = results.reduce((most, result) => Math.max(most, result.share ?? 1), 0);
      console.log(
        weapon,
        JSON.stringify({
          segment: { ...segment, captures: segment.captures.length },
          recorded: { ticks: record.run.result.tick, throw: used("throw"), recall: used("recall") },
          worst,
          frames: results.map((result) => ({
            ...result,
            moment: segment.captures.find((entry) => entry.tick === result.tick)?.moment,
          })),
        }),
      );
      assert.equal(segment.status, "running", `${weapon}: the run ended during the segment`);
      assert.ok(segment.tether.contracted, `${weapon}: the tether was never held in`);
      assert.ok(segment.bladeStates.includes("flying"), `${weapon}: the blade was never thrown`);
      assert.ok(used("throw") && used("recall"), `${weapon}: the record holds no throw or no recall`);
      for (const result of results) {
        if (result.missing !== undefined) failures.push(`${weapon} tick ${result.tick}: no ${result.missing} frame`);
        else if (result.share > PIXEL_SHARE_TOLERANCE)
          failures.push(`${weapon} tick ${result.tick}: ${(result.share * 100).toFixed(2)}% of pixels differ`);
      }
    }
    assert.deepEqual(failures, [], "replay frames that do not match live play");
  },
);
