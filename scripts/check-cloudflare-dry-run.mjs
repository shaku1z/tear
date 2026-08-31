import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolve } from "node:path";
import process from "node:process";
import { RELEASE_REPOSITORY, verifyReleaseArtifact } from "./release-artifact.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const wranglerCli = resolve(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const expectedAssets = resolve(projectRoot, "dist", "standalone");
const config = readFileSync(resolve(projectRoot, "wrangler.jsonc"), "utf8");

if (!/"directory"\s*:\s*"\.\/dist\/standalone"/u.test(config)) {
  throw new Error("wrangler.jsonc must deploy only ./dist/standalone");
}
if (!existsSync(resolve(expectedAssets, "build-info.json"))) {
  throw new Error("dist/standalone/build-info.json is required before a Cloudflare dry-run");
}
const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8", stdio: "pipe" });
if (revision.status !== 0) throw new Error(`failed to resolve build revision: ${revision.stderr || revision.stdout}`);
const verified = await verifyReleaseArtifact({
  directory: expectedAssets,
  expectedRepository: process.env.GITHUB_REPOSITORY || RELEASE_REPOSITORY,
  expectedSha: revision.stdout.trim().toLowerCase(),
  expectedTarget: "standalone",
  expectedMode: "standalone",
  sourceDirectory: projectRoot,
});

const result = spawnSync(process.execPath, [wranglerCli, "deploy", "--dry-run"], {
  cwd: projectRoot,
  encoding: "utf8",
  stdio: "pipe",
});
if (result.error !== undefined) throw result.error;
const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
process.stdout.write(output);
if (result.status !== 0) throw new Error(`Wrangler dry-run failed with exit code ${String(result.status)}`);

const escapeCharacter = String.fromCharCode(27);
const plainOutput = output.split(escapeCharacter).map((part, index) => {
  if (index === 0) return part;
  const terminator = part.indexOf("m");
  return terminator < 0 ? part : part.slice(terminator + 1);
}).join("").replaceAll("\\", "/");
const normalizedExpected = expectedAssets.replaceAll("\\", "/");
if (!plainOutput.includes(`assets directory ${normalizedExpected}`)) {
  throw new Error(`Wrangler did not confirm the expected assets directory: ${normalizedExpected}`);
}
if (!/Read \d+ files? from the assets directory/u.test(plainOutput)) {
  throw new Error("Wrangler did not enumerate the generated standalone asset set");
}

console.log(`PASS Cloudflare dry-run boundary: ${normalizedExpected}`);
const receiptPath = resolve(projectRoot, "artifacts/tearbench/generated/cloudflare-dry-run.json");
await mkdir(dirname(receiptPath), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify({ format: "tear-cloudflare-dry-run", schemaVersion: 1,
  repository: process.env.GITHUB_REPOSITORY || RELEASE_REPOSITORY, sourceRevision: revision.stdout.trim().toLowerCase(),
  buildIdentityDigest: verified.metadata.buildIdentityDigest, artifactHash: verified.artifact.hash,
  assetsDirectory: "dist/standalone", status: "passed" }, null, 2)}\n`, "utf8");
