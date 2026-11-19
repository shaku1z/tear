/**
 * The Radio: channels that play songs back to back. A channel is a rule over songs, published by
 * tear-music in the catalog, so a new song joins its channels by itself and a new channel is one
 * catalog row. Pure logic; playback lives in the stem backend.
 */
import { isRecord } from "../../domain/records";
import { isMusicId } from "../../domain/identifiers";
import { SeededRandom } from "../../domain/random";

/** A channel as the catalog publishes it. Its rule is read by `channelSongs`, the one evaluator. */
export interface RadioChannel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly rule: Readonly<Record<string, unknown>>;
}

/** What the Radio needs to know about a song. */
export interface RadioSong {
  readonly id: string;
  readonly mood?: string;
  readonly tags: readonly string[];
  /** Length of one loop of the song's cue; absent when the cue is missing. */
  readonly seconds?: number;
}

/** What the Radio asks about this player. */
export interface RadioListener {
  /** Songs the player has found; others never play on the Radio. */
  readonly found: (songId: string) => boolean;
  /** A playlist's song ids, or null when there is no such playlist (yet). */
  readonly playlist: (playlistId: string) => readonly string[] | null;
}

/** The Radio as the music index publishes it. */
export interface RadioProgramme {
  readonly channels: readonly RadioChannel[];
  /** How long a channel keeps each song on, before rounding to whole loops. */
  readonly songSeconds: number;
}

/** About two minutes per song when the catalog does not say. */
export const DEFAULT_RADIO_SONG_SECONDS = 120;

const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/**
 * The Radio from the catalog's `channels` and `radio` fields. A malformed channel (or a repeated
 * id) is dropped rather than failing the music index; a catalog from before the Radio has none.
 */
export function parseRadioProgramme(channels: unknown, radio: unknown): RadioProgramme {
  const seen = new Set<string>();
  const parsed = (Array.isArray(channels) ? channels : []).flatMap((value: unknown): RadioChannel[] => {
    if (!isRecord(value) || !isMusicId(value.id) || !text(value.name) || !isRecord(value.rule)) return [];
    if (seen.has(value.id)) return [];
    seen.add(value.id);
    const description = text(value.description) ? value.description : "";
    return [Object.freeze({ id: value.id, name: value.name, description, rule: Object.freeze({ ...value.rule }) })];
  });
  const seconds = isRecord(radio) ? radio.songSeconds : undefined;
  return Object.freeze({
    channels: Object.freeze(parsed),
    songSeconds: typeof seconds === "number" && seconds > 0 ? seconds : DEFAULT_RADIO_SONG_SECONDS,
  });
}

type SongTest = (song: RadioSong) => boolean;

/**
 * Each rule key the game understands, as a test over songs (null when its value is malformed or
 * names nothing this player has). A rule with any other key cannot be honoured, so its channel is
 * hidden instead of playing the wrong songs.
 */
const RULE_KEYS: Readonly<Record<string, (value: unknown, listener: RadioListener) => SongTest | null>> = {
  mood: (value) => (text(value) ? (song) => song.mood === value : null),
  tagsAny: (value) =>
    Array.isArray(value) && value.length > 0 && value.every(text)
      ? (song) => value.some((tag) => song.tags.includes(tag))
      : null,
  playlist: (value, listener) => {
    const ids = text(value) ? listener.playlist(value) : null;
    return ids === null ? null : (song) => ids.includes(song.id);
  },
};

/**
 * The songs a channel holds for this player, among the songs they have found, in catalog order;
 * null when the game cannot honour the channel's rule.
 */
export function channelSongs(
  channel: RadioChannel,
  songs: readonly RadioSong[],
  listener: RadioListener,
): readonly RadioSong[] | null {
  const tests: SongTest[] = [];
  for (const [key, value] of Object.entries(channel.rule)) {
    const test = RULE_KEYS[key]?.(value, listener) ?? null;
    if (test === null) return null;
    tests.push(test);
  }
  return songs.filter((song) => listener.found(song.id) && tests.every((test) => test(song)));
}

/** A channel the player can tune to: one the game can honour with at least one song in it. */
export interface TunableChannel {
  readonly channel: RadioChannel;
  readonly songs: readonly RadioSong[];
}

/** The channels to show, in catalog order; an empty or unreadable channel is hidden, never dead. */
export function tunableChannels(
  programme: RadioProgramme,
  songs: readonly RadioSong[],
  listener: RadioListener,
): readonly TunableChannel[] {
  return programme.channels.flatMap((channel) => {
    const held = channelSongs(channel, songs, listener);
    return held && held.length > 0 ? [{ channel, songs: held }] : [];
  });
}

/** How long a song stays on: the target rounded to whole loops, at least one loop. */
export function radioPlaySeconds(loopSeconds: number | undefined, songSeconds = DEFAULT_RADIO_SONG_SECONDS): number {
  if (loopSeconds === undefined || !(loopSeconds > 0)) return songSeconds;
  return Math.max(1, Math.round(songSeconds / loopSeconds)) * loopSeconds;
}

/** A shuffled order of the song ids; with `avoidFirst`, that song does not open the order. */
export function shuffleSongs(ids: readonly string[], seed: number, avoidFirst?: string): readonly string[] {
  const random = new SeededRandom(seed);
  const order = [...ids];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const pick = random.integer(0, index + 1);
    const here = order[index];
    const there = order[pick];
    if (here === undefined || there === undefined) continue;
    order[index] = there;
    order[pick] = here;
  }
  const [first, second] = order;
  if (avoidFirst !== undefined && first === avoidFirst && second !== undefined) {
    order[0] = second;
    order[1] = first;
  }
  return order;
}

export interface RadioState {
  readonly channelId: string;
  /** The order being played; dealt again when it runs out. */
  readonly order: readonly string[];
  readonly position: number;
  readonly shuffle: boolean;
  readonly seed: number;
}

/** Tune in: the first song of a fresh order. */
export function tuneIn(channelId: string, songIds: readonly string[], shuffle: boolean, seed: number): RadioState {
  return { channelId, order: shuffle ? shuffleSongs(songIds, seed) : [...songIds], position: 0, shuffle, seed };
}

export function currentSong(state: RadioState): string | null {
  return state.order[state.position] ?? null;
}

/**
 * The song after this one (Next uses the same step). At the end of the order a new one is dealt,
 * never opening with the song that just played. Songs the channel no longer holds are dropped.
 */
export function advance(state: RadioState, songIds: readonly string[]): RadioState {
  const held = new Set(songIds);
  const order = state.order.filter((id) => held.has(id));
  const playing = currentSong(state);
  const at = playing === null ? -1 : order.indexOf(playing);
  if (at >= 0 && at + 1 < order.length) return { ...state, order, position: at + 1 };
  const seed = (state.seed + 1) >>> 0;
  const fresh = state.shuffle ? shuffleSongs(songIds, seed, playing ?? undefined) : [...songIds];
  // In order: carry on after the song that just played, wrapping round.
  const start = state.shuffle || playing === null ? 0 : (fresh.indexOf(playing) + 1) % Math.max(1, fresh.length);
  return { ...state, order: fresh, position: start, seed };
}

/** What plays after the current song, without changing anything. */
export function upNext(state: RadioState, songIds: readonly string[]): string | null {
  return currentSong(advance(state, songIds));
}
