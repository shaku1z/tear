import { describe, expect, it } from "vitest";
import { FixedStepScheduler } from "../../src/simulation/fixed-step";

function simulate(renderRate: number): { tick: number; value: number } {
  const scheduler = new FixedStepScheduler();
  let value = 0;
  const frames = renderRate * 10;
  for (let frame = 0; frame < frames; frame += 1) {
    scheduler.advance(1000 / renderRate, (seconds) => { value += 120 * seconds; });
  }
  return { tick: scheduler.tick, value };
}

describe("FixedStepScheduler", () => {
  it("produces the same simulation at common render rates", () => {
    expect(simulate(30)).toEqual(simulate(60));
    expect(simulate(144)).toEqual(simulate(60));
  });

  it("bounds catch-up work and reports dropped wall time", () => {
    const scheduler = new FixedStepScheduler({ maxCatchUpSteps: 4 });
    const result = scheduler.advance(1000, () => undefined);
    expect(result.steps).toBe(4);
    expect(result.droppedMilliseconds).toBeGreaterThan(900);
  });
});
