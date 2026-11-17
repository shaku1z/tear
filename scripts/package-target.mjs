import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildTarget } from "./build-targets.mjs";
import { verifyReleaseArtifact } from "./release-artifact.mjs";
import { filesBelow, zipFiles } from "./zip-archive.mjs";

const root = path.resolve(import.meta.dirname, "..");
const LABELS = Object.freeze({ crazygames: "CrazyGames", itch: "itch.io" });

function isRepositoryMaterial(name) {
  return (
    /(^|\/)(?:src|tests?|plans?|\.git(?:hub)?)(?:\/|$)/u.test(name) ||
    /(?:^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|wrangler\.jsonc|vite\.config\.[cm]?[jt]s|tsconfig(?:\.[^.]+)?\.json|eslint\.config\.[cm]?[jt]s)$/u.test(
      name,
    )
  );
}

function isStandalonePwaArtifact(name) {
  const basename = path.posix.basename(name);
  return (
    name === "_headers" ||
    name === "manifest.webmanifest" ||
    name === "sw.js" ||
    basename === "registerSW.js" ||
    basename.startsWith("workbox-")
  );
}

function isRevisionAsset(name) {
  return /^audio\/cues\/[^/]+\/opus\/revisions\/[^/]+\//u.test(name);
}

async function activeRevisionAssets(input, names) {
  const referenced = new Set();
  const cueNames = names.filter((name) => /^audio\/cues\/[^/]+\/cue\.json$/u.test(name));
  for (const cueName of cueNames) {
    const cue = JSON.parse(await readFile(path.join(input, ...cueName.split("/")), "utf8"));
    for (const stem of Array.isArray(cue?.stems) ? cue.stems : []) {
      for (const source of Array.isArray(stem?.sources) ? stem.sources : []) {
        if (typeof source?.url !== "string") continue;
        const candidate = path.posix.normalize(
          path.posix.join(path.posix.dirname(cueName), source.url.replaceAll("\\", "/")),
        );
        if (isRevisionAsset(candidate) && names.includes(candidate)) referenced.add(candidate);
      }
    }
  }
  return referenced;
}

/**
 * Packages a release build of `targetName` as the portal upload ZIP, after the checks the portal
 * would otherwise find: attribution, index.html at the root, no repository material, no standalone
 * PWA files, relative asset URLs and the target's file, path and size limits
 * (config/build-targets.json).
 */
export async function packageTarget(targetName, { input, output } = {}) {
  const target = buildTarget(targetName);
  if (target.package === null) throw new Error(`${targetName} has no upload package`);
  const label = LABELS[targetName] ?? targetName;
  const directory = input ?? path.join(root, "dist", targetName);
  const archivePath = output ?? path.join(root, ...target.package.path.split("/"));
  if (!(await stat(directory).catch(() => undefined))?.isDirectory()) {
    throw new Error(`dist/${targetName} is missing; run pnpm build:${targetName} first`);
  }
  const buildInfo = JSON.parse(await readFile(path.join(directory, "build-info.json"), "utf8"));
  await verifyReleaseArtifact({
    directory,
    expectedRepository: buildInfo.repository,
    expectedSha: buildInfo.sha,
    expectedTarget: targetName,
    expectedMode: targetName,
    sourceDirectory: root,
    allowDirty: true,
  });
  const allNames = await filesBelow(directory);
  const activeRevisions = await activeRevisionAssets(directory, allNames);
  const names = allNames.filter((name) => !isRevisionAsset(name) || activeRevisions.has(name));
  const prunedRevisionCount = allNames.length - names.length;
  if (prunedRevisionCount > 0)
    console.log(`Excluded ${prunedRevisionCount} unreachable revision asset(s) from ${label} package`);
  if (!names.includes("index.html")) throw new Error(`${label} package must have index.html at its root`);
  if (names.some((name) => name.endsWith(".map") || isRepositoryMaterial(name))) {
    throw new Error(`${label} package contains development or repository artifacts`);
  }
  const { maxFiles, maxFileBytes, maxPathLength } = target.limits;
  if (names.length > maxFiles) throw new Error(`${label} package has ${names.length} files; limit is ${maxFiles}`);
  if (maxPathLength !== null) {
    const long = names.find((name) => name.length > maxPathLength);
    if (long !== undefined) throw new Error(`${label} package path is over ${maxPathLength} characters: ${long}`);
  }
  if (maxFileBytes !== null) {
    for (const name of names) {
      const { size } = await stat(path.join(directory, ...name.split("/")));
      if (size > maxFileBytes)
        throw new Error(`${label} package file ${name} is ${size} bytes; limit is ${maxFileBytes}`);
    }
  }
  if (names.some(isStandalonePwaArtifact)) throw new Error(`${label} package must not include standalone PWA files`);
  const html = await readFile(path.join(directory, "index.html"), "utf8");
  if (/rel=["']manifest["']/u.test(html) || /(?:src|href)=["']\/assets\//u.test(html)) {
    throw new Error(`${label} index contains standalone or root-absolute asset markup`);
  }
  const archive = await zipFiles(directory, names);
  if (archive.length > target.package.maxArchiveBytes)
    throw new Error(`${label} ZIP is ${archive.length} bytes; Tear's budget is ${target.package.maxArchiveBytes}`);
  await mkdir(path.dirname(archivePath), { recursive: true });
  await writeFile(archivePath, archive);
  console.log(
    `${label} upload package: ${path.relative(root, archivePath)} (${names.length} files, ${archive.length} bytes, index.html at root)`,
  );
  return { names, bytes: archive.length, path: archivePath };
}

/** Reads `--input path --output path` (both or neither) from a command line. */
export function packageArguments(script, argv) {
  const inputIndex = argv.indexOf("--input");
  const outputIndex = argv.indexOf("--output");
  if (inputIndex >= 0 !== outputIndex >= 0 || (inputIndex >= 0 && argv.length !== 6)) {
    throw new TypeError(`usage: node scripts/${script} [--input path --output path]`);
  }
  return inputIndex >= 0
    ? { input: path.resolve(argv[inputIndex + 1]), output: path.resolve(argv[outputIndex + 1]) }
    : {};
}
