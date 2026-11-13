import { deflateRawSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * A deterministic ZIP writer for the portal upload packages: sorted names, a fixed timestamp,
 * UTF-8 names and maximum deflate, so the same directory always yields the same bytes.
 */
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

/** Relative POSIX paths of every file below a directory, in name order. */
export async function filesBelow(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await filesBelow(path.join(directory, entry.name), relative)));
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

/** The ZIP bytes for the named files below `directory`. */
export async function zipFiles(directory, names) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const name of names) {
    const filename = Buffer.from(name, "utf8");
    const content = await readFile(path.join(directory, ...name.split("/")));
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
  return Buffer.concat([...localParts, central, end]);
}
