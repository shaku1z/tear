// How browser tests wait. Every wall-clock wait in a browser test is one of the kinds below, and
// eslint.config.mjs rejects a bare number as a `timeout` or as a `waitForTimeout` argument, so each
// wait says which kind it is.
//
// The game runs slower than real time on a loaded machine or a small CI runner. A test that waits
// for a game state must therefore treat time as a ceiling for giving up, never as the pass
// condition: the state is what passes or fails. When speed itself matters, assert simulation ticks
// or game time, not milliseconds of wall time.

/** Ceiling for waiting on a game state, a navigation, a load or a browser event. Never the pass condition. */
const STATE_WAIT_MS = 60_000;

/** Ceiling for cold loads, long recordings and whole runs that honestly take a minute or more. */
const SLOW_STATE_WAIT_MS = 180_000;

function milliseconds(kind, ms) {
  if (!Number.isFinite(ms) || ms < 0) throw new RangeError(`${kind} needs a non-negative duration, got ${ms}`);
  return ms;
}

/**
 * How often to look again: a polling interval, the pause between two reads of game state, or how
 * long to give an input before pressing it again. A slow machine makes the loop take more turns;
 * it never changes the result.
 */
const pollEvery = (ms) => milliseconds("pollEvery", ms);

/**
 * How long a physical input stays held, or how long a real-time sample (frame pacing, audio
 * scheduling) runs. The test measures real time on purpose.
 */
const holdFor = (ms) => milliseconds("holdFor", ms);

/** Something must NOT happen within this much wall time: the wait itself is the check. */
const notWithin = (ms) => milliseconds("notWithin", ms);

/**
 * A known defect, named so it can be counted and removed: a sleep that stands in for waiting on a
 * state (a screen finishing its entry, a control becoming ready, a frame being drawn). Replace it
 * with a wait on that state. Do not add new ones.
 */
const settleFor = (ms) => milliseconds("settleFor", ms);

/**
 * Reloads the page with the state-wait ceiling and, when the navigation does not finish, says what
 * the page was doing: which main-frame navigations and load events happened, and whether the old
 * document still answers. Playwright's own message is only "waiting for navigation", which names
 * no cause. Navigations elsewhere must pass `timeout` (eslint.config.mjs) so none falls back to
 * Playwright's unnamed 30 s default.
 */
async function reloadPage(page, options = {}) {
  const started = Date.now();
  const events = [];
  const note = (what) => events.push(`${what} at ${String(Date.now() - started)} ms`);
  const onNavigated = (frame) => {
    if (frame === page.mainFrame()) note(`navigated to ${frame.url()}`);
  };
  const onDomContentLoaded = () => note("domcontentloaded");
  const onCrash = () => note("renderer crashed");
  page.on("framenavigated", onNavigated);
  page.on("domcontentloaded", onDomContentLoaded);
  page.on("crash", onCrash);
  try {
    return await page.reload({ waitUntil: "domcontentloaded", ...options, timeout: STATE_WAIT_MS });
  } catch (error) {
    const answer = await Promise.race([
      page
        .evaluate(() => ({ url: location.href, readyState: document.readyState, visibility: document.visibilityState }))
        .then(
          (value) => `answered ${JSON.stringify(value)}`,
          (failure) => `evaluate failed: ${String(failure)}`,
        ),
      new Promise((resolve) => {
        setTimeout(resolve, 5000, "no answer within 5 s (main thread busy or hung)");
      }),
    ]);
    const events_ = events.length > 0 ? events.join("; ") : "none";
    throw new Error(`reload did not reach domcontentloaded: navigation events: ${events_}; page: ${answer}`, {
      cause: error,
    });
  } finally {
    page.off("framenavigated", onNavigated);
    page.off("domcontentloaded", onDomContentLoaded);
    page.off("crash", onCrash);
  }
}

module.exports = { STATE_WAIT_MS, SLOW_STATE_WAIT_MS, pollEvery, holdFor, notWithin, settleFor, reloadPage };
