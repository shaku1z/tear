import { deflateRawSync } from "node:zlib";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const input = path.join(root, "dist", "crazygames");
const output = path.join(root, "artifacts", "tear-crazygames.zip");

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

async function main() {
  if (!(await stat(input).catch(() => undefined))?.isDirectory()) {
    throw new Error("dist/crazygames is missing; run pnpm build:crazygames first");
  }
  const names = await filesBelow(input);
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
  if (archive.length > 20 * 1024 * 1024) throw new Error(`CrazyGames ZIP is ${archive.length} bytes; Tear's budget is 20 MiB`);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, archive);
  console.log(`CrazyGames upload package: ${path.relative(root, output)} (${names.length} files, ${archive.length} bytes, index.html at root)`);
}

await main();
