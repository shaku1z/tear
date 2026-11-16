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
 * Packages that never ship: built and checked exactly like shipped ones, to
 * prove the format, CLI, loader and checks work for any biome.
 */
export const FIXTURE_SCENES_ROOT = join(REPOSITORY_ROOT, "tests", "fixtures", "scene-packages");
export const SCENE_ROOTS = Object.freeze([SCENES_ROOT, FIXTURE_SCENES_ROOT]);
/** Each release build's share of its size for all scene art. */
export const SCENE_BUDGETS = join(REPOSITORY_ROOT, "config", "scene-budgets.json");

/** True for a package under the shipped scenes folder (it must be registered). */
export const isShippedPackage = (directory) => resolve(directory, "..") === resolve(SCENES_ROOT);

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

/**
 * Package directories (with a scene.json, or with only a recipe.json when
 * `recipes` is set): shipped packages first, then test fixtures.
 */
export function sceneDirectories(recipes = false, roots = SCENE_ROOTS) {
  return roots.flatMap((root) =>
    existsSync(root)
      ? readdirSync(root)
          .filter((name) => existsSync(join(root, name, recipes ? "recipe.json" : "scene.json")))
          .sort()
          .map((name) => join(root, name))
      : [],
  );
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Reads the pixel size from an AVIF file's first image-size box, without decoding. */
export function imageSize(buffer) {
  if (buffer.toString("ascii", 4, 12) !== "ftypavif") throw new Error("not an AVIF file");
  const box = buffer.indexOf("ispe", 12, "ascii");
  if (box === -1 || box + 16 > buffer.length) throw new Error("AVIF file has no image size box");
  return [buffer.readUInt32BE(box + 8), buffer.readUInt32BE(box + 12)];
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
  if (
    isShippedPackage(directory) &&
    !registry.includes(`"${scene.stageId}": () => import("../assets/scenes/${name}/scene")`)
  ) {
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

function manifestImages(directory) {
  return JSON.parse(readFileSync(join(directory, "scene.json"), "utf8")).images;
}

/** One release build's entry in config/scene-budgets.json. */
export function storefrontBudget(target, file = SCENE_BUDGETS) {
  const entry = JSON.parse(readFileSync(file, "utf8")).targets?.[target];
  if (!Number.isSafeInteger(entry?.shareBytes) || entry.shareBytes < 0)
    throw new Error(`config/scene-budgets.json has no valid entry for target ${target}`);
  return entry;
}

/**
 * The sizes the shipped packages declare in their manifests, against one
 * release build's share for all its scene art. Needs no build, so it runs
 * before one, in `pnpm scene validate` and in the unit tests.
 */
export function declaredStorefrontArt(target, budget = storefrontBudget(target), root = SCENES_ROOT) {
  const packages = sceneDirectories(false, [root]).map((directory) => ({
    name: directory.split(/[\\/]/u).at(-1),
    bytes: manifestImages(directory).reduce((total, image) => total + image.bytes, 0),
  }));
  const bytes = packages.reduce((total, item) => total + item.bytes, 0);
  const problems = [];
  if (bytes > budget.shareBytes) {
    const each = packages.map((item) => `${item.name} ${String(item.bytes)}`).join(", ");
    problems.push(
      `${target}: scene packages declare ${String(bytes)} bytes, over this build's share of ${String(budget.shareBytes)} (${each})`,
    );
  }
  return { target, shareBytes: budget.shareBytes, bytes, packages, problems };
}

/**
 * What a built target holds: every image under its assets folder, matched to
 * the package manifests by content hash. The build must hold each shipped
 * package image once, no fixture image and no image the manifests do not know,
 * within the target's share.
 */
export function builtStorefrontArt(target, directory, budget = storefrontBudget(target), roots = SCENE_ROOTS) {
  const expected = new Map();
  const fixtures = new Map();
  for (const packageDirectory of sceneDirectories(false, roots)) {
    const name = packageDirectory.split(/[\\/]/u).at(-1);
    const shipped = resolve(packageDirectory, "..") === resolve(roots[0]);
    for (const image of manifestImages(packageDirectory))
      (shipped ? expected : fixtures).set(image.sha256, `${name}/${image.file}`);
  }
  const assets = join(directory, "assets");
  const problems = [];
  const files = [];
  let bytes = 0;
  for (const file of existsSync(assets) ? readdirSync(assets).filter((name) => name.endsWith(".avif")) : []) {
    const buffer = readFileSync(join(assets, file));
    const digest = sha256(buffer);
    if (fixtures.has(digest)) problems.push(`${target}: build holds the test fixture image ${fixtures.get(digest)}`);
    else if (!expected.delete(digest))
      problems.push(`${target}: assets/${file} is an AVIF image no scene package lists`);
    else {
      bytes += buffer.length;
      files.push(`assets/${file}`);
    }
  }
  for (const image of expected.values()) problems.push(`${target}: build is missing ${image}`);
  if (bytes > budget.shareBytes)
    problems.push(
      `${target}: build holds ${String(bytes)} bytes of scene art, over its share of ${String(budget.shareBytes)}`,
    );
  return { target, shareBytes: budget.shareBytes, bytes, files, problems };
}
