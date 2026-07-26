import type { ArenaPlatform } from "./arena-rules";

/**
 * A lesson owns its geometry.  This keeps a new task from inheriting a route
 * designed for a previous task (the old tutorial used the playground forever).
 */
export type TutorialArenaId =
  | "runway" | "vertical-gate" | "dash-lane" | "blade-range" | "launch-bay"
  | "air-chain" | "drop-well" | "dive-channel" | "liftwell" | "throw-lane"
  | "counterline" | "read-line" | "field-floor" | "ready-room";

export interface TutorialArenaDefinition {
  readonly id: TutorialArenaId;
  readonly label: string;
  readonly purpose: string;
}

export const TUTORIAL_ARENAS: readonly TutorialArenaDefinition[] = Object.freeze([
  { id: "runway", label: "THE RUNWAY", purpose: "Build speed in both directions." },
  { id: "vertical-gate", label: "THE GATE", purpose: "Learn the vertical route." },
  { id: "dash-lane", label: "THE DASH LANE", purpose: "Spend momentum on purpose." },
  { id: "blade-range", label: "THE CUTTING LINE", purpose: "Feel blade speed and reach." },
  { id: "launch-bay", label: "THE LAUNCH BAY", purpose: "Turn an opening into airtime." },
  { id: "air-chain", label: "THE AIR CHAIN", purpose: "Keep an enemy suspended." },
  { id: "drop-well", label: "THE DROP WELL", purpose: "Convert height into impact." },
  { id: "dive-channel", label: "THE DIVE CHANNEL", purpose: "Commit to a power slam." },
  { id: "liftwell", label: "THE LIFT WELL", purpose: "Create height while rising." },
  { id: "throw-lane", label: "THE THROW LANE", purpose: "Control space away from the hand." },
  { id: "counterline", label: "THE COUNTERLINE", purpose: "Turn pressure back on its owner." },
  { id: "read-line", label: "THE READ LINE", purpose: "Wait for a commitment, then take the safe opening." },
  { id: "field-floor", label: "THE FIELD", purpose: "Carry movement, pressure, and counterplay together." },
  { id: "ready-room", label: "THE EXIT", purpose: "Carry the whole language forward." },
]);

const definition = (id: TutorialArenaId): TutorialArenaDefinition =>
  TUTORIAL_ARENAS.find((arena) => arena.id === id) ?? { id: "runway", label: "THE RUNWAY", purpose: "Build speed in both directions." };

function surface(id: TutorialArenaId, index: number, x: number, y: number, w: number): ArenaPlatform {
  return { x, y, w, h: 24, oneway: true, platformId: `tutorial:${id}:${String(index)}`,
    material: "tutorial", arenaMaterial: `tutorial:${id}` };
}

/** A fresh mutable platform list for the live collision system on every block transition. */
export function createTutorialArena(id: TutorialArenaId, viewportWidth: number, viewportHeight: number, groundY: number): ArenaPlatform[] {
  const floor: ArenaPlatform = { x: 0, y: groundY, w: viewportWidth, h: Math.max(100, viewportHeight - groundY), floor: true,
    platformId: `tutorial:${id}:floor`, material: "tutorial", arenaMaterial: `tutorial:${id}:floor` };
  const x = (ratio: number) => Math.round(viewportWidth * ratio);
  const y = (offset: number) => Math.round(groundY - offset);
  const layouts: Readonly<Record<TutorialArenaId, readonly ArenaPlatform[]>> = {
    runway: [],
    "vertical-gate": [surface(id, 0, x(0.30), y(150), 230), surface(id, 1, x(0.55), y(300), 230)],
    "dash-lane": [surface(id, 0, x(0.42), y(105), 300), surface(id, 1, x(0.72), y(205), 220)],
    "blade-range": [surface(id, 0, x(0.24), y(115), 240)],
    "launch-bay": [surface(id, 0, x(0.62), y(205), 240)],
    "air-chain": [surface(id, 0, x(0.34), y(155), 210), surface(id, 1, x(0.62), y(280), 210)],
    "drop-well": [surface(id, 0, x(0.42), y(300), 260)],
    "dive-channel": [surface(id, 0, x(0.27), y(280), 210), surface(id, 1, x(0.67), y(280), 210)],
    liftwell: [surface(id, 0, x(0.26), y(180), 220), surface(id, 1, x(0.62), y(300), 220)],
    "throw-lane": [surface(id, 0, x(0.18), y(130), 190), surface(id, 1, x(0.70), y(130), 190)],
    counterline: [surface(id, 0, x(0.32), y(145), 210), surface(id, 1, x(0.62), y(145), 210)],
    "read-line": [surface(id, 0, x(0.30), y(150), 220), surface(id, 1, x(0.67), y(150), 220)],
    "field-floor": [surface(id, 0, x(0.22), y(120), 220), surface(id, 1, x(0.49), y(235), 240), surface(id, 2, x(0.76), y(120), 190)],
    "ready-room": [surface(id, 0, x(0.30), y(170), 230), surface(id, 1, x(0.60), y(270), 230)],
  };
  return [floor, ...layouts[id]];
}

export function tutorialArenaDefinition(id: TutorialArenaId): TutorialArenaDefinition { return definition(id); }
