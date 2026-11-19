import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const targets = ["standalone", "crazygames"];
const forbidden = [
  "__TEAR_CATALOG_DEBUG__",
  "__TEAR_UI_TARGETS__",
  "__TEAR_DIAGNOSTICS__",
  "__TEAR_PLATFORM_SERVICES__",
  "__PANTHEON_TEST",
  "__TEAR_RUNTIME_ENVIRONMENT__",
  // The surface channel is a build-time constant. A surviving identifier would
  // let page script choose the channel instead of the build.
  "__TEAR_ENGINEERING_SURFACES__",
];
// Developer-only modules are kept out of release bundles by the build itself: it fails when one
// contributes code to a chunk (scripts/release-developer-code.mjs, used by vite.config.ts). This
// script covers what a module list cannot: test globals that release code must not define.
const failures = [];

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
    if (!/\.(?:html|js|css)$/u.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const marker of forbidden) {
      if (text.includes(marker)) failures.push(`${relative} contains ${marker}`);
    }
  }
}

if (failures.length > 0) {
  console.error(["Production test-isolation gate failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exit(1);
}
console.log(`production test-isolation gate passed (${String(forbidden.length)} test globals)`);
