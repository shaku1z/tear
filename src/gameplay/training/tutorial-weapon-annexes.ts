import type { WeaponId } from "../weapon-selection";
import type { TutorialIntent, TutorialLesson, TutorialUpdateSnapshot } from "./tutorial-controller";

export interface TutorialWeaponAnnexState {
  readonly id: WeaponId;
  readonly weaponId: WeaponId;
  progress: number;
  pendingEvidence: boolean;
}

/** Each step names an applied production effect, never an input or a visual flag. */
export const TUTORIAL_WEAPON_ANNEXES = [
  {
    id: "sword",
    title: "SWORD",
    arena: "launch-bay",
    keys: ["MOUSE", "MOUSE UP"],
    effects: [["reversal"], ["launch", "updraft"]],
    instructions: [
      "Cut through the target, leave its line, then reverse through it with a new swing to earn REVERSAL.",
      "Now make a fresh upward launch through the target. Precision opens the next route.",
    ],
  },
  {
    id: "hammer",
    title: "HAMMER",
    arena: "drop-well",
    keys: ["W", "MOUSE DOWN"],
    effects: [["slam", "superslam", "spike"], ["break"]],
    instructions: [
      "Take height and drive the Hammer down through the target for a real airborne slam.",
      "Commit another heavy strike. Build the target's Break meter until BREAK actually triggers.",
    ],
  },
  {
    id: "greatsword",
    title: "GREATSWORD",
    arena: "throw-lane",
    keys: ["MOUSE", "RMB"],
    effects: [["cleave"], ["wheelCut", "wheelReturn"]],
    instructions: [
      "Carry a fast, clean Greatsword edge through the target to trigger CLEAVE.",
      "Throw the spinning Wheel Cut through the target, or hit it on the return. Recall within link range.",
    ],
  },
  {
    id: "chainblade",
    title: "CHAINBLADE",
    arena: "throw-lane",
    keys: ["RMB", "MOUSE", "RMB"],
    effects: [["hook"], ["slingRelease"]],
    instructions: [
      "Throw into the living target to establish a real Hook. An empty throw does not count.",
      "Steer the hooked target around you, then recall to release its tangential Sling. Stay within link range.",
    ],
  },
  {
    id: "riftlock",
    title: "RIFTLOCK",
    arena: "throw-lane",
    keys: ["RMB", "LMB"],
    effects: [["capture"], ["razorRoundHit", "backblastRoundHit"]],
    instructions: [
      "Throw the Loose Cannon into the living target to establish Capture.",
      "Land a real Razor Round on a target. Fire remotely, or recall and fire from the hand; empty shots give no progress.",
    ],
  },
] as const satisfies readonly {
  id: WeaponId;
  title: string;
  arena: TutorialLesson["arena"];
  keys: readonly string[];
  effects: readonly (readonly string[])[];
  instructions: readonly string[];
}[];

export function weaponAnnex(id: string) {
  return TUTORIAL_WEAPON_ANNEXES.find((annex) => annex.id === id);
}
export function createWeaponAnnex(id: string): TutorialWeaponAnnexState | undefined {
  const definition = weaponAnnex(id);
  return definition === undefined
    ? undefined
    : { id: definition.id, weaponId: definition.id, progress: 0, pendingEvidence: false };
}
export function validateWeaponAnnex(value: unknown): TutorialWeaponAnnexState {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("Invalid tutorial weapon annex");
  const state = value as Record<string, unknown>,
    definition = weaponAnnex(String(state.id));
  if (
    Object.keys(state).some((key) => !["id", "weaponId", "progress", "pendingEvidence"].includes(key)) ||
    !definition ||
    state.id !== definition.id ||
    state.weaponId !== definition.id ||
    !Number.isInteger(state.progress) ||
    Number(state.progress) < 0 ||
    Number(state.progress) > definition.effects.length ||
    typeof state.pendingEvidence !== "boolean" ||
    (state.progress === definition.effects.length && state.pendingEvidence)
  )
    throw new RangeError("Invalid tutorial weapon annex progress");
  return {
    id: definition.id,
    weaponId: definition.id,
    progress: Number(state.progress),
    pendingEvidence: state.pendingEvidence,
  };
}
export function recordWeaponAnnexEffect(state: TutorialWeaponAnnexState, weaponId: string, effect: string): boolean {
  const definition = weaponAnnex(state.id),
    expected: readonly string[] = definition?.effects[state.progress] ?? [];
  if (weaponId !== state.weaponId || !expected.includes(effect)) return false;
  state.pendingEvidence = true;
  return true;
}
export function weaponAnnexLesson(state: TutorialWeaponAnnexState): TutorialLesson {
  const definition = weaponAnnex(state.id);
  if (!definition) throw new Error("Weapon annex definition missing");
  return {
    title: `${definition.title} ANNEX`,
    description: definition.instructions[state.progress] ?? "EXERCISE COMPLETE · Select another exercise or restart.",
    keys: definition.keys,
    arena: definition.arena,
    teachingFocus: "blade",
    dummyCount: 1,
    progress: () => [state.progress, definition.effects.length],
    complete: () => state.progress === definition.effects.length,
  };
}

/** Same live/detached target recovery policy, with no resets during an active remote link. */
export function weaponAnnexTargets(snapshot: TutorialUpdateSnapshot): TutorialIntent[] {
  const intents: TutorialIntent[] = [],
    dummies = snapshot.enemies.filter((enemy) => enemy.tutorialDummy && !enemy.dead);
  for (const enemy of dummies) {
    intents.push({ type: "stabilize-dummy", enemyId: enemy.id, minimumStun: 1, healBelow: enemy.maxHp * 0.5 });
    if (snapshot.bladeState === "held" && Math.abs(enemy.x - snapshot.player.x) > 320) {
      intents.push({
        type: "reset-dummy",
        enemyId: enemy.id,
        x: Math.max(
          160,
          Math.min(snapshot.player.x + (snapshot.player.facing || 1) * 180, snapshot.viewportWidth - 160),
        ),
      });
    }
  }
  if (dummies.length === 0)
    intents.push({
      type: "spawn",
      kind: "charger",
      hpScale: 8,
      role: "dummy",
      x: Math.max(160, Math.min(snapshot.player.x + (snapshot.player.facing || 1) * 180, snapshot.viewportWidth - 160)),
    });
  return intents;
}
