import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, translateMutableGeneratedDescriptions } from "./check-terminology.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const SOURCE_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/source/TEAR_AUTONOMOUS_PLAYTESTING_AND_AGENT_SKILL_PLAN.v0.6.md",
);
const PLAN_PATH = resolve(
  REPOSITORY_ROOT,
  "plans/TEARBENCH_GHOST3_AUTONOMOUS_COMPLETION_PLAN.md",
);
const JSON_PATH = resolve(REPOSITORY_ROOT, "docs/tearbench-ghost3-requirements.json");
const MARKDOWN_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/TEARBENCH_GHOST3_NON_LOSSY_REQUIREMENTS_ANNEX.md",
);
const EVIDENCE_CATALOG_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/tearbench-ghost3-evidence-catalog.json",
);
const DASHBOARD_PATH = resolve(
  REPOSITORY_ROOT,
  "docs/TEARBENCH_GHOST3_CAPABILITY_DASHBOARD.md",
);
const TERMINOLOGY_REGISTRY = loadRegistry(REPOSITORY_ROOT);

const EXPECTED_SOURCE = Object.freeze({
  sha256: "007BE22193F5369B8450AAB33B95C6D3080176E6B2F91A1D504B545CA7FC7DDE",
  lineCount: 13_725,
  rawHeadingCounts: Object.freeze({ h1: 12, h2: 93, h3: 603, h4: 175 }),
  structuralHeadingCounts: Object.freeze({ h1: 1, h2: 92, h3: 597, h4: 175 }),
  numberedSections: 81,
});

const ACTION_VERBS = [
  "add",
  "allow",
  "avoid",
  "build",
  "capture",
  "certify",
  "compare",
  "compile",
  "create",
  "define",
  "detect",
  "do not",
  "ensure",
  "expose",
  "generate",
  "implement",
  "include",
  "keep",
  "maintain",
  "measure",
  "must",
  "never",
  "preserve",
  "prevent",
  "provide",
  "record",
  "require",
  "run",
  "should",
  "store",
  "support",
  "track",
  "train",
  "use",
  "validate",
  "verify",
];

const COORDINATED_VERBS = new Set([
  ...ACTION_VERBS,
  "advances",
  "align",
  "applies",
  "archives",
  "assigns",
  "attaches",
  "blocks",
  "branches",
  "calculates",
  "calls",
  "cancels",
  "challenge",
  "chooses",
  "clears",
  "closes",
  "completes",
  "compresses",
  "connects",
  "consumes",
  "contains",
  "converts",
  "corrects",
  "creates",
  "deletes",
  "derives",
  "detects",
  "distinguishes",
  "documents",
  "emits",
  "enforces",
  "evaluates",
  "executes",
  "explains",
  "exports",
  "fails",
  "finds",
  "finishes",
  "fits",
  "flags",
  "forges",
  "generates",
  "handles",
  "identifies",
  "imports",
  "improves",
  "includes",
  "keeps",
  "labels",
  "launches",
  "let",
  "loads",
  "logs",
  "maps",
  "measures",
  "merges",
  "migrates",
  "minimizes",
  "monitors",
  "moves",
  "navigates",
  "opens",
  "persists",
  "plays",
  "powers",
  "prevents",
  "processes",
  "produces",
  "promotes",
  "proves",
  "publishes",
  "practice",
  "practices",
  "recovers",
  "receive",
  "receives",
  "records",
  "rejects",
  "remains",
  "removes",
  "renders",
  "repairs",
  "replays",
  "reports",
  "resets",
  "resolves",
  "restores",
  "retains",
  "returns",
  "runs",
  "saves",
  "selects",
  "separates",
  "share",
  "shares",
  "shows",
  "starts",
  "stores",
  "streams",
  "supports",
  "survives",
  "synchronizes",
  "trains",
  "turns",
  "updates",
  "uses",
  "validates",
  "verifies",
  "watches",
  "writes",
]);

const EVIDENCE_BY_CATEGORY = Object.freeze({
  accessibility: ["journey-checkpoint", "interaction-matrix"],
  architecture: ["unit-contract", "full-release-gate"],
  cloud: ["unit-contract", "interaction-matrix"],
  compatibility: ["unit-contract", "preservation-corpus"],
  "data-schema": ["unit-contract", "malformed-input"],
  documentation: ["documentation-validation"],
  gameplay: ["deterministic-scenario", "base-comparison"],
  "ml-training": ["deterministic-scenario", "journey-checkpoint"],
  moderation: ["unit-contract", "interaction-matrix"],
  operations: ["interaction-matrix", "full-release-gate"],
  performance: ["interaction-matrix", "long-run"],
  preservation: ["preservation-corpus", "full-release-gate"],
  privacy: ["unit-contract", "interaction-matrix"],
  research: ["documentation-validation"],
  security: ["malformed-input", "interaction-matrix"],
  "ui-ux": ["journey-checkpoint", "interaction-matrix"],
});

const CHECKPOINT_KEYWORDS = Object.freeze({
  C21: /\b(requirement|audit|status|ledger|terminology|architecture decision|living document)\b/i,
  C22: /\b(runtime bridge|observation|action space|determin|fixed[- ]step|input boundary|RNG stream|test isolation)\b/i,
  C23: /\b(State Forge|TearSDL|progression ledger|snapshot|restore|state class|reachability|synthesis|time travel|fork)\b/i,
  C24: /\b(scripted|Journey Director|menu navigator|competent policy|intent trace|agent hierarchy|mode contract)\b/i,
  C25: /\b(Class C|black-box|pixel|physical input|keyboard|controller|touch|observation parity)\b/i,
  C26: /\b(regression|minimi[sz]|divergence|failure signature|Graveyard|bisect|root cause)\b/i,
  C27: /\b(recorder|recording|capsule|Replay Trident|event ontology|causal graph|chunk|keyframe|backpressure)\b/i,
  C28: /\b(Vault|Ghost Doctor|Canon|Frontier|Corpus|quota|IndexedDB|knowledge librar|lineage)\b/i,
  C29: /\b(Theater|replay world|seek|Lens|comparison|trajectory|Practice From Here|possess|camera)\b/i,
  C30: /\b(headless|parallel environment|environment pool|throughput|batch|worker fabric)\b/i,
  C31: /\b(Academy|demonstration|corpus|dataset|consent|human takeover|correction|recovery sample)\b/i,
  C32: /\b(policy artifact|inference|encoder|decoder|model format|recurrent state|policy runtime|artifact registry)\b/i,
  C33: /\b(behavior clon|DAgger|imitation|supervised|validation loss|correction round)\b/i,
  C34: /\b(reinforcement|offline RL|online RL|self-play|population-based|quality-diversity|world model|reward hacking)\b/i,
  C35: /\b(bot ladder|level [1-9Ω]|Astuteness|bounded rationality|calibrat|item response|human-like|monotonicity)\b/i,
  C36: /\b(Agent Foundry|champion|challenger|weakness miner|curriculum generation|promotion|rollback|self-improving)\b/i,
  C37: /\b(Coach|Run Autopsy|challenge|Ghost Studio|Run DNA|Nemesis|Daily Echo|career archive|player experience)\b/i,
  C38: /\b(cloud|upload|publication|verification|privacy|moderation|D1|R2|relay|share link|discovery|deletion)\b/i,
  C39: /\b(CI|schedule|nightly|weekly|operations|support|preservation|historical runtime|Skill|CLI|tooling|matrix)\b/i,
  C40: /\b(release certification|release candidate|definition of done|definition of success|final gate|complete end state)\b/i,
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceSha256(value) {
  return sha256(value.replaceAll("\r\n", "\n"));
}

function normalizeText(value) {
  return value
    .replaceAll(/\r?\n/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function stableId(prefix, ...parts) {
  return `${prefix}-${sha256(parts.join("\u241f")).slice(0, 16).toUpperCase()}`;
}

function markdownCell(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll(/\r?\n/g, "<br>")
    .trim();
}

function checkpointNumbers(value) {
  if (value.trim().toLowerCase() === "all checkpoints") {
    return Array.from({ length: 20 }, (_, index) => `C${String(index + 21)}`);
  }
  const checkpoints = new Set();
  for (const match of value.matchAll(/C(\d+)(?:-C?(\d+))?/g)) {
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    for (let checkpoint = start; checkpoint <= end; checkpoint += 1) {
      checkpoints.add(`C${String(checkpoint)}`);
    }
  }
  return [...checkpoints].sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
}

export function extractCheckpointMap(planText) {
  const mapping = new Map();
  for (const line of planText.split(/\r?\n/)) {
    const match = line.match(/^\|\s*(\d+)\.\s+[^|]+\|\s*([^|]+)\|$/);
    if (match === null) continue;
    const section = Number(match[1]);
    const checkpoints = checkpointNumbers(match[2]);
    if (checkpoints.length > 0) mapping.set(section, checkpoints);
  }
  return mapping;
}

function headingCounts(lines) {
  const counts = { h1: 0, h2: 0, h3: 0, h4: 0 };
  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+/);
    if (match !== null) counts[`h${String(match[1].length)}`] += 1;
  }
  return counts;
}

function occurrence(
  kind,
  startLine,
  endLine,
  text,
  headingPath,
  numberedSection,
  metadata = {},
) {
  const normalized = normalizeText(text);
  const id = stableId(
    "SRC",
    kind,
    String(startLine),
    String(endLine),
    headingPath.join(" > "),
    normalized,
  );
  return {
    id,
    kind,
    sourceVersion: "0.6",
    startLine,
    endLine,
    headingPath: [...headingPath],
    numberedSection,
    text,
    textHash: sha256(text),
    normalizedText: normalized,
    ...metadata,
  };
}

function isTableSeparator(line) {
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function parseSource(sourceText) {
  const lines = sourceText.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const occurrences = [];
  const headings = [];
  const headingStack = [];
  let numberedSection = null;

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch !== null) {
      const level = headingMatch[1].length;
      const title = headingMatch[2];
      headingStack.length = level - 1;
      headingStack[level - 1] = title;
      if (level === 2) {
        const sectionMatch = title.match(/^(\d+)\.\s+/);
        if (sectionMatch !== null) numberedSection = Number(sectionMatch[1]);
      }
      const item = occurrence(
        "heading",
        index + 1,
        index + 1,
        line,
        headingStack.filter(Boolean),
        numberedSection,
        { level, title },
      );
      occurrences.push(item);
      headings.push(item);
      index += 1;
      continue;
    }

    if (/^\s*```/.test(line)) {
      const start = index;
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) index += 1;
      if (index < lines.length) index += 1;
      occurrences.push(occurrence(
        "code-block",
        start + 1,
        index,
        lines.slice(start, index).join("\n"),
        headingStack.filter(Boolean),
        numberedSection,
      ));
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      const kind = isTableSeparator(line)
        ? "table-separator"
        : (index + 1 < lines.length && isTableSeparator(lines[index + 1])
          ? "table-header"
          : "table-row");
      occurrences.push(occurrence(
        kind,
        index + 1,
        index + 1,
        line,
        headingStack.filter(Boolean),
        numberedSection,
      ));
      index += 1;
      continue;
    }

    if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(line)) {
      const start = index;
      index += 1;
      while (
        index < lines.length
        && lines[index].trim() !== ""
        && !/^(?:#{1,6})\s+/.test(lines[index])
        && !/^\s*```/.test(lines[index])
        && !/^\s*\|.*\|\s*$/.test(lines[index])
        && !/^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[index])
      ) {
        index += 1;
      }
      const raw = lines.slice(start, index).join("\n");
      occurrences.push(occurrence(
        "list-item",
        start + 1,
        index,
        raw,
        headingStack.filter(Boolean),
        numberedSection,
        { indent: line.match(/^\s*/)[0].length },
      ));
      continue;
    }

    const start = index;
    index += 1;
    while (
      index < lines.length
      && lines[index].trim() !== ""
      && !/^(?:#{1,6})\s+/.test(lines[index])
      && !/^\s*```/.test(lines[index])
      && !/^\s*\|.*\|\s*$/.test(lines[index])
      && !/^\s*(?:[-+*]|\d+[.)])\s+/.test(lines[index])
    ) {
      index += 1;
    }
    occurrences.push(occurrence(
      "paragraph",
      start + 1,
      index,
      lines.slice(start, index).join("\n"),
      headingStack.filter(Boolean),
      numberedSection,
    ));
  }

  return { lines, occurrences, headings };
}

function stripMarkdownPrefix(value) {
  return normalizeText(value)
    .replace(/^(?:[-+*]|\d+[.)])\s+/, "")
    .replace(/^\*\*(.+?)\*\*:?\s*/, "$1: ");
}

function splitTopLevelCommas(value) {
  const parts = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  let inBackticks = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "`") inBackticks = !inBackticks;
    if (inBackticks) continue;
    if (character === "(") round += 1;
    else if (character === ")") round = Math.max(0, round - 1);
    else if (character === "[") square += 1;
    else if (character === "]") square = Math.max(0, square - 1);
    else if (character === "{") curly += 1;
    else if (character === "}") curly = Math.max(0, curly - 1);
    else if (character === "," && round === 0 && square === 0 && curly === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function startsCoordinatedVerb(value) {
  const first = value
    .replace(/^(?:and|or|then)\s+/i, "")
    .match(/^[A-Za-z-]+/)?.[0]
    ?.toLowerCase();
  return first !== undefined && (COORDINATED_VERBS.has(first) || first.endsWith("ing"));
}

function coordinatedAtomicStatements(statement) {
  const components = splitTopLevelCommas(statement);
  if (
    components.length >= 3
    && /^(?:first|second|third|fourth|finally|however|therefore|for example|in practice)$/i.test(components[0])
  ) {
    components.splice(0, 2, `${components[0]}, ${components[1]}`);
  }
  if (components.length < 3) return [statement];
  const cleaned = components.map((component) => component.replace(/^(?:and|or|then)\s+/i, "").trim());
  const first = cleaned[0];
  const laterVerbRatio = cleaned.slice(1).filter(startsCoordinatedVerb).length / (cleaned.length - 1);
  const modal = first.match(/^(.*?\b(?:must|should|shall|will|can|cannot|may)\b)\s+(.+)$/i);
  if (modal !== null && laterVerbRatio >= 0.5) {
    const prepositionalAction = modal[2].match(/^(.*\b(?:of|for|across|including|into|with|from|between|through)\s+)([^,]+)$/i);
    if (prepositionalAction !== null && /^(?:be\s+(?:capable|able)|consist|remain)\b/i.test(modal[2])) {
      const prefix = `${modal[1]} ${prepositionalAction[1]}`;
      return [
        `${prefix}${prepositionalAction[2]}`,
        ...cleaned.slice(1).map((component) => `${prefix}${component}`),
      ];
    }
    return [
      `${modal[1]} ${modal[2]}`,
      ...cleaned.slice(1),
    ];
  }
  if (modal !== null && laterVerbRatio < 0.5) {
    const action = modal[2].match(/^([A-Za-z-]+)\s+(.+)$/);
    if (action !== null && COORDINATED_VERBS.has(action[1].toLowerCase())) {
      const prefix = `${modal[1]} ${action[1]} `;
      return [
        `${prefix}${action[2]}`,
        ...cleaned.slice(1).map((component) => `${prefix}${component}`),
      ];
    }
  }

  const subjectAction = first.match(/^((?:The|This|That|A|An|Each|Every|TearBench|Ghost(?:\s+3\.0)?|It)\b.*?\s)([A-Za-z-]+)(\s+.*)$/);
  if (subjectAction !== null && laterVerbRatio >= 0.5) {
    const prefix = subjectAction[1].trim();
    return [
      `${prefix} ${subjectAction[2]}${subjectAction[3]}`,
      ...cleaned.slice(1),
    ];
  }

  const imperative = first.match(/^([A-Za-z-]+)\s+(.+)$/);
  if (imperative !== null) {
    const verb = imperative[1].toLowerCase();
    const remainder = imperative[2];
    const preposition = remainder.match(/^(.*\b(?:of|for|across|including|into|with|from|between|through)\s+)([^,]+)$/i);
    if (COORDINATED_VERBS.has(verb) && preposition !== null && laterVerbRatio < 0.5) {
      const prefix = `${imperative[1]} ${preposition[1]}`;
      return [
        `${prefix}${preposition[2]}`,
        ...cleaned.slice(1).map((component) => `${prefix}${component}`),
      ];
    }
    if (COORDINATED_VERBS.has(verb) && laterVerbRatio >= 0.5) {
      return [first, ...cleaned.slice(1)];
    }
  }
  return cleaned;
}

function splitAtomicStatements(value) {
  const normalized = stripMarkdownPrefix(value);
  if (normalized === "") return [];
  const sentenceParts = normalized.split(/(?<=[.!?])\s+(?=(?:[A-Z`*]|\d+\.)\S*)/);
  const result = [];
  for (const sentence of sentenceParts) {
    const clauses = sentence
      .split(/;\s+(?=(?:and\s+|but\s+)?(?:[A-Z`*]|add\b|build\b|create\b|define\b|implement\b|preserve\b|record\b|support\b|use\b|verify\b))/i)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const clause of clauses) {
      const atomics = coordinatedAtomicStatements(clause);
      result.push(...atomics.map((text) => ({ text, sourceStatement: clause })));
    }
  }
  return result;
}

function headingContext(occurrenceValue) {
  return occurrenceValue.headingPath.join(" > ").toLowerCase();
}

function isNormativeStatement(statement, occurrenceValue) {
  if (occurrenceValue.kind === "code-block" || occurrenceValue.kind === "table-separator") return false;
  const text = statement.toLowerCase();
  const context = headingContext(occurrenceValue);
  const referenceContext = /\b(changelog|research basis|current ghost 2\.0 baseline|why tear is already well positioned|direct assessment|example)\b/.test(context);
  const modal = /\b(must|required?|shall|should|cannot|can't|never|do not|needs? to|non-negotiable|acceptance|exit gate|definition of done)\b/.test(text);
  const imperative = ACTION_VERBS.some((verb) => text.startsWith(`${verb} `) || text.startsWith(`${verb}:`));
  const actionContext = /\b(deliverables?|requirements?|acceptance|exit gate|definition of (?:done|success)|roadmap|milestone|phase|contract|workflow|goals?|responsibilities|tools?|api|cli|test suite|checks?|policy|rules?|recommended|next steps)\b/.test(context);
  if (occurrenceValue.kind === "list-item") return !referenceContext || modal || imperative || actionContext;
  if (occurrenceValue.kind === "table-row") return !/^\|\s*(?:field|dimension|metric|category|concept|layer|class|mode|level|phase|store|track|tool)\s*\|/i.test(occurrenceValue.text) || actionContext;
  return modal || imperative;
}

function classify(statement, occurrenceValue) {
  const value = `${headingContext(occurrenceValue)} ${statement}`.toLowerCase();
  const tests = [
    ["privacy", /\bprivacy|consent|pseudonym|personal data|data classification\b/],
    ["moderation", /\bmoderation|reporting|blocking|appeals?|quarantine\b/],
    ["security", /\bsecurity|exploit|hostile|tamper|integrity|signature|attack surface\b/],
    ["cloud", /\bcloud|upload|download|r2\b|d1\b|firebase|server|relay|publication\b/],
    ["preservation", /\bpreserv|historical runtime|long-term archive|golden replay|tombstone\b/],
    ["compatibility", /\bcompatib|migration|legacy|ghost 2\.0|v1\b|v2\b|cross-version\b/],
    ["ml-training", /\btrain|learning|policy|agent|academy|dagger|reinforcement|reward|model|foundry|tearbot\b/],
    ["accessibility", /\baccessib|screen reader|reduced motion|contrast|caption\b/],
    ["performance", /\bperformance|latency|throughput|memory|cpu|fps|frame time|budget\b/],
    ["ui-ux", /\bui\b|ux\b|screen|menu|hud|overlay|theater|studio|dashboard|visual|camera\b/],
    ["gameplay", /\bgameplay|combat|blade|enemy|boss|wave|movement|draft|weapon|ability|player\b/],
    ["data-schema", /\bschema|format|manifest|envelope|codec|serialization|field|payload|track\b/],
    ["operations", /\boperations?|ci\b|release|schedule|nightly|support|live-ops|monitor|rollback\b/],
    ["architecture", /\barchitecture|module|interface|contract|service|adapter|runtime|dependency\b/],
    ["documentation", /\bdocument|report|changelog|terminology|glossary\b/],
    ["research", /\bresearch|paper|basis|citation|reference\b/],
  ];
  return tests.find(([, pattern]) => pattern.test(value))?.[0] ?? "architecture";
}

function disposition(statement, occurrenceValue, normative) {
  if (!normative) return "reference";
  const value = `${headingContext(occurrenceValue)} ${statement}`.toLowerCase();
  if (/\b(rejected|must not implement|will not)\b/.test(value)) return "rejected";
  if (/\b(superseded|deprecated|former)\b/.test(value)) return "superseded";
  if (/\b(optional|could|may later|future|eventually|recommended|proposal|research)\b/.test(value)) return "optional";
  return "required";
}

function evidenceFor(category, normative) {
  if (!normative) return ["documentation-validation"];
  return [...(EVIDENCE_BY_CATEGORY[category] ?? ["unit-contract"])];
}

function ownerFor(category) {
  return {
    accessibility: "presentation/input",
    architecture: "app/domain contracts",
    cloud: "platform/workers",
    compatibility: "replay/persistence",
    "data-schema": "tearbench/ghost contracts",
    documentation: "program governance",
    gameplay: "gameplay/simulation",
    "ml-training": "agents/training tooling",
    moderation: "platform/workers",
    operations: "ci/tooling",
    performance: "diagnostics/runtime",
    preservation: "replay/preservation",
    privacy: "platform/persistence",
    research: "program governance",
    security: "platform/validation",
    "ui-ux": "presentation/app",
  }[category] ?? "program governance";
}

function userResultFor(category, statement) {
  if (["accessibility", "gameplay", "ui-ux"].includes(category)) {
    return `The shipped experience visibly satisfies: ${statement}`;
  }
  if (category === "ml-training") {
    return `Ghost Lab exposes the resulting agent behavior and evidence for: ${statement}`;
  }
  return `The capability is observable through its governed status and evidence: ${statement}`;
}

function checkpointFor(occurrenceValue, checkpointMap) {
  const mapped = checkpointMap.get(occurrenceValue.numberedSection);
  return mapped === undefined || mapped.length === 0 ? ["C21"] : mapped;
}

function selectPrimaryCheckpoint(checkpoints, statement, occurrenceValue, category) {
  if (checkpoints.length === 1) return checkpoints[0];
  const searchable = `${occurrenceValue.headingPath.join(" > ")} ${statement} ${category}`;
  let best = checkpoints[0];
  let bestScore = -1;
  for (const checkpoint of checkpoints) {
    const pattern = CHECKPOINT_KEYWORDS[checkpoint];
    if (pattern === undefined) continue;
    const matches = searchable.match(new RegExp(pattern.source, `${pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`}`));
    const score = matches?.length ?? 0;
    if (score > bestScore) {
      best = checkpoint;
      bestScore = score;
    }
  }
  return best;
}

function requirementFrom(
  occurrenceValue,
  atomic,
  statementIndex,
  checkpointMap,
) {
  const statement = atomic.text;
  const sourceStatement = atomic.sourceStatement;
  const normative = isNormativeStatement(sourceStatement, occurrenceValue);
  const category = classify(`${statement} ${sourceStatement}`, occurrenceValue);
  const checkpoints = checkpointFor(occurrenceValue, checkpointMap);
  const primaryCheckpoint = selectPrimaryCheckpoint(
    checkpoints,
    `${statement} ${sourceStatement}`,
    occurrenceValue,
    category,
  );
  const statementHash = sha256(normalizeText(statement));
  const id = stableId(
    "TG3",
    occurrenceValue.id,
    String(statementIndex),
    statementHash,
  );
  const requirementDisposition = disposition(statement, occurrenceValue, normative);
  return translateMutableGeneratedDescriptions({
    id,
    sourceOccurrenceId: occurrenceValue.id,
    sourceVersion: "0.6",
    sourceSection: occurrenceValue.numberedSection,
    sourceStartLine: occurrenceValue.startLine,
    sourceEndLine: occurrenceValue.endLine,
    sourceHeadingPath: [...occurrenceValue.headingPath],
    sourceTextHash: occurrenceValue.textHash,
    atomicTextHash: statementHash,
    text: statement,
    sourceStatement,
    normative,
    category,
    currentState: normative ? "unverified" : "reference",
    auditStatus: normative ? "pending-repository-audit" : "not-applicable",
    disposition: requirementDisposition,
    primaryCheckpoint,
    checkpoints,
    dependencyIds: [],
    owningSubsystem: ownerFor(category),
    implementationDeliverable: normative
      ? `Implement and document the atomic component "${statement}" from source statement "${sourceStatement}"`
      : `Retain as source context: ${statement}`,
    userVisibleResult: userResultFor(category, statement),
    requiredEvidence: evidenceFor(category, normative),
    acceptanceCondition: normative
      ? `The implementation and required evidence independently establish "${statement}" within source statement "${sourceStatement}"`
      : `The annex preserves this source context without presenting it as completed behavior.`,
    artifactPath: normative ? `artifacts/tearbench/requirements/${id}.json` : null,
    evidenceRefs: [],
    duplicateGroup: stableId("DUP", normalizeText(statement).toLowerCase()),
    duplicateOf: null,
    flags: {
      optional: requirementDisposition === "optional",
      rejected: requirementDisposition === "rejected",
      superseded: requirementDisposition === "superseded",
      conflictCandidate: /\b(conflict|contradict|instead of|replace|supersed)\b/i.test(statement),
    },
  }, TERMINOLOGY_REGISTRY);
}

export function buildRequirements(parsed, checkpointMap) {
  const requirements = [];
  for (const sourceOccurrence of parsed.occurrences) {
    if (["heading", "code-block", "table-header", "table-separator"].includes(sourceOccurrence.kind)) continue;
    const statements = splitAtomicStatements(sourceOccurrence.text);
    for (let index = 0; index < statements.length; index += 1) {
      requirements.push(requirementFrom(
        sourceOccurrence,
        statements[index],
        index,
        checkpointMap,
      ));
    }
  }

  const firstByDuplicateGroup = new Map();
  for (const requirement of requirements) {
    const first = firstByDuplicateGroup.get(requirement.duplicateGroup);
    if (first === undefined) {
      firstByDuplicateGroup.set(requirement.duplicateGroup, requirement.id);
    } else {
      requirement.duplicateOf = first;
    }
  }

  const listStackByHeading = new Map();
  const byOccurrence = new Map();
  for (const requirement of requirements) {
    const current = byOccurrence.get(requirement.sourceOccurrenceId) ?? [];
    current.push(requirement);
    byOccurrence.set(requirement.sourceOccurrenceId, current);
  }
  for (const sourceOccurrence of parsed.occurrences) {
    if (sourceOccurrence.kind !== "list-item") continue;
    const occurrenceRequirements = (byOccurrence.get(sourceOccurrence.id) ?? []).filter((item) => item.normative);
    if (occurrenceRequirements.length === 0) continue;
    const key = sourceOccurrence.headingPath.join(" > ");
    const stack = listStackByHeading.get(key) ?? [];
    while (stack.length > 0 && stack.at(-1).indent >= sourceOccurrence.indent) stack.pop();
    const parent = stack.at(-1);
    if (parent !== undefined) {
      for (const requirement of occurrenceRequirements) {
        requirement.dependencyIds = [parent.requirementId];
        requirement.dependencyBasis = "nested-source-list";
      }
    } else {
      for (const requirement of occurrenceRequirements) requirement.dependencyBasis = "none-explicit-in-source";
    }
    stack.push({ indent: sourceOccurrence.indent, requirementId: occurrenceRequirements[0].id });
    listStackByHeading.set(key, stack);
  }
  for (const requirement of requirements) {
    if (requirement.dependencyBasis === undefined) requirement.dependencyBasis = "none-explicit-in-source";
  }
  return requirements;
}

function ruleMatches(requirement, rule) {
  if (!requirement.normative) return false;
  if (Array.isArray(rule.requirementIds) && !rule.requirementIds.includes(requirement.id)) return false;
  if (
    Array.isArray(rule.sourceSections)
    && !rule.sourceSections.includes(requirement.sourceSection)
  ) {
    return false;
  }
  const searchable = [
    requirement.text,
    requirement.sourceStatement,
  ].join(" ");
  if (!new RegExp(rule.textRegex, "i").test(searchable)) return false;
  if (
    typeof rule.excludeTextRegex === "string"
    && new RegExp(rule.excludeTextRegex, "i").test(searchable)
  ) {
    return false;
  }
  return true;
}

export function auditRequirements(requirements, evidenceCatalog) {
  const rules = [...evidenceCatalog.rules].sort(
    (left, right) => right.priority - left.priority || left.id.localeCompare(right.id),
  );
  const ruleMatchCounts = Object.fromEntries(rules.map((rule) => [rule.id, 0]));
  for (const requirement of requirements) {
    if (!requirement.normative) continue;
    requirement.currentState = evidenceCatalog.defaultNormativeState;
    requirement.auditStatus = "assessed-no-credible-evidence";
    requirement.auditRuleId = null;
    requirement.auditNotes = "No narrowly scoped evidence-catalog rule establishes this requirement.";
    requirement.implementationRefs = [];
    requirement.evidenceRefs = [];
    const rule = rules.find((candidate) => ruleMatches(requirement, candidate));
    if (rule === undefined) continue;
    requirement.currentState = rule.state;
    requirement.auditStatus = "evidence-catalog";
    requirement.auditRuleId = rule.id;
    requirement.auditNotes = rule.notes;
    requirement.implementationRefs = [...rule.implementationRefs];
    requirement.evidenceRefs = [...rule.evidenceRefs];
    ruleMatchCounts[rule.id] += 1;
  }
  return ruleMatchCounts;
}

function addToIndex(index, key, id) {
  if (index[key] === undefined) index[key] = [];
  index[key].push(id);
}

function sortedIndex(index) {
  return Object.fromEntries(
    Object.entries(index)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, ids]) => [key, [...new Set(ids)].sort()]),
  );
}

function reverseIndexes(requirements) {
  const indexes = {
    byCheckpoint: {},
    byCategory: {},
    byEvidenceClass: {},
    bySourceSection: {},
    byState: {},
    byDisposition: {},
  };
  for (const requirement of requirements) {
    for (const checkpoint of requirement.checkpoints) addToIndex(indexes.byCheckpoint, checkpoint, requirement.id);
    addToIndex(indexes.byCategory, requirement.category, requirement.id);
    for (const evidence of requirement.requiredEvidence) addToIndex(indexes.byEvidenceClass, evidence, requirement.id);
    addToIndex(indexes.bySourceSection, requirement.sourceSection === null ? "unsectioned" : String(requirement.sourceSection), requirement.id);
    addToIndex(indexes.byState, requirement.currentState, requirement.id);
    addToIndex(indexes.byDisposition, requirement.disposition, requirement.id);
  }
  return Object.fromEntries(
    Object.entries(indexes).map(([name, index]) => [name, sortedIndex(index)]),
  );
}

function checkpointDependencies() {
  return Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => {
      const checkpoint = index + 21;
      return [
        `C${String(checkpoint)}`,
        checkpoint === 21 ? [] : [`C${String(checkpoint - 1)}`],
      ];
    }),
  );
}

export function buildDocument(
  sourceText,
  planText,
  evidenceCatalog = {
    format: "tearbench-ghost3-evidence-catalog",
    schemaVersion: 1,
    defaultNormativeState: "missing",
    rules: [],
  },
) {
  const checkpointMap = extractCheckpointMap(planText);
  const parsed = parseSource(sourceText);
  const requirements = buildRequirements(parsed, checkpointMap);
  const ruleMatchCounts = auditRequirements(requirements, evidenceCatalog);
  const nonBlankLines = parsed.lines
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim() !== "");
  const normativeOccurrenceIds = new Set(
    requirements.filter((item) => item.normative).map((item) => item.sourceOccurrenceId),
  );
  const sourceHash = sourceSha256(sourceText).toUpperCase();
  return {
    format: "tearbench-ghost3-requirements",
    schemaVersion: 1,
    source: {
      repositoryPath: "docs/source/TEAR_AUTONOMOUS_PLAYTESTING_AND_AGENT_SKILL_PLAN.v0.6.md",
      version: "0.6",
      sha256: sourceHash,
      lineCount: parsed.lines.length,
      nonBlankLineCount: nonBlankLines.length,
      rawHeadingCounts: headingCounts(parsed.lines),
      structuralHeadingCounts: Object.fromEntries(
        [1, 2, 3, 4].map((level) => [
          `h${String(level)}`,
          parsed.headings.filter((item) => item.level === level).length,
        ]),
      ),
      numberedSectionCount: new Set(parsed.headings.map((item) => item.numberedSection).filter(Number.isInteger)).size,
    },
    policy: {
      completionVocabulary: [
        "unverified",
        "missing",
        "contract",
        "prototype",
        "integrated",
        "visible",
        "certified",
        "deferred",
        "rejected",
        "reference",
      ],
      completionClaimsRequireEvidence: true,
      unitTestsAreNotGameplayEvidence: true,
      classAOrBIsNotClassC: true,
      sourceIsNormative: true,
    },
    counts: {
      occurrences: parsed.occurrences.length,
      headings: parsed.headings.length,
      requirements: requirements.length,
      normativeRequirements: requirements.filter((item) => item.normative).length,
      referenceEntries: requirements.filter((item) => !item.normative).length,
      normativeOccurrences: normativeOccurrenceIds.size,
      duplicateRequirements: requirements.filter((item) => item.duplicateOf !== null).length,
    },
    checkpointMap: Object.fromEntries(
      [...checkpointMap.entries()]
        .sort(([left], [right]) => left - right)
        .map(([section, checkpoints]) => [String(section), checkpoints]),
    ),
    checkpointDependencies: checkpointDependencies(),
    evidenceAudit: {
      catalogFormat: evidenceCatalog.format,
      catalogSchemaVersion: evidenceCatalog.schemaVersion,
      defaultNormativeState: evidenceCatalog.defaultNormativeState,
      ruleCount: evidenceCatalog.rules.length,
      ruleMatchCounts,
    },
    headings: parsed.headings,
    occurrences: parsed.occurrences,
    requirements,
    reverseIndexes: reverseIndexes(requirements),
  };
}

function validateNoDependencyCycles(requirements, errors) {
  const byId = new Map(requirements.map((item) => [item.id, item]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      errors.push(`dependency cycle contains ${id}`);
      return;
    }
    visiting.add(id);
    const item = byId.get(id);
    for (const dependency of item?.dependencyIds ?? []) {
      if (!byId.has(dependency)) errors.push(`${id} has unresolved dependency ${dependency}`);
      else visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const item of requirements) visit(item.id);
}

export function validateDocument(document, sourceText) {
  const errors = [];
  const parsed = parseSource(sourceText);
  const expectedRawHeadings = EXPECTED_SOURCE.rawHeadingCounts;
  const expectedStructuralHeadings = EXPECTED_SOURCE.structuralHeadingCounts;
  if (document.source.sha256 !== EXPECTED_SOURCE.sha256) errors.push("source SHA-256 does not match reviewed v0.6");
  if (document.source.lineCount !== EXPECTED_SOURCE.lineCount) errors.push("source line count does not match reviewed v0.6");
  for (const [name, expected] of Object.entries(expectedRawHeadings)) {
    if (document.source.rawHeadingCounts[name] !== expected) errors.push(`raw ${name} count mismatch`);
  }
  for (const [name, expected] of Object.entries(expectedStructuralHeadings)) {
    if (document.source.structuralHeadingCounts[name] !== expected) errors.push(`structural ${name} count mismatch`);
  }
  if (document.source.numberedSectionCount !== EXPECTED_SOURCE.numberedSections) errors.push("numbered section count mismatch");
  if (Object.keys(document.checkpointMap).length !== EXPECTED_SOURCE.numberedSections) errors.push("checkpoint map does not cover all numbered sections");
  if (document.evidenceAudit.defaultNormativeState !== "missing") errors.push("evidence audit must default unproven requirements to missing");
  for (const [checkpoint, dependencies] of Object.entries(document.checkpointDependencies)) {
    if (!/^C(?:2[1-9]|3\d|40)$/.test(checkpoint)) errors.push(`invalid checkpoint dependency node ${checkpoint}`);
    for (const dependency of dependencies) {
      if (!Object.hasOwn(document.checkpointDependencies, dependency)) {
        errors.push(`${checkpoint} has unresolved checkpoint dependency ${dependency}`);
      }
    }
  }

  const occurrenceIds = new Set();
  const lineCoverage = new Map();
  for (const item of document.occurrences) {
    if (occurrenceIds.has(item.id)) errors.push(`duplicate occurrence ID ${item.id}`);
    occurrenceIds.add(item.id);
    if (sha256(item.text) !== item.textHash) errors.push(`${item.id} source text hash mismatch`);
    for (let line = item.startLine; line <= item.endLine; line += 1) {
      if (parsed.lines[line - 1]?.trim() === "") continue;
      const owners = lineCoverage.get(line) ?? [];
      owners.push(item.id);
      lineCoverage.set(line, owners);
    }
  }
  for (let line = 1; line <= parsed.lines.length; line += 1) {
    if (parsed.lines[line - 1].trim() === "") continue;
    const owners = lineCoverage.get(line) ?? [];
    if (owners.length === 0) errors.push(`unmapped nonblank source line ${String(line)}`);
    if (owners.length > 1) errors.push(`source line ${String(line)} mapped by multiple occurrences`);
  }

  const requirementIds = new Set();
  const requirementsByOccurrence = new Map();
  for (const item of document.requirements) {
    if (requirementIds.has(item.id)) errors.push(`duplicate requirement ID ${item.id}`);
    requirementIds.add(item.id);
    if (!occurrenceIds.has(item.sourceOccurrenceId)) errors.push(`${item.id} has unknown source occurrence`);
    if (item.sourceVersion !== document.source.version) errors.push(`${item.id} source version mismatch`);
    if (!/^C(?:2[1-9]|3\d|40)$/.test(item.primaryCheckpoint)) errors.push(`${item.id} has invalid primary checkpoint`);
    if (item.checkpoints.length === 0 || !item.checkpoints.includes(item.primaryCheckpoint)) errors.push(`${item.id} checkpoint assignment is incomplete`);
    if (item.normative && item.acceptanceCondition.trim() === "") errors.push(`${item.id} has no acceptance condition`);
    if (item.normative && item.implementationDeliverable.trim() === "") errors.push(`${item.id} has no implementation deliverable`);
    if (item.normative && item.requiredEvidence.length === 0) errors.push(`${item.id} has no required evidence`);
    if (item.normative && item.currentState === "unverified") errors.push(`${item.id} was not repository-audited`);
    if (["integrated", "visible", "certified"].includes(item.currentState) && item.evidenceRefs.length === 0) {
      errors.push(`${item.id} claims ${item.currentState} without evidence`);
    }
    for (const reference of [...(item.implementationRefs ?? []), ...item.evidenceRefs]) {
      if (!existsSync(resolve(REPOSITORY_ROOT, reference))) errors.push(`${item.id} references missing evidence path ${reference}`);
    }
    if (item.currentState === "certified" && item.artifactPath === null) errors.push(`${item.id} is certified without an artifact`);
    const list = requirementsByOccurrence.get(item.sourceOccurrenceId) ?? [];
    list.push(item);
    requirementsByOccurrence.set(item.sourceOccurrenceId, list);
  }
  for (const sourceOccurrence of document.occurrences) {
    if (["heading", "code-block", "table-header", "table-separator"].includes(sourceOccurrence.kind)) continue;
    if (!requirementsByOccurrence.has(sourceOccurrence.id)) errors.push(`${sourceOccurrence.id} produced no atomic entries`);
  }
  validateNoDependencyCycles(document.requirements, errors);

  for (const [indexName, index] of Object.entries(document.reverseIndexes)) {
    for (const [key, ids] of Object.entries(index)) {
      for (const id of ids) {
        if (!requirementIds.has(id)) errors.push(`${indexName}.${key} references unknown ${id}`);
      }
    }
  }
  return errors;
}

function renderMarkdown(document) {
  const requiredCount = document.requirements.filter((item) => item.disposition === "required").length;
  const optionalCount = document.requirements.filter((item) => item.disposition === "optional").length;
  const lines = [
    "# TearBench and Ghost 3.0 Non-Lossy Requirements Annex",
    "",
    "**Status:** C21.0 source reconciliation and C21 conservative repository evidence audit passed",
    `**Source:** \`${document.source.repositoryPath}\``,
    `**Source version:** ${document.source.version}`,
    `**Source SHA-256:** \`${document.source.sha256}\``,
    "",
    "This file is generated by `scripts/tearbench-requirements.mjs`. Do not edit it by hand.",
    "The JSON companion is authoritative for mechanical validation and reverse indexes.",
    "",
    "## Reconciliation Result",
    "",
    "| Measure | Count |",
    "|---|---:|",
    `| Source lines | ${String(document.source.lineCount)} |`,
    `| Nonblank source lines | ${String(document.source.nonBlankLineCount)} |`,
    `| Source occurrences | ${String(document.counts.occurrences)} |`,
    `| Headings | ${String(document.counts.headings)} |`,
    `| Atomic entries | ${String(document.counts.requirements)} |`,
    `| Normative requirements | ${String(document.counts.normativeRequirements)} |`,
    `| Required requirements | ${String(requiredCount)} |`,
    `| Optional requirements | ${String(optionalCount)} |`,
    `| Reference entries | ${String(document.counts.referenceEntries)} |`,
    `| Linked duplicate requirements | ${String(document.counts.duplicateRequirements)} |`,
    "",
    "Every nonblank source line belongs to exactly one source occurrence. Every actionable",
    "occurrence produces one or more atomic entries. Normative requirements default",
    "to `missing`; only narrowly scoped catalog rules can raise their evidence state.",
    "",
    "## Heading Inventory",
    "",
    "| Line | Level | Section | Occurrence | Heading |",
    "|---:|---:|---:|---|---|",
  ];
  for (const heading of document.headings) {
    lines.push(`| ${String(heading.startLine)} | ${String(heading.level)} | ${heading.numberedSection ?? ""} | \`${heading.id}\` | ${markdownCell(heading.title)} |`);
  }

  lines.push(
    "",
    "## Atomic Requirements and Retained Context",
    "",
    "| ID | Lines | Section | Category | Normative | State | Disposition | Checkpoint | Evidence | Atomic text |",
    "|---|---:|---:|---|---|---|---|---|---|---|",
  );
  for (const item of document.requirements) {
    lines.push(
      `| \`${item.id}\` | ${String(item.sourceStartLine)}-${String(item.sourceEndLine)} | ${item.sourceSection ?? ""} | ${item.category} | ${item.normative ? "yes" : "no"} | ${item.currentState} | ${item.disposition} | ${item.primaryCheckpoint} | ${item.requiredEvidence.join(", ")} | ${markdownCell(item.text)} |`,
    );
  }

  lines.push(
    "",
    "## Source Occurrence Ledger",
    "",
    "| Occurrence | Lines | Kind | Section | Text hash | Source text |",
    "|---|---:|---|---:|---|---|",
  );
  for (const item of document.occurrences) {
    lines.push(
      `| \`${item.id}\` | ${String(item.startLine)}-${String(item.endLine)} | ${item.kind} | ${item.numberedSection ?? ""} | \`${item.textHash}\` | ${markdownCell(item.text)} |`,
    );
  }

  lines.push(
    "",
    "## Reverse Index Summary",
    "",
    "| Index | Key | Requirement count |",
    "|---|---|---:|",
  );
  for (const [indexName, index] of Object.entries(document.reverseIndexes)) {
    for (const [key, ids] of Object.entries(index)) {
      lines.push(`| ${indexName} | ${markdownCell(key)} | ${String(ids.length)} |`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function renderDashboard(document) {
  const states = [
    "missing",
    "contract",
    "prototype",
    "integrated",
    "visible",
    "certified",
    "deferred",
    "rejected",
  ];
  const primaryCheckpointRows = [];
  for (let number = 21; number <= 40; number += 1) {
    const checkpoint = `C${String(number)}`;
    const requirements = document.requirements.filter(
      (item) => item.normative && item.primaryCheckpoint === checkpoint,
    );
    const counts = Object.fromEntries(
      states.map((state) => [state, requirements.filter((item) => item.currentState === state).length]),
    );
    primaryCheckpointRows.push({ checkpoint, total: requirements.length, counts });
  }
  const overall = Object.fromEntries(
    states.map((state) => [
      state,
      document.requirements.filter((item) => item.normative && item.currentState === state).length,
    ]),
  );
  const lines = [
    "# TearBench and Ghost 3.0 Capability Dashboard",
    "",
    "**Status:** Generated conservative baseline after C21 source reconciliation",
    "",
    "This dashboard is generated by `scripts/tearbench-requirements.mjs`.",
    "A requirement is `missing` unless a narrow evidence-catalog rule points to",
    "existing implementation and relevant evidence. Contract or unit evidence is",
    "never promoted to visible or certified gameplay evidence.",
    "",
    "## Overall Evidence State",
    "",
    "| State | Requirements |",
    "|---|---:|",
    ...states.map((state) => `| ${state} | ${String(overall[state])} |`),
    "",
    "## Primary Checkpoint Readiness",
    "",
    "| Checkpoint | Total | Missing | Contract | Prototype | Integrated | Visible | Certified |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...primaryCheckpointRows.map(({ checkpoint, total, counts }) => (
      `| ${checkpoint} | ${String(total)} | ${String(counts.missing)} | ${String(counts.contract)} | ${String(counts.prototype)} | ${String(counts.integrated)} | ${String(counts.visible)} | ${String(counts.certified)} |`
    )),
    "",
    "## Evidence Catalog Matches",
    "",
    "| Rule | Requirements matched |",
    "|---|---:|",
    ...Object.entries(document.evidenceAudit.ruleMatchCounts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([rule, count]) => `| ${rule} | ${String(count)} |`),
    "",
    "## Blocking Truth",
    "",
    `- Missing normative requirements: ${String(overall.missing)}`,
    `- Visible requirements: ${String(overall.visible)}`,
    `- Certified requirements: ${String(overall.certified)}`,
    "- C22-C40 remain incomplete until their annex requirements reach their required evidence state.",
    "",
  ];
  return lines.join("\n");
}

function canonicalJson(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function generate() {
  const sourceText = readFileSync(SOURCE_PATH, "utf8");
  const planText = readFileSync(PLAN_PATH, "utf8");
  const evidenceCatalog = JSON.parse(readFileSync(EVIDENCE_CATALOG_PATH, "utf8"));
  const document = buildDocument(sourceText, planText, evidenceCatalog);
  const errors = validateDocument(document, sourceText);
  if (errors.length > 0) throw new Error(`requirements annex validation failed:\n- ${errors.join("\n- ")}`);
  writeFileSync(JSON_PATH, canonicalJson(document), "utf8");
  writeFileSync(MARKDOWN_PATH, renderMarkdown(document), "utf8");
  writeFileSync(DASHBOARD_PATH, renderDashboard(document), "utf8");
  return document;
}

function check() {
  const sourceText = readFileSync(SOURCE_PATH, "utf8");
  const planText = readFileSync(PLAN_PATH, "utf8");
  const evidenceCatalog = JSON.parse(readFileSync(EVIDENCE_CATALOG_PATH, "utf8"));
  const document = buildDocument(sourceText, planText, evidenceCatalog);
  const errors = validateDocument(document, sourceText);
  const expectedJson = canonicalJson(document);
  const expectedMarkdown = renderMarkdown(document);
  const expectedDashboard = renderDashboard(document);
  if (readFileSync(JSON_PATH, "utf8") !== expectedJson) errors.push("JSON annex is stale; run requirements:generate");
  if (readFileSync(MARKDOWN_PATH, "utf8") !== expectedMarkdown) errors.push("Markdown annex is stale; run requirements:generate");
  if (readFileSync(DASHBOARD_PATH, "utf8") !== expectedDashboard) errors.push("capability dashboard is stale; run requirements:generate");
  if (errors.length > 0) throw new Error(`requirements annex validation failed:\n- ${errors.join("\n- ")}`);
  return document;
}

function summary(document) {
  return {
    sourceSha256: document.source.sha256,
    sourceLines: document.source.lineCount,
    occurrences: document.counts.occurrences,
    headings: document.counts.headings,
    requirements: document.counts.requirements,
    normativeRequirements: document.counts.normativeRequirements,
    unmappedSourceLines: 0,
  };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === "generate") {
    console.log(JSON.stringify(summary(generate()), null, 2));
  } else if (command === "check") {
    console.log(JSON.stringify(summary(check()), null, 2));
  } else {
    console.error("Usage: node scripts/tearbench-requirements.mjs <generate|check>");
    process.exitCode = 1;
  }
}
