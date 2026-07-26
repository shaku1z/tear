import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDocument,
  validateDocument,
} from "../../scripts/tearbench-requirements.mjs";

const source = readFileSync(
  new URL("../../docs/source/TEAR_AUTONOMOUS_PLAYTESTING_AND_AGENT_SKILL_PLAN.v0.6.md", import.meta.url),
  "utf8",
);
const plan = readFileSync(
  new URL("../../plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md", import.meta.url),
  "utf8",
);
const evidenceCatalog = JSON.parse(readFileSync(
  new URL("../../docs/tearbench-ghost3-evidence-catalog.json", import.meta.url),
  "utf8",
));

describe("C21.0 non-lossy requirements annex", () => {
  it("reconciles the reviewed source with zero validation errors", () => {
    const document = buildDocument(source, plan, evidenceCatalog);
    expect(validateDocument(document, source)).toEqual([]);
    expect(document.source.lineCount).toBe(13_725);
    expect(document.source.numberedSectionCount).toBe(81);
    expect(document.counts.requirements).toBeGreaterThan(6_000);
  });

  it("detects an unmapped source occurrence", () => {
    const document = structuredClone(buildDocument(source, plan, evidenceCatalog));
    const removed = document.occurrences.shift();
    const errors = validateDocument(document, source);
    expect(removed).toBeDefined();
    expect(errors.some((error) => error.includes("unmapped nonblank source line"))).toBe(true);
  });

  it("rejects a completion claim without evidence", () => {
    const document = structuredClone(buildDocument(source, plan, evidenceCatalog));
    const requirement = document.requirements.find((item) => item.normative);
    expect(requirement).toBeDefined();
    requirement.currentState = "certified";
    requirement.evidenceRefs = [];
    const errors = validateDocument(document, source);
    expect(errors).toContain(`${requirement.id} claims certified without evidence`);
  });
});
