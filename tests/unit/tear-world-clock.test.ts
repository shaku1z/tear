import { describe, expect, it } from "vitest";

import * as gameConfig from "../../src/config/game-config";
import { createTearWorldClock } from "../../src/gameplay/runtime/tear-world-clock";
import * as runRandom from "../../src/simulation/run-random";

describe("per-world time and randomness", () => {
  it("hands every world its own clock instance", () => {
    const first = createTearWorldClock();
    const second = createTearWorldClock(12);

    first.sim += 3;

    expect(first.sim).toBe(3);
    expect(second.sim).toBe(12);
    expect(first).not.toBe(second);
  });

  it("keeps no module-level simulation clock or random instance", () => {
    // A shared instance is what would silently couple two worlds; the
    // composition root must create both and pass them inward.
    expect("CLOCK" in gameConfig).toBe(false);
    expect("GAME_RANDOM" in runRandom).toBe(false);
    expect("GAME_RANDOM_STREAMS" in runRandom).toBe(false);
    expect(typeof runRandom.createRunRandom).toBe("function");
  });

  it("gives each created world independent named random streams", () => {
    const first = runRandom.createRunRandom();
    const second = runRandom.createRunRandom();

    first.streams.reset("seed-a");
    second.streams.reset("seed-a");
    const advanced = [first.streams.stream("enemy-ai").next(), first.streams.stream("enemy-ai").next()];

    expect(advanced[0]).not.toBe(advanced[1]);
    expect(second.streams.stream("enemy-ai").next()).toBe(advanced[0]);
    expect(first.service.next()).toBe(second.service.next());
  });
});
