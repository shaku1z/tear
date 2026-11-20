// The committed tutorial gold corpus, read straight from disk. Tests that watch the game's copy arrive
// mock `src/gameplay/training/tutorial-gold-reference-data.json` with this module:
//   vi.mock("../../src/gameplay/training/tutorial-gold-reference-data.json", () => import("../support/tutorial-gold-data-from-disk"));
// The game still loads and decodes it through its own loader (tutorial-gold-shipping.ts); only the bundler's
// transform of the 1.4 MB JSON, several seconds on a busy machine and nothing those tests check, is skipped.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const data: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../src/gameplay/training/tutorial-gold-reference-data.json", import.meta.url)),
    "utf8",
  ),
);
export default data;
