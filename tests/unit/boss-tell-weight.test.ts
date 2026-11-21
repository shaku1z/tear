/**
 * Tell weight (plans/active/VERDANT_PALE_REBUILD.md, 5.2): no boss draws more marks than the most of the
 * reference bosses.
 *
 * Each boss fights every phase as in move-visual-lifetime.test.ts. Its weight is the number of distinct
 * pairs (the live move state, the mark helper that drew) seen over the fight. A move state is what
 * `liveMove()` returns: a windup and its strike are two states, and a boss that runs parallel moves names
 * each family's state ("dash:wind"). Each state is its own pair, so moves chained without a rest between
 * them are each counted. A mark ends with the state it began in (move-visual-lifetime.test.ts), so a
 * pair is a mark the player reads.
 *
 * The cap is pinned in config/move-rules-baseline.json, a gate file, as the largest weight among the
 * references. A reference that grows or shrinks fails here until the cap is changed there, with the lead's
 * review.
 *
 * Named gaps, each with the slice that closes it:
 * - The Echo is not measured. The mirror presentation draws it, not the enemy renderers, and it draws no
 *   shared mark, so this harness would read 0, which is not its weight. Slice 2 measures it through the
 *   mirror presentation, when the new Rootbound is first held to the cap; the cap is final from then.
 * - The Rootbinder, an enemy, is drawn by the environment layer (`ENVIRONMENT_DRAWN_ENEMY_KINDS`) and is
 *   not measured either. Slice 5 rebuilds it to draw its marks through the shared helpers, and measures it.
 */
import { describe, expect, it } from "vitest";

import BASELINE from "../../config/move-rules-baseline.json";
import { BOSS_DEFINITIONS } from "../../src/gameplay/run/boss-definitions";
import { createBossSubject, runFight } from "./move-visual-harness";

const { cap: CAP, references: REFERENCE_BOSSES } = BASELINE.tellWeight;
/** Bosses not yet held to the cap, until they are rebuilt. */
const EXEMPT: readonly string[] = Object.keys(BASELINE.tellWeight.exempt);

type HarnessBossId = Parameters<typeof createBossSubject>[0];

function weight(id: HarnessBossId): readonly string[] {
  const subject = createBossSubject(id);
  const pairs = new Set<string>();
  for (const record of runFight(subject, subject.phaseMarks).records)
    for (const helper of record.marks) pairs.add(`${record.liveMove ?? "rest"} / ${helper}`);
  return [...pairs].sort();
}

describe("boss tell weight", { timeout: 120_000 }, () => {
  const ids = BOSS_DEFINITIONS.map(({ id }) => id).filter((id): id is HarnessBossId => id !== "echo");
  const weights = new Map(ids.map((id) => [id, weight(id)] as const));
  const table = ids.map((id) => `${id.padEnd(12)} ${String(weights.get(id)?.length ?? 0).padStart(3)}`).join("\n");

  it("pins the cap at the largest reference weight", () => {
    const largest = Math.max(...REFERENCE_BOSSES.map((id) => weights.get(id as HarnessBossId)?.length ?? 0));
    expect(largest, `boss tell weight (cap ${String(CAP)}):\n${table}`).toBe(CAP);
  });

  it("exempts only bosses that the move rules exempt too, until they are rebuilt", () => {
    for (const id of EXEMPT) expect(id in BASELINE.lifetimeExempt, id).toBe(true);
    for (const id of REFERENCE_BOSSES) expect(EXEMPT.includes(id), id).toBe(false);
  });

  it.each(ids.filter((id) => !EXEMPT.includes(id)))("%s draws no more marks than the cap", (id) => {
    const pairs = weights.get(id) ?? [];
    expect(pairs.length, pairs.join("\n")).toBeLessThanOrEqual(CAP);
  });
});
