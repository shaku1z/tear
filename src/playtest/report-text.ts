/** Rows as a text table: every column as wide as its widest cell, two spaces between columns. */
export function table(rows: readonly (readonly string[])[]): string {
  const widths = rows[0]?.map((_, column) => Math.max(...rows.map((row) => row[column]?.length ?? 0))) ?? [];
  return rows
    .map((row) =>
      row
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

/** The items in groups that share a key, groups and items in their first order. */
export function groups<T>(items: readonly T[], key: (item: T) => string): readonly (readonly T[])[] {
  const byKey = new Map<string, T[]>();
  for (const item of items) byKey.set(key(item), [...(byKey.get(key(item)) ?? []), item]);
  return [...byKey.values()];
}
