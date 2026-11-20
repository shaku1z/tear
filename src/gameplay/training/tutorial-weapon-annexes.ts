import type { PromptAction } from "../../domain/prompt-vocabulary";
import { WEAPON_IDS, type WeaponId } from "../weapon-selection";
import { getWeapon, type WeaponDrillMove } from "../weapons";
import type { TutorialIntent, TutorialLesson, TutorialUpdateSnapshot } from "./tutorial-controller";
import { requireRecord } from "../../domain/records";

export interface TutorialWeaponAnnexState {
  readonly id: WeaponId;
  readonly weaponId: WeaponId;
  progress: number;
  pendingEvidence: boolean;
}

/**
 * Where and how each weapon is drilled. Its steps are the weapon's own `drillMoves` (one step per
 * move, matched on the effects the weapon reports, never an input or a visual flag), with one
 * instruction per step here and the controls the drill prompts. A new weapon does not compile
 * until it has its row.
 */
const ANNEX_ROWS = {
  sword: {
    arena: "launch-bay",
    controls: ["swing", "swing-up"],
    instructions: [
      "Cut through the target, leave its line, then reverse through it with a new swing to earn REVERSAL.",
      "Now make a fresh upward launch through the target. Precision opens the next route.",
    ],
  },
  hammer: {
    arena: "drop-well",
    controls: ["jump", "swing-down"],
    instructions: [
      "Take height and drive the Hammer down through the target for a real airborne slam.",
      "Commit another heavy strike. Build the target's Break meter until BREAK actually triggers.",
    ],
  },
  greatsword: {
    arena: "throw-lane",
    controls: ["swing", "throw"],
    instructions: [
      "Carry a fast, clean Greatsword edge through the target to trigger CLEAVE.",
      "Throw the spinning Wheel Cut through the target, or hit it on the return. Recall within link range.",
    ],
  },
  chainblade: {
    arena: "throw-lane",
    controls: ["throw", "swing", "recall"],
    instructions: [
      "Throw into the living target to establish a real Hook. An empty throw does not count.",
      "Steer the hooked target around you, then recall to release its tangential Sling. Stay within link range.",
    ],
  },
  riftlock: {
    arena: "throw-lane",
    controls: ["throw", "tether"],
    instructions: [
      "Throw the Loose Cannon into the living target to establish Capture.",
      "Land a real Razor Round on a target. Fire remotely, or recall and fire from the hand; empty shots give no progress.",
    ],
  },
} as const satisfies Record<
  WeaponId,
  {
    arena: NonNullable<TutorialLesson["arena"]>;
    controls: readonly PromptAction[];
    instructions: readonly string[];
  }
>;

export interface TutorialWeaponAnnex {
  readonly id: WeaponId;
  /** The weapon's name (`WeaponDefinition.name`). */
  readonly name: string;
  /** The name in capitals, as the Drills list shows it. */
  readonly title: string;
  readonly arena: NonNullable<TutorialLesson["arena"]>;
  readonly controls: readonly PromptAction[];
  /** The weapon's drill moves, one step each. */
  readonly moves: readonly WeaponDrillMove[];
  readonly instructions: readonly string[];
}

export const TUTORIAL_WEAPON_ANNEXES: readonly TutorialWeaponAnnex[] = Object.freeze(
  WEAPON_IDS.map((id) => {
    const weapon = getWeapon(id);
    return { id, ...ANNEX_ROWS[id], name: weapon.name, title: weapon.name.toUpperCase(), moves: weapon.drillMoves };
  }),
);

/**
 * One line naming a weapon's drill moves from its definition: "Sword: Reversal and Launch." for a
 * list, "Sword: Reversal, then Launch." for the order a drill takes them in.
 */
export function drillMovesLine(annex: TutorialWeaponAnnex, order: "list" | "sequence"): string {
  const names = annex.moves.map((move) => move.name),
    last = names.at(-1) ?? "";
  const text =
    order === "sequence"
      ? names.join(", then ")
      : names.length < 2
        ? last
        : `${names.slice(0, -1).join(", ")} and ${last}`;
  return `${annex.name}: ${text}.`;
}

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
  const state = requireRecord(value, "Invalid tutorial weapon annex"),
    definition = weaponAnnex(String(state.id));
  if (
    Object.keys(state).some((key) => !["id", "weaponId", "progress", "pendingEvidence"].includes(key)) ||
    !definition ||
    state.id !== definition.id ||
    state.weaponId !== definition.id ||
    !Number.isInteger(state.progress) ||
    Number(state.progress) < 0 ||
    Number(state.progress) > definition.moves.length ||
    typeof state.pendingEvidence !== "boolean" ||
    (state.progress === definition.moves.length && state.pendingEvidence)
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
    expected: readonly string[] = definition?.moves[state.progress]?.effects ?? [];
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
    arena: definition.arena,
    teachingFocus: "blade",
    dummyCount: 1,
    progress: () => [state.progress, definition.moves.length],
    complete: () => state.progress === definition.moves.length,
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
