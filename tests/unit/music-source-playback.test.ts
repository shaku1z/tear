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

const hear = (progress: ProgressSource): void => setMusicProgressFacts(() => progressFacts(progress));
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

  it("plays the stage's own music in a seed race, so every racer hears the same", async () => {
    hear(FRESH);
    setMusicSource("shopkeeper");
    const { backend } = await start({ seedRace: true });
    backend.updateContext(snapshot(VERDANT, "combat"));
    await nowPlaying("once-at-a-time");
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
});
