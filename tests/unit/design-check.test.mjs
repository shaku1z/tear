// The design-check gate's modes, its "not applicable" line, its setting, and the read-only replay
// behind `pnpm design-check:report`. Nothing here calls gh or touches the checkout.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { replay } from "../../scripts/design-check-report.mjs";
import {
  DESIGN_CHECK_CONFIG,
  DESIGN_CHECK_LABELS,
  DESIGN_CHECK_MODES,
  designCheckVerdict,
  parseDesignCheckConfig,
} from "../../scripts/design-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const answered = DESIGN_CHECK_LABELS.map((label) => `- **${label}:** an answer`).join("\n");
const unanswered = "## What and why\n\nA change.";

describe("design-check verdict", () => {
  it("refuses only in enforce, reports a would-refuse in observe, and checks nothing when off", () => {
    expect(designCheckVerdict(unanswered, "enforce").refuse).toContain("General case (missing)");
    const observed = designCheckVerdict(unanswered, "observe");
    expect(observed.refuse).toBeUndefined();
    expect(observed.note).toMatch(/^design check \(observe\): would refuse: the design check is not answered/u);
    expect(designCheckVerdict(unanswered, "off")).toEqual({});
    for (const mode of DESIGN_CHECK_MODES) expect(designCheckVerdict(answered, mode)).toEqual({});
  });

  it("accepts a whole-check not-applicable line with a reason, and prints it, in every checking mode", () => {
    for (const line of [
      "Design check: not applicable — fixes one typo",
      "**Design check:** not applicable - bumps a dependency",
    ]) {
      for (const mode of ["observe", "enforce"]) {
        expect(designCheckVerdict(`## What\n\n${line}\n`, mode)).toEqual({
          note: `design check not applicable: ${line.split(/ [—-] /u)[1]}`,
        });
      }
    }
  });

  it("does not accept a not-applicable line without a reason, or one inside a comment", () => {
    expect(designCheckVerdict("Design check: not applicable —", "enforce").refuse).toBeDefined();
    const template = fs.readFileSync(path.join(root, ".github", "pull_request_template.md"), "utf8");
    expect(template).toContain("Design check: not applicable — <reason>");
    expect(designCheckVerdict(template, "enforce").refuse).toContain("General case (empty)");
  });

  it("throws on an unknown mode instead of switching the gate off", () => {
    expect(() => designCheckVerdict(answered, "warn")).toThrow(/unknown design-check mode/u);
  });
});

describe("design-check setting", () => {
  it("is observe in the repository for now, observing since the template gained the check", () => {
    const text = fs.readFileSync(path.join(root, DESIGN_CHECK_CONFIG), "utf8");
    expect(parseDesignCheckConfig(text)).toEqual({ mode: "observe", observingSince: "2026-11-18T01:53:47Z" });
    const about = JSON.parse(text).about;
    expect(about).toContain("Switching to enforce is the lead's decision");
  });

  it("refuses an unknown mode or a missing date", () => {
    const parse = (config) => () => parseDesignCheckConfig(JSON.stringify(config));
    expect(parse({ mode: "strict", observingSince: "2026-11-18" })).toThrow(
      /mode must be one of off, observe, enforce/u,
    );
    expect(parse({ mode: "enforce" })).toThrow(/observingSince/u);
  });
});

describe("design-check report", () => {
  it("lists would-be refusals and accepted not-applicable lines, in number order, and counts the rest", () => {
    const result = replay([
      { number: 12, title: "typo", mergedAt: "2026-11-19T00:00:00Z", body: "Design check: not applicable — typo" },
      { number: 11, title: "no check", mergedAt: "2026-11-18T00:00:00Z", body: unanswered },
      { number: 10, title: "answered", mergedAt: "2026-11-18T00:00:00Z", body: answered },
    ]);
    expect(result.refused.map((row) => row.number)).toEqual([11]);
    expect(result.refused[0].reason).toContain("Removed (missing)");
    expect(result.notApplicable).toMatchObject([{ number: 12, reason: "design check not applicable: typo" }]);
    expect(result.answered).toBe(1);
  });
});
