import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDocument,
  renderDigest,
  renderMarkdown,
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
const evidenceCatalog = JSON.parse(
  readFileSync(new URL("../../docs/tearbench-ghost3-evidence-catalog.json", import.meta.url), "utf8"),
);

// Each case rebuilds the full annex from the 13,725-line reviewed source.
// Measured on 2026-11-11: 2.9-3.1 s alone and 3.9-4.1 s beside two other heavy
// files, so the 5 s default timed out under suite load without a defect.
const ANNEX_BUILD_TIMEOUT_MS = 20_000;

describe("C21.0 non-lossy requirements annex", () => {
  it("reconciles the reviewed source with zero validation errors", { timeout: ANNEX_BUILD_TIMEOUT_MS }, () => {
    const document = buildDocument(source, plan, evidenceCatalog);
    expect(validateDocument(document, source)).toEqual([]);
    expect(document.source.lineCount).toBe(13_725);
    expect(document.source.numberedSectionCount).toBe(81);
    expect(document.counts.requirements).toBeGreaterThan(6_000);
  });

  it("detects an unmapped source occurrence", { timeout: ANNEX_BUILD_TIMEOUT_MS }, () => {
    const document = structuredClone(buildDocument(source, plan, evidenceCatalog));
    const removed = document.occurrences.shift();
    const errors = validateDocument(document, source);
    expect(removed).toBeDefined();
    expect(errors.some((error) => error.includes("unmapped nonblank source line"))).toBe(true);
  });

  it("rejects a completion claim without evidence", { timeout: ANNEX_BUILD_TIMEOUT_MS }, () => {
    const document = structuredClone(buildDocument(source, plan, evidenceCatalog));
    const requirement = document.requirements.find((item) => item.normative);
    expect(requirement).toBeDefined();
    requirement.currentState = "certified";
    requirement.evidenceRefs = [];
    const errors = validateDocument(document, source);
    expect(errors).toContain(`${requirement.id} claims certified without evidence`);
  });
});

describe("tracked requirements digest", () => {
  it(
    "matches the generated registry and changes when a requirement changes",
    { timeout: ANNEX_BUILD_TIMEOUT_MS },
    () => {
      const document = buildDocument(source, plan, evidenceCatalog);
      const json = `${JSON.stringify(document, null, 2)}\n`;
      const tracked = readFileSync(
        new URL("../../docs/tearbench-ghost3-requirements.digest.json", import.meta.url),
        "utf8",
      ).replaceAll("\r\n", "\n");
      expect(renderDigest(document, json, renderMarkdown(document))).toBe(tracked);
      const changed = structuredClone(document);
      changed.requirements[0].text = `${changed.requirements[0].text} (edited)`;
      const changedJson = `${JSON.stringify(changed, null, 2)}\n`;
      expect(renderDigest(changed, changedJson, renderMarkdown(changed))).not.toBe(tracked);
    },
  );
});
