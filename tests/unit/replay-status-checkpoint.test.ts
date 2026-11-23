/**
 * A replay that drifts only on a status effect is caught at the next checkpoint.
 *
 * The canonical state a record's checkpoints hash holds each actor's status effects
 * (`ENEMY_STATUS_FIELDS`, `PLAYER_STATUS_FIELDS` in src/gameplay/runtime/canonical-state.ts). Here a
 * clean record is re-simulated with one change made to the world after a tick: an enemy is given a burn
 * that does no damage, so nothing but the burn's timer differs. Verify must name the next checkpoint.
 * Before statuses were hashed, the run verified, and such a replay would have been shown as the run.
 */
import { describe, expect, it } from "vitest";

import { stepDetachedWorld } from "../../src/app/world/detached/detached-step";
import {
  captureProductionReplayCheckpoint,
  createProductionGhostReplayComposition,
} from "../../src/app/world/detached/replay-composition";
import { startRecordWorld, type RecordWorldEngine } from "../../src/app/replay/record-world";
import { createDetachedReplayWorld } from "../../src/app/replay/detached-replay-world";
import {
  ENEMY_STATUS_FIELDS,
  PLAYER_STATUS_FIELDS,
  canonicalReplayTotals,
  projectCanonicalGameplayState,
} from "../../src/gameplay/runtime/canonical-state";
import { stableVerificationHash } from "../../src/domain/hash";
import { REPLAY_CHECKPOINT_TICKS } from "../../src/replay/record";
import { verifyReplay, type ReplayWorld } from "../../src/replay/verify";
import { SPECS } from "../support/hash-stream-corpus";
import { recordCorpusStream } from "../support/replay-corpus-record";

/** The tick after which the change is made: between the first and second checkpoints. */
const CHANGED_AFTER = REPLAY_CHECKPOINT_TICKS + 20;

type Session = ReturnType<ReturnType<RecordWorldEngine["createProductionGhostReplayComposition"]>["create"]>;
type LiveEnemy = Record<string, unknown> & { dead: boolean; burnT: number; burnDps: number };

/** The detached replay world, with `change` applied to the world once, after tick `after`. */
function changedWorld(
  after: number,
  change: (enemies: LiveEnemy[]) => boolean,
): ReplayWorld & { changed: () => boolean } {
  let changed = false;
  const engine: RecordWorldEngine = {
    createProductionGhostReplayComposition,
    captureProductionReplayCheckpoint,
    stepDetachedWorld: (session: Session, actions, frames) => {
      const result = stepDetachedWorld(session, actions, frames);
      if (!changed && result.tick === after)
        changed = change(session.replay.world.state.enemies() as unknown as LiveEnemy[]);
      return result;
    },
  };
  return {
    changed: () => changed,
    start: (run, observe) => {
      const world = startRecordWorld(engine, run, observe);
      let last: ReturnType<typeof world.step> | undefined;
      return {
        step(actions, frames) {
          last = world.step(actions, frames);
          const result = last;
          return { tick: result.tick, hash: () => result.stateHash, terminated: world.terminated() };
        },
        run: () => canonicalReplayTotals(last?.state.run),
        dispose: world.dispose,
      };
    },
  };
}

describe("a status-only difference", () => {
  const spec = SPECS.find((candidate) => candidate.id === "sword/melee");
  if (spec === undefined) throw new Error("no sword/melee corpus stream");
  const record = recordCorpusStream(spec);

  it("has a clean record that verifies and runs past the second checkpoint", () => {
    expect(record.run.result.tick).toBeGreaterThanOrEqual(2 * REPLAY_CHECKPOINT_TICKS);
    expect(verifyReplay(record, createDetachedReplayWorld())).toEqual({
      status: "verified",
      tick: record.run.result.tick,
    });
  }, 60_000);

  it("is caught at the next checkpoint: a burn that does no damage", () => {
    const world = changedWorld(CHANGED_AFTER, (enemies) => {
      const target = enemies.find((enemy) => !enemy.dead && !(enemy.burnT > 0));
      if (target === undefined) return false;
      target.burnT = 60;
      target.burnDps = 0;
      return true;
    });
    const verdict = verifyReplay(record, world);
    expect(world.changed(), "no live enemy to burn after the change tick").toBe(true);
    expect(verdict).toMatchObject({ status: "differs", what: "checkpoint", tick: 2 * REPLAY_CHECKPOINT_TICKS });
  }, 60_000);
});

describe("the status lists", () => {
  it("hash every listed status: changing one changes the canonical state's hash", () => {
    const input = { tick: 1 } as never;
    const enemy = { _gid: 1, kind: "grunt", x: 0, y: 0, vx: 0, vy: 0, hp: 10, dead: false };
    const player = { x: 0, y: 0, vx: 0, vy: 0, hp: 10 };
    const hash = (overrides: { enemy?: object; player?: object }) =>
      stableVerificationHash(
        projectCanonicalGameplayState(1, input, null, { ...player, ...overrides.player }, null, [
          { ...enemy, ...overrides.enemy },
        ]),
      );
    const base = hash({});
    for (const field of ENEMY_STATUS_FIELDS) {
      const value = field === "rooted" ? true : 1.5;
      expect(hash({ enemy: { [field]: value } }), `enemy ${field}`).not.toBe(base);
    }
    for (const field of PLAYER_STATUS_FIELDS)
      expect(hash({ player: { [field]: 1.5 } }), `player ${field}`).not.toBe(base);
  });
});
