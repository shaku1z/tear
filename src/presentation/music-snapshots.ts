import type { MusicArtView, MusicScreenView, SettingRowView } from "./screens/contracts";
import { menuMusicLabel } from "../audio/music/loadout";
import { stationLabel, stationNote } from "../audio/music/active-station";
import { MUSIC_SCREEN_TITLE } from "../audio/music/settings";
import type { MusicLibrary } from "../audio/music/library";
import type { MusicRoutingManifest, MusicRoutingRule } from "../audio/music/music-routing-types";
import { STAGES } from "../gameplay/stages";
import { bossName } from "../gameplay/run/content-director";

const musicModeNotes: Readonly<Record<string, string>> = {
  adaptive: "LAYERS FOLLOW THE FIGHT",
  full: "EVERY LAYER, ALWAYS",
  calm: "STAY RELAXED — NEVER ESCALATES",
  dynamic: "BARER LULLS, BIGGER PEAKS",
};
const musicModeNote = (mode: string | undefined): string =>
  musicModeNotes[mode ?? "adaptive"] ?? "LAYERS FOLLOW THE FIGHT";

/** Player wording for the station names the audio layer owns ("canonical" is the game's own choice). */
export function playerStationLabel(id: string): string {
  return id === "canonical" ? "AUTOMATIC" : stationLabel(id);
}

/** "the-verdant-sanctum" reads as "The Verdant Sanctum": routing biome ids are the stage names, hyphenated. */
const biomeLabel = (biome: string): string =>
  biome
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
const slug = (name: string): string => name.toLowerCase().replace(/\s+/gu, "-");

/** The rules that play a song, highest priority first; a weighted pool counts for each of its songs. */
function musicRoutes(workId: string, routing: Pick<MusicRoutingManifest, "rules">): readonly MusicRoutingRule[] {
  const plays = (rule: MusicRoutingRule): boolean =>
    rule.selection.type === "primary"
      ? rule.selection.workId === workId
      : rule.selection.entries.some((entry) => entry.workId === workId);
  return [...routing.rules].filter(plays).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

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

/** A song's art: the hue and chapter symbol of the stage it plays in (by biome, then by boss), if any. */
function songArt(workId: string, routing: MusicRoutingManifest): MusicArtView {
  for (const { match } of musicRoutes(workId, routing)) {
    const stage = STAGES.find((entry) => slug(entry.name) === match.biome || entry.boss === match.bossId);
    if (stage) return { hue: stage.accent, glyph: stage.chapter.symbol };
  }
  return null;
}

export interface MusicPlaybackSettings {
  readonly station?: string;
  readonly menuMusic?: string;
  readonly musicMode?: string;
}

/** The music settings rows (they moved here from SETTINGS): station, menu music and soundtrack behavior. */
export function buildMusicPlaybackRows(settings: MusicPlaybackSettings): readonly SettingRowView[] {
  return [
    {
      key: "station",
      label: "Station",
      value: playerStationLabel(settings.station ?? "canonical"),
      kind: "cycle",
      note: stationNote(settings.station ?? "canonical"),
    },
    {
      key: "menuMusic",
      label: "Menu music",
      value: menuMusicLabel(settings.menuMusic ?? "default"),
      kind: "cycle",
      note: "PLAYS ON THE MENUS",
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

export interface MusicScreenSource {
  readonly settings: MusicPlaybackSettings;
  readonly library: MusicLibrary | null;
  readonly nowPlaying: Readonly<{ workId: string; title: string }>;
  readonly preview: string | null;
  readonly bossName?: (id: string) => string;
}

export function buildMusicScreenView(source: MusicScreenSource): MusicScreenView {
  const { library, nowPlaying, preview } = source;
  const songs = (library?.songs ?? []).map((song, index) => ({
    id: song.id,
    number: index + 1,
    title: song.title,
    where: library ? musicWherePlays(song.id, library.routing, source.bossName) : "",
    art: library ? songArt(song.id, library.routing) : null,
    previewing: song.id === preview,
    playing: song.id === nowPlaying.workId,
  }));
  const playing = songs.find((song) => song.playing);
  return {
    id: "music",
    tab: "songs",
    title: MUSIC_SCREEN_TITLE,
    subtitle: library ? `${String(songs.length)} songs · Tear soundtrack` : "Loading the soundtrack…",
    nowPlaying: nowPlaying.workId
      ? {
          title: nowPlaying.title,
          where: playing?.where ?? "",
          art: playing?.art ?? null,
          previewing: preview !== null && preview === nowPlaying.workId,
        }
      : null,
    songs,
    loading: library === null,
    playback: buildMusicPlaybackRows(source.settings),
  };
}
