/**
 * THE SIGNAL — Music Loadout (R2).
 *
 * Assigns music to a context slot. R2 ships the `main-menu` slot; later steps add
 * gameplay / boss / victory and the advanced per-biome matrix. Kept as a small
 * shared store (like `music-mode`) so settings never imports the audio backend.
 */

/** `default` means "let the game decide" (canonical routing). */
export const MENU_MUSIC_DEFAULT = "default";

/** Work ids selectable for the shell/menu slot, in cycle order. */
export const MENU_MUSIC_CHOICES = [
  MENU_MUSIC_DEFAULT,
  "fillet",
  "shopkeeper",
  "slicing-life-1",
  "slicing-life-2",
  "beserker",
  "the-source",
] as const;

export type MenuMusicChoice = (typeof MENU_MUSIC_CHOICES)[number];

const LABELS: Readonly<Record<string, string>> = {
  default: "DEFAULT",
  fillet: "FILLET",
  shopkeeper: "SHOPKEEPER",
  "slicing-life-1": "SLICING LIFE",
  "slicing-life-2": "SLICING LIFE II",
  beserker: "BESERKER",
  "the-source": "THE SOURCE",
};

export function menuMusicLabel(choice: string): string {
  return LABELS[choice] ?? choice.toUpperCase();
}

export function isMenuMusicChoice(value: unknown): value is MenuMusicChoice {
  return typeof value === "string" && (MENU_MUSIC_CHOICES as readonly string[]).includes(value);
}

let menuWorkId: MenuMusicChoice = MENU_MUSIC_DEFAULT;
const listeners = new Set<() => void>();

export function setMenuMusic(choice: string): void {
  const next = isMenuMusicChoice(choice) ? choice : MENU_MUSIC_DEFAULT;
  if (next === menuWorkId) return;
  menuWorkId = next;
  for (const listener of listeners) listener();
}

export function getMenuMusic(): MenuMusicChoice {
  return menuWorkId;
}

export function onLoadoutChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Resolve the shell/menu slot to a cue id. Work ids and cue ids are 1:1 in the
 * current catalog, so a selected work maps straight onto its adaptive cue.
 */
export function resolveMenuCueId(defaultCueId: string, isLoaded: (cueId: string) => boolean): string {
  if (menuWorkId === MENU_MUSIC_DEFAULT) return defaultCueId;
  return isLoaded(menuWorkId) ? menuWorkId : defaultCueId;
}
