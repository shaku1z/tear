import type {
  MusicChannelView,
  MusicCoverView,
  MusicPage,
  MusicScreenView,
  MusicSongView,
  SettingRowView,
} from "./screens/contracts";
import { heardSource, parseMusicSource, playerChannels, type MusicSource } from "../audio/music/music-source";
import { MUSIC_SCREEN_TITLE } from "../audio/music/settings";
import type { MusicLibrary } from "../audio/music/library";
import type { MusicRoutingManifest, MusicRoutingRule } from "../audio/music/music-routing-types";
import { bossName } from "../gameplay/run/content-director";
import {
  buildMusicCollections,
  buildMusicShelves,
  findMusicCollection,
  musicRoutes,
  songStage,
  splitCover,
} from "./music-collections";
import { stageCover } from "./music-cover-art";

const musicModeNotes: Readonly<Record<string, string>> = {
  adaptive: "LAYERS FOLLOW THE FIGHT",
  full: "EVERY LAYER, ALWAYS",
  calm: "STAY RELAXED — NEVER ESCALATES",
  dynamic: "BARER LULLS, BIGGER PEAKS",
};
const musicModeNote = (mode: string | undefined): string =>
  musicModeNotes[mode ?? "adaptive"] ?? "LAYERS FOLLOW THE FIGHT";

/**
 * The player's music pick in player words: "DEFAULT", a song's title, or "<CHANNEL> · RADIO". A
 * pick they cannot hear right now reads as the default, which is what plays.
 */
export function musicPickLabel(value: string | undefined, library: MusicLibrary | null): string {
  const source = heardSource(parseMusicSource(value), library);
  if (source.kind === "song")
    return (library?.songs.find((song) => song.id === source.workId)?.title ?? "").toUpperCase();
  if (source.kind === "channel") {
    const name = library?.radio.channels.find((channel) => channel.id === source.channelId)?.name ?? "";
    return `${name.toUpperCase()} · RADIO`;
  }
  return "DEFAULT";
}

/** "the-verdant-sanctum" reads as "The Verdant Sanctum": routing biome ids are the stage names, hyphenated. */
const biomeLabel = (biome: string): string =>
  biome
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
/** Where one routing rule plays its songs, in player words. */
function rulePlace(rule: MusicRoutingRule, names: (id: string) => string): string {
  const { match } = rule;
  if (match.bossId) return `Boss · ${names(match.bossId) || biomeLabel(match.bossId)}`;
  if (match.biome) return biomeLabel(match.biome);
  return match.scene === "menu" ? "Menu" : biomeLabel(match.scene ?? "");
}

/**
 * Where a song plays in the game, from the routing rules: the biome, "Boss · <name>", or
 * "Menu" for the menu/default song, joined with " · " when it plays in several places,
 * and empty when no rule plays it.
 */
export function musicWherePlays(
  workId: string,
  routing: Pick<MusicRoutingManifest, "defaultWorkId" | "rules">,
  names: (id: string) => string = bossName,
): string {
  const places: string[] = routing.defaultWorkId === workId ? ["Menu"] : [];
  for (const rule of musicRoutes(workId, routing)) {
    const place = rulePlace(rule, names);
    if (place && !places.includes(place)) places.push(place);
  }
  return places.join(" · ");
}

export interface MusicPlaybackSettings {
  readonly menuMusic?: string;
  readonly musicMode?: string;
}

/**
 * The music settings rows (they moved here from SETTINGS): what plays (the pick, in menus and in
 * runs, where a boss still brings its own music) and soundtrack behavior.
 */
export function buildMusicPlaybackRows(
  settings: MusicPlaybackSettings,
  library: MusicLibrary | null,
): readonly SettingRowView[] {
  return [
    {
      key: "menuMusic",
      label: "Music",
      value: musicPickLabel(settings.menuMusic, library),
      kind: "cycle",
      note: "MENUS AND RUNS · BOSSES BRING THEIR OWN",
    },
    {
      key: "musicMode",
      label: "Soundtrack behavior",
      value: (settings.musicMode ?? "adaptive").toUpperCase(),
      kind: "cycle",
      note: musicModeNote(settings.musicMode),
    },
  ];
}

/** A song's art: the hue, chapter glyph and painting of the stage it plays in, if any. */
function songArt(workId: string, routing: MusicRoutingManifest): MusicCoverView {
  const stage = songStage(workId, routing);
  return stage ? stageCover(stage) : null;
}

export interface MusicScreenSource {
  readonly settings: MusicPlaybackSettings;
  readonly library: MusicLibrary | null;
  readonly nowPlaying: Readonly<{
    workId: string;
    title: string;
    since?: number;
    channelId?: string | null;
    channelName?: string | null;
  }>;
  readonly preview: string | null;
  /** The page: "home", "radio", "songs", "settings" or "collection:<id>". */
  readonly page?: string;
  /** The page a collection was opened from; BACK returns there. */
  readonly openedFrom?: string;
  /** The queue the preview started from. */
  readonly queue?: readonly string[];
  /** performance.now(), for the loop position. */
  readonly now?: number;
  readonly bossName?: (id: string) => string;
}

const RAIL: readonly (readonly [string, string])[] = [
  ["home", "Home"],
  ["radio", "Radio"],
  ["songs", "Songs"],
  ["settings", "Settings"],
];

/** The channels the player can tune to, each with how many of their songs it holds and whether it is the pick. */
function radioChannels(
  library: MusicLibrary | null,
  songs: readonly MusicSongView[],
  heard: MusicSource,
): readonly MusicChannelView[] {
  if (library === null) return [];
  return playerChannels(library).map(({ channel, songs: held }) => ({
    id: channel.id,
    name: channel.name,
    description: channel.description,
    songs: held.length,
    cover: splitCover(
      songs.filter((song) => held.some((entry) => entry.id === song.id)),
      "♪",
    ),
    picked: heard.kind === "channel" && heard.channelId === channel.id,
  }));
}

const musicTab = (tab: string) => ({ type: "navigate", to: "music", tab }) as const;

export function buildMusicScreenView(source: MusicScreenSource): MusicScreenView {
  const { library, nowPlaying, preview } = source;
  const songs: MusicSongView[] = (library?.songs ?? []).map((song, index) => ({
    id: song.id,
    number: index + 1,
    title: song.title,
    where: library ? musicWherePlays(song.id, library.routing, source.bossName) : "",
    art: library ? songArt(song.id, library.routing) : null,
    seconds: song.seconds ?? null,
    previewing: song.id === preview,
    playing: song.id === nowPlaying.workId,
  }));
  const collections = library ? buildMusicCollections(songs, library.routing) : null;
  const playing = songs.find((song) => song.playing) ?? null;
  const requested = source.page ?? "home";
  const openedId = requested.startsWith("collection:") ? requested.slice("collection:".length) : null;
  const opened = collections
    ? openedId !== null
      ? findMusicCollection(collections, openedId)
      : requested === "songs"
        ? collections.all
        : null
    : null;
  const radio = radioChannels(library, songs, heardSource(parseMusicSource(source.settings.menuMusic), library));
  const page: MusicPage = opened
    ? "collection"
    : requested === "settings"
      ? "settings"
      : requested === "radio" && radio.length > 0
        ? "radio"
        : "home";
  const railTab = openedId !== null ? "" : page === "home" ? "home" : requested;
  const back = openedId !== null ? musicTab(source.openedFrom ?? "home") : ({ type: "navigate", to: "menu" } as const);
  const seconds = playing?.seconds ?? null;
  const since = nowPlaying.since ?? 0;
  const progress =
    seconds && source.now !== undefined && since > 0 ? (((source.now - since) / 1000) % seconds) / seconds : null;
  const first = collections?.all.songs[0];
  return {
    id: "music",
    page,
    title: MUSIC_SCREEN_TITLE,
    // No channel to tune to, no Radio entry: the rail never offers an empty page.
    rail: RAIL.filter(([id]) => id !== "radio" || radio.length > 0).map(([id, label]) => ({
      id,
      label,
      selected: id === railTab,
    })),
    stages: collections?.stages ?? [],
    shelves: collections ? buildMusicShelves(collections, playing) : [],
    soundtrack: collections?.all ?? null,
    collection: opened,
    radio,
    back,
    nowPlaying: nowPlaying.workId
      ? {
          title: nowPlaying.title,
          where: playing?.where ?? "",
          art: playing?.art ?? null,
          previewing: preview !== null && preview === nowPlaying.workId,
          channel: preview === null ? (nowPlaying.channelName ?? null) : null,
          progress,
        }
      : null,
    canStep: (source.queue?.length ?? 0) > 1,
    radioNext: preview === null && Boolean(nowPlaying.channelId),
    start: collections && first ? { id: first.id, queue: collections.all.songs.map((song) => song.id) } : null,
    songs,
    loading: library === null,
    playback: buildMusicPlaybackRows(source.settings, library),
  };
}
