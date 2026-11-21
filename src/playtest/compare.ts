/**
 * Two sets of results in, what differs out. The results are the same situations and seeds played on two builds of
 * the game by the same tool, in the same order. The game is deterministic, so any difference is the build's.
 */

import { isObject } from "../domain/records";

/** A played result: its request's fields, then `end`, then its measures. Every report's result has this shape. */
export type ComparedResult = Readonly<Record<string, unknown>>;

export interface ChangedMeasure {
  /** Where the measure is in the result: "ticks", "hitsBy.charger.damage", "waves.2.cleared". */
  readonly measure: string;
  /** Undefined where the build's result has no such measure. */
  readonly base: unknown;
  readonly now: unknown;
}

export interface ChangedSituation {
  /** The request that names the situation: the result's fields before `end`. */
  readonly situation: string;
  readonly changes: readonly ChangedMeasure[];
}

/** The field every result has first after its request. */
const FIRST_MEASURE = "end";

/** The situation a result is of, from its request's fields; the tick limit is left out as it says nothing. */
export function situationOf(result: ComparedResult): string {
  const keys = Object.keys(result);
  const end = keys.indexOf(FIRST_MEASURE);
  if (end < 0) throw new TypeError(`a played result has an "${FIRST_MEASURE}" field after its request`);
  return keys
    .slice(0, end)
    .filter((key) => key !== "maxTicks")
    .map((key) => `${key} ${String(result[key])}`)
    .join("  ");
}

/** Every value in a result that is not a list or a record, by its path. */
function leaves(value: unknown, path: string, into: Map<string, unknown>): void {
  if (isObject(value)) {
    for (const [key, inner] of Object.entries(value)) leaves(inner, path === "" ? key : `${path}.${key}`, into);
    return;
  }
  into.set(path, value);
}

function measures(result: ComparedResult): Map<string, unknown> {
  const all = new Map<string, unknown>();
  leaves(result, "", all);
  return all;
}

/**
 * The situations whose measures differ between the two builds, in the order played. Refuses two sets that are not
 * the same situations in the same order: then the builds were not asked the same thing and nothing can be said.
 */
export function compareResults(
  base: readonly ComparedResult[],
  now: readonly ComparedResult[],
): readonly ChangedSituation[] {
  if (base.length !== now.length)
    throw new RangeError(`the two builds played ${String(base.length)} and ${String(now.length)} situations`);
  return now.flatMap((result, index) => {
    const other = base[index];
    const situation = situationOf(result);
    if (other === undefined || situationOf(other) !== situation)
      throw new RangeError(`the two builds played different situations at place ${String(index + 1)}: ${situation}`);
    const before = measures(other);
    const after = measures(result);
    const changes = [...new Set([...before.keys(), ...after.keys()])]
      .filter((measure) => !Object.is(before.get(measure), after.get(measure)))
      .map((measure) => ({ measure, base: before.get(measure), now: after.get(measure) }));
    return changes.length === 0 ? [] : [{ situation, changes }];
  });
}

/** A situation shows this many changed measures; the rest are counted. */
const SHOWN_MEASURES = 12;

/** A measure as printed: "-" where the build has none, numbers to two places. */
function shown(value: unknown): string {
  if (value === undefined) return "-";
  if (typeof value === "number") return String(Math.round(value * 100) / 100);
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** What changed, a block per situation; one line when nothing did. */
export function formatComparison(changed: readonly ChangedSituation[], played: number, base: string): string {
  if (changed.length === 0)
    return `Compared with ${base}: nothing changed in ${String(played)} ${played === 1 ? "situation" : "situations"}.\n`;
  const blocks = changed.map(({ situation, changes }) => {
    const lines = changes
      .slice(0, SHOWN_MEASURES)
      .map((change) => `  ${change.measure}: ${shown(change.base)} -> ${shown(change.now)}`);
    const more = changes.length - lines.length;
    return `${situation}\n${lines.join("\n")}${more > 0 ? `\n  and ${String(more)} more measures` : ""}`;
  });
  return (
    `Compared with ${base}: ${String(changed.length)} of ${String(played)} situations changed ` +
    `(each line is a measure: ${base} -> now).\n\n${blocks.join("\n\n")}\n`
  );
}
