// The design check of docs/ENGINEERING_STANDARD.md: the six questions every plan and pull request
// answers. This list is the one copy. The pull request template test checks the template and the
// standard against it, and `pnpm merge:ready` refuses a pull request whose description leaves one
// unanswered.

/** The design-check labels, in the order the standard asks them. */
export const DESIGN_CHECK_LABELS = Object.freeze([
  "General case",
  "One owner",
  "The next one",
  "Cause",
  "Measured",
  "Removed",
]);

const escape = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** "n/a" alone, or followed only by punctuation, gives no reason. */
const BARE_NOT_APPLICABLE = /^n\/?a\W*$/iu;

/**
 * The labels a pull request description leaves unanswered, each with why. An answer is the text
 * after `**Label:**` on its line, with HTML comments (the template's prompts) removed. It must not
 * be empty, and "n/a" counts only with a reason after it ("n/a: docs only").
 * @param {string} body the pull request description
 * @returns {{ label: string, problem: string }[]}
 */
export function designCheckGaps(body) {
  const text = String(body ?? "")
    .replaceAll("\r\n", "\n")
    .replaceAll(/<!--[\s\S]*?-->/gu, "");
  const gaps = [];
  for (const label of DESIGN_CHECK_LABELS) {
    const line = new RegExp(`^\\s*(?:[-*]|\\d+\\.)?\\s*\\*\\*${escape(label)}:\\*\\*(.*)$`, "mu").exec(text);
    const answer = line?.[1].trim() ?? "";
    if (line === null) gaps.push({ label, problem: "missing" });
    else if (answer === "") gaps.push({ label, problem: "empty" });
    else if (BARE_NOT_APPLICABLE.test(answer)) gaps.push({ label, problem: '"n/a" without a reason' });
  }
  return gaps;
}
