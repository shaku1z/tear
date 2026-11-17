import { TearLiveHierarchicalPolicy } from "../agents/hierarchical-policy-adapter";
import type { TearAgentObservation } from "../agents/contracts";
import type { BossTell } from "../gameplay/entities/boss-tells";
import { INPUT_AXIS_SCALE, type GameAction } from "../input/game-action";
import { boxOverlaps, type BossView, type PlayerBox } from "./boss-view";

/** The simulation runs 120 fixed steps a second; every timing below is in those steps. */
export const PLAYTEST_TICKS_PER_SECOND = 120;

/**
 * How the tell-avoiding player reacts. One place, in simulation ticks and world pixels, so a change
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

export type BossPlayerId = "scripted" | "avoids-tells";

export interface BossPlayer {
  readonly id: BossPlayerId;
  decide(observation: TearAgentObservation, boss: BossView | null, player: PlayerBox | null): readonly GameAction[];
}

function ticksLeft(tell: BossTell): number {
  return tell.stage === "active" ? 0 : tell.remainingSeconds * PLAYTEST_TICKS_PER_SECOND;
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
 */
export function createTellAvoidingBossPlayer(): BossPlayer {
  const policy = new TearLiveHierarchicalPolicy("competent");
  let side = 0;
  let lastX = Number.NaN;
  let stuck = 0;
  return {
    id: "avoids-tells",
    decide(observation, boss, player) {
      const base = policy.decide(withBoss(observation, boss)).actions;
      if (boss === null || player === null || observation.ui?.screen !== "playing") return base;
      const threat = boss.tells
        .filter((tell) => threatening(tell) && boxOverlaps(player, tell, TELL_AVOIDANCE.marginPixels))
        .sort((left, right) => ticksLeft(left) - ticksLeft(right) || left.id.localeCompare(right.id))[0];
      if (threat === undefined) {
        side = 0;
        stuck = 0;
        lastX = player.x;
        const exposed = boss.tells.some((tell) => tell.stage === "exposed");
        const toward = boss.x >= player.x ? INPUT_AXIS_SCALE : -INPUT_AXIS_SCALE;
        const steer = (x: number): readonly GameAction[] => [
          ...base.filter((action) => action.type !== "move" && action.type !== "dash"),
          { type: "move", x, y: 0 },
        ];
        if (!exposed) return boxOverlaps(player, boss, TELL_AVOIDANCE.bodyClearancePixels) ? steer(-toward) : base;
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

export function createBossPlayer(id: BossPlayerId): BossPlayer {
  return id === "scripted" ? createScriptedBossPlayer() : createTellAvoidingBossPlayer();
}
