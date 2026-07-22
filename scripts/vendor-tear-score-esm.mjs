import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [tearScoreInput, toneInput] = process.argv.slice(2);
if (!tearScoreInput || !toneInput) {
  throw new Error("Usage: node scripts/vendor-tear-score-esm.mjs <tear-score-esm> <tone-esm>");
}

const root = resolve(import.meta.dirname, "..");
const vendorDirectory = resolve(root, "public/vendor/tear-score");
const provenancePath = resolve(vendorDirectory, "tear-score.provenance.json");
const upstreamManifestPath = resolve(vendorDirectory, "upstream-manifest.json");
const tearScoreOutput = resolve(vendorDirectory, "tear-score.esm.js");
const toneOutput = resolve(vendorDirectory, "tone-host-14.9.17.esm.js");

const originalBundle = await readFile(resolve(tearScoreInput), "utf8");
const toneBundle = await readFile(resolve(toneInput));
const toneGlobalPattern = /var ([A-Za-z_$][\w$]*)=globalThis\.Tone,([A-Za-z_$][\w$]*)=\1;/u;
const match = toneGlobalPattern.exec(originalBundle);
if (!match) throw new Error("TearScore ESM does not contain the expected explicit Tone host boundary");
const toneBinding = match[2];
let moduleBundle = originalBundle.replace(
  toneGlobalPattern,
  `import*as ${toneBinding} from"./tone-host-14.9.17.esm.js";`,
);
const disposeBoundaries = [
  {
    source: "this.composerScheduleId=void 0,this.rack?.dispose()",
    patched: "this.composerScheduleId=void 0,this.composer?.reset(),this.rack?.dispose()",
  },
  {
    source: "this.composerScheduleId=void 0,(e=this.rack)",
    patched: "this.composerScheduleId=void 0,(e=this.composer)==null||e.reset(),(e=this.rack)",
  },
];
const matchingBoundaries = disposeBoundaries.filter(({ source }) => moduleBundle.includes(source));
if (matchingBoundaries.length !== 1) {
  throw new Error(`Expected exactly one TearScore composer disposal boundary; found ${matchingBoundaries.length}`);
}
const boundary = matchingBoundaries[0];
moduleBundle = moduleBundle.replace(boundary.source, boundary.patched);
if (moduleBundle.includes("globalThis.Tone")) throw new Error("Generated TearScore still depends on a Tone global");
if (!moduleBundle.includes("export{")) throw new Error("Generated TearScore has no ESM exports");

await writeFile(tearScoreOutput, moduleBundle);
await writeFile(toneOutput, toneBundle);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bundleSha256 = sha256(moduleBundle);
const toneSha256 = sha256(toneBundle);
const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
const upstreamManifest = JSON.parse(await readFile(upstreamManifestPath, "utf8"));

Object.assign(provenance, {
  artifact: "tear-score.esm.js",
  artifactFormat: "esm",
  artifactSha256: bundleSha256,
  toneArtifact: "tone-host-14.9.17.esm.js",
  toneFormat: "host-context-esm",
  toneSha256,
  globalRuntimeDependencies: [],
  compatibilityPatches: ["composer-reset-before-rack-dispose"],
});
Object.assign(upstreamManifest, {
  bundleSha256,
  artifact: "tear-score.esm.js",
  artifactFormat: "esm",
  toneArtifact: "tone-host-14.9.17.esm.js",
  toneSha256,
  compatibilityPatches: ["composer-reset-before-rack-dispose"],
});
await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
await writeFile(upstreamManifestPath, `${JSON.stringify(upstreamManifest, null, 2)}\n`);
console.log(`TearScore ESM ${bundleSha256}`);
console.log(`Tone ESM ${toneSha256}`);
