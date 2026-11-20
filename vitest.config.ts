import { defineConfig } from "vitest/config";
import { indexedTestFiles } from "./scripts/test-files.mjs";

export default defineConfig({
  // Unit tests see the build that keeps the mobile modules, like test builds and `vite dev` (src/test-build.d.ts).
  define: { __TEAR_MOBILE__: "true" },
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
