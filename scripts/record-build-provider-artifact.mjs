import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { createProviderArtifactReceipt } from "./tearbench-build-artifact.mjs";

const usage = "usage: node scripts/record-build-provider-artifact.mjs --records path,path --output path --artifact-id id --artifact-digest digest --artifact-url url";
const allowed = new Set(["--records", "--output", "--artifact-id", "--artifact-digest", "--artifact-url"]), values = {};
if (process.argv.slice(2).length !== allowed.size * 2) throw new TypeError(usage);
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index], value = process.argv[index + 1];
  if (!allowed.has(name) || values[name] !== undefined || value === undefined) throw new TypeError(usage);
  values[name] = value;
}
const repository = process.env.GITHUB_REPOSITORY, runId = process.env.GITHUB_RUN_ID;
if (!repository || !runId) throw new TypeError("provider artifact recording requires GitHub repository and run identity");
const recordPaths = values["--records"].split(",").map((entry) => entry.trim()).filter(Boolean);
if (recordPaths.length === 0) throw new TypeError(usage);
const receipts = [];
for (const path of recordPaths) {
  const record = JSON.parse(await readFile(resolve(path), "utf8"));
  receipts.push(createProviderArtifactReceipt({ record, provider: "github-actions", artifactId: values["--artifact-id"],
    artifactDigest: values["--artifact-digest"], artifactUrl: values["--artifact-url"], repository, runId }));
}
const unsigned = { format: "tear-build-provider-bundle", schemaVersion: 1, repository, runId,
  artifactId: values["--artifact-id"], artifactDigest: values["--artifact-digest"], receipts };
const bundle = { ...unsigned, bundleDigest: createHash("sha256").update(JSON.stringify(unsigned)).digest("hex") };
const output = resolve(values["--output"]); await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
console.log(`PASS provider artifact receipt: ${bundle.artifactId} ${bundle.artifactDigest} (${String(receipts.length)} build identities)`);
