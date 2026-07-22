import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const projectRoot = resolve(import.meta.dirname, "..");
const wranglerCli = resolve(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const expectedAssets = resolve(projectRoot, "dist", "standalone");
const config = readFileSync(resolve(projectRoot, "wrangler.jsonc"), "utf8");

if (!/"directory"\s*:\s*"\.\/dist\/standalone"/u.test(config)) {
  throw new Error("wrangler.jsonc must deploy only ./dist/standalone");
}

const result = spawnSync(process.execPath, [wranglerCli, "deploy", "--dry-run"], {
  cwd: projectRoot,
  encoding: "utf8",
  stdio: "pipe",
});
if (result.error !== undefined) throw result.error;
const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
process.stdout.write(output);
if (result.status !== 0) throw new Error(`Wrangler dry-run failed with exit code ${String(result.status)}`);

const escapeCharacter = String.fromCharCode(27);
const plainOutput = output.split(escapeCharacter).map((part, index) => {
  if (index === 0) return part;
  const terminator = part.indexOf("m");
  return terminator < 0 ? part : part.slice(terminator + 1);
}).join("").replaceAll("\\", "/");
const normalizedExpected = expectedAssets.replaceAll("\\", "/");
if (!plainOutput.includes(`assets directory ${normalizedExpected}`)) {
  throw new Error(`Wrangler did not confirm the expected assets directory: ${normalizedExpected}`);
}
if (!/Read \d+ files? from the assets directory/u.test(plainOutput)) {
  throw new Error("Wrangler did not enumerate the generated standalone asset set");
}

console.log(`PASS Cloudflare dry-run boundary: ${normalizedExpected}`);
