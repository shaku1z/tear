export type MigrationSource = "legacy" | number | null;

export type MigrationResult<T> =
  | Readonly<{ ok: true; value: T; migratedFrom: MigrationSource }>
  | Readonly<{ ok: false; code: "invalid" | "unsupported-version"; error: string }>;

export const invalid = <T = never>(error: string): MigrationResult<T> => ({ ok: false, code: "invalid", error });
export const unsupportedVersion = <T = never>(kind: string, version: number): MigrationResult<T> => ({
  ok: false,
  code: "unsupported-version",
  error: `${kind} schema version ${String(version)} is newer than this build supports.`,
});
