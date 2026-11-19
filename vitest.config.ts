import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { indexedTestFiles } from "./scripts/test-files.mjs";

/** Node tests link the replay engine in directly; the game fetches it on first use. */
const replayEngineInTests = {
  find: /^(?:\.{1,2}\/)+(?:[\w-]+\/)*replay-engine$|^\.\/replay-engine$/,
  replacement: fileURLToPath(new URL("tests/support/replay-engine-eager.ts", import.meta.url)),
};

export default defineConfig({
  resolve: { alias: [replayEngineInTests] },
  test: {
    // Only files in git's index run (tracked, or staged with `git add -N`): see scripts/test-files.mjs.
    include: indexedTestFiles(["tests/unit/**/*.test.ts", "tests/unit/**/*.test.mjs", "tests/contract/**/*.test.ts"]),
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
});
