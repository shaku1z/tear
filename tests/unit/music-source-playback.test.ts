import { afterEach, describe, expect, it, vi } from "vitest";
import { progressFacts, type ProgressSource } from "../../src/domain/progress-facts";
import { getNowPlaying } from "../../src/audio/music/now-playing";
import { setMusicPreview } from "../../src/audio/music/preview";
import { requestNextSong, setMusicProgressFacts, setMusicSource } from "../../src/audio/music/music-source";
import { radioPlaySeconds } from "../../src/audio/music/radio";
import { loopSeconds } from "../../src/audio/stems/tier";
import type { BiomeStemBackend } from "../../src/audio/stems/biome-stem-backend";
import {
  TEST_CHANNELS,
  cueRequested,
  index,
  musicBackend,
  settle,
  snapshot,
  useMusicBrowserStubs,
  type MusicBackendOptions,
} from "./music-backend-harness";

const VERDANT = "The Verdant Sanctum";
const FRESH: ProgressSource = { stats: {}, ach: {} };
useMusicBrowserStubs();

const running: BiomeStemBackend[] = [];
async function start(options: Omit<MusicBackendOptions, "catalog"> = {}) {
  const run = await musicBackend({ catalog: TEST_CHANNELS, ...options });
  running.push(run.backend);
  return run;
}
afterEach(async () => {
  for (const backend of running.splice(0)) await backend.dispose();
  setMusicSource("default");
  setMusicPreview(null);
  setMusicProgressFacts(null);
  vi.restoreAllMocks();
});

const hear = (progress: ProgressSource): void => {
  setMusicProgressFacts(() => progressFacts(progress));
};
const playing = (): string => getNowPlaying().workId;
const nowPlaying = (workId: string) =>
  vi.waitFor(() => {
    expect(playing()).toBe(workId);
  });

describe("the player's pick in menus", () => {
  it("plays the picked song, and a MUSIC preview over it only while the preview is set", async () => {
    hear(FRESH);
    setMusicSource("shopkeeper");
    await start();
    await nowPlaying("shopkeeper");
    setMusicPreview("spring");
    await nowPlaying("spring");
    setMusicPreview(null);
    await nowPlaying("shopkeeper");
  });

  it("plays a song the player has not found as the default, without forgetting the pick", async () => {
    hear(FRESH);
    setMusicSource("spring");
    const { backend } = await start();
    await nowPlaying("fillet");
    await settle();
    expect(cueRequested("spring")).toBe(false);
    // The pick comes back once the song is found: here, by the run that beat Rootbound.
    hear({ stats: { killRootbound: 1 }, ach: {} });
    await backend.endRun();
    backend.updateContext(snapshot("menu", "main-menu"));
    await nowPlaying("spring");
  });
});

describe("the player's pick during runs", () => {
  it("keeps playing through the stage; a boss brings its own music and the pick comes back after", async () => {
    hear(FRESH);
    setMusicSource("shopkeeper");
    const { backend } = await start();
    await nowPlaying("shopkeeper");
    backend.updateContext(snapshot(VERDANT, "combat"));
    await settle();
    expect(playing()).toBe("shopkeeper");
    expect(cueRequested("once-at-a-time")).toBe(false);
    backend.updateContext(snapshot(VERDANT, "boss", "rootbound"));
    await nowPlaying("nocturnal-urgency");
    backend.updateContext(snapshot(VERDANT, "combat"));
    await nowPlaying("shopkeeper");
  });
});

describe("a Radio channel", () => {
  it("plays its found songs one after another on one timer, from the menus into a run; Next skips", async () => {
    hear(FRESH);
    const timers = vi.spyOn(globalThis, "setTimeout");
    setMusicSource("channel:calm");
    const { backend } = await start();
    // Calm holds five songs; a new player has found two of them.
    await vi.waitFor(() => {
      expect(["fillet", "shopkeeper"]).toContain(playing());
    });
    const first = playing();
    expect(getNowPlaying().channelName).toBe("Calm");
    const manifest = index.cues[first];
    if (!manifest) throw new Error(`no cue for ${first}`);
    const songMs = radioPlaySeconds(loopSeconds(manifest).lengthSeconds, 120) * 1000;
    expect(timers.mock.calls.some(([, delay]) => delay === songMs)).toBe(true);

    // The channel carries on into the run: no swap to the stage's song.
    backend.updateContext(snapshot(VERDANT, "combat"));
    await settle();
    expect(playing()).toBe(first);

    requestNextSong();
    await nowPlaying(first === "fillet" ? "shopkeeper" : "fillet");
  });

  it("costs nothing per frame: a minute of run frames on a channel schedules no timer and changes no song", async () => {
    hear(FRESH);
    setMusicSource("channel:calm");
    const { backend } = await start();
    await vi.waitFor(() => {
      expect(["fillet", "shopkeeper"]).toContain(playing());
    });
    backend.updateContext(snapshot(VERDANT, "combat"));
    await settle();
    const first = playing();
    const timers = vi.spyOn(globalThis, "setTimeout");
    for (let frame = 0; frame < 3600; frame += 1) backend.updateContext(snapshot(VERDANT, "combat"));
    expect(timers).not.toHaveBeenCalled();
    expect(playing()).toBe(first);
  });

  it("takes a song found mid-run at its next deal: the song playing carries on, and the order dealt holds", async () => {
    hear(FRESH);
    setMusicSource("channel:calm");
    const { backend } = await start();
    await vi.waitFor(() => {
      expect(["fillet", "shopkeeper"]).toContain(playing());
    });
    backend.updateContext(snapshot(VERDANT, "combat"));
    const first = playing();
    const second = first === "fillet" ? "shopkeeper" : "fillet";

    // Rootbound falls mid-song: Spring, a calm song, is found.
    hear({ stats: { killRootbound: 1 }, ach: {} });
    backend.updateContext(snapshot(VERDANT, "combat"));
    await settle();
    expect(playing()).toBe(first);
    expect(cueRequested("spring")).toBe(false);

    // The order already dealt plays out first.
    requestNextSong();
    await nowPlaying(second);
    expect(cueRequested("spring")).toBe(false);

    // The next deal holds Spring; it never opens with the song that just played.
    const heard: string[] = [];
    for (let step = 0; step < 3; step += 1) {
      const before = playing();
      requestNextSong();
      await vi.waitFor(() => {
        expect(playing()).not.toBe(before);
      });
      heard.push(playing());
    }
    expect(heard).toContain("spring");
  });
});
