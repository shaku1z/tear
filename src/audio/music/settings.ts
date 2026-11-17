/** The player-facing name of the music screen; renaming it is this one line. */
export const MUSIC_SCREEN_TITLE = "MUSIC" as const;

/**
 * Settings tabs that used to hold the music rows ("signal" is the older name).
 * Old links to them open the MUSIC screen where that is possible, otherwise AUDIO.
 */
export function isLegacyMusicSettingsTab(tab: string | null | undefined): boolean {
  return tab === "music" || tab === "signal";
}

/** Accept old bookmarks/debug inputs: a legacy music tab lands on AUDIO inside Settings. */
export function normalizeMusicSettingsTab(tab: string | null | undefined): string {
  return isLegacyMusicSettingsTab(tab) ? "audio" : (tab ?? "general");
}
