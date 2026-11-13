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
  const active = (key: keyof TutorialGhostInputEvent): boolean =>
    events.some((event) => {
      if (event[key] !== true) return false;
      const end = event.at + (event.duration ?? step * 0.5);
      return time >= event.at && time < end;
    });
  const Player = createPlayer({
    CONFIG: config,
    FX: { burst: () => undefined, drip: () => undefined },
    GFX: { low: true },
    Input: {
      right: () => active("right"),
      left: () => active("left"),
      up: () => active("up"),
      down: () => active("down"),
      dashPressed: () => active("dash"),
      jumpPressed: () => active("jump"),
    } satisfies PlayerInputPort,
    presentation: { draw: () => undefined },
    aabbOverlap: (ax, ay, ahw, ahh, bx, by, bhw, bhh) => Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    len: (x, y) => Math.hypot(x, y),
  });
  const startX = config.view.w * 0.2;
  const player = new Player(startX, config.world.groundY - config.player.h / 2);
  const floor: readonly PlayerPlatformPort[] = [
    { x: 0, y: config.world.groundY, w: config.view.w, h: config.view.h - config.world.groundY, floor: true },
  ];
  const frames: TutorialGhostFrame[] = [];
  for (let tick = 0; tick <= Math.ceil(length / step); tick += 1) {
    if (tick % 3 === 0 || tick === 0)
      frames.push([
        Number(time.toFixed(3)),
        Number((player.x - startX).toFixed(2)),
        Number((player.y - (config.world.groundY - player.hh)).toFixed(2)),
      ]);
    player.update(step, floor);
    time += step;
  }
  return Object.freeze(frames);
}

export const TUTORIAL_PRODUCTION_GHOST_INPUTS: Readonly<Record<string, readonly TutorialGhostInputEvent[]>> =
  Object.freeze({
    MOVE: Object.freeze([
      { at: 0, duration: 1.3, right: true },
      { at: 1.55, duration: 1.3, left: true },
    ]),
    JUMP: Object.freeze([
      { at: 0.28, jump: true },
      { at: 1.22, jump: true },
      { at: 2.16, jump: true },
    ]),
    DASH: Object.freeze([
      { at: 0, duration: 0.74, right: true },
      { at: 0.52, dash: true },
      { at: 1.42, duration: 0.74, left: true },
      { at: 1.94, dash: true },
    ]),
    CUT: Object.freeze([]),
    LAUNCH: Object.freeze([]),
    JUGGLE: Object.freeze([]),
    SLAM: Object.freeze([
      { at: 0.34, jump: true },
      { at: 0.78, duration: 0.19, down: true },
      { at: 0.82, dash: true },
    ]),
    "POWER SLAM": Object.freeze([
      { at: 0.34, jump: true },
      { at: 0.78, duration: 0.24, down: true },
      { at: 0.82, dash: true },
    ]),
    UPDRAFT: Object.freeze([{ at: 0.3, jump: true }]),
    THROW: Object.freeze([]),
    PARRY: Object.freeze([]),
    "READ THE CHARGE": Object.freeze([
      { at: 0, duration: 0.62, right: true },
      { at: 0.72, duration: 0.32, left: true },
      { at: 0.74, dash: true },
    ]),
    "FIELD TEST": Object.freeze([
      { at: 0, duration: 0.56, right: true },
      { at: 0.62, duration: 0.3, left: true },
      { at: 0.64, dash: true },
      { at: 1.92, jump: true },
    ]),
  });

export function productionGhostPath(
  config: typeof GameConfiguration,
  title: string,
  length: number,
): readonly TutorialGhostFrame[] {
  return recordProductionGhostTrace(config, length, TUTORIAL_PRODUCTION_GHOST_INPUTS[title] ?? []);
}

type Swing = readonly [start: number, end: number, from: number, to: number];

/** One lesson's coach demonstration: a recorded production route plus authored blade, target and shot timing. */
export interface TutorialGhostScript {
  readonly length: number;
  readonly path: readonly TutorialGhostFrame[];
  readonly target?: readonly TutorialGhostFrame[];
  readonly swings?: readonly Swing[];
  readonly dashes?: readonly (readonly [number, number])[];
  readonly hits?: readonly number[];
  readonly throwWindow?: readonly [number, number];
  readonly shot?: Readonly<{ start: number; hit: number; end: number }>;
}

export function productionGhostTraces(config: typeof GameConfiguration): Readonly<Record<string, TutorialGhostScript>> {
  return Object.freeze({
    MOVE: { length: 3, path: productionGhostPath(config, "MOVE", 3) },
    JUMP: { length: 3, path: productionGhostPath(config, "JUMP", 3) },
    DASH: {
      length: 3,
      path: productionGhostPath(config, "DASH", 3),
      dashes: [
        [0.52, 0.72],
        [1.94, 2.14],
      ],
    },
    CUT: {
      length: 3,
      path: productionGhostPath(config, "CUT", 3),
      swings: [
        [0.5, 0.68, -0.9, 0.7],
        [1.3, 1.48, 0.7, -0.9],
        [2.1, 2.28, -0.9, 0.7],
      ],
      hits: [0.6, 1.4, 2.2],
    },
    LAUNCH: {
      length: 3.2,
      path: productionGhostPath(config, "LAUNCH", 3.2),
      swings: [[0.8, 1, 0.8, -1.9]],
      hits: [0.92],
      target: [
        [0, 0, 0],
        [0.9, 0, 0],
        [1.3, 0, -170],
        [1.8, 0, -50],
        [2.2, 0, 0],
      ],
    },
    JUGGLE: {
      length: 3.4,
      path: productionGhostPath(config, "JUGGLE", 3.4),
      swings: [
        [0.5, 0.7, 0.8, -1.9],
        [1.25, 1.42, -0.5, -2.1],
        [1.95, 2.12, -2.1, -0.5],
      ],
      hits: [0.62, 1.33, 2.03],
      target: [
        [0, 0, 0],
        [0.6, 0, 0],
        [1, 0, -160],
        [1.35, 0, -110],
        [1.7, 0, -170],
        [2.05, 0, -120],
        [2.6, 0, 0],
      ],
    },
    SLAM: {
      length: 3.2,
      path: productionGhostPath(config, "SLAM", 3.2),
      swings: [[0.95, 1.15, -0.6, 2.2]],
      hits: [1.08],
      target: [[0, 80, 0]],
    },
    "POWER SLAM": {
      length: 3.4,
      path: productionGhostPath(config, "POWER SLAM", 3.4),
      dashes: [[0.82, 1.02]],
      swings: [[1.05, 1.25, -0.5, 2.3]],
      hits: [1.18],
      target: [[0, 85, 0]],
    },
    UPDRAFT: {
      length: 3,
      path: productionGhostPath(config, "UPDRAFT", 3),
      swings: [[0.62, 0.82, 1, -2]],
      hits: [0.74],
      target: [
        [0, 60, 0],
        [0.7, 60, 0],
        [1.1, 60, -190],
        [1.6, 60, -60],
        [2, 60, 0],
      ],
    },
    THROW: { length: 3.4, path: productionGhostPath(config, "THROW", 3.4), throwWindow: [0.6, 1.9], hits: [1.1] },
    PARRY: {
      length: 3,
      path: productionGhostPath(config, "PARRY", 3),
      swings: [[0.78, 0.94, 0.9, -1.2]],
      shot: { start: 0.3, hit: 0.86, end: 1.6 },
    },
    "READ THE CHARGE": {
      length: 2.4,
      path: productionGhostPath(config, "READ THE CHARGE", 2.4),
      dashes: [[0.72, 0.92]],
    },
    "FIELD TEST": {
      length: 2.5,
      path: productionGhostPath(config, "FIELD TEST", 2.5),
      dashes: [[0.62, 0.82]],
      swings: [[1.52, 1.7, 0.9, -0.8]],
      hits: [1.62],
    },
  });
}
