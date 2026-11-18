import { describe, expect, it } from "vitest";
import { scrollRest } from "../../src/presentation/screens/compact-page";

/** The top of each block when they are stacked `gap` apart. */
function tops(heights: readonly number[], gap: number): number[] {
  const list: number[] = [];
  let y = 0;
  for (const height of heights) {
    list.push(y);
    y += height + gap;
  }
  return list;
}

describe("scroll rest", () => {
  it("does not scroll content that fits its view", () => {
    expect(scrollRest([50, 50], 10, 200, 80)).toEqual({ offset: 0, maximum: 0 });
    expect(scrollRest([], 10, 200, 80)).toEqual({ offset: 0, maximum: 0 });
  });

  it("ends on the first row edge at or past the content's end, so the last row is whole", () => {
    // Ten 50 px rows 10 apart: 590 px of content in a 200 px view ends at 390; the next row edge is 420.
    const { maximum } = scrollRest(Array<number>(10).fill(50), 10, 200, Number.MAX_SAFE_INTEGER);
    expect(maximum).toBe(420);
    expect(420 + 200).toBeGreaterThanOrEqual(590);
  });

  it("rests on a row edge at every scroll, and wheel steps of any size reach the end in order", () => {
    const heights = [40, 72, 72, 72, 30, 72, 72, 72, 72, 30, 72, 72],
      gap = 8,
      edges = tops(heights, gap);
    for (const step of [1, 7, 48, 100, 333]) {
      let previous = 0,
        last = { offset: 0, maximum: 1 };
      for (let raw = 0; last.offset < last.maximum; raw += step) {
        last = scrollRest(heights, gap, 260, raw);
        expect(edges, `step ${String(step)} @${String(raw)}`).toContain(last.offset);
        expect(last.offset).toBeGreaterThanOrEqual(previous);
        previous = last.offset;
        expect(raw, `step ${String(step)} reaches the end`).toBeLessThan(10_000);
      }
    }
  });

  it("scrolls freely inside a block taller than the view, so all of it can be read", () => {
    // A 100 px block, an 800 px block and a 100 px block, 10 apart, in a 300 px view.
    expect(scrollRest([100, 800, 100], 10, 300, 300).offset).toBe(300);
    expect(scrollRest([100, 800, 100], 10, 300, 610).offset).toBe(610);
    expect(scrollRest([100, 800, 100], 10, 300, 40).offset).toBe(0);
    // The view would reach the content's end at 720, part-way into the 800 px block, so it ends on the last block's top.
    expect(scrollRest([100, 800, 100], 10, 300, Number.MAX_SAFE_INTEGER)).toEqual({ offset: 920, maximum: 920 });
  });
});
