/**
 * Music musical-boundary maths.
 *
 * Cue swaps should land on a phrase boundary of the *currently playing* cue so a
 * transition arrives in the pocket instead of cutting mid-bar. Pure so it can be
 * tested without an AudioContext.
 */

/**
 * Absolute time of the next phrase boundary at or after `now`.
 *
 * Pass `loopSeconds` whenever the cue is a looping recording. Extrapolating bars
 * from `startedAt` forever assumes the loop is an exact whole number of bars; when
 * it is not, the computed grid and the actual audio separate a little more on
 * every wrap (measured at up to 1.25s per cycle before this was fixed). Anchoring
 * each cycle to the wrap keeps the grid tied to the audio no matter how long the
 * cue has been playing, and treats the wrap itself as a boundary — which it is,
 * since the loop is a musical repeat.
 */
export function nextBoundaryTime(
  now: number,
  startedAt: number,
  secondsPerBar: number,
  quantizeBars: number,
  minimumLead = 0.08,
  loopSeconds = 0,
): number {
  if (quantizeBars <= 0 || secondsPerBar <= 0) return now;
  const phrase = secondsPerBar * quantizeBars;
  const elapsed = Math.max(0, now - startedAt);

  const boundaryAfter = (from: number): number => {
    if (loopSeconds <= 0) return Math.ceil(from / phrase) * phrase;
    const cycle = Math.floor(from / loopSeconds);
    const within = from - cycle * loopSeconds;
    // The wrap ends the cycle even when it lands mid-phrase.
    const next = Math.min(Math.ceil(within / phrase) * phrase, loopSeconds);
    return cycle * loopSeconds + next;
  };

  let offset = boundaryAfter(elapsed);
  // Too close to schedule audibly? Take the following boundary instead.
  if (startedAt + offset - now < minimumLead) offset = boundaryAfter(offset + 1e-6);
  return startedAt + offset;
}

/** Seconds per bar for a cue's tempo and metre. */
export function secondsPerBar(tempo: number, beatsPerBar = 4): number {
  if (!Number.isFinite(tempo) || tempo <= 0) return 2;
  return (60 / tempo) * beatsPerBar;
}
