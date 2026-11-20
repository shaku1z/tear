// The Radio: channels are catalog rules read by one evaluator, a rule the game cannot honour hides
// its channel, and a channel plays the songs it holds back to back in whole loops.
import { describe, expect, it } from "vitest";
import { catalog as publishedCatalog } from "../../public/audio/music.json";
import { parseMusicCatalog } from "../../src/audio/music/catalog";
import { getMusicLibrary, publishMusicLibrary } from "../../src/audio/music/library";
import { validateMusicRoutingManifest } from "../../src/audio/music/music-routing-validate";
import { routing } from "../../public/audio/music.json";
import {
  advance,
  channelSongs,
  currentSong,
  DEFAULT_RADIO_SONG_SECONDS,
  parseRadioProgramme,
  radioPlaySeconds,
  shuffleSongs,
  tuneIn,
  tunableChannels,
  upNext,
  type RadioListener,
  type RadioSong,
} from "../../src/audio/music/radio";

const songs: readonly RadioSong[] = [
  { id: "fillet", mood: "calm", tags: ["calm", "menu"], seconds: 34.9 },
  { id: "beserker", mood: "intense", tags: ["combat", "boss"], seconds: 30.2 },
  { id: "spring", mood: "calm", tags: ["verdant"], seconds: 23.03 },
  { id: "the-source", mood: "intense", tags: ["boss", "dark"], seconds: 44 },
  { id: "steady", tags: ["calm"], seconds: 24.5 },
];

// The channels as tear-music publishes them (songs/catalog.json), plus the playlist rule it is
// proposed to move My mix to.
const programme = parseRadioProgramme(
  [
    { id: "all-songs", name: "All songs", description: "Every song you have found.", rule: {} },
    { id: "calm", name: "Calm", description: "The gentle songs.", rule: { mood: "calm" } },
    { id: "intense", name: "Intense", description: "The fast, heavy songs.", rule: { mood: "intense" } },
    { id: "bosses", name: "Bosses", description: "The boss themes.", rule: { tagsAny: ["boss"] } },
    { id: "starred", name: "Starred", description: "Old rule.", rule: { starred: true } },
    { id: "my-mix", name: "My mix", description: "The songs you add.", rule: { playlist: "my-mix" } },
  ],
  { songSeconds: 90 },
);

const listener = (found: readonly string[], playlists: Readonly<Record<string, readonly string[]>> = {}) =>
  ({
    found: (id) => found.includes(id),
    playlist: (id) => playlists[id] ?? null,
  }) satisfies RadioListener;
const everyone = listener(songs.map((song) => song.id));
const ids = (list: readonly { readonly id: string }[] | null): readonly string[] | null =>
  list === null ? null : list.map((item) => item.id);
function channel(id: string) {
  const found = programme.channels.find((entry) => entry.id === id);
  if (!found) throw new Error(`no channel ${id}`);
  return found;
}

describe("the Radio programme is read from the catalog and validated", () => {
  it("keeps well-formed channels in order with the catalog's song length", () => {
    expect(programme.channels.map((entry) => entry.id)).toEqual([
      "all-songs",
      "calm",
      "intense",
      "bosses",
      "starred",
      "my-mix",
    ]);
    expect(programme.songSeconds).toBe(90);
  });

  it("drops malformed and repeated channels instead of failing the music index", () => {
    const parsed = parseRadioProgramme(
      [
        { id: "ok", name: "OK", rule: {} },
        { id: "ok", name: "Again", rule: {} },
        { id: "Bad Id", name: "x", rule: {} },
        { id: "no-name", rule: {} },
        { id: "no-rule", name: "x" },
        "not a channel",
      ],
      { songSeconds: -1 },
    );
    expect(parsed.channels.map((entry) => entry.id)).toEqual(["ok"]);
    expect(parsed.channels[0]?.description).toBe("");
    expect(parsed.songSeconds).toBe(DEFAULT_RADIO_SONG_SECONDS);
  });

  it("has no channels for a catalog from before the Radio", () => {
    expect(parseRadioProgramme(undefined, undefined).channels).toEqual([]);
  });
});

describe("a channel is a rule over the songs a player has found", () => {
  it("selects by mood and tag, among found songs only", () => {
    expect(ids(channelSongs(channel("calm"), songs, everyone))).toEqual(["fillet", "spring"]);
    expect(ids(channelSongs(channel("bosses"), songs, everyone))).toEqual(["beserker", "the-source"]);
    expect(ids(channelSongs(channel("all-songs"), songs, listener(["fillet"])))).toEqual(["fillet"]);
  });

  it("leaves a song without a mood to All songs and tag channels", () => {
    expect(ids(channelSongs(channel("calm"), songs, everyone))).not.toContain("steady");
    expect(ids(channelSongs(channel("all-songs"), songs, everyone))).toContain("steady");
  });

  it("reads a playlist rule through the listener, and cannot honour it without that playlist", () => {
    expect(ids(channelSongs(channel("my-mix"), songs, everyone))).toBeNull();
    const withMix = listener(
      songs.map((song) => song.id),
      { "my-mix": ["spring", "steady", "unknown"] },
    );
    expect(ids(channelSongs(channel("my-mix"), songs, withMix))).toEqual(["spring", "steady"]);
  });

  it("cannot honour a rule key it does not know or a malformed value, rather than playing every song", () => {
    expect(channelSongs(channel("starred"), songs, everyone)).toBeNull();
    const malformed = parseRadioProgramme(
      [
        { id: "a", name: "A", rule: { mood: 3 } },
        { id: "b", name: "B", rule: { tagsAny: [] } },
        { id: "c", name: "C", rule: { mood: "calm", extra: true } },
      ],
      undefined,
    );
    for (const entry of malformed.channels) expect(channelSongs(entry, songs, everyone), entry.id).toBeNull();
  });

  it("shows only channels it can honour that hold a song, so no channel is dead", () => {
    const shown = tunableChannels(programme, songs, listener(["fillet"]));
    expect(shown.map((entry) => entry.channel.id)).toEqual(["all-songs", "calm"]);
    expect(shown[1]?.songs.map((song) => song.id)).toEqual(["fillet"]);
  });
});

describe("a channel plays songs back to back", () => {
  it("keeps each song on for about the catalog's length, in whole loops", () => {
    expect(radioPlaySeconds(23.03)).toBeCloseTo(23.03 * 5);
    expect(radioPlaySeconds(44)).toBe(132);
    expect(radioPlaySeconds(300)).toBe(300);
    expect(radioPlaySeconds(undefined)).toBe(DEFAULT_RADIO_SONG_SECONDS);
    expect(radioPlaySeconds(30, 90)).toBe(90);
  });

  it("shuffles the same way for the same seed and deals every song", () => {
    const all = songs.map((song) => song.id);
    expect(shuffleSongs(all, 7)).toEqual(shuffleSongs(all, 7));
    expect([...shuffleSongs(all, 7)].sort()).toEqual([...all].sort());
  });

  it("plays in order, wraps round, and never repeats a song straight after itself", () => {
    const list = ["a", "b", "c"];
    let state = tuneIn("calm", list, false, 1);
    const heard = [currentSong(state)];
    for (let step = 0; step < 4; step += 1) {
      state = advance(state, list);
      heard.push(currentSong(state));
    }
    expect(heard).toEqual(["a", "b", "c", "a", "b"]);

    let shuffled = tuneIn("all-songs", list, true, 3);
    for (let step = 0; step < 30; step += 1) {
      const before = currentSong(shuffled);
      shuffled = advance(shuffled, list);
      expect(currentSong(shuffled)).not.toBe(before);
    }
  });

  it("says what is up next without moving on", () => {
    const state = tuneIn("calm", ["a", "b"], false, 1);
    expect(upNext(state, ["a", "b"])).toBe("b");
    expect(currentSong(state)).toBe("a");
  });

  it("drops a song that leaves the channel and carries on", () => {
    const state = tuneIn("my-mix", ["a", "b", "c"], false, 1);
    expect(currentSong(advance(state, ["a", "c"]))).toBe("c");
  });
});

describe("the music library carries the Radio", () => {
  it("publishes each song's mood, tags, unlock and cue length with the programme", () => {
    const catalog = parseMusicCatalog({
      format: "tear-music-catalog",
      version: 1,
      works: [
        { id: "fillet", title: "Fillet", tags: ["calm"], mood: "calm", unlock: { type: "default" }, versions: {} },
      ],
      channels: [{ id: "calm", name: "Calm", rule: { mood: "calm" } }],
      radio: { songSeconds: 90 },
    });
    publishMusicLibrary(catalog, validateMusicRoutingManifest(routing), { fillet: 26.25 });
    const library = getMusicLibrary();
    expect(library?.songs).toEqual([
      { id: "fillet", title: "Fillet", tags: ["calm"], mood: "calm", unlock: { type: "default" }, seconds: 26.25 },
    ]);
    expect(library?.radio.channels.map((entry) => entry.id)).toEqual(["calm"]);
    expect(library?.radio.songSeconds).toBe(90);
  });

  it("reads a catalog with retired stations and no channels as a Radio with no channels", () => {
    const catalog = parseMusicCatalog({
      format: "tear-music-catalog",
      version: 1,
      works: [
        { id: "fillet", title: "Fillet", tags: [], stations: ["still"], unlock: { type: "default" }, versions: {} },
      ],
      stations: [],
    });
    publishMusicLibrary(catalog, validateMusicRoutingManifest(routing));
    expect(getMusicLibrary()?.radio).toEqual({ channels: [], songSeconds: DEFAULT_RADIO_SONG_SECONDS });
  });

  it("reads the shipped index, with or without channels", () => {
    const shipped = parseMusicCatalog(publishedCatalog);
    expect(() => parseRadioProgramme(shipped.channels, shipped.radio)).not.toThrow();
  });
});
