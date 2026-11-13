// Shared by `pnpm scene` and tests/unit/scene-packages.test.ts: find scene
// packages in the repository and check their files against their manifests.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SCENES_ROOT = join(REPOSITORY_ROOT, "src", "presentation", "assets", "scenes");
export const SCENE_REGISTRY = join(REPOSITORY_ROOT, "src", "presentation", "scenes", "scene-registry.ts");

/**
 * Viewports every covering layer must fill (CSS px; HiDPI changes resolution,
 * not the logical framing, so one entry per aspect is enough), plus the wider
 * shapes reported but allowed to fall back to the feathered edge colour.
 */
export const REQUIRED_VIEWPORTS = Object.freeze([
  ["16:9 desktop", 1600, 900],
  ["16:9 720p", 1280, 720],
  ["16:10 laptop", 1600, 1000],
  ["4:3 tablet", 1200, 900],
  ["5:4", 1280, 1024],
  ["21:9 ultrawide", 2560, 1080],
  ["21.5:9 ultrawide", 3440, 1440],
  ["phone landscape 19.5:9", 844, 390],
  ["phone landscape 20:9", 932, 419],
]);
export const BEST_EFFORT_VIEWPORTS = Object.freeze([["32:9 super-ultrawide", 5120, 1440]]);

let contractModule;
/** The TypeScript contract, loaded through Node's type stripping (no build step). */
export async function loadContract() {
  if (contractModule === undefined) {
    const url = pathToFileURL(join(REPOSITORY_ROOT, "src", "presentation", "scenes", "scene-contract.ts")).href;
    contractModule = await import(url);
  }
  return contractModule;
}

/** Package directories (with a scene.json, or with only a recipe.json when `recipes` is set). */
export function sceneDirectories(recipes = false) {
  if (!existsSync(SCENES_ROOT)) return [];
  return readdirSync(SCENES_ROOT)
    .filter((name) => existsSync(join(SCENES_ROOT, name, recipes ? "recipe.json" : "scene.json")))
    .sort()
    .map((name) => join(SCENES_ROOT, name));
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Reads the pixel size from a WebP/PNG header without decoding. */
export function imageSize(buffer) {
  if (buffer.toString("ascii", 1, 4) === "PNG") return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("not a WebP or PNG file");
  }
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") return [1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3)];
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  if (chunk === "VP8 ") return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  throw new Error(`unknown WebP chunk ${chunk}`);
}

/** Validates one package directory; returns { scene, problems, files }. */
export async function inspectPackage(directory) {
  const { validateScenePackage } = await loadContract();
  const problems = [];
  let scene;
  try {
    scene = validateScenePackage(JSON.parse(readFileSync(join(directory, "scene.json"), "utf8")));
  } catch (error) {
    return { scene: undefined, problems: [String(error.message ?? error)], files: [] };
  }
  const files = [];
  for (const image of scene.images) {
    const path = join(directory, image.file);
    if (!existsSync(path)) {
      problems.push(`${image.file}: missing`);
      continue;
    }
    const buffer = readFileSync(path);
    const [width, height] = imageSize(buffer);
    files.push({ file: image.file, bytes: statSync(path).size, width, height });
    if (buffer.length !== image.bytes)
      problems.push(`${image.file}: ${buffer.length} bytes, manifest says ${image.bytes}`);
    if (sha256(buffer) !== image.sha256) problems.push(`${image.file}: sha256 differs from the manifest`);
    if (width !== image.width || height !== image.height) {
      problems.push(`${image.file}: ${width}x${height}, manifest says ${image.width}x${image.height}`);
    }
  }
  const module = join(directory, "scene.ts");
  if (!existsSync(module)) problems.push("scene.ts: missing (run pnpm scene build)");
  else {
    const source = readFileSync(module, "utf8");
    for (const image of scene.images) {
      if (!source.includes(`new URL("./${image.file}", import.meta.url)`))
        problems.push(`scene.ts: no URL for ${image.file}`);
    }
  }
  const registry = readFileSync(SCENE_REGISTRY, "utf8");
  const name = directory.split(/[\\/]/u).at(-1);
  if (!registry.includes(`"${scene.stageId}": () => import("../assets/scenes/${name}/scene")`)) {
    problems.push(`scene-registry.ts: stage ${scene.stageId} is not registered`);
  }
  return { scene, problems, files };
}

/** Coverage of every covering layer over the viewport matrix. */
export async function coverageReport(scene) {
  const { layerCoverage } = await loadContract();
  const rows = [];
  for (const [label, width, height, required] of [
    ...REQUIRED_VIEWPORTS.map((entry) => [...entry, true]),
    ...BEST_EFFORT_VIEWPORTS.map((entry) => [...entry, false]),
  ]) {
    for (const layer of scene.layers.filter((item) => item.covers)) {
      const result = layerCoverage(scene, layer.id, width, height);
      rows.push({ label, width, height, required, layer: layer.id, ...result });
    }
  }
  return rows;
}
