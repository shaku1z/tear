import { TearLiveHierarchicalPolicy } from "../agents/hierarchical-policy-adapter";
import type { TearAgentObservation } from "../agents/contracts";
import type { BossTell } from "../gameplay/entities/boss-tells";
import { INPUT_AXIS_SCALE, type GameAction } from "../input/game-action";
import { TEAR_SIMULATION_TICKS_PER_SECOND } from "../tearbench/simulation-profile";
import { aimAtObject, createObjectChoice, OBJECT_CUTTING } from "./boss-objects";
import { boxOverlaps, type BossView, type PlayerBox } from "./boss-view";

/**
 * How the tell-avoiding player reacts. One place, in simulation ticks (120 a second) and world pixels, so a change
 * here is a visible change to every table.
 */
export const TELL_AVOIDANCE = Object.freeze({
  /** Start leaving a warned area when it lands within this many ticks (0.35 s). */
  reactTicks: 42,
  /** Spend a dash when it lands within this many ticks (0.15 s) and the player is still inside. */
  dashTicks: 18,
  /** Stay this far outside the edge of a threatened area. */
  marginPixels: 28,
  /** A threatened area whose top is at most this far above the feet of the player can be jumped. */
  jumpableHeightPixels: 70,
  /** Ticks without horizontal progress before the player tries the other side (a wall is in the way). */
  blockedTicks: 10,
  /** Go this close to an exposed boss before relying on the scripted swing. */
  punishRangePixels: 120,
  /** Touching a boss hurts. Keep this far off its body unless it reports itself exposed. */
  bodyClearancePixels: 24,
});

export const BOSS_PLAYER_IDS = Object.freeze([
  "scripted",
  "avoids-tells",
  "cuts-objects",
  "no-dodge",
  "still",
  "walker",
] as const);
export type BossPlayerId = (typeof BOSS_PLAYER_IDS)[number];

/**
 * The players that measure the pressure of a boss, not the kill, play this much of a phase (60 s) and stop: one
 * that never avoids or never attacks would otherwise run every fight to its time limit.
 */
export const PRESSURE_PHASE_TICKS = 60 * TEAR_SIMULATION_TICKS_PER_SECOND;

export interface BossPlayer {
  readonly id: BossPlayerId;
  /** The fight stops, as a time limit, once a phase has been played for this many ticks. Absent: no such limit. */
  readonly phaseTicks?: number;
  decide(observation: TearAgentObservation, boss: BossView | null, player: PlayerBox | null): readonly GameAction[];
}

function ticksLeft(tell: BossTell): number {
  return tell.stage === "active" ? 0 : tell.remainingSeconds * TEAR_SIMULATION_TICKS_PER_SECOND;
}

function threatening(tell: BossTell): boolean {
  if (!tell.damaging || tell.stage === "exposed") return false;
  return ticksLeft(tell) <= TELL_AVOIDANCE.reactTicks;
}

const isMovement = (action: GameAction): boolean =>
  action.type === "move" || action.type === "jump" || action.type === "dash";

function withBoss(observation: TearAgentObservation, boss: BossView | null): TearAgentObservation {
  return boss === null ? observation : { ...observation, boss: { id: boss.id, phase: String(boss.phase) } };
}

/** The hand-written scripted player, unchanged: it treats the boss as one more enemy. */
export function createScriptedBossPlayer(): BossPlayer {
  const policy = new TearLiveHierarchicalPolicy("competent");
  return { id: "scripted", decide: (observation, boss) => policy.decide(withBoss(observation, boss)).actions };
}

/**
 * The scripted player with one addition: it reads the tells the boss declares and steps out of an
 * area before it lands, and goes in when the boss reports itself exposed. It reads nothing else
 * about the boss, so it works on any boss that declares tells.
 *
 * As "cuts-objects" it also cuts what stands on the stage (Grafts, cage walls, roots) before it goes back to
 * the boss: it walks under the object, jumps when it is higher up, and swings. It leaves them for the boss
 * while the boss is open, and still steps out of a warned area first.
 */
export function createTellAvoidingBossPlayer(id: "avoids-tells" | "cuts-objects" = "avoids-tells"): BossPlayer {
  const policy = new TearLiveHierarchicalPolicy("competent");
  let side = 0;
  let lastX = Number.NaN;
  let stuck = 0;
  const chooseObject = id === "cuts-objects" ? createObjectChoice() : undefined;
  return {
    id,
    decide(observation, boss, player) {
      const open = boss?.tells.some((tell) => tell.stage === "exposed") === true;
      const object = open ? undefined : chooseObject?.(observation.state);
      const shown = object === undefined ? observation : aimAtObject(observation, object);
      const base = policy.decide(withBoss(shown, boss)).actions;
      if (boss === null || player === null || observation.ui?.screen !== "playing") return base;
      const threat = boss.tells
        .filter((tell) => threatening(tell) && boxOverlaps(player, tell, TELL_AVOIDANCE.marginPixels))
        .sort((left, right) => ticksLeft(left) - ticksLeft(right) || left.id.localeCompare(right.id))[0];
      if (threat === undefined) {
        side = 0;
        stuck = 0;
        lastX = player.x;
        const toward = boss.x >= player.x ? INPUT_AXIS_SCALE : -INPUT_AXIS_SCALE;
        const steer = (x: number): readonly GameAction[] => [
          ...base.filter((action) => action.type !== "move" && action.type !== "dash"),
          { type: "move", x, y: 0 },
        ];
        if (object !== undefined) {
          const sideways = object.x - player.x;
          const x = Math.abs(sideways) <= OBJECT_CUTTING.standPixels ? 0 : Math.sign(sideways) * INPUT_AXIS_SCALE;
          const actions: GameAction[] = [...base.filter((action) => !isMovement(action)), { type: "move", x, y: 0 }];
          if (object.y < player.y - OBJECT_CUTTING.jumpAbovePixels && observation.state.player.grounded)
            actions.push({ type: "jump", phase: "pressed" });
          return actions;
        }
        if (!open) return boxOverlaps(player, boss, TELL_AVOIDANCE.bodyClearancePixels) ? steer(-toward) : base;
        return Math.abs(boss.x - player.x) <= boss.hw + TELL_AVOIDANCE.punishRangePixels ? base : steer(toward);
      }
      if (side === 0) side = player.x <= threat.x ? -1 : 1;
      stuck = Math.abs(player.x - lastX) < 0.25 ? stuck + 1 : 0;
      lastX = player.x;
      if (stuck >= TELL_AVOIDANCE.blockedTicks) {
        side = -side;
        stuck = 0;
      }
      const x = side * INPUT_AXIS_SCALE;
      const jumpable = player.y + player.hh - (threat.y - threat.hh) <= TELL_AVOIDANCE.jumpableHeightPixels;
      const actions: GameAction[] = [...base.filter((action) => !isMovement(action)), { type: "move", x, y: 0 }];
      if (jumpable && observation.state.player.grounded) actions.push({ type: "jump", phase: "pressed" });
      if (ticksLeft(threat) <= TELL_AVOIDANCE.dashTicks && observation.state.player.dashCharges > 0)
        actions.push({ type: "dash", x, y: 0 });
      return actions;
    },
  };
}

/**
 * The scripted player without its dash and its jump: it attacks and walks, and avoids nothing that needs either.
 * Set beside the scripted player it shows whether avoiding is needed.
 */
export function createNoDodgeBossPlayer(): BossPlayer {
  const scripted = createScriptedBossPlayer();
  return {
    id: "no-dodge",
    phaseTicks: PRESSURE_PHASE_TICKS,
    decide: (observation, boss, player) =>
      scripted.decide(observation, boss, player).filter((action) => action.type !== "dash" && action.type !== "jump"),
  };
}

/**
 * No input during play: where it stands shows what a boss does to a player who does nothing. Off the play screen
 * it answers as the scripted player does, so a fight is not held up by a page that waits for a key.
 */
export function createStillBossPlayer(): BossPlayer {
  const scripted = createScriptedBossPlayer();
  return {
    id: "still",
    phaseTicks: PRESSURE_PHASE_TICKS,
    decide: (observation, boss, player) =>
      observation.ui?.screen === "playing" ? [] : scripted.decide(observation, boss, player),
  };
}

/** How the walker walks. In simulation ticks (120 a second) and world pixels. */
export const WALKER = Object.freeze({
  /** It jumps once every this many ticks (4 s). */
  jumpEveryTicks: 4 * TEAR_SIMULATION_TICKS_PER_SECOND,
  /** It turns round after this many ticks without getting further: a wall, or a boss that blocks, is in the way. */
  blockedTicks: 10,
});

/**
 * Keeps walking across the arena, turns round at whatever stops it, and jumps every four seconds. It never
 * attacks and avoids nothing on purpose, so what hits it is the pressure the boss puts on a moving player.
 */
export function createWalkerBossPlayer(): BossPlayer {
  const scripted = createScriptedBossPlayer();
  let side = 1;
  let lastX = Number.NaN;
  let stuck = 0;
  let sinceJump = 0;
  return {
    id: "walker",
    phaseTicks: PRESSURE_PHASE_TICKS,
    decide(observation, boss, player) {
      if (observation.ui?.screen !== "playing") return scripted.decide(observation, boss, player);
      const { x, grounded } = observation.state.player;
      stuck = Math.abs(x - lastX) < 0.25 ? stuck + 1 : 0;
      lastX = x;
      if (stuck >= WALKER.blockedTicks) {
        side = -side;
        stuck = 0;
      }
      const actions: GameAction[] = [{ type: "move", x: side * INPUT_AXIS_SCALE, y: 0 }];
      // The jump waits for the ground, so one that falls due in the air is taken on landing, not lost.
      sinceJump += 1;
      if (grounded && sinceJump >= WALKER.jumpEveryTicks) {
        actions.push({ type: "jump", phase: "pressed" });
        sinceJump = 0;
      }
      return actions;
    },
  };
}

const PLAYERS: Readonly<Record<BossPlayerId, () => BossPlayer>> = {
  scripted: createScriptedBossPlayer,
  "avoids-tells": () => createTellAvoidingBossPlayer("avoids-tells"),
  "cuts-objects": () => createTellAvoidingBossPlayer("cuts-objects"),
  "no-dodge": createNoDodgeBossPlayer,
  still: createStillBossPlayer,
  walker: createWalkerBossPlayer,
};

export function createBossPlayer(id: BossPlayerId): BossPlayer {
  return PLAYERS[id]();
}
