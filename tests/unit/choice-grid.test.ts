import { describe, expect, it } from "vitest";
import { choiceGrid } from "../../src/presentation/screens/choice-grid";

const base = { minColumns: 4, maxColumns: 4, maxRows: Number.MAX_SAFE_INTEGER, width: 430, gap: 10 } as const;

describe("choice grid", () => {
  it("keeps the asked columns while every cell holds the widest button", () => {
    const grid = choiceGrid(8, 1, { ...base, minCellWidth: 100 });
    expect([grid.columns, grid.rows, grid.cellWidth]).toEqual([4, 2, 100]);
  });

  it("drops columns until the widest button fits, then grows downward", () => {
    const grid = choiceGrid(8, 1, { ...base, minCellWidth: 101 });
    expect([grid.columns, grid.rows]).toEqual([3, 3]);
    expect(grid.cellWidth).toBeGreaterThanOrEqual(101);
  });

  it("caps widening for maxRows at the widest fitting column count", () => {
    const grid = choiceGrid(9, 1, { ...base, minColumns: 1, maxColumns: 9, maxRows: 1, minCellWidth: 130 });
    expect([grid.columns, grid.rows]).toEqual([3, 3]);
  });

  it("never goes below one column, even when nothing fits", () => {
    expect(choiceGrid(3, 1, { ...base, minCellWidth: 10_000 }).columns).toBe(1);
  });
});
