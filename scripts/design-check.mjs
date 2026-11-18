// The design check of docs/ENGINEERING_STANDARD.md: the six questions every plan and pull request
// answers. This module is the one copy of the labels, the answer rule and the gate's mode. The pull
// request template test checks the template and the standard against the labels, `pnpm merge:ready`
// applies the verdict, and `pnpm design-check:report` replays it over merged pull requests.
import fs from "node:fs";
import path from "node:path";

/** The design-check labels, in the order the standard asks them. */
export const DESIGN_CHECK_LABELS = Object.freeze([
  "General case",
  "One owner",
  "The next one",
  "Cause",
  "Measured",
  "Removed",
]);

/** Where the gate's mode lives, relative to the repository root. */
export const DESIGN_CHECK_CONFIG = "config/design-check.json";

/** A day (`2026-11-18`) or a UTC time (`2026-11-18T01:53:47Z`), as GitHub search reads it. */
export const OBSERVING_SINCE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z)?$/u;

/** off: not checked. observe: report what would be refused, refuse nothing. enforce: refuse. */
export const DESIGN_CHECK_MODES = Object.freeze(["off", "observe", "enforce"]);

const escape = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** "n/a" alone, or followed only by punctuation, gives no reason. */
const BARE_NOT_APPLICABLE = /^n\/?a\W*$/iu;

/** One line for a change with nothing to design: `Design check: not applicable — <reason>`. */
const WHOLE_CHECK_NOT_APPLICABLE = /^\s*(?:\*\*)?Design check:(?:\*\*)?\s*not applicable\s*[—–:-]+\s*(.*)$/imu;

/** The description as the gate reads it: line endings unified, HTML comments (template prompts) removed. */
function readable(body) {
  return String(body ?? "")
    .replaceAll("\r\n", "\n")
    .replaceAll(/<!--[\s\S]*?-->/gu, "");
}

/**
 * The labels a description leaves unanswered, each with why. An answer is the text after
 * `**Label:**` on its line. It must not be empty, and "n/a" counts only with a reason after it.
 * @param {string | undefined} body the pull request description
 * @returns {{ label: string, problem: string }[]}
 */
export function designCheckGaps(body) {
  const text = readable(body);
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

/**
 * What the gate makes of a description under a mode.
 * - `refuse`: the reason to refuse (enforce mode only).
 * - `note`: what to print and let through: a would-refuse in observe mode, or an accepted
 *   whole-check "not applicable" line with its reason.
 * @param {string | undefined} body
 * @param {string} mode one of DESIGN_CHECK_MODES
 * @returns {{ refuse?: string, note?: string }}
 */
export function designCheckVerdict(body, mode) {
  if (!DESIGN_CHECK_MODES.includes(mode)) throw new Error(`unknown design-check mode "${String(mode)}"`);
  if (mode === "off") return {};
  const whole = WHOLE_CHECK_NOT_APPLICABLE.exec(readable(body));
  const reason = whole?.[1].trim() ?? "";
  if (whole !== null && reason !== "") return { note: `design check not applicable: ${reason}` };
  const gaps = designCheckGaps(body);
  if (gaps.length === 0) return {};
  const refusal = `the design check is not answered: ${gaps.map((gap) => `${gap.label} (${gap.problem})`).join(", ")}`;
  return mode === "enforce" ? { refuse: refusal } : { note: `design check (observe): would refuse: ${refusal}` };
}

/**
 * The gate's setting from config/design-check.json. An unreadable file or an unknown mode throws,
 * so a broken setting stops merges instead of silently switching the gate off.
 * @param {string} root the repository root
 * @returns {{ mode: string, observingSince: string }}
 */
export function readDesignCheckConfig(root) {
  const config = JSON.parse(fs.readFileSync(path.join(root, DESIGN_CHECK_CONFIG), "utf8"));
  if (!DESIGN_CHECK_MODES.includes(config.mode)) {
    throw new Error(`${DESIGN_CHECK_CONFIG}: mode must be one of ${DESIGN_CHECK_MODES.join(", ")}`);
  }
  if (!OBSERVING_SINCE.test(String(config.observingSince))) {
    throw new Error(`${DESIGN_CHECK_CONFIG}: observingSince must be a YYYY-MM-DD date or a UTC time`);
  }
  return { mode: config.mode, observingSince: config.observingSince };
}
