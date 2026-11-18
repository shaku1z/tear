import { afterEach, describe, expect, it } from "vitest";
import { progressFacts, type ProgressSource } from "../../src/domain/progress-facts";
import { parseMusicCatalog } from "../../src/audio/music/catalog";
import { publishMusicLibrary, type MusicLibrary } from "../../src/audio/music/library";
import { validateMusicRoutingManifest } from "../../src/audio/music/music-routing-validate";
import {
  heardSource,
  musicPickChoices,
  musicSourceValue,
  musicUnlocked,
  parseMusicSource,
  setMusicProgressFacts,
} from "../../src/audio/music/music-source";
import { musicPickLabel } from "../../src/presentation/music-snapshots";
import { TEST_CHANNELS, index } from "./music-backend-harness";

function library(): MusicLibrary {
  return publishMusicLibrary(
    parseMusicCatalog({ ...index.catalog, ...TEST_CHANNELS }),
    validateMusicRoutingManifest(index.routing),
  );
}

const hear = (progress: ProgressSource): void => setMusicProgressFacts(() => progressFacts(progress));
const FRESH: ProgressSource = { stats: {}, ach: {} };

afterEach(() => setMusicProgressFacts(null));

describe("the saved music pick", () => {
  it("reads default, a song or a channel, and saves back what it read", () => {
    for (const value of ["default", "fillet", "channel:calm"]) expect(musicSourceValue(parseMusicSource(value))).toBe(value);
    expect(parseMusicSource("channel:calm")).toEqual({ kind: "channel", channelId: "calm" });
  });

  it("reads anything that is not a pick as the default: old saves need no migration", () => {
    for (const value of [undefined, 3, "", "Fillet!", "channel:", "channel:Calm"])
      expect(parseMusicSource(value)).toEqual({ kind: "default" });
  });
});

describe("what the player can hear", () => {
  it("hears a song only once found; before progress is known, only songs that need nothing", () => {
    expect(musicUnlocked({ type: "default" }, null)).toBe(true);
    expect(musicUnlocked({ type: "boss-defeat", bossId: "rootbound" }, null)).toBe(false);
    expect(musicUnlocked({ type: "unreadable" }, progressFacts(FRESH))).toBe(false);
    expect(musicUnlocked({ type: "boss-defeat", bossId: "rootbound" }, progressFacts({ stats: { killRootbound: 1 }, ach: {} }))).toBe(true);
  });

  it("plays a locked or unknown song, or a hidden channel, as the default", () => {
    hear(FRESH);
    const songs = library();
    expect(heardSource(parseMusicSource("shopkeeper"), songs)).toEqual({ kind: "song", workId: "shopkeeper" });
    expect(heardSource(parseMusicSource("spring"), songs)).toEqual({ kind: "default" });
    expect(heardSource(parseMusicSource("a-song-from-later"), songs)).toEqual({ kind: "default" });
    expect(heardSource(parseMusicSource("channel:calm"), songs)).toEqual({ kind: "channel", channelId: "calm" });
    // No boss beaten yet: Bosses holds no song the player has found, so it is hidden.
    expect(heardSource(parseMusicSource("channel:bosses"), songs)).toEqual({ kind: "default" });
    // A playlist that does not exist yet, and a rule key this build cannot read, hide their channels.
    expect(heardSource(parseMusicSource("channel:my-mix"), songs)).toEqual({ kind: "default" });
    expect(heardSource(parseMusicSource("channel:odd"), songs)).toEqual({ kind: "default" });
    expect(heardSource(parseMusicSource("fillet"), null)).toEqual({ kind: "default" });
  });

  it("offers the default, each channel and each found song, and grows as songs are found", () => {
    hear(FRESH);
    expect(musicPickChoices(library())).toEqual(["default", "channel:calm", "fillet", "shopkeeper"]);
    hear({ stats: { killRootbound: 1 }, ach: {} });
    expect(musicPickChoices(library())).toEqual([
      "default",
      "channel:calm",
      "channel:bosses",
      "fillet",
      "shopkeeper",
      "nocturnal-urgency",
      "spring",
    ]);
    expect(musicPickChoices(null)).toEqual(["default"]);
  });

  it("names the pick in player words, and a pick that cannot be heard as the default", () => {
    hear(FRESH);
    const songs = library();
    expect(musicPickLabel("default", songs)).toBe("DEFAULT");
    expect(musicPickLabel("shopkeeper", songs)).toBe("SHOPKEEPER, KEEP KEEPING");
    expect(musicPickLabel("channel:calm", songs)).toBe("CALM · RADIO");
    expect(musicPickLabel("spring", songs)).toBe("DEFAULT");
    expect(musicPickLabel(undefined, null)).toBe("DEFAULT");
  });
});
