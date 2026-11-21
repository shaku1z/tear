import { defineConfig } from "vitest/config";
import { indexedTestFiles } from "./scripts/test-files.mjs";

// The Firestore rules tests. They need the emulators, so run them through
// scripts/test-firestore-rules.mjs (`pnpm test:rules`), never with the plain vitest config.
export default defineConfig({
  define: { __TEAR_MOBILE__: "true" },
  test: {
    // Only files in git's index run (tracked, or staged with `git add -N`): see scripts/test-files.mjs.
    include: indexedTestFiles(["tests/rules/**/*.test.ts"]),
    environment: "node",
    // Every file shares one emulator database, which each test clears.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
