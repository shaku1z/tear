import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export const BUILD_INFO_FILE = "build-info.json";
export const RELEASE_REPOSITORY = "shaku1z/tear";
const BUILD_CONFIGURATION_FILES = Object.freeze([
  "package.json", "pnpm-lock.yaml", "vite.config.ts", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json",
]);

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
function hash(value) { return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex"); }

async function buildConfigurationIdentity(directory, mode) {
  const root = resolve(directory), files = [];
  for (const name of BUILD_CONFIGURATION_FILES) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    const contents = await readFile(path);
    files.push({ path: name, bytes: contents.length, sha256: createHash("sha256").update(contents).digest("hex") });
  }
  const viteEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("VITE_"))
    .sort(([left], [right]) => left.localeCompare(right)));
  const environmentDigest = hash(viteEnvironment);
  return Object.freeze({ mode, files: Object.freeze(files), environmentDigest,
    digest: hash({ mode, files, environmentDigest }) });
}
function buildToolchainIdentity(directory) {
  const packagePath = join(resolve(directory), "package.json");
  const packageSource = existsSync(packagePath) ? JSON.parse(readFileSync(packagePath, "utf8")) : {};
  const value = Object.freeze({ node: process.version, packageManager: packageSource.packageManager ?? "unknown",
    vite: packageSource.devDependencies?.vite ?? packageSource.dependencies?.vite ?? "unknown" });
  return Object.freeze({ ...value, digest: hash(value) });
}

function sourceGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

export function readSourceIdentitySync(directory) {
  const root = resolve(directory);
  const digest = createHash("sha256");
  const names = sourceGit(root, ["ls-files", "-co", "--exclude-standard", "-z"])
    .split("\0").filter(Boolean).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  for (const name of names) {
    const sourcePath = join(root, name);
    if (!existsSync(sourcePath)) { digest.update(`${name}\0deleted\n`); continue; }
    const contents = readFileSync(sourcePath);
    digest.update(`${name}\0${String(contents.length)}\0`);
    digest.update(contents);
    digest.update("\n");
  }
  const status = sourceGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]).trim();
  return Object.freeze({ revision: sourceGit(root, ["rev-parse", "HEAD"]).trim().toLowerCase(),
    state: status.length === 0 ? "clean" : "dirty", fingerprint: digest.digest("hex") });
}

export async function readSourceIdentity(directory) { return readSourceIdentitySync(directory); }

async function artifactEntries(root) {
  const entries = [];
  async function visit(directory) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
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

export async function writeReleaseArtifactMetadata({ directory, repository, sha, target, mode, sourceDirectory }) {
  if (!/^[0-9a-f]{40}$/u.test(sha)) throw new Error(`build SHA must be a full lowercase Git SHA: ${sha}`);
  if (!repository.includes("/")) throw new Error(`build repository must be owner/name: ${repository}`);
  if (!new Set(["standalone", "crazygames"]).has(target)) throw new Error(`unsupported build target: ${target}`);
  const root = resolve(directory);
  const artifact = await calculateArtifactHash(root);
  const source = readSourceIdentitySync(sourceDirectory ?? root);
  const configuration = await buildConfigurationIdentity(sourceDirectory ?? root, mode ?? target);
  const toolchain = buildToolchainIdentity(sourceDirectory ?? root);
  if (sha !== source.revision) throw new Error(`build SHA ${sha} does not match actual source revision ${source.revision}`);
  const identity = Object.freeze({ repository, sourceRevision: source.revision, sourceFingerprint: source.fingerprint,
    target, mode: mode ?? target, artifactHash: artifact.hash, artifactFiles: artifact.files,
    toolchainDigest: toolchain.digest, configurationDigest: configuration.digest });
  const metadata = Object.freeze({
    format: "tear-build-info",
    schemaVersion: 1,
    repository,
    sha,
    target,
    ...(mode === undefined ? {} : { mode }),
    sourceRevision: source.revision,
    sourceState: source.state,
    sourceFingerprint: source.fingerprint,
    artifactHashAlgorithm: "sha256-path-size-content-v1",
    artifactHash: artifact.hash,
    artifactFiles: artifact.files,
    toolchain,
    configuration,
    buildIdentityDigest: hash(identity),
    contentAddressedPath: `artifacts/tearbench/builds/${hash(identity)}/payload`,
  });
  await writeFile(join(root, BUILD_INFO_FILE), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return metadata;
}

export async function verifyReleaseArtifact({ directory, expectedRepository, expectedSha, expectedTarget, expectedMode,
  sourceDirectory, allowDirty = false }) {
  const root = resolve(directory);
  const metadata = JSON.parse(await readFile(join(root, BUILD_INFO_FILE), "utf8"));
  const artifact = await calculateArtifactHash(root);
  const errors = [];
  if (metadata.format !== "tear-build-info" || metadata.schemaVersion !== 1) errors.push("unsupported build-info format");
  if (metadata.repository !== expectedRepository) errors.push(`repository ${String(metadata.repository)} != ${expectedRepository}`);
  if (metadata.sha !== expectedSha) errors.push(`SHA ${String(metadata.sha)} != ${expectedSha}`);
  if (metadata.sourceRevision !== undefined && metadata.sourceRevision !== metadata.sha) errors.push("artifact SHA does not match its source revision");
  if (metadata.target !== expectedTarget) errors.push(`target ${String(metadata.target)} != ${expectedTarget}`);
  if (expectedMode !== undefined && metadata.mode !== expectedMode) errors.push(`mode ${String(metadata.mode)} != ${expectedMode}`);
  if (metadata.artifactHashAlgorithm !== "sha256-path-size-content-v1") errors.push("unsupported artifact hash algorithm");
  if (metadata.artifactHash !== artifact.hash) errors.push(`artifact hash ${String(metadata.artifactHash)} != ${artifact.hash}`);
  if (metadata.artifactFiles !== artifact.files) errors.push(`artifact file count ${String(metadata.artifactFiles)} != ${String(artifact.files)}`);
  const configuration = await buildConfigurationIdentity(sourceDirectory ?? root, metadata.mode ?? metadata.target);
  const toolchain = buildToolchainIdentity(sourceDirectory ?? root);
  const identity = { repository: metadata.repository, sourceRevision: metadata.sourceRevision, sourceFingerprint: metadata.sourceFingerprint,
    target: metadata.target, mode: metadata.mode ?? metadata.target, artifactHash: metadata.artifactHash,
    artifactFiles: metadata.artifactFiles, toolchainDigest: toolchain.digest, configurationDigest: configuration.digest };
  const identityDigest = hash(identity);
  if (metadata.toolchain?.digest !== toolchain.digest) errors.push("build toolchain identity is stale");
  if (metadata.configuration?.digest !== configuration.digest) errors.push("build configuration identity is stale");
  if (metadata.buildIdentityDigest !== identityDigest) errors.push("build identity digest is stale");
  if (metadata.contentAddressedPath !== `artifacts/tearbench/builds/${identityDigest}/payload`) errors.push("build content-addressed path is stale");
  if (sourceDirectory !== undefined) {
    const source = readSourceIdentitySync(sourceDirectory);
    if (metadata.sourceRevision !== source.revision) errors.push(`source revision ${String(metadata.sourceRevision)} != ${source.revision}`);
    if (metadata.sourceState !== source.state) errors.push(`source state ${String(metadata.sourceState)} != ${source.state}`);
    if (metadata.sourceFingerprint !== source.fingerprint) errors.push("source fingerprint does not match the served build");
    if (source.state === "dirty" && !allowDirty) errors.push("source checkout is dirty; exact release certification is refused");
  }
  if (metadata.sourceState === "dirty" && !allowDirty) errors.push("artifact was built from a dirty source checkout");
  if (errors.length > 0) throw new Error(`release artifact verification failed:\n- ${errors.join("\n- ")}`);
  return Object.freeze({ metadata, artifact });
}
