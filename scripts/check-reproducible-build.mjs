import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative, resolve } from "node:path";
import { calculateArtifactHash } from "./release-artifact.mjs";
import { assertReproducibilitySideIdentity } from "./tearbench-reproducibility-contract.mjs";

const root = resolve(import.meta.dirname, "..");
const generated = resolve(root, "artifacts/tearbench/generated/reproducibility");
const sides = Object.freeze(["standalone-a", "standalone-b", "crazygames-a", "crazygames-b",
  "crazygames-package-a", "crazygames-package-b"]);

function run(script, args) {
  const result = spawnSync(process.execPath, [resolve(root, script), ...args], { cwd: root, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error(`${script} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
}
async function filesBelow(directory, prefix = "") {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`, path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path, name));
    else if (entry.isFile()) files.push(name);
  }
  return files;
}
async function assertBoundary(target, directory) {
  const list = await filesBelow(directory), files = new Set(list);
  if (!files.has("index.html")) throw new Error(`${target} output has no index.html`);
  if ([...files].some((file) => /(^|\/)(?:src|tests?|plans?|\.git(?:hub)?)(?:\/|$)/u.test(file)
    || /(?:^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|wrangler\.jsonc|vite\.config\.[cm]?[jt]s|tsconfig(?:\.[^.]+)?\.json|eslint\.config\.[cm]?[jt]s)$/u.test(file))) {
    throw new Error(`${target} output contains repository material`);
  }
  if (target === "standalone") {
    for (const required of ["_headers", "manifest.webmanifest", "sw.js"]) if (!files.has(required)) throw new Error(`standalone output is missing ${required}`);
  } else {
    const standalone = [...files].filter((file) => { const name = posix.basename(file); return file === "_headers"
      || file === "manifest.webmanifest" || file === "sw.js" || name === "registerSW.js" || name.startsWith("workbox-"); });
    if (standalone.length > 0) throw new Error(`CrazyGames output contains standalone PWA artifacts: ${standalone.join(", ")}`);
    const html = await readFile(resolve(directory, "index.html"), "utf8");
    if (/(?:src|href)="\/assets\//u.test(html)) throw new Error("CrazyGames output contains root-absolute game assets");
    const revisionAsset = (name) => /^audio\/cues\/[^/]+\/opus\/revisions\/[^/]+\//u.test(name);
    const active = new Set();
    for (const cueName of [...files].filter((name) => /^audio\/cues\/[^/]+\/cue\.json$/u.test(name))) {
      const cue = JSON.parse(await readFile(join(directory, ...cueName.split("/")), "utf8"));
      for (const stem of Array.isArray(cue?.stems) ? cue.stems : []) for (const source of Array.isArray(stem?.sources) ? stem.sources : []) {
        if (typeof source?.url !== "string") continue;
        const candidate = posix.normalize(posix.join(posix.dirname(cueName), source.url.replaceAll("\\", "/")));
        if (revisionAsset(candidate) && files.has(candidate)) active.add(candidate);
      }
    }
    const packaged = [...files].filter((file) => !revisionAsset(file) || active.has(file));
    let bytes = 0; for (const file of packaged) bytes += (await stat(resolve(directory, file))).size;
    if (files.size > 1_500) throw new Error(`CrazyGames output exceeds the 1,500-file portal limit: ${String(files.size)}`);
    if (bytes > 22.5 * 1024 * 1024) throw new Error(`CrazyGames output exceeds the 22.5 MiB unpacked budget: ${String(bytes)} bytes`);
  }
  return list;
}
async function writeRecord(side, value) {
  const unsigned = { format: "tear-reproducibility-side", schemaVersion: 1, side, ...value };
  const record = { ...unsigned, recordDigest: createHash("sha256").update(JSON.stringify(unsigned)).digest("hex") };
  const path = resolve(generated, `${side}.json`); await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}
async function buildSide(side) {
  const target = side.startsWith("standalone") ? "standalone" : "crazygames";
  const output = resolve(generated, "payloads", side);
  run("scripts/build-target.mjs", [target, "--out-dir", output]);
  const artifact = await calculateArtifactHash(output), files = await assertBoundary(target, output);
  return writeRecord(side, { kind: "build", target, mode: target, payloadPath: relative(root, output).replaceAll("\\", "/"),
    artifactHash: artifact.hash, artifactFiles: artifact.files, boundaryFiles: files.length });
}
async function packageSide(side) {
  const suffix = side.endsWith("-a") ? "a" : "b";
  const input = resolve(generated, "payloads", `crazygames-${suffix}`);
  const output = resolve(generated, "packages", `${side}.zip`);
  run("scripts/package-crazygames.mjs", ["--input", input, "--output", output]);
  const bytes = await readFile(output);
  return writeRecord(side, { kind: "package", target: "crazygames", mode: "crazygames",
    inputPath: relative(root, input).replaceAll("\\", "/"), outputPath: relative(root, output).replaceAll("\\", "/"),
    archiveSha256: createHash("sha256").update(bytes).digest("hex"), archiveBytes: (await stat(output)).size });
}
async function readSide(side) {
  const record = JSON.parse(await readFile(resolve(generated, `${side}.json`), "utf8"));
  if (record.format !== "tear-reproducibility-side" || record.side !== side) throw new TypeError(`invalid reproducibility side ${side}`);
  const { recordDigest, ...unsigned } = record;
  if (recordDigest !== createHash("sha256").update(JSON.stringify(unsigned)).digest("hex")) throw new TypeError(`altered reproducibility side ${side}`);
  if (record.kind === "build") {
    const { payloadPath: expectedPayload } = assertReproducibilitySideIdentity({ root, generated, side, record });
    const artifact = await calculateArtifactHash(resolve(root, expectedPayload));
    if (artifact.hash !== record.artifactHash || artifact.files !== record.artifactFiles) throw new TypeError(`altered reproducibility build ${side}`);
  } else if (record.kind === "package") {
    const suffix = side.endsWith("-a") ? "a" : "b";
    const { inputPath: expectedInput, outputPath: expectedOutput } = assertReproducibilitySideIdentity({ root, generated, side, record });
    const inputArtifact = await calculateArtifactHash(resolve(root, expectedInput));
    const inputSide = JSON.parse(await readFile(resolve(generated, `crazygames-${suffix}.json`), "utf8"));
    if (inputArtifact.hash !== inputSide.artifactHash || inputArtifact.files !== inputSide.artifactFiles) {
      throw new TypeError(`reproducibility package ${side} is not linked to its build side`);
    }
    const bytes = await readFile(resolve(root, expectedOutput));
    if (createHash("sha256").update(bytes).digest("hex") !== record.archiveSha256 || bytes.length !== record.archiveBytes) {
      throw new TypeError(`altered reproducibility package ${side}`);
    }
  } else throw new TypeError(`unknown reproducibility side kind ${side}`);
  return record;
}
async function certify() {
  const records = Object.fromEntries(await Promise.all(sides.map(async (side) => [side, await readSide(side)])));
  const comparisons = [
    { id: "standalone-build", a: records["standalone-a"].artifactHash, b: records["standalone-b"].artifactHash },
    { id: "crazygames-build", a: records["crazygames-a"].artifactHash, b: records["crazygames-b"].artifactHash },
    { id: "crazygames-package", a: records["crazygames-package-a"].archiveSha256, b: records["crazygames-package-b"].archiveSha256 },
  ];
  const failed = comparisons.filter((entry) => entry.a !== entry.b);
  const certificate = { format: "tear-reproducibility-certificate", schemaVersion: 1,
    status: failed.length === 0 ? "passed" : "failed", sideRecordDigests: Object.fromEntries(sides.map((side) => [side, records[side].recordDigest])), comparisons };
  await writeFile(resolve(generated, "certificate.json"), `${JSON.stringify(certificate, null, 2)}\n`, "utf8");
  if (failed.length > 0) throw new Error(`build reproducibility failed: ${failed.map((entry) => entry.id).join(", ")}`);
  for (const comparison of comparisons) console.log(`PASS ${comparison.id}: ${comparison.a}`);
}

const action = process.argv[2];
if (action === undefined) {
  for (const side of sides.slice(0, 4)) await buildSide(side);
  for (const side of sides.slice(4)) await packageSide(side);
  await certify();
} else if (["standalone-a", "standalone-b", "crazygames-a", "crazygames-b"].includes(action)) await buildSide(action);
else if (["crazygames-package-a", "crazygames-package-b"].includes(action)) await packageSide(action);
else if (action === "certify") await certify();
else throw new TypeError(`usage: node scripts/check-reproducible-build.mjs [${sides.join("|")}|certify]`);
