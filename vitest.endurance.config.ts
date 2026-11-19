import { defineConfig } from "vitest/config";
import { indexedTestFiles } from "./scripts/test-files.mjs";

export default defineConfig({
  // Unit tests see the build that keeps the mobile modules, like test builds and `vite dev` (src/test-build.d.ts).
  define: { __TEAR_MOBILE__: "true" },
  test: {
    // Only files in git's index run (tracked, or staged with `git add -N`): see scripts/test-files.mjs.
    include: indexedTestFiles(["tests/endurance/**/*.test.ts"]),
    environment: "node",
    testTimeout: 60_000,
  },
});
