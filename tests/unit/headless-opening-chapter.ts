import { expect } from "vitest";

import { CHAPTER_WAVE_LIVE, chapterState, skipChapter } from "../../src/playtest/headless/chapter";
import type { ProductionHeadlessEnvironment } from "../../src/playtest/headless/production-headless-environment";

/**
 * Since 6dfd99c7 a natural headless Campaign opening plays the real opening chapter with the player locked, as
 * live play does. Skips it the way the playtest tool does (`skipChapter`), and requires that the run was showing
 * the opening chapter and that it handed over to the live wave.
 */
export function skipOpeningChapter(environment: ProductionHeadlessEnvironment, label = "opening chapter"): void {
  expect(chapterState(environment), label).toBe("LORE_ENTER");
  expect(skipChapter(environment), label).toBe(true);
  expect(chapterState(environment), label).toBe(CHAPTER_WAVE_LIVE);
}
