import { cp, lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const usage = "usage: node scripts/tearbench-canary-compose.mjs --input path --workspace path";
const args = process.argv.slice(2), values = {};
if (args.length !== 4 || !["--input", "--workspace"].includes(args[0]) || !["--input", "--workspace"].includes(args[2]) || args[0] === args[2]) throw new TypeError(usage);
values[args[0]] = args[1]; values[args[2]] = args[3];
const input = resolve(values["--input"]), workspace = resolve(values["--workspace"]);
const canonicalInput = await realpath(input), canonicalWorkspace = await realpath(workspace);
async function files(directory, prefix = "") {
  const found = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name), stored = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const metadata = await lstat(path); if (metadata.isSymbolicLink()) throw new TypeError(`canary artifact contains a symlink: ${stored}`);
    if (entry.isDirectory()) found.push(...await files(path, stored)); else if (entry.isFile()) found.push({ path, stored });
  }
  return found;
}
let count = 0;
for (const file of await files(canonicalInput)) {
  if ((!file.stored.startsWith("dist/") && !file.stored.startsWith("artifacts/")) || file.stored.includes("..") || isAbsolute(file.stored)) {
    throw new TypeError(`canary artifact contains an unsafe path: ${file.stored}`);
  }
  const destination = resolve(canonicalWorkspace, file.stored), lexical = relative(canonicalWorkspace, destination).replaceAll("\\", "/");
  if (lexical !== file.stored) throw new TypeError(`canary artifact path aliases the workspace: ${file.stored}`);
  await mkdir(dirname(destination), { recursive: true });
  try { await lstat(destination); throw new Error(`canary artifact collision: ${file.stored}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  await cp(file.path, destination, { errorOnExist: true }); count += 1;
}
console.log(`PASS composed ${String(count)} collision-free canary files from ${relative(canonicalWorkspace, canonicalInput).replaceAll("\\", "/")}`);
