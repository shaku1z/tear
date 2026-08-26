import { spawnSync } from "node:child_process";
import process from "node:process";
import { resolve } from "node:path";
import { RELEASE_REPOSITORY, writeReleaseArtifactMetadata } from "./release-artifact.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const mode = process.argv[2];
const supportedModes = new Set(["standalone", "crazygames", "test-standalone", "test-crazygames"]);
if (!supportedModes.has(mode)) throw new Error("usage: node scripts/build-target.mjs <standalone|crazygames|test-standalone|test-crazygames> [--out-dir path]");
const target = mode.endsWith("crazygames") ? "crazygames" : "standalone";
const outDirectoryIndex = process.argv.indexOf("--out-dir");
const output = outDirectoryIndex >= 0
  ? resolve(process.argv[outDirectoryIndex + 1])
  : resolve(projectRoot, "dist", mode.startsWith("test-") ? `test-${target}` : target);

function git(...args) {
  const result = spawnSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

const sha = (process.env.TEAR_BUILD_GIT_SHA || process.env.GITHUB_SHA || git("rev-parse", "HEAD")).toLowerCase();
const repository = process.env.TEAR_BUILD_REPOSITORY || process.env.GITHUB_REPOSITORY || RELEASE_REPOSITORY;
const viteCli = resolve(projectRoot, "node_modules", "vite", "bin", "vite.js");
const result = spawnSync(process.execPath, [viteCli, "build", "--mode", mode, "--outDir", output, "--emptyOutDir"], {
  cwd: projectRoot,
  encoding: "utf8",
  stdio: "inherit",
});
if (result.error !== undefined) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const metadata = await writeReleaseArtifactMetadata({ directory: output, repository, sha, target, mode, sourceDirectory: projectRoot });
console.log(`PASS ${target} build attribution: ${metadata.sha} ${metadata.artifactHash}`);
