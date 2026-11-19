import { defineConfig } from "vitest/config";
import { indexedTestFiles } from "./scripts/test-files.mjs";

export default defineConfig({
  test: {
    // Only files in git's index run (tracked, or staged with `git add -N`): see scripts/test-files.mjs.
    include: indexedTestFiles(["tests/endurance/**/*.test.ts"]),
    environment: "node",
    testTimeout: 60_000,
  },
});
