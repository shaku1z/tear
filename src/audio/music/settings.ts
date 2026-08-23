/** Canonical settings route for the player-facing Music surface. */
export const MUSIC_SETTINGS_TAB = "music" as const;
export const LEGACY_MUSIC_SETTINGS_TAB = "signal" as const;

/** Accept old bookmarks/debug inputs while keeping all new navigation canonical. */
export function normalizeMusicSettingsTab(tab: string | null | undefined): string {
  return tab === LEGACY_MUSIC_SETTINGS_TAB ? MUSIC_SETTINGS_TAB : tab ?? "general";
}
