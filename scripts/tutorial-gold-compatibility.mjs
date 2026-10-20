import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";

const roots = ["src/gameplay/entities/player.ts", "src/gameplay/entities/blade.ts", "src/gameplay/combat/live-opening-phase.ts",
  "src/gameplay/combat/live-collision-phase.ts", "src/gameplay/training/live-tutorial-runtime.ts",
  "src/gameplay/training/tutorial-gold-reference.ts", "src/tearbench/tutorial-course-driver.ts", "src/tearbench/tutorial-gold-generation.ts",
  "src/gameplay/training/tutorial-controller.ts", "src/gameplay/training/tutorial-arenas.ts", "src/tearbench/production-replay-composition.ts"];
const shipping = "src/gameplay/training/tutorial-gold-reference-data.json";
/** Exact source closure, no generated outputs, Git state, timestamps or artifact self-reference. */
export function tutorialGoldSourceFingerprint(root = process.cwd()) {
  const seen = new Map();
  function visit(path) {
    const absolute = resolve(root, path), key = relative(root, absolute).replaceAll("\\", "/");
    if (key.startsWith("../") || key === shipping || seen.has(key)) return;
    const source = readFileSync(absolute, "utf8").replaceAll("\r\n", "\n"); seen.set(key, source);
    if (!key.endsWith(".ts")) return;
    for (const item of ts.preProcessFile(source, true, true).importedFiles) {
      if (!item.fileName.startsWith(".")) continue;
      const base = resolve(dirname(absolute), item.fileName);
      const child = [base + ".ts", base + ".json", base + "/index.ts", base].find((candidate) => existsSync(candidate) && /\.(ts|json)$/.test(candidate));
      if (child) visit(relative(root, child));
    }
  }
  for (const path of roots) visit(path);
  seen.set("scripts/tutorial-gold-compatibility.mjs", readFileSync(resolve(root, "scripts/tutorial-gold-compatibility.mjs"), "utf8").replaceAll("\r\n", "\n"));
  const files = [...seen.keys()].sort();
  const hash = createHash("sha256");
  for (const path of files) hash.update(path).update("\0").update(seen.get(path)).update("\0");
  return Object.freeze({ sourceHash: hash.digest("hex"), files: Object.freeze(files) });
}
/** Builds check compatibility only; they never train, simulate or rewrite generated assets. */
export function assertTutorialGoldFresh(root = process.cwd()) {
  const expected = tutorialGoldSourceFingerprint(root);
  const corpus = JSON.parse(readFileSync(resolve(root, shipping), "utf8"));
  if (corpus?.format !== "tear-tutorial-gold.v1" || corpus.compatibility?.sourceHash !== expected.sourceHash) {
    throw new Error("Tutorial gold references are stale; set TEAR_TUTORIAL_GOLD_WRITE=1 and run pnpm exec vitest run tests/unit/tutorial-production-ghost.test.ts before building");
  }
  return expected.sourceHash;
}
