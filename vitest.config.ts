import { defineConfig } from "vitest/config";
import { indexedTestFiles } from "./scripts/test-files.mjs";

export default defineConfig({
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
