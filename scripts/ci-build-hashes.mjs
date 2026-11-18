// The content hash of each build Validate's build job hands to the browser shards.
//
//   node scripts/ci-build-hashes.mjs                     print the hashes as one JSON line (build job)
//   node scripts/ci-build-hashes.mjs --expect '<json>'   fail unless the files here hash the same (shards)
//
// dist/standalone and the CrazyGames package are the release artifact the deploy workflows publish;
// the shards test exactly those bytes, and the test builds beside them.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { calculateArtifactHash } from "./release-artifact.mjs";

const root = resolve(import.meta.dirname, "..");

/** What the browser shards serve, by name: build directories and the one package file. */
export const BUILDS = Object.freeze({
  standalone: "dist/standalone",
  crazygames: "dist/crazygames",
  "test-standalone": "dist/test-standalone",
  "test-crazygames": "dist/test-crazygames",
});
export const PACKAGE = "artifacts/packages/tear-crazygames.zip";

export async function buildHashes(base = root) {
  const hashes = {};
  for (const [name, directory] of Object.entries(BUILDS))
    hashes[name] = (await calculateArtifactHash(resolve(base, directory))).hash;
  hashes.package = createHash("sha256")
    .update(readFileSync(resolve(base, PACKAGE)))
    .digest("hex");
  return hashes;
}

/** The names whose hash differs from, or is missing in, the expected set. */
export function hashMismatches(expected, actual) {
  const names = new Set([...Object.keys(expected ?? {}), ...Object.keys(actual)]);
  return [...names].filter((name) => typeof expected?.[name] !== "string" || expected[name] !== actual[name]);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const actual = await buildHashes();
  const at = process.argv.indexOf("--expect");
  if (at === -1) {
    console.log(JSON.stringify(actual));
  } else {
    const expected = JSON.parse(process.argv[at + 1] ?? "null");
    const mismatches = hashMismatches(expected, actual);
    for (const name of Object.keys(actual)) console.log(`${name}: ${actual[name]}`);
    if (mismatches.length > 0) {
      for (const name of mismatches)
        console.log(
          `::error title=build hash::${name}: ${String(actual[name])} here, ${String(expected?.[name])} built`,
        );
      process.exitCode = 1;
    } else {
      console.log("every build matches the build job's");
    }
  }
}
