import { afterEach, describe, expect, it } from "vitest";
import { catalog, routing } from "../../public/audio/music.json";
import { validateMusicRoutingManifest } from "../../src/audio/music/music-routing-validate";
import type { MusicRoutingManifest } from "../../src/audio/music/music-routing-types";
import {
  getMusicPreview,
  getMusicQueue,
  onMusicPreviewChange,
  setMusicPreview,
  stepMusicPreview,
} from "../../src/audio/music/preview";
import { parseRadioProgramme } from "../../src/audio/music/radio";
import { resolveMenuCueId, setMenuMusic } from "../../src/audio/music/loadout";
import { MUSIC_SCREEN_TITLE } from "../../src/audio/music/settings";
import { buildMusicScreenView, musicWherePlays } from "../../src/presentation/music-snapshots";
import { bossName } from "../../src/gameplay/run/content-director";
import { createSurfaceAvailability } from "../../src/domain/surface-availability";
import { AppStateController } from "../../src/app/interface/app-state-controller";
import { createLiveScreenNavigation } from "../../src/app/interface/live-screen-navigation";

const published = validateMusicRoutingManifest(routing);
const songs = catalog.works.map((work) => ({ id: work.id, title: work.title }));

afterEach(() => {
  setMusicPreview(null);
  setMenuMusic("default");
});

describe("where a song plays", () => {
  it("names the menu, biome and boss routes of the published routing", () => {
    expect(musicWherePlays("fillet", published, bossName)).toBe("Menu");
    expect(musicWherePlays("slicing-life-1", published, bossName)).toBe("The Grounds");
    expect(musicWherePlays("nocturnal-urgency", published, bossName)).toBe("Boss · The Rootbound");
    expect(musicWherePlays("shopkeeper", published, bossName)).toBe("");
  });

  it("counts a weighted pool for each of its songs and joins several places", () => {
    const pool: MusicRoutingManifest = {
      format: "tear-music-routing",
      version: 1,
      defaultWorkId: "fillet",
      rules: [
        {
          id: "verdant",
          match: { biome: "the-verdant-sanctum", scene: "gameplay" },
          selection: {
            type: "weighted-pool",
            entries: [
              { workId: "once-at-a-time", weight: 1 },
              { workId: "spring", weight: 1 },
            ],
          },
        },
        { id: "boss", match: { bossId: "echo", scene: "boss" }, selection: { type: "primary", workId: "spring" } },
      ],
    };
    expect(musicWherePlays("once-at-a-time", pool)).toBe("The Verdant Sanctum");
    expect(musicWherePlays("spring", pool, () => "Echo")).toBe("The Verdant Sanctum · Boss · Echo");
  });
});

const seconds = Object.fromEntries(songs.map((song, index) => [song.id, 20 + index]));
const library = {
  songs: songs.map((song) => ({ ...song, seconds: seconds[song.id] ?? 0 })),
  routing: published,
  radio: parseRadioProgramme(undefined, undefined),
};
const view = (page?: string, extra: Partial<Parameters<typeof buildMusicScreenView>[0]> = {}) =>
  buildMusicScreenView({
    settings: {},
    library,
    nowPlaying: { workId: "fillet", title: "Fillet" },
    preview: "spring",
    bossName,
    ...(page === undefined ? {} : { page }),
    ...extra,
  });

describe("the MUSIC screen view", () => {
  it("lists every catalogued song in catalog order, with its art, loop length and state", () => {
    const home = view();
    expect(home.title).toBe(MUSIC_SCREEN_TITLE);
    expect(home.songs.map((song) => song.title)).toEqual(catalog.works.map((work) => work.title));
    expect(home.songs.map((song) => song.number)).toEqual(catalog.works.map((_, index) => index + 1));
    expect(home.songs.filter((song) => song.previewing).map((song) => song.id)).toEqual(["spring"]);
    expect(home.songs.find((song) => song.playing)?.id).toBe("fillet");
    expect(home.songs.find((song) => song.id === "looking-out")).toMatchObject({
      art: { hues: ["#8b3bd6"], glyph: "◇" },
      seconds: seconds["looking-out"],
    });
    expect(home.nowPlaying).toEqual({ title: "Fillet", where: "Menu", art: null, previewing: false, progress: null });
    expect(home.playback.map((row) => row.key)).toEqual(["station", "menuMusic", "musicMode"]);
  });

  it("builds the collections from the catalog and routing: stages in campaign order, bosses, menus", () => {
    const home = view();
    expect(home.stages.map((stage) => stage.title)).toEqual([
      "The Grounds",
      "The Undercroft",
      "The Crimson Fields",
      "The Verdant Sanctum",
      "The Voidspire",
      "The Tear",
    ]);
    // A stage's page holds its gameplay songs, then its boss song.
    const voidspire = home.stages.find((stage) => stage.id === "stage:the-voidspire");
    expect(voidspire?.songs.map((song) => song.id)).toEqual(["looking-out", "reflection-of-the-bladeless"]);
    expect(voidspire?.seconds).toBe((seconds["looking-out"] ?? 0) + (seconds["reflection-of-the-bladeless"] ?? 0));
    expect(home.shelves.map((shelf) => shelf.layout)).toEqual(["feature", "tiles", "rows", "rows"]);
    const [, , bosses, menus] = home.shelves;
    expect(bosses).toMatchObject({ heading: "Boss themes", open: "bosses" });
    expect(bosses?.layout === "rows" && bosses.songs.map((song) => song.id)).toEqual([
      "reflection-of-the-bladeless",
      "nocturnal-urgency",
    ]);
    expect(menus?.layout === "rows" && menus.songs.map((song) => song.id)).toContain("fillet");
    expect(home.soundtrack?.songs).toHaveLength(14);
    // The boss collection's cover splits into its stages' hues.
    expect(bosses?.layout === "rows" && home.stages.length).toBeTruthy();
  });

  it("opens Home by default, a collection's page with BACK one level up, Songs and Settings", () => {
    expect(view()).toMatchObject({ page: "home", collection: null, back: { type: "navigate", to: "menu" } });
    expect(view().rail.map((entry) => [entry.id, entry.selected])).toEqual([
      ["home", true],
      ["songs", false],
      ["settings", false],
    ]);
    const stage = view("collection:stage:the-voidspire", { openedFrom: "songs" });
    expect(stage.page).toBe("collection");
    expect(stage.collection?.title).toBe("The Voidspire");
    expect(stage.back).toEqual({ type: "navigate", to: "music", tab: "songs" });
    expect(stage.rail.some((entry) => entry.selected)).toBe(false);
    const all = view("songs");
    expect(all).toMatchObject({ page: "collection", back: { type: "navigate", to: "menu" } });
    expect(all.collection?.id).toBe("all");
    expect(view("settings").page).toBe("settings");
    expect(view("collection:nowhere").page).toBe("home");
  });

  it("shows the loop position of what is playing and lets the transport step through a queue", () => {
    const length = seconds.fillet ?? 1;
    const playing = view(undefined, {
      nowPlaying: { workId: "fillet", title: "Fillet", since: 1000 },
      now: 1000 + length * 1500,
      queue: ["fillet", "spring"],
    });
    expect(playing.nowPlaying?.progress).toBeCloseTo(0.5);
    expect(playing.canStep).toBe(true);
    expect(view().canStep).toBe(false);
    expect(view().start).toEqual({ id: songs[0]?.id, queue: songs.map((song) => song.id) });
  });

  it("shows a loading page before the music index arrives", () => {
    const loading = buildMusicScreenView({
      settings: {},
      library: null,
      nowPlaying: { workId: "", title: "—" },
      preview: null,
    });
    expect(loading).toMatchObject({ loading: true, songs: [], nowPlaying: null, shelves: [], soundtrack: null });
  });
});

describe("the preview queue", () => {
  it("steps forward and back through the songs the preview started from, wrapping at the ends", () => {
    setMusicPreview("a", ["a", "b", "c"]);
    expect(getMusicQueue()).toEqual(["a", "b", "c"]);
    stepMusicPreview(1);
    expect(getMusicPreview()).toBe("b");
    stepMusicPreview(-1);
    stepMusicPreview(-1);
    expect(getMusicPreview()).toBe("c");
    stepMusicPreview(1);
    expect(getMusicPreview()).toBe("a");
    setMusicPreview(null);
    expect(getMusicQueue()).toEqual([]);
    stepMusicPreview(1);
    expect(getMusicPreview()).toBeNull();
  });
});

describe("song preview", () => {
  it("makes the shell slot play the previewed song while it is set, then the menu music again", () => {
    const loaded = (id: string): boolean => id !== "missing";
    const changes: string[] = [];
    const stop = onMusicPreviewChange(() => changes.push(String(getMusicPreview())));
    setMenuMusic("shopkeeper");
    expect(resolveMenuCueId("fillet", loaded)).toBe("shopkeeper");
    setMusicPreview("spring");
    expect(resolveMenuCueId("fillet", loaded)).toBe("spring");
    setMusicPreview("spring");
    setMusicPreview("missing");
    expect(resolveMenuCueId("fillet", loaded)).toBe("shopkeeper");
    setMusicPreview(null);
    expect(resolveMenuCueId("fillet", loaded)).toBe("shopkeeper");
    stop();
    expect(changes).toEqual(["spring", "missing", "null"]);
  });

  it("stops when the player leaves the MUSIC screen, but not under the rename overlay", () => {
    const navigation = createLiveScreenNavigation({
      app: new AppStateController(createSurfaceAvailability("release")),
      input: { allowLock: false, discardSemanticInput: () => undefined },
      runScreenFact: () => undefined,
    });
    navigation.setScreen("music");
    setMusicPreview("spring");
    navigation.setScreen("rename");
    expect(getMusicPreview()).toBe("spring");
    navigation.setScreen("music");
    navigation.setScreen("menu");
    expect(getMusicPreview()).toBeNull();
  });
});
