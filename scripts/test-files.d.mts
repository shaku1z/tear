/** Index entries matching `globs`; see scripts/test-files.mjs. */
export function indexedTestFiles(
  globs: readonly string[],
  options?: { readonly git?: (args: readonly string[]) => string },
): string[];

/** Whether a test file's text names the child_process module; see scripts/test-files.mjs. */
export function startsProcesses(text: string): boolean;

/** Index entries matching `globs` whose text names child_process; see scripts/test-files.mjs. */
export function processTestFiles(
  globs: readonly string[],
  options?: { readonly git?: (args: readonly string[]) => string },
): string[];
