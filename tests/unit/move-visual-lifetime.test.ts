/**
 * Nothing outlives its move (plans/active/VERDANT_PALE_REBUILD.md, 5.1), over every boss and enemy kind.
 *
 * Each entity is built through the production enemy types, stepped at 120 Hz through the production step
 * and drawn each tick through the production renderers (tests/unit/move-visual-harness.ts). The shared
 * mark helpers report every mark they draw. The rules:
 * - a mark is drawn only while a move is live (`liveMove()`), and never while the entity is stunned;
 * - a stun does not end the move: on the first tick after it, the move is where the stun caught it;
 * - from the tick death starts, no mark is drawn and no zone remains;
 * - a boss zone ends on the phase-change tick, and one with a declared length (`maxLife`) lives no
 *   longer than that length. A zone may outlive the move that made it; a mark may not.
 * - a renderer draws its marks only through the shared helpers: what it draws by hand that looks like a
 *   mark (a dashed line, or anything reaching further past its body than a body reaches) is a fault,
 *   except today's, listed in HAND_DRAWN_MARKS, which may only shrink.
 *
 * Not here: the Echo, which the mirror presentation draws, and the enemies the environment layer draws
 * (`ENVIRONMENT_DRAWN_ENEMY_KINDS`, today the Rootbinder). Neither goes through the enemy renderers.
 */
import { describe, expect, it } from "vitest";

import { ENVIRONMENT_DRAWN_ENEMY_KINDS } from "../../src/app/world/environment-layer";
import type { ArenaZone } from "../../src/gameplay/entities/enemy-contracts";
import { BOSS_DEFINITIONS } from "../../src/gameplay/run/boss-definitions";
import { REST_MOVE_STATES } from "../../src/gameplay/entities/move-lifetime";
import {
  DT,
  createBossSubject,
  createEnemySubject,
  enemyCases,
  runFight,
  type Fight,
  type Subject,
  type TickRecord,
} from "./move-visual-harness";

/**
 * Entities not yet held to the rules, until they are rebuilt. This list may only shrink: the Rootbound
 * leaves it in the Verdant switch, the White Hart and the Rimehound with Pale's rebuild.
 */
const EXEMPT: readonly string[] = ["rootbound", "white-hart", "rimehound"];

/**
 * What separates a body from a mark, in pixels past the entity's own box, measured over every fight below.
 * Bodies reach at most 83 (Aldric's cleaver in a lunge); weapons and props stay inside that. The nearest
 * mark reaches 143 (the Geomancer's wall telegraph). A primitive drawn outside the helpers that reaches
 * further than MARK_REACH, or is dashed, looks like a mark.
 */
const MEASURED_BODY_REACH = 83;
const MEASURED_NEAREST_MARK_REACH = 143;
const MARK_REACH = 120;

/**
 * Marks drawn by hand today instead of through the helpers. Each entry is a fault this list keeps visible:
 * it may only shrink, and an entry whose entity stops drawing it must be removed.
 */
const HAND_DRAWN_MARKS: Readonly<Record<string, Readonly<{ file: string; draws: string }>>> = {
  warden: {
    file: "warden-colossus-renderers.ts",
    draws: "the dashed dive line and target ring of its ceiling lunge, and its custody-hook rope (a prop)",
  },
  colossus: {
    file: "warden-colossus-renderers.ts",
    draws: "the dashed slam line in its windup, and the steam vent column",
  },
  source: {
    file: "source-renderer.ts",
    draws: "the dash lane, the dashed depth spear and siphon lines, the beam sweep",
  },
  charger: { file: "base-renderers.ts", draws: "the dashed charge arrow in its windup (the bull's)" },
  "charger:bull": { file: "base-renderers.ts", draws: "the dashed charge arrow in its windup" },
  "charger:executioner": { file: "base-renderers.ts", draws: "the floor line of its windup" },
  "charger:gravedigger": { file: "base-renderers.ts", draws: "the arc of its windup and swing" },
  "charger:rime-runner": { file: "base-renderers.ts", draws: "the dashed charge arrow in its windup" },
  ranged: { file: "base-renderers.ts", draws: "the dashed aim line to the player" },
  "ranged:sentinel": { file: "base-renderers.ts", draws: "the aim line to the player" },
  "ranged:rifleman": { file: "base-renderers.ts", draws: "the dashed aim line to the player" },
  "ranged:marksman": { file: "base-renderers.ts", draws: "the dashed aim line to the player" },
  "ranged:warlock": { file: "base-renderers.ts", draws: "the dashed aim line to the player" },
  "ranged:chain": { file: "base-renderers.ts", draws: "the dashed aim line to the player" },
  "ranged:seedcaster": { file: "base-renderers.ts", draws: "the dashed aim line to the player" },
  "ranged:prism-seer": { file: "base-renderers.ts", draws: "the dashed aim line to the player" },
  "flyer:divebomber": { file: "standard-renderers.ts", draws: "the ground ring and dashed drop line of its dive" },
  "flyer:canopy-diver": { file: "standard-renderers.ts", draws: "the ground ring and dashed drop line of its dive" },
  "flyer:snowfall-kite": { file: "standard-renderers.ts", draws: "the ground ring and dashed drop line of its dive" },
  "bomber:geomancer": { file: "standard-renderers.ts", draws: "the wall rising at its target" },
  armored: { file: "standard-renderers.ts", draws: "the floor warning of its stomp" },
  "armored:bark-sentinel": { file: "standard-renderers.ts", draws: "the floor warning of its stomp" },
  "armored:glacier-guard": { file: "standard-renderers.ts", draws: "the floor warning of its stomp" },
  priest: { file: "standard-renderers.ts", draws: "its aura ring (an aura's reach, drawn the way a mark is)" },
  herald: { file: "standard-renderers.ts", draws: "its aura ring (an aura's reach, drawn the way a mark is)" },
};

interface Offences {
  markAtRest: number;
  markWhileStunned: number;
  notResumed: number;
  afterDeathStart: number;
  zoneOverPhaseChange: number;
  zonePastItsLength: number;
  handDrawnMarks: number;
}

function offences(fight: Fight): Offences {
  const result: Offences = {
    markAtRest: 0,
    markWhileStunned: 0,
    notResumed: 0,
    afterDeathStart: 0,
    zoneOverPhaseChange: 0,
    zonePastItsLength: 0,
    handDrawnMarks: 0,
  };
  /** A zone's length runs on its boss's clock: a stunned boss's update does not run, and its zones wait. */
  const age = new Map<ArenaZone, number>();
  let previous: TickRecord | undefined;
  for (const record of fight.records) {
    if (record.marks.length > 0 && record.liveMove === null) result.markAtRest += 1;
    if (record.marks.length > 0 && record.stunned) result.markWhileStunned += 1;
    if (record.dying && (record.marks.length > 0 || record.zones.length > 0)) result.afterDeathStart += 1;
    if (previous !== undefined && record.phase !== previous.phase)
      result.zoneOverPhaseChange += record.zones.filter((zone) => previous?.zones.includes(zone)).length;
    for (const zone of record.zones) {
      const ticks = (age.get(zone) ?? 0) + (record.stunned ? 0 : 1);
      age.set(zone, ticks);
      if ((zone.maxLife ?? 0) > 0 && ticks > Math.ceil((zone.maxLife ?? 0) / DT) + 2) result.zonePastItsLength += 1;
    }
    if (record.far.some((primitive) => primitive.dashed || primitive.reach > MARK_REACH)) result.handDrawnMarks += 1;
    previous = record;
  }
  result.notResumed = fight.stuns.filter(
    (stun) => !stun.ended && stun.resumed !== null && stun.resumed !== stun.caught,
  ).length;
  return result;
}

const BOSS_IDS = BOSS_DEFINITIONS.map(({ id }) => id).filter((id) => id !== "echo");
type HarnessBossId = Parameters<typeof createBossSubject>[0];

function bossFight(id: HarnessBossId, plant?: (subject: Subject) => void): Fight {
  const subject = createBossSubject(id);
  plant?.(subject);
  return runFight(subject, subject.phaseMarks);
}

/** A fault planted for the proof: on the first tick at rest, the renderer draws the last marking state again. */
function keepMarkOneTickLate(subject: Subject): void {
  const paint = subject.paint;
  const entity = subject.entity as Subject["entity"] & { state: string };
  let marking: string | null = null;
  let wasLive = false;
  subject.paint = () => {
    const live = entity.liveMove() !== null;
    if (!live && wasLive && marking !== null) {
      const state = entity.state;
      entity.state = marking;
      paint();
      entity.state = state;
    } else paint();
    wasLive = live;
  };
  const draw = subject.draw.bind(subject);
  subject.draw = () => {
    const record = draw();
    if (record.marks.length > 0 && record.liveMove !== null) marking = record.state;
    return record;
  };
}

/** Every rule held. Hand-drawn marks are checked against HAND_DRAWN_MARKS instead. */
const NO_RULE_BROKEN: Omit<Offences, "handDrawnMarks"> = {
  markAtRest: 0,
  markWhileStunned: 0,
  notResumed: 0,
  afterDeathStart: 0,
  zoneOverPhaseChange: 0,
  zonePastItsLength: 0,
};

describe("nothing outlives its move", { timeout: 120_000 }, () => {
  it("names the thresholds once, between the measured body and mark sizes", () => {
    expect(MARK_REACH).toBeGreaterThan(MEASURED_BODY_REACH);
    expect(MARK_REACH).toBeLessThan(MEASURED_NEAREST_MARK_REACH);
    expect(REST_MOVE_STATES.has("idle")).toBe(true);
  });

  it("keeps the exemption list to the entities named when it was made", () => {
    expect(["rootbound", "white-hart", "rimehound"]).toEqual(expect.arrayContaining([...EXEMPT]));
  });

  it("fails on a planted fault: a mark kept one tick past its move", () => {
    const planted = offences(bossFight("aldric", keepMarkOneTickLate));
    expect(planted.markAtRest).toBeGreaterThan(0);
  });

  const report: Record<string, Offences> = {};
  describe.each(BOSS_IDS.filter((id) => !EXEMPT.includes(id)))("%s", (id) => {
    it("draws no mark outside its live move, resumes after a stun, and leaves nothing past death or a phase", () => {
      const fight = bossFight(id);
      const found = offences(fight);
      report[id] = found;
      expect(fight.stuns.length, "the fight stunned it mid-move").toBeGreaterThan(0);
      const { handDrawnMarks, ...rules } = found;
      expect(rules, JSON.stringify(rules)).toEqual(NO_RULE_BROKEN);
      expect(handDrawnMarks > 0, `${id} draws marks by hand`).toBe(id in HAND_DRAWN_MARKS);
    });
  });

  describe.each(
    enemyCases().filter(({ kind }) => !EXEMPT.includes(kind) && !ENVIRONMENT_DRAWN_ENEMY_KINDS.includes(kind)),
  )("$kind $variant", ({ kind, variant }) => {
    it("draws no mark outside its live move and resumes after a stun", () => {
      const subject = createEnemySubject(kind, variant);
      const found = offences(runFight(subject, null));
      report[subject.id] = found;
      const { handDrawnMarks, ...rules } = found;
      expect(rules).toEqual(NO_RULE_BROKEN);
      expect(handDrawnMarks > 0, `${subject.id} draws marks by hand`).toBe(subject.id in HAND_DRAWN_MARKS);
    });
  });
});
