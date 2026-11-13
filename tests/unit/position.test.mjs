import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  POSITION_DOCUMENT_PATH,
  POSITION_SOURCE_PATH,
  checkPosition,
  renderPosition,
  validatePosition,
} from "../../scripts/position.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = JSON.parse(fs.readFileSync(path.join(root, POSITION_SOURCE_PATH), "utf8"));
const fixtures = [];

function fixture(position = source, document = renderPosition(position)) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tear-position-"));
  fixtures.push(directory);
  for (const area of position.areas ?? [])
    for (const entry of area.evidence ?? []) {
      if (entry.startsWith("https://")) continue;
      fs.mkdirSync(path.dirname(path.join(directory, entry)), { recursive: true });
      fs.writeFileSync(path.join(directory, entry), "");
    }
  fs.mkdirSync(path.join(directory, "config"), { recursive: true });
  fs.mkdirSync(path.join(directory, "docs"), { recursive: true });
  fs.writeFileSync(path.join(directory, POSITION_SOURCE_PATH), JSON.stringify(position));
  if (document !== null) fs.writeFileSync(path.join(directory, POSITION_DOCUMENT_PATH), document);
  return directory;
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("generated position", () => {
  it("the tracked POSITION.md is the current render of config/position.json", () => {
    expect(checkPosition(root).errors).toEqual([]);
  });

  it("fails when POSITION.md was edited by hand", () => {
    const edited = renderPosition(source).replace("In progress", "Done");
    expect(checkPosition(fixture(source, edited)).errors[0]).toMatch(/stale or was edited by hand/u);
  });

  it("fails when POSITION.md is missing", () => {
    expect(checkPosition(fixture(source, null)).errors[0]).toMatch(/is missing; run pnpm position:render/u);
  });

  it("accepts a CRLF checkout of an otherwise current render", () => {
    const crlf = renderPosition(source).replaceAll("\n", "\r\n");
    expect(checkPosition(fixture(source, crlf)).errors).toEqual([]);
  });

  it("rejects evidence paths that do not exist", () => {
    const position = structuredClone(source);
    position.areas[0].evidence = ["docs/NO_SUCH_FILE.md"];
    const directory = fixture({ ...position, areas: [] }, null);
    expect(validatePosition(position, directory)).toContain('areas[0].evidence "docs/NO_SUCH_FILE.md" does not exist');
  });

  it("rejects duplicate ids, unknown fields, multi-line text and empty evidence", () => {
    const position = structuredClone(source);
    position.areas[1].id = position.areas[0].id;
    position.areas[0].status = "done";
    position.areas[0].summary = "two\nlines";
    position.areas[2].evidence = [];
    const errors = validatePosition(position, root);
    expect(errors).toContain(`areas[1].id duplicates "${position.areas[0].id}"`);
    expect(errors).toContain("areas[0] has unknown fields: status");
    expect(errors.some((error) => error.startsWith("areas[0].summary"))).toBe(true);
    expect(errors).toContain("areas[2].evidence must list at least one path or pull request link");
  });

  it("renders deterministically and lists every area once", () => {
    const rendered = renderPosition(source);
    expect(renderPosition(structuredClone(source))).toBe(rendered);
    for (const area of source.areas) expect(rendered.split(`<a id="${area.id}"></a>`)).toHaveLength(2);
  });
});
