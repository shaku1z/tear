/**
 * What the player picked to hear: the game's own choice, one song, or a Radio channel. One saved
 * value (`settings.menuMusic`) and one store, read by both music slots: the menu slot and, during
 * runs, the gameplay slot (the boss, victory and defeat cues still take over). A MUSIC-screen
 * preview is a temporary source on the menu slot (`preview.ts`).
 *
 * A pick the player cannot hear right now (a song they have not found, a channel hidden for them,
 * an id this build does not know) plays as the default, and the saved value is left alone, so an
 * old save needs no migration and a pick comes back once it can be heard.
 */
import { conditionMet, type ProgressFacts } from "../../domain/unlock-condition";
import type { MusicUnlock } from "./catalog";
import type { MusicLibrary } from "./library";
import { tunableChannels, type RadioListener, type TunableChannel } from "./radio";

export type MusicSource =
  | { readonly kind: "default" }
  | { readonly kind: "song"; readonly workId: string }
  | { readonly kind: "channel"; readonly channelId: string };

export const DEFAULT_MUSIC_SOURCE: MusicSource = Object.freeze({ kind: "default" });

const CHANNEL_PREFIX = "channel:";
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;

/** A saved value as a source: `default`, a song's id, or `channel:<id>`; anything else is the default. */
export function parseMusicSource(value: unknown): MusicSource {
  if (typeof value !== "string" || value === "default") return DEFAULT_MUSIC_SOURCE;
  if (value.startsWith(CHANNEL_PREFIX)) {
    const channelId = value.slice(CHANNEL_PREFIX.length);
    return ID.test(channelId) ? Object.freeze({ kind: "channel", channelId }) : DEFAULT_MUSIC_SOURCE;
  }
  return ID.test(value) ? Object.freeze({ kind: "song", workId: value }) : DEFAULT_MUSIC_SOURCE;
}

/** The value a source is saved as; `parseMusicSource` reads it back. */
export function musicSourceValue(source: MusicSource): string {
  if (source.kind === "song") return source.workId;
  if (source.kind === "channel") return `${CHANNEL_PREFIX}${source.channelId}`;
  return "default";
}

let picked: MusicSource = DEFAULT_MUSIC_SOURCE;
const listeners = new Set<() => void>();

/** Sets the pick from its saved value. */
export function setMusicSource(value: string): void {
  const next = parseMusicSource(value);
  if (musicSourceValue(next) === musicSourceValue(picked)) return;
  picked = next;
  for (const listener of listeners) listener();
}

/** The pick as saved, before asking whether the player can hear it (see `heardSource`). */
export function getMusicSource(): MusicSource {
  return picked;
}

export function onMusicSourceChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether a song with this unlock has been found, by these facts. An unreadable unlock never is. */
export function musicUnlocked(unlock: MusicUnlock, facts: ProgressFacts | null): boolean {
  if (unlock.type === "unreadable") return false;
  // Before saved progress is known, only songs that need nothing count as found.
  return facts === null ? unlock.type === "default" : conditionMet(unlock, facts);
}

let progressFacts: (() => ProgressFacts) | null = null;

/** Composition hands over the player's live saved progress, so the audio layer never reads the profile. */
export function setMusicProgressFacts(provider: (() => ProgressFacts) | null): void {
  progressFacts = provider;
  for (const listener of listeners) listener();
}

/** The player as the Radio and the pick see them: the songs they have found, and their playlists. */
export function musicListener(library: Pick<MusicLibrary, "songs">): RadioListener {
  const facts = progressFacts?.() ?? null;
  return {
    found: (songId) => {
      const song = library.songs.find((entry) => entry.id === songId);
      return song !== undefined && musicUnlocked(song.unlock, facts);
    },
    // Playlists arrive with the Playlist screen; until then a playlist rule hides its channel.
    playlist: () => null,
  };
}

/** The channels this player can tune to now. */
export function playerChannels(library: Pick<MusicLibrary, "songs" | "radio">): readonly TunableChannel[] {
  return tunableChannels(library.radio, library.songs, musicListener(library));
}

const nextSongListeners = new Set<() => void>();

/** The transport's Next on a Radio channel: the backend moves the channel to its next song. */
export function requestNextSong(): void {
  for (const listener of nextSongListeners) listener();
}

export function onNextSongRequest(listener: () => void): () => void {
  nextSongListeners.add(listener);
  return () => nextSongListeners.delete(listener);
}

/** Every pick the player can make now, as saved values: the default, each channel, each song they have found. */
export function musicPickChoices(library: Pick<MusicLibrary, "songs" | "radio"> | null): readonly string[] {
  if (library === null) return ["default"];
  const listener = musicListener(library);
  return [
    "default",
    ...playerChannels(library).map(({ channel }) => musicSourceValue({ kind: "channel", channelId: channel.id })),
    ...library.songs.filter((song) => listener.found(song.id)).map((song) => song.id),
  ];
}

/** The pick as the player can hear it now; one they cannot is the default. */
export function heardSource(
  source: MusicSource,
  library: Pick<MusicLibrary, "songs" | "radio"> | null,
): MusicSource {
  if (source.kind === "default" || library === null) return DEFAULT_MUSIC_SOURCE;
  if (source.kind === "song") return musicListener(library).found(source.workId) ? source : DEFAULT_MUSIC_SOURCE;
  return playerChannels(library).some(({ channel }) => channel.id === source.channelId) ? source : DEFAULT_MUSIC_SOURCE;
}
