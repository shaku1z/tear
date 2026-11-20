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
  // Unit tests see the build that keeps the mobile modules, like test builds and `vite dev` (src/test-build.d.ts).
  define: { __TEAR_MOBILE__: "true" },
  test: {
    // Only files in git's index run (tracked, or staged with `git add -N`): see scripts/test-files.mjs.
    include: indexedTestFiles(["tests/endurance/**/*.test.ts"]),
    environment: "node",
    testTimeout: 60_000,
  },
});
