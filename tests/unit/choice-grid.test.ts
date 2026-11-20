import { describe, expect, it } from "vitest";
import { buttonGrid, choiceGrid } from "../../src/presentation/screens/choice-grid";

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

describe("buttonGrid", () => {
  // A measure that answers from the text alone: 10 px a character, and a taller row with a sub line.
  const measure = {
    buttonFitWidth: (_canvas: CanvasRenderingContext2D, button: { label: string }) => button.label.length * 10,
    buttonFitHeight: (_canvas: CanvasRenderingContext2D, button: { sub?: string | undefined; w: number }) =>
      button.sub === undefined ? 46 : 57,
  };
  const canvas = {} as CanvasRenderingContext2D;
  const options = { minColumns: 3, maxColumns: 3, maxRows: Number.MAX_SAFE_INTEGER, width: 320, gap: 10 };

  it("sizes every row from the tallest button, so one status line grows the whole list", () => {
    const plain = buttonGrid(
      measure,
      canvas,
      [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }],
      options,
    );
    expect(plain).toMatchObject({ columns: 3, rows: 2, rowHeight: 46 });
    const status = buttonGrid(measure, canvas, [{ label: "A" }, { label: "B", sub: "MET" }], options);
    expect(status.rowHeight).toBe(57);
  });

  it("drops columns until the widest name fits on one line", () => {
    const grid = buttonGrid(measure, canvas, [{ label: "SHORT" }, { label: "A MUCH LONGER NAME" }], options);
    expect(grid.columns).toBe(1);
    expect(grid.cellWidth).toBeGreaterThanOrEqual(180);
  });

  it("is empty for an empty list", () => {
    expect(buttonGrid(measure, canvas, [], options)).toMatchObject({ rows: 0, rowHeight: 0 });
  });
});
