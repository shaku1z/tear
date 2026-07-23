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
];
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
  for (const file of walk(directory).filter((candidate) => /\.(?:html|js|css)$/u.test(candidate))) {
    const text = fs.readFileSync(file, "utf8");
    for (const marker of forbidden) {
      if (text.includes(marker)) failures.push(`${path.relative(root, file)} contains ${marker}`);
    }
  }
}

if (failures.length > 0) {
  console.error(["Production test-isolation gate failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exit(1);
}
console.log("production test-isolation gate passed");
