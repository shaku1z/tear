// The pull request template keeps the sections reviewers read, and stays free of the attribution
// lines the history guard rejects, because the owner-safe merge uses the description as the squash
// commit body. The task card template keeps the metadata format check:docs reads from active plans.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replaceAll("\r\n", "\n");

describe("pull request template", () => {
  const template = read(".github/pull_request_template.md");

  it("asks for what, checks run, checks not run, risks and position, in that order", () => {
    const headings = [...template.matchAll(/^## (.+)$/gmu)].map((match) => match[1]);
    expect(headings).toEqual(["What and why", "Checks run here", "Checks that could not run", "Risks", "Position"]);
  });

  it("contains no attribution trailer or generated-with line", () => {
    expect(template).not.toMatch(/^[\w -]+-by:/imu);
    expect(template).not.toMatch(/generated (?:with|by) (?:claude|codex|an? (?:ai|agent))/iu);
  });
});

describe("task card template", () => {
  const card = read("plans/TASK_CARD_TEMPLATE.md");

  it("carries the active-plan metadata lines check:docs reads", () => {
    for (const label of ["Owner", "Status", "Closure condition"])
      expect(card.split("\n").some((line) => line.startsWith(`- **${label}:** `))).toBe(true);
    expect(card).toMatch(/^- \*\*Status:\*\* Active$/mu);
  });

  it("puts failure modes before the done-when list", () => {
    expect(card.indexOf("## Failure modes")).toBeGreaterThan(0);
    expect(card.indexOf("## Failure modes")).toBeLessThan(card.indexOf("## Done when"));
  });
});
