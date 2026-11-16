#!/usr/bin/env node
// `pnpm scene <verb> [stage] [options]`: the one entry point for painted stage
// scene packages. See docs/BACKGROUND_WORKFLOW.md.
//
//   list                        packages and their status
//   validate [stage]            manifest, files, hashes, the size rule, coverage (exit 1 on a problem)
//   coverage [stage]            coverage of every covering layer per viewport
//   build <stage> --sources D   regenerate images, scene.json and scene.ts from recipe.json
//   contrast <stage>            actor/HUD ink contrast over the play band
//   sheet <stage> --out D       contact sheet of every layer and composite
//   preview <stage> --out D     in-game captures and a looping WebP (needs pnpm build:test:standalone)
process.removeAllListeners("warning"); // Node's type-stripping notice for scene-contract.ts
import { basename, join, resolve } from "node:path";
import {
  coverageReport,
  declaredStorefrontArt,
  inspectPackage,
  loadContract,
  REQUIRED_VIEWPORTS,
  SCENE_ROOTS,
  sceneDirectories,
} from "./scene/package-files.mjs";

const [verb = "help", ...rest] = process.argv.slice(2);
const options = {};
const positional = [];
for (let index = 0; index < rest.length; index += 1) {
  const arg = rest[index];
  if (arg.startsWith("--")) {
    const key = arg.slice(2);
    const next = rest[index + 1];
    options[key] = next !== undefined && !next.startsWith("--") ? rest[++index] : true;
  } else positional.push(arg);
}

function directoriesFor(stage, recipes = false) {
  const all = sceneDirectories(recipes);
  if (stage === undefined) return all;
  const match = all.find((directory) => basename(directory) === stage);
  if (match === undefined) throw new Error(`no scene package for "${stage}" under ${SCENE_ROOTS.join(" or ")}`);
  return [match];
}

const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
const count = (bytes) => bytes.toLocaleString("en-US");

async function validate(stage) {
  const { decodedBytes, layerPixelsPerUnit, SCENE_ENCODED_LIMIT, SCENE_DECODED_LIMIT } = await loadContract();
  const { pixelChecks } = await import("./scene/pixel-checks.mjs");
  let failed = false;
  for (const directory of directoriesFor(stage)) {
    const { scene, problems, files } = await inspectPackage(directory);
    const label = basename(directory);
    if (scene !== undefined) {
      const encoded = files.reduce((total, file) => total + file.bytes, 0);
      console.log(`${label}: ${scene.images.length} images, ${scene.layers.length} layers`);
      console.log(
        `  encoded ${count(encoded)} bytes of its ${count(scene.encodedBudget)} budget (limit for any scene ${count(SCENE_ENCODED_LIMIT)})`,
      );
      console.log(
        `  decoded ${mib(decodedBytes(scene))} of its ${mib(scene.decodedBudget)} budget (limit for any scene ${mib(SCENE_DECODED_LIMIT)})`,
      );
      const densest = Math.max(...scene.layers.map((layer) => layerPixelsPerUnit(scene, layer)));
      console.log(`  densest layer ${densest.toFixed(2)} image pixels per world unit`);
      const pixels = await pixelChecks(directory, scene);
      for (const image of pixels.images)
        console.log(
          `  ${image.id.padEnd(12)} see-through ${(image.seeThroughShare * 100).toFixed(0).padStart(3)}%  alike to half size ${image.halfSizeLikeness.toFixed(3)}`,
        );
      for (const hidden of pixels.hidden)
        console.log(
          `  ${hidden.layer.padEnd(12)} ${(hidden.share * 100).toFixed(0).padStart(3)}% always behind nearer layers, detail left there ${hidden.detail.toFixed(1)}`,
        );
      problems.push(...pixels.problems);
      for (const row of await coverageReport(scene)) {
        if (row.required && !row.covered) {
          const short = Object.entries(row.shortfall).filter(([, value]) => value > 0.5);
          problems.push(
            `${row.layer} does not cover ${row.label}: short ${short.map(([side, value]) => `${side} ${value.toFixed(1)}`).join(", ")}`,
          );
        }
      }
    }
    for (const problem of problems) console.log(`  PROBLEM ${problem}`);
    if (problems.length === 0) console.log("  ok");
    failed ||= problems.length > 0;
  }
  // Each release build's share for all its scene art (config/scene-budgets.json).
  for (const target of ["standalone", "crazygames"]) {
    const report = declaredStorefrontArt(target);
    console.log(
      `${target} build: ${String(report.packages.length)} shipped package(s), ${count(report.bytes)} of ${count(report.shareBytes)} bytes`,
    );
    for (const problem of report.problems) console.log(`  PROBLEM ${problem}`);
    failed ||= report.problems.length > 0;
  }
  if (failed) process.exitCode = 1;
}

async function coverage(stage) {
  for (const directory of directoriesFor(stage)) {
    const { scene } = await inspectPackage(directory);
    if (scene === undefined) continue;
    console.log(
      `${basename(directory)} (zoom ${scene.camera.zoomMin}-${scene.camera.zoomMax}, shake ${scene.camera.shake}, player shift ${scene.camera.playerShift})`,
    );
    for (const row of await coverageReport(scene)) {
      const short = Object.entries(row.shortfall)
        .filter(([, value]) => value > 0.5)
        .map(([side, value]) => `${side} ${value.toFixed(0)}px`)
        .join(", ");
      const verdict = row.covered ? "covered" : row.required ? "MISSING" : "edge colour";
      console.log(
        `  ${row.label.padEnd(24)} ${`${row.width}x${row.height}`.padEnd(10)} ${row.layer.padEnd(12)} ${verdict}${short ? ` (${short})` : ""}`,
      );
    }
  }
}

async function main() {
  switch (verb) {
    case "list":
      for (const directory of sceneDirectories()) {
        const { scene, problems } = await inspectPackage(directory);
        console.log(
          `${basename(directory).padEnd(20)} ${scene ? scene.title : "invalid"} ${problems.length ? `(${problems.length} problems)` : "(ok)"}`,
        );
      }
      return;
    case "validate":
      return validate(positional[0]);
    case "coverage":
      return coverage(positional[0]);
    case "build": {
      const [directory] = directoriesFor(positional[0] ?? "", true);
      // A recipe made only of generated sources (a placeholder plate) needs no sources folder.
      const sources = options.sources ?? process.env.TEAR_SCENE_SOURCES;
      const { buildScene, needsSourceFiles } = await import("./scene/build.mjs");
      if (typeof sources !== "string" && needsSourceFiles(directory))
        throw new Error("build needs --sources <dir> or TEAR_SCENE_SOURCES");
      await buildScene(directory, typeof sources === "string" ? resolve(sources, basename(directory)) : "");
      return validate(positional[0]);
    }
    case "contrast": {
      const { contrastReport } = await import("./scene/reports.mjs");
      const [directory] = directoriesFor(positional[0] ?? "");
      return contrastReport(directory, options);
    }
    case "sheet": {
      const { contactSheet } = await import("./scene/reports.mjs");
      const [directory] = directoriesFor(positional[0] ?? "");
      if (typeof options.out !== "string") throw new Error("sheet needs --out <dir> (outside the repository)");
      return contactSheet(directory, resolve(options.out), options);
    }
    case "preview": {
      const { preview } = await import("./scene/preview.mjs");
      const [directory] = directoriesFor(positional[0] ?? "");
      if (typeof options.out !== "string") throw new Error("preview needs --out <dir> (outside the repository)");
      return preview(directory, resolve(options.out), options);
    }
    default:
      console.log(
        [
          "pnpm scene <verb> [stage] [options]",
          "  list | validate [stage] | coverage [stage]",
          "  build <stage> --sources <dir>     (sources dir holds <stage>/<files> pinned in recipe.json)",
          "  contrast <stage> | sheet <stage> --out <dir> | preview <stage> --out <dir> [--frames N]",
          `Required viewports: ${REQUIRED_VIEWPORTS.map(([label]) => label).join(", ")}`,
          `Packages live in ${join("src", "presentation", "assets", "scenes")}`,
        ].join("\n"),
      );
      if (verb !== "help") process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
