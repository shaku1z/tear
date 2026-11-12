import fs from "node:fs";

export const BASELINE_FORMAT = "tear-architecture-baseline.v1";

export function readJson(file, description) {
  if (!fs.existsSync(file)) throw new Error(`${file} is missing (${description})`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function parseBaseline(document) {
  if (document?.format !== BASELINE_FORMAT || !Array.isArray(document.layerViolations) || !Array.isArray(document.cycles)) {
    throw new Error(`the architecture baseline must be a ${BASELINE_FORMAT} document`);
  }
  for (const entry of document.layerViolations) {
    if (typeof entry.from !== "string" || typeof entry.to !== "string" || !["value", "type"].includes(entry.kind)) {
      throw new Error(`invalid architecture baseline edge ${JSON.stringify(entry)}`);
    }
  }
  return { layerViolations: document.layerViolations, cycles: document.cycles };
}

export function serializeBaseline({ layerViolations, cycles }) {
  const document = {
    format: BASELINE_FORMAT,
    note: "Recorded by `node scripts/check-source-architecture.mjs --update`. Both lists may only shrink; see docs/ARCHITECTURE.md.",
    layerViolations: layerViolations.map(({ from, to, kind }) => ({ from, to, kind })),
    cycles,
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** Maps a path through `--move` entries; an entry ending in `/` moves a directory prefix. */
export function movePath(file, moves) {
  if (moves.has(file)) return moves.get(file);
  for (const [from, to] of moves) if (from.endsWith("/") && file.startsWith(from)) return `${to}${file.slice(from.length)}`;
  return file;
}

export function applyMoves(baseline, moves) {
  if (moves.size === 0) return baseline;
  return {
    layerViolations: baseline.layerViolations.map((entry) => ({ ...entry, from: movePath(entry.from, moves), to: movePath(entry.to, moves) })),
    cycles: baseline.cycles.map((cycle) => cycle.map((file) => movePath(file, moves)).sort((left, right) => left.localeCompare(right, "en"))),
  };
}

const KIND_RANK = Object.freeze({ type: 0, value: 1 });

/**
 * Rebuilds the baseline from today's graph. A new violating edge, a stronger
 * kind, or a new or grown cycle is refused unless one of its files is named
 * with --allow-increase.
 */
export function updateArchitectureBaseline(violations, cycles, previous, allowIncrease = new Set()) {
  const recorded = new Map(previous.layerViolations.map((entry) => [`${entry.from} -> ${entry.to}`, entry]));
  const refused = [], increased = [];
  for (const edge of violations) {
    const entry = recorded.get(`${edge.from} -> ${edge.to}`);
    if (entry !== undefined && KIND_RANK[entry.kind] >= KIND_RANK[edge.kind]) continue;
    (allowIncrease.has(edge.from) ? increased : refused).push({ kind: "edge", detail: `${edge.from} -> ${edge.to} (${edge.kind})` });
  }
  const recordedCycles = previous.cycles.map((cycle) => new Set(cycle));
  for (const cycle of cycles) {
    if (recordedCycles.some((set) => cycle.every((file) => set.has(file)))) continue;
    const entry = { kind: "cycle", detail: `${String(cycle.length)} files: ${cycle.join(", ")}` };
    (cycle.some((file) => allowIncrease.has(file)) ? increased : refused).push(entry);
  }
  return { baseline: { layerViolations: violations, cycles }, refused, increased };
}
