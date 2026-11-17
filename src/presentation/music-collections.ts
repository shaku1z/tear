import type { MusicCollectionView, MusicCoverView, MusicShelfView, MusicSongView } from "./screens/contracts";
import type { MusicRoutingManifest, MusicRoutingRule } from "../audio/music/music-routing-types";
import { STAGES } from "../gameplay/stages";

/** The stage facts the collections need: its name, boss, hue and chapter glyph. */
export interface MusicStageFacts {
  readonly name: string;
  readonly boss: string;
  readonly accent: string;
  readonly glyph: string;
}

/** The campaign's stages in order, as the MUSIC screen pictures them. */
export const CAMPAIGN_STAGES: readonly MusicStageFacts[] = STAGES.map((stage) => ({
  name: stage.name,
  boss: stage.boss,
  accent: stage.accent,
  glyph: stage.chapter.symbol,
}));

/** "The Verdant Sanctum" is routed as "the-verdant-sanctum". */
export const stageSlug = (name: string): string => name.toLowerCase().replace(/\s+/gu, "-");

/** The id of a stage's collection, as the rail and the Stages shelf open it. */
export const stageCollectionId = (stage: MusicStageFacts): string => `stage:${stageSlug(stage.name)}`;

/** The rules that play a song, highest priority first; a weighted pool counts for each of its songs. */
export function musicRoutes(workId: string, routing: Pick<MusicRoutingManifest, "rules">): readonly MusicRoutingRule[] {
  const plays = (rule: MusicRoutingRule): boolean =>
    rule.selection.type === "primary"
      ? rule.selection.workId === workId
      : rule.selection.entries.some((entry) => entry.workId === workId);
  return [...routing.rules].filter(plays).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/** The stage a song belongs to: the first of its routes that names a stage's biome or boss. */
export function songStage(
  workId: string,
  routing: Pick<MusicRoutingManifest, "rules">,
  stages: readonly MusicStageFacts[] = CAMPAIGN_STAGES,
): MusicStageFacts | null {
  for (const { match } of musicRoutes(workId, routing)) {
    const stage = stages.find((entry) => stageSlug(entry.name) === match.biome || entry.boss === match.bossId);
    if (stage) return stage;
  }
  return null;
}

const isBossSong = (workId: string, routing: Pick<MusicRoutingManifest, "rules">): boolean =>
  musicRoutes(workId, routing).some((rule) => Boolean(rule.match.bossId));

/** A mixed collection's cover: up to four bands of its members' distinct hues, one glyph. */
function splitCover(songs: readonly MusicSongView[], glyph: string): MusicCoverView {
  const hues: string[] = [];
  for (const song of songs) {
    const hue = song.art?.hues[0];
    if (hue && !hues.includes(hue)) hues.push(hue);
  }
  return hues.length === 0 ? null : { hues: hues.slice(0, 4), glyph };
}

const total = (songs: readonly MusicSongView[]): number => songs.reduce((sum, song) => sum + (song.seconds ?? 0), 0);

function collection(
  id: string,
  title: string,
  kicker: string,
  cover: MusicCoverView,
  songs: readonly MusicSongView[],
): MusicCollectionView {
  return { id, title, kicker, cover, songs, seconds: total(songs) };
}

export interface MusicCollections {
  readonly all: MusicCollectionView;
  /** Stages with at least one song, in campaign order. */
  readonly stages: readonly MusicCollectionView[];
  readonly bosses: MusicCollectionView;
  readonly menus: MusicCollectionView;
}

/**
 * Every collection, built from the catalog and the routing (never hand-listed): the whole
 * soundtrack, one per stage (its gameplay songs, then its boss song), the boss themes and the
 * songs that play outside the stages.
 */
export function buildMusicCollections(
  songs: readonly MusicSongView[],
  routing: Pick<MusicRoutingManifest, "rules">,
  stages: readonly MusicStageFacts[] = CAMPAIGN_STAGES,
): MusicCollections {
  const stageOf = new Map(songs.map((song) => [song.id, songStage(song.id, routing, stages)]));
  const stageCollections = stages.flatMap((stage) => {
    const members = songs
      .filter((song) => stageOf.get(song.id) === stage)
      .sort((a, b) => Number(isBossSong(a.id, routing)) - Number(isBossSong(b.id, routing)));
    if (members.length === 0) return [];
    const cover = { hues: [stage.accent], glyph: stage.glyph };
    return [collection(stageCollectionId(stage), stage.name, "Stage", cover, members)];
  });
  const bosses = songs.filter((song) => isBossSong(song.id, routing));
  const menus = songs.filter((song) => !stageOf.get(song.id));
  return {
    all: collection("all", "TEAR: BLADE", "Soundtrack", splitCover(songs, "♪"), songs),
    stages: stageCollections,
    bosses: collection("bosses", "Boss themes", "Collection", splitCover(bosses, "◆"), bosses),
    menus: collection("menus", "Menus & between runs", "Collection", null, menus),
  };
}

/** Every collection a page can open, by id. */
export function findMusicCollection(collections: MusicCollections, id: string): MusicCollectionView | null {
  const every = [collections.all, collections.bosses, collections.menus, ...collections.stages];
  return every.find((entry) => entry.id === id) ?? null;
}

/**
 * Home, top to bottom: what is playing now, the stages to open, the boss themes and the songs
 * between runs. Empty collections drop out; the whole soundtrack is the page's last row.
 */
export function buildMusicShelves(collections: MusicCollections, playing: MusicSongView | null): MusicShelfView[] {
  const queue = collections.all.songs.map((song) => song.id);
  const shelves: MusicShelfView[] = [{ layout: "feature", heading: "Now playing", song: playing, queue }];
  if (collections.stages.length > 0)
    shelves.push({ layout: "tiles", heading: "Stages", collections: collections.stages });
  for (const group of [collections.bosses, collections.menus])
    if (group.songs.length > 0)
      shelves.push({ layout: "rows", heading: group.title, open: group.id, songs: group.songs });
  return shelves;
}
