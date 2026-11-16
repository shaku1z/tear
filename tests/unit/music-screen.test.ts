import { afterEach, describe, expect, it } from "vitest";
import { catalog, routing } from "../../public/audio/music.json";
import { validateMusicRoutingManifest } from "../../src/audio/music/music-routing-validate";
import type { MusicRoutingManifest } from "../../src/audio/music/music-routing-types";
import { getMusicPreview, onMusicPreviewChange, setMusicPreview } from "../../src/audio/music/preview";
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

describe("the MUSIC screen view", () => {
  it("lists every catalogued song in catalog order, with or without stations on the works", () => {
    const withoutStations = songs.map(({ id, title }) => ({ id, title }));
    const view = buildMusicScreenView({
      settings: {},
      library: { songs: withoutStations, routing: published },
      nowPlaying: { workId: "fillet", title: "Fillet" },
      preview: "spring",
      bossName,
    });
    expect(view.title).toBe(MUSIC_SCREEN_TITLE);
    expect(view.songs.map((song) => song.title)).toEqual(catalog.works.map((work) => work.title));
    expect(view.songs).toHaveLength(14);
    expect(view.songs.filter((song) => song.previewing).map((song) => song.id)).toEqual(["spring"]);
    expect(view.subtitle).toBe("14 songs · Tear soundtrack");
    expect(view.songs.map((song) => song.number)).toEqual(catalog.works.map((_, index) => index + 1));
    // Fillet plays: it is lit in the list and fills the mini-player; a Voidspire song takes that stage's art.
    expect(view.songs.find((song) => song.playing)?.id).toBe("fillet");
    expect(view.nowPlaying).toEqual({ title: "Fillet", where: "Menu", art: null, previewing: false });
    expect(view.songs.find((song) => song.id === "looking-out")?.art).toEqual({ hue: "#8b3bd6", glyph: "◇" });
    expect(view.playback.map((row) => row.key)).toEqual(["station", "menuMusic", "musicMode"]);
  });

  it("shows a loading list before the music index arrives", () => {
    const view = buildMusicScreenView({
      settings: {},
      library: null,
      nowPlaying: { workId: "", title: "—" },
      preview: null,
    });
    expect(view.loading).toBe(true);
    expect(view.songs).toEqual([]);
    expect(view.nowPlaying).toBeNull();
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
      beat: { screenChanged: () => undefined },
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
