// The design check of docs/ENGINEERING_STANDARD.md: the six questions every plan and pull request
// answers. This module is the one copy of the labels, the answer rule and the gate's mode. The pull
// request template test checks the template and the standard against the labels, `pnpm merge:ready`
// applies the verdict, and `pnpm design-check:report` replays it over merged pull requests.
import { spawnSync } from "node:child_process";

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
 * The answer to `label`, or null when no line gives it. The label line is a list item or plain line
 * whose bold span starts with the label as whole words, in any case, in one of three shapes:
 * - a colon inside the span: `**Cause:**`, `**Cause and check:**`, `**Cause: the test, not the load.**`;
 * - a colon right after the span, behind at most one parenthetical: `**Cause**:`, `**Measured** (on CI):`;
 * - a label sentence ending in a full stop: `**Cause.**`.
 * A colon further along the line is prose and does not make a label. A heading such as `### Cause`
 * is prose, not an answer. The answer is what follows the colon inside the span plus the rest of
 * the line or, when that is empty, the indented lines under it (a nested list).
 */
function answerFor(text, label) {
  const name = `\\*\\*${escape(label)}(?![\\p{L}\\p{N}])`;
  const inside = `[^*:\\n]*:([^*\\n]*)\\*\\*`;
  const after = `[^*:\\n]*\\*\\*[ \\t]*(?:\\([^)\\n]*\\))?[ \\t]*:`;
  const sentence = `[^*:\\n]*\\.\\*\\*`;
  const pattern = `^[ \\t]*(?:[-*]|\\d+\\.)?[ \\t]*${name}(?:${inside}|${after}|${sentence})(.*)$`;
  const line = new RegExp(pattern, "imu").exec(text);
  if (line === null) return null;
  const rest = `${line[1] ?? ""} ${line[2]}`.trim();
  if (rest !== "") return rest;
  const below = text
    .slice(line.index + line[0].length)
    .split("\n")
    .slice(1);
  const nested = [];
  for (const next of below) {
    if (!/^[ \t]+\S/u.test(next)) break;
    nested.push(next.trim().replace(/^(?:[-*]|\d+\.)\s+/u, ""));
  }
  return nested.join(" ");
}

/**
 * The labels a description leaves unanswered, each with why (see answerFor for what an answer
 * is). It must not be empty, and "n/a" counts only with a reason.
 * @param {string | undefined} body the pull request description
 * @returns {{ label: string, problem: string }[]}
 */
export function designCheckGaps(body) {
  const text = readable(body);
  const gaps = [];
  for (const label of DESIGN_CHECK_LABELS) {
    const answer = answerFor(text, label);
    if (answer === null) gaps.push({ label, problem: "missing" });
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
 * Validates the text of config/design-check.json. An unknown mode or a bad date throws, so a
 * broken setting stops merges instead of silently switching the gate off.
 * @param {string} text the file's contents
 * @param {string} [source] where the text came from, for the error
 * @returns {{ mode: string, observingSince: string }}
 */
export function parseDesignCheckConfig(text, source = DESIGN_CHECK_CONFIG) {
  const config = JSON.parse(text);
  if (!DESIGN_CHECK_MODES.includes(config.mode)) {
    throw new Error(`${source}: mode must be one of ${DESIGN_CHECK_MODES.join(", ")}`);
  }
  if (!OBSERVING_SINCE.test(String(config.observingSince))) {
    throw new Error(`${source}: observingSince must be a YYYY-MM-DD date or a UTC time`);
  }
  return { mode: config.mode, observingSince: config.observingSince };
}

/**
 * The gate's setting as main has it: `git show <ref>:config/design-check.json`, never the working
 * tree, so a pull request branch cannot switch its own gate off and a lagging checkout does not
 * decide. The caller fetches the ref first. A missing or unreadable file throws.
 * @param {string} root a checkout of the repository
 * @param {string} [ref] the ref whose copy decides; "origin/main"
 * @returns {{ mode: string, observingSince: string }}
 */
export function readDesignCheckConfig(root, ref = "origin/main") {
  const source = `${ref}:${DESIGN_CHECK_CONFIG}`;
  const shown = spawnSync("git", ["show", source], { cwd: root, encoding: "utf8", windowsHide: true });
  if (shown.status !== 0) throw new Error(`cannot read ${source}: ${String(shown.stderr).trim()}`);
  return parseDesignCheckConfig(shown.stdout, source);
}
