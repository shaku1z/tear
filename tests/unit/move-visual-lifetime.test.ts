/**
 * Nothing outlives its move (plans/active/VERDANT_PALE_REBUILD.md, 5.1), over every boss and enemy kind.
 *
 * Each entity is built through the production enemy types, stepped at 120 Hz through the production step
 * and drawn each tick through the production renderers (tests/unit/move-visual-harness.ts). The shared
 * mark helpers report every mark they draw. The rules:
 * - a mark is drawn only while a move is live (`liveMove()`), and never while the entity is stunned;
 * - a mark ends with the move state it began in: one drawn for a windup is gone when the strike starts,
 *   and none carries into the recovery or the next move;
 * - a stun does not end the move: on the first tick after it, the move is where the stun caught it;
 * - the live move ends on the tick the boss's phase changes (the fight crosses every mark mid-move);
 * - from the tick death starts, no mark is drawn and no zone remains;
 * - a boss zone ends on the phase-change tick, and one with a declared length (`maxLife`) lives no
 *   longer than that length. A zone may outlive the move that made it; a mark may not.
 * - a renderer draws its marks only through the shared helpers: what it draws by hand that looks like a
 *   mark (a dashed line, or anything reaching further past its body than a body reaches) is a fault,
 *   except today's, listed in config/move-rules-baseline.json, which may only shrink.
 *
 * The lists and thresholds live in config/move-rules-baseline.json, a gate file: an entry is added only
 * with the lead's review, and this test fails on an entry that no longer applies.
 *
 * Named gaps (each closed by the slice named in the plan, 5.1):
 * - Hand-drawn marks do not hide during a stun: only the shared helpers do. The entities on the
 *   hand-drawn list keep their own windup lines through a stun until they draw through the helpers.
 * - Projectiles: the harness empties them every tick, so a boss projectile or debris that outlives a
 *   death start or a phase change is not seen here.
 * - The Echo, which the mirror presentation draws, and the enemies the environment layer draws
 *   (`ENVIRONMENT_DRAWN_ENEMY_KINDS`, today the Rootbinder): neither goes through the enemy renderers.
 * - Stage features owned outside the boss (the Warden's fracture warnings, the Source's void hazards).
 * - The helper-only check sees strokes and fills only: not `drawImage`, `Path2D` shapes, marks within
 *   MARK_REACH of the body, or the boss tell skins (`drawBossTells`).
 */
import { describe, expect, it } from "vitest";

import BASELINE from "../../config/move-rules-baseline.json";
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

/** Entities not yet held to the rules, until they are rebuilt. */
const EXEMPT: readonly string[] = Object.keys(BASELINE.lifetimeExempt);
/** Marks drawn by hand today instead of through the helpers, each with its file and what it draws. */
const HAND_DRAWN_MARKS: Readonly<Record<string, Readonly<{ file: string; draws: string }>>> = BASELINE.handDrawnMarks;
const { measuredBodyReach: MEASURED_BODY_REACH, markReach: MARK_REACH } = BASELINE.reach;
const MEASURED_NEAREST_MARK_REACH = BASELINE.reach.measuredNearestMarkReach;

interface Offences {
  markAtRest: number;
  markWhileStunned: number;
  markPastItsState: number;
  notResumed: number;
  moveOverPhaseChange: number;
  afterDeathStart: number;
  zoneOverPhaseChange: number;
  zonePastItsLength: number;
  handDrawnMarks: number;
}

/**
 * Whether the step set the field the live move is read from: `state`, or for a boss that names parallel
 * moves ("dash:wind"), that family's field (`dashState`).
 */
function moveStateSet(record: TickRecord): boolean {
  const live = record.liveMove ?? "";
  const field = live.includes(":") ? `${live.slice(0, live.indexOf(":"))}State` : "state";
  return (record.stateWrites[field] ?? 0) > 0;
}

function offences(fight: Fight): Offences {
  const result: Offences = {
    markAtRest: 0,
    markWhileStunned: 0,
    markPastItsState: 0,
    notResumed: 0,
    moveOverPhaseChange: 0,
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
    if (previous !== undefined) {
      const before = previous;
      const moved = before.liveMove !== null && record.liveMove !== null && before.liveMove !== record.liveMove;
      // On the phase tick the old move has just ended, so a mark there is the new move's.
      const sharesMark = record.marks.some((helper) => before.marks.includes(helper));
      if (moved && sharesMark && record.phase === before.phase) result.markPastItsState += 1;
      if (record.phase !== before.phase) {
        result.zoneOverPhaseChange += record.zones.filter((zone) => before.zones.includes(zone)).length;
        // The old move ran on if nothing set the move state on the phase tick; the phase's own move may
        // start in the same state, but it is set.
        if (before.liveMove !== null && record.liveMove === before.liveMove && !moveStateSet(record))
          result.moveOverPhaseChange += 1;
      }
    }
    // The tick a stun runs out is held too: the stun is spent at the start of the step, before the update.
    const held = record.stunned || previous?.stunned === true;
    for (const zone of record.zones) {
      const ticks = (age.get(zone) ?? 0) + (held ? 0 : 1);
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

/**
 * Plants a fault for a proof: on the first tick of a new move state, the renderer also draws the marks of
 * the state before it, as a renderer that keys a mark on a timer or a flag set in the windup would.
 * `atRest` limits it to the first tick back at rest, the other to the first tick of the next live state.
 */
function keepMarkOneTickLate(atRest: boolean) {
  return (subject: Subject): void => {
    const paint = subject.paint;
    const entity = subject.entity as Subject["entity"] & { state: string };
    /** The last state of the live move that drew a mark, and the state that drew one on the tick before. */
    let moveMarking: string | null = null;
    let lastMarking: string | null = null;
    let lastLive: string | null = null;
    subject.paint = () => {
      const live = entity.liveMove();
      const changed = lastLive !== null && live !== lastLive;
      const late = !changed ? null : atRest ? (live === null ? moveMarking : null) : live !== null ? lastMarking : null;
      if (late !== null) {
        const state = entity.state;
        entity.state = late;
        paint();
        entity.state = state;
      }
      paint();
      lastLive = live;
    };
    const draw = subject.draw.bind(subject);
    subject.draw = () => {
      const record = draw();
      lastMarking = record.marks.length > 0 && record.liveMove !== null ? record.state : null;
      if (record.liveMove === null) moveMarking = null;
      else if (lastMarking !== null) moveMarking = lastMarking;
      return record;
    };
  };
}

/** Plants the fault of a step that never tells the boss its phase changed: its move runs on across it. */
function withoutPhaseNotice(subject: Subject): void {
  (subject.entity as { noticePhase?: () => void }).noticePhase = () => undefined;
}

/**
 * Plants the fault of a zone that lives past its declared length: each zone, the first time it is seen,
 * declares 4 ticks less than it lives. The new Rootbound's bramble lives through several of the fight's
 * stuns, so the proof also holds the rule's count of the boss's clock (the ticks a stun holds, the one it
 * runs out on included) to its 2-tick slack.
 */
function zonesOverrunByFourTicks(subject: Subject): void {
  const seen = new WeakSet<ArenaZone>();
  const draw = subject.draw.bind(subject);
  subject.draw = () => {
    const record = draw();
    for (const zone of record.zones) {
      if (seen.has(zone)) continue;
      seen.add(zone);
      zone.maxLife = (zone.maxLife ?? 0) - 4 * DT;
    }
    return record;
  };
}

/** Every rule held. Hand-drawn marks are checked against the baseline instead. */
const NO_RULE_BROKEN: Omit<Offences, "handDrawnMarks"> = {
  markAtRest: 0,
  markWhileStunned: 0,
  markPastItsState: 0,
  notResumed: 0,
  moveOverPhaseChange: 0,
  afterDeathStart: 0,
  zoneOverPhaseChange: 0,
  zonePastItsLength: 0,
};

/** The largest reach past its body that each entity drew outside the helpers, for the threshold check. */
const reaches = new Map<string, number>();
function noteReach(id: string, fight: Fight): void {
  reaches.set(id, Math.max(0, ...fight.records.map((record) => record.reach)));
}

function checkEntity(id: string, fight: Fight): void {
  const found = offences(fight);
  noteReach(id, fight);
  const { handDrawnMarks, ...rules } = found;
  expect(rules, JSON.stringify(rules)).toEqual(NO_RULE_BROKEN);
  expect(handDrawnMarks > 0, `${id} draws marks by hand; the baseline must list exactly those that do`).toBe(
    id in HAND_DRAWN_MARKS,
  );
}

describe("nothing outlives its move", { timeout: 120_000 }, () => {
  it("keeps the lists to entities the game defines", () => {
    const known = new Set([
      ...BOSS_IDS,
      ...enemyCases().map(({ kind, variant }) => (variant === null ? kind : `${kind}:${variant}`)),
    ]);
    for (const id of [...EXEMPT, ...Object.keys(HAND_DRAWN_MARKS)]) expect(known.has(id), id).toBe(true);
    expect(REST_MOVE_STATES.has("idle")).toBe(true);
  });

  it("fails on a planted fault: a mark kept one tick past its move, into rest", () => {
    expect(offences(bossFight("aldric", keepMarkOneTickLate(true))).markAtRest).toBeGreaterThan(0);
  });

  it("fails on a planted fault: a windup's mark kept into the next state of the move", () => {
    expect(offences(bossFight("colossus", keepMarkOneTickLate(false))).markPastItsState).toBeGreaterThan(0);
  });

  it("fails on a planted fault: a zone that lives 4 ticks past its declared length, through stuns", () => {
    const fight = bossFight("rootbound-rebuild", zonesOverrunByFourTicks);
    expect(fight.stuns.length).toBeGreaterThan(2);
    expect(offences(fight).zonePastItsLength).toBeGreaterThan(0);
  });

  it.each(["aldric", "colossus"] as const)(
    "fails on a planted fault: the step does not end %s's move when the phase changes",
    (id) => {
      expect(offences(bossFight(id, withoutPhaseNotice)).moveOverPhaseChange).toBeGreaterThan(0);
    },
  );

  describe.each(BOSS_IDS.filter((id) => !EXEMPT.includes(id)))("%s", (id) => {
    it("draws no mark outside its move state, resumes after a stun, and leaves nothing past death or a phase", () => {
      const fight = bossFight(id);
      expect(fight.stuns.length, "the fight stunned it mid-move").toBeGreaterThan(0);
      checkEntity(id, fight);
    });
  });

  const enemies = enemyCases().filter(({ kind }) => !ENVIRONMENT_DRAWN_ENEMY_KINDS.includes(kind));
  describe.each(enemies.filter(({ kind }) => !EXEMPT.includes(kind)))("$kind $variant", ({ kind, variant }) => {
    it("draws no mark outside its move state and resumes after a stun", () => {
      const subject = createEnemySubject(kind, variant);
      checkEntity(subject.id, runFight(subject, null));
    });
  });

  it.each(EXEMPT)("%s, exempt until rebuilt, still breaks a rule (else it leaves the list)", (id) => {
    const enemy = enemies.find(({ kind }) => kind === id);
    const fight =
      enemy === undefined ? bossFight(id as HarnessBossId) : runFight(createEnemySubject(enemy.kind, null), null);
    expect(Object.values(offences(fight)).some((count) => count > 0)).toBe(true);
  });

  it("re-measures the thresholds: the largest body, and the nearest hand-drawn mark", () => {
    const bodies = [...reaches].filter(([id]) => !(id in HAND_DRAWN_MARKS)).map(([, reach]) => reach);
    const marks = [...reaches]
      .filter(([id, reach]) => id in HAND_DRAWN_MARKS && reach > MARK_REACH)
      .map(([, reach]) => reach);
    expect(Math.round(Math.max(...bodies))).toBe(MEASURED_BODY_REACH);
    expect(Math.round(Math.min(...marks))).toBe(MEASURED_NEAREST_MARK_REACH);
    expect(MARK_REACH).toBeGreaterThan(MEASURED_BODY_REACH);
    expect(MARK_REACH).toBeLessThan(MEASURED_NEAREST_MARK_REACH);
  });
});
