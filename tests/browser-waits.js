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

module.exports = { STATE_WAIT_MS, SLOW_STATE_WAIT_MS, pollEvery, holdFor, notWithin, settleFor };
