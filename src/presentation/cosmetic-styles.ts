/**
 * Turns a loadout (slot id to item id) into the numbers the game's own draw routines use. One resolver for
 * every wearer: the local player, and later a replay or a co-op partner passing their own loadout. Nothing
 * here reads or writes simulation state; a style changes colour, alpha and particle count only.
 *
 * An empty slot resolves to the slot's default look with `worn: false`, and a draw routine given a style
 * that is not worn draws the game's own look (the blade's own trail colour, the enemy's spark colour).
 */
import type { CosmeticCatalog, Loadout, Look } from "../domain/cosmetic-types";
import { ownValue } from "../domain/records";

export type RibbonFade = "linear" | "hold";
const RIBBON_FADES: readonly RibbonFade[] = ["linear", "hold"];

/** The blade's colours. `base` and `accent` draw nothing until the owner decides how a blade body may change. */
export interface TintStyle {
  readonly worn: boolean;
  readonly glow: string;
}
export interface RibbonStyle {
  readonly worn: boolean;
  readonly colors: readonly string[];
  readonly widthScale: number;
  readonly glow: number;
  readonly fade: RibbonFade;
}
export interface BurstStyle {
  readonly worn: boolean;
  readonly colors: readonly string[];
  readonly countScale: number;
}
export interface CosmeticStyles {
  readonly blade: TintStyle;
  readonly trail: RibbonStyle;
  readonly spark: BurstStyle;
}

/**
 * The slots a draw routine reads, the family each expects, and the look parameters it draws. A slot is
 * "ready" in slots.json exactly when it is listed here, and a ready slot's item must differ from the default
 * in a listed parameter, so the shelf never sells a look that changes nothing (both are tested).
 */
export const COSMETIC_DRAW_HOOKS = {
  blade: { family: "tint", draws: ["glow"] },
  trail: { family: "ribbon", draws: ["colors", "widthScale", "glow", "fade"] },
  spark: { family: "burst", draws: ["colors", "countScale"] },
} as const satisfies Record<keyof CosmeticStyles, Readonly<{ family: string; draws: readonly string[] }>>;

type DrawnSlot = keyof typeof COSMETIC_DRAW_HOOKS;

function invalid(slot: DrawnSlot, key: string): never {
  throw new TypeError(`cosmetic ${slot} look has no valid ${key}`);
}
function color(look: Look, slot: DrawnSlot, key: string): string {
  const value = look[key];
  return typeof value === "string" ? value : invalid(slot, key);
}
function amount(look: Look, slot: DrawnSlot, key: string): number {
  const value = look[key];
  return typeof value === "number" && Number.isFinite(value) ? value : invalid(slot, key);
}
function colorList(look: Look, slot: DrawnSlot, key: string): readonly string[] {
  const value = look[key];
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? Object.freeze([...value])
    : invalid(slot, key);
}
function fade(look: Look, slot: DrawnSlot): RibbonFade {
  return RIBBON_FADES.find((entry) => entry === look.fade) ?? invalid(slot, "fade");
}

/**
 * The look drawn for one slot: the equipped item's look over the slot default, with the family's calm
 * overrides on top when `calm` (reduced motion or low graphics). An empty slot is the default as it is: the
 * game's own look keeps its own reduced-motion handling.
 */
function resolveLook(
  catalog: CosmeticCatalog,
  loadout: Loadout,
  slotId: DrawnSlot,
  calm: boolean,
): Readonly<{ look: Look; worn: boolean }> {
  const slot = catalog.slots.find((entry) => entry.id === slotId);
  if (!slot) throw new TypeError(`cosmetic slot ${slotId} is missing from the catalog`);
  const itemId = ownValue(loadout, slotId);
  const item = catalog.items.find((entry) => entry.id === itemId && entry.slot === slotId);
  if (!item) return { look: slot.default, worn: false };
  const calmLook = calm ? (catalog.families.find((family) => family.id === slot.family)?.calm ?? {}) : {};
  return { look: { ...slot.default, ...item.look, ...calmLook }, worn: true };
}

export function resolveCosmeticStyles(catalog: CosmeticCatalog, loadout: Loadout, calm: boolean): CosmeticStyles {
  const blade = resolveLook(catalog, loadout, "blade", calm);
  const trail = resolveLook(catalog, loadout, "trail", calm);
  const spark = resolveLook(catalog, loadout, "spark", calm);
  return Object.freeze({
    blade: Object.freeze({ worn: blade.worn, glow: color(blade.look, "blade", "glow") }),
    trail: Object.freeze({
      worn: trail.worn,
      colors: colorList(trail.look, "trail", "colors"),
      widthScale: amount(trail.look, "trail", "widthScale"),
      glow: amount(trail.look, "trail", "glow"),
      fade: fade(trail.look, "trail"),
    }),
    spark: Object.freeze({
      worn: spark.worn,
      colors: colorList(spark.look, "spark", "colors"),
      countScale: amount(spark.look, "spark", "countScale"),
    }),
  });
}

/** What a draw routine asks for: the styles of whoever owns the thing being drawn. */
export interface CosmeticLooks {
  /** The default look, worn by nobody: the game's own look. */
  readonly defaults: CosmeticStyles;
  /** The wearer's styles when `owner` is the wearer, the defaults for every other owner. */
  of(owner: object): CosmeticStyles;
  /** The wearer's styles, or the defaults while nobody wears anything or an authored beat is playing. */
  worn(): CosmeticStyles;
}

/** The one place a loadout is put on: who wears it, and whether an authored beat has taken the look over. */
export interface CosmeticWardrobe extends CosmeticLooks {
  /** Puts `loadout` on `owner` (the local player's blade, at run start). */
  wear(owner: object, loadout: Loadout): void;
  /**
   * An authored moment (a story or cinematic beat that sets the blade's look, such as the finale's restored
   * trail) wins over the cosmetic while it plays; the cosmetic applies again when it ends.
   */
  authored(active: boolean): void;
}

/** `calm` is read on every query, so a settings change applies on the next frame. */
export function createCosmeticWardrobe(catalog: CosmeticCatalog, calm: () => boolean): CosmeticWardrobe {
  const defaults = resolveCosmeticStyles(catalog, {}, false);
  let wearer: object | null = null;
  let styles = { lively: defaults, calm: defaults };
  let authoredBeat = false;
  const worn = (): CosmeticStyles => (authoredBeat ? defaults : calm() ? styles.calm : styles.lively);
  return {
    defaults,
    of: (owner) => (owner === wearer ? worn() : defaults),
    worn,
    wear(owner, loadout) {
      wearer = owner;
      styles = {
        lively: resolveCosmeticStyles(catalog, loadout, false),
        calm: resolveCosmeticStyles(catalog, loadout, true),
      };
    },
    authored(active) {
      authoredBeat = active;
    },
  };
}
