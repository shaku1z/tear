import { expect } from "vitest";

import type { ProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";

/** The opening chapter's state, read from the running world. A checkpoint holds the same field but hashes the whole game to get it. */
function chapterState(environment: ProductionHeadlessEnvironment): unknown {
  return (environment.world().run() as { chapterState?: unknown } | undefined)?.chapterState;
}

/**
 * Since 6dfd99c7 a natural headless Campaign opening plays the real opening chapter with the player locked, as
 * live play does; fixed ticks neither time nor confirm its pages. Skip it as a player does: release confirm long
 * enough to arm the latch, then hold it (HOLD TO SKIP CHAPTER) through real application frames, at tick zero,
 * until the chapter hands over to the live wave. The state is sampled every eight frames, as it always was, so
 * the number of frames spent here does not change.
 */
export function skipOpeningChapter(environment: ProductionHeadlessEnvironment, label = "opening chapter"): void {
  expect(chapterState(environment), label).toBe("LORE_ENTER");
  for (let frame = 0; frame < 600 && (frame % 8 !== 0 || chapterState(environment) !== "WAVE_LIVE"); frame += 1) {
    environment.advanceApplicationFrame(1 / 60, { key: frame >= 12 });
  }
  expect(chapterState(environment), label).toBe("WAVE_LIVE");
  environment.advanceApplicationFrame(1 / 60, { key: false });
}
