import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, "public/vendor/tear-score");
const provenance = JSON.parse(await readFile(resolve(directory, "tear-score.provenance.json"), "utf8"));

async function verify(file, expected) {
  const bytes = await readFile(resolve(directory, file));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) throw new Error(`${file} checksum mismatch: ${actual}`);
  console.log(`PASS ${file} ${actual}`);
}

if (!provenance.engineVersion || !provenance.scoreVersion || !provenance.engineCommit) {
  throw new Error("TearScore provenance metadata is incomplete");
}
await verify(provenance.artifact, provenance.artifactSha256);
await verify(provenance.toneArtifact, provenance.toneSha256);
