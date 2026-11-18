/** The one guard for "a plain JSON object" (not null, not an array). Everything that reads untrusted data uses it. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
