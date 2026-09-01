import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { calculateArtifactHash } from "./release-artifact.mjs";

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
function digest(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
function safeProviderId(value, label) {
  if (typeof value !== "string" || value.length === 0 || /[\r\n]/u.test(value)) throw new TypeError(`${label} is required`);
  return value;
}

export async function verifyContentAddressedBuild({ workspaceRoot, directory, expectedRecord }) {
  const root = resolve(workspaceRoot), payload = resolve(directory);
  const info = JSON.parse(await readFile(resolve(payload, "build-info.json"), "utf8"));
  const artifact = await calculateArtifactHash(payload);
  const stored = relative(root, payload).replaceAll("\\", "/");
  const errors = [];
  if (artifact.hash !== info.artifactHash || artifact.files !== info.artifactFiles) errors.push("stored build bytes differ from build-info");
  if (stored !== info.contentAddressedPath) errors.push("stored build is outside its content-addressed identity");
  if (expectedRecord !== undefined && (expectedRecord.buildIdentityDigest !== info.buildIdentityDigest
    || expectedRecord.contentAddressedPath !== stored || expectedRecord.artifactHash !== artifact.hash)) errors.push("build record does not bind stored bytes");
  if (errors.length > 0) throw new Error(`content-addressed build rejected:\n- ${errors.join("\n- ")}`);
  return Object.freeze({ info, artifact, contentAddressedPath: stored });
}

export async function materializeContentAddressedBuild({ workspaceRoot, directory }) {
  const root = resolve(workspaceRoot), source = resolve(directory);
  const info = JSON.parse(await readFile(resolve(source, "build-info.json"), "utf8"));
  if (!/^[0-9a-f]{64}$/u.test(info.buildIdentityDigest)
    || info.contentAddressedPath !== `artifacts/tearbench/builds/${info.buildIdentityDigest}/payload`) {
    throw new TypeError("build-info has no valid content-addressed identity");
  }
  const payload = resolve(root, info.contentAddressedPath), parent = dirname(payload);
  if (!existsSync(payload)) {
    await mkdir(parent, { recursive: true });
    const temporary = resolve(parent, `payload.tmp-${process.pid}-${Date.now()}`);
    try {
      await cp(source, temporary, { recursive: true, errorOnExist: true });
      await rename(temporary, payload);
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      if (!existsSync(payload)) throw error;
    }
  }
  const verified = await verifyContentAddressedBuild({ workspaceRoot: root, directory: payload });
  const unsigned = { format: "tear-build-artifact-record", schemaVersion: 1, repository: info.repository,
    sourceRevision: info.sourceRevision, sourceFingerprint: info.sourceFingerprint, target: info.target, mode: info.mode,
    artifactHash: verified.artifact.hash, artifactFiles: verified.artifact.files,
    toolchainDigest: info.toolchain.digest, configurationDigest: info.configuration.digest,
    buildIdentityDigest: info.buildIdentityDigest, contentAddressedPath: verified.contentAddressedPath };
  const record = Object.freeze({ ...unsigned, recordDigest: digest(unsigned) });
  const recordPath = resolve(root, "artifacts", "tearbench", "generated", "builds", `${info.mode}.json`);
  await mkdir(dirname(recordPath), { recursive: true });
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return Object.freeze({ record, recordPath });
}

export async function fanoutContentAddressedBuild({ workspaceRoot, record, destination }) {
  const root = resolve(workspaceRoot), expected = resolve(root, "dist", record.mode.startsWith("test-") ? `test-${record.target}` : record.target);
  const output = resolve(destination);
  if (output !== expected) throw new TypeError(`build fanout destination must be ${relative(root, expected).replaceAll("\\", "/")}`);
  const source = resolve(root, record.contentAddressedPath);
  await verifyContentAddressedBuild({ workspaceRoot: root, directory: source, expectedRecord: record });
  await rm(output, { recursive: true, force: true });
  await mkdir(dirname(output), { recursive: true });
  await cp(source, output, { recursive: true, errorOnExist: true });
  const artifact = await calculateArtifactHash(output);
  if (artifact.hash !== record.artifactHash || artifact.files !== record.artifactFiles) throw new Error("fanout build differs from its immutable source");
  return Object.freeze({ destination: relative(root, output).replaceAll("\\", "/"),
    buildIdentityDigest: record.buildIdentityDigest, artifactHash: artifact.hash });
}

export function createProviderArtifactReceipt({ record, provider, artifactId, artifactDigest, artifactUrl, repository, runId }) {
  if (record?.format !== "tear-build-artifact-record" || record.recordDigest !== digest(Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== "recordDigest")))) throw new TypeError("provider receipt requires an exact build record");
  const unsigned = { format: "tear-build-provider-receipt", schemaVersion: 1,
    provider: safeProviderId(provider, "artifact provider"), artifactId: safeProviderId(artifactId, "provider artifact ID"),
    artifactDigest: safeProviderId(artifactDigest, "provider artifact digest"), artifactUrl: safeProviderId(artifactUrl, "provider artifact URL"),
    repository: safeProviderId(repository, "provider repository"), runId: safeProviderId(runId, "provider run ID"),
    buildIdentityDigest: record.buildIdentityDigest, buildRecordDigest: record.recordDigest };
  return Object.freeze({ ...unsigned, receiptDigest: digest(unsigned) });
}

export function verifyProviderArtifactReceipt({ receipt, record, expectedProvider, expectedArtifactId,
  expectedArtifactDigest, expectedRepository, expectedRunId }) {
  if (receipt?.format !== "tear-build-provider-receipt" || receipt.schemaVersion !== 1) throw new TypeError("provider receipt format is invalid");
  const { receiptDigest, ...unsigned } = receipt;
  const errors = [];
  if (receiptDigest !== digest(unsigned)) errors.push("provider receipt digest is invalid");
  if (record?.format !== "tear-build-artifact-record" || receipt.buildRecordDigest !== record.recordDigest
    || receipt.buildIdentityDigest !== record.buildIdentityDigest) errors.push("provider receipt does not bind the exact build record");
  if (receipt.provider !== expectedProvider || receipt.artifactId !== expectedArtifactId
    || receipt.artifactDigest !== expectedArtifactDigest || receipt.repository !== expectedRepository
    || receipt.runId !== String(expectedRunId)) errors.push("provider receipt origin or artifact identity is mismatched");
  if (errors.length > 0) throw new Error(`provider artifact receipt rejected:\n- ${errors.join("\n- ")}`);
  return Object.freeze({ buildIdentityDigest: record.buildIdentityDigest, provider: receipt.provider,
    artifactId: receipt.artifactId, artifactDigest: receipt.artifactDigest });
}
