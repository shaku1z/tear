import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "tear-repro-"));
const viteCli = resolve(projectRoot, "node_modules", "vite", "bin", "vite.js");
const crazyGamesPackager = resolve(projectRoot, "scripts", "package-crazygames.mjs");
const crazyGamesArchive = resolve(projectRoot, "artifacts", "tear-crazygames.zip");

async function fileHashes(root) {
  const hashes = new Map();
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const name = relative(root, path).replaceAll("\\", "/");
        hashes.set(name, createHash("sha256").update(await readFile(path)).digest("hex"));
      }
    }
  }
  await visit(root);
  return hashes;
}

function build(target, output) {
  const result = spawnSync(process.execPath, [viteCli, "build", "--mode", target, "--outDir", output, "--emptyOutDir"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    if (typeof result.stdout === "string") process.stderr.write(result.stdout);
    if (typeof result.stderr === "string") process.stderr.write(result.stderr);
    throw new Error(`${target} reproducibility build failed${result.error ? `: ${result.error.message}` : ""}`);
  }
}

function packageCrazyGames() {
  const result = spawnSync(process.execPath, [crazyGamesPackager], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    if (typeof result.stdout === "string") process.stderr.write(result.stdout);
    if (typeof result.stderr === "string") process.stderr.write(result.stderr);
    throw new Error(`CrazyGames reproducibility package failed${result.error ? `: ${result.error.message}` : ""}`);
  }
}

async function archiveHash() {
  return createHash("sha256").update(await readFile(crazyGamesArchive)).digest("hex");
}

async function assertArtifactBoundary(target, hashes, root) {
  const files = new Set(hashes.keys());
  if (!files.has("index.html")) throw new Error(`${target} output has no index.html`);
  if ([...files].some((file) => /(^|\/)(?:src|tests?|plans?|\.git(?:hub)?)(?:\/|$)/u.test(file)
    || /(?:^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|wrangler\.jsonc|vite\.config\.[cm]?[jt]s|tsconfig(?:\.[^.]+)?\.json|eslint\.config\.[cm]?[jt]s)$/u.test(file))) {
    throw new Error(`${target} output contains repository/source material`);
  }
  if (target === "standalone") {
    for (const required of ["_headers", "manifest.webmanifest", "sw.js"]) {
      if (!files.has(required)) throw new Error(`standalone output is missing ${required}`);
    }
  } else {
    const standaloneArtifacts = [...files].filter((file) => {
      const filename = file.slice(file.lastIndexOf("/") + 1);
      return file === "_headers" || file === "manifest.webmanifest" || file === "sw.js"
        || filename === "registerSW.js" || filename.startsWith("workbox-");
    });
    if (standaloneArtifacts.length > 0) {
      throw new Error(`CrazyGames output unexpectedly contains standalone PWA artifacts: ${standaloneArtifacts.join(", ")}`);
    }
    const html = await readFile(join(root, "index.html"), "utf8");
    if (/(?:src|href)="\/assets\//u.test(html)) throw new Error("CrazyGames output contains root-absolute game assets");
    let totalBytes = 0;
    for (const file of files) totalBytes += (await stat(join(root, file))).size;
    if (files.size > 1_500) throw new Error(`CrazyGames output exceeds the 1,500-file portal limit: ${String(files.size)}`);
    if (totalBytes > 20 * 1024 * 1024) {
      throw new Error(`CrazyGames output exceeds Tear's 20 MiB mobile-homepage budget: ${String(totalBytes)} bytes`);
    }
  }
}

function compare(target, first, second) {
  const names = [...new Set([...first.keys(), ...second.keys()])].sort();
  const differences = names.filter((name) => first.get(name) !== second.get(name));
  if (differences.length > 0) throw new Error(`${target} build is not reproducible: ${differences.join(", ")}`);
  console.log(`PASS ${target}: ${String(names.length)} byte-identical generated files`);
}

try {
  for (const target of ["standalone", "crazygames"]) {
    const firstRoot = join(temporaryRoot, `${target}-a`);
    const secondRoot = join(temporaryRoot, `${target}-b`);
    build(target, firstRoot);
    build(target, secondRoot);
    const first = await fileHashes(firstRoot);
    const second = await fileHashes(secondRoot);
    await assertArtifactBoundary(target, first, firstRoot);
    await assertArtifactBoundary(target, second, secondRoot);
    compare(target, first, second);
  }
  packageCrazyGames();
  const firstArchiveHash = await archiveHash();
  packageCrazyGames();
  const secondArchiveHash = await archiveHash();
  if (firstArchiveHash !== secondArchiveHash) throw new Error("CrazyGames ZIP is not reproducible");
  console.log(`PASS CrazyGames ZIP: byte-identical SHA-256 ${firstArchiveHash}`);
} finally {
  const safeTemporaryRoot = resolve(temporaryRoot);
  if (resolve(safeTemporaryRoot, "..") === resolve(tmpdir()) && basename(safeTemporaryRoot).startsWith("tear-repro-")) {
    await rm(safeTemporaryRoot, { recursive: true, force: true });
  }
}
