import { cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { receiptSha256 } from "./tearbench-task-receipts.mjs";

const root = resolve(import.meta.dirname, ".."), usage = "usage: node scripts/tearbench-canary-bundle.mjs --mission id --timing path --output path";
const args = process.argv.slice(2), values = {}, allowed = new Set(["--mission", "--timing", "--output"]);
if (args.length !== 6) throw new TypeError(usage);
for (let index = 0; index < args.length; index += 2) {
  if (!allowed.has(args[index]) || values[args[index]] !== undefined || args[index + 1] === undefined) throw new TypeError(usage);
  values[args[index]] = args[index + 1];
}
if (!/^[a-z0-9][a-z0-9.-]*$/u.test(values["--mission"])) throw new TypeError("canary mission ID is invalid");
const output = resolve(values["--output"]), missionDirectory = resolve(root, "artifacts", "tearbench", "missions", values["--mission"]);
const canonicalRoot = await realpath(root), included = new Set();
async function safeStored(path) {
  const absolute = resolve(root, path), lexical = relative(root, absolute).replaceAll("\\", "/");
  if (lexical === "" || lexical.startsWith("../") || isAbsolute(lexical)) throw new TypeError(`canary bundle path escapes workspace: ${path}`);
  const direct = await lstat(absolute); if (direct.isSymbolicLink()) throw new TypeError(`canary bundle path is a symlink: ${path}`);
  const canonical = await realpath(absolute), stored = relative(canonicalRoot, canonical).replaceAll("\\", "/");
  if (stored !== lexical) throw new TypeError(`canary bundle path aliases another location: ${path}`);
  return { absolute: canonical, stored };
}
async function include(path) {
  const value = await safeStored(path); if (included.has(value.stored)) return;
  if (!value.stored.startsWith("dist/") && !value.stored.startsWith("artifacts/")) throw new TypeError(`canary bundle path is outside artifact roots: ${value.stored}`);
  const destination = resolve(output, value.stored); await mkdir(dirname(destination), { recursive: true });
  await cp(value.absolute, destination, { recursive: true, errorOnExist: true }); included.add(value.stored);
}
async function receiptPaths(directory) {
  const found = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error?.code === "ENOENT") return found; throw error; }
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) found.push(...await receiptPaths(path));
    else if (entry.isFile() && entry.name.endsWith(".json")) found.push(path);
  }
  return found.sort();
}
for (const path of await receiptPaths(missionDirectory)) {
  const receipt = JSON.parse(await readFile(path, "utf8"));
  await include(receipt.immutablePath);
  for (const artifact of receipt.artifacts ?? []) await include(artifact.path);
  for (const attestation of receipt.bindings?.build?.produced ?? []) {
    await include(attestation.path); await include(attestation.contentAddressedPath); await include(attestation.recordPath);
  }
}
await include(values["--timing"]);
const infrastructure = resolve(root, "artifacts", "tearbench", "canary", "infrastructure", values["--mission"]);
try { await include(relative(root, infrastructure)); } catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const unsigned = { format: "tearbench-canary-bundle-manifest", schemaVersion: 1, missionId: values["--mission"], paths: [...included].sort() };
const manifest = { ...unsigned, bundleManifestDigest: receiptSha256(unsigned) };
const manifestPath = resolve(output, "artifacts", "tearbench", "canary", "bundle-manifests", `${values["--mission"]}.json`);
await mkdir(dirname(manifestPath), { recursive: true }); await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`PASS canary bundle ${values["--mission"]}: ${String(included.size)} owned paths`);
