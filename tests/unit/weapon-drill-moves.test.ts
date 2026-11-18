import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { practiceTabDefinition } from "../../src/gameplay/training/practice-tabs";
import { WEAPON_TEACHING } from "../../src/gameplay/training/training-exercises";
import {
  createWeaponAnnex,
  drillMovesLine,
  recordWeaponAnnexEffect,
  TUTORIAL_WEAPON_ANNEXES,
} from "../../src/gameplay/training/tutorial-weapon-annexes";
import { WEAPON_IDS } from "../../src/gameplay/weapon-selection";
import { getWeapon } from "../../src/gameplay/weapons";

/** Every TypeScript source under `dir`, as text. */
function sources(dir: string): { path: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".ts") ? [{ path, text: readFileSync(path, "utf8") }] : [];
  });
}

describe("weapon drill moves (one source of the drilled move names)", () => {
  it("drills every weapon through its own moves, one instruction per move", () => {
    expect(TUTORIAL_WEAPON_ANNEXES.map((annex) => annex.id)).toEqual([...WEAPON_IDS]);
    for (const annex of TUTORIAL_WEAPON_ANNEXES) {
      const weapon = getWeapon(annex.id);
      expect(annex.moves, annex.id).toBe(weapon.drillMoves);
      expect(annex.title).toBe(weapon.name.toUpperCase());
      expect(annex.moves.length, `${annex.id}: moves`).toBeGreaterThan(0);
      expect(annex.instructions.length, `${annex.id}: one instruction per move`).toBe(annex.moves.length);
      for (const move of annex.moves) {
        expect(move.name.trim(), `${annex.id}: a named move`).not.toBe("");
        expect(move.effects.length, `${annex.id} ${move.name}: effects`).toBeGreaterThan(0);
      }
    }
  });

  it("counts each step only on its own move's effects", () => {
    for (const annex of TUTORIAL_WEAPON_ANNEXES)
      annex.moves.forEach((move, step) => {
        for (const effect of move.effects) {
          const state = createWeaponAnnex(annex.id);
          if (!state) throw new Error(`${annex.id}: no annex`);
          state.progress = step;
          expect(recordWeaponAnnexEffect(state, annex.id, effect), `${annex.id} ${effect}`).toBe(true);
        }
        const other = annex.moves.find((_, index) => index !== step)?.effects[0];
        const state = createWeaponAnnex(annex.id);
        if (!state || other === undefined) return;
        state.progress = step;
        expect(recordWeaponAnnexEffect(state, annex.id, other), `${annex.id} step ${String(step)}`).toBe(false);
      });
  });

  it("names only effects the combat code reports", () => {
    // The reporters are the combat and entity runtimes that call `weaponEffect` or return a
    // `mechanic`; the drill table itself (weapons.ts) and the training code only read the ids.
    const reporters = [...sources("src/gameplay"), ...sources("src/app/combat")].filter(
      ({ path }) => !path.includes(join("gameplay", "training")) && !path.endsWith(join("gameplay", "weapons.ts")),
    );
    for (const annex of TUTORIAL_WEAPON_ANNEXES)
      for (const effect of annex.moves.flatMap((move) => move.effects))
        expect(
          reporters.some(({ text }) => text.includes(`"${effect}"`)),
          `${annex.id}: "${effect}" is reported by the combat code`,
        ).toBe(true);
  });

  it("builds the WEAPONS help and the drill's teaching line from the moves", () => {
    const help = practiceTabDefinition("weapons").help ?? "";
    for (const annex of TUTORIAL_WEAPON_ANNEXES) {
      expect(help).toContain(drillMovesLine(annex, "list"));
      expect(WEAPON_TEACHING[annex.id].why).toBe(drillMovesLine(annex, "sequence"));
      for (const move of annex.moves) expect(help).toContain(move.name);
    }
    const sword = TUTORIAL_WEAPON_ANNEXES.find((annex) => annex.id === "sword");
    if (!sword) throw new Error("no sword annex");
    expect(drillMovesLine(sword, "list")).toBe("Sword: Reversal and Launch.");
    expect(drillMovesLine(sword, "sequence")).toBe("Sword: Reversal, then Launch.");
  });
});
