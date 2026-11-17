import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const targets = ["standalone", "crazygames"];
const forbidden = [
  "__TEAR_CATALOG_DEBUG__",
  "__TEAR_DIAGNOSTICS__",
  "__TEAR_PLATFORM_SERVICES__",
  "__PANTHEON_TEST",
  "__TEAR_RUNTIME_ENVIRONMENT__",
  // The surface channel is a build-time constant. A surviving identifier would
  // let page script choose the channel instead of the build.
  "__TEAR_ENGINEERING_SURFACES__",
];
// Engineering-channel code is loaded only through build-constant-guarded
// dynamic imports, so none of it may reach a release bundle. Each marker is a
// distinctive storage key, format identifier or diagnostic sentence of one
// stripped module; none of them is release player copy.
const ENGINEERING_MARKERS = Object.freeze([
  ["Watch Agent must start from the real main menu", "src/agents/live-watch-agent-host.ts"],
  ["Watch Agent seed must be positive", "src/agents/live-watch-agent-panel.ts"],
  ["Snapshot editor actions", "src/tearbench/browser/state-forge-studio.ts"],
  // Test-build-only Verdant calibration scene (`?sceneNative=`).
  ["tear-verdant-image-package", "src/presentation/assets/verdant-calibration/scene-package.json"],
]);
// The calibration scene's large images are test-build assets only.
const FORBIDDEN_ASSET =
  /(?:^|\/)(?:calibration-(?:top|bottom)|support-(?:top|bottom)|tail-motion|moss-stone|structure-(?:top|bottom)|exterior-(?:top|bottom)-(?:left|right))-[\w-]+\.(?:png|webp)$/u;
const failures = [];

// A marker that no longer exists in its source module would pass vacuously.
for (const [marker, source] of ENGINEERING_MARKERS) {
  const file = path.join(root, source);
  if (!fs.existsSync(file) || !fs.readFileSync(file, "utf8").includes(marker)) {
    failures.push(`engineering marker "${marker}" is no longer present in ${source}; choose a new distinctive marker`);
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

for (const target of targets) {
  const directory = path.join(root, "dist", target);
  if (!fs.existsSync(directory)) {
    failures.push(`dist/${target} is missing; run the production build first`);
    continue;
  }
  for (const file of walk(directory)) {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    if (FORBIDDEN_ASSET.test(relative)) failures.push(`${relative} is a test-only Verdant calibration asset`);
    if (!/\.(?:html|js|css)$/u.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const marker of forbidden) {
      if (text.includes(marker)) failures.push(`${relative} contains ${marker}`);
    }
    for (const [marker, source] of ENGINEERING_MARKERS) {
      if (text.includes(marker)) failures.push(`${relative} contains engineering marker "${marker}" from ${source}`);
    }
  }
}

if (failures.length > 0) {
  console.error(["Production test-isolation gate failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exit(1);
}
console.log(
  `production test-isolation gate passed (${String(forbidden.length)} test globals, ${String(ENGINEERING_MARKERS.length)} engineering markers, calibration assets)`,
);
