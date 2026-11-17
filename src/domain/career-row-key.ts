/** The stable identity of a career archive row: the entry, its root, and its group when it has one. */
export const careerRowKey = (
  row: Readonly<{ entry: Readonly<{ id: string; root: string }>; group?: string }>,
): string =>
  `career:v1:${encodeURIComponent(row.entry.id)}:${row.entry.root}${row.group ? `#${encodeURIComponent(row.group)}` : ""}`;
