import { createTearWorldClock, type TearWorldClock } from "./tear-world-clock";
import {
  createTearWorldConfiguration,
  type TearWorldConfiguration,
} from "./tear-world-configuration";
import { createRunRandom, type RunRandom } from "../../simulation/run-random";

/**
 * The data-only mutable services that every constructed simulation world owns.
 *
 * This intentionally has no process configuration, presentation, browser, or
 * app dependency. Composition selects a base data record and supplies outward
 * adapters after it receives this fresh world-owned core.
 */
export interface TearWorldBootstrap<Configuration extends object> {
  readonly configuration: TearWorldConfiguration<Configuration>;
  readonly clock: TearWorldClock;
  readonly random: RunRandom;
}

/**
 * Creates the one configuration record, simulation clock, and named random
 * streams for a world. No seed is applied here: the run lifecycle retains the
 * established authority for reset timing.
 */
export function createTearWorldBootstrap<Configuration extends object>(
  baseConfiguration: Configuration,
): TearWorldBootstrap<Configuration> {
  return Object.freeze({
    configuration: createTearWorldConfiguration(baseConfiguration),
    clock: createTearWorldClock(),
    random: createRunRandom(),
  } satisfies TearWorldBootstrap<Configuration>);
}
