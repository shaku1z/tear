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
    include: indexedTestFiles(["tests/endurance/**/*.test.ts"]),
    environment: "node",
    testTimeout: 60_000,
  },
});
