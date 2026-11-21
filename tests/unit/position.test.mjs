import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  POSITION_DOCUMENT_DIRECTORY,
  POSITION_INDEX_DOCUMENT_PATH,
  POSITION_INDEX_SOURCE_PATH,
  POSITION_PRODUCTION_DOCUMENT_PATH,
  POSITION_PRODUCTION_SOURCE_PATH,
  POSITION_SOURCE_DIRECTORY,
  areaDocumentPath,
  areaFiles,
  areaSourcePath,
  checkPosition,
  readPosition,
  renderPosition,
  validatePosition,
  writePosition,
} from "../../scripts/position.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = readPosition(root).position;
const fixtures = [];

function writeFile(directory, relativePath, content) {
  fs.mkdirSync(path.dirname(path.join(directory, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(directory, relativePath), content);
}

function sourceFiles(position) {
  const files = new Map([
    [POSITION_INDEX_SOURCE_PATH, position.index],
    [POSITION_PRODUCTION_SOURCE_PATH, position.production],
  ]);
  for (const area of position.areas) files.set(areaSourcePath(area.id), area);
  return files;
}

/** A repository with the given position source, the evidence it names and, unless told otherwise, its render. */
function fixture(position = source, { rendered = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tear-position-"));
  fixtures.push(directory);
  for (const area of position.areas)
    for (const entry of area.evidence ?? []) if (!entry.startsWith("https://")) writeFile(directory, entry, "");
  for (const [relativePath, value] of sourceFiles(position))
    writeFile(directory, relativePath, `${JSON.stringify(value, null, 2)}\n`);
  if (rendered) for (const [relativePath, page] of renderPosition(position)) writeFile(directory, relativePath, page);
  return directory;
}

/** Every position file under a fixture, by repository path, so two states of it can be compared. */
function snapshot(directory) {
  const files = new Map();
  for (const folder of [POSITION_SOURCE_DIRECTORY, POSITION_DOCUMENT_DIRECTORY])
    for (const name of fs.readdirSync(path.join(directory, folder)))
      files.set(`${folder}/${name}`, fs.readFileSync(path.join(directory, folder, name), "utf8"));
  return files;
}

/** What a pull request would touch: edit the source the way `change` says, render, and list the files that differ. */
function filesTouchedBy(change) {
  const directory = fixture();
  const before = snapshot(directory);
  const position = structuredClone(source);
  change(position);
  for (const [relativePath, value] of sourceFiles(position))
    writeFile(directory, relativePath, `${JSON.stringify(value, null, 2)}\n`);
  const reread = readPosition(directory);
  expect(reread.errors).toEqual([]);
  writePosition(directory, reread.position);
  const after = snapshot(directory);
  return [...new Set([...before.keys(), ...after.keys()])].filter((key) => before.get(key) !== after.get(key)).sort();
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("generated position", () => {
  it("the tracked docs/position pages are the current render of config/position", () => {
    expect(checkPosition(root).errors).toEqual([]);
  });

  it("fails when a page was edited by hand", () => {
    const directory = fixture();
    const page = areaDocumentPath(source.areas[0].id);
    writeFile(directory, page, `${fs.readFileSync(path.join(directory, page), "utf8")}\nDone.\n`);
    expect(checkPosition(directory).errors).toEqual([
      expect.stringMatching(/^docs\/position\/.+ is stale or was edited by hand/u),
    ]);
  });

  it("fails when a page is missing, and when a page has no source area", () => {
    const directory = fixture(source, { rendered: false });
    expect(checkPosition(directory).errors).toContain(
      `${POSITION_INDEX_DOCUMENT_PATH} is missing; run pnpm position:render`,
    );
    writePosition(directory, source);
    writeFile(directory, areaDocumentPath("gone"), "# Gone\n");
    expect(checkPosition(directory).errors).toEqual([
      `${areaDocumentPath("gone")} has no source area; run pnpm position:render`,
    ]);
  });

  it("fails when an area file is not listed in the index, or a listed one is missing", () => {
    const directory = fixture();
    writeFile(directory, areaSourcePath("stray"), "{}");
    expect(checkPosition(directory).errors).toEqual([
      `${areaSourcePath("stray")} is not listed in ${POSITION_INDEX_SOURCE_PATH}`,
    ]);
    fs.rmSync(path.join(directory, areaSourcePath("stray")));
    fs.rmSync(path.join(directory, areaSourcePath(source.areas[0].id)));
    expect(checkPosition(directory).errors).toEqual([`${areaSourcePath(source.areas[0].id)} is missing`]);
  });

  it("accepts a CRLF checkout of an otherwise current render", () => {
    const directory = fixture();
    for (const [relativePath, page] of renderPosition(source))
      writeFile(directory, relativePath, page.replaceAll("\n", "\r\n"));
    expect(checkPosition(directory).errors).toEqual([]);
  });

  it("rejects evidence paths that do not exist", () => {
    const position = structuredClone(source);
    position.areas[0].evidence = ["docs/NO_SUCH_FILE.md"];
    const directory = fixture({ ...source, areas: [] }, { rendered: false });
    expect(validatePosition(position, directory)).toContain(
      `${areaSourcePath(position.areas[0].id)}: evidence "docs/NO_SUCH_FILE.md" does not exist`,
    );
  });

  it("rejects an id that is not the file name, unknown fields, multi-line text and empty evidence", () => {
    const position = structuredClone(source);
    const [first, second, third] = position.index.areas;
    position.areas[1].id = first;
    position.areas[0].status = "done";
    position.areas[0].summary = "two\nlines";
    position.areas[2].evidence = [];
    const errors = validatePosition(position, root);
    expect(errors).toContain(`${areaSourcePath(second)} is missing or its id is not "${second}"`);
    expect(errors).toContain(`${areaSourcePath(first)}: has unknown fields: status`);
    expect(errors.some((error) => error.startsWith(`${areaSourcePath(first)}: summary`))).toBe(true);
    expect(errors).toContain(`${areaSourcePath(third)}: evidence must list at least one path or pull request link`);
  });

  it("rejects an index that lists an area twice or uses a reserved name", () => {
    const position = structuredClone(source);
    position.index.areas.push(position.index.areas[0], "production");
    const errors = validatePosition(position, root);
    expect(errors).toContain(`${POSITION_INDEX_SOURCE_PATH}: areas lists "${position.index.areas[0]}" twice`);
    expect(errors.some((error) => error.includes('areas entry "production"'))).toBe(true);
  });

  it("renders deterministically, one page per area plus the index and production", () => {
    const pages = renderPosition(source);
    expect([...renderPosition(structuredClone(source))]).toEqual([...pages]);
    expect([...pages.keys()].sort()).toEqual(
      [
        POSITION_INDEX_DOCUMENT_PATH,
        POSITION_PRODUCTION_DOCUMENT_PATH,
        ...source.areas.map((area) => areaDocumentPath(area.id)),
      ].sort(),
    );
  });
});

// Two pull requests conflict only in files both touch. Each area's change must stay inside its own two files.
describe("position changes in different areas touch disjoint files", () => {
  const touched = new Map(
    source.areas.map((area) => [
      area.id,
      filesTouchedBy((position) => {
        const target = position.areas.find((entry) => entry.id === area.id);
        target.state = `${target.state} (changed)`;
        target.summary = `${target.summary} Changed.`;
        target.next = `${target.next} Changed.`;
        target.owner_action = "Changed.";
        target.evidence = [...target.evidence, "https://github.com/shaku1z/tear/pull/1"];
      }),
    ]),
  );

  it("changing every field of one area's state touches that area's source and page and nothing else", () => {
    for (const area of source.areas) expect(touched.get(area.id)).toEqual(areaFiles(area.id).sort());
  });

  it("no file is touched by two different areas, and none of them is the index", () => {
    const owners = new Map();
    for (const [id, files] of touched)
      for (const file of files) {
        expect(owners.get(file)).toBeUndefined();
        owners.set(file, id);
      }
    expect(owners.size).toBe(source.areas.length * 2);
    expect(owners.has(POSITION_INDEX_SOURCE_PATH)).toBe(false);
    expect(owners.has(POSITION_INDEX_DOCUMENT_PATH)).toBe(false);
  });

  it("a deploy touches production's two files only", () => {
    expect(
      filesTouchedBy((position) => {
        position.production.commit = "0".repeat(40);
        position.production.since = "2027-01-01";
        position.production.note = "Changed.";
      }),
    ).toEqual([POSITION_PRODUCTION_SOURCE_PATH, POSITION_PRODUCTION_DOCUMENT_PATH].sort());
  });

  it("adding or removing an area touches the index and that area's files only", () => {
    const added = { ...structuredClone(source.areas[0]), id: "new-area", name: "New area" };
    expect(
      filesTouchedBy((position) => {
        position.index.areas.push(added.id);
        position.areas.push(added);
      }),
    ).toEqual([POSITION_INDEX_SOURCE_PATH, POSITION_INDEX_DOCUMENT_PATH, ...areaFiles(added.id)].sort());
    const removed = source.areas.at(-1).id;
    const directory = fixture();
    const position = structuredClone(source);
    position.index.areas.pop();
    position.areas.pop();
    writeFile(directory, POSITION_INDEX_SOURCE_PATH, JSON.stringify(position.index));
    fs.rmSync(path.join(directory, areaSourcePath(removed)));
    // Before the render, the removed area's page is still there with no source: the check names it.
    expect(checkPosition(directory).errors).toContain(
      `${areaDocumentPath(removed)} has no source area; run pnpm position:render`,
    );
    expect(writePosition(directory, readPosition(directory).position)).toEqual(
      [POSITION_INDEX_DOCUMENT_PATH, areaDocumentPath(removed)].sort(),
    );
    expect(checkPosition(directory).errors).toEqual([]);
  });
});
