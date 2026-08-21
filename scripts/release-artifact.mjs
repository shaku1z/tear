import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export const BUILD_INFO_FILE = "build-info.json";
export const RELEASE_REPOSITORY = "shaku1z/tear";

async function artifactEntries(root) {
  const entries = [];
  async function visit(directory) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const path = join(directory, child.name);
      if (child.isDirectory()) await visit(path);
      else if (child.isFile()) {
        const name = relative(root, path).replaceAll("\\", "/");
        if (name === BUILD_INFO_FILE) continue;
        const contents = await readFile(path);
        entries.push(Object.freeze({
          name,
          bytes: (await stat(path)).size,
          sha256: createHash("sha256").update(contents).digest("hex"),
        }));
      }
    }
  }
  await visit(root);
  return entries;
}

export async function calculateArtifactHash(directory) {
  const root = resolve(directory);
  const entries = await artifactEntries(root);
  const digest = createHash("sha256");
  for (const entry of entries) digest.update(`${entry.name}\0${String(entry.bytes)}\0${entry.sha256}\n`);
  return Object.freeze({ hash: digest.digest("hex"), files: entries.length });
}

export async function writeReleaseArtifactMetadata({ directory, repository, sha, target }) {
  if (!/^[0-9a-f]{40}$/u.test(sha)) throw new Error(`build SHA must be a full lowercase Git SHA: ${sha}`);
  if (!repository.includes("/")) throw new Error(`build repository must be owner/name: ${repository}`);
  if (!new Set(["standalone", "crazygames"]).has(target)) throw new Error(`unsupported build target: ${target}`);
  const root = resolve(directory);
  const artifact = await calculateArtifactHash(root);
  const metadata = Object.freeze({
    format: "tear-build-info",
    schemaVersion: 1,
    repository,
    sha,
    target,
    artifactHashAlgorithm: "sha256-path-size-content-v1",
    artifactHash: artifact.hash,
    artifactFiles: artifact.files,
  });
  await writeFile(join(root, BUILD_INFO_FILE), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return metadata;
}

export async function verifyReleaseArtifact({ directory, expectedRepository, expectedSha, expectedTarget }) {
  const root = resolve(directory);
  const metadata = JSON.parse(await readFile(join(root, BUILD_INFO_FILE), "utf8"));
  const artifact = await calculateArtifactHash(root);
  const errors = [];
  if (metadata.format !== "tear-build-info" || metadata.schemaVersion !== 1) errors.push("unsupported build-info format");
  if (metadata.repository !== expectedRepository) errors.push(`repository ${String(metadata.repository)} != ${expectedRepository}`);
  if (metadata.sha !== expectedSha) errors.push(`SHA ${String(metadata.sha)} != ${expectedSha}`);
  if (metadata.target !== expectedTarget) errors.push(`target ${String(metadata.target)} != ${expectedTarget}`);
  if (metadata.artifactHashAlgorithm !== "sha256-path-size-content-v1") errors.push("unsupported artifact hash algorithm");
  if (metadata.artifactHash !== artifact.hash) errors.push(`artifact hash ${String(metadata.artifactHash)} != ${artifact.hash}`);
  if (metadata.artifactFiles !== artifact.files) errors.push(`artifact file count ${String(metadata.artifactFiles)} != ${String(artifact.files)}`);
  if (errors.length > 0) throw new Error(`release artifact verification failed:\n- ${errors.join("\n- ")}`);
  return Object.freeze({ metadata, artifact });
}
