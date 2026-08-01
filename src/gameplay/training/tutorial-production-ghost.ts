import type { CONFIG as GameConfiguration } from "../../config/game-config";
import { createPlayer, type PlayerInputPort, type PlayerPlatformPort } from "../entities/player";

export type TutorialGhostFrame = readonly [time: number, x: number, y: number];

export interface TutorialGhostInputEvent {
  readonly at: number;
  readonly duration?: number;
  readonly left?: boolean;
  readonly right?: boolean;
  readonly up?: boolean;
  readonly down?: boolean;
  readonly jump?: boolean;
  readonly dash?: boolean;
}

/**
 * A canonical coach route begins as semantic controls and is sampled through
 * the same Player class, collision floor, and active CONFIG that govern live
 * play. The renderer only receives the resulting trace; it never hand-eases
 * the actor through an impossible route.
 */
export function recordProductionGhostTrace(
  config: typeof GameConfiguration,
  length: number,
  events: readonly TutorialGhostInputEvent[],
): readonly TutorialGhostFrame[] {
  const step = 1 / 60;
  let time = 0;
  const active = (key: keyof TutorialGhostInputEvent): boolean => events.some((event) => {
    if (event[key] !== true) return false;
    const end = event.at + (event.duration ?? step * 0.5);
    return time >= event.at && time < end;
  });
  const Player = createPlayer({
    CONFIG: config,
    FX: { burst: () => undefined, drip: () => undefined },
    GFX: { low: true },
    Input: {
      right: () => active("right"), left: () => active("left"), up: () => active("up"), down: () => active("down"),
      dashPressed: () => active("dash"), jumpPressed: () => active("jump"),
    } satisfies PlayerInputPort,
    presentation: { draw: () => undefined },
    aabbOverlap: (ax, ay, ahw, ahh, bx, by, bhw, bhh) => Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    len: (x, y) => Math.hypot(x, y),
  });
  const startX = config.view.w * 0.2;
  const player = new Player(startX, config.world.groundY - config.player.h / 2);
  const floor: readonly PlayerPlatformPort[] = [{ x: 0, y: config.world.groundY, w: config.view.w, h: config.view.h - config.world.groundY, floor: true }];
  const frames: TutorialGhostFrame[] = [];
  for (let tick = 0; tick <= Math.ceil(length / step); tick += 1) {
    if (tick % 3 === 0 || tick === 0) frames.push([Number(time.toFixed(3)), Number((player.x - startX).toFixed(2)), Number((player.y - (config.world.groundY - player.hh)).toFixed(2))]);
    player.update(step, floor);
    time += step;
  }
  return Object.freeze(frames);
}

export const TUTORIAL_PRODUCTION_GHOST_INPUTS: Readonly<Record<string, readonly TutorialGhostInputEvent[]>> = Object.freeze({
  MOVE: Object.freeze([{ at: 0, duration: 1.3, right: true }, { at: 1.55, duration: 1.3, left: true }]),
  JUMP: Object.freeze([{ at: 0.28, jump: true }, { at: 1.22, jump: true }, { at: 2.16, jump: true }]),
  DASH: Object.freeze([{ at: 0, duration: 0.74, right: true }, { at: 0.52, dash: true }, { at: 1.42, duration: 0.74, left: true }, { at: 1.94, dash: true }]),
  CUT: Object.freeze([]),
  LAUNCH: Object.freeze([]),
  JUGGLE: Object.freeze([]),
  SLAM: Object.freeze([{ at: 0.34, jump: true }, { at: 0.78, duration: 0.19, down: true }, { at: 0.82, dash: true }]),
  "POWER SLAM": Object.freeze([{ at: 0.34, jump: true }, { at: 0.78, duration: 0.24, down: true }, { at: 0.82, dash: true }]),
  UPDRAFT: Object.freeze([{ at: 0.3, jump: true }]),
  THROW: Object.freeze([]),
  PARRY: Object.freeze([]),
  "READ THE CHARGE": Object.freeze([{ at: 0, duration: 0.62, right: true }, { at: 0.72, duration: 0.32, left: true }, { at: 0.74, dash: true }]),
  "FIELD TEST": Object.freeze([{ at: 0, duration: 0.56, right: true }, { at: 0.62, duration: 0.30, left: true }, { at: 0.64, dash: true }, { at: 1.92, jump: true }]),
});

export function productionGhostPath(config: typeof GameConfiguration, title: string, length: number): readonly TutorialGhostFrame[] {
  return recordProductionGhostTrace(config, length, TUTORIAL_PRODUCTION_GHOST_INPUTS[title] ?? []);
}
