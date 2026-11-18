export interface GridCell {
  readonly column: number;
  readonly row: number;
  readonly span: number;
}
export interface ChoiceGrid {
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cells: readonly GridCell[];
}

export interface ChoiceGridOptions {
  readonly minColumns: number;
  readonly maxColumns: number;
  readonly maxRows: number;
  readonly width: number;
  readonly gap: number;
  /**
   * The narrowest a cell may be: the widest button's `ui.buttonFitWidth`. Columns drop until every
   * cell is at least this wide, so each label sits on one line at full size (down to one column).
   */
  readonly minCellWidth?: number;
}

/**
 * Flows `count` choices left to right into rows, the last one spanning `lastSpan` cells (it starts a
 * new row when the current one has too few cells left). Uses the fewest columns from `minColumns`
 * that keep the grid within `maxRows`; at `maxColumns`, or at the most columns whose cells still
 * hold `minCellWidth`, it stops widening and grows downward instead.
 */
export function choiceGrid(count: number, lastSpan: number, options: ChoiceGridOptions): ChoiceGrid {
  const cellWidth = (columns: number): number => (options.width - options.gap * (columns - 1)) / columns;
  let widest = options.maxColumns;
  while (widest > 1 && cellWidth(widest) < (options.minCellWidth ?? 0)) widest--;
  const flow = (columns: number): GridCell[] => {
    const cells: GridCell[] = [];
    for (let index = 0, slot = 0; index < count; index++) {
      const span = index === count - 1 ? Math.min(lastSpan, columns) : 1;
      if ((slot % columns) + span > columns) slot = Math.ceil(slot / columns) * columns;
      cells.push({ column: slot % columns, row: Math.floor(slot / columns), span });
      slot += span;
    }
    return cells;
  };
  let columns = Math.min(options.minColumns, widest),
    cells = flow(columns);
  const rowsOf = (list: readonly GridCell[]): number => list.reduce((rows, cell) => Math.max(rows, cell.row + 1), 0);
  while (rowsOf(cells) > options.maxRows && columns < widest) cells = flow(++columns);
  return { columns, rows: rowsOf(cells), cellWidth: cellWidth(columns), cells };
}
