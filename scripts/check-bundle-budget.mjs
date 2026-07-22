import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const budgets = JSON.parse(await readFile(resolve(root, "config/bundle-budgets.json"), "utf8"));

async function largestJavaScriptGzip(directory) {
  const assets = resolve(root, "dist", directory, "assets");
  const files = (await readdir(assets)).filter((file) => file.endsWith(".js"));
  const sizes = await Promise.all(files.map(async (file) => ({
    file,
    bytes: gzipSync(await readFile(resolve(assets, file))).byteLength,
  })));
  return sizes.sort((left, right) => right.bytes - left.bytes)[0];
}

async function staticGzip(file) {
  return gzipSync(await readFile(resolve(root, "public", "vendor", "tear-score", file))).byteLength;
}

const checks = [
  ["standalone main", await largestJavaScriptGzip("standalone"), budgets.standaloneMainGzipBytes],
  ["CrazyGames main", await largestJavaScriptGzip("crazygames"), budgets.crazygamesMainGzipBytes],
  ["TearScore", { file: "tear-score.esm.js", bytes: await staticGzip("tear-score.esm.js") }, budgets.tearScoreGzipBytes],
  ["Tone host", { file: "tone-host-14.9.17.esm.js", bytes: await staticGzip("tone-host-14.9.17.esm.js") }, budgets.toneGzipBytes],
];

let failed = false;
for (const [label, artifact, budget] of checks) {
  const ok = artifact !== undefined && artifact.bytes <= budget;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${artifact?.bytes ?? "missing"}/${budget} gzip bytes (${artifact?.file ?? "none"})`);
  failed ||= !ok;
}
if (failed) process.exitCode = 1;
