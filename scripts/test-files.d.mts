/** Index entries matching `globs`; see scripts/test-files.mjs. */
export function indexedTestFiles(
  globs: readonly string[],
  options?: { readonly git?: (args: readonly string[]) => string },
): string[];
