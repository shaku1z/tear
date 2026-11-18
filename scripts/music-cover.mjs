#!/usr/bin/env node
// Adds or replaces one MUSIC cover: encodes a stage painting at every size the manifest lists,
// writes the files and the stage's row in src/presentation/assets/music-covers/covers.json, and
// refuses a cover over the manifest's per-cover byte limit. The painting itself stays where it is.
//
//   pnpm music:cover add <stageId> <painting.png> --description <text> --licence <text>
//
// tests/unit/music-covers.test.ts then checks the row names a real stage and matches its files.
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";

export const COVERS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../src/presentation/assets/music-covers");
const STAGE_ID = /^[a-z][a-z-]*$/u;

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

export const coverFileName = (stageId, size) => `${stageId}-${String(size)}.webp`;

/** Encodes `source` at every manifest size: [{ file, size, bytes, sha256, data }]. */
export async function encodeCover(manifest, stageId, source) {
  const { quality, effort } = manifest.encoding;
  return Promise.all(
    manifest.sizes.map(async (size) => {
      const data = await sharp(source).resize(size, size, { fit: "cover" }).webp({ quality, effort }).toBuffer();
      return { file: coverFileName(stageId, size), size, bytes: data.length, sha256: sha256(data), data };
    }),
  );
}

/** All of a cover's files together, in bytes (the manifest's per-cover limit applies to this). */
export const coverBytes = (row) => row.files.reduce((sum, file) => sum + file.bytes, 0);

/**
 * The manifest with this stage's row added or replaced (rows stay in their order; a new one goes
 * last). Refuses a row over the per-cover limit, so the total grows with the stages, never by edits.
 */
export function withCover(manifest, row) {
  const bytes = coverBytes(row);
  if (bytes > manifest.maxBytesPerCover)
    throw new Error(
      `${row.stageId}'s files total ${String(bytes)} bytes, over the per-cover limit of ${String(manifest.maxBytesPerCover)}`,
    );
  const covers = manifest.covers.some((cover) => cover.stageId === row.stageId)
    ? manifest.covers.map((cover) => (cover.stageId === row.stageId ? row : cover))
    : [...manifest.covers, row];
  return { ...manifest, covers };
}

export async function addCover(stageId, painting, { description, licence }, dir = COVERS_DIR) {
  if (!STAGE_ID.test(stageId)) throw new Error(`"${stageId}" is not a stage id`);
  if (!description || !licence) throw new Error("--description and --licence are both required");
  const manifestPath = join(dir, "covers.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const source = readFileSync(painting);
  const files = await encodeCover(manifest, stageId, source);
  const row = {
    stageId,
    description,
    origin: "owner-supplied",
    licence,
    source: { bytes: source.length, sha256: sha256(source) },
    files: files.map(({ file, size, bytes, sha256: hash }) => ({ file, size, bytes, sha256: hash })),
  };
  const next = withCover(manifest, row);
  const old = manifest.covers.find((cover) => cover.stageId === stageId);
  for (const file of old?.files ?? []) rmSync(join(dir, file.file), { force: true });
  for (const file of files) writeFileSync(join(dir, file.file), file.data);
  writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
  for (const file of files) console.log(`${file.file}  ${String(file.bytes)} bytes`);
  console.log(`${old ? "replaced" : "added"} ${stageId} from ${basename(painting)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { description: { type: "string" }, licence: { type: "string" } },
  });
  const [command, stageId, painting] = positionals;
  if (command !== "add" || !stageId || !painting) {
    console.error("usage: pnpm music:cover add <stageId> <painting.png> --description <text> --licence <text>");
    process.exit(2);
  }
  addCover(stageId, painting, values).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
