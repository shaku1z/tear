/** Developer query that opens the snapshot editor in test builds: `?snapshot-editor=1`. */
export const SNAPSHOT_EDITOR_QUERY = "snapshot-editor" as const;

/** True when the query enables the snapshot editor (an empty value or `1`). */
export function isSnapshotEditorRequested(search: string): boolean {
  const parameters = new URLSearchParams(search);
  if (!parameters.has(SNAPSHOT_EDITOR_QUERY)) return false;
  const value = parameters.get(SNAPSHOT_EDITOR_QUERY);
  return value === "" || value === "1";
}
