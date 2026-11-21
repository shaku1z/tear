/**
 * Tell weight (plans/active/VERDANT_PALE_REBUILD.md, 5.2): no boss draws more marks than the most of the
 * reference bosses.
 *
 * Each boss fights every phase as in move-visual-lifetime.test.ts. Its weight is the number of distinct
 * pairs (the live move, the mark helper that drew) seen over the fight. The cap is not written down: it is
 * the largest weight among REFERENCE_BOSSES, so a reference boss that grows raises it, and that shows in
 * the printed table for review.
 *
 * Named gaps, each with the slice that closes it (plans/active/VERDANT_PALE_REBUILD.md):
 * - The Echo is not measured. The mirror presentation draws it, not the enemy renderers, and it draws no
 *   shared mark, so this harness would read 0, which is not its weight. Slice 2 measures it through the
 *   mirror presentation, when the new Rootbound is first held to the cap; the cap is final from then.
 * - The Rootbinder, an enemy, is drawn by the environment layer (`ENVIRONMENT_DRAWN_ENEMY_KINDS`) and is
 *   not measured either. Slice 5 rebuilds it to draw its marks through the shared helpers, and measures it.
 */
import { describe, expect, it } from "vitest";

import { BOSS_DEFINITIONS } from "../../src/gameplay/run/boss-definitions";
import { createBossSubject, runFight } from "./move-visual-harness";

/** The fights the rebuild is measured against. */
const REFERENCE_BOSSES = ["warden", "colossus", "aldric", "source"] as const;
/** Bosses not yet held to the cap, until they are rebuilt. This list may only shrink. */
const EXEMPT: readonly string[] = ["rootbound", "white-hart"];

type HarnessBossId = Parameters<typeof createBossSubject>[0];

/**
 * A move runs from the tick the boss leaves rest until it rests again, and is named by its first state, so
 * a windup, its strike and its recovery are one move. A boss that names parallel moves itself
 * (`liveMove()` returns "family:state", as the Source does) has one move per family.
 */
function weight(id: HarnessBossId): readonly string[] {
  const subject = createBossSubject(id);
  const pairs = new Set<string>();
  let move: string | null = null;
  for (const record of runFight(subject, subject.phaseMarks).records) {
    const live = record.liveMove;
    const family = live?.includes(":") ? live.slice(0, live.indexOf(":")) : null;
    move = live === null ? null : (family ?? move ?? live);
    for (const helper of record.marks) pairs.add(`${move ?? "rest"} / ${helper}`);
  }
  return [...pairs].sort();
}

describe("boss tell weight", { timeout: 120_000 }, () => {
  const ids = BOSS_DEFINITIONS.map(({ id }) => id).filter((id): id is HarnessBossId => id !== "echo");
  const weights = new Map(ids.map((id) => [id, weight(id)] as const));
  const cap = Math.max(...REFERENCE_BOSSES.map((id) => weights.get(id)?.length ?? 0));

  it("prints the table and keeps the exemption list to the bosses named when it was made", () => {
    const table = ids.map((id) => `${id.padEnd(12)} ${String(weights.get(id)?.length ?? 0).padStart(3)}`);
    console.info(`boss tell weight (cap ${String(cap)}):\n${table.join("\n")}`);
    expect(["rootbound", "white-hart"]).toEqual(expect.arrayContaining([...EXEMPT]));
    expect(cap).toBeGreaterThan(0);
  });

  it.each(ids.filter((id) => !EXEMPT.includes(id)))("%s draws no more marks than the cap", (id) => {
    const pairs = weights.get(id) ?? [];
    expect(pairs.length, pairs.join("\n")).toBeLessThanOrEqual(cap);
  });
});
