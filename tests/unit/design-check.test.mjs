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

  it("reads a label extended in its bold span or with the colon outside it, but not a heading", () => {
    // The shape of #214, which observe mode wrongly reported as "Cause (missing)".
    const extended = DESIGN_CHECK_LABELS.map((label, index) => {
      const shown = label === "Cause" ? "Cause and check" : label;
      return `${String(index + 1)}. **${shown}:** answer ${String(index)}`;
    }).join("\n");
    expect(designCheckVerdict(`### Cause\n\nprose\n\n## Design check\n\n${extended}`, "enforce")).toEqual({});
    expect(designCheckVerdict(answered.replace("**Cause:**", "**Cause**:"), "enforce")).toEqual({});
    const headingOnly = answered.replace("- **Cause:** an answer", "### Cause\n\nprose");
    expect(designCheckVerdict(headingOnly, "enforce").refuse).toContain("Cause (missing)");
    const otherWord = answered.replace("**Cause:**", "**Causes:**");
    expect(designCheckVerdict(otherWord, "enforce").refuse).toContain("Cause (missing)");
    const emptyExtended = answered.replace("**Cause:** an answer", "**Cause and check:**");
    expect(designCheckVerdict(emptyExtended, "enforce").refuse).toContain("Cause (empty)");
  });

  it("reads a qualifier before the colon and an answer given as a nested list", () => {
    // The shape of #205, which observe mode wrongly reported as "Measured (missing), Removed (empty)".
    const nested = answered
      .replace(
        "- **Measured:** an answer",
        "5. **Measured** (`pnpm build`, before and after):\n   - chunk: 554 kB to 556 kB",
      )
      .replace("- **Removed:** an answer", "6. **Removed:**\n   - the old comment;\n   - the copy.\n\n## Checks");
    expect(designCheckVerdict(nested, "enforce")).toEqual({});
    const notIndented = answered.replace("- **Removed:** an answer", "- **Removed:**\n\n## Checks\n\n- tests");
    expect(designCheckVerdict(notIndented, "enforce").refuse).toContain("Removed (empty)");
    const bareNested = answered.replace("- **Removed:** an answer", "- **Removed:**\n  - n/a");
    expect(designCheckVerdict(bareNested, "enforce").refuse).toContain('Removed ("n/a" without a reason)');
  });

  it("reads a label written as a bold sentence, and never takes a later colon in the prose as the label's", () => {
    // The shape of #240, which observe mode wrongly reported as "Cause (empty)".
    const summary = answered.replace(
      "- **Cause:** an answer",
      "**Cause: the test, not the load.** The wait was 250 ms.",
    );
    expect(designCheckVerdict(summary, "enforce")).toEqual({});
    // The shape of #262, read as answered only because of a colon later in the sentence.
    const sentence = answered.replace("- **Cause:** an answer", "**Cause.** A full checkpoint on every look.");
    expect(designCheckVerdict(sentence, "enforce")).toEqual({});
    const sentenceOnly = answered.replace("- **Cause:** an answer", "**Cause.**\n\n## Checks");
    expect(designCheckVerdict(sentenceOnly, "enforce").refuse).toContain("Cause (empty)");
    const prose = answered.replace(
      "- **Cause:** an answer",
      "- **Cause** was hidden by the profile: 1,403 ms in total",
    );
    expect(designCheckVerdict(prose, "enforce").refuse).toContain("Cause (missing)");
    const colonInQualifier = answered.replace(
      "- **Measured:** an answer",
      "- **Measured** (`pnpm build:test`):\n  - 3 s",
    );
    expect(designCheckVerdict(colonInQualifier, "enforce")).toEqual({});
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
