import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const directory = resolve(root, "public/vendor/tear-music");
const provenancePath = resolve(directory, "adaptive-soundtrack.provenance.json");
const expected = Object.freeze({
  engineRepository: "shaku1z/tear-music",
  engineCommit: "7662fc95769d2ed022593c10f308ec10f054edfc",
  releaseVersion: "0.1.0-alpha.1",
  releaseSchemaVersion: 2,
  toneVersion: "14.9.17",
  manifest: {
    bytes: 1898,
    sha256: "e6d9a62ebadfdea26a98a1371ba7e084bc8878f7623ad510deafe12d6a945c2a",
    builtAt: "2026-08-23T06:35:29.104Z",
  },
  artifact: {
    bytes: 67717,
    sha256: "9b88e9597657c44ae5830c67666d089730c156e4b17a993596e9d0c0ab3a5eb7",
  },
  tone: {
    bytes: 337361,
    sha256: "5dd8825c21f50486eea7353b0abdf06119dd76409e4271e3fa54fe8545463446",
  },
  license: {
    bytes: 1072,
    sha256: "391ed5af60b7b5d1f74b31040c5fa645e6e238f3d9b4c971941a262a675bbdcd",
  },
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fail(message) {
  throw new Error(`Adaptive Soundtrack provenance: ${message}`);
}

function requiredString(record, field) {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) fail(`${field} is missing`);
  return value;
}

function requiredSha(record, field) {
  const value = requiredString(record, field).toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(value)) fail(`${field} is not a SHA-256 digest`);
  return value;
}

function requiredPositiveInteger(record, field) {
  const value = record[field];
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${field} is not a positive byte length`);
  return value;
}

function fixedPathValue(value, field, expected) {
  if (typeof value !== "string" || value.length === 0) fail(`${field} is missing`);
  if (isAbsolute(value) || value.includes("\\") || value.includes("..")) {
    fail(`${field} must be a safe relative path`);
  }
  if (value !== expected) fail(`${field} must be ${expected}`);
  return value;
}

function fixedRelativePath(record, field, expected) {
  return fixedPathValue(record[field], field, expected);
}

async function readJson(file, label) {
  let bytes;
  try {
    bytes = await readFile(file);
  } catch (error) {
    fail(`${label} is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return { value: JSON.parse(bytes.toString("utf8")), bytes };
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function verifyFile(file, expectedBytes, expectedSha, label) {
  let bytes;
  try {
    bytes = await readFile(file);
  } catch (error) {
    fail(`${label} is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const actualSha = sha256(bytes);
  if (bytes.length !== expectedBytes) {
    fail(`${label} byte length mismatch: ${bytes.length} != ${expectedBytes}`);
  }
  if (actualSha !== expectedSha) {
    fail(`${label} checksum mismatch: ${actualSha} != ${expectedSha}`);
  }
  console.log(`PASS ${label} bytes=${bytes.length} sha256=${actualSha}`);
  return bytes;
}

const { value: provenance } = await readJson(provenancePath, "adaptive-soundtrack.provenance.json");
if (typeof provenance !== "object" || provenance === null) fail("provenance must be an object");
if (provenance.format !== "tear-music-adaptive-soundtrack-provenance") fail("format is invalid");
if (provenance.schemaVersion !== 1) fail("provenance schemaVersion must be 1");
if (requiredString(provenance, "engineRepository") !== expected.engineRepository) fail("source repository is not the accepted handoff");
const engineCommit = requiredString(provenance, "engineCommit");
if (!/^[0-9a-f]{40}$/u.test(engineCommit)) fail("source commit must be a lowercase 40-hex Git commit");
if (engineCommit !== expected.engineCommit) fail("source commit is not the accepted handoff");
if (requiredString(provenance, "engineVersion") !== expected.releaseVersion) fail("engine version is not the accepted handoff");
if (requiredString(provenance, "releaseVersion") !== expected.releaseVersion) fail("release version is not the accepted handoff");
if (!Number.isSafeInteger(provenance.releaseSchemaVersion) || provenance.releaseSchemaVersion <= 0
  || provenance.releaseSchemaVersion !== expected.releaseSchemaVersion) fail("release schema version must be positive and exactly 2");
if (requiredString(provenance, "toneVersion") !== expected.toneVersion) fail("Tone version is not the accepted handoff");
if (provenance.artifactFormat !== "esm") fail("artifact format is invalid");
if (provenance.toneFormat !== "host-context-esm") fail("Tone format is invalid");

const manifestName = fixedRelativePath(provenance, "releaseManifest", "adaptive-soundtrack.manifest.json");
const manifestPath = resolve(directory, manifestName);
const { value: manifest, bytes: manifestBytes } = await readJson(manifestPath, manifestName);
const manifestSha = sha256(manifestBytes);
if (manifestBytes.length !== expected.manifest.bytes || manifestSha !== expected.manifest.sha256) {
  fail(`release manifest does not match the accepted handoff: ${manifestBytes.length} bytes ${manifestSha}`);
}
if (requiredSha(provenance, "releaseManifestSha256") !== manifestSha
  || requiredSha(provenance, "releaseManifestSha256") !== expected.manifest.sha256) {
  fail("release manifest checksum mismatch");
}
console.log(`PASS ${manifestName} bytes=${manifestBytes.length} sha256=${manifestSha}`);

if (typeof manifest !== "object" || manifest === null) fail("release manifest must be an object");
if (manifest.format !== "tear-music-adaptive-soundtrack-release") fail("release manifest format is invalid");
if (manifest.schemaVersion !== expected.releaseSchemaVersion) fail("release manifest schemaVersion must be 2");
if (manifest.schemaVersion !== provenance.releaseSchemaVersion) fail("release schema version does not match provenance");
if (manifest.engineRepository !== expected.engineRepository) fail("source repository does not match accepted handoff");
if (manifest.engineCommit !== expected.engineCommit) fail("source commit does not match accepted handoff");
if (manifest.version !== expected.releaseVersion) fail("release version does not match accepted handoff");
if (manifest.toneVersion !== expected.toneVersion) fail("Tone version does not match accepted handoff");
if (manifest.engineRepository !== requiredString(provenance, "engineRepository")) fail("source repository does not match provenance");
if (manifest.engineCommit !== requiredString(provenance, "engineCommit")) fail("source commit does not match provenance");
if (manifest.version !== requiredString(provenance, "releaseVersion")) fail("release version does not match provenance");
if (manifest.toneVersion !== requiredString(provenance, "toneVersion")) fail("Tone version does not match provenance");
if (manifest.packageName !== "@tear-music/adaptive-soundtrack") fail("release package name is invalid");
if (manifest.runtimeGlobal !== "AdaptiveSoundtrack") fail("release runtime global is invalid");
if (manifest.manifestFile !== manifestName) fail("release manifest filename is invalid");
const builtAt = requiredString(manifest, "builtAt");
const builtAtDate = new Date(builtAt);
if (Number.isNaN(builtAtDate.valueOf()) || builtAtDate.toISOString() !== builtAt
  || builtAt !== expected.manifest.builtAt) fail("release builtAt must be the accepted exact ISO timestamp");
if (provenance.builtAt !== undefined) {
  const provenanceBuiltAt = requiredString(provenance, "builtAt");
  const provenanceBuiltAtDate = new Date(provenanceBuiltAt);
  if (Number.isNaN(provenanceBuiltAtDate.valueOf()) || provenanceBuiltAtDate.toISOString() !== provenanceBuiltAt
    || provenanceBuiltAt !== builtAt) fail("provenance builtAt must match the release manifest exact ISO timestamp");
}
if (typeof manifest.entrypoints !== "object" || manifest.entrypoints === null) fail("release entrypoints are missing");
fixedPathValue(manifest.entrypoints.module, "release entrypoints.module", "index.mjs");
fixedPathValue(manifest.entrypoints.browser, "release entrypoints.browser", "adaptive-soundtrack.iife.js");
fixedPathValue(manifest.entrypoints.browserMap, "release entrypoints.browserMap", "adaptive-soundtrack.iife.js.map");
fixedPathValue(manifest.entrypoints.commonjs, "release entrypoints.commonjs", "index.js");
fixedPathValue(manifest.entrypoints.types, "release entrypoints.types", "index.d.ts");
fixedRelativePath(provenance, "sourceEntrypoint", "index.mjs");

const moduleIntegrity = manifest.artifactIntegrity?.module;
if (typeof moduleIntegrity !== "object" || moduleIntegrity === null) fail("module artifact integrity is missing");
fixedPathValue(moduleIntegrity.path, "artifactIntegrity.module.path", "index.mjs");
if (moduleIntegrity.path !== provenance.sourceEntrypoint) fail("selected source entrypoint does not match manifest");
if (moduleIntegrity.bytes !== expected.artifact.bytes || moduleIntegrity.bytes !== provenance.artifactBytes) fail("module byte length does not match accepted handoff");
if (moduleIntegrity.sha256 !== expected.artifact.sha256 || moduleIntegrity.sha256 !== requiredSha(provenance, "artifactSha256")) fail("module SHA does not match accepted handoff");

const moduleName = fixedRelativePath(provenance, "artifact", "adaptive-soundtrack.esm.js");
const modulePath = resolve(directory, moduleName);
if (modulePath === manifestPath) fail("module artifact must be distinct from its release manifest");
const moduleBytes = await verifyFile(
  modulePath,
  expected.artifact.bytes,
  expected.artifact.sha256,
  moduleName,
);
if (requiredPositiveInteger(provenance, "artifactBytes") !== expected.artifact.bytes
  || requiredSha(provenance, "artifactSha256") !== expected.artifact.sha256) {
  fail("provenance module integrity does not match the accepted handoff");
}
const moduleText = moduleBytes.toString("utf8");
if (!moduleText.includes("AdaptiveSoundtrackAPI") || !moduleText.includes("export{")) {
  fail("module does not expose the canonical ESM adapter surface");
}

const toneName = fixedRelativePath(provenance, "toneArtifact", "tone-host-14.9.17.esm.js");
const tonePath = resolve(directory, toneName);
const toneBytes = await verifyFile(
  tonePath,
  expected.tone.bytes,
  expected.tone.sha256,
  toneName,
);
const trustedToneName = requiredString(provenance, "trustedToneArtifact");
if (trustedToneName !== "../tear-score/tone-host-14.9.17.esm.js") {
  fail("trustedToneArtifact must be the fixed legacy Tone host path");
}
const trustedTonePath = resolve(directory, trustedToneName);
const trustedToneSha = requiredSha(provenance, "trustedToneSha256");
if (requiredPositiveInteger(provenance, "toneBytes") !== expected.tone.bytes
  || requiredSha(provenance, "toneSha256") !== expected.tone.sha256
  || trustedToneSha !== expected.tone.sha256) {
  fail("provenance Tone integrity does not match the accepted handoff");
}
await verifyFile(trustedTonePath, expected.tone.bytes, expected.tone.sha256, trustedToneName);
if (sha256(toneBytes) !== trustedToneSha) fail("canonical Tone host differs from the trusted legacy host");
if (requiredString(provenance, "toneVersion") !== expected.toneVersion) fail("Tone version is not pinned to 14.9.17");

const licenseName = fixedRelativePath(provenance, "toneLicense", "TONE-LICENSE.md");
const licenseBytes = await verifyFile(
  resolve(directory, licenseName),
  expected.license.bytes,
  expected.license.sha256,
  licenseName,
);
const trustedLicenseName = requiredString(provenance, "trustedToneLicense");
if (trustedLicenseName !== "../tear-score/TONE-LICENSE.md") {
  fail("trustedToneLicense must be the fixed legacy Tone license path");
}
const trustedLicenseBytes = await verifyFile(
  resolve(directory, trustedLicenseName),
  licenseBytes.length,
  expected.license.sha256,
  trustedLicenseName,
);
if (requiredPositiveInteger(provenance, "toneLicenseBytes") !== expected.license.bytes
  || requiredSha(provenance, "toneLicenseSha256") !== expected.license.sha256
  || requiredSha(provenance, "trustedToneLicenseSha256") !== expected.license.sha256) {
  fail("provenance Tone license integrity does not match the accepted handoff");
}
if (sha256(licenseBytes) !== sha256(trustedLicenseBytes)) fail("canonical Tone license differs from the trusted legacy license");

if (typeof provenance.legacyFallback !== "object" || provenance.legacyFallback === null
  || provenance.legacyFallback.validationScript !== "scripts/verify-tear-score-provenance.mjs") {
  fail("legacy fallback validation script is not preserved");
}
console.log(`PASS source ${provenance.engineRepository}@${provenance.engineCommit}`);
console.log(`PASS release schema=${manifest.schemaVersion} version=${manifest.version} tone=${manifest.toneVersion}`);
