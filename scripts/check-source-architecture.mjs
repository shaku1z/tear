import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "src");
const authoredDataExceptions = new Set([
  "src/config/game-config.ts",
  "src/gameplay/upgrades.ts",
]);
const errors = [];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

for (const file of walk(sourceRoot)) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (file.endsWith(".js")) errors.push(`${relative}: production source must be strict TypeScript`);
  if (!file.endsWith(".ts")) continue;
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/u).length;
  if (lines > 500 && !authoredDataExceptions.has(relative)) {
    errors.push(`${relative}: ${String(lines)} lines exceeds the 500-line subsystem boundary`);
  }
  for (const suppression of ["@ts-ignore", "@ts-nocheck", "eslint-disable"]) {
    if (text.includes(suppression)) errors.push(`${relative}: contains forbidden ${suppression} suppression`);
  }
}

if (errors.length > 0) {
  console.error(["Source architecture gate failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
  process.exit(1);
}
console.log("source architecture gate passed");
