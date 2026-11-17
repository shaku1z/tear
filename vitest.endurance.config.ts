import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Node tests link the replay engine in directly; the game fetches it on first use. */
const replayEngineInTests = {
  find: /^(?:\.{1,2}\/)+(?:[\w-]+\/)*replay-engine$|^\.\/replay-engine$/,
  replacement: fileURLToPath(new URL("tests/support/replay-engine-eager.ts", import.meta.url)),
};

export default defineConfig({
  resolve: { alias: [replayEngineInTests] },
  test: {
    include: ["tests/endurance/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
  },
});
