import type { TutorialGoldBlade, TutorialGoldFrame } from "./tutorial-gold-reference";
import { isObject } from "../../domain/records";

/**
 * Turns the live world into one gold frame. It is here, and not with the corpus code, so the running game can
 * project a frame without loading the corpus reader and writer.
 */

/** Freezes a value and everything inside it. */
export function freezeDeep<T>(value: T): T {
  if (isObject(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export interface TutorialGoldFrameSource {
  readonly tick: number;
  readonly stage: number;
  readonly encounter: TutorialGoldFrame["encounter"];
  readonly player: Readonly<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: number;
    onGround: boolean;
    dashTimer: number;
  }>;
  readonly blade: TutorialGoldBlade;
  readonly actors: readonly Readonly<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    hp: number;
    dead: boolean;
    kind: string;
    state?: string;
    atk?: string;
  }>[];
  readonly projectiles: readonly Readonly<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
    dead: boolean;
    deflected: boolean;
    family?: string;
  }>[];
  id(entity: object, role: "enemy" | "projectile"): string;
}
/** One real-world projector for gold and personal attempts; it never simulates or infers hits. */
export function projectTutorialGoldFrame(source: TutorialGoldFrameSource): TutorialGoldFrame {
  return freezeDeep({
    tick: source.tick,
    stage: source.stage,
    encounter: source.encounter,
    body: {
      x: source.player.x,
      y: source.player.y,
      vx: source.player.vx,
      vy: source.player.vy,
      facing: source.player.facing,
      grounded: source.player.onGround,
      dashing: source.player.dashTimer > 0,
    },
    blade: {
      x: source.blade.x,
      y: source.blade.y,
      tipX: source.blade.tipX,
      tipY: source.blade.tipY,
      tipVX: source.blade.tipVX,
      tipVY: source.blade.tipVY,
      tipSpeed: source.blade.tipSpeed,
      angle: source.blade.angle,
      state: source.blade.state,
      swingId: source.blade.swingId,
      throwId: source.blade.throwId,
    },
    actors: source.actors.map((actor) => ({
      id: source.id(actor, "enemy"),
      kind: actor.kind,
      x: actor.x,
      y: actor.y,
      vx: actor.vx,
      vy: actor.vy,
      hp: actor.hp,
      dead: actor.dead,
      state: actor.state ?? actor.atk ?? "active",
    })),
    projectiles: source.projectiles.map((shot) => ({
      id: source.id(shot, "projectile"),
      x: shot.x,
      y: shot.y,
      vx: shot.vx,
      vy: shot.vy,
      radius: shot.r,
      dead: shot.dead,
      deflected: shot.deflected,
      family: shot.family ?? "ordinaryProjectile",
    })),
  });
}
