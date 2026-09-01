import { deflateRawSync } from "node:zlib";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyReleaseArtifact } from "./release-artifact.mjs";

const root = path.resolve(import.meta.dirname, "..");
const inputIndex = process.argv.indexOf("--input"), outputIndex = process.argv.indexOf("--output");
if ((inputIndex >= 0) !== (outputIndex >= 0) || (inputIndex >= 0 && process.argv.length !== 6)) {
  throw new TypeError("usage: node scripts/package-crazygames.mjs [--input path --output path]");
}
const input = inputIndex >= 0 ? path.resolve(process.argv[inputIndex + 1]) : path.join(root, "dist", "crazygames");
const output = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : path.join(root, "artifacts", "packages", "tear-crazygames.zip");

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function filesBelow(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await filesBelow(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

function localHeader(name, crc, compressedSize, originalSize) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressedSize, 18);
  header.writeUInt32LE(originalSize, 22);
  header.writeUInt16LE(Buffer.byteLength(name), 26);
  return header;
}

function centralHeader(name, crc, compressedSize, originalSize, offset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(8, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(33, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(compressedSize, 20);
  header.writeUInt32LE(originalSize, 24);
  header.writeUInt16LE(Buffer.byteLength(name), 28);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return header;
}

function isRepositoryMaterial(name) {
  return /(^|\/)(?:src|tests?|plans?|\.git(?:hub)?)(?:\/|$)/u.test(name)
    || /(?:^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|wrangler\.jsonc|vite\.config\.[cm]?[jt]s|tsconfig(?:\.[^.]+)?\.json|eslint\.config\.[cm]?[jt]s)$/u.test(name);
}

function isStandalonePwaArtifact(name) {
  const basename = path.posix.basename(name);
  return name === "_headers"
    || name === "manifest.webmanifest"
    || name === "sw.js"
    || basename === "registerSW.js"
    || basename.startsWith("workbox-");
}

function isRevisionAsset(name) {
  return /^audio\/cues\/[^/]+\/opus\/revisions\/[^/]+\//u.test(name);
}

async function activeRevisionAssets(input, names) {
  const referenced = new Set();
  const cueNames = names.filter((name) => /^audio\/cues\/[^/]+\/cue\.json$/u.test(name));
  for (const cueName of cueNames) {
    const cue = JSON.parse(await readFile(path.join(input, ...cueName.split("/")), "utf8"));
    for (const stem of Array.isArray(cue?.stems) ? cue.stems : []) {
      for (const source of Array.isArray(stem?.sources) ? stem.sources : []) {
        if (typeof source?.url !== "string") continue;
        const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(cueName), source.url.replaceAll("\\", "/")));
        if (isRevisionAsset(candidate) && names.includes(candidate)) referenced.add(candidate);
      }
    }
  }
  return referenced;
}

async function main() {
  if (!(await stat(input).catch(() => undefined))?.isDirectory()) {
    throw new Error("dist/crazygames is missing; run pnpm build:crazygames first");
  }
  const buildInfo = JSON.parse(await readFile(path.join(input, "build-info.json"), "utf8"));
  await verifyReleaseArtifact({ directory: input, expectedRepository: buildInfo.repository, expectedSha: buildInfo.sha,
    expectedTarget: "crazygames", expectedMode: "crazygames", sourceDirectory: root, allowDirty: true });
  const allNames = await filesBelow(input);
  const activeRevisions = await activeRevisionAssets(input, allNames);
  const names = allNames.filter((name) => !isRevisionAsset(name) || activeRevisions.has(name));
  const prunedRevisionCount = allNames.length - names.length;
  if (prunedRevisionCount > 0) console.log(`Excluded ${prunedRevisionCount} unreachable revision asset(s) from CrazyGames package`);
  if (!names.includes("index.html")) throw new Error("CrazyGames package must have index.html at its root");
  if (names.some((name) => name.endsWith(".map") || isRepositoryMaterial(name))) {
    throw new Error("CrazyGames package contains development or repository artifacts");
  }
  if (names.length > 1_500) throw new Error(`CrazyGames package has ${names.length} files; budget is 1,500`);
  if (names.some(isStandalonePwaArtifact)) throw new Error("CrazyGames package must not include standalone PWA files");
  const html = await readFile(path.join(input, "index.html"), "utf8");
  if (/rel=["']manifest["']/u.test(html) || /(?:src|href)=["']\/assets\//u.test(html)) {
    throw new Error("CrazyGames index contains standalone or root-absolute asset markup");
  }

  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const name of names) {
    const filename = Buffer.from(name, "utf8");
    const content = await readFile(path.join(input, ...name.split("/")));
    const compressed = deflateRawSync(content, { level: 9 });
    const crc = crc32(content);
    const header = localHeader(name, crc, compressed.length, content.length);
    localParts.push(header, filename, compressed);
    centralParts.push(centralHeader(name, crc, compressed.length, content.length, offset), filename);
    offset += header.length + filename.length + compressed.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  const archive = Buffer.concat([...localParts, central, end]);
  if (archive.length > 20.5 * 1024 * 1024) throw new Error(`CrazyGames ZIP is ${archive.length} bytes; Tear's budget is 20.5 MiB`);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, archive);
  console.log(`CrazyGames upload package: ${path.relative(root, output)} (${names.length} files, ${archive.length} bytes, index.html at root)`);
}

await main();
