import { AFFIXES } from "../gameplay/affixes";
import { PUBLISHED_ENEMY_IDENTITY_IDS } from "../gameplay/run/content-director";
import { stageIdsAvailableOn } from "../gameplay/stages";
import { CANONICAL_UPGRADE_IDS } from "../gameplay/upgrades";
import { bossPhaseCount, type BossFightResult } from "./boss-fight";
import { REPORT_BOSSES } from "./boss-report";
import type { EnemyResult } from "./enemy-play";
import type { RunResult } from "./run-play";
import type { WaveResult } from "./wave-play";

/** What a coverage list counts. The first five are checked against the game's own lists. */
export const COVERAGE_KINDS = Object.freeze([
  "enemy",
  "enemy affix",
  "boss",
  "boss phase",
  "upgrade",
  "stage object",
] as const);
export type CoverageKind = (typeof COVERAGE_KINDS)[number];

/** Names by kind: what the game defines, or what a set of results brought into play. */
export type CoverageNames = Readonly<Record<CoverageKind, readonly string[]>>;

const phaseName = (boss: string, phase: number): string => `${boss} phase ${String(phase)}`;

/**
 * What the game defines, read from its own lists. It keeps no list of stage objects, so that kind is empty here
 * and the coverage list can only say which stage objects appeared.
 */
export function coverageCatalogue(): CoverageNames {
  return {
    enemy: PUBLISHED_ENEMY_IDENTITY_IDS,
    "enemy affix": AFFIXES.map(({ id }) => id),
    boss: REPORT_BOSSES,
    "boss phase": REPORT_BOSSES.flatMap((boss) =>
      Array.from({ length: bossPhaseCount(boss) }, (_, index) => phaseName(boss, index + 1)),
    ),
    // An upgrade appears when a draft offers it, whether or not the player takes it.
    upgrade: CANONICAL_UPGRADE_IDS,
    "stage object": [],
  };
}

type Note = (kind: CoverageKind, names: Iterable<string>) => void;

/**
 * What each report's results brought into play, by the report's name in the command table. A new report adds
 * its entry here.
 */
const APPEARED = {
  bosses(fights: readonly BossFightResult[], note: Note): void {
    for (const fight of fights) {
      const played = fight.phases.filter((phase) => phase.ticks > 0);
      if (played.length > 0) note("boss", [fight.boss]);
      note(
        "boss phase",
        played.map((phase) => phaseName(fight.boss, phase.phase)),
      );
      note(
        "stage object",
        played.flatMap((phase) => Object.keys(phase.objects)),
      );
    }
  },
  waves(waves: readonly WaveResult[], note: Note): void {
    for (const wave of waves) {
      note(
        "enemy",
        wave.spawned.map((enemy) => enemy.kind),
      );
      note(
        "enemy affix",
        wave.spawned.flatMap((enemy) => enemy.affixes),
      );
      note("upgrade", wave.offered);
      if (wave.roots.snaresMarked > 0) note("stage object", ["root snare"]);
      if (wave.roots.rootsGrown > 0) note("stage object", ["root link"]);
    }
  },
  runs(runs: readonly RunResult[], note: Note): void {
    for (const run of runs) {
      note("enemy", run.appeared.enemies);
      note("enemy affix", run.appeared.affixes);
      note("upgrade", run.appeared.offered);
      note("boss phase", run.appeared.bossPhases);
      note(
        "boss",
        run.appeared.bossPhases.map((phase) => phase.split(" phase ")[0] ?? phase),
      );
    }
  },
  enemies(meetings: readonly EnemyResult[], note: Note): void {
    for (const meeting of meetings) note("enemy", Object.keys(meeting.inPlay));
  },
};

export type CoverageReport = keyof typeof APPEARED;
export const COVERAGE_REPORTS = Object.freeze(Object.keys(APPEARED)) as readonly CoverageReport[];

/**
 * The sets each report is played on for a coverage list, as options over its own defaults. The bosses report is
 * played twice: its default starts every fight at Phase I, which the scripted players seldom get past, so the
 * second set starts at the later phases through the game's boss practice. The waves report has no default
 * stage, so it gets every Adventure stage, on one seed and one player to keep the set small.
 */
export const COVERAGE_SETS: Readonly<Record<CoverageReport, readonly Readonly<Record<string, string>>[]>> =
  Object.freeze({
    bosses: [{}, { phase: "2,3", player: "scripted" }],
    waves: [{ stage: stageIdsAvailableOn("adventure").join(","), seed: "1", player: "scripted" }],
    runs: [{}],
    enemies: [{}],
  });

/** Everything the given reports' results brought into play, sorted by name. */
export function appearedIn(results: Readonly<Partial<Record<CoverageReport, readonly unknown[]>>>): CoverageNames {
  const sets = new Map<CoverageKind, Set<string>>(COVERAGE_KINDS.map((kind) => [kind, new Set<string>()]));
  const note: Note = (kind, names) => {
    for (const name of names) sets.get(kind)?.add(name);
  };
  for (const report of COVERAGE_REPORTS)
    (APPEARED[report] as (results: readonly unknown[], note: Note) => void)(results[report] ?? [], note);
  return Object.fromEntries(COVERAGE_KINDS.map((kind) => [kind, [...(sets.get(kind) ?? [])].sort()])) as CoverageNames;
}

export interface CoverageRow {
  readonly kind: CoverageKind;
  /** How many the game defines; undefined where it keeps no list. */
  readonly defined?: number;
  readonly appeared: readonly string[];
  /** Defined and never brought into play. */
  readonly never: readonly string[];
  /** Brought into play and not in the game's list: a name the list and the running game disagree on. */
  readonly unlisted: readonly string[];
}

/** For each kind: what appeared, what the game defines that never did, and what appeared that it does not list. */
export function coverageRows(
  appeared: CoverageNames,
  catalogue: CoverageNames = coverageCatalogue(),
): readonly CoverageRow[] {
  return COVERAGE_KINDS.map((kind) => {
    const defined = catalogue[kind];
    const listed = defined.length > 0;
    return {
      kind,
      ...(listed ? { defined: defined.length } : {}),
      appeared: appeared[kind],
      never: defined.filter((name) => !appeared[kind].includes(name)),
      unlisted: listed ? appeared[kind].filter((name) => !defined.includes(name)) : [],
    };
  });
}

const NOTES =
  "What the reports brought into play, against the game's own lists. An enemy appears when it arrives in a " +
  "wave, a run or a meeting; an affix when an enemy arrives with it; a boss phase when a fight or a run plays " +
  "it; an upgrade when a draft offers it. The game keeps no list of stage objects, so that line says what " +
  'appeared and cannot say what is missing. "Never appeared" means never in these runs, with these players ' +
  "and seeds: it is a gap in what was played until someone shows the game cannot produce it.\n";

export function formatCoverage(rows: readonly CoverageRow[]): string {
  const lines = rows.map((row) => {
    const head =
      row.defined === undefined
        ? `${row.kind}: ${String(row.appeared.length)} appeared (${row.appeared.join(", ") || "none"})`
        : `${row.kind}: ${String(row.defined - row.never.length)} of ${String(row.defined)} appeared`;
    return (
      head +
      (row.never.length === 0 ? "" : `\n  never appeared: ${row.never.join(", ")}`) +
      (row.unlisted.length === 0 ? "" : `\n  appeared but not in the game's list: ${row.unlisted.join(", ")}`)
    );
  });
  const never = rows.reduce((total, row) => total + row.never.length, 0);
  return `${NOTES}\n${lines.join("\n")}\n\n${never === 0 ? "Nothing the game lists is missing." : `${String(never)} listed ${never === 1 ? "thing" : "things"} never appeared.`}\n`;
}
