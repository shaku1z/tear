import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { indexedTestFiles, processTestFiles } from "./scripts/test-files.mjs";

/** Node tests link the replay engine in directly; the game fetches it on first use. */
const replayEngineInTests = {
  find: /^(?:\.{1,2}\/)+(?:[\w-]+\/)*replay-engine$|^\.\/replay-engine$/,
  replacement: fileURLToPath(new URL("tests/support/replay-engine-eager.ts", import.meta.url)),
};

// Only files in git's index run (tracked, or staged with `git add -N`): see scripts/test-files.mjs.
const globs = ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.mjs", "tests/contract/**/*.test.ts"];
const files = indexedTestFiles(globs);
const starts = new Set(processTestFiles(globs));
const processFiles = files.filter((file) => starts.has(file));

export default defineConfig({
  resolve: { alias: [replayEngineInTests] },
  // Unit tests see the build that keeps the mobile modules, like test builds and `vite dev` (src/test-build.d.ts).
  define: { __TEAR_MOBILE__: "true" },
  test: {
    environment: "node",
    projects: [
      // Every file that only computes, in parallel.
      { extends: true, test: { name: "unit", include: files.filter((file) => !processFiles.includes(file)) } },
      // Files that start processes (git, node, gh) run one at a time, after the unit project: a process
      // start beside a full set of busy workers is what timed such tests out on loaded machines.
      {
        extends: true,
        test: { name: "process", include: processFiles, fileParallelism: false, sequence: { groupOrder: 1 } },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
