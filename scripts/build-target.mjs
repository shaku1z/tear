import { spawnSync } from "node:child_process";
import process from "node:process";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { selectAudioProfile } from "./audio-profile.mjs";
import { pruneCrazyGamesArtifact } from "./crazygames-artifact-scope.mjs";
import { BUILD_MODES, resolveBuildMode } from "./build-targets.mjs";
import { RELEASE_REPOSITORY, writeReleaseArtifactMetadata } from "./release-artifact.mjs";
import { fanoutContentAddressedBuild, materializeContentAddressedBuild } from "./tearbench-build-artifact.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const mode = process.argv[2];
const resolved = resolveBuildMode(mode);
if (resolved === undefined)
  throw new Error(`usage: node scripts/build-target.mjs <${BUILD_MODES.join("|")}> [--out-dir path] [--preview-dev]`);
const target = resolved.name;
// --preview-dev: the target's preview build (config/build-targets.json "previewDev"), served below /dev/ on the preview origin.
const previewDev = process.argv.includes("--preview-dev");
if (previewDev && (resolved.target.previewDev === null || resolved.target.previewDev.mode !== mode))
  throw new Error(`--preview-dev needs a mode with a preview build: ${mode}`);
const outDirectoryIndex = process.argv.indexOf("--out-dir");
// The preview dev build is a deploy input, not a build the test tooling reads, so it is written in
// place like an --out-dir build instead of through the content-addressed store's fixed dist folders.
const direct = outDirectoryIndex >= 0 || previewDev;
const output =
  outDirectoryIndex >= 0
    ? resolve(process.argv[outDirectoryIndex + 1])
    : resolve(
        projectRoot,
        ...(previewDev
          ? resolved.target.previewDev.output.split("/")
          : ["dist", mode.startsWith("test-") ? `test-${target}` : target]),
      );
const staging = direct
  ? output
  : resolve(projectRoot, "artifacts/tearbench/generated/build-staging", `${mode}-${String(process.pid)}`);

function git(...args) {
  const result = spawnSync("git", args, { cwd: projectRoot, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

const sha = (process.env.TEAR_BUILD_GIT_SHA || process.env.GITHUB_SHA || git("rev-parse", "HEAD")).toLowerCase();
const repository = process.env.TEAR_BUILD_REPOSITORY || process.env.GITHUB_REPOSITORY || RELEASE_REPOSITORY;
const viteCli = resolve(projectRoot, "node_modules", "vite", "bin", "vite.js");
const result = spawnSync(process.execPath, [viteCli, "build", "--mode", mode, "--outDir", staging, "--emptyOutDir"], {
  cwd: projectRoot,
  encoding: "utf8",
  stdio: "inherit",
  env: previewDev ? { ...process.env, [resolved.target.previewDev.env]: "1" } : process.env,
});
if (result.error !== undefined) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const audio = await selectAudioProfile(staging, resolved.target.audioProfile);
console.log(
  `${target} audio: ${String(audio.swapped)} file(s) from its own encode, ${String(audio.droppedBytes)} bytes of other targets' audio left out`,
);
if (resolved.target.pruneUnrequestedFiles) {
  const pruned = await pruneCrazyGamesArtifact(staging);
  console.log(
    `${target} output: left out ${String(pruned.files.length)} unrequested file(s), ${String(pruned.bytes)} bytes`,
  );
}

const metadata = await writeReleaseArtifactMetadata({
  directory: staging,
  repository,
  sha,
  target,
  mode,
  sourceDirectory: projectRoot,
});
const stored = await materializeContentAddressedBuild({ workspaceRoot: projectRoot, directory: staging });
if (!direct) {
  await fanoutContentAddressedBuild({ workspaceRoot: projectRoot, record: stored.record, destination: output });
  await rm(staging, { recursive: true, force: true });
}
console.log(`PASS ${target} build attribution: ${metadata.sha} ${metadata.artifactHash}`);
console.log(
  `PASS ${target} content-addressed build: ${stored.record.buildIdentityDigest} ${stored.record.contentAddressedPath}`,
);
console.log((await import("./scene/package-files.mjs")).assertStorefrontArt(target, output));
