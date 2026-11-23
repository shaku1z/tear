/**
 * Watch's seek cache (src/app/replay/record-seek-cache.ts): checkpoints on an even grid, the latest one at
 * or before a tick, and a budget that widens the grid instead of growing past its limit.
 */
import { describe, expect, it } from "vitest";

import { createRecordSeekCache } from "../../src/app/replay/record-seek-cache";
import type { RecordCheckpoint } from "../../src/app/replay/record-world";

const checkpoint = (tick: number) => ({ tick }) as unknown as RecordCheckpoint;

describe("the seek cache", () => {
  it("keeps checkpoints on its grid and finds the latest at or before a tick", () => {
    const cache = createRecordSeekCache({ every: 10, limit: 8 });
    expect(cache.wants(0)).toBe(false);
    expect(cache.wants(5)).toBe(false);
    expect(cache.wants(10)).toBe(true);
    for (const tick of [10, 20, 30]) cache.add(checkpoint(tick));
    cache.add(checkpoint(25));
    expect(cache.wants(20)).toBe(false);
    expect(cache.held()).toEqual({ ticks: [10, 20, 30], every: 10 });
    expect(cache.nearest(9)).toBeUndefined();
    expect(cache.nearest(20)?.tick).toBe(20);
    expect(cache.nearest(29)?.tick).toBe(20);
    expect(cache.nearest(1_000)?.tick).toBe(30);
  });

  it("widens its grid at the limit, so a long run keeps evenly spaced checkpoints over its whole length", () => {
    const cache = createRecordSeekCache({ every: 10, limit: 4 });
    for (let tick = 10; tick <= 200; tick += 10) if (cache.wants(tick)) cache.add(checkpoint(tick));
    const { ticks, every } = cache.held();
    expect(ticks.length).toBeLessThanOrEqual(4);
    expect(every).toBe(80);
    expect(ticks).toEqual([80, 160]);
    // Every tick past the first checkpoint is at most one spacing from the checkpoint it starts at.
    for (let tick = 80; tick <= 200; tick += 1) expect(tick - (cache.nearest(tick)?.tick ?? 0)).toBeLessThan(every);
  });
});
